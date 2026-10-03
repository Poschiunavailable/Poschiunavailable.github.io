# QUALITY

The bars every unit is held to. Each bar says **how it is measured**; a bar
that cannot be measured yet says which unit adds the measurement. A check that
passes while testing nothing counts as a failure, so every automated check
also asserts that it actually looked at something (non-zero element counts,
non-empty screenshots).

Viewports (all checks that say "every viewport"):
320×568, 360×640, 375×667, 375×812, 414×896, 667×375, 844×390, 768×1024,
1024×768, 1920×1080. 360×640 and 667×375 are the tight cases.

Tools: the site walk (`tests/`, added in U2) and Lighthouse 13 (mobile preset,
default simulated throttling) run against `python3 -m http.server 4173`.
Lighthouse numbers are the **median of 3 runs**.

---

## 1. Works

| Bar | Measured by |
|---|---|
| Zero console errors and zero uncaught page errors from the site's own code, at every viewport, in every walk variant | Walk listens to `console` (`error`, `warning`) and `pageerror`. Browser-internal GL driver messages are filtered by pattern; the filter list is in the walk and every entry needs a reason comment. |
| Every link resolves | Walk collects every `href`/`src` on the page and in `projects.json`. Same-origin: HTTP 200. In-page `#id`: element exists. External: HTTP status < 400 through the proxy; known bot-blocking hosts (e.g. LinkedIn's 999) are listed with the reason and still must not be 404. Links the cloud sandbox's proxy refuses (github.com outside this repo) are reported as *unverifiable*, recognised by the proxy's own message, never counted as passing. |
| Every section, every card's warp jump, every timeline slide is visited | Walk asserts counts: 5 sections, `cards == entries with showInPortfolio`, `slides == heroes + workTopics` of timeline entries; each warp jump lands on the slide of the card's project. |
| Nothing overflows where it must fit | Per viewport: `scrollWidth - innerWidth == 0`; every visible descendant of the focused timeline slide lies inside the viewport (±1 px). Self-test: the walk injects an oversized element and must report it. |
| Keyboard reaches every control, with visible focus | Walk tabs through the page and the timeline; every interactive element (links, buttons, cards, nav dots, exit) receives focus, and its focused computed style differs from unfocused (outline / box-shadow). Order follows reading order. |
| Reduced motion respected | Walk variant with `reducedMotion: 'reduce'`: no running CSS animation longer than 0.01 s after load, warp jump skipped, hero video not requested. Every stylesheet with `transition`/`animation` has a `prefers-reduced-motion` block (grep check). |
| Readable without WebGL | Walk variant with WebGL unavailable: no errors, all sections and timeline content visible, a static background instead of a blank one. |
| Readable without JavaScript | Walk variant with JS disabled: every project's title, role, dates and description are in the DOM and visible. *Fails today — Phase B item 7.* |

## 2. Performance

| Bar | Measured by |
|---|---|
| Lighthouse mobile Performance ≥ 90 | Lighthouse, median of 3. Baseline 64. |
| LCP < 2.5 s | Lighthouse mobile. Baseline 6.5 s. |
| CLS < 0.1, and 0 from fonts | Lighthouse mobile, plus the walk's `PerformanceObserver('layout-shift')` sum at every viewport. |
| TBT < 200 ms | Lighthouse mobile. Baseline 60–70 ms. |
| Initial-load transfer budget | Walk records transfer bytes from navigation to network idle at 375×812 and 1920×1080, excluding `video/*` responses. **Total ≤ 600 KiB; JS ≤ 300 KiB; fonts ≤ 100 KiB; CSS ≤ 40 KiB; images ≤ 200 KiB.** Baseline ≈ 920 KiB without video (1,081 KiB with). Budget revisited only with a written reason here. |
| Responsive images | Every raster `<img>` over 40 KB has `srcset` + `sizes`, or a recorded reason why not (walk lists offenders). Lighthouse `image-delivery-insight` passes. |
| No layout shift from fonts | Self-hosted woff2, preloaded, with a metric-matched fallback (`size-adjust`/`ascent-override`); walk CLS = 0 from load to idle. |
| Timeline stays smooth on phones (GPU footprint) | `npm run perf` (`tests/perf-timeline.mjs`): 375×812 @2x touch, CPU ×4, every slide for 1 s — ≤ 20 composited layers that draw content, ≤ 3 frames over 50 ms in total. Walk guard on every slide: ≤ 2 slides promoted (`.is-near`) and the hero reel paused. Added after Patrick's report of lag partway down the CV on a phone (68 layers / ~18 Mpx CSS before). |

## 3. Accessibility

| Bar | Measured by |
|---|---|
| Lighthouse Accessibility ≥ 95 (target 100) | Lighthouse mobile. Baseline 97 (fails `color-contrast`); 100 since U4. |
| No serious/critical axe-core violations | The walk injects axe-core 4.11 (WCAG 2.0/2.1 A+AA + best practice) on the page and on every timeline slide at 375×812 and 1920×1080. Serious/critical fail the run; moderate/minor are listed in the report. Added in B2 after Lighthouse caught an `aria-prohibited-attr` the walk had missed. |
| Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24 px / 18.66 px bold and for UI component boundaries) | axe-core `color-contrast` run by the walk on every section **and every timeline slide** at 375×812 and 1920×1080. Body text on section fills was measured at 7.8–11.0:1 — keep it. |
| Alt text everywhere | axe `image-alt`; decorative images use `alt=""` and are listed as decorative in code comments. |
| Timeline controls operable and announced | Walk: enter/exit/next/previous/nav dots operable by keyboard alone; a polite live region announces "Slide x of N — title" after each step; focus moves into the timeline on enter and back to the trigger on exit. axe reports 0 serious/critical issues inside `#cv`. |

## 4. Presentation

| Bar | Measured by |
|---|---|
| Meta description, Open Graph, Twitter card with a designed preview | Walk checks `<head>`: description, `og:title/description/image/url/type`, `twitter:card/title/description/image`; `og:image` is an absolute URL that returns 200 and is 1200×630. |
| Favicon set | Walk: `.ico` (16/32/48) linked and ≤ 15 KiB; 180×180 apple-touch icon; `site.webmanifest` parses and declares 192 and 512 icons whose files exist at the declared size, each ≤ 30 KiB. No SVG icon: the PT logo is a raster brush mark, and a traced SVG would not be the same mark (STATUS D8). |
| `robots.txt` and `sitemap.xml` | Both exist, sitemap lists the canonical URL, robots references the sitemap. |
| Consistent type and spacing scale | Font sizes and spacing come from tokens in `base.css`; a grep check counts raw `font-size`/`margin`/`padding`/`gap` values outside the token set and must report 0 (exceptions listed inline with a reason). Added in Phase C. |
| Every interactive element has hover, focus and pressed states with eased motion | Walk forces `:hover`, `:focus-visible`, `:active` per element (CDP `CSS.forcePseudoState`) and asserts each state's computed style differs from rest; transitions use the easing tokens. Added in Phase C. |
| Designed 404 page | `404.html` exists; the walk's server mimics GitHub Pages (unknown path → `404.html` with status 404); screenshot reviewed. |

## 5. Uniqueness

| Bar | Measured by |
|---|---|
| Starfield, slide timeline and warp jump kept and refined | Walk screenshots of every slide and the mid-warp frame at every viewport, reviewed by eye each unit. |
| Any new effect serves "travel between projects", not decoration | Each new effect gets a Decisions row in STATUS.md naming how it expresses travel. No row, no effect. |

## Every unit ends with

Site walk green (all variants) · screenshots looked at · Lighthouse when
performance or accessibility could have changed · STATUS.md updated (current
unit, next, placeholder register, decisions) · commit · push `prototype` ·
three-line note: what changed, the measured result, what is next.
