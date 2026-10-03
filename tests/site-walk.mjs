#!/usr/bin/env node
// Site walk — loads the site at every test viewport and exercises everything
// a visitor can reach: every section, the mobile nav, the timeline (every
// slide), and every portfolio card's warp jump. Fails on site console/page
// errors, overflow where the docs say content must fit, broken links, and
// counts that show a step tested nothing. Writes screenshots and a contact
// sheet to tests/out/.
//
//   node site-walk.mjs                     all variants, all viewports
//   node site-walk.mjs --quick             3 viewports (tight portrait, tight landscape, desktop)
//   node site-walk.mjs --variants=default,no-webgl --viewports=375x667
//   node site-walk.mjs --self-test         injects faults; passes only if each is caught
//   node site-walk.mjs --offline           third-party cache misses are errors
//   node site-walk.mjs --skip-external     don't check external links (offline work)
//   node site-walk.mjs --root=../../old    walk another checkout (before/after comparisons)
//   node site-walk.mjs --out=/tmp/walk-a    write results elsewhere (parallel runs)
//
// Quality bars and what each check stands for: Docs/QUALITY.md.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { createThirdPartyCache } from './lib/thirdparty.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ────────────────────────────────────────────────────────────

const ALL_VIEWPORTS = ['320x568', '360x640', '375x667', '375x812', '414x896',
    '667x375', '844x390', '768x1024', '1024x768', '1920x1080'];
const QUICK_VIEWPORTS = ['360x640', '667x375', '1920x1080'];
const ALL_VARIANTS = ['default', 'reduced-motion', 'no-webgl', 'no-js'];
// Where the initial-load transfer budget is measured (QUALITY.md §2).
const BUDGET_VIEWPORTS = ['375x812', '1920x1080'];
const BUDGET_KIB = { total: 600, script: 300, font: 100, stylesheet: 40, image: 200 };
const SECTIONS = ['hero', 'about', 'portfolio', 'cv', 'contact'];
// axe-core accessibility scan (QUALITY.md §3): the page, then every timeline
// slide, at a phone and a desktop size, default variant.
const AXE_VIEWPORTS = ['375x812', '1920x1080'];
const AXE_PATH = path.join(HERE, 'node_modules', 'axe-core', 'axe.min.js');
// Where the site is published. URLs on this origin are checked against the
// local checkout: that is what is about to be deployed.
const CANONICAL = 'https://poschiunavailable.github.io/';

// Console messages that come from the browser, not the site. Each needs a reason.
const BROWSER_NOISE = [
    /GL Driver Message/,               // SwiftShader/ANGLE driver chatter in headless Chromium
    /GroupMarkerNotSet/,               // same, emitted by the GPU process
    /Automatic fallback to software WebGL/, // headless has no GPU; not something a site can fix
];
// Hosts that answer automated requests with a non-standard code. Accepted
// only with exactly that code; anything else from them still fails.
const BOT_BLOCKING = { 'www.linkedin.com': [999], 'linkedin.com': [999] };
// The cloud sandbox's proxy refuses github.com paths outside the session's
// repositories with its own 403. Such a link is neither passed nor failed:
// it is reported as unverifiable, identified by the proxy's message.
const SANDBOX_BLOCK = /sessions are bound to their configured repositories/;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
}));
// --root=<dir> walks another checkout (e.g. a worktree of an older commit).
// --out=<dir> writes screenshots/report elsewhere (parallel runs must not share one).
const ROOT = path.resolve(args.root ? String(args.root) : path.join(HERE, '..'));
const OUT = path.resolve(args.out ? String(args.out) : path.join(HERE, 'out'));
const SELF_TEST = !!args['self-test'];
const viewports = SELF_TEST ? ['375x667']
    : args.viewports ? String(args.viewports).split(',')
    : args.quick ? QUICK_VIEWPORTS : ALL_VIEWPORTS;
const variants = SELF_TEST ? ['default']
    : args.variants ? String(args.variants).split(',') : ALL_VARIANTS;
const CONCURRENCY = Number(args.concurrency || 2);
const SKIP_EXTERNAL = SELF_TEST || !!args['skip-external'];

// ── Self-test faults ─────────────────────────────────────────────────────────
// Each fault must be reported under its code, or the self-test fails: a check
// that cannot fail is not a check.

// code: [file to alter, alteration, pattern the resulting failure message must match]
const SELF_TEST_FAULTS = {
    'console-error':  ['/modules/main.js', s => s + "\nconsole.error('[self-test] injected console error');\n", /self-test/],
    'broken-link':    ['/index.html', s => s.replace('</footer>', '<a href="assets/self-test-missing.png">self-test</a></footer>'), /self-test-missing\.png/],
    'broken-anchor':  ['/index.html', s => s.replace('</footer>', '<a href="#self-test-missing-anchor">self-test</a></footer>'), /self-test-missing-anchor/],
    'cls':            ['/modules/scripts.js', s => s + "\naddEventListener('load', () => setTimeout(() => { document.querySelector('.hero-content').style.marginTop = '320px'; }, 150));\n", /layout shift during load/],
    'placeholder-data': ['/projects.json', s => { const d = JSON.parse(s); delete d[0].placeholders.image; return JSON.stringify(d); }, /UniversityProjects\.image .*not marked/],
    'metadata':       ['/index.html', s => s.replace('content="1200"', 'content="1201"'), /disagree with the file/],
    'icons':          ['/site.webmanifest', s => s.replace('"192x192"', '"193x193"'), /declared 193x193/],
    'responsive':     ['/projects.json', s => { const d = JSON.parse(s); d[0].workTopics[0].image = 'assets/profile_picture.jpg'; return JSON.stringify(d); }, /profile_picture-480\.webp/],
    'slide-overflow': ['/styles/cvstyle.css', s => s + '\n.project-slide[data-idx="1"] .topic-desc { padding-bottom: 150vh; }\n', /^slide 1 /],
};
function selfTestTransform(urlPath, buf) {
    let s = null;
    for (const [file, fn] of Object.values(SELF_TEST_FAULTS)) {
        if (file === urlPath) s = fn(s ?? buf.toString('utf8'));
    }
    return s === null ? buf : Buffer.from(s);
}

// ── Results ──────────────────────────────────────────────────────────────────

const failures = [];
const info = [];
const shots = [];      // { variant, vp, label, file }
const coverage = {};   // `${variant} ${vp}` -> counters
const budgets = [];

function fail(variant, vp, code, message, shot) {
    failures.push({ variant, vp, code, message, shot });
}

// ── Helpers that run in the page ─────────────────────────────────────────────

const INIT_SCRIPT = () => {
    window.__walk = { warpSeen: false, cls: 0, shifts: [] };
    // Cumulative layout shift during load (QUALITY.md §2). Every shift
    // counts: the walk does no input before it reads this, and Chromium marks
    // shifts in the first ~500 ms after an automated navigation as
    // hadRecentInput — filtering on it hid exactly the load-time shifts
    // (found by the self-test).
    try {
        new PerformanceObserver(list => {
            for (const e of list.getEntries()) {
                window.__walk.cls += e.value;
                window.__walk.shifts.push({ value: e.value, nodes: (e.sources || [])
                    .map(s => s.node && (s.node.id ? '#' + s.node.id : s.node.className || s.node.nodeName)).filter(Boolean) });
            }
        }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* not supported: reported as missing below */ }
    new MutationObserver(() => {
        if (document.body?.classList.contains('timeline-warping')) window.__walk.warpSeen = true;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
};

const NO_WEBGL_SCRIPT = () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(String(type))) return null;
        return orig.call(this, type, ...rest);
    };
};

// Which slide is in focus, and has everything stopped moving?
const timelineState = () => {
    const slides = [...document.querySelectorAll('.project-slide')];
    const full = slides.filter(s => s.style.opacity === '1');
    const zero = slides.filter(s => s.style.opacity === '0');
    const b = document.body.classList;
    return {
        immersive: b.contains('timeline-immersive'),
        settled: full.length === 1 && zero.length === slides.length - 1
            && !b.contains('timeline-warping') && !b.contains('timeline-arriving'),
        idx: full.length === 1 ? Number(full[0].dataset.idx) : -1,
    };
};

// Every visible part of the focused slide must sit inside the viewport, no
// text box may be clipped, and no text may sit under the fixed HUD.
const checkSlideFits = (idx) => {
    const slide = document.querySelector(`.project-slide[data-idx="${idx}"]`);
    const content = slide?.querySelector('.slide-content');
    if (!content) return { checked: 0, issues: [{ kind: 'missing', el: `slide ${idx}` }] };
    const W = innerWidth, H = innerHeight, issues = [];
    const describe = el => el.id ? `#${el.id}` :
        el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const shown = el => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
    };
    const clips = el => /(hidden|clip)/.test(getComputedStyle(el).overflow);
    const clippedByAncestor = el => {
        for (let a = el.parentElement; a && a !== slide; a = a.parentElement) if (clips(a)) return true;
        return false;
    };
    let checked = 0;
    const reported = [];
    for (const el of [content, ...content.querySelectorAll('*')]) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        checked++;
        // Report only the outermost offender; its children overflow with it.
        if ((r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) && !clippedByAncestor(el)
            && !reported.some(p => p.contains(el))) {
            reported.push(el);
            issues.push({ kind: 'overflow', el: describe(el), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) });
        }
        if (clips(el) && el.scrollHeight > el.clientHeight + 2 && el.textContent.trim()) {
            issues.push({ kind: 'clipped', el: describe(el), px: el.scrollHeight - el.clientHeight });
        }
    }
    const hud = ['#timeMachine', '#cvExit', '#cvProjectNav']
        .map(s => document.querySelector(s)).filter(e => e && shown(e));
    for (const h of hud) {
        const q = h.getBoundingClientRect();
        if (q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1) {
            issues.push({ kind: 'overflow', el: describe(h), rect: [q.left, q.top, q.right, q.bottom].map(Math.round) });
        }
        // Text, and the images beside it: a control over a picture hides it too.
        for (const t of content.querySelectorAll('h2, h3, p, li, dt, dd, a, img, .topic-image-section')) {
            if (!shown(t)) continue;
            const r = t.getBoundingClientRect();
            const ix = Math.min(r.right, q.right) - Math.max(r.left, q.left);
            const iy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
            if (ix > 2 && iy > 2) issues.push({ kind: 'overlap', el: describe(t), with: describe(h) });
        }
    }
    return { checked, issues };
};

const collectRefs = () => {
    const refs = [];
    const add = (kind, v, where) => { if (v) refs.push({ kind, v, where }); };
    document.querySelectorAll('a[href]').forEach(a => add('href', a.getAttribute('href'), 'a'));
    // preconnect/dns-prefetch name an origin, not a resource; there is nothing to fetch.
    document.querySelectorAll('link[href]:not([rel~=preconnect]):not([rel~=dns-prefetch])')
        .forEach(l => add('href', l.getAttribute('href'), `link[rel=${l.rel}]`));
    document.querySelectorAll('img[src], source[src], script[src]').forEach(e => add('src', e.getAttribute('src'), e.tagName.toLowerCase()));
    document.querySelectorAll('video[poster]').forEach(v => add('src', v.getAttribute('poster'), 'video[poster]'));
    document.querySelectorAll('[data-src]').forEach(v => add('src', v.getAttribute('data-src'), '[data-src]'));
    document.querySelectorAll('[srcset], [data-srcset]').forEach(e => {
        for (const part of (e.getAttribute('srcset') || e.getAttribute('data-srcset')).split(',')) {
            add('src', part.trim().split(/\s+/)[0], 'srcset');
        }
    });
    document.querySelectorAll('[style*="url("]').forEach(e => {
        for (const m of e.getAttribute('style').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) add('src', m[1], 'style url()');
    });
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
        .forEach(m => add('src', m.getAttribute('content'), 'meta image'));
    return refs;
};

// ── Walk one viewport ────────────────────────────────────────────────────────

async function walkViewport(browser, base, cache, variant, vp, expect) {
    const [w, h] = vp.split('x').map(Number);
    const phone = Math.min(w, h) <= 430;          // phones: touch, no hover
    const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        isMobile: phone,
        hasTouch: phone,
        deviceScaleFactor: 1,
        reducedMotion: variant === 'reduced-motion' ? 'reduce' : 'no-preference',
        javaScriptEnabled: variant !== 'no-js',
    });
    await ctx.route(url => !url.href.startsWith(base), r => cache.handleRoute(r));
    await ctx.addInitScript(INIT_SCRIPT);
    if (variant === 'no-webgl') await ctx.addInitScript(NO_WEBGL_SCRIPT);
    const page = await ctx.newPage();
    const cov = coverage[`${variant} ${vp}`] = { sections: 0, slides: 0, warps: 0, navChecked: false };
    const dir = path.join(OUT, variant, vp);
    fs.mkdirSync(dir, { recursive: true });
    let shotN = 0;
    const shoot = async (label) => {
        const file = path.join(dir, `${String(shotN++).padStart(2, '0')}-${label}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
        const rel = path.relative(OUT, file);
        shots.push({ variant, vp, label, file: rel });
        return rel;
    };
    const F = (code, msg, shot) => fail(variant, vp, code, msg, shot);

    // Serious/critical axe violations fail the walk; the rest are listed.
    const runAxe = variant === 'default' && AXE_VIEWPORTS.includes(vp);
    const axe = async (where, include) => {
        if (!runAxe) return;
        if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE_PATH });
        const res = await page.evaluate(async (include) => {
            const r = await window.axe.run(include ? { include: [include] } : document,
                { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
            return { passes: r.passes.length, violations: r.violations.map(v => ({ id: v.id, impact: v.impact,
                nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })) };
        }, include);
        cov.axeRuns = (cov.axeRuns || 0) + 1;
        if (!res.passes) F('tested-nothing', `axe ${where}: no rules passed — nothing was checked`);
        for (const v of res.violations) {
            const msg = `axe ${where}: ${v.id} (${v.impact}) on ${v.nodes.join(', ')}`;
            if (v.impact === 'serious' || v.impact === 'critical') F('axe', msg);
            else info.push(`${variant} ${vp} ${msg}`);
        }
    };

    // Errors from the site's own code
    const isSite = u => !u || u.startsWith(base);
    page.on('console', m => {
        if (!['error', 'warning'].includes(m.type())) return;
        const text = m.text();
        if (BROWSER_NOISE.some(re => re.test(text))) return;
        const loc = m.location()?.url || '';
        if (isSite(loc)) F(m.type() === 'error' ? 'console-error' : 'console-warning', `${text} (${loc || 'no location'})`);
        else info.push(`${variant} ${vp} third-party console ${m.type()}: ${text}`);
    });
    page.on('pageerror', e => {
        const stack = e.stack || '';
        if (!/https?:\/\//.test(stack) || stack.includes(base)) F('page-error', e.message);
        else info.push(`${variant} ${vp} third-party page error: ${e.message}`);
    });
    page.on('requestfailed', r => {
        if (!r.url().startsWith(base)) return;   // third-party failures are reported by the cache
        const err = r.failure()?.errorText || '';
        // Media elements abort their own range requests when paused or replaced.
        if (r.resourceType() === 'media' && /ERR_ABORTED/.test(err)) return;
        F('request-failed', `${r.url().slice(base.length)} ${err}`);
    });
    page.on('response', r => {
        if (r.url().startsWith(base) && r.status() >= 400) F('http-error', `${r.status()} ${r.url().slice(base.length)}`);
    });

    // Transfer budget: record what the first load costs.
    const loadRequests = [];
    const onFinished = r => loadRequests.push(r);
    page.on('requestfinished', onFinished);

    await page.goto(base, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    page.off('requestfinished', onFinished);
    if (variant !== 'no-js') {
        const early = loadRequests.map(r => r.url().slice(base.length).split('?')[0])
            .filter(u => expect.timelineOnly.some(t => u === t || u === t.replace(RASTER, '-480.webp') || u === t.replace(RASTER, '-960.webp')));
        if (early.length) F('budget', `timeline-only images loaded with the page: ${early.join(', ')}`);
    }
    if (variant === 'default' && BUDGET_VIEWPORTS.includes(vp)) await measureBudget(vp, base, cache, loadRequests);

    // ── Exactly one starfield: the live canvas, or the static tile — never
    //    both (doubled stars), never neither (blank sky). ──
    const sky = await page.evaluate(() => {
        const c = document.getElementById('canvas-container');
        return { canvas: !!c?.querySelector('canvas'), tile: /starfield-static/.test(getComputedStyle(c).backgroundImage) };
    });
    const wantTile = variant === 'no-webgl' || variant === 'no-js';
    if (sky.canvas === sky.tile || sky.tile !== wantTile) {
        F('starfield', `expected ${wantTile ? 'static star tile' : 'live WebGL canvas'} only; got canvas=${sky.canvas} tile=${sky.tile}`);
    }

    // ── No-JS: the content itself must be there ──
    if (variant === 'no-js') {
        // Only where the projects belong: titles also occur in the about copy.
        const text = await page.evaluate(() => ['portfolio', 'cv']
            .map(id => document.getElementById(id)?.innerText || '').join('\n'));
        const missing = expect.contentTitles.filter(t => !text.includes(t));
        cov.contentTitles = expect.contentTitles.length - missing.length;
        if (missing.length) F('nojs-content', `${missing.length}/${expect.contentTitles.length} project titles absent without JS: ${missing.join(', ')}`);
        for (const id of SECTIONS) {
            const ok = await page.evaluate(id => {
                const el = document.getElementById(id);
                if (!el) return false;
                el.scrollIntoView();
                return true;
            }, id);
            if (!ok) { F('content-missing', `section #${id} missing`); continue; }
            await page.waitForTimeout(150);
            await shoot(`section-${id}`);
            cov.sections++;
        }
        await ctx.close();
        return;
    }

    // ── Content rendered from projects.json ──
    const counts = await page.waitForFunction(({ cards, slides }) => {
        const c = document.querySelectorAll('#portfolioGrid .portfolio-item').length;
        const s = document.querySelectorAll('#projectStage .project-slide').length;
        return c === cards && s === slides ? { c, s } : false;
    }, { cards: expect.cards.length, slides: expect.slides }, { timeout: 10000 })
        .then(h => h.jsonValue())
        .catch(async () => page.evaluate(() => ({
            c: document.querySelectorAll('#portfolioGrid .portfolio-item').length,
            s: document.querySelectorAll('#projectStage .project-slide').length,
        })));
    if (counts.c !== expect.cards.length) F('content-missing', `${counts.c} portfolio cards, expected ${expect.cards.length}`);
    if (counts.s !== expect.slides) F('content-missing', `${counts.s} timeline slides, expected ${expect.slides}`);
    const noSrcset = await page.evaluate(() => [...document.querySelectorAll('#portfolioGrid img')]
        .filter(i => /\.(webp|jpe?g|png)$/i.test(i.getAttribute('src')) && !(i.srcset && i.sizes)).map(i => i.getAttribute('src')));
    if (noSrcset.length) F('responsive', `card images without srcset/sizes: ${noSrcset.join(', ')}`);

    const hOverflow = async (where) => {
        const px = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (px > 0) F('h-overflow', `page scrolls horizontally by ${px}px (${where})`);
    };
    await hOverflow('after load');

    // Layout shift from load to idle, before the walk scrolls anything.
    await page.waitForTimeout(500);
    const ls = await page.evaluate(() => window.__walk);
    cov.cls = Number(ls.cls.toFixed(4));
    if (ls.cls >= 0.1) F('cls', `layout shift during load ${ls.cls.toFixed(3)} ≥ 0.1 (${ls.shifts.map(s => `${s.value.toFixed(3)} ${s.nodes.join(',')}`).join('; ')})`);
    else if (ls.cls > 0) info.push(`${variant} ${vp} CLS ${ls.cls.toFixed(4)}: ${ls.shifts.map(s => s.nodes.join(',')).join('; ')}`);

    // ── Sections ──
    for (const id of SECTIONS) {
        const exists = await page.evaluate((id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const nav = document.querySelector('.navbar');
            window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (nav ? nav.offsetHeight : 0), behavior: 'instant' });
            return true;
        }, id);
        if (!exists) { F('content-missing', `section #${id} missing`); continue; }
        // Typing headings finish, reveal animations settle.
        await page.waitForFunction((id) => [...document.querySelectorAll(`#${id} .typing-target`)]
            .every(t => t.classList.contains('typed')), id, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(variant === 'reduced-motion' ? 200 : 1100);
        await hOverflow(`#${id}`);
        await shoot(`section-${id}`);
        cov.sections++;
    }

    await axe('page');

    if (variant === 'reduced-motion') {
        const running = await page.evaluate(() => document.getAnimations()
            .filter(a => a.playState === 'running')
            .map(a => ({ t: a.effect?.getTiming(), target: a.effect?.target, name: a.animationName || a.transitionProperty }))
            .filter(a => a.t && (a.t.iterations === Infinity || a.t.duration > 10))
            .map(a => `${a.name} on ${a.target?.id ? '#' + a.target.id : a.target?.className || a.target?.tagName}`));
        if (running.length) F('reduced-motion', `${running.length} animation(s) still running: ${[...new Set(running)].join('; ')}`);
        const cardVideos = await page.locator('.portfolio-item-video').count();
        if (cardVideos) F('reduced-motion', `${cardVideos} card preview videos created under reduced motion`);
    }

    // ── Navigation ──
    const toggle = page.locator('#navToggle');
    if (await toggle.isVisible()) {
        await toggle.click();
        const opened = await page.waitForFunction(() =>
            document.getElementById('navToggle').getAttribute('aria-expanded') === 'true'
            && [...document.querySelectorAll('#navLinks a')].every(a => {
                const r = a.getBoundingClientRect();
                return r.width > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
            }), null, { timeout: 3000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(400);
        const shot = await shoot('nav-open');
        if (!opened) F('nav', 'mobile menu did not open with every link on screen', shot);
        await page.keyboard.press('Escape');
        const closed = await page.waitForFunction(() =>
            document.getElementById('navToggle').getAttribute('aria-expanded') === 'false', null, { timeout: 2000 })
            .then(() => true).catch(() => false);
        if (!closed) F('nav', 'Escape did not close the mobile menu');
    } else {
        const offscreen = await page.evaluate(() => [...document.querySelectorAll('#navLinks a')]
            .filter(a => { const r = a.getBoundingClientRect(); return !(r.width > 0 && r.right <= innerWidth + 1); })
            .map(a => a.textContent.trim()));
        if (offscreen.length) F('nav', `nav links off screen: ${offscreen.join(', ')}`);
    }
    cov.navChecked = true;

    // ── Timeline: enter, step every slide, exit ──
    const waitFocus = (idx, timeout = 6000) => page.waitForFunction(
        (idx) => { const s = window.__timelineState(); return s.settled && s.idx === idx ? s : false; },
        idx, { timeout, polling: 'raf' }).then(() => true).catch(() => false);
    await page.evaluate(`window.__timelineState = ${timelineState.toString()}`);
    const state = () => page.evaluate(() => window.__timelineState());

    // Every Tab stop inside the timeline must be something you can see.
    const checkTabStops = async (where) => {
        const seen = new Set();
        for (let t = 0; t < 30; t++) {
            await page.keyboard.press('Tab');
            const f = await page.evaluate(() => {
                const el = document.activeElement;
                if (!el || el === document.body) return null;
                let op = 1;
                for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
                const r = el.getBoundingClientRect();
                const label = el.id ? '#' + el.id : `${el.tagName.toLowerCase()}.${el.className}`;
                const key = label + '|' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30));
                const state = `body.${document.body.className.replace(/ /g, '.') || '-'} header.inert=${document.querySelector('header')?.inert}`;
                return { key, label, state, visible: op > 0.5 && getComputedStyle(el).visibility !== 'hidden'
                    && r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth };
            });
            if (!f) continue;
            if (seen.has(f.key)) break;        // wrapped around
            seen.add(f.key);
            if (!f.visible) F('focus-hidden', `${where}: Tab reached ${f.key.replace('|', ' ')}, which is not visible (${f.state})`);
        }
        cov.tabStops = (cov.tabStops || 0) + seen.size;
        if (!seen.size) F('tested-nothing', `${where}: Tab reached nothing`);
    };

    const exitTimeline = async (how) => {
        await page.keyboard.press('Escape');
        const ok = await page.waitForFunction(() => !document.body.classList.contains('timeline-immersive')
            && getComputedStyle(document.documentElement).overflow !== 'hidden', null, { timeout: 3000 })
            .then(() => true).catch(() => false);
        if (!ok) F('timeline-exit', `Escape did not leave the timeline (${how})`);
        // Focus is handed back a couple of frames after exit.
        await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body
            && !document.activeElement.closest('#projectStage, #cvExit, #cvProjectNav'), null, { timeout: 1000, polling: 'raf' }).catch(() => {});
        return ok;
    };

    // Enter by keyboard, as a keyboard user would.
    await page.locator('#cvEnter').focus();
    await page.keyboard.press('Enter');
    if (!(await waitFocus(0))) {
        const s = await state();
        F('timeline-enter', `"Enter the time machine" did not settle on slide 0 (state ${JSON.stringify(s)})`, await shoot('enter-failed'));
    } else {
        for (let i = 0; i < expect.slides; i++) {
            if (!(await waitFocus(i))) {
                const s = await state();
                F('slide-sequence', `ArrowDown did not land on slide ${i} (state ${JSON.stringify(s)})`, await shoot(`slide-${i}-missing`));
                break;
            }
            // Topic slides stagger their bullets in; wait until all are fully shown.
            await page.waitForFunction((i) => [...document.querySelectorAll(`.project-slide[data-idx="${i}"] .topic-highlights li`)]
                .every(li => li.classList.contains('highlight-visible') && parseFloat(getComputedStyle(li).opacity) > 0.98),
            i, { timeout: 4000 }).catch(() => {});
            const fit = await page.evaluate(checkSlideFits, i);
            const hud = await page.evaluate(() => /^\d{4}$/.test(document.getElementById('tmYear')?.textContent.trim()));
            const label = expect.slideLabels[i];
            const shot = await shoot(`slide-${String(i).padStart(2, '0')}`);
            if (!fit.checked) F('tested-nothing', `slide ${i} (${label}): no visible elements checked`, shot);
            for (const is of fit.issues) {
                const code = is.kind === 'overflow' ? 'slide-overflow' : is.kind === 'clipped' ? 'slide-clipped' : 'slide-overlap';
                F(code, `slide ${i} (${label}): ${is.el} ${is.kind === 'overflow' ? `at [${is.rect}]`
                    : is.kind === 'clipped' ? `hides ${is.px}px of text` : `under ${is.with}`}`, shot);
            }
            if (!hud) F('timeline-hud', `slide ${i}: time-machine year not shown`, shot);
            const a11y = await page.evaluate(i => {
                const reachable = [...document.querySelectorAll('.project-slide')].filter(s => !s.inert).map(s => +s.dataset.idx);
                const dots = [...document.querySelectorAll('#cvProjectNav .nav-dot')];
                return {
                    announce: document.getElementById('cvAnnounce')?.textContent || '',
                    reachable,
                    current: dots.findIndex(d => d.getAttribute('aria-current')),
                    inside: !!document.activeElement?.closest('#cvSection'),
                    pageInert: ['header', 'footer', '#hero', '#about', '#portfolio', '#contact', '#cvIntro']
                        .filter(sel => document.querySelector(sel) && !document.querySelector(sel).inert),
                };
            }, i);
            if (!a11y.announce.startsWith(`Slide ${i + 1} of ${expect.slides}`)) F('a11y-announce', `slide ${i}: live region says "${a11y.announce}"`);
            if (a11y.reachable.length !== 1 || a11y.reachable[0] !== i) F('a11y-inert', `slide ${i}: slides reachable by assistive tech: [${a11y.reachable}]`);
            if (a11y.current !== expect.slideProject[i]) F('a11y-current', `slide ${i}: aria-current on dot ${a11y.current}, expected ${expect.slideProject[i]}`);
            if (i === 0 && !a11y.inside) F('a11y-focus', 'entering the timeline did not move focus into it');
            if (a11y.pageInert.length) F('a11y-inert', `slide ${i}: page parts still reachable behind the timeline: ${a11y.pageInert.join(', ')}`);
            if (i === 0 || i === 1) await checkTabStops(`slide ${i}`);
            await axe(`slide ${i}`, '#cvSection');
            cov.slides++;
            if (i < expect.slides - 1) await page.keyboard.press('ArrowDown');
        }
        await page.keyboard.press('Home');
        if (!(await waitFocus(0))) F('slide-sequence', 'Home did not return to slide 0');
        if (await exitTimeline('after stepping')) {
            const back = await page.evaluate(() => document.activeElement?.id);
            if (back !== 'cvEnter') F('a11y-focus', `leaving the timeline left focus on "${back || document.activeElement?.tagName}", not the button that opened it`);
        }
    }

    // ── Warp jumps: every portfolio card ──
    for (const [k, card] of expect.cards.entries()) {
        await page.evaluate(() => document.getElementById('portfolio').scrollIntoView({ behavior: 'instant' }));
        const loc = page.locator(`#item-${card.id}`);
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        // A click that can't land is a finding, not a crash: record what sat
        // on top of the card (Playwright's reason + elementFromPoint) and move on.
        const clicked = await loc.click({ timeout: 8000 }).then(() => true).catch(async e => {
            const box = await loc.boundingBox().catch(() => null);
            const onTop = box && await page.evaluate(({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                return el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).trim().replace(/\s+/g, '.')) : 'nothing';
            }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
            const why = String(e.message).split('\n').filter(l => /intercepts|not visible|not stable|outside|detached|waiting/.test(l)).slice(-2).join(' | ');
            const body = await page.evaluate(() => document.body.className);
            F('warp-click', `card ${card.id}: click did not land (${why || 'timeout'}); at card centre: ${onTop}; body.${body || '-'}`, await shoot(`warp-${card.id}-click`));
            return false;
        });
        if (!clicked) {
            if ((await state()).immersive) await exitTimeline(`card ${card.id} after failed click`);
            continue;
        }
        if (k === 0 && variant !== 'reduced-motion') {
            await page.waitForFunction(() => document.body.classList.contains('timeline-warping'), null, { timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(250);
            await shoot('warp-mid');
        }
        if (card.targetIdx < 0) {
            await page.waitForTimeout(1500);
            const s = await state();
            if (!s.immersive) F('warp-noop', `card ${card.id}: clicking does nothing (no timeline entry and no timelineTarget)`);
            else if (!(await exitTimeline(`card ${card.id}`))) break;
            continue;
        }
        if (!(await waitFocus(card.targetIdx))) {
            const s = await state();
            F('warp-target', `card ${card.id}: expected slide ${card.targetIdx} (${expect.slideLabels[card.targetIdx]}), state ${JSON.stringify(s)}`, await shoot(`warp-${card.id}-failed`));
        } else {
            cov.warps++;
        }
        if (!(await exitTimeline(`card ${card.id}`))) break;
        const back = await page.evaluate(() => document.activeElement?.id);
        if (back !== `item-${card.id}`) F('a11y-focus', `card ${card.id}: focus after leaving is on "${back}", not the card`);
    }

    // ── The CV nav link is the third entry point ──
    if (await toggle.isVisible()) await toggle.click();
    await page.locator('#navLinks a[data-scroll-to="cv"]').click();
    if (!(await waitFocus(0))) {
        const diag = await page.evaluate(() => ({
            state: window.__timelineState(),
            body: document.body.className,
            menu: document.getElementById('navToggle')?.getAttribute('aria-expanded'),
            link: (() => { const a = document.querySelector('#navLinks a[data-scroll-to="cv"]'); const r = a?.getBoundingClientRect(); return r ? `${Math.round(r.x)},${Math.round(r.y)} ${getComputedStyle(a).visibility}` : 'missing'; })(),
            focus: document.activeElement?.id || document.activeElement?.tagName,
        }));
        F('timeline-enter', `CV nav link did not enter the timeline at slide 0 (${JSON.stringify(diag)})`, await shoot('nav-cv-failed'));
    }
    else await exitTimeline('nav link');

    if (variant === 'reduced-motion') {
        const seen = await page.evaluate(() => window.__walk.warpSeen);
        if (seen) F('reduced-motion', 'warp-jump transition ran under reduced motion');
    }

    if (variant === 'default' && vp === viewports[0]) expect.refs = await page.evaluate(collectRefs);
    await ctx.close();
}

// ── 404 page ─────────────────────────────────────────────────────────────────
// GitHub Pages answers a missing path at any depth with /404.html, so the page
// must work from a deep URL (root-absolute assets) — the test server mimics it.

async function walk404(browser, base, cache, vp) {
    const [w, h] = vp.split('x').map(Number);
    const phone = Math.min(w, h) <= 430;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
    await ctx.route(url => !url.href.startsWith(base), r => cache.handleRoute(r));
    const page = await ctx.newPage();
    const F = (code, msg, shot) => fail('404', vp, code, msg, shot);
    const deepUrl = base + 'no/such/deep/page';
    page.on('console', m => {
        if (!['error', 'warning'].includes(m.type()) || BROWSER_NOISE.some(re => re.test(m.text()))) return;
        // Chrome logs the document's own 404 status; that one is the point.
        if (m.location()?.url === deepUrl && /status of 404/.test(m.text())) return;
        F('console-error', m.text());
    });
    page.on('pageerror', e => F('page-error', e.message));
    const failed = [];
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400 && r.request().resourceType() !== 'document') failed.push(`${r.status()} ${r.url().slice(base.length)}`); });
    const res = await page.goto(deepUrl, { waitUntil: 'networkidle' });
    const dir = path.join(OUT, '404', vp);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, '00-not-found.jpg');
    await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
    const shot = path.relative(OUT, file);
    shots.push({ variant: '404', vp, label: 'not-found', file: shot });
    if (res.status() !== 404) F('404', `missing path answered ${res.status()}, expected 404`, shot);
    const info404 = await page.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent.trim() || '',
        home: !!document.querySelector('a[href="/"]'),
        overflow: document.documentElement.scrollWidth - innerWidth,
        fontsOk: [...document.fonts].some(f => f.status === 'loaded'),
    }));
    if (!info404.h1) F('404', 'no heading on the 404 page', shot);
    if (!info404.home) F('404', 'no link back to "/" on the 404 page', shot);
    if (info404.overflow > 0) F('h-overflow', `404 page scrolls horizontally by ${info404.overflow}px`, shot);
    if (!info404.fontsOk) F('404', 'web fonts did not load from a deep URL (relative asset paths?)', shot);
    for (const f of failed) F('404', `asset failed from a deep URL: ${f}`, shot);
    if (AXE_VIEWPORTS.includes(vp)) {
        await page.addScriptTag({ path: AXE_PATH });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }))
            .violations.filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => x.id));
        for (const id of v) F('axe', `404 page: ${id}`, shot);
    }
    await ctx.close();
}

// ── Transfer budget ──────────────────────────────────────────────────────────

async function measureBudget(vp, base, cache, requests) {
    const by = { total: 0, script: 0, font: 0, stylesheet: 0, image: 0, document: 0, other: 0 };
    for (const r of requests) {
        const type = r.resourceType();
        if (type === 'media') continue;    // lazy video is outside the budget
        let bytes;
        if (r.url().startsWith(base)) {
            const s = await r.sizes().catch(() => null);
            bytes = s ? s.responseBodySize + s.responseHeadersSize : 0;
        } else {
            bytes = cache.transferBytesOf(r.url()) || 0;  // real compressed size, from the fill
        }
        const key = type in by ? type : 'other';
        by[key] += bytes;
        by.total += bytes;
    }
    const kib = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)]));
    budgets.push({ vp, kib });
    for (const [k, limit] of Object.entries(BUDGET_KIB)) {
        if (kib[k] > limit) fail('default', vp, 'budget', `initial load ${k}: ${kib[k]} KiB > budget ${limit} KiB`);
    }
}

// ── Links ────────────────────────────────────────────────────────────────────

function headStatus(url) {
    return new Promise((resolve) => {
        http.request(url, { method: 'HEAD' }, res => { res.resume(); resolve(res.statusCode); })
            .on('error', () => resolve(0)).end();
    });
}

async function checkLinks(base, refs, projects) {
    // Everything projects.json points at, whether or not the page rendered it.
    const fromData = [];
    for (const p of projects) {
        for (const k of ['image', 'poster', 'video', 'cardVideo']) if (p[k]) fromData.push({ kind: 'src', v: p[k], where: `projects.json ${p.id}.${k}` });
        (p.workTopics || []).forEach((t, i) => t.image && fromData.push({ kind: 'src', v: t.image, where: `projects.json ${p.id}.workTopics[${i}].image` }));
        (p.links || []).forEach(l => fromData.push({ kind: 'href', v: l.href, where: `projects.json ${p.id}.links` }));
    }
    const all = [...refs, ...fromData];
    const seen = new Set();
    let checked = 0;
    const external = [];
    for (const ref of all) {
        const v = ref.v.trim();
        if (/^(mailto|tel|javascript|data|blob):/i.test(v)) {
            if (/^(mailto|tel):/i.test(v)) fail('default', '-', 'publishing-rule', `${v} found (${ref.where}) — no email or phone on the site`);
            continue;
        }
        if (v.startsWith('#')) {
            if (seen.has(v)) continue;
            seen.add(v);
            checked++;
            const id = decodeURIComponent(v.slice(1));
            if (id && !anchorIds.has(id)) fail('default', '-', 'broken-anchor', `${v} (${ref.where}) has no target`);
            continue;
        }
        let abs = new URL(v, base).href;
        if (abs.startsWith(CANONICAL)) abs = base + abs.slice(CANONICAL.length);
        if (seen.has(abs)) continue;
        seen.add(abs);
        if (abs.startsWith(base)) {
            checked++;
            const st = await headStatus(abs.split('#')[0]);
            if (st !== 200 && st !== 206) fail('default', '-', 'broken-link', `${v} → ${st} (${ref.where})`);
        } else {
            external.push({ abs, where: ref.where });
        }
    }
    if (!SKIP_EXTERNAL) {
        for (const { abs, where } of external) {
            checked++;
            const host = new URL(abs).host;
            const { code, body } = await cachedStatus(abs);
            const allowed = BOT_BLOCKING[host] || [];
            if (code === 403 && SANDBOX_BLOCK.test(body)) { info.push(`external ${abs} → unverifiable (sandbox proxy blocks it)`); continue; }
            if (code >= 200 && code < 400) continue;
            if (allowed.includes(code)) { info.push(`external ${abs} → ${code} (bot-blocking host, accepted)`); continue; }
            fail('default', '-', 'external-link', `${abs} → ${code || 'unreachable'} (${where})`);
        }
    }
    return checked;
}

let anchorIds = new Set();   // filled from the rendered DOM before checkLinks runs

// A link that answered 2xx/3xx in the last 24 h is not fetched again: some
// hosts (dspace.com) are slow and rate-limit repeat requests, which made the
// check flaky. Failures are never cached — they are always rechecked.
const LINK_CACHE = path.join(HERE, '.cache', 'links.json');
const LINK_TTL_MS = 24 * 3600 * 1000;
async function cachedStatus(url) {
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(LINK_CACHE, 'utf8')); } catch { /* first run */ }
    const hit = cache[url];
    if (hit && Date.now() - hit.at < LINK_TTL_MS) { info.push(`external ${url} → ${hit.code} (cached ${new Date(hit.at).toISOString()})`); return { code: hit.code, body: '' }; }
    const res = await curlStatus(url);
    if (res.code >= 200 && res.code < 400) {
        cache[url] = { code: res.code, at: Date.now() };
        fs.mkdirSync(path.dirname(LINK_CACHE), { recursive: true });
        fs.writeFileSync(LINK_CACHE, JSON.stringify(cache, null, 2));
    }
    return res;
}

// Status plus the start of the body (to recognise the sandbox proxy's refusals).
async function curlStatus(url) {
    const parse = out => {
        const m = /\n?(\d{3})$/.exec(out);
        return { code: m ? Number(m[1]) : 0, body: out.slice(0, 2000) };
    };
    try {
        // --retry covers timeouts, 5xx and 429 (honouring Retry-After); not 4xx.
        const { stdout } = await run('curl', ['-sS', '-L', '--max-time', '60',
            '--retry', '4', '--retry-delay', '5', '--retry-max-time', '240',
            '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
            '-w', '\n%{http_code}', url], { maxBuffer: 32 << 20 });
        return parse(stdout.trimEnd());
    } catch (e) {
        return parse(String(e.stdout || '').trimEnd());
    }
}

// ── Head metadata, robots, sitemap (QUALITY.md §4) ───────────────────────────

function jpegOrPngSize(buf) {
    if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        for (let i = 2; i < buf.length;) {
            if (buf[i] !== 0xff) { i++; continue; }
            const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
            if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: 'jpeg' };
            i += 2 + len;
        }
    }
    return null;
}

async function checkHead(page, base) {
    const head = await page.evaluate(() => {
        const m = sel => document.querySelector(sel)?.getAttribute('content')?.trim() || '';
        return {
            description: m('meta[name="description"]'),
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
            og: Object.fromEntries(['type', 'site_name', 'url', 'title', 'description', 'image', 'image:width', 'image:height', 'image:alt']
                .map(k => [k, m(`meta[property="og:${k}"]`)])),
            tw: Object.fromEntries(['card', 'title', 'description', 'image'].map(k => [k, m(`meta[name="twitter:${k}"]`)])),
        };
    });
    const H = msg => fail('-', '-', 'metadata', msg);
    if (head.description.length < 50) H(`meta description missing or too short (${head.description.length} chars)`);
    if (head.canonical !== CANONICAL) H(`canonical is "${head.canonical}", expected ${CANONICAL}`);
    for (const [k, v] of Object.entries(head.og)) if (!v) H(`og:${k} missing`);
    for (const [k, v] of Object.entries(head.tw)) if (!v) H(`twitter:${k} missing`);
    if (head.og.url && head.og.url !== CANONICAL) H(`og:url is "${head.og.url}", expected ${CANONICAL}`);
    for (const img of new Set([head.og.image, head.tw.image].filter(Boolean))) {
        if (!img.startsWith(CANONICAL)) { H(`${img}: preview images must be absolute on ${CANONICAL}`); continue; }
        const res = await fetch(base + img.slice(CANONICAL.length));
        if (!res.ok) { H(`${img} → ${res.status} locally`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        const size = jpegOrPngSize(buf);
        if (!size) H(`${img}: not a JPEG or PNG`);
        else if (size.w !== 1200 || size.h !== 630) H(`${img}: ${size.w}×${size.h}, expected 1200×630`);
        else if (+head.og['image:width'] !== size.w || +head.og['image:height'] !== size.h) H(`og:image:width/height (${head.og['image:width']}×${head.og['image:height']}) disagree with the file (${size.w}×${size.h})`);
        if (buf.length > 300 * 1024) H(`${img}: ${Math.round(buf.length / 1024)} KiB, over 300 KiB`);
    }
    // Icons: manifest icons exist at their declared sizes; files stay small.
    const I = msg => fail('-', '-', 'icons', msg);
    const iconLinks = await page.evaluate(() => ({
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
        apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
        ico: document.querySelector('link[rel="icon"][href$=".ico"]')?.getAttribute('href'),
    }));
    const local = u => base + String(u).replace(/^\//, '');
    const getBuf = async u => { const r = await fetch(local(u)); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
    if (!iconLinks.ico) I('no .ico favicon linked');
    else { const b = await getBuf(iconLinks.ico); if (!b) I(`${iconLinks.ico} missing`); else if (b.length > 15 * 1024) I(`${iconLinks.ico}: ${Math.round(b.length / 1024)} KiB > 15 KiB`); }
    if (!iconLinks.apple) I('no apple-touch-icon linked');
    else { const b = await getBuf(iconLinks.apple); const sz = b && jpegOrPngSize(b);
        if (!sz || sz.w !== 180 || sz.h !== 180) I(`${iconLinks.apple}: expected a 180×180 image, got ${sz ? sz.w + '×' + sz.h : 'nothing'}`); }
    let manifest = null;
    try { manifest = JSON.parse((await getBuf(iconLinks.manifest || 'missing'))?.toString() || ''); } catch { I(`manifest ${iconLinks.manifest} missing or not JSON`); }
    if (manifest) {
        const declared = (manifest.icons || []).map(i => i.sizes);
        for (const need of ['192x192', '512x512']) if (!declared.includes(need)) I(`manifest has no ${need} icon`);
        for (const icon of manifest.icons || []) {
            const b = await getBuf(icon.src); const sz = b && jpegOrPngSize(b);
            if (!sz) { I(`manifest icon ${icon.src} missing`); continue; }
            if (`${sz.w}x${sz.h}` !== icon.sizes) I(`manifest icon ${icon.src}: file is ${sz.w}x${sz.h}, declared ${icon.sizes}`);
            if (b.length > 30 * 1024) I(`manifest icon ${icon.src}: ${Math.round(b.length / 1024)} KiB > 30 KiB`);
        }
    }

    const robots = await (await fetch(base + 'robots.txt')).text().catch(() => '');
    if (!robots.includes(`Sitemap: ${CANONICAL}sitemap.xml`)) H('robots.txt missing or does not name the sitemap');
    const sitemap = await fetch(base + 'sitemap.xml');
    const sm = sitemap.ok ? await sitemap.text() : '';
    if (!sm.includes(`<loc>${CANONICAL}</loc>`)) H('sitemap.xml missing or does not list the canonical URL');
}

// ── Placeholder markers ──────────────────────────────────────────────────────
// projects.json marks every placeholder field in a per-project `placeholders`
// map ({ "workTopics[0].image": "what real content is needed" }), so they can
// be found and replaced (Docs/STATUS.md "Placeholder register").

// ── Responsive images (tools/make-responsive.py convention) ─────────────────

const RASTER = /\.(webp|jpe?g|png)$/i;
function projectImages(projects) {
    const out = [];
    for (const p of projects) {
        for (const k of ['image', 'poster']) if (p[k]) out.push([`${p.id}.${k}`, p[k]]);
        (p.workTopics || []).forEach((t, i) => t.image && out.push([`${p.id}.workTopics[${i}].image`, t.image]));
    }
    return out;
}
async function checkResponsive(base, projects) {
    let checked = 0;
    for (const [where, img] of projectImages(projects)) {
        if (!RASTER.test(img)) continue;
        for (const w of [480, 960]) {
            checked++;
            const variant = img.replace(RASTER, `-${w}.webp`);
            if ((await headStatus(base + variant)) !== 200) fail('-', '-', 'responsive', `${where}: ${img} has no ${variant} (run tools/make-responsive.py)`);
        }
    }
    return checked;
}

function checkPlaceholders(projects) {
    const get = (obj, p) => p.split('.').reduce((o, k) => {
        const m = /^(\w+)\[(\d+)\]$/.exec(k);
        return o == null ? undefined : m ? o[m[1]]?.[Number(m[2])] : o[k];
    }, obj);
    let marked = 0;
    for (const p of projects) {
        for (const [field, need] of Object.entries(p.placeholders || {})) {
            marked++;
            if (get(p, field) == null) fail('-', '-', 'placeholder-data', `${p.id}.${field} is marked as placeholder but does not exist`);
            if (!String(need).trim()) fail('-', '-', 'placeholder-data', `${p.id}.${field}: marker says nothing about the real content needed`);
        }
        const assetFields = [['image', p.image], ['poster', p.poster], ['video', p.video], ['cardVideo', p.cardVideo],
            ...(p.workTopics || []).map((t, i) => [`workTopics[${i}].image`, t.image])];
        for (const [field, v] of assetFields) {
            if (v && v.startsWith('assets/placeholders/') && !(p.placeholders || {})[field]) {
                fail('-', '-', 'placeholder-data', `${p.id}.${field} uses ${v} but is not marked in "placeholders"`);
            }
        }
    }
    return marked;
}

// ── Contact sheet ────────────────────────────────────────────────────────────

function writeContactSheet(report) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = (list) => list.map(f => `<tr class="${f.known ? 'known' : ''}"><td>${esc(f.variant)}</td><td>${esc(f.vp)}</td><td>${esc(f.code)}</td><td>${esc(f.message)}${f.known ? ` <em>(known: ${esc(f.known)})</em>` : ''}</td><td>${f.shot ? `<a href="${esc(f.shot)}">shot</a>` : ''}</td></tr>`).join('');
    let body = `<h1>Site walk — ${esc(report.when)}</h1>
<p class="${report.unexpected.length ? 'bad' : 'good'}">${report.unexpected.length ? `${report.unexpected.length} unexpected failure(s)` : 'No unexpected failures'} · ${report.known.length} known · ${shots.length} screenshots</p>
${report.unexpected.length ? `<h2>Unexpected failures</h2><table>${rows(report.unexpected)}</table>` : ''}
${report.known.length ? `<details><summary>Known failures (${report.known.length})</summary><table>${rows(report.known)}</table></details>` : ''}
${budgets.length ? `<h2>Initial-load transfer (KiB, video excluded)</h2><table><tr><th>viewport</th>${Object.keys(budgets[0].kib).map(k => `<th>${k}</th>`).join('')}</tr>${budgets.map(b => `<tr><td>${b.vp}</td>${Object.values(b.kib).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</table>` : ''}`;
    for (const variant of [...variants, '404']) {
        body += `<h2>${esc(variant)}</h2>`;
        for (const vp of viewports) {
            const list = shots.filter(s => s.variant === variant && s.vp === vp);
            if (!list.length) continue;
            body += `<h3>${vp}</h3><div class="row">${list.map(s => `<a href="${esc(s.file)}" title="${esc(s.label)}"><img loading="lazy" src="${esc(s.file)}" alt="${esc(s.label)}"><span>${esc(s.label)}</span></a>`).join('')}</div>`;
        }
    }
    fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site walk</title>
<style>body{font:14px system-ui,sans-serif;margin:16px;background:#111;color:#ddd}a{color:#9cf}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #333;padding:4px 8px;text-align:left;vertical-align:top}.known{opacity:.6}.bad{color:#f88;font-weight:bold}.good{color:#8f8;font-weight:bold}.row{display:flex;flex-wrap:wrap;gap:8px}.row a{display:flex;flex-direction:column;width:150px;font-size:11px;text-decoration:none}.row img{width:150px;height:110px;object-fit:contain;background:#000;border:1px solid #333}</style>
${body}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    const { base, close } = await startServer({ root: ROOT, transform: SELF_TEST ? selfTestTransform : null });
    const cache = createThirdPartyCache({ dir: path.join(HERE, '.cache', 'thirdparty'), offline: !!args.offline });

    // What the page should contain, derived from projects.json as served.
    const projects = await (await fetch(base + 'projects.json')).json();
    const timeline = projects.filter(p => p.showInTimeline)
        .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
    const heroIdx = {};
    const topicIdx = {};
    const slideLabels = [];
    const slideProject = [];
    for (const [pi, p] of timeline.entries()) {
        slideProject.push(pi, ...(p.workTopics || []).map(() => pi));
        heroIdx[p.id] = slideLabels.length;
        slideLabels.push(`${p.id} hero`);
        (p.workTopics || []).forEach(t => { topicIdx[`${p.id}/${t.title}`] = slideLabels.length; slideLabels.push(`${p.id}: ${t.title}`); });
    }
    // Where a card's warp jump must land: its own hero slide, or the slide its
    // timelineTarget names (independent re-implementation of timeline.js).
    const landing = p => heroIdx[p.id] ?? (p.timelineTarget
        ? (p.timelineTarget.topic ? topicIdx[`${p.timelineTarget.project}/${p.timelineTarget.topic}`] : heroIdx[p.timelineTarget.project])
        : undefined) ?? -1;
    const expect = {
        cards: projects.filter(p => p.showInPortfolio).map(p => ({ id: p.id, targetIdx: landing(p) })),
        slides: slideLabels.length,
        slideLabels,
        slideProject,
        contentTitles: projects.filter(p => p.showInPortfolio || p.showInTimeline).map(p => p.title),
        refs: [],
    };

    const marked = checkPlaceholders(projects);
    info.push(`responsive variants checked: ${await checkResponsive(base, projects)}`);
    // Images only the timeline uses must not load with the page (B6).
    const cardImages = new Set(projects.filter(p => p.showInPortfolio).flatMap(p => [p.image, p.poster]));
    expect.timelineOnly = [...new Set(projectImages(projects).map(([, v]) => v))].filter(v => !cardImages.has(v));
    info.push(`placeholder fields marked in projects.json: ${marked}`);

    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ['--enable-unsafe-swiftshader'],   // software WebGL for the starfield in headless
    });

    const jobs = [];
    for (const variant of variants) for (const vp of viewports) jobs.push([variant, vp]);
    const t0 = Date.now();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (next < jobs.length) {
            const [variant, vp] = jobs[next++];
            const t = Date.now();
            try {
                await walkViewport(browser, base, cache, variant, vp, expect);
            } catch (e) {
                fail(variant, vp, 'walk-crashed', e.message.split('\n')[0]);
            }
            console.log(`  ${variant.padEnd(14)} ${vp.padEnd(9)} ${((Date.now() - t) / 1000).toFixed(0)}s`);
        }
    }));

    if (variants.includes('default')) {
        for (const vp of viewports) await walk404(browser, base, cache, vp);
    }

    // Anchors resolve against the real DOM ids.
    if (variants.includes('default')) {
        const ctx = await browser.newContext();
        await ctx.route(url => !url.href.startsWith(base), r => cache.handleRoute(r));
        const page = await ctx.newPage();
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForSelector('#projectStage .project-slide', { timeout: 10000 }).catch(() => {});
        anchorIds = new Set(await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e => e.id)));
        await checkHead(page, base);
        await ctx.close();
        const linksChecked = await checkLinks(base, expect.refs, projects);
        if (!expect.refs.length) fail('default', '-', 'tested-nothing', 'no references collected from the page');
        info.push(`links checked: ${linksChecked}${SKIP_EXTERNAL ? ' (external skipped)' : ''}`);
    }
    await browser.close();
    await close();

    for (const [url, entry] of cache.log) {
        if (entry.status === 0) fail('-', '-', 'thirdparty-failed', `${url}: ${entry.error}`);
    }

    // Coverage: a walk that visited nothing has not passed.
    for (const [key, c] of Object.entries(coverage)) {
        const [variant, vp] = key.split(' ');
        if (c.sections !== SECTIONS.length) fail(variant, vp, 'tested-nothing', `visited ${c.sections}/${SECTIONS.length} sections`);
        if (variant === 'no-js') continue;
        if (c.slides !== expect.slides) fail(variant, vp, 'tested-nothing', `checked ${c.slides}/${expect.slides} slides`);
        const reachable = expect.cards.filter(c => c.targetIdx >= 0).length;
        if (c.warps !== reachable) fail(variant, vp, 'tested-nothing', `${c.warps}/${reachable} warp jumps landed`);
    }

    // Known failures: real bugs already scheduled in Docs/STATUS.md.
    const knownList = SELF_TEST ? [] : JSON.parse(fs.readFileSync(path.join(HERE, 'known-failures.json'), 'utf8'));
    const used = new Set();
    for (const f of failures) {
        const k = knownList.find(k => k.code === f.code && (!k.match || new RegExp(k.match).test(f.message))
            && (!k.variants || k.variants.includes(f.variant)));
        if (k) { f.known = k.unit; used.add(k); }
    }
    const unexpected = failures.filter(f => !f.known);
    const known = failures.filter(f => f.known);
    const full = !args.viewports && !args.quick && !args.variants;
    const stale = full ? knownList.filter(k => !used.has(k)) : [];

    const report = { when: new Date().toISOString(), viewports, variants, coverage, budgets, unexpected, known, stale, info, seconds: Math.round((Date.now() - t0) / 1000) };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    writeContactSheet(report);

    // ── Summary ──
    const byCode = list => Object.entries(list.reduce((m, f) => (m[f.code] = (m[f.code] || 0) + 1, m), {}))
        .map(([c, n]) => `${c}×${n}`).join(', ');
    console.log(`\n${shots.length} screenshots, ${report.seconds}s → tests/out/index.html`);
    for (const b of budgets) console.log(`  budget ${b.vp}: ${JSON.stringify(b.kib)}`);
    const clsList = Object.entries(coverage).filter(([, c]) => c.cls !== undefined).map(([, c]) => c.cls);
    if (clsList.length) console.log(`  CLS during load: max ${Math.max(...clsList)} over ${clsList.length} walks`);
    if (known.length) console.log(`known failures: ${byCode(known)}`);
    for (const s of stale) console.log(`STALE known failure (nothing matched — remove it): ${s.code} ${s.match || ''}`);

    if (SELF_TEST) {
        const missed = Object.entries(SELF_TEST_FAULTS)
            .filter(([code, [, , re]]) => !failures.some(f => f.code === code && re.test(f.message)))
            .map(([code]) => code);
        for (const code of Object.keys(SELF_TEST_FAULTS)) {
            console.log(`  self-test ${code.padEnd(15)} ${missed.includes(code) ? 'NOT CAUGHT' : 'caught'}`);
        }
        console.log(missed.length ? 'SELF-TEST FAILED' : 'SELF-TEST PASSED');
        process.exit(missed.length ? 1 : 0);
    }

    if (unexpected.length) {
        console.log(`\nFAILED — ${unexpected.length} unexpected: ${byCode(unexpected)}`);
        for (const f of unexpected.slice(0, 40)) console.log(`  [${f.variant} ${f.vp}] ${f.code}: ${f.message}`);
        if (unexpected.length > 40) console.log(`  … ${unexpected.length - 40} more in tests/out/report.json`);
        process.exit(1);
    }
    console.log('\nPASSED');
}

main().catch(e => { console.error(e); process.exit(2); });
