# Remake verification - 2026-10-21

Verified on Windows with Node 24, JDK 21, Android SDK platform 36 and build tools 36.0.0.

- 91 Vitest tests pass: deterministic engine/rules, snapshot validation, storage migration/corruption/failures, native lifecycle adapters, timer formatting, input ownership/cancellation, four theme palettes, and control geometry across 1,620 size/layout combinations.
- Strict TypeScript compilation and production Vite build pass. The production HTML also starts and accepts a hard drop when opened directly with the browser offline.
- 30 Playwright scenarios pass across phone, compact phone and desktop. The compact configuration is 360 x 600 CSS pixels with 24 px top and 48 px bottom native safe-area variables. Cases cover layout, hold/drop, pause/save/reload, settings, replacement confirmation, completion/stats, cancelled input, background pause and P-key navigation; theme changes/persistence; live control presets/sliders/reset; concise copy; and the settings preview at 320 px. Tested controls are at least 48 CSS pixels, bounded and non-overlapping.
- A clean Gradle `assembleDebug lintDebug` passes. App lint reports "No issues found."
- APK signature verification passes (v2). Package ID `com.berkay.afterblock`, version 2.1.0 (20100), minimum API 24, target API 36. Permission inspection confirms no INTERNET permission; vibration and the AndroidX internal receiver permission are present.
- Installed APK passes smoke checks in an Android API 35 x86_64 emulator, WebView 124.0.6367.219, with Wi-Fi and mobile data disabled. The test asserts actual DOM/game state through the WebView debugging protocol, a hard drop, hardware Back pause/save, rapid Home/reopen pause, and saved-run recovery after stopping/restarting the native app process, all four themes, and floating controls with size/opacity changes. Installing over the previous build with `adb install -r` succeeds. No WebView page errors were captured in these transitions.

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
