#!/usr/bin/env node
// Renders tools/social-card/card.html to assets/social/og-card.jpg (1200x630),
// the Open Graph / Twitter preview. Dev-only; the PNG is committed.
//   node tools/render-social-card.mjs      (needs `npm install` in tests/)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(path.join(ROOT, 'tests', 'package.json'));
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(HERE, 'social-card', 'card.html'));
await page.evaluate(() => document.fonts.ready);
// JPEG: a photo over a starfield is ~5x smaller than PNG at no visible cost.
const out = path.join(ROOT, 'assets', 'social', 'og-card.jpg');
await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log('wrote', path.relative(ROOT, out));
