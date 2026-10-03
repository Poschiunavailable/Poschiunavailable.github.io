#!/usr/bin/env node
// Writes projects.json into index.html as static HTML, so the content is there
// without JavaScript (and for crawlers and link previews). Dev-only; the
// output is committed. Run after every edit to projects.json:
//
//   node tools/render-static.mjs           rewrite index.html
//   node tools/render-static.mjs --check   exit 1 if index.html is out of date
//
// Two blocks, each between marker comments:
//   - portfolio cards, in the same markup modules/portfolio.js builds, so the
//     JS swap to the interactive cards doesn't move anything;
//   - #cvStatic, the timeline as a plain list of chapters, shown only without
//     JS (styles/nojs.css). With JS the slide timeline is built as before.
// The site walk fails if index.html has drifted from projects.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Must match modules/portfolio.js.
const CARD_SIZES = '(max-width: 600px) calc(100vw - 72px), 430px';
const RASTER = /\.(webp|jpe?g|png)$/i;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function srcsetFor(p) {
    if (!p || !RASTER.test(p)) return '';
    const base = p.replace(RASTER, '');
    return `${base}-480.webp 480w, ${base}-960.webp 960w`;
}

// Same rules as formatProjectDates() in modules/timeline.js.
function fmtMonth(s) {
    if (typeof s !== 'string') return null;
    const [y, m] = s.split('-').map(Number);
    if (!y) return null;
    return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : `${y}`;
}
function formatDates(p) {
    const start = fmtMonth(p.startDate), end = fmtMonth(p.endDate);
    if (!start && !end) return '';
    if (!start) return end;
    return `${start} — ${end || 'PRESENT'}`;
}

const timelineOf = projects => projects.filter(p => p.showInTimeline)
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

// Where a card's chapter is in the static list (its own, or its timelineTarget's).
const chapterFor = p => p.showInTimeline ? p.id : p.timelineTarget?.project;

export function renderPortfolio(projects) {
    const I = '                ';
    return projects.filter(p => p.showInPortfolio).map(p => {
        const srcset = srcsetFor(p.image);
        const tags = (p.tags || []).map(t => `<span class="portfolio-tag">${esc(t)}</span>`).join('');
        const chapter = chapterFor(p);
        return [
            `${I}<article class="portfolio-item" id="item-${esc(p.id)}">`,
            `${I}    <div class="portfolio-item-image-wrap">`,
            `${I}        <img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"${srcset ? ` srcset="${srcset}" sizes="${CARD_SIZES}"` : ''}>`,
            `${I}    </div>`,
            `${I}    <div class="portfolio-item-body">`,
            `${I}        <h3>${esc(p.title)}</h3>`,
            p.subtitle ? `${I}        <p class="portfolio-subtitle">${esc(p.subtitle)}</p>` : null,
            `${I}        <p class="portfolio-description">${esc(p.description)}</p>`,
            tags ? `${I}        <div class="portfolio-tags">${tags}</div>` : null,
            `${I}    </div>`,
            chapter ? `${I}    <a class="click-indicator" href="#cv-${esc(chapter)}">View in CV &#8594;</a>` : null,
            `${I}</article>`,
        ].filter(Boolean).join('\n');
    }).join('\n');
}

export function renderTimeline(projects) {
    const I = '                ';
    const chapters = timelineOf(projects).map(p => {
        const facts = Object.entries(p.details || {})
            .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
        const topics = (p.workTopics || []).map(t => [
            `${I}            <li>`,
            `${I}                <h4>${esc(t.title)}</h4>`,
            `${I}                <p>${esc(t.description)}</p>`,
            (t.highlights || []).length ? `${I}                <ul>${t.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : null,
            `${I}            </li>`,
        ].filter(Boolean).join('\n')).join('\n');
        const links = (p.links || [])
            .map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.text)} &#8599;</a>`).join(' ');
        return [
            `${I}<li class="cv-static-chapter" id="cv-${esc(p.id)}">`,
            `${I}    <p class="cv-static-dates">${esc(formatDates(p))}</p>`,
            `${I}    <h3>${esc(p.title)}</h3>`,
            p.subtitle ? `${I}    <p class="cv-static-subtitle">${esc(p.subtitle)}</p>` : null,
            `${I}    <p>${esc(p.timelineDescription || p.description)}</p>`,
            facts ? `${I}    <dl class="cv-static-facts">${facts}</dl>` : null,
            topics ? `${I}    <ul class="cv-static-topics">\n${topics}\n${I}    </ul>` : null,
            links ? `${I}    <p class="cv-static-links">${links}</p>` : null,
            `${I}</li>`,
        ].filter(Boolean).join('\n');
    }).join('\n');
    return `${I}<ol class="cv-static" id="cvStatic" aria-label="Career timeline">\n${chapters}\n${I}</ol>`;
}

const BLOCKS = {
    portfolio: renderPortfolio,
    timeline: renderTimeline,
};

// Replace the content between <!-- static:NAME --> and <!-- /static:NAME -->.
export function applyStatic(html, projects) {
    let out = html;
    for (const [name, render] of Object.entries(BLOCKS)) {
        const re = new RegExp(`(<!-- static:${name} -->\\n)[\\s\\S]*?(\\n\\s*<!-- /static:${name} -->)`);
        if (!re.test(out)) throw new Error(`index.html has no <!-- static:${name} --> … <!-- /static:${name} --> markers`);
        out = out.replace(re, (_, open, close) => `${open}${render(projects)}${close}`);
    }
    return out;
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const indexPath = path.join(root, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const projects = JSON.parse(fs.readFileSync(path.join(root, 'projects.json'), 'utf8'));
    const next = applyStatic(html, projects);
    if (process.argv.includes('--check')) {
        if (next !== html) { console.error('index.html is out of date with projects.json — run: node tools/render-static.mjs'); process.exit(1); }
        console.log('index.html matches projects.json');
    } else {
        fs.writeFileSync(indexPath, next);
        console.log(next === html ? 'index.html already up to date' : 'index.html updated from projects.json');
    }
}
