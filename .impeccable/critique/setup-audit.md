# Afterblock setup audit — 2026-10-21

Impeccable 4.7.0 was initialized against the existing interface. This was a focused technical audit followed by a narrow polish pass, not a replacement design.

## Implementation integrity

Pass within the inspected scope: one deterministic game engine, bounded control geometry, four shared interface/canvas palettes, concise functional copy and local persistence. The mechanical detector returned no findings for `src/ui/styles.css` and `src/ui/app.ts`. That result is not a usability or accessibility certification.

## Health score

These are reviewer judgments for the inspected paths, not standardized test scores.

| Dimension                | Score | Evidence and limit                                                                                                                                                                       |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility            | 2/4   | Named controls, modal focus trapping and visible keyboard focus. Checked text pairs pass AA contrast. The Canvas board is not playable through a screen reader alone.                    |
| Performance              | 3/4   | Approximately 60 kB single-file production HTML; no remote assets or font downloads. Canvas rendering remains frame-driven; no physical-device frame-time profile was performed.         |
| Theming                  | 4/4   | Shared tokens and canvas palettes; all four settings themes rendered and switching/persistence covered by browser tests.                                                                 |
| Responsive design        | 3/4   | Phone, compact phone and desktop browser checks; 320 px preview regression; native safe-area simulation. Settings target issue fixed below. Physical-device touch feel remains untested. |
| Implementation integrity | 4/4   | Product-specific interface, saved-run behavior and bounded controls; no verified detector findings.                                                                                      |
| Total                    | 16/20 | Good within the inspected scope.                                                                                                                                                         |

## Findings

### [P2] Settings dropdowns and sliders had small touch targets — fixed

`src/ui/styles.css`: dropdowns were 42 px high and range inputs were 32 px high. Both now have 48 px vertical targets. Checkbox controls already sit inside full-width clickable labels. A browser assertion checks every settings dropdown and slider at the three configured viewports. Synthesized Chromium touch changed the size slider successfully.

### [P2] Screen-reader-only gameplay remains unsupported — limitation

The board has a general accessible name, but its changing grid and active piece are not exposed as an actionable nonvisual game. Menus and settings having labels does not make the game itself screen-reader accessible. A nonvisual gameplay mode would need separate interaction design and testing; this setup pass does not claim to provide one.

## Contrast evidence

Ratios calculated from the actual theme tokens, rounded here. These checks cover the listed pairs only; they do not certify every translucent control or rendered state.

| Theme | Text/background | Muted text/surface | Primary button text |
| ----- | --------------- | ------------------ | ------------------- |
| Ink   | 17.51           | 8.31               | 11.77               |
| LCD   | 7.33            | 5.41               | 8.87                |
| Neon  | 17.54           | 9.12               | 11.78               |
| Paper | 12.66           | 4.93               | 7.90                |

## Verification

- 91 unit tests and 30 browser scenarios pass, including the new 48 px settings assertions.
- All four settings themes rendered at 360 × 600 without horizontal page overflow; screenshots inspected.
- Synthesized Chromium touch on the size slider, hard drop and pause/save pass without page errors.
- Strict TypeScript and Vite production build pass.
- Android 2.1.1 assembly/lint and APK signature verification pass. The installed app passes the offline emulator smoke suite, including Back/Home pause, native process restart recovery, four themes and configurable floating controls.
- No new slogans, decorative sections, gameplay features or remote dependencies were introduced.

Keep subsequent commands scoped: `$impeccable polish settings` for refinement, or `$impeccable critique controls` for an ergonomic review. Test on the intended physical phone before making claims about comfort or haptics.
