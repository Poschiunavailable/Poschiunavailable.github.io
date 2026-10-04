# MOTION

How things move on this site, and why. Every effect must express the site's
idea — **travel between projects through space and time** — or give direct
feedback to the visitor's input. Decoration for its own sake doesn't ship
(QUALITY.md §5). Tokens live in `styles/base.css`; the scroll-linked engine is
`modules/motion.js`.

## Principles ("juice")

From game feel practice — Jonasson & Purho, *Juice it or lose it* (GDC Europe
2012); Vlambeer / Jan Willem Nijman, *The Art of Screenshake* (INDIGO 2013):

1. **Every input answers immediately.** Hover, focus and press each change
   something visible within one frame; the motion then finishes on its own
   time.
2. **Anticipation and overshoot.** Presses squash (scale down) and releases
   spring past rest before settling (`--ease-spring`). Nothing stops dead.
3. **Many small responses beat one big one.** A press is a squash *and* a
   glow *and* a few stars — each subtle.
4. **Depth sells space.** Things nearer the viewer move faster (parallax);
   things arriving come out of depth (slightly small and soft → sharp).
5. **Scroll is the throttle.** Scroll-linked motion follows the scroll
   position directly — never hijacks it, never animates on its own after the
   scroll stops (except springs settling).

## Rules

- **Reduced motion:** none of the motion here runs. Feedback stays (colour,
  outline, glow) — position, scale and particles go. JS checks
  `prefersReducedMotion()`; CSS has a `prefers-reduced-motion` block.
- **Phones:** transforms and opacity only; no permanent `will-change`; one rAF
  loop for all scroll-linked work, idle when nothing is in view. Measured by
  `npm run perf` (QUALITY.md §2).
- **No scroll hijacking.** Immersive timeline entry stays explicit (AGENTS.md).

## Tokens (`styles/base.css`)

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 90 ms | press-down (squash) |
| `--dur-fast` | 160 ms | colour, underline, small state changes |
| `--dur-base` | 280 ms | hover lift, release |
| `--dur-slow` | 560 ms | spring settle, glints |
| `--dur-reveal` | 820 ms | scroll-in reveal |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | arrivals, reveals |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | releases, pops — overshoots ~10 % |
| `--ease-press` | `cubic-bezier(.4, 0, .6, 1)` | squash on press |

## Effects and what they mean

| Effect | Where | Expresses |
|---|---|---|
| Squash on press, spring on release, lift + glow on hover | buttons, cards, nav dots, exit | Input feedback (principles 1–2) |
| Star glint sweeping across a button on hover | primary buttons | The star-chart motif reacting to attention |
| Star burst from the press point | primary buttons, cards | "Launch" — a press sets travel in motion |
| Magnetic pull towards the pointer (desktop) | primary buttons | Gravity of a destination |
| Underline drawn as a route line | text links | The constellation route, drawn on demand |
| Gate charge: ψ packet narrows, date sharpens, charge line fills | CV gate, while scrolling towards it | Anticipation before a launch — the time machine locking onto its departure date |
| Warp out: stage falls away at lightspeed, page fades in as the field slows | leaving the timeline | The return trip; the same starfield carries you back |
