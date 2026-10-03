# STATUS

The working state of the site: what is being done now, what comes next, which
content is placeholder, and why things were decided. Quality bars and how they
are measured live in [QUALITY.md](QUALITY.md); the repo map lives in
[AGENTS.md](../AGENTS.md).

Branch: work happens on `prototype`. `main` is what GitHub Pages serves and is
only merged into with Patrick's go-ahead.

---

## Current unit

| | |
|---|---|
| **Unit** | U8 — Cold Comfort card does nothing |
| **Phase** | A |
| **Goal** | Every portfolio card's "View in CV →" lands somewhere meaningful. Cold Comfort has a card but no timeline entry of its own; its prototype is a topic slide of the Freelance entry. |
| **Acceptance check** | Clicking the Cold Comfort card warp-jumps to the "Cold Comfort — Prototype" slide; the target comes from data (`projects.json`), not a special case in code; the walk asserts each card lands on its expected slide (hero or data-defined target); `warp-noop` known failure removed; full walk reports no stale entries. |
| **Files** | `projects.json`, `modules/timeline.js`, `tests/site-walk.mjs`, `tests/known-failures.json`, `AGENTS.md`, `Docs/STATUS.md` |
| **Step reached** | Not started. |

### U7 — Placeholder art and markers (done 2026-10-03, `be85251` + hero tweak)

Four labelled SVG placeholders in `assets/placeholders/` replace the borrowed
art on the Cologne Game Lab card, hero and topic slides. `projects.json`
marks 14 placeholder fields in per-project `placeholders` maps; the walk
enforces both directions (self-test 6/6). Full walk PASSED; Lighthouse median
perf 97 / a11y 100, LCP 2.26 s, CLS 0. Screenshot review found the hero
placeholder repeating the slide title at full size right above the title
panel; its label now sits small in the upper band (re-verified with a
2-viewport walk, screenshots checked at 1920×1080 and 375×667).

### U6 — three.js vendored (done 2026-10-03, `f977913`)

`modules/vendor/three-0.151.3.module.min.js` (provenance: HISTORY.md
"three.js"); `es-module-shims` dropped; the page requests nothing from a
third-party origin (offline walk, empty cache). Walk PASSED; script
272 → 179 KiB; initial load **518 KiB at 375×812 — under the 600 KiB budget**;
746 KiB at 1920×1080 (images 462 KiB are what's left: B6). Lighthouse median:
**Performance 97, Accessibility 100, BP 100, SEO 100; FCP 1.2 s, LCP 2.11 s,
CLS 0, TBT 124 ms**. Starfield and mid-warp frames checked by eye.

### U5 — Self-hosted fonts, no `@import` (done 2026-10-03, `928a474`)

Fonts in `assets/fonts/` (provenance: HISTORY.md "Fonts"), `styles/fonts.css`
with metric-matched fallbacks, all three preloaded; no `@import` left.
Computed-style diff over 442 elements × 4 states × 2 viewports: only the two
explained differences. **Lighthouse median of 3: Performance 97, Accessibility
100, BP 100, SEO 100; FCP 1.3 s, LCP 2.26 s, CLS 0, TBT 160 ms** — all
Lighthouse bars in QUALITY.md met. Font CSS gone from `render-blocking-insight`
(only the site's own 10 small stylesheets remain). Walk: fonts 114 → 80 KiB,
CSS 24 → 17 KiB; CLS during load 0 at every viewport (0.0008 before, all font
swap). Typefaces unchanged in screenshots.

Walk change in this unit: CLS measured (self-test fault #5); external links
retry with backoff and cache passes for 24 h, because dspace.com answers in up
to 30 s and rate-limits repeats (one full run reported it "unreachable"; three
manual retries gave 200 / timeout / 429).

### U4 — CTA contrast (done 2026-10-03, `31b1ef2`)

`.cta-button` text is now `--secondary-background-color`: 8.5:1 at rest,
5.7:1 on hover (WCAG formula). Lighthouse median of 3: **Accessibility 100**
(was 97), `color-contrast` passes. Walk PASSED (known failures only).
Screenshots of hero (1920×1080) and CV intro (375×812) checked by eye.

Performance in the same runs: 65–90, median 84 (66 in the previous median),
from a colour change that cannot move it. The spread is the sandbox's live
CDN fetches through the proxy (LCP 2.3–5.8 s across runs). Self-hosting fonts
(U5) and three.js (U6) removes those fetches from the critical path, so it
should also make the measurement stable; until then a single Lighthouse
median here is ±15 points.

### U3 — Broken AURELION link (done 2026-10-03, `bdd73ea`)

Link points at the current product page (200). Full walk PASSED apart from
known failures; no `external-link` failures; no stale known entries.

### U2 — Site-walk test (done 2026-10-03)

`tests/site-walk.mjs` + `tests/lighthouse.mjs`, documented in AGENTS.md
"Testing". Self-test 4/4 faults caught. Full run: 40 viewport×variant walks,
721 screenshots, 855 s, **PASSED** apart from known failures, no stale
entries; 37 links checked (LinkedIn 999 accepted as bot-blocking, GitHub
profile unverifiable from the sandbox).

**First full walk — triage (2026-10-03).** 413 failures, 7 causes:

| Cause | Verdict | Goes to |
|---|---|---|
| Time-machine HUD covers the last bullet (375×812, 667×375, 844×390); nav dots sit on text (320–414 px wide) | Real — seen in screenshots: "C++17 on Unreal Engine 4" unreadable at 667×375 | U9 |
| Cold Comfort card click does nothing (×30: every viewport × 3 JS variants) | Real — no timeline entry to jump to | U8 |
| `Error creating WebGL context` page error without WebGL | Real — `background.js` assumes WebGL | U10 |
| AURELION product link 404 | Real — dSPACE moved the page; current URL verified 200 | U3 |
| Initial load 651 KiB (375×812) / 880 KiB (1920×1080) vs 600 KiB; fonts 114 vs 100; images 234/462 vs 200 | Real — the budget QUALITY.md sets | U5, U6, B12 |
| 5/6 project titles absent without JS | Real | B7 |
| `github.com/Poschiunavailable` 403 | Harness — the sandbox proxy blocks github.com outside this repo; now reported as "unverifiable", identified by the proxy's message | — |
| `fonts.gstatic.com` 404 | Harness — a `preconnect` hint was link-checked; now skipped | — |
| No-JS titles check passed for Cologne Game Lab only because the about text names it | Harness — now only looks inside `#portfolio` / `#cv` | — |



## What to do next

Phases are strict: A before B before C.

**Phase A — fix what is broken or stale**

1. ~~**U1** Stale docs + README email~~ — done 2026-10-03.
2. ~~**U2** Site-walk test~~ — done 2026-10-03.
3. ~~**U3** Broken AURELION link~~ — done 2026-10-03. → `products/sw/experimentandvisualization/aurelion_sensor-realistic_sim.cfm` (public product page, verified 200).
4. ~~**U4** CTA contrast~~ — done 2026-10-03: white on `--highlight-color` (#eab180) is **1.89:1**
   (Lighthouse `color-contrast`, `.cta-button` and `#cvEnter`). AGENTS.md's
   "7.8–11.0:1" only covered body text on section fills.
5. ~~**U5** Render-blocking CSS~~ — done 2026-10-03: every stylesheet `@import`s `base.css` again and
   `base.css` `@import`s three Google Fonts stylesheets → 1.45 s of
   render-blocking on mobile, LCP 6.5 s. Remove the `@import` chains,
   self-host the fonts (woff2, `preload`, metric-matched fallback so there is no
   font shift).
6. ~~**U6** Vendor three.js~~ — done 2026-10-03: (one pinned file) and drop `es-module-shims`
   (import maps are native in every current browser). Removes a third-party
   origin from the critical path.
7. ~~**U7** Placeholder art~~ — done 2026-10-03: the Cologne Game Lab card/hero uses the AURELION
   artwork and its three topic slides use Cold Comfort / Everslaught / Rough
   Justice art, which reads as if those games were university projects.
   Replace with simple, clearly labelled placeholder images (Patrick OK'd
   placeholder assets, 2026-10-03) and mark every placeholder in
   `projects.json` (schema decided in that unit).
8. **U8** (card above) Cold Comfort card does nothing on click. Give a card without its own
   timeline entry a target (the Freelance "Cold Comfort — Prototype" slide is the
   natural one) via data, not a special case in code.
9. **U9** Timeline HUD collisions: time-machine box over the last bullet, nav
   dots over text at narrow widths.
10. **U10** Starfield without WebGL: no uncaught error, a static star
    background instead.

**Phase B — finish what is missing**

B1. No-JS fallback that still shows all content (today the
   portfolio and timeline are injected from `projects.json` by JS — with JS off
   they are empty). Needs a design decision that keeps `projects.json` the
   single source; record it here before building.
B2. Timeline accessibility: slides announced (live region "slide x of N"),
   controls named, focus management on enter/exit, keyboard reaches every
   control.
B3. Metadata: absolute `og:image`, Twitter card fields, designed 1200×630
   social preview, canonical URL, `robots.txt`, `sitemap.xml`.
B4. Favicon set (SVG + 32 px ICO + 180 px apple-touch + manifest icons);
    today a 129 KB 2048²-derived PNG is linked as the icon.
B5. Designed `404.html`.
B6. Responsive images (`srcset`/`sizes`) for card and slide art.
B7. Lighthouse mobile Performance ≥ 90 and the transfer budget in QUALITY.md.

**Phase C — polish** (only after A and B): type and spacing scale as tokens,
hover/focus/pressed states everywhere, motion and art direction refinement
in service of the "travel between projects" idea.

## Measurements

**After U2 (2026-10-03, `71e6c71`), `npm run lighthouse` (median of 3, test
server with gzip + Range like GitHub Pages):** Performance **66**,
Accessibility **97**, Best Practices 100, SEO 100 · FCP 3.9 s, LCP 5.8 s,
CLS **0.092**, TBT 139 ms · 3,961 KiB. Two differences from the baseline below
are explained, not noise:

- **3.1 MB of hero reel at load.** The test server answers Range requests as
  GitHub Pages does; `python -m http.server` doesn't, which hid this. The hero
  video's "lazy" start fires immediately because the hero is on screen at load,
  so on a real visit the reel streams during first load. → handled in B7
  (performance), decision to be recorded then.
- **CLS 0.092 on `.hero-content`**: web-font swap shifting the hero. → U5
  (self-hosted fonts with metric-matched fallback).

Walk transfer budget (video excluded): 651 KiB at 375×812, 877 KiB at
1920×1080 vs 600 KiB; fonts 114 vs 100; images 234 / 462 vs 200.

### Baseline (2026-10-03, commit `3ff5e4c`)

Measured locally (`python3 -m http.server 4173`) in the cloud sandbox.

- **Lighthouse mobile** (default simulated throttling, 2 runs, identical):
  Performance **64**, Accessibility **97**, Best Practices **100**, SEO **100**.
  FCP 4.7 s, LCP 6.5 s (render delay 2.3 s), CLS 0, TBT 60–70 ms,
  Speed Index 5.5 s, total transfer 1,081 KiB (incl. ~160 KiB of hero reel).
  Failing audits: `color-contrast` (CTA 1.89:1), `render-blocking-insight`
  (−1.45 s), `unused-javascript` (150 KiB, mostly three.js),
  `cache-insight`, `image-delivery-insight` (31 KiB).
- **Screenshot walk** (throwaway script, not yet the U2 walk): all 10
  viewports, 5 sections + 16 timeline slides each. No horizontal overflow at any
  viewport; no slide overflowed at 9 of 10 viewports. At 320×568 the first run
  never entered the timeline; a rerun did — that run coincided with CDN
  requests (fonts, three.js, es-module-shims) failing with
  `ERR_TOO_MANY_RETRIES` through the sandbox proxy. Treated as environment noise
  until U2 can show otherwise; it is the reason U2 must make third-party
  fetches deterministic.
- **Site errors**: none from the site's own code. Only proxy-caused CDN
  failures and the hero reel request aborted on navigation.
- **Observed visually**: Cologne Game Lab hero slide shows the AURELION road
  artwork (→ U6). Hero and portfolio read well at 1920×1080.

## Placeholder register

Everything shown on the site that is not a real, verified fact or genuine
asset. Nothing else on the site is invented. **Source of truth for data
placeholders: the `placeholders` map in each `projects.json` entry** (field
path → what real content is needed); the walk fails if a field uses
`assets/placeholders/` without a marker, or a marker points at nothing. This
table adds what lives outside `projects.json`.

| # | Where | What stands in | Real content needed |
|---|---|---|---|
| P1 | `UniversityProjects`: `image`, `poster` | `assets/placeholders/cologne-game-lab.svg` (labelled "PLACEHOLDER") | Image from a Cologne Game Lab project |
| P2 | `UniversityProjects`: `workTopics[0..2].image` | `assets/placeholders/cgl-*.svg` (labelled) | Screenshots of the student games / a thesis figure |
| P3 | every project's `cardVideo` | the shared `portfolio_reel.mp4` | Per-project preview clips |
| P4 | `Freelance`: `image`, `poster` | Cold Comfort splash art (same as the Cold Comfort card) | An image representing the freelance work |
| P5 | `index.html` → `og:image` | Everslaught splash art, relative URL | Designed 1200×630 preview (B3) |
| P6 | `UniversityProjects` topic text | Collaborative projects described by theme, not title (true, but incomplete) | Individual student game titles (only Patrick has them) |

Not placeholders, recorded so they are not "fixed" by mistake:
`assets/sensor_simulation.svg` is deliberate original artwork for AURELION
(no employer imagery); the game key art is genuine; the placeholder SVGs'
starfield and corner brackets echo the site's own motifs on purpose.

## Questions for Patrick

Collected here; asked together rather than one by one.

1. **Cold Comfort timeline** — the Cold Comfort card says "built at Gamma
   Minus" (2019-02 → 2020-06), while the Freelance entry lists the Cold Comfort
   prototype as freelance work (2019-02 → 2021-02). Which is right, or were
   both true at different times? Not changing real facts without you.
2. **Git history cleanup** — ~132 MB of deleted videos remain in history.
   Proposal: `git filter-repo` on a fresh clone, force-push `main` and
   `prototype`, everyone re-clones. Rewrites every SHA. Not doing it without a
   yes.
3. **Rough Justice press kit** — official screenshots exist at
   `rough-justice.com/press-kit/`, no licence stated (rights contact is listed
   on that page). Use them or not? (Everslaught has no public press kit; its
   store imagery sits behind unstable CDN URLs, so nothing to use there.)
4. **University game titles** (P6) and **per-project clips** (P3) — whenever
   you have them.
5. **Hero reel** (`portfolio_reel.mp4`) — what does it show? Docs call it
   "generic"; if it is not your own work it belongs in the placeholder
   register.
6. **Master's thesis** — your CV lists it as planned for 2027/28, research
   topic machine learning in real-time strategy games. Not on the site; add it?

## Decisions

| # | Date | Decision | Reason |
|---|---|---|---|
| D1 | 2026-10-03 | Process docs live in `Docs/` (`STATUS.md`, `QUALITY.md`); `AGENTS.md` stays at the root as the repo map. | Requested layout; root `AGENTS.md` is where agents look first. |
| D2 | 2026-10-03 | Test tooling goes in `tests/` with its own `package.json` (Playwright, Lighthouse); `node_modules` is git-ignored. The site itself stays build-free. | A dev-only test harness is not a build step: nothing it produces ships. |
| D3 | 2026-10-03 | Local server port is **4173** everywhere. | Both docs already say 4173; only `.claude/launch.json` says 4201. |
| D4 | 2026-10-03 | Phase A order is docs → walk → contrast → CSS/fonts → three.js vendoring → art. | The walk has to exist before behaviour changes; the remaining A items are ordered by measured impact (a11y fail, then 1.45 s render-blocking). |
| D5 | 2026-10-03 | `TODO.md` became `Docs/HISTORY.md`: a dated, append-only log. Its "Still open" items moved to the questions above; its "Testing" section was a third copy of the viewport list and was dropped (home: QUALITY.md). Dead `.contact-form`/`.form-group`/`.form-note` CSS removed. | One home per fact. History keeps its value (measurement notes, past bugs) without competing with STATUS for "what is true now". |
| D6 | 2026-10-03 | Phase A grows from the first walk: U3 broken link, U8 Cold Comfort card, U9 HUD collisions, U10 no-WebGL error. Phase B items are numbered B1–B7. | The walk found them; small, user-visible breakage stays in Phase A. |
| D7 | 2026-10-03 | Real bugs the walk finds but a later unit fixes go in `tests/known-failures.json` with that unit's id. They are reported, don't fail the run, and a full run flags entries that stop matching. | Keeps the walk green-meaningful without hiding bugs or deleting checks. |
