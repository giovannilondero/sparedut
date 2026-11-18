/**
 * An Offline room has no access: nobody else can come in. A LAN or Online room always has one.
 * The types say so, so a room that breaks the rule does not compile, wherever it is written.
 */
import { expect, test } from "bun:test"
import type { CreateOptions } from "../client/menu-model.ts"
import type { RoomSettings } from "../server/room.ts"
import { ClientMessage, type RoomInfo, type RoomSummary } from "../shared/protocol.ts"

const base = { mode: "bataie", map: "glemone", minutes: 10, level: "pari", ff: false } as const
const summary = { code: "ABCD", host: "Toni", mode: "bataie", map: "glemone", players: 1, bots: 0, max: 16, phase: "Warmup" } as const

test("an Offline room with access, or a LAN or Online room without it, cannot be written", () => {
  const rooms: RoomSettings[] = [
    { ...base, reach: "offline" },
    { ...base, reach: "lan", access: { kind: "open" } },
    // @ts-expect-error: an Offline room has nobody to keep out
    { ...base, reach: "offline", access: { kind: "open" } },
    // @ts-expect-error: a LAN room says who may come in
    { ...base, reach: "lan" }
  ]
  const options: CreateOptions[] = [
    { ...base, bots: 2, reach: "online", access: { kind: "password", password: "Cjavedal" } },
    // @ts-expect-error: an Offline room has nobody to keep out
    { ...base, bots: 2, reach: "offline", access: { kind: "open" } },
    // @ts-expect-error: an Online room says who may come in
    { ...base, bots: 2, reach: "online" }
  ]
  const summaries: RoomSummary[] = [
    { ...summary, reach: "online", access: "password" },
    // @ts-expect-error: an Offline room has no access to show
    { ...summary, reach: "offline", access: "open" },
    // @ts-expect-error: a LAN room shows its access
    { ...summary, reach: "lan" }
  ]
  const info: Pick<RoomInfo, "reach">[] = summaries
  expect([rooms.length, options.length, info.length]).toEqual([4, 3, 3])
})

test("the create message refuses an Offline room with access and a LAN or Online room without it", () => {
  const create = { t: "create", ...base, bots: 2, primary: "cramar" }
  expect(ClientMessage.safeParse({ ...create, reach: "offline" }).success).toBe(true)
  expect(ClientMessage.safeParse({ ...create, reach: "lan", access: { kind: "open" } }).success).toBe(true)
  expect(ClientMessage.safeParse({ ...create, reach: "offline", access: { kind: "open" } }).success).toBe(false)
  expect(ClientMessage.safeParse({ ...create, reach: "online" }).success).toBe(false)
})
