/**
 * The fair's scenery against its collisions: built headless with a kit that records what it
 * draws, as `client/world.ts` would draw it. Every station is dressed, and nothing drawn stands
 * where a player walks: it lies inside a collision, flat on the ground, flush on a wall or out
 * of reach overhead.
 */
import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import type { Block } from "../shared/map.ts"
import { SAGRE, SAGRE_STATIONS } from "../shared/maps/sagre.ts"
import { CROUCH_HEIGHT, STAND_HEIGHT } from "../shared/physics.ts"
import { MOVE } from "../shared/movement.ts"
import { cylBetween, face, Inst, orient, sphere, type V } from "../client/world/geo.ts"
import type { K, SceneryKit } from "../client/world/scenery.ts"
import { scenery } from "../client/world/maps/sagre.ts"
import type { Region } from "../client/world/tex.ts"

/** Above this a decoration is a flat mark on the ground. */
const FLOOR = 0.06
/** The highest a standing player's head reaches in a jump. */
const REACH = STAND_HEIGHT + (MOVE.jump * MOVE.jump) / (2 * MOVE.gravity) + 0.1
/** How far a decoration may stand off a wall or a block: flush paint, a sign board. */
const FLUSH = 0.12

interface Drawn {
  readonly what: string
  readonly box: THREE.Box3
}

function dress(): Drawn[] {
  const drawn: Drawn[] = []
  const box = (what: string, min: V, max: V) => drawn.push({ what, box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)) })
  const region: Region = { u0: 0, v0: 0, u1: 1, v1: 1, aspect: 4 }
  const thin = (what: string, n: V, p: V, w: number, h: number) => {
    // a window or a door: flat on the wall, `w` wide and `h` tall around `p`
    const alongX = Math.abs(n[2]) > Math.abs(n[0])
    const d = 0.05
    box(what, alongX ? [p[0] - w / 2, p[1] - h / 2, p[2]] : [p[0], p[1] - h / 2, p[2] - w / 2], alongX ? [p[0] + w / 2, p[1] + h / 2, p[2] + n[2] * d] : [p[0] + n[0] * d, p[1] + h / 2, p[2] + w / 2])
  }
  const I = { vetro: new Inst(), cornice: new Inst(), scuri: new Inst(), porta: new Inst(), vaso: new Inst(), capitello: new Inst(), base: new Inst(), comignolo: new Inst() }
  const root = new THREE.Group()
  const kit: SceneryKit = {
    map: SAGRE,
    B: {
      add(key: K, g: THREE.BufferGeometry) {
        g.computeBoundingBox()
        drawn.push({ what: key, box: g.boundingBox!.clone() })
      }
    } as unknown as SceneryKit["B"],
    I,
    root,
    MATS: new Proxy({}, { get: () => new THREE.MeshBasicMaterial() }) as SceneryKit["MATS"],
    tex: {} as SceneryKit["tex"],
    atlas: { texture: new THREE.Texture(), signs: new Proxy({}, { get: () => region }), rose: region, clock: region, bannerB: region, bannerM: region } as SceneryKit["atlas"],
    R: Math.random,
    C: (hex) => new THREE.Color(hex),
    groundAt: () => 0,
    face,
    orient,
    cylBetween,
    sphere,
    roof: (x0, z0, x1, z1, yTop, _gable, rise = 2) => {
      box("roof", [x0 - 0.6, yTop - 0.5, z0 - 0.6], [x1 + 0.6, yTop + rise, z1 + 0.6])
      return { ridge: yTop + rise, alongZ: z1 - z0 >= x1 - x0, rise }
    },
    win: (n, p, w, h) => thin("window", n, p, w, h),
    door: (n, p, w, h) => thin("door", n, [p[0], p[1] + h / 2, p[2]], w, h),
    paint: (specs) => ({ material: new THREE.MeshBasicMaterial(), regions: specs.map(() => region) })
  }
  scenery.build(kit)
  root.updateMatrixWorld(true)
  // what the scenery adds as meshes of its own (merged signs, say): triangle by triangle
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    const p = g.getAttribute("position")
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrixWorld)
      drawn.push({ what: `mesh ${mesh.name}`, box: new THREE.Box3().setFromPoints([a, b, c]) })
    }
  })
  return drawn
}

const solids = SAGRE.blocks.filter((b) => b.look !== "terreno")
const near = (b: Block, p: THREE.Vector3) =>
  p.x >= b.min[0] - FLUSH && p.x <= b.max[0] + FLUSH && p.y >= b.min[1] - FLUSH && p.y <= b.max[1] + FLUSH && p.z >= b.min[2] - FLUSH && p.z <= b.max[2] + FLUSH
const { minX, maxX, minZ, maxZ } = SAGRE.bounds

/** A point of the drawing where a player could be, away from every collision; null if none. */
function walkedThrough(box: THREE.Box3): THREE.Vector3 | null {
  const lo = new THREE.Vector3(Math.max(box.min.x, minX), Math.max(box.min.y, FLOOR), Math.max(box.min.z, minZ))
  const hi = new THREE.Vector3(Math.min(box.max.x, maxX), Math.min(box.max.y, REACH), Math.min(box.max.z, maxZ))
  if (lo.x > hi.x || lo.y > hi.y || lo.z > hi.z) return null
  const n = (a: number, b: number) => Math.max(1, Math.min(40, Math.ceil((b - a) / 0.2)))
  const [nx, ny, nz] = [n(lo.x, hi.x), n(lo.y, hi.y), n(lo.z, hi.z)]
  const p = new THREE.Vector3()
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
    p.set(lo.x + ((hi.x - lo.x) * i) / nx, lo.y + ((hi.y - lo.y) * j) / ny, lo.z + ((hi.z - lo.z) * k) / nz)
    if (!solids.some((b) => near(b, p))) return p.clone()
  }
  return null
}

describe("the fair's scenery", () => {
  const drawn = dress()

  test("every station is dressed, the square's two halves included", () => {
    const bare = SAGRE_STATIONS.flatMap((s, i) => {
      const { area } = s
      const inside = drawn.filter(({ box }) => {
        const c = box.getCenter(new THREE.Vector3())
        return c.x >= area.minX && c.x <= area.maxX && c.z >= area.minZ - 1 && c.z <= area.maxZ + 1
      })
      return inside.length >= 6 ? [] : [i + 1]
    })
    expect(bare).toEqual([])
  })

  test("nothing drawn stands where a player walks", () => {
    const through = drawn.flatMap(({ what, box }) => {
      const p = walkedThrough(box)
      return p ? [`${what} at ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`] : []
    })
    expect(through).toEqual([])
  })

  test("the beam is drawn as it collides: room to crouch under it, not to stand", () => {
    const { beam } = SAGRE_STATIONS[1]
    expect(beam.min[1]).toBeGreaterThan(CROUCH_HEIGHT)
    expect(beam.min[1]).toBeLessThan(STAND_HEIGHT)
    const under = drawn.filter(({ box }) => box.max.y > FLOOR && box.min.y < beam.min[1] - 0.01 && box.max.x > beam.min[0] && box.min.x < beam.max[0] && box.max.z > -5.9 && box.min.z < 5.9)
    expect(under.map((d) => d.what)).toEqual([])
  })

  test("nothing invisible stands in the fair: every collision inside its bounds is drawn", () => {
    const hidden = SAGRE.blocks.filter((b) => b.mat === "invisibile" && b.min[1] < REACH && b.max[0] > minX && b.min[0] < maxX && b.max[2] > minZ && b.min[2] < maxZ)
    expect(hidden).toEqual([])
  })
})
