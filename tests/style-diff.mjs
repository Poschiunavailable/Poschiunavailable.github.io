#!/usr/bin/env node
// Computed-style diff between two checkouts of the site — for refactors that
// must not change how anything looks (e.g. reorganising CSS files).
//
//   node style-diff.mjs <before-root> [after-root]   (after defaults to the repo)
//
// Compares every element's computed style at a phone and a desktop size, in
// the page's normal, immersive-timeline and warping states. Reduced motion
// keeps typing/reveal animations out of the comparison. Prints differences
// and exits 1 if there are any.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { createThirdPartyCache } from './lib/thirdparty.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const before = path.resolve(process.argv[2]);
const after = path.resolve(process.argv[3] || path.join(HERE, '..'));
const STATES = [[], ['timeline-immersive'], ['timeline-immersive', 'timeline-warping'], ['timeline-immersive', 'timeline-arriving']];
const VIEWPORTS = [[375, 812], [1920, 1080]];
// Font stacks (and the tokens holding them) are compared with the "… Fallback" faces stripped; adding them is intended.
const norm = (prop, v) => v.replace(/,\s*["'][^"']+ Fallback["']/g, '');

const snapshot = () => {
    const skip = new Set(['transition-delay', 'transform', 'opacity']); // set inline by scripts at random/animated values
    const out = {};
    const pathOf = el => {
        const parts = [];
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            let i = 0; for (let s = e; (s = s.previousElementSibling);) i++;
            parts.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}:${i}`);
        }
        return parts.join('>');
    };
    for (const el of document.querySelectorAll('body, body *')) {
        if (el.closest('#canvas-container')) continue;
        const cs = getComputedStyle(el);
        const o = {};
        for (const p of cs) if (!skip.has(p) && !el.style.getPropertyValue(p)) o[p] = cs.getPropertyValue(p);
        out[pathOf(el)] = o;
    }
    return out;
};

async function capture(root) {
    const { base, close } = await startServer({ root });
    const cache = createThirdPartyCache({ dir: path.join(HERE, '.cache', 'thirdparty') });
    const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
    const result = {};
    for (const [w, h] of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
        await ctx.route(u => !u.href.startsWith(base), r => cache.handleRoute(r));
        const page = await ctx.newPage();
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForSelector('#projectStage .project-slide', { state: 'attached' });
        await page.evaluate(() => document.fonts.ready);
        for (const st of STATES) {
            await page.evaluate(st => { document.body.className = st.join(' '); }, st);
            await page.waitForTimeout(100);
            result[`${w}x${h} [${st.join(' ') || 'page'}]`] = await page.evaluate(snapshot);
        }
        await ctx.close();
    }
    await browser.close();
    await close();
    return result;
}

const A = await capture(before);
const B = await capture(after);
let diffs = 0;
for (const key of Object.keys(A)) {
    const a = A[key], b = B[key];
    const els = new Set([...Object.keys(a), ...Object.keys(b)]);
    let elems = 0;
    for (const el of els) {
        if (!a[el] || !b[el]) { console.log(`${key} ${el}: element ${a[el] ? 'missing after' : 'new'}`); diffs++; continue; }
        elems++;
        for (const p of Object.keys(a[el])) {
            const va = norm(p, a[el][p]), vb = norm(p, b[el][p] ?? '');
            if (va !== vb) { diffs++; console.log(`${key} ${el.split('>').slice(-3).join('>')} ${p}: ${va} → ${vb}`); }
        }
    }
    console.log(`${key}: ${elems} elements compared`);
}
console.log(diffs ? `\n${diffs} computed-style difference(s)` : '\nno computed-style differences');
process.exit(diffs ? 1 : 0);
