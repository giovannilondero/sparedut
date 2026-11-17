# 1. Offline rooms are hosted in the browser by the server's own code

Date: 2026-11-18 · Status: accepted · Spec #9, ticket #17

## Context

A player wants to play against the bots on their own, also when the game server is unreachable. Until now that meant a private room on the server, the one kind of room left out of the room list.

## Decision

A room with **Offline** reach is hosted in the player's own browser by the same `Hub`, `Room`, bots and navigation the server runs (`server/`), speaking the same protocol. `client/host.ts` builds a `Hub` that creates only Offline rooms; `client/host.worker.ts` runs it in a Web Worker, off the main thread, because frame rate is a hard constraint for this game. The client talks to either host through one `Connection` interface (`client/connection.ts`): `Net` for the server, `BrowserHost` for the worker. The server refuses Offline reach.

So the client bundle contains the room's host code on purpose. Do not remove it as dead server code.

## Alternatives rejected

- **A private room on the server.** Needs the server to be reachable, costs a room's physics and bots on the server for one player, and is the one exception to "every room on the server is listed".
- **A separate simulation for solo play.** A second room loop would drift from the server's: bots, rules and timings would play differently offline, and practice would not transfer. Every fix would be made twice.

## Consequences

- The worker bundle carries Rapier's WASM, the maps and the navigation graphs (about 4.7 MB before compression), fetched only when an Offline room is created.
- `server/hub.ts`, `server/room.ts`, `server/bot.ts` and `server/nav*.ts` must stay free of Bun- and Node-only imports.
- The `Hub` takes its clock from outside, so pausing an Offline room (#19) can stop the clock without the simulation knowing about pause.
