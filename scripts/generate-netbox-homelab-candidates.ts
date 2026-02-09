#!/usr/bin/env npx tsx
/**
 * Generate ranked, net-new homelab device candidates from a local NetBox clone.
 *
 * Outputs:
 * - docs/research/data/netbox-homelab-candidates-1096.csv
 * - docs/research/data/netbox-homelab-phase1-1096.csv
 * - docs/research/data/netbox-homelab-summary-1096.json
 *
 * Usage:
 *   npx tsx scripts/generate-netbox-homelab-candidates.ts
 *   npx tsx scripts/generate-netbox-homelab-candidates.ts --netbox-root /path/to/devicetype-library
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

type DeviceCategory = "network" | "server" | "storage" | "power";

interface Candidate {
  vendor: string;
  slug: string;
  model: string;
  uHeight: number;
  category: DeviceCategory;
  frontImage: boolean;
  rearImage: boolean;
  netboxPath: string;
  score: number;
}

interface ScriptOptions {
  netboxRoot: string;
  limit: number;
  phase1Limit: number;
  phase2Limit: number;
  phase3Limit: number;
  outputDir: string;
}

interface NetBoxDoc {
  slug?: string;
  model?: string;
  u_height?: number;
  front_image?: boolean;
  rear_image?: boolean;
  subdevice_role?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

const DEFAULT_LIMIT = 140;
const DEFAULT_PHASE1_LIMIT = 40;
const DEFAULT_PHASE2_LIMIT = 45;
const DEFAULT_PHASE3_LIMIT = 55;
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, "docs", "research", "data");

const VENDOR_PRIORITY: string[] = [
  "Ubiquiti",
  "MikroTik",
  "Synology",
  "QNAP",
  "APC",
  "Eaton",
  "CyberPower",
  "Vertiv",
  "Dell",
  "Supermicro",
  "HPE",
  "Lenovo",
  "Netgear",
  "TP-Link",
  "Netgate",
  "Fortinet",
  "Palo Alto",
  "Juniper",
  "Cisco",
  "Arista",
  "SonicWall",
];

const VENDOR_CATEGORY: Record<string, DeviceCategory> = {
  Ubiquiti: "network",
  MikroTik: "network",
  "TP-Link": "network",
  Netgear: "network",
  Cisco: "network",
  Arista: "network",
  Juniper: "network",
  Fortinet: "network",
  "Palo Alto": "network",
  SonicWall: "network",
  Netgate: "network",

  Dell: "server",
  Supermicro: "server",
  HPE: "server",
  Lenovo: "server",

  Synology: "storage",
  QNAP: "storage",

  APC: "power",
  Eaton: "power",
  CyberPower: "power",
  Vertiv: "power",
};

const VENDOR_TIER_SCORE: Record<string, number> = {
  Ubiquiti: 5,
  MikroTik: 5,
  Synology: 5,
  APC: 5,

  Dell: 4,
  Supermicro: 4,
  HPE: 4,
  Netgear: 4,
  "TP-Link": 4,
  QNAP: 4,
  Eaton: 4,
  CyberPower: 4,
  Netgate: 4,

  Cisco: 3,
  Fortinet: 3,
  "Palo Alto": 3,
  Arista: 3,
  Juniper: 3,
  Lenovo: 3,
  SonicWall: 3,
  Vertiv: 3,
};

const RANKED_VENDOR_CAP: Record<string, number> = {
  Ubiquiti: 14,
  MikroTik: 18,
  Synology: 12,
  QNAP: 10,
  APC: 20,
  Eaton: 12,
  CyberPower: 10,
  Vertiv: 8,
  Dell: 16,
  Supermicro: 14,
  HPE: 18,
  Lenovo: 8,
  Netgear: 12,
  "TP-Link": 10,
  Netgate: 8,
  Fortinet: 14,
  "Palo Alto": 12,
  Juniper: 14,
  Cisco: 16,
  Arista: 10,
  SonicWall: 8,
};

const PHASE1_VENDOR_CAP: Record<string, number> = {
  Ubiquiti: 4,
  MikroTik: 4,
  Synology: 3,
  APC: 5,
  Eaton: 3,
  Dell: 4,
  Supermicro: 3,
  HPE: 3,
  Netgear: 2,
  Fortinet: 3,
  "Palo Alto": 2,
  Juniper: 2,
  Cisco: 2,
  Arista: 2,
  SonicWall: 2,
};

const EXCLUDE_PATTERNS: RegExp[] = [
  /camera/i,
  /access[ -]?point/i,
  /wireless/i,
  /\bwifi\b/i,
  /\bphone\b/i,
  /transceiver/i,
  /line[ -]?card/i,
  /fan[ -]?tray/i,
  /antenna/i,
  /license/i,
  /blank(?:ing)? panel/i,
  /rail[ -]?kit/i,
  /mount[ -]?kit/i,
  /faceplate/i,
  /chassis manager/i,
];

const HOMELAB_KEYWORDS: string[] = [
  "poweredge",
  "proliant",
  "thinksystem",
  "crs",
  "ccr",
  "udm",
  "usw",
  "fortigate",
  "fortiswitch",
  "pa-",
  "smart-ups",
  "rackstation",
  "switch",
  "router",
  "firewall",
  "nas",
  "pdu",
  "ups",
];

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    netboxRoot: resolveDefaultNetboxRoot(),
    limit: DEFAULT_LIMIT,
    phase1Limit: DEFAULT_PHASE1_LIMIT,
    phase2Limit: DEFAULT_PHASE2_LIMIT,
    phase3Limit: DEFAULT_PHASE3_LIMIT,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--netbox-root" && argv[i + 1]) {
      options.netboxRoot = argv[++i];
    } else if (arg === "--limit" && argv[i + 1]) {
      options.limit = parseNonNegativeInt("--limit", argv[++i]);
    } else if (arg === "--phase1-limit" && argv[i + 1]) {
      options.phase1Limit = parseNonNegativeInt(
        "--phase1-limit",
        argv[++i],
      );
    } else if (arg === "--phase2-limit" && argv[i + 1]) {
      options.phase2Limit = parseNonNegativeInt(
        "--phase2-limit",
        argv[++i],
      );
    } else if (arg === "--phase3-limit" && argv[i + 1]) {
      options.phase3Limit = parseNonNegativeInt(
        "--phase3-limit",
        argv[++i],
      );
    } else if (arg === "--output-dir" && argv[i + 1]) {
      options.outputDir = argv[++i];
    }
  }

  return options;
}

function assertPathExists(pathToCheck: string, description: string): void {
  if (!existsSync(pathToCheck)) {
    throw new Error(`${description} not found: ${pathToCheck}`);
  }
}

function resolveDefaultNetboxRoot(): string {
  const envRoot = process.env.NETBOX_ROOT?.trim();
  if (envRoot) return envRoot;

  const projectRelativeClone = join(REPO_ROOT, "devicetype-library");
  if (existsSync(projectRelativeClone)) return projectRelativeClone;

  return "";
}

function parseNonNegativeInt(
  flagName: string,
  value: string,
): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);

  throw new Error(
    `Invalid value for ${flagName}: "${value}". Expected a non-negative number.`,
  );
}

function getExistingRackulaSlugs(repoRoot: string): Set<string> {
  const slugRegex = /slug:\s*["']([^"']+)["']/g;
  const sourceFiles: string[] = [];

  const starterLibraryPath = join(repoRoot, "src", "lib", "data", "starterLibrary.ts");
  if (existsSync(starterLibraryPath)) {
    sourceFiles.push(starterLibraryPath);
  } else {
    console.warn(`Warning: starter library file missing (${starterLibraryPath})`);
  }

  const brandPacksDir = join(repoRoot, "src", "lib", "data", "brandPacks");
  if (existsSync(brandPacksDir) && statSync(brandPacksDir).isDirectory()) {
    for (const file of readdirSync(brandPacksDir)) {
      if (file.endsWith(".ts")) {
        sourceFiles.push(join(brandPacksDir, file));
      }
    }
  } else {
    console.warn(`Warning: brand pack directory missing (${brandPacksDir})`);
  }

  const slugs = new Set<string>();
  for (const filePath of sourceFiles) {
    const text = readFileSync(filePath, "utf8");
    for (const match of text.matchAll(slugRegex)) {
      slugs.add(match[1]);
    }
  }

  return slugs;
}

function shouldKeepVendorModel(vendor: string, rawText: string): boolean {
  if (vendor === "Cisco") {
    return /(catalyst|nexus|isr|asa|small business|\bcbs\d|\bsg\d)/i.test(rawText);
  }
  if (vendor === "Juniper") {
    return /(\bex\d|\bsrx\d)/i.test(rawText);
  }
  if (vendor === "Arista") {
    return /(7050|7060|7020|7280)/i.test(rawText);
  }
  if (vendor === "Fortinet") {
    return /(fortigate|fortiswitch)/i.test(rawText);
  }
  if (vendor === "Palo Alto") {
    return /(\bpa-|\bm-\d|\bi-\d)/i.test(rawText);
  }
  if (vendor === "SonicWall") {
    return /(\bnsa\b|\btz\b|supermassive)/i.test(rawText);
  }
  if (vendor === "Dell") {
    return /(poweredge|powervault|powerswitch)/i.test(rawText);
  }
  if (vendor === "HPE") {
    return /(proliant|aruba|apollo|\bdl\d|\bml\d)/i.test(rawText);
  }
  if (vendor === "Lenovo") {
    return /(thinksystem|\bsr\d|\bst\d)/i.test(rawText);
  }
  if (vendor === "Supermicro") {
    return /(sys-|as-|ssg-|superstorage)/i.test(rawText);
  }
  if (vendor === "Ubiquiti") {
    return /(unifi|usw|udm|unvr|usp|edgeswitch|edgerouter|gateway)/i.test(rawText);
  }
  if (vendor === "MikroTik") {
    return /(\bccr|\bcrs|\brb\d|\bcss|routerboard)/i.test(rawText);
  }
  if (vendor === "Synology") {
    return /(\brs\d|rackstation|\bsa\d)/i.test(rawText);
  }
  if (vendor === "QNAP") {
    return /(\bts-|\btvs-|\btes-|\btx-)/i.test(rawText);
  }
  if (vendor === "Netgear") {
    return /(prosafe|gs|xs|ms|m4|m5|smart switch)/i.test(rawText);
  }
  if (vendor === "TP-Link") {
    return /(tl-|jetstream|omada|t\d{3,4}g|sg\d)/i.test(rawText);
  }
  if (vendor === "Netgate") {
    return /(netgate|pfsense|xg-|sg-)/i.test(rawText);
  }

  return true;
}

function inferCategory(vendor: string, rawText: string): DeviceCategory {
  if (/(switch|router|firewall|gateway|fortigate|fortiswitch|catalyst|nexus|\bex\d|\bsrx\d)/i.test(rawText)) {
    return "network";
  }
  if (/(pdu|ups|smart-ups)/i.test(rawText)) {
    return "power";
  }
  if (/(nas|rackstation|diskstation|powervault|storage)/i.test(rawText)) {
    return "storage";
  }
  return VENDOR_CATEGORY[vendor];
}

function isExcluded(rawText: string): boolean {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(rawText));
}

function scoreCandidate(candidate: Omit<Candidate, "score">): number {
  let score = (VENDOR_TIER_SCORE[candidate.vendor] ?? 2) * 10;

  if (candidate.frontImage && candidate.rearImage) {
    score += 8;
  } else if (candidate.frontImage || candidate.rearImage) {
    score += 4;
  } else {
    score -= 3;
  }

  if (candidate.uHeight <= 2) {
    score += 3;
  } else if (candidate.uHeight <= 4) {
    score += 1;
  } else if (candidate.uHeight > 6) {
    score -= 3;
  }

  const lowerText = `${candidate.model} ${candidate.slug}`.toLowerCase();
  let keywordHits = 0;
  for (const token of HOMELAB_KEYWORDS) {
    if (lowerText.includes(token)) keywordHits++;
  }
  score += Math.min(keywordHits, 8);

  return score;
}

function getNetBoxGitInfo(netboxRoot: string): {
  branch: string;
  shortSha: string;
  remote: string;
} {
  const runGit = (args: string[]): string =>
    execFileSync("git", ["-C", netboxRoot, ...args], { encoding: "utf8" }).trim();

  try {
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const shortSha = runGit(["rev-parse", "--short", "HEAD"]);
    const remote = runGit(["config", "--get", "remote.origin.url"]);
    return { branch, shortSha, remote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read git metadata from NetBox root "${netboxRoot}": ${message}`,
    );
  }
}

function collectCandidates(
  options: ScriptOptions,
  existingSlugs: Set<string>,
): Candidate[] {
  const deviceTypeRoot = join(options.netboxRoot, "device-types");
  assertPathExists(deviceTypeRoot, "NetBox device-types directory");

  const candidates: Candidate[] = [];

  for (const vendor of readdirSync(deviceTypeRoot)) {
    if (!(vendor in VENDOR_CATEGORY)) continue;

    const vendorDir = join(deviceTypeRoot, vendor);
    for (const file of readdirSync(vendorDir)) {
      if (!file.endsWith(".yaml")) continue;

      const yamlPath = join(vendorDir, file);
      let parsed: NetBoxDoc | null = null;
      try {
        parsed = yaml.load(readFileSync(yamlPath, "utf8")) as NetBoxDoc;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: failed to parse ${yamlPath}: ${message}`);
        continue;
      }
      if (!parsed) continue;

      const slug = String(parsed.slug ?? file.replace(/\.yaml$/, ""));
      const model = String(parsed.model ?? slug);
      const uHeight = Number(parsed.u_height ?? 0);
      const subdeviceRole = String(parsed.subdevice_role ?? "");

      if (existingSlugs.has(slug)) continue;
      if (uHeight < 1) continue;
      if (subdeviceRole === "child") continue;

      const rawText = `${slug} ${model}`;
      if (isExcluded(rawText)) continue;
      if (!shouldKeepVendorModel(vendor, rawText)) continue;

      const candidateBase = {
        vendor,
        slug,
        model,
        uHeight,
        category: inferCategory(vendor, rawText),
        frontImage: Boolean(parsed.front_image),
        rearImage: Boolean(parsed.rear_image),
        netboxPath: `device-types/${vendor}/${file}`,
      };

      candidates.push({
        ...candidateBase,
        score: scoreCandidate(candidateBase),
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.vendor.localeCompare(b.vendor) ||
      a.model.localeCompare(b.model),
  );

  return candidates;
}

function selectBalanced(
  candidates: Candidate[],
  limit: number,
  vendorCaps: Record<string, number>,
): Candidate[] {
  const grouped = new Map<string, Candidate[]>();
  for (const vendor of VENDOR_PRIORITY) {
    grouped.set(vendor, []);
  }
  for (const candidate of candidates) {
    const list = grouped.get(candidate.vendor);
    if (list) list.push(candidate);
  }

  const picked: Candidate[] = [];
  const pickedByVendor = new Map<string, number>();

  while (picked.length < limit) {
    let addedThisRound = 0;

    for (const vendor of VENDOR_PRIORITY) {
      const list = grouped.get(vendor);
      if (!list || list.length === 0) continue;

      const currentCount = pickedByVendor.get(vendor) ?? 0;
      const vendorCap = vendorCaps[vendor] ?? Number.POSITIVE_INFINITY;
      if (currentCount >= vendorCap) continue;

      const next = list.shift();
      if (!next) continue;

      picked.push(next);
      pickedByVendor.set(vendor, currentCount + 1);
      addedThisRound++;

      if (picked.length >= limit) break;
    }

    if (addedThisRound === 0) break;
  }

  if (picked.length < limit) {
    const usedSlugs = new Set(picked.map((c) => c.slug));
    for (const candidate of candidates) {
      if (picked.length >= limit) break;
      if (usedSlugs.has(candidate.slug)) continue;

      const count = pickedByVendor.get(candidate.vendor) ?? 0;
      const cap = vendorCaps[candidate.vendor] ?? Number.POSITIVE_INFINITY;
      if (count >= cap) continue;

      picked.push(candidate);
      pickedByVendor.set(candidate.vendor, count + 1);
    }
  }

  return picked;
}

function selectPhase1(ranked: Candidate[], phase1Limit: number): Candidate[] {
  const phase1Preferred = ranked.filter(
    (candidate) =>
      candidate.uHeight <= 2 && (candidate.frontImage || candidate.rearImage),
  );

  let phase1 = selectBalanced(phase1Preferred, phase1Limit, PHASE1_VENDOR_CAP);

  if (phase1.length < phase1Limit) {
    const used = new Set(phase1.map((c) => c.slug));
    const fallback = ranked.filter((candidate) => !used.has(candidate.slug));
    const filler = selectBalanced(
      fallback,
      phase1Limit - phase1.length,
      PHASE1_VENDOR_CAP,
    );
    phase1 = [...phase1, ...filler];
  }

  return phase1.slice(0, phase1Limit);
}

function selectPhase2AndPhase3(
  ranked: Candidate[],
  phase1: Candidate[],
  phase2Limit: number,
  phase3Limit: number,
): { phase2: Candidate[]; phase3: Candidate[] } {
  const phase1Slugs = new Set(phase1.map((candidate) => candidate.slug));
  const remaining = ranked.filter((candidate) => !phase1Slugs.has(candidate.slug));

  const phase2ImagePreferred = remaining.filter(
    (candidate) => candidate.frontImage || candidate.rearImage,
  );
  let phase2 = selectBalanced(
    phase2ImagePreferred,
    phase2Limit,
    RANKED_VENDOR_CAP,
  );

  if (phase2.length < phase2Limit) {
    const usedSlugs = new Set(phase2.map((candidate) => candidate.slug));
    const fallback = remaining.filter((candidate) => !usedSlugs.has(candidate.slug));
    phase2 = [
      ...phase2,
      ...selectBalanced(
        fallback,
        phase2Limit - phase2.length,
        RANKED_VENDOR_CAP,
      ),
    ];
  }
  phase2 = phase2.slice(0, phase2Limit);

  const usedInPhase2 = new Set(phase2.map((candidate) => candidate.slug));
  const phase3Pool = remaining.filter(
    (candidate) => !usedInPhase2.has(candidate.slug),
  );
  const phase3 = selectBalanced(phase3Pool, phase3Limit, RANKED_VENDOR_CAP);

  return { phase2, phase3 };
}

function imageCoverage(candidate: Candidate): string {
  if (candidate.frontImage && candidate.rearImage) return "both";
  if (candidate.frontImage || candidate.rearImage) return "single";
  return "none";
}

function rationale(candidate: Candidate): string {
  const parts: string[] = [];
  parts.push(`${candidate.category}`);
  if (candidate.frontImage && candidate.rearImage) {
    parts.push("front+rear image");
  } else if (candidate.frontImage || candidate.rearImage) {
    parts.push("single-side image");
  } else {
    parts.push("no image");
  }
  if (candidate.uHeight <= 2) parts.push(`${candidate.uHeight}U footprint`);
  return parts.join(", ");
}

function toCsvRows(candidates: Candidate[]): string[] {
  const lines = [
    [
      "rank",
      "score",
      "vendor",
      "slug",
      "model",
      "u_height",
      "category",
      "image_coverage",
      "netbox_path",
      "rationale",
    ].join(","),
  ];

  candidates.forEach((candidate, index) => {
    const cols = [
      String(index + 1),
      String(candidate.score),
      candidate.vendor,
      candidate.slug,
      candidate.model,
      String(candidate.uHeight),
      candidate.category,
      imageCoverage(candidate),
      candidate.netboxPath,
      rationale(candidate),
    ].map((value) => `"${value.replace(/"/g, '""')}"`);

    lines.push(cols.join(","));
  });

  return lines;
}

function countByVendor(candidates: Candidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.vendor] = (counts[candidate.vendor] ?? 0) + 1;
  }
  return counts;
}

function countImageCoverage(candidates: Candidate[]): {
  both: number;
  single: number;
  none: number;
} {
  const result = { both: 0, single: 0, none: 0 };
  for (const candidate of candidates) {
    if (candidate.frontImage && candidate.rearImage) result.both++;
    else if (candidate.frontImage || candidate.rearImage) result.single++;
    else result.none++;
  }
  return result;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!options.netboxRoot) {
    throw new Error(
      "NetBox path not configured. Set NETBOX_ROOT or pass --netbox-root <path-to-devicetype-library>.",
    );
  }
  assertPathExists(options.netboxRoot, "NetBox repository");
  mkdirSync(options.outputDir, { recursive: true });

  const existingSlugs = getExistingRackulaSlugs(REPO_ROOT);
  const allCandidates = collectCandidates(options, existingSlugs);
  const ranked = selectBalanced(allCandidates, options.limit, RANKED_VENDOR_CAP);
  const phase1 = selectPhase1(ranked, options.phase1Limit);
  const { phase2, phase3 } = selectPhase2AndPhase3(
    ranked,
    phase1,
    options.phase2Limit,
    options.phase3Limit,
  );
  const netboxGit = getNetBoxGitInfo(options.netboxRoot);

  const rankedCsvPath = join(
    options.outputDir,
    "netbox-homelab-candidates-1096.csv",
  );
  const phase1CsvPath = join(
    options.outputDir,
    "netbox-homelab-phase1-1096.csv",
  );
  const phase2CsvPath = join(
    options.outputDir,
    "netbox-homelab-phase2-1096.csv",
  );
  const phase3CsvPath = join(
    options.outputDir,
    "netbox-homelab-phase3-1096.csv",
  );
  const summaryPath = join(options.outputDir, "netbox-homelab-summary-1096.json");

  writeFileSync(rankedCsvPath, `${toCsvRows(ranked).join("\n")}\n`, "utf8");
  writeFileSync(phase1CsvPath, `${toCsvRows(phase1).join("\n")}\n`, "utf8");
  writeFileSync(phase2CsvPath, `${toCsvRows(phase2).join("\n")}\n`, "utf8");
  writeFileSync(phase3CsvPath, `${toCsvRows(phase3).join("\n")}\n`, "utf8");

  const summary = {
    generatedAt: new Date().toISOString(),
    options: {
      netboxRoot: "$NETBOX_ROOT",
      limit: options.limit,
      phase1Limit: options.phase1Limit,
      phase2Limit: options.phase2Limit,
      phase3Limit: options.phase3Limit,
      outputDir: relative(REPO_ROOT, options.outputDir),
    },
    netbox: netboxGit,
    existingRackulaSlugs: existingSlugs.size,
    allCandidateCount: allCandidates.length,
    rankedCount: ranked.length,
    phase1Count: phase1.length,
    phase2Count: phase2.length,
    phase3Count: phase3.length,
    rankedImageCoverage: countImageCoverage(ranked),
    phase1ImageCoverage: countImageCoverage(phase1),
    phase2ImageCoverage: countImageCoverage(phase2),
    phase3ImageCoverage: countImageCoverage(phase3),
    rankedByVendor: countByVendor(ranked),
    phase1ByVendor: countByVendor(phase1),
    phase2ByVendor: countByVendor(phase2),
    phase3ByVendor: countByVendor(phase3),
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("Generated candidate files:");
  console.log(`- ${rankedCsvPath}`);
  console.log(`- ${phase1CsvPath}`);
  console.log(`- ${phase2CsvPath}`);
  console.log(`- ${phase3CsvPath}`);
  console.log(`- ${summaryPath}`);
  console.log("");
  console.log(`NetBox ref: ${netboxGit.branch}@${netboxGit.shortSha}`);
  console.log(`Rackula existing slugs: ${existingSlugs.size}`);
  console.log(`All net-new candidates: ${allCandidates.length}`);
  console.log(`Ranked list: ${ranked.length}`);
  console.log(`Phase 1 shortlist: ${phase1.length}`);
  console.log(`Phase 2 shortlist: ${phase2.length}`);
  console.log(`Phase 3 shortlist: ${phase3.length}`);
}

main();
