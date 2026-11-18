/**
 * The menu's decisions, driven the way a player drives the menu, with no browser: what each choice
 * turns into, which fields apply and why a request is refused.
 */
import { expect, test } from "bun:test"
import { focusOnScreen, MenuModel, type Remembered } from "../client/menu-model.ts"

const remembered = (over: Partial<Remembered> = {}): Remembered => ({
  name: "Toni",
  lang: "fur",
  primary: "cramar",
  sensitivity: 1,
  fov: 80,
  master: 0.8,
  music: 0.5,
  invertY: false,
  crouch: "hold",
  quality: "media",
  showInfo: false,
  autoRes: true,
  lastMode: "bataie",
  lastMap: "glemone",
  lastMinutes: 10,
  lastBots: 4,
  lastLevel: "pari",
  lastFf: false,
  ...over
})

/** A menu over plain remembered values; `saves` counts how often it asked to keep them. */
function menu(over: Partial<Remembered> = {}) {
  const values = remembered(over)
  const counter = { saves: 0 }
  const model = new MenuModel(values, () => counter.saves++)
  return { model, values, counter }
}

test("a LAN room with open access is created with the choices on the screen", () => {
  const { model } = menu()
  model.go("create")
  model.chooseReach("lan")
  expect(model.create()).toEqual({
    kind: "send",
    request: {
      t: "create",
      oneTap: false,
      room: { mode: "bataie", map: "glemone", minutes: 10, bots: 4, level: "pari", ff: false, reach: "lan", access: { kind: "open" } }
    }
  })
})

const created = (o: ReturnType<MenuModel["create"]>) => (o.kind === "send" && o.request.t === "create" ? o.request.room : null)

test.each([
  ["lan", "open", { reach: "lan", access: { kind: "open" } }],
  ["lan", "password", { reach: "lan", access: { kind: "password", password: "Cjavedal" } }],
  ["online", "open", { reach: "online", access: { kind: "open" } }],
  ["online", "password", { reach: "online", access: { kind: "password", password: "Cjavedal" } }],
  ["offline", "open", { reach: "offline" }],
  ["offline", "password", { reach: "offline" }]
] as const)("a %s room with %s access is created with the reach and access it applies", (reach, access, expected) => {
  const { model } = menu()
  model.go("create")
  model.chooseReach(reach)
  model.chooseAccess(access)
  model.typeRoomPassword("Cjavedal")
  const room = created(model.create())
  expect(room && { reach: room.reach, ...("access" in room ? { access: room.access } : {}) }).toEqual(expected)
})

test("access applies only to a LAN or Online room", () => {
  const { model } = menu()
  const applies = (reach: "offline" | "lan" | "online") => {
    model.chooseReach(reach)
    return model.fields.access
  }
  expect([applies("offline"), applies("lan"), applies("online")]).toEqual([false, true, true])
})

test("the password applies only with Password access, and never for an Offline room", () => {
  const { model } = menu()
  const applies = (reach: "offline" | "lan" | "online", access: "open" | "password") => {
    model.chooseReach(reach)
    model.chooseAccess(access)
    return model.fields.password
  }
  expect([applies("lan", "open"), applies("lan", "password"), applies("online", "password"), applies("offline", "password")]).toEqual([false, true, true, false])
})

test("create is refused when the name is missing, and the player is sent home to type it", () => {
  const { model } = menu({ name: "" })
  expect(model.create()).toEqual({ kind: "refused", reason: "needName" })
  expect(model.screen).toBe("home")
})

test("create is refused when Password access has no usable password", () => {
  const { model } = menu()
  model.go("create")
  model.chooseReach("online")
  model.chooseAccess("password")
  expect(model.create()).toEqual({ kind: "refused", reason: "passwordBad" })
  model.typeRoomPassword("   ")
  expect(model.create()).toEqual({ kind: "refused", reason: "passwordBad" })
  expect(model.screen).toBe("create")
})

test("a refused create remembers nothing; a created room remembers its choices", () => {
  const { model, values, counter } = menu()
  model.go("create")
  model.chooseMode("frico")
  model.chooseLevel("plevan")
  model.chooseMinutes(20)
  model.chooseBots(6)
  model.chooseReach("lan")
  model.chooseAccess("password")
  model.create()
  expect([values.lastMode, counter.saves]).toEqual(["bataie", 0])
  model.typeRoomPassword("Cjavedal")
  model.create()
  expect(values).toMatchObject({ lastMode: "frico", lastLevel: "plevan", lastMinutes: 20, lastBots: 6 })
  expect(counter.saves).toBe(1)
})

test("choosing a map remembers it at once: it is shown behind the menu", () => {
  const { model, values, counter } = menu()
  model.chooseMap("trincee")
  expect([values.lastMap, counter.saves]).toEqual(["trincee", 1])
  expect(created(model.create())?.map).toBe("trincee")
})

test("friendly fire is carried into the room", () => {
  const { model } = menu()
  model.chooseFriendlyFire(true)
  expect(created(model.create())?.ff).toBe(true)
})

test("a created room remembers friendly fire, and the next room starts with it", () => {
  const { model, values } = menu()
  model.chooseFriendlyFire(true)
  model.create()
  expect(values.lastFf).toBe(true)
  expect(new MenuModel(values, () => {}).choices.ff).toBe(true)
})

test("the screens that start a match need a name; the others do not", () => {
  const { model } = menu({ name: "" })
  for (const screen of ["create", "password"] as const) expect(model.go(screen)).toEqual({ kind: "refused", reason: "needName" })
  expect(model.screen).toBe("home")
  expect(model.go("armarie")).toEqual({ kind: "none" })
  expect(model.screen).toBe("armarie")
})

test("the name is remembered trimmed, and a typed name lets the player in", () => {
  const { model, values, counter } = menu({ name: "" })
  model.typeName("  Toni ")
  expect([values.name, counter.saves]).toEqual(["Toni", 1])
  model.go("create")
  expect(model.screen).toBe("create")
})

test("back goes home from any other screen, and does nothing at home", () => {
  const { model } = menu()
  model.go("settings")
  expect(model.back()).toBe(true)
  expect(model.screen).toBe("home")
  expect(model.back()).toBe(false)
})

test("the language chosen is remembered at once", () => {
  const { model, values, counter } = menu()
  model.chooseLanguage("it")
  expect([values.lang, counter.saves]).toEqual(["it", 1])
  model.chooseLanguage("it")
  expect(counter.saves).toBe(1) // the same language again changes nothing
})

test("the primary weapon chosen in the armoury is remembered at once", () => {
  const { model, values, counter } = menu()
  model.choosePrimary("cjampanili")
  expect([values.primary, counter.saves]).toEqual(["cjampanili", 1])
  model.choosePrimary("cjampanili")
  expect(counter.saves).toBe(1)
})

test("a setting changed in the form is remembered at once; the value it already has saves nothing", () => {
  const { model, values, counter } = menu()
  model.changeSetting("sensitivity", 1.5)
  model.changeSetting("quality", "alta")
  model.changeSetting("crouch", "toggle")
  model.changeSetting("invertY", true)
  expect(values).toMatchObject({ sensitivity: 1.5, quality: "alta", crouch: "toggle", invertY: true })
  expect(counter.saves).toBe(4)
  model.changeSetting("sensitivity", 1.5)
  expect(counter.saves).toBe(4)
})

const room = (code: string, over: object = {}) =>
  ({ code, host: "Toni", mode: "bataie", map: "glemone", players: 2, bots: 4, max: 16, phase: "Warmup", reach: "lan", access: "open", ...over }) as const

test("a code typed on the home screen joins its room, cleaned of spaces and case", () => {
  const { model } = menu()
  model.typeCode(" abcd ")
  expect(model.joinByCode()).toEqual({ kind: "send", request: { t: "join", code: "ABCD" } })
})

test("a code that is not four letters sends nothing", () => {
  const { model } = menu()
  model.typeCode("ABC")
  expect(model.joinByCode()).toEqual({ kind: "refused", reason: "codeBad" })
})

test("an open room in the list is joined without a password", () => {
  const { model } = menu()
  model.rooms([room("ABCD")])
  expect(model.joinFromList("ABCD")).toEqual({ kind: "send", request: { t: "join", code: "ABCD" } })
})

test("a password room in the list asks for its password, then joins with it", () => {
  const { model } = menu()
  model.rooms([room("ABCD", { access: "password" })])
  expect(model.joinFromList("ABCD")).toEqual({ kind: "none" })
  expect([model.screen, model.passwordFor]).toEqual(["password", "ABCD"])
  model.typePassword(" Cjavedal ")
  expect(model.joinWithPassword()).toEqual({ kind: "send", request: { t: "join", code: "ABCD", password: "Cjavedal" } })
})

test("an empty password is refused at the prompt", () => {
  const { model } = menu()
  model.askPassword("ABCD")
  expect(model.joinWithPassword()).toEqual({ kind: "refused", reason: "passwordBad" })
})

test("the prompt keeps what was typed when it asks again for the same room, and clears it for another", () => {
  const { model } = menu()
  model.askPassword("ABCD")
  model.typePassword("Cjavedal")
  model.askPassword("ABCD")
  expect(model.typedPassword).toBe("Cjavedal")
  model.askPassword("EFGH")
  expect(model.typedPassword).toBe("")
})

test("joining is refused without a name, from the list as by code", () => {
  const { model } = menu({ name: "" })
  model.rooms([room("ABCD")])
  expect(model.joinFromList("ABCD")).toEqual({ kind: "refused", reason: "needName" })
  model.typeCode("ABCD")
  expect(model.joinByCode()).toEqual({ kind: "refused", reason: "needName" })
})

test("the one-tap match is an Offline room with the remembered values, started at once", () => {
  const { model } = menu({ lastMode: "frico", lastMap: "trincee", lastMinutes: 20, lastBots: 6, lastLevel: "plevan" })
  expect(model.oneTap()).toEqual({
    kind: "send",
    request: { t: "create", oneTap: true, room: { mode: "frico", map: "trincee", minutes: 20, reach: "offline", bots: 6, level: "plevan", ff: false } }
  })
})

test("the one-tap match needs a name too", () => {
  const { model } = menu({ name: "" })
  expect(model.oneTap()).toEqual({ kind: "refused", reason: "needName" })
})

test("the room list keeps the host's order, and a full room cannot be chosen", () => {
  const { model } = menu()
  model.rooms([room("LAN1"), room("LAN2", { players: 16 }), room("ONL1", { reach: "online", access: "password" })])
  expect(model.roomList.map((r) => [r.room.code, r.selectable])).toEqual([
    ["LAN1", true],
    ["LAN2", false],
    ["ONL1", true]
  ])
  expect(model.joinFromList("LAN2")).toEqual({ kind: "refused", reason: "roomFull" })
})

test("a room the list no longer has cannot be joined from it", () => {
  const { model } = menu()
  model.rooms([room("ABCD")])
  model.rooms([])
  expect(model.joinFromList("ABCD")).toEqual({ kind: "refused", reason: "roomGone" })
})

test("the choices are every mode, map, bot skill, reach and access the game defines", () => {
  const { model } = menu()
  expect(model.options).toEqual({
    modes: ["bataie", "frico", "culine", "cjar", "tampieste"],
    maps: ["glemone", "osoppo", "trincee", "venzone", "predil", "maran"],
    levels: ["zovin", "pari", "plevan"],
    // LAN first: a room made with the menu's first choice is one friends nearby can join.
    reaches: ["lan", "online", "offline"],
    accesses: ["open", "password"],
    minutes: [5, 10, 15, 20],
    bots: [0, 1, 2, 3, 4, 5, 6, 7]
  })
})

test("a new room starts on the menu's first reach and access", () => {
  const { model } = menu()
  expect(model.choices).toMatchObject({ reach: "lan", access: "open", ff: false })
})

test("the creation choices start from the remembered values", () => {
  const { model } = menu({ lastMode: "cjar", lastMap: "maran", lastMinutes: 15, lastBots: 2, lastLevel: "zovin" })
  expect(model.choices).toMatchObject({ mode: "cjar", map: "maran", minutes: 15, bots: 2, level: "zovin" })
})

test("a wrong password from the host brings back the prompt for the same room, saying so and keeping what was typed", () => {
  const { model } = menu()
  model.rooms([room("ABCD", { access: "password" })])
  model.joinFromList("ABCD")
  model.typePassword("Cjavedal")
  model.joinWithPassword()
  model.hostRefused("ABCD", "wrongPassword")
  expect([model.screen, model.passwordFor, model.typedPassword, model.promptProblem]).toEqual(["password", "ABCD", "Cjavedal", "wrongPassword"])
})

test("the prompt says when the typed password is refused before sending, and forgets it when the room is chosen again", () => {
  const { model } = menu()
  model.rooms([room("ABCD", { access: "password" })])
  model.joinFromList("ABCD")
  model.joinWithPassword()
  expect(model.promptProblem).toBe("passwordBad")
  model.back()
  model.joinFromList("ABCD")
  expect(model.promptProblem).toBe(null)
})

test("the prompt shows the room it is for when the list has it, and only the code otherwise", () => {
  const { model } = menu()
  model.rooms([room("ABCD", { access: "password", host: "Mariute" })])
  model.joinFromList("ABCD")
  expect(model.promptRoom?.host).toBe("Mariute")
  model.typeCode("wxyz")
  model.joinByCode()
  model.hostRefused("WXYZ", "passwordRequired")
  expect([model.passwordFor, model.promptRoom]).toEqual(["WXYZ", undefined])
})

test("a screen opens on its first control, and going back lands on the home screen's tile that opened it", () => {
  for (const screen of ["create", "armarie", "settings", "vocabolari"] as const) {
    expect(focusOnScreen("home", screen)).toBe("first")
    expect(focusOnScreen(screen, "home")).toBe(screen)
  }
  // The password prompt is a dialog: it moves focus in and back by itself.
  expect(focusOnScreen("home", "password")).toBeNull()
  expect(focusOnScreen("password", "home")).toBeNull()
  // Drawn again on the same screen (a language change): focus stays where it is.
  expect(focusOnScreen("settings", "settings")).toBeNull()
  expect(focusOnScreen("home", "home")).toBeNull()
})

// ---------------------------------------------------------------- installing and updating the game

test("the install entry is a button while the browser offers to install, and one tap asks it to", () => {
  const { model } = menu()
  model.installSurroundings({ installed: false, byHand: false })
  expect(model.installEntry).toBe("hidden")
  model.installOffered()
  expect(model.installEntry).toBe("button")
  expect(model.install()).toEqual({ kind: "send", request: { t: "install" } })
  // The browser's prompt is used once: the entry waits for the browser to offer it again.
  expect(model.installEntry).toBe("hidden")
  expect(model.install()).toEqual({ kind: "none" })
  model.installOffered()
  expect(model.installEntry).toBe("button")
})

test("installing needs no name", () => {
  const { model } = menu({ name: "" })
  model.installOffered()
  expect(model.install()).toEqual({ kind: "send", request: { t: "install" } })
})

test("where the game is added to the home screen by hand, the install entry shows how", () => {
  const { model } = menu()
  model.installSurroundings({ installed: false, byHand: true })
  expect(model.installEntry).toBe("instructions")
  expect(model.install()).toEqual({ kind: "none" })
})

test("the install entry is hidden when the game runs installed, whatever the browser offers", () => {
  for (const byHand of [false, true]) {
    const { model } = menu()
    model.installSurroundings({ installed: true, byHand })
    model.installOffered()
    expect(model.installEntry).toBe("hidden")
  }
})

test("the install entry goes away once the game is installed from this page", () => {
  const { model } = menu()
  model.installOffered()
  model.installed()
  expect(model.installEntry).toBe("hidden")
  model.installOffered()
  expect(model.installEntry).toBe("hidden")
})

test("no update notice until a new version is waiting; then the menu shows it, and one tap loads it", () => {
  const { model } = menu()
  expect(model.updateNotice).toBe("hidden")
  expect(model.loadNewVersion()).toEqual({ kind: "none" })
  model.newVersionWaiting()
  expect(model.updateNotice).toBe("shown")
  expect(model.loadNewVersion()).toEqual({ kind: "send", request: { t: "update" } })
  // Loading: said so, and a second tap asks nothing more.
  expect(model.updateNotice).toBe("loading")
  expect(model.loadNewVersion()).toEqual({ kind: "none" })
})

test("the update notice is never shown during a match, and appears on return to the menu", () => {
  const { model } = menu()
  model.menuShown(false)
  model.newVersionWaiting()
  expect(model.updateNotice).toBe("hidden")
  expect(model.loadNewVersion()).toEqual({ kind: "none" })
  model.menuShown(true)
  expect(model.updateNotice).toBe("shown")
  model.menuShown(false)
  expect(model.updateNotice).toBe("hidden")
})
