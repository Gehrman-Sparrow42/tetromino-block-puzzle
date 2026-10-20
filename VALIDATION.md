# Remake verification - 2026-10-21

Verified on Windows with Node 24, JDK 21, Android SDK platform 36 and build tools 36.0.0.

- 77 Vitest tests pass: deterministic engine/rules, snapshot validation, storage migration/corruption/failures, native lifecycle adapters, timer formatting, and input ownership/cancellation.
- Strict TypeScript compilation and production Vite build pass. The production HTML also starts and accepts a hard drop when opened directly with the browser offline.
- 18 Playwright scenarios pass across phone, compact phone and desktop. The compact configuration is 360 x 600 CSS pixels with 24 px top and 48 px bottom native safe-area variables. Cases cover layout, hold/drop, pause/save/reload, settings, replacement confirmation, completion/stats, cancelled input, background pause and P-key navigation.
- A clean Gradle `assembleDebug lintDebug` passes. App lint reports "No issues found."
- APK signature verification passes (v2). Package ID `com.berkay.afterblock`, version 2.0.0, minimum API 24, target API 36. Permission inspection confirms no INTERNET permission; vibration and the AndroidX internal receiver permission are present.
- Installed APK passes smoke checks in an Android API 35 x86_64 emulator, WebView 124.0.6367.219, with Wi-Fi and mobile data disabled. The test asserts actual DOM/game state through the WebView debugging protocol, a hard drop, hardware Back pause/save, rapid Home/reopen pause, and saved-run recovery after stopping/restarting the native app process. No WebView page errors were captured in these transitions.

Argon (`gemini-4-argon-medium`) provided the implementation plan and independent review. Confirmed findings were fixed: legal negative piece origins in snapshots, floating-point deadline handling, stale gestures across piece changes, opposing-direction repetition, blocked-action sounds, countdown precision, pause keyboard behavior, native-safe-area sizing and native smoke-test assertions. A focused recheck reported no material findings in the supplied corrections. Physically held soft drop intentionally persists across piece locks/holds; discrete gestures belong to their original piece. Native testing also found and verified a fix for `onPause` transitions that skip `onStop`.

The APK is debug-signed for personal sideloading. There has been no physical phone test, so physical touch feel, haptics and device-specific behavior remain to be checked. The GitHub login cannot publish active workflow files; the tested local build route is used, and `scripts/android-debug.workflow.yml` is an inactive CI template. Native smoke uses a real process restart rather than manually reloading the WebView, which is not equivalent to Android lifecycle recreation.
