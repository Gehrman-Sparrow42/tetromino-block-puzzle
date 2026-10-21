# Afterblock

<!-- impeccable:product-schema 1 -->

## Platform

web

The interface uses HTML, CSS and Canvas inside a Capacitor Android shell. Android phones are the primary delivery target; the same game also ships as a standalone offline HTML file. Preserve Android lifecycle handling, touch ergonomics and safe areas while using the web implementation's design conventions.

## Users

The owner wants a personal, playable Tetris clone for Android. No wider audience or commercial distribution plan has been established.

## Product Purpose

Provide a complete falling-tetromino game with familiar core rules, responsive controls and a board that is easy to see. Success means the user can start, play, pause and resume comfortably on a phone without unnecessary interface text or distractions.

## Operating Context

- Offline personal play on Android, with a browser build for local play and verification.
- Touch controls support simultaneous thumb input, held movement and optional board gestures. Gamepad uses a three-way left/right/down movement pad with a neutral center and no up button, plus separate rotation, hard-drop and hold actions. Keyboard controls remain available in the browser.
- Settings let the user choose a theme and control preset. The Gamepad editor supports dragging, per-group sizing and background opacity, staged save/cancel, and separate portrait/landscape placement. Other presets retain their shared spacing and height controls.
- Runs, records and preferences are stored locally; backgrounding pauses play and reopening restores a paused run.

## Capabilities and Constraints

- Preserve the deterministic core rules: seven-piece bags, SRS quarter-turn kicks, hold, next queue, ghost, lock delay, line clears and scoring.
- Preserve Marathon, Sprint 40 and Ultra 120.
- No ads, accounts, analytics, online leaderboards or network requirement for gameplay.
- Keep the playfield large and surrounding interface compact. Controls must remain distinguishable and usable across the supported themes and phone sizes.
- Preserve existing saves and preferences when changing the interface.
- The original game is archived on `saved/original`; the current Android remake is on `main`.

## Brand Commitments

The current app name is Afterblock. Use short, functional English labels. Avoid slogans, promotional prose and unnecessary explanation in the playing interface. The user explicitly requested multiple themes and translucent, configurable controls.

## Evidence on Hand

- `README.md`: features, controls, development and Android build instructions.
- `VALIDATION.md`: executed tests and their limits, including the absence of physical-phone validation.
- `src/engine`: executable rules and tests.
- `src/ui/themes.ts`, `src/ui/styles.css` and `src/ui/control-layout.ts`: the incumbent appearance and control geometry.
- `tests/browser/game.spec.ts` and `scripts/android-smoke.cjs`: browser and installed-Android checks.

## Product Principles

- Keep gameplay familiar while improving usability around it.
- Give the board and controls priority over decorative content.
- Let users adapt appearance and touch placement to their needs.
- Preserve offline operation and local progress.
- Verify actual behavior and appearance; distinguish emulator evidence from physical-phone experience.

## Open Decisions

No public release, store listing, additional languages or formal accessibility certification has been requested. Do not invent those commitments. The visual game is not currently playable using a screen reader alone.
