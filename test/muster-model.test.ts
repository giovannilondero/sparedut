/**
 * The Muster screen's state, fed the room's messages the way the game feeds it, with no browser:
 * what each member sees and what their presses send.
 */
import { expect, test } from "bun:test"
import { MusterModel } from "../client/muster-model.ts"
import type { RoomInfo, RosterEntry, Snapshot } from "../shared/protocol.ts"
import type { PrimaryId } from "../shared/weapons.ts"

const member = (id: string, over: Partial<RosterEntry> = {}): RosterEntry => ({
  id,
  name: id,
  team: "benandanti",
  primary: "cramar",
  ready: false,
  bot: false,
  away: false,
  onMap: true,
  ...over
})

const room = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  code: "GLMN",
  host: "Toni",
  hostId: "toni",
  mode: "bataie",
  map: "glemone",
  players: 3,
  bots: 1,
  max: 16,
  phase: "Muster",
  single: null,
  minutes: 10,
  level: "pari",
  ff: false,
  reach: "lan",
  access: "open",
  roster: [
    member("toni", { name: "Toni", primary: "mulin" }),
    member("bot-1", { name: "Pieri", team: "malandanti", bot: true, ready: true }),
    member("mariute", { name: "Mariute", team: "malandanti", primary: "miedi", ready: true })
  ],
  ...over
})

const snap = (phase: Snapshot["phase"], tick = 0, over: Partial<Pick<Snapshot, "score" | "players">> = {}) =>
  ({ t: "snap", tick, phase, score: { benandanti: 0, malandanti: 0 }, players: [], ...over }) as Pick<Snapshot, "phase" | "tick" | "score" | "players">

/** The Muster as `me` sees it, their remembered primary `own`, after the room's first messages. */
function muster(me: string, info: RoomInfo = room(), phase: Snapshot["phase"] = { tag: "Muster", starts: null }, own: PrimaryId = "doplete") {
  const model = new MusterModel(me, () => own)
  model.room(info)
  model.snapshot(snap(phase))
  return model
}

const open = (model: MusterModel) => {
  const view = model.view
  if (view.tag === "closed") throw new Error("the Muster screen is closed")
  return view
}

test("the room's roster shows as two teams, each member with their primary, ready mark and host crown", () => {
  const view = open(muster("mariute"))
  expect(view.sides).toEqual({
    tag: "teams",
    mine: "malandanti",
    benandanti: [{ id: "toni", name: "Toni", primary: "mulin", ready: false, bot: false, host: true, me: false }],
    malandanti: [
      { id: "bot-1", name: "Pieri", primary: "cramar", ready: true, bot: true, host: false, me: false },
      { id: "mariute", name: "Mariute", primary: "miedi", ready: true, bot: false, host: false, me: true }
    ]
  })
})

test("a change of team, primary or ready mark in the next room message shows in the Muster", () => {
  const model = muster("mariute")
  model.room(room({ roster: room().roster.map((r) => (r.id === "mariute" ? { ...r, team: "benandanti", primary: "doplete", ready: false } : r)) }))
  const sides = open(model).sides
  expect(sides.tag === "teams" && sides.mine).toBe("benandanti")
  expect(sides.tag === "teams" && sides.benandanti.map((m) => [m.name, m.primary, m.ready])).toEqual([
    ["Toni", "mulin", false],
    ["Mariute", "doplete", false]
  ])
})

test("the switch under the other team sends the player there", () => {
  expect(muster("mariute").switchTeam()).toEqual({ t: "team", team: "benandanti" })
  expect(muster("toni").switchTeam()).toEqual({ t: "team", team: "malandanti" })
})

test("the Tampieste's Muster shows one list of members, and has no team to switch to", () => {
  const model = muster("mariute", room({ mode: "tampieste" }))
  expect(open(model).sides).toEqual({
    tag: "alone",
    members: [
      { id: "toni", name: "Toni", primary: "mulin", ready: false, bot: false, host: true, me: false },
      { id: "bot-1", name: "Pieri", primary: "cramar", ready: true, bot: true, host: false, me: false },
      { id: "mariute", name: "Mariute", primary: "miedi", ready: true, bot: false, host: false, me: true }
    ]
  })
  expect(model.switchTeam()).toBeNull()
})

const tile = (model: MusterModel, primary: PrimaryId) => open(model).picker.tiles.find((t) => t.primary === primary)!

test("every primary is a tile with its class's health and speed, as numbers and as bars to compare at a glance", () => {
  const model = muster("mariute")
  expect(open(model).picker.tiles.map((t) => t.primary)).toEqual(["cramar", "doplete", "cjampanili", "mulin", "miedi", "gjalinis", "motosee"])
  expect(tile(model, "mulin")).toMatchObject({ health: 150, speed: 0.8 })
  // The bars run from half the lowest figure to the highest: the Mulin has the most health, the
  // Cjampanili the least; the Motosee is the quickest, the Mulin the slowest.
  expect(tile(model, "mulin").bars.health).toBe(1)
  expect(tile(model, "cjampanili").bars.health).toBeCloseTo(1 / 3)
  expect(tile(model, "motosee").bars.speed).toBe(1)
  expect(tile(model, "mulin").bars.speed).toBeCloseTo(5 / 9)
})

test("the player's remembered primary is the one chosen, and a tile pressed sends the new one", () => {
  const model = muster("mariute")
  expect(open(model).picker).toMatchObject({ locked: false, chosen: "doplete" })
  expect(model.pick("mulin")).toEqual({ t: "primary", p: "mulin" })
})

test("under single weapon the picker is locked on the host's choice and a press sends nothing", () => {
  const model = muster("mariute", room({ single: "cjampanili" }))
  expect(open(model).picker).toMatchObject({ locked: true, chosen: "cjampanili" })
  expect(model.pick("mulin")).toBeNull()
})

test("a guest marks themselves ready and takes the mark back; the count of ready members follows the room", () => {
  const model = muster("mariute", room({ roster: room().roster.map((r) => (r.id === "mariute" ? { ...r, ready: false } : r)) }))
  expect(open(model).actions).toMatchObject({ tag: "muster", start: null, ready: false, readyCount: { ready: 0, of: 2 } })
  expect(model.toggleReady()).toEqual({ t: "ready", ready: true })
  model.room(room())
  expect(open(model).actions).toMatchObject({ ready: true, readyCount: { ready: 1, of: 2 } })
  expect(model.toggleReady()).toEqual({ t: "ready", ready: false })
})

test("the host's start begins the countdown, or goes live at once when every other member is ready", () => {
  const waiting = muster("toni", room({ roster: room().roster.map((r) => (r.id === "mariute" ? { ...r, ready: false } : r)) }))
  expect(open(waiting).actions).toMatchObject({ start: "start", countdown: null })
  expect(waiting.start()).toEqual({ send: { t: "start" }, live: false })
  // Mariute is ready: the host's press is the one that goes live, and takes the pointer for the match.
  expect(muster("toni").start()).toEqual({ send: { t: "start" }, live: true })
  // Only the host starts.
  expect(muster("mariute").start()).toBeNull()
})

test("the countdown from the snapshots: whole seconds for everybody, cancel for the host", () => {
  const host = muster("toni", room(), { tag: "Muster", starts: 300 })
  host.snapshot(snap({ tag: "Muster", starts: 300 }, 100))
  expect(open(host).actions).toMatchObject({ start: "cancel", countdown: 4 })
  expect(host.cancel()).toEqual({ t: "cancel" })
  const guest = muster("mariute", room(), { tag: "Muster", starts: 300 })
  expect(open(guest).actions).toMatchObject({ start: null, countdown: 5 })
  expect(guest.cancel()).toBeNull()
  // Cancelled: the next snapshot has no countdown, and start is back.
  host.snapshot(snap({ tag: "Muster", starts: null }, 120))
  expect(open(host).actions).toMatchObject({ start: "start", countdown: null })
})

test("an Offline room's Muster opens with start focused; elsewhere on the screen's first control", () => {
  expect(open(muster("toni", room({ reach: "offline" }))).focus).toBe("m-start")
  expect(open(muster("toni")).focus).toBeNull()
  expect(open(muster("mariute", room({ reach: "offline" }))).focus).toBeNull()
})

/** Mariute joined a match already on and has not entered it: a bot keeps her seat on the map. */
const joined = (over: Partial<RoomInfo> = {}) =>
  room({ phase: "Live", roster: room().roster.map((r) => (r.id === "mariute" ? { ...r, ready: false, onMap: false } : r)), ...over })

test("joining a match already on: the score and the time left, and a confirm that enters it", () => {
  const model = muster("mariute", joined(), { tag: "Live", ends: 6000 })
  model.snapshot(snap({ tag: "Live", ends: 6000 }, 1200, { score: { benandanti: 23, malandanti: 19 } }))
  const view = open(model)
  expect(view.tag).toBe("joining")
  expect(view.live).toEqual({ tag: "teams", benandanti: 23, malandanti: 19, percent: false, left: 4800 })
  // No ready mark, no start and no line about the host starting: only the confirm.
  expect(view.actions).toEqual({ tag: "joining", nextMatch: false })
  expect(model.enter()).toEqual({ t: "enter" })
  expect(model.toggleReady()).toBeNull()
  // Entered: on the map, and the screen closes.
  model.room(room({ phase: "Live" }))
  expect(model.view.tag).toBe("closed")
})

test("joining a Tampieste already on: who is still standing instead of a score, and play from the next match", () => {
  const alive = { id: "x", x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, w: "cramar", hp: 100 } as const
  const model = muster("mariute", joined({ mode: "tampieste" }), { tag: "Live", ends: 6000 })
  model.snapshot(snap({ tag: "Live", ends: 6000 }, 0, { players: [{ ...alive, f: 1 }, { ...alive, f: 0 }, { ...alive, f: 1 }] }))
  expect(open(model).live).toEqual({ tag: "alone", alive: 2, left: 6000 })
  expect(open(model).actions).toEqual({ tag: "joining", nextMatch: true })
})

test("in the Muster nobody enters and nothing of a match is shown", () => {
  expect(open(muster("mariute")).live).toBeNull()
  expect(muster("mariute").enter()).toBeNull()
})

test("the chat shows the room's last 30 messages, with each sender's team", () => {
  const model = muster("mariute")
  for (let i = 1; i <= 32; i++) model.chat({ name: "Toni", team: "benandanti", text: `${i}` })
  model.chat({ name: "Bepi", team: null, text: "mandi" })
  const chat = open(model).chat
  expect(chat).toHaveLength(30)
  expect(chat[0]).toEqual({ name: "Toni", team: "benandanti", text: "4" })
  expect(chat.at(-1)).toEqual({ name: "Bepi", team: null, text: "mandi" })
})

test("the host has the bot tools, and single weapon in the Muster; a guest has neither", () => {
  expect(open(muster("toni")).hostTools).toEqual({ single: true })
  expect(open(muster("mariute")).hostTools).toBeNull()
  expect(muster("toni").setSingle("cjampanili")).toEqual({ t: "single", p: "cjampanili" })
  expect(muster("toni").setSingle("off")).toEqual({ t: "single", p: null })
  expect(muster("mariute").setSingle("cjampanili")).toBeNull()
})

test("alone with the bots, as in an Offline room, there is no count of ready members to show", () => {
  const offline = room({ reach: "offline", roster: room().roster.filter((r) => r.id !== "mariute") })
  expect(open(muster("toni", offline)).actions).toMatchObject({ start: "start", readyCount: null })
})
