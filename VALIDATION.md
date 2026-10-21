# Remake verification - 2026-10-21

Verified on Windows with Node 24, JDK 21, Android SDK platform 36 and build tools 36.0.0.

- 109 Vitest tests pass: deterministic engine/rules, snapshot validation, storage migration/corruption/failures, native lifecycle adapters, timer formatting, input ownership/cancellation, thirteen theme palettes, and control geometry across 1,620 size/layout combinations.
- Strict TypeScript compilation and production Vite build pass. The production HTML also starts and accepts a hard drop when opened directly with the browser offline.
- 39 Playwright scenarios pass across phone, compact phone and desktop. The compact configuration is 360 x 600 CSS pixels with 24 px top and 48 px bottom native safe-area variables. Cases cover layout, hold/drop, pause/save/reload, settings, replacement confirmation, completion/stats, cancelled input, background pause and P-key navigation; theme changes/persistence; live control presets/sliders/reset; concise copy; and the settings preview at 320 px. Tested controls are at least 48 CSS pixels, bounded and non-overlapping.
- A clean Gradle `assembleDebug lintDebug` passes. App lint reports "No issues found."
- APK signature verification passes (v2). Package ID `com.berkay.afterblock`, version 2.3.0 (20300), minimum API 24, target API 36. Permission inspection confirms no INTERNET permission; vibration and the AndroidX internal receiver permission are present.
- Installed APK passes smoke checks in an Android API 35 x86_64 emulator, WebView 124.0.6367.219, with Wi-Fi and mobile data disabled. The test asserts actual DOM/game state through the WebView debugging protocol, a hard drop, hardware Back pause/save, rapid Home/reopen pause, and saved-run recovery after stopping/restarting the native app process, all thirteen themes, and floating controls with size/opacity changes. Installing over the previous build with `adb install -r` succeeds. No WebView page errors were captured in these transitions.

Argon (`gemini-4-argon-medium`) provided the implementation plan and independent review. Confirmed findings were fixed: legal negative piece origins in snapshots, floating-point deadline handling, stale gestures across piece changes, opposing-direction repetition, blocked-action sounds, countdown precision, pause keyboard behavior, native-safe-area sizing and native smoke-test assertions. A focused recheck reported no material findings in the supplied corrections. Physically held soft drop intentionally persists across piece locks/holds; discrete gestures belong to their original piece. Native testing also found and verified a fix for `onPause` transitions that skip `onStop`.

The APK is debug-signed for personal sideloading. There has been no physical phone test, so physical touch feel, haptics and device-specific behavior remain to be checked. The GitHub login cannot publish active workflow files; the tested local build route is used, and `scripts/android-debug.workflow.yml` is an inactive CI template. Native smoke uses a real process restart rather than manually reloading the WebView, which is not equivalent to Android lifecycle recreation.

## Controls and appearance update

Argon provided the redesign plan and a separate independent review of the implementation. The review reported no material defects and one low-priority narrow-screen settings-preview clipping issue. That issue was corrected and covered by the 320 px browser regression. The core engine was preserved. Screenshots were inspected for all four themes, home, settings, and docked/floating controls.

Measured board dimensions at the same browser viewport before and after the update (CSS pixels):

| Viewport                               | Previous board | New default | New floating |
| -------------------------------------- | -------------- | ----------- | ------------ |
| 393 x 851                              | 215 x 432      | 306.5 x 615 | 375 x 752    |
| 360 x 600, top 24/bottom 48 safe areas | 130 x 262      | 151 x 304   | 219 x 440    |
| 430 x 932                              | 252 x 506      | 347 x 696   | 412 x 826    |

Control research used the original Nintendo Game Boy Tetris manual (D-pad and separate rotation buttons), Techmino touch-setting source (configurable layouts), and Android accessibility touch-target guidance. No game assets were copied. Controls use a minimum 48 CSS-pixel target and 8 px cluster gaps; on the tested Android WebView the viewport maps these CSS pixels to device-independent pixels.

## Impeccable setup and settings polish

Initialized Impeccable 4.7.0 globally for Codex and captured the Afterblock brief in PRODUCT.md. The scoped audit and evidence are in `.impeccable/critique/setup-audit.md`; usage is documented in `docs/IMPECCABLE.md`. Raised settings range and select targets to 48 px, covered by the existing 30 browser scenarios. The full 91 unit tests, 30 browser scenarios, TypeScript/Vite build, Android assembly/lint and APK signature verification pass for 2.1.1. The standalone production HTML also passes offline hard-drop and pause/save checks. No active design hooks or live overlay were added to the game.

## Impeccable theme pack — 2.2.0

The user approved all nine themes presented on the localhost decision page, including the smaller alternative cards and Classic Arcade. They are selectable alongside the original four. `THEME_IDS` drives persistence validation and browser coverage; the Settings list derives labels from the actual palette catalog. Core engine files are unchanged.

- 94 unit tests and 30 browser scenarios pass. Theme coverage includes all thirteen palettes, settings persistence, unique board backgrounds, ordinary text/accent contrast >=4.5:1 on shell surfaces, seven distinct static patterns in Movement Score and Data Field, and finite/nonnegative tiny-canvas geometry. These are targeted checks, not accessibility certification.
- Batched rendering covers all nine new home, game and settings views at393x851, plus Basalt at1440x900 and360x600. The settings layout was also checked at320/360px after resize settled. Demonstration game screenshots use a validated synthetic run fixture; displayed scores are not personal records.
- Local Familjen Grotesk and Newsreader fonts embed in the single-file HTML, with SIL OFL licenses and source records under `src/ui/fonts/`. No runtime font requests are needed. The build is approximately802kB uncompressed,399kB gzip.
- Final Impeccable mechanical scan found no issues in the changed UI files. A fresh independent native subagent applied the bundled finish-reviewer instructions and returned `ship` with no material fixes, within the supplied code-led web-render scope. The harness could not select the custom shipped agent role directly. Catalog inspiration images could not be viewed through the web tool; the review makes no pixel-fidelity claim against those images.
- Strict TypeScript/Vite build, Android assembly/lint and APK signature verification pass. Installed Android API35/WebView124 testing runs offline, selects all thirteen themes and checks gameplay, Back/Home pause, native process-restart recovery and floating controls. The native screenshot check waits for the actual Basalt Canvas pixel before capture, rather than treating immediate DOM theme selection as render proof. Physical-phone ergonomics and haptics remain unverified.

## Three-way Gamepad and control editor — 2.3.0

The user approved a gamepad-style scheme with no up button. New/default Gamepad controls use a left/right/down T-pad, neutral center and independently captured right-side action buttons. Existing layout preferences are preserved. The Android portrait lock was removed; customized Gamepad layouts are stored separately by viewport orientation.

- 109 unit tests pass, including source ownership, sliding/re-entry/neutral release, keyboard/touch source isolation, cancellation/blur/background/dispose, migration/deep-copy and collision-safe custom geometry.
- 39 browser scenarios pass across phone, compact phone with safe areas and desktop. New cases exercise real pointer dragging, resize/opacity persistence, native keyboard range keys, no up zone, staged Cancel/Escape, interrupted-drag rollback, independent orientation maps and current-orientation reset without mutating a paused run.
- Batched phone/compact/desktop/landscape game and editor captures were inspected; target bounds fit their stages. Layouts use at least48px targets; 8px group separation is verified in geometry tests. Demonstration screenshots use a synthetic game state.
- Android assembly/lint and APK signature verification pass. Offline installed API35/WebView124 smoke passes touch-event dragging, opacity changes, hardware Back cancellation, actual OS rotation, orientation-isolated placement persistence and three-way continuous touch input returning soft drop to neutral. Lifecycle/process-restart and all13theme checks remain passing. These are emulator/synthesized-input checks, not a physical comfort test.
- An independent Flash High review of the supplied editor/input/geometry/persistence/integration code found no material correctness defects. The review was read-only; executed browser/native checks supply the runtime evidence. Keyboard routing was subsequently narrowed to editor-owned keys and covered by the keyboard range regression.
