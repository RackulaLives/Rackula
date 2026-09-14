#!/usr/bin/env node
// Synthetic DGX POD layouts for the spike #3287 scale check.
// Usage: node docs/research/3287-scale-gen.mjs <outDir>
// Positions are written in internal units (U x 6) so the pre-0.7.0 heuristic never fires.
import { dump } from "js-yaml";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node docs/research/3287-scale-gen.mjs <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const UPU = 6; // UNITS_PER_U
const RACK_U = 48;
const TOR_U = 48; // every rack gets an SN2201 OOB switch at the top

// Stand-ins: Rackula has no OSFP, QSFP112 or InfiniBand interface types yet.
const T_NDR = "400gbase-x-qsfpdd";
const T_Q112 = "200gbase-x-qsfp56";
const T_Q28 = "100gbase-x-qsfp28";
const T_RJ45 = "1000base-t";

const seq = (prefix, n, type, start = 1) =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${start + i}`,
    type,
    position: "rear",
  }));
const mgmt = (name) => ({
  name,
  type: T_RJ45,
  position: "rear",
  mgmt_only: true,
});

const TYPES = [
  {
    slug: "nvidia-dgx-b200",
    manufacturer: "NVIDIA",
    model: "DGX B200",
    u_height: 10,
    colour: "#76B900",
    category: "server",
    is_full_depth: true,
    interfaces: [
      ...seq("ib", 8, T_NDR),
      ...seq("bf3-", 4, T_Q112),
      mgmt("bmc"),
    ],
  },
  {
    slug: "nvidia-qm9700",
    manufacturer: "NVIDIA",
    model: "QM9700",
    u_height: 1,
    colour: "#4E7A00",
    category: "network",
    is_full_depth: true,
    interfaces: [...seq("ib", 64, T_NDR), mgmt("mgmt0")],
  },
  {
    slug: "nvidia-sn4600c",
    manufacturer: "NVIDIA",
    model: "SN4600C",
    u_height: 2,
    colour: "#3D6000",
    category: "network",
    is_full_depth: true,
    interfaces: [...seq("swp", 64, T_Q28), mgmt("mgmt0")],
  },
  {
    slug: "nvidia-sn2201",
    manufacturer: "NVIDIA",
    model: "SN2201",
    u_height: 1,
    colour: "#2E4800",
    category: "network",
    is_full_depth: false,
    interfaces: [
      ...seq("swp", 48, T_RJ45),
      ...seq("swp", 4, T_Q28, 49),
      mgmt("mgmt0"),
    ],
  },
  {
    slug: "x86-server-1u",
    model: "x86 server (1U)",
    u_height: 1,
    colour: "#6272A4",
    category: "server",
    is_full_depth: true,
    interfaces: [...seq("nic", 2, T_Q28), mgmt("bmc")],
  },
  {
    slug: "storage-appliance-2u",
    model: "Storage appliance (2U)",
    u_height: 2,
    colour: "#BD93F9",
    category: "storage",
    is_full_depth: true,
    interfaces: [...seq("nic", 4, T_Q28), mgmt("bmc")],
  },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.slug, t]));

function build({
  name,
  sus = 0,
  basepodNodes = 0,
  dgxPerRack = 4,
  wire = true,
  storageUnits = 4,
}) {
  const racks = [];
  const groups = [];
  const connections = [];
  const used = new Set();
  let devSeq = 0;

  function link(a, aName, b, bName) {
    if (!wire) return;
    const pa = a.ports.find((p) => p.template_name === aName);
    const pb = b.ports.find((p) => p.template_name === bName);
    if (!pa || !pb)
      throw new Error(`missing port ${a.id}:${aName} or ${b.id}:${bName}`);
    if (used.has(pa.id) || used.has(pb.id))
      throw new Error(`port reused: ${pa.id} ${pb.id}`);
    used.add(pa.id);
    used.add(pb.id);
    connections.push({
      id: `conn-${connections.length + 1}`,
      a_port_id: pa.id,
      b_port_id: pb.id,
    });
  }

  function placeAt(rack, slug, u, label) {
    const t = TYPE[slug];
    const id = `dev-${++devSeq}`;
    const dev = {
      id,
      device_type: slug,
      name: label,
      position: u * UPU,
      face: "front",
      ports: t.interfaces.map((iface, i) => ({
        id: `${id}-p${i}`,
        template_name: iface.name,
        template_index: i,
        type: iface.type,
      })),
    };
    rack.devices.push(dev);
    if (rack.tor) {
      const m = t.interfaces.find((i) => i.mgmt_only);
      if (m) {
        if (rack.torPort > 48) throw new Error(`ToR full in ${rack.name}`);
        link(dev, m.name, rack.tor, `swp${rack.torPort++}`);
      }
    }
    return dev;
  }

  function newRack(label) {
    const rack = {
      id: `rack-${racks.length + 1}`,
      name: label,
      height: RACK_U,
      width: 19,
      desc_units: false,
      show_rear: true,
      form_factor: "4-post-cabinet",
      starting_unit: 1,
      position: racks.length,
      depth_mm: 1200,
      devices: [],
      nextU: 1,
      tor: null,
      torPort: 1,
    };
    racks.push(rack);
    rack.tor = placeAt(rack, "nvidia-sn2201", TOR_U, `${label} OOB`);
    return rack;
  }

  function place(rack, slug, label) {
    const t = TYPE[slug];
    if (rack.nextU + t.u_height - 1 >= TOR_U) return null;
    const dev = placeAt(rack, slug, rack.nextU, label);
    rack.nextU += t.u_height;
    return dev;
  }

  // Fill racks of one kind, opening a new rack when the current one is full.
  function pool(label) {
    const members = [];
    const placer = (slug, devLabel) => {
      let rack = members[members.length - 1];
      let dev = rack && place(rack, slug, devLabel);
      if (!dev) {
        rack = newRack(`${label} ${members.length + 1}`);
        members.push(rack);
        dev = place(rack, slug, devLabel);
      }
      return dev;
    };
    placer.members = members;
    return placer;
  }

  function computeRacks(count, label) {
    const nodes = [];
    const ids = [];
    for (let r = 0; r < Math.ceil(count / dgxPerRack); r++) {
      const rack = newRack(`${label} R${r + 1}`);
      ids.push(rack.id);
      for (let k = 0; k < dgxPerRack && nodes.length < count; k++) {
        nodes.push(
          place(rack, "nvidia-dgx-b200", `${label} DGX ${nodes.length + 1}`),
        );
      }
    }
    groups.push({
      id: `grp-${groups.length + 1}`,
      name: `${label} compute`,
      rack_ids: ids,
      layout_preset: "row",
    });
    return nodes;
  }

  const placeMgmt = pool("Management");
  const oobCore = placeMgmt("nvidia-sn4600c", "OOB core");
  const eth = { switches: [], next: 65 };
  const toEth = (dev, portName) => {
    if (eth.next > 64) {
      eth.switches.push(
        placeMgmt(
          "nvidia-sn4600c",
          `In-band/storage ${eth.switches.length + 1}`,
        ),
      );
      eth.next = 1;
    }
    link(
      dev,
      portName,
      eth.switches[eth.switches.length - 1],
      `swp${eth.next++}`,
    );
  };

  for (let i = 1; i <= 5; i++) {
    const d = placeMgmt("x86-server-1u", `Control plane ${i}`);
    toEth(d, "nic1");
    toEth(d, "nic2");
  }
  for (let i = 1; i <= 2; i++) {
    const d = placeMgmt("x86-server-1u", `UFM ${i}`);
    toEth(d, "nic1");
    toEth(d, "nic2");
  }

  if (basepodNodes) {
    const ib = [
      placeMgmt("nvidia-qm9700", "IB fabric A"),
      placeMgmt("nvidia-qm9700", "IB fabric B"),
    ];
    const ibNext = [1, 1];
    for (const d of computeRacks(basepodNodes, "BasePOD")) {
      for (let r = 0; r < 8; r++) {
        const s = r % 2;
        link(d, `ib${r + 1}`, ib[s], `ib${ibNext[s]++}`);
      }
      for (let b = 1; b <= 4; b++) toEth(d, `bf3-${b}`);
    }
  }

  let spineRacks = [];
  if (sus) {
    const spineCount = sus * 4;
    const placeSpine = pool("IB spine");
    const spines = Array.from({ length: spineCount }, (_, i) =>
      placeSpine("nvidia-qm9700", `Spine ${i + 1}`),
    );
    spineRacks = placeSpine.members;
    const spineNext = spines.map(() => 1);
    for (let s = 1; s <= sus; s++) {
      const nodes = computeRacks(32, `SU${s}`);
      const leafRack = newRack(`SU${s} IB leaf`);
      groups[groups.length - 1].rack_ids.push(leafRack.id);
      const leaves = Array.from({ length: 8 }, (_, r) =>
        place(leafRack, "nvidia-qm9700", `SU${s} leaf rail ${r + 1}`),
      );
      nodes.forEach((d, k) => {
        for (let r = 0; r < 8; r++)
          link(d, `ib${r + 1}`, leaves[r], `ib${k + 1}`);
        for (let b = 1; b <= 4; b++) toEth(d, `bf3-${b}`);
      });
      for (const leaf of leaves) {
        for (let u = 0; u < 32; u++) {
          const sp = u % spineCount;
          link(leaf, `ib${33 + u}`, spines[sp], `ib${spineNext[sp]++}`);
        }
      }
    }
  }

  const placeStorage = pool("Storage");
  for (let i = 1; i <= storageUnits; i++) {
    const d = placeStorage("storage-appliance-2u", `Storage ${i}`);
    for (let n = 1; n <= 4; n++) toEth(d, `nic${n}`);
  }

  // One 64-port OOB core per 64 racks. A new core can open a new rack, so the
  // loop re-reads racks.length.
  const oobCores = [oobCore];
  for (let i = 0; i < racks.length; i++) {
    const c = Math.floor(i / 64);
    oobCores[c] ??= placeMgmt("nvidia-sn4600c", `OOB core ${c + 1}`);
    link(racks[i].tor, "swp49", oobCores[c], `swp${(i % 64) + 1}`);
  }

  const grouped = new Set(groups.flatMap((g) => g.rack_ids));
  for (const [label, members] of [
    ["Management", placeMgmt.members],
    ["IB spine", spineRacks],
    ["Storage", placeStorage.members],
  ]) {
    const ids = members.map((r) => r.id).filter((id) => !grouped.has(id));
    if (ids.length)
      groups.push({
        id: `grp-${groups.length + 1}`,
        name: label,
        rack_ids: ids,
        layout_preset: "row",
      });
  }

  const slugs = new Set(
    racks.flatMap((r) => r.devices.map((d) => d.device_type)),
  );
  const layout = {
    metadata: {
      id: randomUUID(),
      name,
      schema_version: "1.0",
      description: "Synthetic scale-check layout for spike #3287",
    },
    version: "26.8.0",
    name,
    racks: racks.map(({ nextU, tor, torPort, ...r }) => r),
    rack_groups: groups,
    device_types: TYPES.filter((t) => slugs.has(t.slug)),
    ...(wire ? { connections } : {}),
    settings: { display_mode: "label", show_labels_on_images: false },
  };
  const stats = {
    name,
    racks: racks.length,
    groups: groups.length,
    devices: racks.reduce((s, r) => s + r.devices.length, 0),
    fullDepthDevices: racks.reduce(
      (s, r) =>
        s + r.devices.filter((d) => TYPE[d.device_type].is_full_depth).length,
      0,
    ),
    ports: racks.reduce(
      (s, r) => s + r.devices.reduce((t, d) => t + d.ports.length, 0),
      0,
    ),
    connections: connections.length,
  };
  return { layout, stats };
}

const SCENARIOS = [
  {
    file: "basepod-4",
    name: "BasePOD 4-node",
    basepodNodes: 4,
    dgxPerRack: 2,
    storageUnits: 2,
  },
  {
    file: "basepod-8",
    name: "BasePOD 8-node",
    basepodNodes: 8,
    dgxPerRack: 2,
    storageUnits: 2,
  },
  { file: "su1", name: "SuperPOD 1 SU", sus: 1, dgxPerRack: 4 },
  {
    file: "su1-bare",
    name: "SuperPOD 1 SU (no connections)",
    sus: 1,
    dgxPerRack: 4,
    wire: false,
  },
  {
    file: "su1-2pr",
    name: "SuperPOD 1 SU (2 DGX per rack)",
    sus: 1,
    dgxPerRack: 2,
  },
  {
    file: "su4",
    name: "SuperPOD 4 SU",
    sus: 4,
    dgxPerRack: 4,
    storageUnits: 16,
  },
  {
    file: "su4-2pr",
    name: "SuperPOD 4 SU (2 DGX per rack)",
    sus: 4,
    dgxPerRack: 2,
    storageUnits: 16,
  },
];

const all = [];
for (const sc of SCENARIOS) {
  const { layout, stats } = build(sc);
  const path = join(OUT, `${sc.file}.rackula.yaml`);
  writeFileSync(path, dump(layout, { lineWidth: -1, noRefs: true }));
  all.push({ file: sc.file, ...stats, bytes: statSync(path).size });
}
writeFileSync(join(OUT, "stats.json"), JSON.stringify(all, null, 2));
console.table(all);
