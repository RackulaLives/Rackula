#!/usr/bin/env node
// Rack-count scale layouts for spike #3293 (24, 50 and 100 racks).
// Usage: node docs/research/3293-scale-gen.mjs <outDir>
// Output is read by docs/research/3287-scale-measure.mjs (it reads stats.json).
// Two profiles:
//   pod-N: DGX density, the device model of 3287-scale-gen.mjs su4-2pr. Every
//     17 racks form one SU: a leaf rack (8 QM9700) then 16 compute racks with
//     2 DGX B200 each. Every rack has an SN2201 OOB switch at U48. IB links cross
//     racks and BMC links end on a 53-port switch, so nothing draws today.
//   mixed-N: device-dense 42U racks: 2 x 24-port switches, 18 1U and 4 2U
//     servers. Each server's two NICs go to the two in-rack switches, so every
//     connection is same-rack and per-port, and draws. One uplink per rack goes
//     to the next rack.
//   Diagnostics: mixed-100-bare (no connections), mixed-100-front (show_rear
//     false) and empty-100 (42U racks, no devices) separate the cost of
//     connections, the rear face and the rack frame.
// Positions are internal units (U x 6), as in 3287-scale-gen.mjs.
import { dump } from "js-yaml";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node docs/research/3293-scale-gen.mjs <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const UPU = 6;
const T_NDR = "400gbase-x-qsfpdd";
const T_Q112 = "200gbase-x-qsfp56";
const T_Q28 = "100gbase-x-qsfp28";
const T_RJ45 = "1000base-t";
const T_10G = "10gbase-t";

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
    slug: "switch-24p",
    model: "24-port switch",
    u_height: 1,
    colour: "#50FA7B",
    category: "network",
    // Full depth so it renders on the rear face with its ports: a link draws
    // only when both anchors are on the face in view.
    is_full_depth: true,
    interfaces: seq("p", 24, T_10G),
  },
  {
    slug: "server-1u",
    model: "Server (1U)",
    u_height: 1,
    colour: "#6272A4",
    category: "server",
    is_full_depth: true,
    interfaces: [...seq("eth", 2, T_10G), mgmt("bmc")],
  },
  {
    slug: "server-2u",
    model: "Server (2U)",
    u_height: 2,
    colour: "#8BE9FD",
    category: "server",
    is_full_depth: true,
    interfaces: [...seq("eth", 2, T_10G), mgmt("bmc")],
  },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.slug, t]));

function build({
  name,
  profile,
  racks: rackCount,
  wire = true,
  showRear = true,
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

  function place(rack, slug, u, label) {
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
    return dev;
  }

  function newRack(label, height, group) {
    const rack = {
      id: `rack-${racks.length + 1}`,
      name: label,
      height,
      width: 19,
      desc_units: false,
      show_rear: showRear,
      form_factor: "4-post-cabinet",
      starting_unit: 1,
      position: racks.length,
      depth_mm: 1200,
      devices: [],
    };
    racks.push(rack);
    group.rack_ids.push(rack.id);
    return rack;
  }

  function newGroup(label) {
    const g = {
      id: `grp-${groups.length + 1}`,
      name: label,
      rack_ids: [],
      layout_preset: "row",
    };
    groups.push(g);
    return g;
  }

  if (profile === "pod") {
    let leaves = null;
    let group = null;
    let dgxInSu = 0;
    for (let i = 0; i < rackCount; i++) {
      const su = Math.floor(i / 17) + 1;
      const idx = i % 17;
      if (idx === 0) {
        group = newGroup(`SU${su}`);
        const leafRack = newRack(`SU${su} IB leaf`, 48, group);
        const tor = place(leafRack, "nvidia-sn2201", 48, `SU${su} leaf OOB`);
        leaves = Array.from({ length: 8 }, (_, r) =>
          place(leafRack, "nvidia-qm9700", r + 1, `SU${su} leaf rail ${r + 1}`),
        );
        leaves.forEach((l, r) => link(l, "mgmt0", tor, `swp${r + 1}`));
        dgxInSu = 0;
        continue;
      }
      const rack = newRack(`SU${su} R${idx}`, 48, group);
      const tor = place(rack, "nvidia-sn2201", 48, `SU${su} R${idx} OOB`);
      for (let k = 0; k < 2; k++) {
        const d = place(
          rack,
          "nvidia-dgx-b200",
          1 + k * 10,
          `SU${su} DGX ${dgxInSu + 1}`,
        );
        for (let r = 0; r < 8; r++)
          link(d, `ib${r + 1}`, leaves[r], `ib${dgxInSu + 1}`);
        link(d, "bmc", tor, `swp${k + 1}`);
        dgxInSu++;
      }
    }
  } else if (profile === "mixed") {
    let group = null;
    const switches = [];
    for (let i = 0; i < rackCount; i++) {
      if (i % 10 === 0) group = newGroup(`Row ${i / 10 + 1}`);
      const rack = newRack(`R${i + 1}`, 42, group);
      const a = place(rack, "switch-24p", 42, `R${i + 1} sw A`);
      const b = place(rack, "switch-24p", 41, `R${i + 1} sw B`);
      switches.push([a, b]);
      let u = 1;
      let n = 0;
      const addServer = (slug) => {
        const s = place(rack, slug, u, `R${i + 1} srv ${n + 1}`);
        u += TYPE[slug].u_height;
        link(s, "eth1", a, `p${n + 1}`);
        link(s, "eth2", b, `p${n + 1}`);
        n++;
      };
      for (let k = 0; k < 4; k++) addServer("server-2u");
      for (let k = 0; k < 18; k++) addServer("server-1u");
      // p23 and p24 stay free on each switch for uplinks.
      link(a, "p23", b, "p23");
      if (i > 0) link(switches[i - 1][1], "p24", a, "p24");
    }
  } else if (profile === "empty") {
    let group = null;
    for (let i = 0; i < rackCount; i++) {
      if (i % 10 === 0) group = newGroup(`Row ${i / 10 + 1}`);
      newRack(`R${i + 1}`, 42, group);
    }
  } else {
    throw new Error(`unknown profile ${profile}`);
  }

  const slugs = new Set(
    racks.flatMap((r) => r.devices.map((d) => d.device_type)),
  );
  const rackOf = new Map();
  for (const r of racks)
    for (const d of r.devices) for (const p of d.ports) rackOf.set(p.id, r.id);
  const layout = {
    metadata: {
      id: randomUUID(),
      name,
      schema_version: "1.0",
      description: "Synthetic scale-check layout for spike #3293",
    },
    version: "26.9.0",
    name,
    racks,
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
    ports: racks.reduce(
      (s, r) => s + r.devices.reduce((t, d) => t + d.ports.length, 0),
      0,
    ),
    connections: connections.length,
    sameRackConnections: connections.filter(
      (c) => rackOf.get(c.a_port_id) === rackOf.get(c.b_port_id),
    ).length,
  };
  return { layout, stats };
}

const SCENARIOS = [];
for (const n of [24, 50, 100]) {
  SCENARIOS.push({
    file: `pod-${n}`,
    name: `POD ${n} racks`,
    profile: "pod",
    racks: n,
  });
  SCENARIOS.push({
    file: `mixed-${n}`,
    name: `Mixed ${n} racks`,
    profile: "mixed",
    racks: n,
  });
}
SCENARIOS.push({
  file: "mixed-100-front",
  name: "Mixed 100 racks (front only)",
  profile: "mixed",
  racks: 100,
  showRear: false,
});
SCENARIOS.push({
  file: "empty-100",
  name: "100 empty racks",
  profile: "empty",
  racks: 100,
});
SCENARIOS.push({
  file: "mixed-100-bare",
  name: "Mixed 100 racks (no connections)",
  profile: "mixed",
  racks: 100,
  wire: false,
});

const all = [];
for (const sc of SCENARIOS) {
  const { layout, stats } = build(sc);
  const path = join(OUT, `${sc.file}.rackula.yaml`);
  writeFileSync(path, dump(layout, { lineWidth: -1, noRefs: true }));
  all.push({ file: sc.file, ...stats, bytes: statSync(path).size });
}
writeFileSync(join(OUT, "stats.json"), JSON.stringify(all, null, 2));
console.table(all);
