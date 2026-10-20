# Afterblock

An offline, ad-free falling-tetromino game for Android and the browser. Built as a remake of Tetromino Block Puzzle; the original version remains on `main`, with this edition on `remake/android`.

## Play

- **Marathon:** endless play with increasing gravity every ten lines.
- **Sprint 40:** clear forty lines as quickly as possible.
- **Ultra 120:** score as much as possible in two minutes of active play.

Seven-piece bags, SRS quarter-turn rotation kicks, hold once per piece, five-piece next queue, ghost projection, 500 ms lock delay and a fixed fifteen-reset cap per piece. Scoring includes line clears, drops, consecutive-clear combos, back-to-back four-line clears/T-spins, and perfect clears. Runs pause when the app loses focus or enters the background, and restore paused after reopening.

Touch buttons support simultaneous two-thumb input and held movement. Optional hybrid controls add swipe movement and tap rotation on the board. Keyboard: arrows to move/soft drop, Z/X to rotate, C or Shift to hold, Space to hard drop, P/Escape to pause. The in-app guide explains controls and goals.

Settings include sound and volume, haptics, ghost, reduced motion, hybrid gestures, and repeat speed. Records and one resumable run are stored locally. There are no accounts, ads, analytics, remote assets or online leaderboards. The Android package does not request internet permission; optional haptics use vibration permission. Clearing app data or uninstalling removes saved progress.

## Development

Node.js 24 and npm are used for the locked build.

```sh
npm ci
npm run dev
npm test
npm run build
npm run test:e2e
```

For browser tests, first run `npx playwright install chromium` (or `--with-deps chromium` on Linux). Playwright starts its own development server. `dist/index.html` is a bundled single-file browser build; the Android package embeds this game locally. `npm run build:clean` is a compatibility alias for the same build, with no source rewriting.

## Android APK

App ID: `com.berkay.afterblock`. Minimum Android API 24 (Android 7.0), compile/target API 36. A recent Android System WebView is needed. Portrait is the preferred orientation; responsive browser layouts also support landscape.

The template at `scripts/android-debug.workflow.yml` defines an **Android debug APK** GitHub Actions workflow. Copy it to `.github/workflows/android-debug.yml` using a GitHub login with workflow scope to enable it. The current CLI login cannot publish workflow files, so APKs are built locally during this task. The workflow runs unit tests, TypeScript/Vite compilation, Capacitor sync, Gradle assembly/lint, and checks the APK's identity and permissions. It uploads the `Afterblock-debug` artifact containing the signed debug APK, package metadata and SHA-256. A second job installs the APK in an Android API 35 emulator with Wi-Fi/mobile data disabled, checks the rendered game, a hard drop, hardware Back, rapid background pause and resume after native process restart, and collects screenshots/logs. Debug signing is suitable for personal sideloading, not store publication. CI debug keys may change between builds; uninstalling a differently signed older APK may be required and clears its app data.

For a local build, install JDK 21 and Android SDK platform 36/build tools 36.0.0, set `ANDROID_HOME` and `JAVA_HOME`, then:

```sh
npm run android:sync
cd android
./gradlew assembleDebug lintDebug
```

On Windows use `gradlew.bat`, or `scripts/build-android.ps1 -JavaHome <JDK21> -AndroidSdk <SDK> -OutputDirectory <destination>`. The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:open` opens the native project in Android Studio. No keystore or SDK installation is included in the repository.

## Code map

- `src/contracts`: shared state, settings and action types.
- `src/engine`: deterministic seeded rules and snapshot validation, without browser dependencies.
- `src/ui`: Canvas renderer, responsive screens and cancel-safe keyboard/touch controls.
- `src/platform`: local persistence/migration, procedural audio, optional haptics and lifecycle adapters.
- `android`: Capacitor native shell and app resources.

Unit tests cover rules, persistence and platform boundaries; browser tests cover visible flows and mobile controls. Emulator checks exercise the installed APK through its real WebView and Android lifecycle in the tested system image. They do not substitute for checking touch feel, haptics and safe areas on the intended physical phone.
