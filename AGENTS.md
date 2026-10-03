# AGENTS.md — Map of this repo

Single-page portfolio site for Patrick Temborius. No build step, no bundler,
no framework — plain HTML/CSS + native ES modules loaded directly by the
browser. Hosted on GitHub Pages (`Poschiunavailable.github.io`).

Content is **real** as of 2026-08-07: `projects.json` and the hero/about copy
come from Patrick's CV. The game key art in `assets/` is the genuine art for
each title. The one synthetic asset is `assets/sensor_simulation.svg`, drawn
for the dSPACE/AURELION entry (see "Publishing rules" below). Where real
content is still missing, a placeholder stands in; every one is listed in the
placeholder register in [`Docs/STATUS.md`](Docs/STATUS.md).

Process docs: [`Docs/STATUS.md`](Docs/STATUS.md) (current unit, what's next,
placeholder register, decisions, open questions) and
[`Docs/QUALITY.md`](Docs/QUALITY.md) (quality bars, how each is measured,
the test viewports). [`Docs/HISTORY.md`](Docs/HISTORY.md) is the dated log of
past rounds and their measurements — read it before re-fixing something.

## Publishing rules — read before adding content

These are deliberate decisions, not oversights. Don't "fix" them:

- **No email address or phone number anywhere on the site.** Contact runs
  through LinkedIn precisely so there is nothing for scrapers to harvest.
  There is no contact form, and adding one would need an address to send to.
- **No availability / notice-period / relocation status.** Patrick is
  currently employed; the site must not broadcast that he is looking.
- **dSPACE / AURELION stays high-level.** Role, the public product name, and
  the tech stack only. No internal metrics (setup-time savings, defect rates),
  no wording implying product weaknesses, no customer names. The CV has richer
  detail that deliberately did *not* make it onto the site.
- **No employer marketing imagery.** `sensor_simulation.svg` is original
  artwork for exactly this reason — using dSPACE product visuals on a personal
  site is the riskiest asset choice available.
- **The May 2023 – Apr 2024 career break is intentionally absent** from the
  timeline; it involves personal/family detail that belongs on a CV, not a
  public page.

## How it's wired together

- `index.html` — the only HTML page. One `<section>` per nav item
  (`hero`, `about`, `portfolio`, `cv`, `contact`). Loads all CSS files
  individually (no bundling) and one entry module: `modules/main.js`.
- `modules/main.js` — bootstraps everything on `DOMContentLoaded`:
  `initScripts()` → `getProjects()` → `initPortfolio(projects)` +
  `initTimeline(projects)`. Start reading here.
- `projects.json` — **single source of truth** for all project content.
  Powers both the portfolio grid and the CV timeline. Each entry has
  `showInPortfolio` / `showInTimeline` flags controlling where it appears,
  plus `workTopics[]` (used only by the timeline, one slide per topic).
- `modules/dataManager.js` — fetches and caches `projects.json`.

## Modules (`modules/`)

| File | Responsibility |
|---|---|
| `main.js` | Entry point / orchestration. |
| `dataManager.js` | Fetches + memoizes `projects.json`. |
| `scripts.js` | Generic site chrome: mobile nav toggle, smooth-scroll nav, lazy hero video, scroll-in reveal (`.animate` + IntersectionObserver). Also exports `prefersReducedMotion()`, which the other modules import. |
| `portfolio.js` | Builds portfolio cards from `projects.json` into `#portfolioGrid`. 3D tilt/scale hover effect. Clicking a card doesn't open a modal — it dispatches `portfolio:selectProject` (`{id}`), which `timeline.js` listens for. |
| `timeline.js` | The CV/timeline section (`#cv`). Biggest/most complex module — a custom slide-based "virtual scroll" (like apple.com product pages): each project becomes one hero slide + one slide per `workTopics[]` entry, all flattened into `slideData`. Wheel/touch/keyboard input moves a `virtualPos` that LERPs toward an integer `targetPos`; scrolling into `#cv` far enough triggers "immersive mode" which locks page scroll and takes over input. Drives the `#timeMachine` date HUD by interpolating each project's `startDate`/`endDate` across its slides. |
| `background.js` | Three.js starfield background (`#canvas-container`), independent of the rest — reacts to mouse/gyro tilt and scroll position, and listens for `timeline:warpSpeed` (dispatched by `timeline.js` on entering/exiting immersive mode) to trigger a hyperspace streak effect. |
| `images.js` | `srcsetFor(path)`: the responsive-variant naming convention shared by cards and topic slides. |
| `vendor/` | Third-party code, vendored and pinned: `three-0.151.3.module.min.js` (mapped to `"three"` by the import map in `index.html`) + its MIT licence. Provenance and why it isn't upgraded: `Docs/HISTORY.md` "three.js". The site loads nothing from third-party origins. |

Cross-module coupling is intentionally just two `CustomEvent`s on `window`:
`portfolio:selectProject` (portfolio → timeline) and `timeline:warpSpeed`
(timeline → background). No shared state module, no framework store.

## Styles (`styles/`)

Loaded individually via `<link>` in `index.html`, in this order:
`fonts.css` (self-hosted `@font-face` + metric-matched fallbacks), `base.css` (resets + CSS custom properties / theme colors), `styles.css`,
`animation.css`, `navbar.css`, `hero.css`, `about.css`, `portfolio.css`,
`cvstyle.css` (large — styles the timeline/slide system), `contact.css`,
`headings.css` (section heads and hero role: the "star chart" style — Lora
titles, letter-spaced eyebrows between four-point stars, a constellation line
into each head; also used by `404.html`).

**No `@import` in `styles/`.** Every file used to `@import` `base.css`,
which re-inserted it at the importing file's position in the cascade — so
`base.css` silently beat equal-specificity rules in files loaded earlier, and
the chain delayed first render. Order is set by the `<link>`s alone.

Theme colors/fonts are CSS variables defined once in `base.css` `:root`
(`--primary-color`, `--highlight-color`, etc.) — change the palette there.

`styles.css` is global-only by design — section rules live in their own file
(`#about` → about.css, `#contact` → contact.css, `#portfolio` → portfolio.css,
`.hero*` → hero.css). Do **not** re-declare them in `styles.css`: those files
all load *after* it, so a duplicate there silently loses the cascade. This has
already caused two separate bugs (the hero clipping itself, and section
backgrounds not picking up their translucent fill).

**Source order is load-bearing in `cvstyle.css`.** The `body.timeline-warping`
rules at the end of that file have *identical* specificity to the
`body.timeline-immersive` rules above them, so the cascade is decided purely by
position. Keep the warp block last; moving it (or into another file that loads
earlier) makes the warp-jump transition silently do nothing.

Section fills are translucent on purpose (`--section-fill`, `--section-fill-alt`,
`--footer-fill` in base.css) so the WebGL starfield reads through them. Verified
text contrast stays 7.8–11.0:1. Don't make a section opaque without checking
what it hides.

The same idea runs through the timeline: hero slides mask their artwork with a
radial gradient so the starfield stays visible at the edges (roughly 13–40% at
the edges, 59–93% in the corners), topic slides use a centred vignette, and
`#canvas-container` sits at 0.9 opacity while immersive. Because the artwork no
longer flattens the viewport, hero text gets its legibility from the
`.slide-content-hero` panel (translucent fill + `backdrop-filter`) rather than
from a heavy full-screen overlay. If you darken the overlay again, you undo the
starfield visibility.

Every stylesheet that animates carries a `prefers-reduced-motion` block, and
the JS modules check `prefersReducedMotion()` too (so they can skip work
rather than just its animation). Keep both in sync when adding motion.

Layout is validated at the viewports listed in `Docs/QUALITY.md`. **360×640 and
667×375 are the tight cases** — they catch clipping that 375×812 does not.

## Assets (`assets/`)

Images/video referenced by `projects.json` and `index.html`: genuine key art
for each game, Patrick's profile photo, the hero reel (`portfolio_reel.mp4` +
poster), the original AURELION artwork, and `assets/fonts/` (self-hosted
woff2 + OFL licences; provenance in `Docs/HISTORY.md` "Fonts"). Where an entry lacks its own art,
a labelled placeholder from `assets/placeholders/` stands in (or existing art
is reused); the register in `Docs/STATUS.md` says which.

## Editing content

To add/edit a project: edit `projects.json` only — no code changes needed
for a straightforward new entry. To change what shows where, toggle
`showInPortfolio` / `showInTimeline`. `workTopics[]` entries become
additional timeline slides (image + description + `highlights[]` bullets).
`details` is the fact list on the project's timeline hero slide (see the quirk
below).
A card-only project (`showInPortfolio` without `showInTimeline`) must say where
its warp jump lands: `"timelineTarget": { "project": "<id>", "topic": "<workTopics
title>" }` (`topic` optional → that project's hero slide). Without it the card
does nothing and the timeline logs a warning, which fails the walk.
`placeholders` maps field paths (`"image"`, `"workTopics[0].image"`) to the
real content still needed. Mark every placeholder there; when real content
arrives, replace the value and delete its key. The walk enforces both
directions.

## Known quirks worth knowing before touching things

- No build tooling at all: editing a module is directly editing what ships.
  No TypeScript, no linter config. The only Node code is the dev-only test
  harness in `tests/` (see "Testing" below) — nothing in it ships.
- `timeline.js`'s wheel handling has hand-tuned constants (session-gap
  detection, cooldowns) to make one physical scroll click = one slide step
  across browsers that fragment wheel events. Read the comments before
  changing scroll feel.
- **Timeline slides must fit the viewport.** The stage is `overflow: hidden`
  and the wheel/touch handlers `preventDefault()`, so a slide cannot be
  scrolled internally — anything that overflows is unreachable, not just ugly.
  Adding content to a topic slide means re-checking the short-viewport tiers
  in `cvstyle.css`.
- Timeline projects are sorted by `startDate` at runtime, not by their order
  in `projects.json`.
- **All slide media attaches lazily** (`ensureSlideMedia()`, one slide ahead of
  focus, only while the timeline is open): videos and topic images via
  `data-src`/`data-srcset`, hero art via `data-bg`. All 16 slides are in the
  DOM from page load, so setting `src`/`background-image` in the markup
  downloads every slide's media up front (it did: 233 KB of topic images per
  visit). The walk fails if a timeline-only image loads with the page.
- The 3D card tilt is deliberately desktop-only (`hover:hover`+`pointer:fine`);
  on touch there is no event that would undo it.
- **Motion blur is one rule, not a warp feature.** `updateTrails()` takes a
  single signed *relative velocity* (stars vs camera) and draws a streak of
  `velocity * EXPOSURE`. Warp streaming and scroll-driven camera movement both
  feed the same number, which is why fast scrolling blurs the field anywhere on
  the site. Don't reintroduce a warp-only branch — if something else should
  blur the starfield, give it a velocity.
- **Never derive an animation phase from `elapsedTime * rate * modulator`.**
  `background.js` did exactly that for the camera sway, so changing the warp
  modulator rescaled the sine's *phase* instead of its frequency — producing a
  camera jump larger than the entire sway amplitude, worsening the longer the
  tab stayed open. Phase is now integrated per frame (`phase += dt * rate *
  modulator`). Same rule applies to any new oscillator.
- Clicking a portfolio card runs `flyToProject()` (warp jump), not a plain
  scroll: page fades out around the starfield → lightspeed burst → target
  project fades in. It jumps `virtualPos` straight to the target rather than
  lerping through intervening slides — the starfield expresses the travel.
  Input is locked via `S.flying` for the ~750ms duration (Escape still exits).
- **Timeline accessibility contract** (walk-enforced): every slide is a
  labelled `role=group` and all but the focused one are `inert` (the slides are
  stacked, so without it Tab walked into invisible links); `#cvAnnounce` (polite
  live region) reads "Slide x of N: …" on each step; the active nav dot carries
  `aria-current`; while open, header/footer/other sections/CV intro are `inert`
  (visibility alone left a timing window); entering moves focus to `#projectStage`, leaving hands it back
  to the opener two frames later (the sections return from `visibility:hidden`
  through a transition, so the opener isn't focusable sooner), else to
  `#cvEnter`.
- **Immersive mode is entered explicitly, never by scroll position.** There
  used to be an IntersectionObserver that hijacked scrolling the moment the CV
  section filled half the viewport. It is gone on purpose. The three entry
  points are the `#cvEnter` button, the CV nav link, and a portfolio card —
  all of them route through `flyToProject()`. Do not reintroduce scroll-based
  entry.
- `projects.json` `details` is a free-form key/value map rendered as the fact
  list on hero slides; keys are shown in author order, so any project can
  define its own. It is hidden under `max-height: 620px` where vertical space
  is scarce.
- **`video` vs `cardVideo` are different fields.** `video` is the full-bleed
  background of a timeline *hero slide* and must only ever hold real footage of
  that project — putting the generic reel there replaces the project's actual
  key art. `cardVideo` is the portfolio card's hover preview and may be a
  generic clip. Both attach their source lazily.
- **Never derive hover geometry from `getBoundingClientRect()` on a transformed
  element.** `portfolio.js` did, so the card's own scale/translate fed back into
  the next frame — translateX diverged ±446px, which is the "cards flash and
  zoom" bug. Measure with the transform cleared, cache it, drive from the cache.
  Card scale is also clamped to what the viewport can hold.

## Local preview

`fetch('projects.json')` fails under `file://`, so the site needs a server:

```bash
python -m http.server 4173
```

`.claude/launch.json` wires this up for the in-app browser preview.

## Tools (`tools/`)

Dev-only scripts whose output is committed (nothing runs at deploy time):

- `render-social-card.mjs` — renders `tools/social-card/card.html` to
  `assets/social/og-card.jpg`, the 1200×630 Open Graph / Twitter preview.
  Re-run after changing the name, role or tagline. Uses Playwright from
  `tests/node_modules`.

- `make-responsive.py` — 480w/960w WebP variants of every raster image in
  `projects.json` (`assets/foo.webp` → `foo-480.webp`, `foo-960.webp`);
  `modules/images.js` builds `srcset` from that convention. Re-run after adding
  an image; the walk fails if a variant is missing. Needs Pillow.
- `make-icons.py` — favicon set (`favicon.ico`, `assets/icons/*`) from
  `assets/brand/pt-logo-512.png`, Patrick's PT logo. Needs Pillow.

`robots.txt`, `sitemap.xml` and `site.webmanifest` sit at the root; the canonical URL is
`https://poschiunavailable.github.io/` (also in `index.html`).

## Testing (`tests/`)

```bash
cd tests && npm install
npm test              # site walk: 4 variants × 10 viewports (~12 min)
npm run test:quick    # 3 viewports, all variants
npm run test:self     # injects faults; passes only if the walk catches each
npm run lighthouse    # Lighthouse mobile, median of 3
node style-diff.mjs <old-checkout>   # computed-style diff, for CSS refactors
```

For a before/after comparison, check the old commit out with
`git worktree add <dir> <commit>`; `site-walk.mjs --root=<dir>` and
`style-diff.mjs <dir>` both take it.

- `site-walk.mjs` serves the repo with `lib/server.mjs` (GitHub-Pages-like:
  gzip, Range, `404.html`), then per viewport visits every section, opens the
  mobile nav, steps every timeline slide, runs every card's warp jump and the
  CV nav-link entry, and checks overflow, console/page errors and links.
  Variants: `default`, `reduced-motion`, `no-webgl` (WebGL contexts return
  null), `no-js`. Output: `tests/out/index.html` (contact sheet) and
  `tests/out/report.json`.
- The browser under test has no internet access: third-party requests are
  answered from `tests/.cache/` (`lib/thirdparty.mjs`, filled once via curl).
  `--offline` turns a cache miss into an error.
- `known-failures.json` lists real bugs that are already scheduled in
  `Docs/STATUS.md`. A failure that matches one is reported but doesn't fail the
  run; a full run flags entries that no longer match so they get removed.
- Every change that adds or alters a section, slide, state or interaction
  extends the walk in the same commit.
