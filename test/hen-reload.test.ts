/**
 * The hen cannon's reload, as the player sees it, across a pause of an Offline match: the
 * paused time never happened, for the animation, the clucks and the hen at the mouth alike.
 */
import { beforeAll, expect, test } from "bun:test"
import * as THREE from "three"
import type { Viewmodel } from "../client/contracts.ts"
import { firstPerson } from "../client/firstperson.ts"
import { MatchClock } from "../client/match-clock.ts"
import { WEAPONS } from "../shared/weapons.ts"

/** A 2D canvas that draws nothing: the weapons' textures are painted on one. */
const paint: object = new Proxy(() => paint, { get: (_, k) => (k === "canvas" ? {} : paint), set: () => true, apply: () => paint })
let createViewmodel: (camera: THREE.PerspectiveCamera) => Viewmodel
beforeAll(async () => {
  Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) } })
  ;({ createViewmodel } = await import("../client/viewmodel.ts"))
})

const FRAME = 1 / 60
const RELOAD = WEAPONS.gjalinis.reloadTicks / 60

/**
 * A player reloads an empty hen cannon, plays `before` seconds, pauses for `paused` seconds
 * (the frames keep coming), then plays `after` seconds. Returns what the cannon shows and how many hens clucked.
 */
function reloadAcrossPause(before: number, paused: number, after: number) {
  let real = 0
  const clock = new MatchClock(() => real * 1000)
  const vm = createViewmodel(new THREE.PerspectiveCamera())
  const mag = 0
  const reserve = WEAPONS.gjalinis.reserve
  let clucks = 0
  let start = 0
  function frame(reloading: boolean) {
    real += FRAME
    const progress = Math.min(1, (clock.now() / 1000 - start) / RELOAD)
    const view = firstPerson({
      chosen: "gjalinis",
      mount: null,
      alive: true,
      aim: 0,
      baseFov: 75,
      aspect: 16 / 9,
      mag,
      reserve,
      reload: reloading ? { progress, mag, reserve } : null,
      sinceShot: Infinity,
      look: { yaw: 0, pitch: 0 }
    })
    clucks = view.hensIn
    vm.update(FRAME, { speed: 0, grounded: true, aiming: false, sprinting: false, crouch: false, lookDx: 0, lookDy: 0, sgnape: false, spin: 0, henAtMouth: view.henAtMouth, reloadHens: view.reloadHens, reload: reloading ? progress : null })
  }
  vm.setWeapon("gjalinis")
  for (let i = 0; i < 60; i++) frame(false)
  start = clock.now() / 1000
  for (let s = 0; s < before; s += FRAME) frame(true)
  clock.pause()
  for (let s = 0; s < paused; s += FRAME) frame(true)
  clock.resume()
  for (let s = 0; s < after; s += FRAME) frame(true)
  // What is drawn in the hands and how the cannon's parts turn. The rig holding them sways with
  // frame time (breathing goes on in a pause); the parts and the hens move only with the reload.
  const shown: string[] = []
  for (const rig of vm.scene.children) for (const o of rig.children) o.traverse((p) => shown.push(`${p.visible ? 1 : 0}${p.rotation.x.toFixed(3)}`))
  return { shown: shown.join(" "), clucks }
}

test("a hen cannon reload paused halfway goes on from halfway: the hens drawn and the clucks agree", () => {
  const straight = reloadAcrossPause(RELOAD * 0.45, 0, RELOAD * 0.1)
  const withPause = reloadAcrossPause(RELOAD * 0.45, RELOAD * 3, RELOAD * 0.1)
  expect(withPause.clucks).toBe(straight.clucks)
  expect(withPause.shown).toBe(straight.shown)
})
