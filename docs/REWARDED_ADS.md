# Rewarded continues and theme unlocks

The game and verification backend support opt-in Marathon continues and permanent-on-installation theme unlocks. Live advertising is **disabled by default**. This change does not install or initialize an advertising SDK, add publisher IDs, change Android permissions, deploy hosting, or publish a new APK.

## Theme unlocks

A fresh installation gets **Ink, LCD, Paper and Classic Arcade**. The other thirteen themes, including Amber Terminal, Glacier, Fired Clay and Blueprint, are available through Settings → Theme → Preview. One completed rewarded ad unlocks the selected theme, applies it, and saves ownership for offline use. An upgrade retains the previously selected nonstarter theme; it does not unlock the entire catalogue.

Preview changes the shell and Canvas temporarily. Back, cancellation or failure restores the owned selection. Ads unavailable is a disabled action, never a simulated production grant. Unlocks are saved before selection changes; if storage fails, retry can redeem the same in-session reward. Clearing app/browser data or uninstalling removes the local profile and unlocks. There is no account, cross-device restore or anti-tamper guarantee for client-owned cosmetics.

Theme attempts use `POST /v1/rewards/attempts` with `{ "placement": "theme", "profileId": "installation-id", "themeId": "amber" }`. The server binds the issued attempt to that exact theme and profile, rejects starter/unknown IDs, and permits one grant per profile/theme pair. Theme offers and receipts include `placement: "theme"`, `profileId` and `themeId`; they do not contain a row-clear reward. Claim request bodies cannot choose or change the target. A continue receipt cannot unlock a theme. The database migration adds scope fields without resetting existing continue grants.

The existing AdMob reward-item label **continue** and amount **1** remain compatible for both placements; the business reward comes from the server-issued attempt, not that label or client input. Call `requestThemeUnlock(profileId, themeId, signal)` through the same registered native driver. A driver must pass each attempt's `customData` to the SDK before showing its ad. For a no-network development preview, use `?rewardedAds=test`; completing/canceling its explicitly labelled Test ad exercises either placement.

## Player flow

After a recoverable Marathon top-out, an enabled provider offers **Watch ad · clear 2 rows** and **End run**. There is one continue per run. The reward removes exactly the bottom two board rows, shifts the remaining stack down, and retries the failed spawn. If two rows cannot make the spawn fit, no ad is offered. Points, lines, level, elapsed game time and piece counts are not increased by the reward.

An earned continue returns to Pause; the player explicitly resumes. Closing/skipping an ad, load failure, missing verification, or ending the run never grants a continue. Continued runs count as played games when finally ended but do not update unassisted personal bests. Sprint, Ultra, victories and online Survival do not offer this reward.

## Preview without any ads or backend

Run `npm run dev`, then open `http://127.0.0.1:5173/?rewardedAds=test`. The game-over offer explicitly says **Test ad**, with **Complete test ad** and **Cancel test ad** controls. This is only a UI/engine preview; it does not contact Google or prove that an ad was viewed. The flag is compiled out of production builds and cannot enable test rewards in the Desktop HTML or APK.

## Verification backend

Node.js 24 is required. Run `npm run rewards:test`, then `npm run rewards:server`. The Windows launcher is `scripts/rewards-server.cmd`; the workspace shortcut is `C:\Tools\LAUNCHERS\Launch_Afterblock_Rewards_Backend.bat`. It starts on demand, binds to `127.0.0.1:8173` by default and does not install a startup service.

| Setting             | Default / meaning                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `REWARDS_HOST`      | `127.0.0.1`; listening interface                                                                        |
| `REWARDS_PORT`      | `8173`                                                                                                  |
| `REWARDS_DATABASE`  | `artifacts/rewards/rewards.sqlite`; persistent SQLite ledger                                            |
| `REWARDED_AD_UNITS` | Empty disables reward endpoints. Comma-separated exact permitted `ad_unit` values from SSV.             |
| `REWARDS_ORIGINS`   | Explicit local Vite origins and `https://localhost`; configure exact deployed app origins when hosting. |

The root and `/health` return service health, including whether units are configured. No ad requests are made by a health check.

| Endpoint                              | Behavior                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/rewards/attempts`           | JSON `{ "runId": "opaque-stable-run-id" }`; returns attempt `id`, private bearer `token`, `rows: 2`, and expiry.                                                                                                 |
| `GET /v1/rewards/admob/ssv`           | Public callback for AdMob. Verifies ECDSA/SHA-256 against Google's cached public keys, exact original signed query, configured ad unit, reward item `continue`, amount `1`, timestamps, attempt and transaction. |
| `GET /v1/rewards/attempts/:id`        | Requires the attempt bearer token; returns pending, expired, verified or claimed.                                                                                                                                |
| `POST /v1/rewards/attempts/:id/claim` | Requires the same token and a verified reward. Returns a two-row receipt scoped to the run. Repeating the claim returns the same receipt, not another grant.                                                     |

Set SDK SSV `customData` to the server-issued attempt ID before showing the ad. Keep the bearer token in the app; do not put it in SSV custom data or logs. AdMob must be configured to call the public HTTPS callback URL with reward item **continue** and amount **1**. Two rows are the game's fixed business reward, not two ad impressions.

The client waits for both the native SDK earned event and server verification before claiming. SSV can be delayed; the client polls for up to 60 seconds, with a ten-second limit per HTTP request, then keeps the run ended with a retry/end choice. In-session retries retain the earned attempt and redeem it without showing another ad, including after a lost claim response. It does not grant optimistically. An already verified grant survives server restart. If the app ends the run or crashes before using that grant, there is currently no recovery inbox; do not advertise guaranteed cross-device or crash recovery.

There is a 15-minute attempt lifetime, at most five attempts per run and 10,000 stored attempts. Expired pending attempts are pruned after a further hour. Verified/claimed grants remain durable and count toward the cap; monitor database size and add a deliberate retention/recovery policy before wider release. Request-body, per-IP rate and exact-origin limits are included. Multiple server processes sharing one SQLite file use SQLite transactions; horizontally distributed deployments need a shared durable database instead of ephemeral local files.

## Enable in a future Android build

1. Create your own AdMob app and rewarded ad unit. Configure the public HTTPS SSV endpoint and reward described above. Verify it with AdMob's tool.
2. Integrate a compatible Android rewarded SDK/Capacitor adapter. Complete the SDK's consent/privacy flow before requesting ads, including any relevant age settings. Use Google's test units during development. Never use real ads for automated testing.
3. Register a `RewardedAdDriver` through `registerRewardedAdDriver()` **before** `startApp()`. Its `show({ customData, signal })` must attach SSV custom data, resolve `true` only after the earned event **and fullscreen dismissal**, resolve `false` on dismissal without earning, reject on load/show failure, and clean up listeners. Respect cancellation and never initialize/request ads merely by importing the module. The driver seam is implemented; a native SDK adapter is intentionally not bundled yet.
4. Build with `VITE_REWARDED_ADS_ENABLED=true` and `VITE_REWARDS_API_URL=https://your-reward-service.example`. The URL must be HTTPS; the build stays disabled if no driver is registered. Put local values in ignored `.env.local`; no secrets belong in `VITE_*` variables because those are public client configuration.
5. Add the SDK's Android app-ID metadata, network permission and platform configuration as part of that SDK integration. Rebuild/sync Android and test consent, unavailable inventory, reward/dismiss order, cancellation, app backgrounding and delayed SSV on a physical phone before publishing.

The current Android/HTML builds remain offline-capable and ad-free. GitHub distributes source and release files; it does not serve this Node verification backend through GitHub Pages.

## Trust and limits

The ledger proves that a permitted ad reward was verified and limits a run ID to one grant. Offline gameplay and local saves remain client-controlled: this does not prove a run was genuine or prevent a modified client from inventing new IDs. No accounts, paid currency, competitive rewards, or online anti-cheat guarantees are added. The original failed piece/queue and the assisted marker are preserved in normal saves.

References: [Google's SSV protocol](https://developers.google.com/admob/android/ssv), [rewarded-ad opt-in requirements](https://support.google.com/admanager/answer/7496282), and the [Capacitor AdMob adapter](https://github.com/capacitor-community/admob) as a possible future native integration. Native SDK integration and real AdMob callbacks have not been tested here; the backend tests use generated ECDSA keys and real HTTP calls.
