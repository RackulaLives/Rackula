#!/usr/bin/env npx tsx
/**
 * Measure startup payload from dist/index.html modulepreload + entry script refs.
 *
 * Usage:
 *   npm run build
 *   npx tsx scripts/measure-startup-payload.ts
 *   npx tsx scripts/measure-startup-payload.ts --dist dist
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

interface AssetStat {
  asset: string;
  rawBytes: number;
  gzipBytes: number;
}

function parseArg(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return fallback;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function main(): void {
  const distDir = parseArg("--dist", "dist");
  const indexPath = join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    console.error(
      `Missing build output: ${indexPath}. Run "npm run build" first or set --dist.`,
    );
    process.exit(1);
  }

  let html = "";
  try {
    html = readFileSync(indexPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read ${indexPath}: ${message}`);
    process.exit(1);
  }

  const refs = [
    ...[...html.matchAll(/href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
  ];
  const uniqueRefs = [...new Set(refs)];

  const stats: AssetStat[] = [];
  for (const asset of uniqueRefs) {
    const assetPath = join(distDir, asset);
    if (!existsSync(assetPath)) {
      console.error(`Missing asset referenced by index.html: ${assetPath}`);
      process.exit(1);
    }

    try {
      const raw = readFileSync(assetPath);
      const gz = zlib.gzipSync(raw, { level: 9 });
      stats.push({
        asset,
        rawBytes: raw.byteLength,
        gzipBytes: gz.byteLength,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to read asset ${assetPath}: ${message}`);
      process.exit(1);
    }
  }

  stats.sort((a, b) => a.asset.localeCompare(b.asset));

  let totalRaw = 0;
  let totalGzip = 0;
  for (const stat of stats) {
    totalRaw += stat.rawBytes;
    totalGzip += stat.gzipBytes;
    console.log(
      `${stat.asset}\traw=${formatKb(stat.rawBytes)}\tgzip=${formatKb(stat.gzipBytes)}`,
    );
  }

  const aggregate = (assets: AssetStat[]): { raw: number; gzip: number } => ({
    raw: assets.reduce((sum, item) => sum + item.rawBytes, 0),
    gzip: assets.reduce((sum, item) => sum + item.gzipBytes, 0),
  });
  const brandpacks = aggregate(
    stats.filter((stat) => stat.asset.includes("data-brandpacks")),
  );
  const images = aggregate(
    stats.filter((stat) => stat.asset.includes("data-images")),
  );

  console.log("");
  console.log(
    `TOTAL_STARTUP_JS\traw=${formatKb(totalRaw)}\tgzip=${formatKb(totalGzip)}`,
  );
  if (brandpacks.raw > 0 || brandpacks.gzip > 0) {
    console.log(
      `DATA_BRANDPACKS\traw=${formatKb(brandpacks.raw)}\tgzip=${formatKb(brandpacks.gzip)}`,
    );
  }
  if (images.raw > 0 || images.gzip > 0) {
    console.log(
      `DATA_IMAGES\traw=${formatKb(images.raw)}\tgzip=${formatKb(images.gzip)}`,
    );
  }
}

main();
