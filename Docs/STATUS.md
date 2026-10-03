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
| **Unit** | U1 — Stale docs and README email |
| **Phase** | A (fix what is broken or stale) |
| **Goal** | Every fact has one home and is true: AGENTS.md no longer describes the removed contact form / mailto handler; "all content is placeholder" statements are gone (content is real since 2026-08-07); `.claude/launch.json` and the docs agree on one port; README.md carries no email address. TODO.md's open items move here, its change history gets one home. |
| **Acceptance check** | `grep -rniE "contact.form\|mailto\|@g(oogle)?mail" --include=*.md --include=*.json --include=*.html --include=*.js .` finds only statements that say there is *no* form; `grep -rn 4201` finds nothing; no doc claims the content is placeholder except the register below. |
| **Files** | `AGENTS.md`, `TODO.md`, `README.md`, `.claude/launch.json`, `Docs/STATUS.md` |
| **Step reached** | Not started (baseline + process docs done first, see Decisions D1–D4). |

## What to do next

Phases are strict: A before B before C.

**Phase A — fix what is broken or stale**

1. **U1** Stale docs + README email (card above).
2. **U2** Site-walk test (`tests/`): Node + Playwright, all 10 viewports, every
   section, every card's warp jump, every slide, overflow check, console/page
   errors, link check, screenshots + contact sheet; variants for reduced motion
   and no WebGL. Third-party fetches must be deterministic (the sandbox proxy
   drops CDN requests intermittently — see Baseline). Must be able to fail:
   include a self-test that a deliberately overflowing slide is caught.
3. **U3** CTA contrast: white on `--highlight-color` (#eab180) is **1.89:1**
   (Lighthouse `color-contrast`, `.cta-button` and `#cvEnter`). AGENTS.md's
   "7.8–11.0:1" only covered body text on section fills.
4. **U4** Render-blocking CSS: every stylesheet `@import`s `base.css` again and
   `base.css` `@import`s three Google Fonts stylesheets → 1.45 s of
   render-blocking on mobile, LCP 6.5 s. Remove the `@import` chains,
   self-host the fonts (woff2, `preload`, metric-matched fallback so there is no
   font shift).
5. **U5** Vendor three.js (one pinned file) and drop `es-module-shims`
   (import maps are native in every current browser). Removes a third-party
   origin from the critical path and makes the walk deterministic.
6. **U6** Wrong art on the Cologne Game Lab entry: its card/hero uses the
   AURELION artwork and its three topic slides use Cold Comfort / Everslaught /
   Rough Justice art, which reads as if those games were university projects.
   Replace with clearly-marked neutral placeholder art and mark every
   placeholder in `projects.json` (schema decided in that unit).

**Phase B — finish what is missing**

7. No-JS and no-WebGL fallback that still shows all content (today the
   portfolio and timeline are injected from `projects.json` by JS — with JS off
   they are empty). Needs a design decision that keeps `projects.json` the
   single source; record it here before building.
8. Timeline accessibility: slides announced (live region "slide x of N"),
   controls named, focus management on enter/exit, keyboard reaches every
   control.
9. Metadata: absolute `og:image`, Twitter card fields, designed 1200×630
   social preview, canonical URL, `robots.txt`, `sitemap.xml`.
10. Favicon set (SVG + 32 px ICO + 180 px apple-touch + manifest icons);
    today a 129 KB 2048²-derived PNG is linked as the icon.
11. Designed `404.html`.
12. Responsive images (`srcset`/`sizes`) for card and slide art.
13. Lighthouse mobile Performance ≥ 90 and the transfer budget in QUALITY.md.

**Phase C — polish** (only after A and B): type and spacing scale as tokens,
hover/focus/pressed states everywhere, motion and art direction refinement
in service of the "travel between projects" idea.

## Baseline (2026-10-03, commit `3ff5e4c`)

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
asset. Replace these; nothing else on the site is invented.

| # | Where | What is placeholder | Real content needed |
|---|---|---|---|
| P1 | `projects.json` → `UniversityProjects.image` / `.poster` | Uses `assets/sensor_simulation.svg` (the AURELION artwork) | Image from a Cologne Game Lab project, or a neutral placeholder |
| P2 | `projects.json` → `UniversityProjects.workTopics[0..2].image` | Cold Comfort, Everslaught and Rough Justice art standing in for university projects | Screenshots of the actual student games |
| P3 | `projects.json` → every `cardVideo` | All six cards share the generic `portfolio_reel.mp4` | Per-project preview clips |
| P4 | `projects.json` → `Freelance.image` / `.poster` | Reuses the Cold Comfort splash art (identical to the Cold Comfort card) | An image that represents the freelance work |
| P5 | `index.html` → `og:image` | Everslaught splash art, relative URL | Designed 1200×630 preview (Phase B) |
| P6 | `UniversityProjects` workTopics | Collaborative projects described by theme, not title | Individual student game titles (only Patrick has them) |

Not placeholders, recorded so they are not "fixed" by mistake:
`assets/sensor_simulation.svg` is deliberate original artwork for AURELION
(no employer imagery); the game key art is genuine.

Not yet marked in the data: the `"placeholder"` markers in `projects.json`
land with U6.

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
3. **Rough Justice press kit** — official screenshots exist, no licence
   stated. Use them or not?
4. **University game titles** (P6) and **per-project clips** (P3) — whenever
   you have them.
5. **Hero reel** (`portfolio_reel.mp4`) — what does it show? Docs call it
   "generic"; if it is not your own work it belongs in the placeholder
   register.

## Decisions

| # | Date | Decision | Reason |
|---|---|---|---|
| D1 | 2026-10-03 | Process docs live in `Docs/` (`STATUS.md`, `QUALITY.md`); `AGENTS.md` stays at the root as the repo map. | Requested layout; root `AGENTS.md` is where agents look first. |
| D2 | 2026-10-03 | Test tooling goes in `tests/` with its own `package.json` (Playwright, Lighthouse); `node_modules` is git-ignored. The site itself stays build-free. | A dev-only test harness is not a build step: nothing it produces ships. |
| D3 | 2026-10-03 | Local server port is **4173** everywhere. | Both docs already say 4173; only `.claude/launch.json` says 4201. |
| D4 | 2026-10-03 | Phase A order is docs → walk → contrast → CSS/fonts → three.js vendoring → art. | The walk has to exist before behaviour changes; the remaining A items are ordered by measured impact (a11y fail, then 1.45 s render-blocking). |
