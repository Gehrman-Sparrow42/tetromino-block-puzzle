# Afterblock

An offline, ad-free falling-tetromino game for Android and the browser. This Android remake is the current version on `main`. The original Tetromino Block Puzzle is preserved on [`saved/original`](https://github.com/Gehrman-Sparrow42/tetromino-block-puzzle/tree/saved/original).

## Play

- **Marathon:** endless play with increasing gravity every ten lines.
- **Sprint 40:** clear forty lines as quickly as possible.
- **Ultra 120:** score as much as possible in two minutes of active play.

Seven-piece bags, SRS quarter-turn rotation kicks, hold once per piece, five-piece next queue, ghost projection, 500 ms lock delay and a fixed fifteen-reset cap per piece. Scoring includes line clears, drops, consecutive-clear combos, back-to-back four-line clears/T-spins, and perfect clears. Runs pause when the app loses focus or enters the background, and restore paused after reopening.

The Gamepad layout has a large translucent three-way movement pad on the left: left/right across the top, a neutral center, and soft drop below. There is no on-screen up button. Slide a held thumb between directions while the other thumb uses the separate clockwise/counterclockwise rotation, hard-drop and hold buttons. The full board fits above or beside the controls, keeping the bottom rows visible. Short screens use a compact two-row action cluster.

Choose **Settings → Layout → Gamepad → Edit controls** to drag each control, resize it and adjust its background opacity. The movement pad moves/resizes as one group. Done saves; Cancel, Escape or Android Back discards the draft. Reset layout resets only the current orientation. Portrait and landscape positions are saved separately; controls stay bounded with at least 48 px targets and separation when the screen changes. Existing saved layout choices are preserved, while new installations default to Gamepad.

Thumb, Left-handed and Floating remain available as legacy layouts, with their size, opacity, spacing and height adjustments. Optional hybrid controls add swipe movement and tap rotation on the board. Keyboard: arrows to move/soft drop, Z/X to rotate, C or Shift to hold, Space to hard drop, P/Escape to pause. Help explains controls and goals.

Thirteen themes change the interface, board, previews and pieces. Settings → Theme includes the original Ink, LCD, Neon and Paper plus nine complete Impeccable treatments:

| Theme           | Appearance                                                  |
| --------------- | ----------------------------------------------------------- |
| Basalt          | Slate, chalk mint and faceted pastel blocks                 |
| Workshop        | Warm cream, navy and red with inset enamel blocks           |
| Night Sleeve    | Matte black, fine rules and outlined colored blocks         |
| Movement Score  | Printed ink, coral, editorial headings and patterned blocks |
| Botanical Folio | Cream, green and berry with botanical edge marks            |
| Gate Board      | Navy, amber and segmented blocks                            |
| Design Annual   | Near-white, periwinkle and precise inset blocks             |
| Data Field      | Black and ivory with seven static piece patterns            |
| Classic Arcade  | Dark blue and bright solid arcade colors                    |

Movement Score, Data Field and LCD have distinct internal patterns for all seven piece types. The nine new themes include locally bundled fonts, menu/settings treatments and control shapes; gameplay and control placement stay consistent. No theme uses strobing. The compact HUD and hold/next strip leave more space for the board.

Settings also include sound and volume, haptics, ghost, reduced motion, hybrid gestures, and repeat speed. Records, appearance, controls and one resumable run are stored locally. Existing settings migrate with defaults for the new appearance/control options. There are no accounts, ads, analytics, remote assets or online leaderboards. The Android package does not request internet permission; optional haptics use vibration permission. Clearing app data or uninstalling removes saved progress.

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

App ID: `com.berkay.afterblock`. Minimum Android API 24 (Android 7.0), compile/target API 36. A recent Android System WebView is needed. Portrait and landscape are supported on Android and in the browser, with independent customized Gamepad layouts.

The template at `scripts/android-debug.workflow.yml` defines an **Android debug APK** GitHub Actions workflow. Copy it to `.github/workflows/android-debug.yml` using a GitHub login with workflow scope to enable it. The current CLI login cannot publish workflow files, so APKs are built locally during this task. The workflow runs unit tests, TypeScript/Vite compilation, Capacitor sync, Gradle assembly/lint, and checks the APK's identity and permissions. It uploads the `Afterblock-debug` artifact containing the signed debug APK, package metadata and SHA-256. A second job installs the APK in an Android API 35 emulator with Wi-Fi/mobile data disabled, checks the rendered game, a hard drop, hardware Back, rapid background pause and resume after native process restart, and collects screenshots/logs. Debug signing is suitable for personal sideloading, not store publication. CI debug keys may change between builds; uninstalling a differently signed older APK may be required and clears its app data.

For a local build, install JDK 21 and Android SDK platform 36/build tools 36.0.0, set `ANDROID_HOME` and `JAVA_HOME`, then:

```sh
npm run android:sync
cd android
./gradlew assembleDebug lintDebug
```

On Windows use `gradlew.bat`, or `scripts/build-android.ps1 -JavaHome <JDK21> -AndroidSdk <SDK> -OutputDirectory <destination>`. The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:open` opens the native project in Android Studio. No keystore or SDK installation is included in the repository.

## Code map

Impeccable is initialized for design work on this project. See [the usage guide](docs/IMPECCABLE.md) for global installation paths, commands and the recorded audit.

- `src/contracts`: shared state, settings and action types.
- `src/engine`: deterministic seeded rules and snapshot validation, without browser dependencies.
- `src/ui`: Canvas renderer, responsive screens and cancel-safe keyboard/touch controls. `control-layout.ts` computes bounded touch geometry; `themes.ts` supplies shared interface/canvas palettes.
- `src/platform`: local persistence/migration, procedural audio, optional haptics and lifecycle adapters.
- `android`: Capacitor native shell and app resources.

Unit tests cover rules, persistence and platform boundaries; browser tests cover visible flows and mobile controls. Emulator checks exercise the installed APK through its real WebView and Android lifecycle in the tested system image. They do not substitute for checking touch feel, haptics and safe areas on the intended physical phone.
