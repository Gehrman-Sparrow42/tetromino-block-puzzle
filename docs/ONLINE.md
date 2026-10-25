# Online Survival and LAN playtest

The online foundation is merged into `main`. A separate browser playtest lets two devices try Survival on a PC-hosted server. The installed offline APK and saved offline games remain independent; there is no online APK release or public hosting yet.

## Phone and PC on the same Wi-Fi

On Windows, run `scripts/online-lan.cmd` (or `C:\Tools\LAUNCHERS\Launch_Afterblock_Online_Server.bat`). It builds the page and server, enables LAN listening for that process, and prints the phone URLs. Open `/play` at the printed LAN address on the phone, and `http://127.0.0.1:8172/play` on the PC. Create a room on one, enter its six-character code on the other, then both press Ready. Keep the phone on the same Wi-Fi, not mobile data or an isolated guest network.

If Windows blocks the connection, run `scripts/allow-online-lan.ps1` once as administrator. It allows only TCP port 8172 from the local subnet. It does not change the Wi-Fi profile or router. Remove it later with `Remove-NetFirewallRule -Name 'Afterblock-LAN-8172'` in an administrator PowerShell.

The playtest has its own controls and opponent preview; it does not use or edit saved offline control layouts. Touch and keyboard input are supported. Leaving/disconnecting forfeits a started round; browser backgrounding does not pause the server. Leave and create another room to play again. The server stops when its process closes; nothing is registered for Windows startup. The PC must stay awake while hosting.

## Balance a match between friends

After creating or joining a room, expand **Match balance**. The host (the room's first player) can adjust either player independently:

| Setting        | Choices                          | Effect                                                                                                                                        |
| -------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Fall rate      | 50%, 75%, 100%, 125%, 150%, 200% | Lower helps by slowing automatic falling; higher adds pressure. 50% takes twice as long per gravity cell and 200% takes half as long.         |
| Starting level | 1–15                             | Selects the initial Marathon gravity level.                                                                                                   |
| Speed          | Progressive / Fixed              | Progressive increases a level every ten lines, up to 30; Fixed retains the selected level. The chosen fall-rate percentage applies to either. |

Both players start at 100%, level 1, Progressive by default. **Reset to equal** restores those values for both. For example, a newer player could use 75%, level 1, Fixed while an experienced friend uses 125%, level 3, Progressive. These are manual handicaps, not an automatic skill rating.

Both players see a compact summary before and during the match. Any actual balance change clears both Ready states, so both must ready again. Settings lock when the countdown begins, and only the server applies them. A guest cannot change settings or another room's player. The remaining player becomes host if the host leaves a waiting lobby. New-room membership starts with default balance; settings never alter offline preferences or saved games.

Gravity changes do not scale the match clock or the 500 ms lock delay. Soft drop still uses the engine's manual-drop interval (or faster automatic gravity), hard drop remains immediate, and both players retain the same seeded piece sequence. This is Survival balance; there are no attacks or garbage multipliers yet.

The playtest coalesces rendering into animation frames, skips board/preview painting when its pixels have not changed, and retains only the latest received state while a background tab is not painting. The server serializes a shared publication once for both peers. The authoritative 50 ms simulation, 20 Hz snapshots and existing backpressure limits remain in place; this does not add client prediction or establish an internet-latency benchmark.

## What runs now

- An HTTP/WebSocket server with versioned messages, six-character room codes and two-player lobbies; loopback by default, LAN listening by explicit opt-in.
- Create, join, leave, ready and a three-second server-controlled countdown.
- A server-authoritative Survival round using the existing engine with optional per-player gravity balance. Both players receive the same seeded piece sequence at their own pace. The server advances gravity, accepts sequenced gameplay commands, broadcasts board views at 20 Hz and declares a topout result.
- Disconnecting or leaving after the countdown begins forfeits the round. Leaving a waiting lobby frees that seat and clears readiness. A finished room expires after one minute; waiting rooms expire after 15 minutes; rooms have a one-hour maximum lifetime. Empty rooms are removed immediately.
- A browser-compatible `OnlineClient` with a welcome/version handshake, validation, bounded buffering, cleanup and no automatic input replay. Importing it does not start a connection.
- Health endpoints, exact browser-origin checks, 4 KiB message limits, 120 messages/second per connection, connection/room caps, ping/pong cleanup and bounded outgoing snapshot buffering.

There is no garbage/attack system, main-app UI integration, client prediction, reconnect grace, matchmaking, accounts, rematch UI or permanent storage yet. This is a local Survival playtest, not a public multiplayer release.

## Run locally

Use Node.js 24 and npm. In this checkout:

```powershell
npm ci
npm run online:test
npm run online:server
```

`online:server` typechecks and bundles the server, then starts it. Check `http://127.0.0.1:8172/health`; the root URL also returns JSON status. WebSocket clients connect to `ws://127.0.0.1:8172/ws`. Press Ctrl+C to stop it. Build the separate page first with `npm run online:playtest:build` to serve it at `/play`. The LAN launcher does both builds automatically.

`scripts/online-server.cmd` is the loopback-only launcher. `scripts/online-lan.cmd` explicitly opts into LAN access. For a manual LAN start in PowerShell, set `$env:ONLINE_LAN = '1'`, then run `npm run online:lan`.

Environment options:

| Variable         | Default                            | Purpose                                                                                                                                    |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ONLINE_HOST`    | `127.0.0.1`                        | Listening interface; loopback avoids accidentally exposing the prototype.                                                                  |
| `ONLINE_PORT`    | `8172`                             | HTTP and WebSocket port.                                                                                                                   |
| `ONLINE_LAN`     | Off                                | Set to `1` to listen on all interfaces and allow exact origins at this PC's private IPv4 addresses.                                        |
| `ONLINE_ORIGINS` | Explicit local development origins | Comma-separated exact browser origins. Defaults cover localhost/127.0.0.1 Vite ports 5173/5178 and the Android `https://localhost` origin. |

Origin-less native/test connections are accepted. Origin checking is not authentication. The client requires `wss://` outside loopback by default. Only the separate playtest explicitly opts into `ws://` at private IPv4 addresses (10/8, 172.16/12, 192.168/16). This unencrypted setup is for a trusted LAN. It does not provide an internet route or modify router forwarding. Public use needs TLS, a secure endpoint and deliberate deployment configuration.

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
//   gravityPercent: 75, startingLevel: 1, speedMode: "fixed"
// });
// leaveRoom() keeps the connection; close() disposes it.
```

`server/client-integration.test.ts` runs this complete flow with two real clients and an ephemeral local server. `addRoomLink(baseUrl, code)` constructs a future `/r/CODE` invitation path; there is **no hosted join page or Android App Link handling yet**. It should not be presented as a working public invitation.

## Protocol and trust boundary

`src/online/protocol.ts` owns the version, wire types and client-message parser. Clients may submit room requests and inputs only. They cannot submit clocks, boards, scores, attacks, pause commands or claimed results. The socket owns player identity; input messages do not select another player. Duplicate/out-of-order input sequences are rejected.

`server/rooms.ts` owns the room lifecycle and the shared engine state. `server/server.ts` owns transport limits and HTTP. `server/main.ts` reads environment settings and handles shutdown. The server uses fixed 50 ms simulation steps; overload slows the simulation rather than accepting client time. This is deliberately simple and needs latency/load measurement before real-time public play.

Snapshots include board rows (including the engine's hidden spawn rows), active-piece coordinates, Hold, one Next piece, score/lines/level, elapsed time, placed-piece count and acknowledged input sequence. They exclude the PRNG state and bag. These views are suitable input for a future opponent thumbnail; no screenshots or video are transmitted.

State is memory-only. Restarting the server ends all rooms. Room codes are invitations, not account authentication. The current limits are development safeguards, not production abuse protection or a measured capacity guarantee.

## Next implementation steps

1. Integrate the separate playtest into the main web/Android UI and its configurable controls. Offline blur/background pause cannot silently pause just one online player.
2. Add responsive local prediction/reconciliation and clock-offset handling, then test actual phone latency and background/disconnect cases.
3. Bring the playtest opponent preview into the main UI with movable/collapsible placement without changing saved local board or control positions.
4. Implement Battle separately: a garbage-cell representation, deterministic holes, attack/cancellation rules, arrival timing and tests. The protocol currently advertises Survival only.
5. Add bounded reconnect tokens/grace and rematches. Choose hosting/TLS, origin policy and public connection/rate limits before exposing the server. Add the real room URL handler and verified Android App Links only after a domain is chosen.

The existing APK has no internet permission by design. A future online Android build must add it deliberately while keeping offline modes independent from server availability.

## Verification

`npm run online:test` covers the client lifecycle, malformed/versioned input, readiness/countdown, host-only validated balance, consent resets and countdown locks, per-player gravity with equal clocks and seeds, sequenced authoritative commands, topout/disconnect outcomes, room limits/expiry, live HTTP and WebSocket transport, origin/size rejection, and two real `OnlineClient` instances. `npm run online:test:browser` also checks the two-client balance UI, reset to equal, compact-screen fit and absence of board repaints for clock-only updates.

`npm run build` verifies the unchanged offline browser entry. `npm run online:build` separately typechecks and bundles the server to ignored `dist-online/`. Neither command builds or replaces the user's Desktop APK.
