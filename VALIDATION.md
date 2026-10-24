# Remake verification - 2026-10-22

## Theme-picker compatibility — 2.10.1

- Replaced the Theme native select popup with an expandable in-app list of 13 labelled radio choices and RGB swatches. Other settings retain their existing controls. Checked state, keyboard selection, immediate application and persisted choice are preserved. The native popup is an unconfirmed cause of the reported Samsung black screen; no Samsung device was available to reproduce it directly.
- Explicitly disable WebView view-level Force Dark and algorithmic darkening using Android-version guards, preserving application-defined light/dark palettes and the existing Android resource configuration.
- Eight theme unit tests and four focused browser cases pass: all 13 themes under light, dark and forced-colors settings; measured label contrast at least 4.5:1; 48 px targets; keyboard navigation; persistence; and distinct canvas output per theme. TypeScript/Vite, Capacitor sync, Android assembly/lint and signature verification pass.
- Installed offline API35/WebView124 testing with OS night mode enabled passes all 13 theme selections and reload persistence. The LCD picker remains light and readable under system dark mode, with no WebView errors. Physical Samsung confirmation remains outstanding. Artifacts: `theme-picker-native-2.10.1.json` and `theme-picker-native-dark-2.10.1.png` outside the repository. Full unrelated suites were not rerun.

## Fixed controls and movable board — 2.10.0

- Removed the Fixed/Dynamic selector and empty-space repositioning. Existing Dynamic settings normalize to Fixed. Controls stay at saved editor positions during play.
- Buttons may overlay the board, rails or other controls; only viewport bounds limit editor placement. Button edits no longer shrink or move the board. Gameplay controls receive pointer input above the board canvas.
- Board is selectable and draggable in the editor. Its normalized position persists independently per profile/orientation; manual size and square cells remain. Side information follows and clamps to the viewport.
- Minimal verification: 31 focused geometry/persistence tests and nine focused browser cases pass, including saved board/button positions, actual button activation over the canvas, unchanged board bounds after button edits, and inert empty-space taps. TypeScript/Vite, Capacitor sync, Android assembly and APK signature verification pass. Full suites, fresh lint/review and installed-native smoke were not rerun for this version.

## Per-preset customization — 2.9.0

- Buttons Balanced/Compact/Mirrored, Thumb, Left-handed and Floating store separate orientation maps and board-size settings. Existing active edits migrate to the selected profile. All seven buttons are independently editable; hidden buttons remain selectable for re-enabling and no longer occupy gameplay hitboxes or board-fitting obstacles.
- Direction buttons are separate. Controls may overlap, including during Dynamic repositioning; screen bounds and board/rail clearance still apply. One Next preview is shown while the internal engine queue remains unchanged. The redundant Spacing and Height settings are removed from the UI, with legacy fields retained for compatibility.
- Manual board size is 50–100% of the naturally fitted board, using the same square-cell, centered fitter in both orientations. A landscape regression covers the height-limited case.
- Reduced verification: 29 focused storage/geometry tests, strict TypeScript/Vite, and one comprehensive phone-browser flow pass. The browser flow covers profile recall/reload, seven editor choices, sizing, hiding/re-enabling, actual overlapping placement, one Next, and compact-screen rail containment at 50% board size. Android debug assembly and APK signature verification pass. Full suites and a fresh lint/independent review were not run.
- A brief installed offline API35/WebView124 check passes on the final APK: seven editor controls, board-size editing, hiding Down, one Next preview, a hard drop saved as one placed piece, and zero WebView errors. This is an emulator check, not physical-phone comfort verification.

## Dynamic placement across layouts — 2.8.0

Fixed/Dynamic placement is available in Connected buttons, Thumb, Left-handed and Floating. Empty-space taps move the nearest control group; movement buttons keep their arrangement, while action buttons can move individually. Actual button taps/holds remain direct. Active groups cannot relocate, unsafe overlap is rejected, board gestures remain reachable, and temporary positions reset on pause/blur/resize without overwriting saved homes.

Reduced verification at the user's request to conserve remaining usage: four focused phone-browser scenarios pass (all layouts, actual relocation, subsequent rotation/hard drop and reset on pause), TypeScript/Vite and Capacitor sync pass, and Android debug assembly passes. The full suites, fresh lint review and installed native smoke were not rerun for 2.8.0. Argon investigation was canceled to accelerate completion; it supplied no implementation changes.

## Larger board and connected movement buttons — 2.7.0

- At 384 × 853, the centered board grows from 256 × 512 to 284 × 568: 56 px more height, 23.07% more area, and approximately 28% of the previously estimated 200 px gap below the board. Cells remain square. Shared 48 px rails now use 2 px gutters; tall rails show larger 11 px labels, 18 px values and 48 × 36 px Next previews. Compact and landscape rails adapt to their available height.
- The reproduced Dynamic input defect treated visible arrow taps as neutral joystick starts. Left, Down and Right now use independent direct button capture in both modes. Taps act immediately, holds repeat, and dragging does not change the captured command. Dynamic only repositions the connected group from empty space, rejects collisions and restores its configured home on pause, blur or resize.
- Global and per-group size limits are 200%. Custom actions use actual available space rather than the packed-cluster size cap. Invalid edits retain their last valid placement and show feedback. A real editor interaction saves a 120 × 120 px Hold control; reopening preserves size and opacity without changing the paused run.
- 133 unit tests, 73 browser scenarios and strict TypeScript validation pass. The 26 skipped entries are duplicates of phone-only real-touch scenarios under the other two browser profiles. Geometry tests cover 2,160 legacy combinations, large custom controls, and 200% compact/landscape cases. Real touchscreen browser tests verify engine position, rotation, soft drop and placed-piece changes, including mirrored layouts, custom maps, simultaneous pointers and cancellation. The final suite passed 72 scenarios; its remaining Dynamic test used an obsolete upward-only relocation expectation and passed separately in all three profiles after its target and expectation were corrected.
- TypeScript/Vite, Capacitor sync, Android assembly/lint and APK signature verification pass (2.7.0 / code 20700). The standalone LCD HTML runs without network requests or page errors, renders a 284 × 568 board, and saves three hard-dropped pieces.
- The final installed APK passes offline API35/WebView124 checks: connected-button captured holds, safe empty-zone repositioning, simultaneous rotation, all thirteen themes, actual orientation changes, editor persistence/Back cancellation, background pause and native process-restart resume. No WebView errors. Package metadata confirms 2.7.0 / 20700; the enlarged Dynamic activation zone confirms the final web assets were installed. Desktop HTML/APK hashes match their source builds, with 2.6.0 backups retained outside the repository.
- Independent Argon Medium review identified restricted Dynamic placement and a false near-edge resize rejection. Both were fixed and verified. A packed global layout still respects the available screen width; individual controls can exceed that packed limit when space exists. Physical-phone comfort remains unverified.

## Historical play-screen overhaul — 2.6.0

- **137 unit tests and 60 browser scenarios pass.** The board starts at safe-area top + 4 px. Hold/statistics are on the left; Pause/Next5 are on the right. All presets, including saved legacy Floating, keep controls clear of the board. Regressions cover actual child containment at maximum settings, high saved custom maps, large scores, side insets, exact preview/editor parity, and landscape width/Dynamic input.
- TypeScript/Vite, Capacitor sync, Android assembly/lint and APK signature verification pass (version 2.6.0 / code 20600).
- Installed offline API35/WebView124 checks pass: top board/rails/clearance, all thirteen themes, actual rotation, editor/Back/persistence, background/process restart and simultaneous Dynamic movement/rotation. Zero WebView errors. Installing over the previous APK preserves settings and the saved run.
- Exported LCD/Floating HTML passes board-top 4 px, button clearance, hard-drop/save and zero-network checks at 384 × 853. Renders cover compact phone, normal phone and landscape.
- Argon Medium completed an independent design/reliability review. Its rail clipping and custom-placement findings were fixed and covered by regressions. Impeccable detector: zero primary and 36 advisory token/ramp findings. Physical-phone comfort for this updated build remains untested.

## Historical control repair — 2.5.0

- 134 unit tests and 51 browser scenarios pass, including exact preview/editor/gameplay coordinate parity, side safe areas, collision rejection, preset/movement persistence, dynamic deadzone, independent input ownership and cancellation.
- TypeScript/Vite build, Capacitor sync and Android debug assembly/lint pass; app lint reports no issues and the APK signature verifies. Package version is 2.5.0 (20500).
- Installed offline API35/WebView124 checks pass: all thirteen themes, actual OS rotation, editor drag/save, Android Back cancellation, background/process recovery, continuous fixed-pad input, dynamic origin and simultaneous two-finger movement/rotation. No WebView errors.
- Installing over 2.4.0 preserves an existing Fixed-level-4 Marathon run, one placed piece, LCD theme and legacy custom control settings. New preset/movement fields default safely.
- Exported standalone HTML passes editor, Dynamic movement, hard-drop/save and no-network checks at 393 x 851. Batched renders cover phone, compact and landscape. Settings preview icon centers match their button centers.
- Impeccable detector: zero primary and 32 advisory findings from incumbent theme/type/radius tokens. No claim that automated checks establish physical thumb comfort.
- Argon Medium was attempted in an isolated worktree but hit its 20-minute limit without edits. It was not restarted. Native agents completed geometry/persistence and editor/preview; Codex integrated dynamic input and performed final native/offline delivery checks.

The previous reports below are historical. The 2.5.0 APK has not been tested on the user's physical phone.

## Historical baseline — 2.3.0

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
- Batched rendering covers all nine new home, game and settings views at 393 x 851, plus Basalt at1440x900 and360x600. The settings layout was also checked at320/360px after resize settled. Demonstration game screenshots use a validated synthetic run fixture; displayed scores are not personal records.
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

## Board clearance fix — 2.3.1

The board now starts at the top of the play area and fits above or beside the actual Gamepad groups, including custom placements, with an 8 px gutter. Short screens use two action rows. All twenty rows remain visible without button overlap; the board scales down when necessary.

Verified: 110 unit tests, 39 browser scenarios, TypeScript/Vite build, Capacitor sync, Android debug assembly/lint (no lint issues), APK signature verification, and an offline standalone HTML render at 384 × 853 in the user's LCD theme. The rendered board and seven control bounds do not overlap. The updated APK has not been installed on the user's physical phone during this fix.

## Centered board correction — 2.3.2

Board fitting now requires horizontal centering, including custom control layouts. Verified 110 unit tests, 39 browser scenarios with a centerline assertion, TypeScript/Vite build and standalone LCD rendering at 384 × 853: the board center is exactly 192 px. Android assembly/lint and signature verification also pass.

## Marathon speed selection — 2.4.0

Added a Marathon setup sheet with Progressive / Fixed and starting levels 1–15. Progressive adds one level every ten lines, capped at 30. Fixed keeps its selected gravity and level after line clears. Existing snapshots without options retain their original level-one progression. Saved configuration is validated and resumes with the run; fixed Marathon records are stored separately.

Verified: 128 unit tests; 42 browser scenarios covering setup, save/resume, restart defaults and cancellation across phone/compact/desktop; TypeScript/Vite and Capacitor sync; Android assembly/lint; APK signature verification. Offline HTML at 360 × 600 starts and saves Fixed level 5 without page errors. Impeccable's detector returned no findings on the changed app UI. The updated APK was built but not installed on a physical phone or emulator during this change.

## Story campaign and optional tutorials — 2.11.0

Added twelve sequential Story levels with goals from 12 to 60 lines and four speed bands per level. The line-span-weighted falling rate increases at every stage, with recovery phases between faster bursts. Campaign progress and per-level records are stored separately; Story victories cannot overwrite Sprint records. Restart/resume retain the selected stage. Failed progress writes offer an explicit retry before Next unlocks.

Added voluntary Basics (five lessons) and Advanced (four lessons) tutorials. Prepared boards use the actual engine and require real actions/clears. Practice preserves saved runs, records and campaign progress, cleans up its input listeners, and pauses on backgrounding. Impeccable guided the compact, themed UI; its mechanical scan reported ten advisory findings and no warnings/errors. Phone and compact-phone screenshots were inspected.

Verified for this change:

- 172 unit tests and 31 online/reward tests pass.
- Full browser suite: 130 passed, 65 intentionally skipped by viewport scope, zero failures across phone, compact phone and desktop. This includes ten Story cases and twelve tutorial cases. Obsolete browser expectations were updated for the existing seven independent controls, one Next preview, fixed saved positions and permitted board overlap; production control geometry was not changed.
- Strict TypeScript/Vite production build, Capacitor sync, Android debug assembly and lint pass. Existing toolchain warnings remain; no new Android lint errors.
- Standalone file smoke passes tutorial movement objectives, Story start, hard drop and pause with no page errors.
- APK signature verification passes and matches the existing Desktop APK signer. Package `com.berkay.afterblock`, version 2.11.0 (21100), minimum API 24, target API 36. Permission inspection confirms no INTERNET permission.

The new APK was not installed on an emulator or physical phone during this change; no Android device was connected. Browser checks and native build/lint do not establish physical touch comfort. The campaign curve is an initial tested progression and may need tuning from player feedback. Live advertising remains unconfigured and disabled.
