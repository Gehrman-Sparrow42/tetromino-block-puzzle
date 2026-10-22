# Online groundwork — development branch

This branch prepares private two-player online play. It does **not** add an Online button to the released app, change offline gameplay, deploy hosting, or publish a new APK. The original checkout remains on `main`.

## What runs now

- A loopback HTTP/WebSocket server with versioned messages, six-character room codes and two-player lobbies.
- Create, join, leave, ready and a three-second server-controlled countdown.
- A server-authoritative Survival round using the existing engine. Both players receive the same seeded piece sequence at their own pace. The server advances gravity, accepts sequenced gameplay commands, broadcasts board views at 20 Hz and declares a topout result.
- Disconnecting or leaving after the countdown begins forfeits the round. Leaving a waiting lobby frees that seat and clears readiness. A finished room expires after one minute; waiting rooms expire after 15 minutes; rooms have a one-hour maximum lifetime. Empty rooms are removed immediately.
- A browser-compatible `OnlineClient` with a welcome/version handshake, validation, bounded buffering, cleanup and no automatic input replay. Importing it does not start a connection.
- Health endpoints, exact browser-origin checks, 4 KiB message limits, 120 messages/second per connection, connection/room caps, ping/pong cleanup and bounded outgoing snapshot buffering.

There is no garbage/attack system, game UI integration, client prediction, reconnect grace, matchmaking, accounts, rematch UI or permanent storage yet. This is working local infrastructure, not a public multiplayer release.

## Run locally

Use Node.js 24 and npm. In this checkout:

```powershell
npm ci
npm run online:test
npm run online:server
```

`online:server` typechecks and bundles the server, then starts it. Check `http://127.0.0.1:8172/health`; the root URL also returns JSON status. WebSocket clients connect to `ws://127.0.0.1:8172/ws`. Press Ctrl+C to stop it. There is no game page served at this address yet.

On this computer, `C:\Tools\LAUNCHERS\Launch_Afterblock_Online_Server.bat` starts this worktree's server. The portable project launcher is `scripts/online-server.cmd`.

Environment options:

| Variable         | Default                            | Purpose                                                                                                                                    |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ONLINE_HOST`    | `127.0.0.1`                        | Listening interface; loopback avoids accidentally exposing the prototype.                                                                  |
| `ONLINE_PORT`    | `8172`                             | HTTP and WebSocket port.                                                                                                                   |
| `ONLINE_ORIGINS` | Explicit local development origins | Comma-separated exact browser origins. Defaults cover localhost/127.0.0.1 Vite ports 5173/5178 and the Android `https://localhost` origin. |

Origin-less native/test connections are accepted. Origin checking is not authentication. Insecure `ws://` client connections are limited to loopback; nonlocal clients require `wss://`. LAN/public use needs deliberate networking and TLS setup and has not been deployed or verified.

## Client seam

```ts
import { OnlineClient, addRoomLink } from "../src/online/client";

const client = new OnlineClient("ws://127.0.0.1:8172/ws");
const unsubscribe = client.subscribe((message) => {
  // Feed room updates into the lobby and snapshots into board renderers.
  console.log(message);
});
await client.connect();
client.createRoom("Alice");
// The other client calls joinRoom(code, "Bob").
// Both call setReady(true); then sendInput({ type: "HARD_DROP" }), etc.
// leaveRoom() keeps the connection; close() disposes it.
```

`server/client-integration.test.ts` runs this complete flow with two real clients and an ephemeral local server. `addRoomLink(baseUrl, code)` constructs a future `/r/CODE` invitation path; there is **no hosted join page or Android App Link handling yet**. It should not be presented as a working public invitation.

## Protocol and trust boundary

`src/online/protocol.ts` owns the version, wire types and client-message parser. Clients may submit room requests and inputs only. They cannot submit clocks, boards, scores, attacks, pause commands or claimed results. The socket owns player identity; input messages do not select another player. Duplicate/out-of-order input sequences are rejected.

`server/rooms.ts` owns the room lifecycle and the shared engine state. `server/server.ts` owns transport limits and HTTP. `server/main.ts` reads environment settings and handles shutdown. The server uses fixed 50 ms simulation steps; overload slows the simulation rather than accepting client time. This is deliberately simple and needs latency/load measurement before real-time public play.

Snapshots include board rows (including the engine's hidden spawn rows), active-piece coordinates, Hold, one Next piece, score/lines/level, elapsed time, placed-piece count and acknowledged input sequence. They exclude the PRNG state and bag. These views are suitable input for a future opponent thumbnail; no screenshots or video are transmitted.

State is memory-only. Restarting the server ends all rooms. Room codes are invitations, not account authentication. The current limits are development safeguards, not production abuse protection or a measured capacity guarantee.

## Next implementation steps

1. Add the lobby in the web/Android client and explicit online-session lifecycle handling. Offline blur/background pause cannot silently pause just one online player.
2. Add responsive local prediction/reconciliation and clock-offset handling, then test actual phone latency and background/disconnect cases.
3. Add the movable/collapsible opponent Canvas below Next without changing the saved local board or control positions.
4. Implement Battle separately: a garbage-cell representation, deterministic holes, attack/cancellation rules, arrival timing and tests. The protocol currently advertises Survival only.
5. Add bounded reconnect tokens/grace and rematches. Choose hosting/TLS, origin policy and public connection/rate limits before exposing the server. Add the real room URL handler and verified Android App Links only after a domain is chosen.

The existing APK has no internet permission by design. A future online Android build must add it deliberately while keeping offline modes independent from server availability.

## Verification

`npm run online:test` covers the client lifecycle, malformed/versioned input, readiness/countdown, same-seed starts, sequenced authoritative commands, topout/disconnect outcomes, room limits/expiry, live HTTP and WebSocket transport, origin/size rejection, and two real `OnlineClient` instances.

`npm run build` verifies the unchanged offline browser entry. `npm run online:build` separately typechecks and bundles the server to ignored `dist-online/`. Neither command builds or replaces the user's Desktop APK.
