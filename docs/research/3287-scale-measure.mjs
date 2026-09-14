#!/usr/bin/env node
// Scale-check measurements for spike #3287, run against a production build.
// Usage: node docs/research/3287-scale-measure.mjs <layoutDir> <runs> <scenario...>
// Env: THROTTLES=1,4  BASE=http://localhost:4173/  OUT=results.json  CHROME_PATH=<binary>
// <layoutDir> is the output of 3287-scale-gen.mjs (it reads stats.json from there).
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173/";
const [dir, runsArg, ...scenarios] = process.argv.slice(2);
if (!dir || !scenarios.length) {
  console.error(
    "usage: node docs/research/3287-scale-measure.mjs <layoutDir> <runs> <scenario...>",
  );
  process.exit(1);
}
const RUNS = Number(runsArg ?? 3);
const THROTTLES = (process.env.THROTTLES ?? "1,4").split(",").map(Number);
const OUTFILE = process.env.OUT ?? "results.json";
const stats = Object.fromEntries(
  JSON.parse(readFileSync(join(dir, "stats.json"), "utf8")).map((s) => [
    s.file,
    s,
  ]),
);
mkdirSync(join(dir, "shots"), { recursive: true });

const INIT = `
  delete window.showOpenFilePicker; delete window.showSaveFilePicker; delete window.showDirectoryPicker;
  try { localStorage.clear(); } catch {}
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  window.__startSample = () => { window.__ts = []; window.__run = true; const f = (t) => { window.__ts.push(t); if (window.__run) requestAnimationFrame(f); }; requestAnimationFrame(f); };
  window.__stopSample = () => { window.__run = false; return window.__ts; };
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sorted = (a) => [...a].sort((x, y) => x - y);
const median = (a) => {
  const s = sorted(a.filter((x) => x != null && !Number.isNaN(x)));
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, p) => {
  const s = sorted(a);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function frameStats(ts) {
  if (!ts || ts.length < 3) return null;
  const iv = ts.slice(1).map((t, i) => t - ts[i]);
  const dur = (ts[ts.length - 1] - ts[0]) / 1000;
  return {
    fps: +(iv.length / dur).toFixed(1),
    p50: +median(iv).toFixed(1),
    p95: +pct(iv, 0.95).toFixed(1),
    max: +Math.max(...iv).toFixed(1),
    over50: iv.filter((x) => x > 50).length,
  };
}

async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

async function findBackground(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="rack-canvas"]');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    for (let fy = 0.05; fy < 0.95; fy += 0.05) {
      for (let fx = 0.05; fx < 0.95; fx += 0.05) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (
          el &&
          canvas.contains(el) &&
          !el.closest(
            '.rack-container, .rack-item, svg, [draggable="true"], button',
          )
        )
          return { x, y };
      }
    }
    return null;
  });
}

async function findDevice(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll(
      '[data-testid="rack-device-hitbox"]',
    )) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (
        r.width < 3 ||
        r.height < 3 ||
        x < 0 ||
        y < 0 ||
        x > innerWidth ||
        y > innerHeight
      )
        continue;
      const hit = document.elementFromPoint(x, y);
      const dev = el.closest('[data-testid="rack-device"]');
      if (hit && dev && hit.closest('[data-testid="rack-device"]') === dev)
        return { x, y };
    }
    return null;
  });
}

async function sampleDuring(page, action) {
  await page.evaluate(() => window.__startSample());
  await action();
  return frameStats(await page.evaluate(() => window.__stopSample()));
}

async function runOnce(browser, scenario, throttle, run) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(BASE);
    await page
      .locator(".rack-container")
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (throttle > 1)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const s = stats[scenario];

    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+o" : "Control+o",
    );
    const input = page.locator('[data-testid="file-input-load"]');
    await input.waitFor({ state: "attached", timeout: 10000 });
    const m0 = await metrics(cdp);
    const tStart = await page.evaluate(() => performance.now());
    const w0 = Date.now();
    await input.setInputFiles(join(dir, `${scenario}.rackula.yaml`));
    let loadMs = null;
    try {
      await page.waitForFunction(
        (n) =>
          document.querySelectorAll('[data-testid="rack-device"]').length >= n,
        s.devices,
        { polling: "raf", timeout: 180000 },
      );
      loadMs = Date.now() - w0;
    } catch {
      await page.screenshot({
        path: join(dir, "shots", `${scenario}-t${throttle}-FAIL.png`),
      });
    }
    let last = -1;
    let stableSince = Date.now();
    while (Date.now() - stableSince < 1000) {
      const c = await page.evaluate(
        () => document.querySelectorAll('[data-testid="rack-device"]').length,
      );
      if (c !== last) {
        last = c;
        stableSince = Date.now();
      }
      await sleep(100);
    }
    const settleMs = Date.now() - w0 - 1000;
    const m1 = await metrics(cdp);
    const tEnd = await page.evaluate(() => performance.now());
    const dom = await page.evaluate(
      ({ tStart, tEnd }) => {
        const lt = window.__lt.filter(([st]) => st >= tStart && st <= tEnd);
        const toasts = [
          ...document.querySelectorAll(
            '[role="status"], [role="alert"], [data-sonner-toast]',
          ),
        ]
          .map((e) => e.textContent.trim().replace(/\s+/g, " "))
          .filter(Boolean)
          .slice(0, 5);
        return {
          nodes: document.querySelectorAll("*").length,
          svgNodes: document.querySelectorAll("svg *").length,
          rackDevices: document.querySelectorAll('[data-testid="rack-device"]')
            .length,
          rackContainers: document.querySelectorAll(".rack-container").length,
          connectionsDrawn: document.querySelectorAll("g.connection").length,
          longTasks: lt.length,
          maxLongTask: Math.round(Math.max(0, ...lt.map(([, d]) => d))),
          tbt: Math.round(lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)),
          toasts,
        };
      },
      { tStart, tEnd },
    );
    if (run === 0 && throttle === 1)
      await page.screenshot({ path: join(dir, "shots", `${scenario}.png`) });

    let selectMs = null;
    const target = await findDevice(page);
    if (target) {
      const w1 = Date.now();
      await page.mouse.click(target.x, target.y);
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-testid="rack-device"].selected'),
          null,
          { polling: "raf", timeout: 30000 },
        );
        selectMs = Date.now() - w1;
      } catch {
        // selection never showed; leave null
      }
      await page.keyboard.press("Escape");
      await sleep(300);
    }

    const box = await page.locator('[data-testid="rack-canvas"]').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    const zoom = await sampleDuring(page, async () => {
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, i < 10 ? -120 : 120);
        await sleep(50);
      }
    });
    await page.keyboard.down("Shift");
    const shiftPan = await sampleDuring(page, async () => {
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, i < 10 ? 120 : -120);
        await sleep(50);
      }
    });
    await page.keyboard.up("Shift");
    const bg = await findBackground(page);
    let drag = null;
    if (bg) {
      drag = await sampleDuring(page, async () => {
        await page.mouse.move(bg.x, bg.y);
        await page.mouse.down();
        for (let i = 1; i <= 40; i++) {
          await page.mouse.move(bg.x + (i <= 20 ? i : 40 - i) * 10, bg.y);
          await sleep(16);
        }
        await page.mouse.up();
      });
    }
    const idle = await sampleDuring(page, () => sleep(1000));
    return {
      scenario,
      throttle,
      run,
      loadMs,
      settleMs,
      selectMs,
      taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
      scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
      layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
      styleMs: Math.round(
        (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000,
      ),
      heapMB: +(m1.JSHeapUsedSize / 1e6).toFixed(1),
      ...dom,
      zoom,
      shiftPan,
      drag,
      idle,
      errors,
    };
  } catch (e) {
    return { scenario, throttle, run, fatal: String(e).slice(0, 300), errors };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
console.log(`browser ${browser.version()}`);
const results = [];
for (const scenario of scenarios) {
  for (const throttle of THROTTLES) {
    for (let run = 0; run < RUNS; run++) {
      const r = await runOnce(browser, scenario, throttle, run);
      results.push(r);
      console.log(
        JSON.stringify({
          scenario,
          throttle,
          run,
          loadMs: r.loadMs,
          settleMs: r.settleMs,
          selectMs: r.selectMs,
          maxLongTask: r.maxLongTask,
          svgNodes: r.svgNodes,
          conn: r.connectionsDrawn,
          zoomP95: r.zoom?.p95,
          dragP95: r.drag?.p95,
          fatal: r.fatal,
          errors: r.errors?.length,
        }),
      );
      writeFileSync(join(dir, OUTFILE), JSON.stringify(results, null, 2));
    }
  }
}
await browser.close();

const summary = [];
for (const scenario of scenarios) {
  for (const throttle of THROTTLES) {
    const rs = results.filter(
      (r) => r.scenario === scenario && r.throttle === throttle && !r.fatal,
    );
    if (!rs.length) continue;
    const md = (f) => median(rs.map(f));
    summary.push({
      scenario,
      cpu: `${throttle}x`,
      loadMs: md((r) => r.loadMs),
      settleMs: md((r) => r.settleMs),
      selectMs: md((r) => r.selectMs),
      taskMs: md((r) => r.taskMs),
      maxLT: md((r) => r.maxLongTask),
      tbt: md((r) => r.tbt),
      nodes: md((r) => r.nodes),
      svg: md((r) => r.svgNodes),
      heapMB: md((r) => r.heapMB),
      conn: md((r) => r.connectionsDrawn),
      zoomP95: md((r) => r.zoom?.p95),
      zoomMax: md((r) => r.zoom?.max),
      zoomJank: md((r) => r.zoom?.over50),
      panP95: md((r) => r.shiftPan?.p95),
      panMax: md((r) => r.shiftPan?.max),
      dragP95: md((r) => r.drag?.p95),
      dragMax: md((r) => r.drag?.max),
      dragJank: md((r) => r.drag?.over50),
    });
  }
}
writeFileSync(
  join(dir, OUTFILE.replace(".json", "-summary.json")),
  JSON.stringify(summary, null, 2),
);
console.table(summary);
