#!/usr/bin/env node
// Timeline performance on a phone: steps through every slide on a 375×812
// touch viewport with the CPU throttled (default 4×, Lighthouse's mobile
// figure) and reports, per slide, frame times, long tasks and bytes fetched.
//
//   node perf-timeline.mjs                    this checkout
//   node perf-timeline.mjs --root=<dir>       another checkout (git worktree)
//   node perf-timeline.mjs --cpu=6 --dwell=1200
//
// Headless Chromium renders WebGL in software (SwiftShader), so absolute
// frame times are pessimistic; compare checkouts and slides, not against 60 fps.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { createThirdPartyCache } from './lib/thirdparty.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ROOT = path.resolve(args.root ? String(args.root) : path.join(HERE, '..'));
const CPU = Number(args.cpu || 4);
const DWELL = Number(args.dwell || 1000);   // ms on each slide, like a reader swiping on

const { base, close } = await startServer({ root: ROOT });
const cache = createThirdPartyCache({ dir: path.join(HERE, '.cache', 'thirdparty') });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.route(u => !u.href.startsWith(base), r => cache.handleRoute(r));
await ctx.addInitScript(() => {
    window.__perf = { frames: [], longtasks: [] };
    let last = 0;
    const tick = t => { if (last) window.__perf.frames.push([t, t - last]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try {
        new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.longtasks.push([e.startTime, e.duration])))
            .observe({ type: 'longtask', buffered: true });
    } catch { /* unsupported */ }
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

let bytes = 0;
const bytesLog = [];
page.on('requestfinished', async r => {
    const s = await r.sizes().catch(() => null);
    if (s) { bytes += s.responseBodySize; bytesLog.push([r.url().slice(base.length), s.responseBodySize]); }
});

await page.goto(base, { waitUntil: 'load' });
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
const loadBytes = bytes;
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

// Enter: the explicit button where it exists; older builds entered by scrolling.
const hasButton = await page.locator('#cvEnter').count();
if (hasButton) await page.locator('#cvEnter').click();
else await page.evaluate(() => document.getElementById('cv').scrollIntoView());
await page.waitForFunction(() => document.body.classList.contains('timeline-immersive'), null, { timeout: 15000 });
await page.waitForTimeout(1500);

const slides = await page.locator('.project-slide').count();
const rows = [];
for (let i = 0; i < slides; i++) {
    const t0 = await page.evaluate(() => performance.now());
    const b0 = bytes;
    await page.waitForTimeout(DWELL);
    const t1 = await page.evaluate(() => performance.now());
    const r = await page.evaluate(([a, b]) => {
        const f = window.__perf.frames.filter(([t]) => t >= a && t < b).map(([, d]) => d).sort((x, y) => x - y);
        const lt = window.__perf.longtasks.filter(([t]) => t >= a && t < b);
        const pct = q => f.length ? f[Math.min(f.length - 1, Math.floor(q * f.length))] : 0;
        return { frames: f.length, p50: pct(0.5), p95: pct(0.95), max: f[f.length - 1] || 0, janky: f.filter(d => d > 50).length,
            longtasks: lt.length, longMs: lt.reduce((s, [, d]) => s + d, 0) };
    }, [t0, t1]);
    rows.push({ slide: i, ...r, kib: Math.round((bytes - b0) / 1024) });
    await page.keyboard.press('ArrowDown');
}

const fmt = n => String(Math.round(n)).padStart(5);
console.log(`root ${ROOT}\nCPU ×${CPU}, ${DWELL} ms per slide, 375×812 @2x touch; page load ${Math.round(loadBytes / 1024)} KiB\n`);
console.log('slide frames   p50   p95   max jank>50ms longtasks(ms)   KiB');
for (const r of rows) console.log(`${String(r.slide).padStart(5)} ${fmt(r.frames)} ${fmt(r.p50)} ${fmt(r.p95)} ${fmt(r.max)} ${fmt(r.janky)}     ${String(r.longtasks).padStart(3)} (${fmt(r.longMs)})  ${fmt(r.kib)}`);
const all = rows.reduce((a, r) => ({ jank: a.jank + r.janky, kib: a.kib + r.kib, long: a.long + r.longMs }), { jank: 0, kib: 0, long: 0 });
console.log(`\ntotal: ${all.jank} janky frames, ${Math.round(all.long)} ms long tasks, ${all.kib} KiB fetched while in the timeline`);
const big = bytesLog.filter(([, n]) => n > 500 * 1024).map(([u, n]) => `${u} ${(n / 1048576).toFixed(1)} MB`);
if (big.length) console.log(`large downloads: ${[...new Set(big)].join(', ')}`);

await browser.close();
await close();
