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
- Settings let the user choose a theme and control preset. Four themes are free on a fresh installation; other themes can be previewed and unlocked individually with one rewarded ad, then used offline. Upgrades retain the previously selected theme. Unlocks are local to the installation, with no account-based restore. The Gamepad editor supports dragging, per-group sizing and background opacity, staged save/cancel, and separate portrait/landscape placement.
- Runs, records and preferences are stored locally; backgrounding pauses play and reopening restores a paused run.

## Capabilities and Constraints

- Preserve the deterministic core rules: seven-piece bags, SRS quarter-turn kicks, hold, next queue, ghost, lock delay, line clears and scoring.
- Preserve Marathon, Sprint 40 and Ultra 120.
- Story adds twelve sequential stages with increasing line goals and deterministic speed phases, saved level progress and replay. Optional Basics and Advanced tutorials use isolated practice boards and never replace saved runs or affect records.
- Optional Online Battle shares the Android/browser app, selected theme and saved touch geometry. Players explicitly connect to a configurable server; offline runs and records remain independent. Android uses encrypted WSS, while a browser can explicitly allow a trusted LAN test. The server and Linux deployment files share one bundled app; no public host has been provisioned.
- Normal offline gameplay requires no ads, accounts, analytics, online leaderboards or network connection. Optional rewarded-ad preparation supports one two-row Marathon continue; live ads remain disabled until a native provider and verification backend are configured.
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
