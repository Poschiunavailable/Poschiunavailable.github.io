# History

Dated log of past rounds: what was broken, how it was fixed, and how it was
measured. Append-only and historical — statements here describe the site *at
that date*. Current state, open work and questions live in `STATUS.md`; the
quality bars and test viewports live in `QUALITY.md`.

## Audit (2026-08-07)

Audit 2026-08-07; fixes applied same day. Everything under **Fixed** was
re-tested in a browser at 320×568, 360×640, 375×667, 375×812, 414×896,
667×375, 844×390, 768×1024, 1024×768, 1920×1080 — all pass.

---

### Fixed

#### P0
1. **Mobile navbar** — `navbar.css` had no media queries at all; at 375px the
   bar overflowed by 116px and "CV"/"Contact" rendered off-screen. Added a
   hamburger toggle (44×44 target, `aria-expanded`, closes on link click,
   Escape, outside click, and on leaving the breakpoint). Nav overflow is now
   0px at every tested width.
2. **Hero clipping** — `.hero` inherited `height:100vh` from `styles.css` while
   `hero.css` supplied `padding:100px 0` + `overflow:hidden`, cutting 32px in
   portrait and **437px in landscape** (the CTA was invisible). Now
   `min-height:100svh`, no `overflow:hidden`, with `max-height` tiers that
   collapse the 10vh separators and avatar on short screens. 0px clipped
   everywhere.
3. **Timeline slides clipped unreachable content** — the stage is
   `overflow:hidden` *and* scroll is hijacked, so overflow was permanently
   lost (the 4th highlight bullet at 375×667; 157px in landscape). Added
   `max-height: 760 / 700 / 620px` and landscape tiers that scale the image,
   text and bullets. Verified every one of the 13 slides fits at every tested
   viewport.
4. **Immersive scroll trap** — no exit affordance existed on touch. Added a
   persistent `#cvExit` button (visible only while immersive) that restores
   page scroll; Escape still works.
5. **Video weight — 132 MB → 6.7 MB total assets.**
   - Deleted `PortfolioVideo.mp4` (94 MB, referenced by nothing).
   - The source was **HEVC/H.265**, which Firefox and many Chrome builds
     can't decode — the hero video silently failed there. Re-encoded to
     H.264 `portfolio_reel.mp4` (4.2 MB, audio stripped, `+faststart`) plus a
     14 KB poster.
   - Slide videos no longer set `src` up front: **12 requests for a 38 MB file
     on page load → 0**. Sources attach one slide ahead of the focus.

#### P1
6. **Portfolio cards stuck tilted on touch** — `touchmove` applied the tilt but
   only `mouseleave` removed it, so a card kept `scale(1.35)` forever after any
   scroll that grazed it. The whole effect is now gated behind
   `(hover:hover) and (pointer:fine)`; verified no transform survives a touch.
7. **Timeline ran out of order** — slides followed `projects.json` order
   (2018 → 2021 → 2016 → 2017 → 2022) under a monotonic progress bar. Now
   sorted by `startDate`; verified the interpolated date sequence is monotonic
   2016-02 → 2023-05. The progress bar is driven by elapsed time rather than
   slide index.
8. **`<cv>` heading typed into an invisible element** — the typing effect and
   the immersive fade raced. That heading no longer uses the typing effect.
9. **Duplicate/conflicting CSS** — `.hero*`, `.cta-button`, `.hero-video-*`
   were declared in both `styles.css` and `hero.css`. `styles.css` is now
   global-only (this was the root cause of #2).
10. **`setupVideo()` circularity** — `--video-height` was derived from an
    element whose height was `var(--video-height)`. Removed; the hero video now
    loads lazily on intersection and is skipped entirely under reduced motion
    or `saveData`/2G.
11. **Starfield loop** — `render()` self-scheduled its own rAF, so
    `setAnimationLoop(null)` could never pause it ("reduce work when hidden"
    was a no-op). Now a single `setAnimationLoop` driver with real
    hidden/visible start/stop, a clamped `dt`, and `pagehide`/`pageshow`
    instead of bfcache-breaking `beforeunload`. Also: devicemotion,
    deviceorientation and the Generic Sensor API were all attached at once,
    writing to the same two variables — only `deviceorientation` remains.
12. **Portfolio grid** — `repeat(3,1fr)` with two visible projects left an empty
    column; now `auto-fit`, and the cards span the full grid width.
13. **Contact form** — `action="mailto:" method="post"` does nothing in modern
    browsers. Now a JS submit handler that composes a mail draft. *(Later
    removed entirely: contact runs through LinkedIn, see AGENTS.md.)*

#### P2
- `prefers-reduced-motion` support added across `animation.css`, `navbar.css`,
  `portfolio.css`, `cvstyle.css` (10 rules) **and** in JS — the starfield stops
  animating, parallax translations go to zero, the warp effect is suppressed,
  bullet stagger is removed, the typing effect is skipped, and the hero video
  doesn't download.
- Added `<meta name="description">`, Open Graph + Twitter tags, `theme-color`,
  and 3 icon links (favicon + apple-touch-icon).
- GSAP `<script>` removed — ~70 KB CDN fetch that nothing used.
- Dead `nonCVContent` class/id removed (0 occurrences remain).
- Orphaned `styles/liststyles.css` and `styles/portfoliodetails.css` deleted.
- Nav dots use `visibility` so they leave the tab order when inactive, use
  `data-label` instead of `title` (which double-rendered a native tooltip), and
  have `:focus-visible` styles.
- Portfolio cards are now real controls: `role="button"`, `tabindex="0"`,
  `aria-label`, Enter/Space activation (verified Enter enters the timeline).
- `#timeMachine` no longer `aria-hidden`, and no longer flashes a hardcoded
  `JAN 2019` before the first render.
- `formatProjectDates` tolerates missing dates and renders `PRESENT` for an
  absent `endDate` instead of throwing.
- `vid.play()` no longer called every frame; guarded on `paused` state.
- Footer links point at real URLs; `scroll-margin-top` added so the fixed
  navbar stops covering anchor targets.

---

## Content update (2026-08-07)

`projects.json` and the hero/about copy now come from the CV. The site is
repositioned from "game developer" to **software engineer — cross-platform
C/C++, systems, simulation**. Timeline entries: Freelance (2019-02 → 2021-02),
Rough Justice: '84 / Gamma Minus (2021-03 → 2022-02), Everslaught Invasion /
MobX (2022-02 → 2023-04), AURELION / dSPACE (2024-05 → present). Verified
chronologically monotonic, and the ongoing role renders as "PRESENT".

Publishing decisions (see `AGENTS.md` — treat as rules, not defaults): no
email or phone on the page, contact via LinkedIn only, no availability signal,
dSPACE kept high-level, career break omitted.

Two bugs this surfaced, both fixed: `getDateForPos` threw on a missing
`endDate` (an ongoing role), and the Steam app ID was wrong — the real
Rough Justice: '84 ID is **1291860**, confirmed against the store page.

**Assets:** the existing game art turned out to be the genuine key art for all
three titles, so nothing needed downloading. The only gap was AURELION, filled
with original artwork (`assets/sensor_simulation.svg`, 5.7 KB) rather than
dSPACE marketing imagery.

## Round 3 (2026-08-07)

- **Scroll hijack removed.** The IntersectionObserver that entered immersive
  mode at 50% viewport visibility is gone. Entry is now explicit only:
  `#cvEnter` button, CV nav link, or a portfolio card. Verified by scrolling
  the full page down and back up — zero hijack events.
- **Starfield jitter fixed** — `background.js` scaled the sway sine's *phase*
  by `warpFactor` instead of its frequency. Measured worst-case single-frame
  camera jump of 1.50 units (sway amplitude is 1.0) after 2 min on the page,
  1.83 after 5 min. Now integrates phase per frame: 0.01, time-independent.
- **Warp-jump transition** for portfolio → timeline (fade out around the
  starfield → lightspeed → project fades in, ~750 ms).
- **Starfield now visible.** Content sections were fully opaque; they use
  translucent fills now (text contrast measured 7.8–11.0:1). In immersive mode
  the canvas went 0.35 → 0.9 with a centred vignette on topic slides.
- **Assets 6.7 MB → 4.7 MB.** Dropped two unreferenced ship renders, downscaled
  `website_icon.png` from 2048² (425 KB → 132 KB), `cold_comfort_game.jpg` →
  WebP (269 KB → 70 KB), added a 180² apple-touch icon.
- **`details` is rendered** as a fact list on hero slides (Engine / Platform /
  Publisher / …), free-form keys per project.
- **University projects added** from the Bachelor transcript — see below.
- **Reduced motion verified end-to-end** via a temporary harness that shimmed
  `matchMedia` before module load. Confirmed: headings render full text, all 12
  `.animate` elements reach `.visible`, hero video not downloaded (0 bytes
  transferred), slide videos replaced by static images, warp jump skipped,
  parallax transform zero, bullets revealed without stagger. Harness deleted.
  *Caveat:* the shim only affects JS — CSS `@media (prefers-reduced-motion)`
  blocks were verified separately by parsing, not by a real OS toggle.

## University projects — source note

There is **no dedicated university-project summary** in Drive. The closest is a
single line in "CV and Portfolio April 2023 Game Programming", which refers to
"the shown games" — i.e. screenshots that don't survive text extraction, so the
individual game titles are not recoverable from Drive.

What the site now shows is drawn from `Bachelor_Certificate_Patrick_Temborius.pdf`
(the transcript), which lists the actual module structure:
Collaborative Projects 1–5 (Ludic / Narrative / Mixed Reality / Experimental /
Serious Games), the 25-ECTS Self-Initiated Project, and the thesis
*"Resolving character sizing issues and movement limitations in digital games"*.

**To name the individual student games, you'll have to supply the titles** —
they aren't anywhere in Drive. Grades, date/place of birth and student ID from
that transcript are deliberately not on the site.

Also found: master's thesis research is on *Machine Learning in Real-Time
Strategy Games* (Drive doc, Apr 2025). Not on the site — say if you want it.

## Round 4 (2026-08-07)

- **CV intro bleeding through slides** (from the screenshot) — `#cvIntro` and
  `#cvSectionLabel` only dropped to `opacity: 0`, and topic slides are
  deliberately semi-transparent so the starfield reads through. Anything left in
  `#cvSection` therefore painted through them while the opacity transition was
  still running. Both now also get `visibility: hidden`, which is not
  transitioned and so cuts out immediately.
- **Portfolio cards flashing on narrow windows** — `move()` read
  `getBoundingClientRect()`, which reports the *transformed* box, so each frame
  fed the card's own scale and translate back in. Replaying the old maths shows
  translateX diverging +446 → −447px frame to frame (an 893px swing on a 556px
  viewport). Now measured once per hover with the transform cleared; 12
  identical mouse events produce 1 identical transform. Scale is additionally
  clamped to `(viewport - 24) / cardWidth`, so a full-width card no longer tries
  to grow past both screen edges.
- **Hovered card sat behind its neighbour** — z-index was a fixed `10`, tying
  with a neighbour still running its 500ms spring-back, so DOM order decided.
  Now a monotonic counter: the most recently hovered card is always on top.
- **Warp jump visuals** — background now matches the top of the page instead of
  near-black; real directional motion blur via per-star `LineSegments` trails
  (only built during warp, verified to stop drawing afterwards); plus a light
  bloom + stage settle on arrival (`body.timeline-arriving`).
- **Portfolio grid filled out** — 6 cards now (Cologne Game Lab, Cold Comfort,
  Freelance, Rough Justice, Everslaught, AURELION). Cold Comfort is its own
  entry; its Steam ID (683190) and "asymmetric 5v5 PvP, unreleased" framing were
  checked against the live store page.
- **Hover preview video on cards** — no `src` at all until first hover, so an
  un-hovered grid costs zero video bytes; cross-fades over the still, pauses and
  rewinds on leave. Skipped under reduced motion / saveData / 2G.

### Two self-inflicted bugs caught in this round

1. Adding `video` to every project made the **timeline hero slides** play the
   generic reel instead of their real key art. Split into `video` (hero, real
   footage only) and `cardVideo` (card preview, generic clip fine).
2. A regex used to strip `#cvScrollHint` rules deleted a shared declaration
   block, leaving a dangling selector list that merged into the next rule — so
   `header`, `#hero`, `#about`, `#portfolio`, `#contact` and `footer` were
   getting `opacity: 1` during warp: the exact opposite of the fade. Brace
   counting did not catch it (a matched pair was removed). Verified by asserting
   computed opacity per body-class state instead.

## Round 5 (2026-08-07)

- **Motion blur simplified and generalised.** It was a warp-only special case
  taking `(warpFactor, warpBlend)`. Now `updateTrails()` takes one signed
  relative velocity and draws `velocity * EXPOSURE` — literally how far a star
  moves during a shutter interval. Warp streaming and scroll-driven camera
  movement feed the same number, so **fast scrolling now blurs the starfield
  anywhere on the site**. Measured: trails on 100% of frames while scrolling,
  opacity scaling from ~0.05 (gentle wheel) to ~0.9 (flick), and zero draw
  calls once movement stops.
- **Starfield visible on hero slides.** `.slide-bg` is masked with a radial
  gradient so the artwork fades toward the edges instead of covering the
  viewport: roughly 13–40% starfield at the edges, 59–93% in the corners
  (elliptical falloff, computed at 1280×720).
- **Hero text got a real backdrop.** The full-screen `.slide-overlay` was doing
  the legibility work and flattening everything; it is now much lighter
  (0.10→0.58 instead of 0.35→0.92), and `.slide-content-hero` is a translucent
  panel with `backdrop-filter: blur(14px)`, a hairline border and a shadow.
  There's an `@supports not (backdrop-filter)` fallback with a more opaque fill
  so it stays readable over moving footage without blur support.

  Positioning changed from `padding-bottom: 14vh` to `margin-bottom`, so the
  three short-viewport tiers that tuned `padding-bottom` were updated to match.

### Measurement note

My first attempt to quantify the mask sampled a *circular* canvas gradient as a
stand-in for the CSS ellipse, which reported the top and bottom edges as fully
covered. That was wrong — CSS `radial-gradient(ellipse X% Y% …)` normalises the
two axes independently. Recomputed with the correct formula; the numbers above
are from that.

## Fonts (U5, 2026-10-03)

Self-hosted in `assets/fonts/`, replacing three render-blocking
`@import`s of fonts.googleapis.com in `base.css`. Source: the Latin
variable woff2 that Google Fonts serves to Chrome (Roboto v51, Lora v37,
Fira Code v27), downloaded 2026-10-03. Licences: SIL OFL 1.1, copies in
`assets/fonts/OFL-*.txt` (from github.com/google/fonts).

| File | Made with (fontTools 4.66) | Size |
|---|---|---|
| `roboto-latin-wght.woff2` | `pyftsubset` to Google's Latin range + U+2192, U+25B8, features `kern,liga,ccmp,locl,mark,mkmk`; `varLib.instancer` wght 400–700 | 25 KB (was 43) |
| `firacode-latin-wght.woff2` | same; this drops `calt` (programming ligatures — the site's mono text is labels, not code) | 18 KB (was 36) |
| `lora-latin-wght.woff2` | **unmodified** — Lora has a Reserved Font Name, so a subset could not be called "Lora"; subsetting saved < 1 KB anyway | 38 KB |

Fallback metrics in `styles/fonts.css` were computed against Liberation
Sans/Serif/Mono (metric-compatible with Arial, Times New Roman, Courier New)
from the average advance width over the site's own text.

Measured: walk font transfer 114 → 80 KiB, CSS 24 → 17 KiB (no `@import`
chain). Computed-style diff (`tests/style-diff.mjs`) before/after over 442
elements × 4 body states × 2 viewports: two differences, both explained —
"View in CV →" labels 0.12 px narrower (kerning re-encoded by the
instancer), and the About button, which now gets both its reveal and hover
transitions (see `about.css`); before, the `@import` re-insertion of
`base.css` silently dropped its reveal transition.

## three.js (U6, 2026-10-03)

`modules/vendor/three-0.151.3.module.min.js` is three.js r151.3
(`build/three.module.js` from unpkg, sha256
`95b4fa4c…e34d2`), minified once with
`npx esbuild@0.25.10 three.module.js --minify --format=esm --legal-comments=inline`
because r151 ships no minified ES module. MIT licence in
`modules/vendor/LICENSE-three.txt`; the licence header stays inline.
Not upgraded: r152 changed colour-management defaults, which would shift the
star colours. `es-module-shims` dropped — import maps are native in every
current browser.

Measured: walk script transfer 272 → 179 KiB; an `--offline` walk with an
empty third-party cache made no third-party request at all.
