#!/usr/bin/env node
// Lighthouse, mobile preset (default simulated throttling), median of N runs
// against the local GitHub-Pages-like server. Prints the numbers QUALITY.md
// holds the site to and writes tests/out/lighthouse/*.json.
//
//   node lighthouse.mjs            3 runs
//   node lighthouse.mjs --runs=5
//
// Unlike the site walk, Lighthouse fetches third-party files live: through
// the sandbox proxy in the cloud, directly elsewhere.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { startServer } from './lib/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', 'lighthouse');
const runs = Number((process.argv.find(a => a.startsWith('--runs=')) || '--runs=3').split('=')[1]);

// The bars from Docs/QUALITY.md §2–3.
const BARS = {
    performance: s => s >= 90,
    accessibility: s => s >= 95,
    lcp: ms => ms < 2500,
    cls: v => v < 0.1,
    tbt: ms => ms < 200,
};

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

fs.mkdirSync(OUT, { recursive: true });
const { base, close } = await startServer({ root: path.resolve(HERE, '..') });

const flags = ['--headless=new', '--no-sandbox'];
if (process.env.HTTPS_PROXY) {
    // Only https goes through the proxy; the local server stays direct.
    flags.push(`--proxy-server=https=${process.env.HTTPS_PROXY.replace(/^https?:\/\//, '')}`, '--ignore-certificate-errors');
}
const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROMIUM_PATH || chromium.executablePath(), chromeFlags: flags });

const results = [];
try {
    for (let i = 1; i <= runs; i++) {
        const { lhr } = await lighthouse(base, { port: chrome.port, output: 'json', logLevel: 'error' });
        fs.writeFileSync(path.join(OUT, `run-${i}.json`), JSON.stringify(lhr));
        const a = lhr.audits;
        const r = {
            performance: Math.round(lhr.categories.performance.score * 100),
            accessibility: Math.round(lhr.categories.accessibility.score * 100),
            bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
            seo: Math.round(lhr.categories.seo.score * 100),
            fcp: Math.round(a['first-contentful-paint'].numericValue),
            lcp: Math.round(a['largest-contentful-paint'].numericValue),
            cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
            tbt: Math.round(a['total-blocking-time'].numericValue),
            kib: Math.round(a['total-byte-weight'].numericValue / 1024),
            failing: Object.entries(a)
                .filter(([, v]) => v.score !== null && v.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(v.scoreDisplayMode))
                .map(([k]) => k),
        };
        results.push(r);
        console.log(`run ${i}: perf ${r.performance} a11y ${r.accessibility} bp ${r.bestPractices} seo ${r.seo} · LCP ${r.lcp}ms CLS ${r.cls} TBT ${r.tbt}ms · ${r.kib} KiB`);
    }
} finally {
    await chrome.kill();
    await close();
}

const med = Object.fromEntries(['performance', 'accessibility', 'bestPractices', 'seo', 'fcp', 'lcp', 'cls', 'tbt', 'kib']
    .map(k => [k, median(results.map(r => r[k]))]));
const failingAudits = [...new Set(results.flatMap(r => r.failing))];
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ runs, median: med, failingAudits }, null, 2));

console.log(`\nmedian of ${runs}: perf ${med.performance} a11y ${med.accessibility} bp ${med.bestPractices} seo ${med.seo} · FCP ${med.fcp}ms LCP ${med.lcp}ms CLS ${med.cls} TBT ${med.tbt}ms · ${med.kib} KiB`);
console.log(`failing audits: ${failingAudits.join(', ') || 'none'}`);
const missed = Object.entries(BARS).filter(([k, ok]) => !ok(med[k])).map(([k]) => `${k} ${med[k]}`);
console.log(missed.length ? `below bar: ${missed.join(', ')}` : 'all Lighthouse bars met');
process.exit(missed.length ? 1 : 0);
