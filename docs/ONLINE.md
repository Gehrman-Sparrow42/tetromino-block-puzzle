# Online Battle and Linux deployment

The unified Afterblock app contains the offline modes, Story, tutorials, settings, and Online Battle. One Node.js server serves the bundled app at both `/` and `/play`, JSON health at `/health`, and WebSocket connections at `/ws`. Offline play and saves stay local to each browser or Android installation; online matches run on the server.

## Phone and PC on the same Wi-Fi

On Windows, run `scripts/online-lan.cmd` (or the existing `C:\Tools\LAUNCHERS\Launch_Afterblock_Online_Server.bat`). It builds the unified app and server, enables LAN listening for that process, and prints the phone URLs. Open the printed LAN address on the phone and `http://127.0.0.1:8172/` on the PC. Open **Online**, create a room on one device, join its six-character code on the other, then both press Ready. Keep both devices on the same Wi-Fi rather than mobile data or an isolated guest network.

If Windows blocks the connection, run `scripts/allow-online-lan.ps1` once as administrator. It allows only TCP port 8172 from the local subnet. Remove it later with `Remove-NetFirewallRule -Name 'Afterblock-LAN-8172'` in an administrator PowerShell. The launcher does not modify router forwarding or register a startup service. The PC must remain awake while hosting.

Leaving or disconnecting forfeits a started round. Backgrounding an online client does not pause the server. Offline saves remain independent of a Battle round. The former standalone Online page has been retired; development, deployment and Android use the same app entry.

## Balance a match between friends

### App connection settings

Open **Online**, enter the server's `wss://` address ending in `/ws`, choose a name and press **Connect**. Successful endpoint choices are saved separately from solo settings. A hosted browser app proposes its own server; Android and a standalone HTML file use a saved address or the optional public build default `VITE_ONLINE_SERVER`. There is no automatic connection on app startup. A server outage does not prevent solo play.

For a browser on a trusted private network, use the LAN launcher's address and explicitly enable the unencrypted-LAN checkbox when needed. Android deliberately rejects `ws://` even on a LAN; it needs a valid HTTPS/WSS server. The manifest grants Internet permission but keeps cleartext traffic and mixed content disabled. Opening Online pauses and preserves the local solo run; an online match itself cannot pause.

After creating or joining a room, expand **Match balance**. The host can set each player's **outgoing attack** independently. A nerf makes that player's clears send fewer garbage rows; a buff makes them send more. Falling speed is identical for both players.

| Choice | Outgoing attack |
| ------ | --------------: |
| Nerf 3 |             50% |
| Nerf 2 |             70% |
| Nerf 1 |             85% |
| Normal |            100% |
| Buff 1 |            120% |
| Buff 2 |            140% |
| Buff 3 |            170% |

Both players default to Normal. **Reset to equal** restores Normal for both. The host can nerf the stronger friend or buff the less experienced friend. These settings are manual, not a skill rating. Each player has one selection; nerf and buff do not stack on the same player.

Both players see the choices before and during the match. Any actual change clears both Ready states; settings lock when countdown begins. Only the server applies attacks and host changes. If the host leaves a waiting lobby, the remaining player becomes host. New-room membership starts with Normal; offline preferences and saves stay independent.

## Attack and garbage rules

Ordinary singles send 0 rows, doubles 1, triples 2 and Tetrises 4. Full T-spin singles/doubles/triples send 2/4/6; minis send 1/2 for one/two cleared rows. A difficult back-to-back clear adds 1, combos add `min(4, floor(combo / 2))`, and a perfect clear adds 4. No clear means no attack.

The sender's tier scales the combined attack. Integer hundredths carry between clears so nerfed small attacks accumulate rather than disappearing. Incoming garbage cancels first, oldest rows first; only the remainder is sent. For example, ten ordinary Tetrises with no bonuses generate 40 rows at Normal, 28 at Nerf 2 and 68 at Buff 3 before cancellation. Actual play may add bonuses.

Uncancelled attacks queue neutral garbage rows with one hole per row. Holes use a separate server-owned generator and do not change the seeded piece sequence. Each packet uses one shared hole column. Rows mature after 750 ms and rise only after the receiving player locks a piece, after resolving that lock's outgoing attack/cancellation. At most eight rows rise per lock and forty rows may be pending; excess queued attacks are discarded to bound memory. Overflow or collision at the spawn area ends the round. Incoming and Sent counters appear beside the board.

Both players use ordinary progressive Marathon gravity from level one, with the normal clocks, movement and lock delay. The earlier gravity-handicap implementation was replaced by these outgoing-attack tiers.

The online client coalesces rendering into animation frames, skips board/preview painting when its pixels have not changed, and retains only the latest received state while a background tab is not painting. The server serializes a shared publication once for both peers. The authoritative 50 ms simulation, 20 Hz snapshots and existing backpressure limits remain in place; this does not add client prediction or establish an internet-latency benchmark.

## What runs now

- An HTTP/WebSocket server with versioned messages, six-character room codes and two-player lobbies; loopback by default, LAN listening by explicit opt-in.
- Create, join, leave, ready and a three-second server-controlled countdown.
- A server-authoritative Battle round using the existing engine with per-player outgoing-attack balance. Both players receive the same seeded piece sequence at their own pace. The server advances gravity, accepts sequenced gameplay commands, broadcasts board views at 20 Hz and declares a topout result.
- Disconnecting or leaving after the countdown begins forfeits the round. Leaving a waiting lobby frees that seat and clears readiness. A finished room expires after one minute; waiting rooms expire after 15 minutes; rooms have a one-hour maximum lifetime. Empty rooms are removed immediately.
- A browser-compatible `OnlineClient` with a welcome/version handshake, validation, bounded buffering, cleanup and no automatic input replay. Importing it does not start a connection.
- Health endpoints, exact browser-origin checks, 4 KiB message limits, 120 messages/second per connection, connection/room caps, ping/pong cleanup and bounded outgoing snapshot buffering.

The app integrates Battle into its Online entry. There is no client prediction, reconnect grace, matchmaking, account authentication, or permanent server storage. The deployment files prepare a host; no public host or domain has been provisioned.

## Run locally

Use Node.js 24 and npm. From the checkout:

```sh
npm ci
npm run build
npm run online:build
npm run online:start
```

`online:start` runs the prebuilt server without rebuilding. During development, `online:server` rebuilds the server before starting it; build the app first whenever the UI changes. The server deliberately fails startup when its unified HTML is missing. Check `http://127.0.0.1:8172/health`, open `http://127.0.0.1:8172/`, and connect WebSocket clients at `ws://127.0.0.1:8172/ws`. Ctrl+C stops the process.

`scripts/online-server.cmd` builds the app and runs a loopback server. `scripts/online-lan.cmd` sets `ONLINE_LAN=1` and runs both builds with LAN access.

| Variable          | Default                                 | Purpose                                                                                                                                                                                                    |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`        | Development behavior                    | Set `production` for strict deployment configuration.                                                                                                                                                      |
| `ONLINE_HOST`     | `127.0.0.1`                             | Bind interface; development LAN mode defaults to `0.0.0.0`.                                                                                                                                                |
| `ONLINE_PORT`     | `8172`                                  | Shared HTTP/WebSocket port.                                                                                                                                                                                |
| `ONLINE_LAN`      | Off                                     | Development-only `1` allows private IPv4 origins and all-interface binding; rejected in production.                                                                                                        |
| `ONLINE_ORIGINS`  | Exact local development origins         | Comma-separated complete `http://` or `https://` origins. Required in production; wildcards, credentials, paths, and trailing slashes are rejected. When supplied, this replaces the development defaults. |
| `ONLINE_APP_PATH` | `dist/index.html` beside `dist-online/` | Optional absolute path or checkout-relative path to the prebuilt unified HTML; never resolved from the launcher's working directory.                                                                       |

Development defaults include the server's `localhost`/`127.0.0.1` origins, Vite ports 5173/5178, Capacitor's `https://localhost`, and the opaque `null` origin used by the standalone Desktop `file://` HTML. Production must explicitly include the public web origin and `https://localhost` when allowing the Android app. Origins are exact browser origins, not `ws://` endpoint URLs. Production does not add the opaque origin automatically: only append the exact `null` entry to `ONLINE_ORIGINS` if standalone HTML online access is deliberately wanted. Any opaque browser context can present that origin, so it does not identify a particular local file. The server does not trust forwarded headers to approve an origin. Origin-less native/test clients remain accepted; origin validation is not authentication.

Use HTTPS and `wss://` for public access. Private `ws://` addresses are a trusted-LAN development option, not an internet deployment configuration. Android should connect to `wss://YOUR_ACTUAL_HOST/ws`; its WebView origin remains `https://localhost`, so both origins belong in the allowlist.

## Deploy on Linux with Docker Compose and Caddy

The deployment files use Node.js 24, a non-root application user, the locked `ws` runtime package, a health check, and graceful SIGTERM shutdown. Build tooling and the Capacitor SDK stay out of the application runtime image. Caddy handles HTTPS and proxies both HTTP and WebSocket upgrades to the same application server. This follows [Docker's Node build guidance](https://docs.docker.com/guides/nodejs/) and [the Node image's non-root guidance](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md).

On a Linux host with Docker Engine and the Compose plugin already installed, clone or copy this repository, then:

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env: set DOMAIN to the actual public DNS hostname you control.
docker compose --env-file deploy/.env -f deploy/compose.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
curl --fail http://127.0.0.1:8172/health
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 app caddy
```

`DOMAIN` is required; the example intentionally supplies no hostname. Set it to a DNS hostname only, without scheme, port, or path. Point its A/AAAA records at the Linux host and permit inbound TCP 80/443 (and optionally UDP 443 for HTTP/3). Caddy obtains and renews public certificates when DNS and reachability are correct. Certificate data is retained in named volumes. See [Caddy's HTTPS prerequisites](https://caddyserver.com/docs/automatic-https) and [WebSocket proxy support](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

The app binds `0.0.0.0` inside its container so Caddy can reach it over the private Compose network. Its host publication is restricted to `127.0.0.1:8172`; only Caddy publishes public ports. The Compose allowlist is the exact `https://` public hostname plus Android's `https://localhost`. No server filesystem directory is exposed over HTTP. The application container is read-only, drops Linux capabilities, and cannot acquire new privileges.

Open `https://` at the configured hostname and use Online. For another app installation, use its `wss://` hostname with `/ws`. Confirm `/health` reports `status: ok` over HTTPS and complete a two-device room/Ready/movement/disconnect smoke test before inviting players. A successful container build or health response alone does not demonstrate usable internet latency or Android connectivity.

For an existing non-container reverse proxy, run the same prebuilt Node entry with `NODE_ENV=production`, an explicit `ONLINE_ORIGINS`, and `ONLINE_HOST=127.0.0.1`; proxy to port 8172 with WebSocket upgrades enabled. Do not use `ONLINE_LAN=1` in production. An explicit `ONLINE_HOST=0.0.0.0` is only needed when the chosen container/network boundary requires it.

To update or stop this deployment:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml down
```

Both restart and update disconnect every room because match state is in memory. Browser/Android local saves are unaffected. Ordinary `down` preserves Caddy volumes; do not remove them during routine updates. `unless-stopped` restarts services after failures or daemon restarts unless deliberately stopped. No actual Linux host setup, DNS update, certificate issuance, or external deployment is performed by this repository change.

## Client seam

```ts
import { OnlineClient } from "../src/online/client";

const client = new OnlineClient("ws://127.0.0.1:8172/ws");
const unsubscribe = client.subscribe((message) => {
  // Feed room updates into the lobby and snapshots into board renderers.
  console.log(message);
});
await client.connect();
client.createRoom("Alice");
// The other client calls joinRoom(code, "Bob").
// Both call setReady(true); then sendInput({ type: "HARD_DROP" }), etc.
// Before Ready, the host may call setBalance(playerId, {
//   attackLevel: 2 // -3..-1 nerfs, 0 normal, 1..3 buffs
// });
// leaveRoom() keeps the connection; close() disposes it.
```

`server/client-integration.test.ts` runs this complete flow with two real clients and an ephemeral local server. `addRoomLink(baseUrl, code)` constructs a future `/r/CODE` invitation path; there is **no hosted join page or Android App Link handling yet**. It should not be presented as a working public invitation.

## Protocol and trust boundary

`src/online/protocol.ts` owns the version, wire types and client-message parser. Clients may submit room requests and inputs only. They cannot submit clocks, boards, scores, attacks, pause commands or claimed results. The socket owns player identity; input messages do not select another player. Duplicate/out-of-order input sequences are rejected.

`server/rooms.ts` owns the room lifecycle and the shared engine state. `server/server.ts` owns transport limits and HTTP. `server/main.ts` reads environment settings and handles shutdown. The server uses fixed 50 ms simulation steps; overload slows the simulation rather than accepting client time. This is deliberately simple and needs latency/load measurement before real-time public play.

Snapshots include board rows (including the engine's hidden spawn rows), active-piece coordinates, Hold, one Next piece, score/lines/level, elapsed time, placed-piece count and acknowledged input sequence. They exclude the PRNG state and bag. These views are suitable input for a future opponent thumbnail; no screenshots or video are transmitted.

State is memory-only. Restarting the server ends all rooms. Room codes are invitations, not account authentication. The current limits are development safeguards, not production abuse protection or a measured capacity guarantee.

## Remaining work and verification

Room codes are invitations, not account authentication. State is memory-only, and a restart disconnects every match. The existing connection/message/room limits bound this single process; they are not a measured capacity or public-abuse guarantee. Use one instance until shared room routing and persistence are deliberately designed. Reconnect grace, client prediction, rematches, and public load/latency measurements remain separate work.

`npm run online:test` covers protocol validation, readiness/countdown, host-controlled balance, garbage rules, room expiry, actual WebSocket clients, disconnect outcomes, origin/size rejection, and HTTP routing. Server route tests ensure `/` and `/play` return the same supplied app, `/health` remains JSON, unknown/source/environment paths return 404, and callers without an app fixture retain root JSON compatibility.

`npm run build` creates the unified single-file app; `npm run online:build` typechecks and bundles the Node entry. The Docker build runs both. Browser and Android app integration are tested separately. Linux container execution, Caddy certificate issuance, and Android-to-public-server connectivity require the actual target environment and are not established by local Windows builds.
