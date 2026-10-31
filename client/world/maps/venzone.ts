/**
 * The scenery of Vençon: the Gothic Duomo of Sant'Andrea (pointed portals, rose window,
 * buttresses, mullioned windows), the bell tower with its spire, the round chapel of San
 * Michele, the Gothic loggia and the Comune's clock, the gate arches, the
 * banners; outside, the narrow Tagliamento valley between the Plauris and the mountains
 * of Portis, with poplars along the moat.
 *
 * Only thin or unreachable decorations: everything you can touch lives in the blocks of
 * `shared/maps/venzone.ts` (merlons included).
 */
import * as THREE from "three"
import { CAMPANILE, CLOCK, COMUNE, DUOMO, GATE, SAN_MICHELE, WALL } from "../../../shared/maps/venzone.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { archPanel, archRing, boxAt, faceMatrix, rng, spandrel, type V } from "../geo.ts"
import type { Scenery, SceneryKit } from "../scenery.ts"
import { atlasDisc, atlasQuad, type Region } from "../tex.ts"

const STONE = "#d8d2c6"
const DARK = "#3a352e"

function build(kit: SceneryKit) {
  const { B, root, C, cylBetween, sphere, roof, atlas } = kit
  /** Adds a geometry drawn in a façade's plane (x along the wall, z outward). */
  const onFace = (k: Parameters<typeof B.add>[0], g: THREE.BufferGeometry, n: V, p: V, color?: THREE.Color) => B.add(k, g.applyMatrix4(faceMatrix(n, p)), color)

  /** Narrow Gothic window (lancet): dark opening with a pointed arch and its ring. */
  const lancet = (n: V, p: V, a: number, h: number) => {
    onFace("pietra", archPanel(a, h, a * 0.6), n, [p[0] + n[0] * 0.02, p[1], p[2] + n[2] * 0.02], C(DARK))
    onFace("pietraChiara", archRing(a, a + 0.14, 0.12, a * 0.6), n, [p[0] + n[0] * 0.06, p[1], p[2] + n[2] * 0.06], C(STONE))
    onFace("pietraChiara", boxAt([-a - 0.1, -h - 0.12, 0], [a + 0.1, -h, 0.14]), n, p, C(STONE))
  }
  const banner = (reg: Region, n: V, p: V, h: number) => {
    const m = faceMatrix(n, [p[0] + n[0] * 0.05, p[1], p[2] + n[2] * 0.05])
    B.add("atlas", atlasQuad(reg, h).applyMatrix4(m))
    B.add("ferro", cylBetween([-h * reg.aspect * 0.6, h / 2 + 0.02, 0.05], [h * reg.aspect * 0.6, h / 2 + 0.02, 0.05], 0.03, 0.03, 6).applyMatrix4(m), C("#c9a040"))
  }

  // --- Duomo of Sant'Andrea ------------------------------------------------------------
  {
    const { minX, maxX, minZ, maxZ, height: h } = DUOMO
    const fz = maxZ
    const cx = (minX + maxX) / 2
    // Main pointed portal with its lunette, and the two smaller ones.
    for (const [x, a, top] of [[17.5, 2, 5.5], [11.5, 1, 4], [23, 1, 4]] as const) {
      B.add("pietra", archPanel(a, 0, a * 0.45).translate(x, top, fz + 0.02), C("#6e665a"))
      B.add("pietraChiara", archRing(a, a + 0.5, 0.4, a * 0.45).translate(x, top, fz + 0.2), C(STONE))
      B.add("pietraChiara", archRing(a + 0.55, a + 0.75, 0.25, a * 0.5).translate(x, top, fz + 0.12), C("#c9c0ae"))
      for (const s of [-1, 1]) B.add("pietraChiara", cylBetween([x + s * (a + 0.25), 0, fz + 0.2], [x + s * (a + 0.25), top, fz + 0.2], 0.16, 0.14, 8), C(STONE))
    }
    // The rose window above the portal.
    const ry = 10.6
    B.add("atlas", atlasDisc(atlas.rose, 2.1, 40).translate(17.5, ry, fz + 0.02))
    B.add("pietraChiara", new THREE.TorusGeometry(2.22, 0.2, 8, 40).translate(17.5, ry, fz + 0.1), C(STONE))
    B.add("pietraChiara", new THREE.TorusGeometry(2.55, 0.1, 6, 40).translate(17.5, ry, fz + 0.06), C("#c9c0ae"))
    // Thin buttresses (30 cm): façade corners and along the sides.
    const buttress = (x0: number, z0: number, x1: number, z1: number) => {
      B.add("pietra", boxAt([x0, 0, z0], [x1, h - 1.2, z1]), C("#cfc8bb"))
      B.add("pietra", boxAt([x0 - 0.05, h - 1.2, z0 - 0.05], [x1 + 0.05, h - 0.9, z1 + 0.05]), C(STONE))
    }
    for (const x of [minX, 14, 21, maxX - 0.7]) buttress(x, fz, x + 0.7, fz + 0.3)
    for (const z of [-56, -62, -70, -76]) {
      buttress(minX - 0.3, z, minX, z + 0.8)
      buttress(maxX, z, maxX + 0.3, z + 0.8)
    }
    // Lancet windows along the sides, between the buttresses.
    for (const z of [-52, -59, -73, -79]) {
      lancet([-1, 0, 0], [minX, 10, z], 0.55, 3.4)
      lancet([1, 0, 0], [maxX, 10, z], 0.55, 3.4)
    }
    lancet([1, 0, 0], [maxX, 10, -66], 0.55, 3.4)
    // Small arch above the west side door.
    onFace("pietraChiara", archRing(1.5, 1.9, 0.3, 0.7), [-1, 0, 0], [minX - 0.1, 4, -64.5], C(STONE))
    // Steep gable roof, with a stone pediment; pinnacles at the corners.
    roof(minX, minZ, maxX, maxZ, h + 0.8, C("#cbc4b6"), 6.5, "pietra")
    for (const x of [minX + 0.35, maxX - 0.35]) {
      B.add("pietra", cylBetween([x, h + 0.8, fz + 0.15], [x, h + 3.2, fz + 0.15], 0.3, 0.26, 6), C(STONE))
      B.add("pietra", new THREE.ConeGeometry(0.34, 1.6, 6).translate(x, h + 4, fz + 0.15), C(STONE))
    }
    B.add("pietraChiara", new THREE.ConeGeometry(0.3, 1.4, 6).translate(cx, h + 0.8 + 6.5 + 0.9, fz), C(STONE))
    B.add("ferro", cylBetween([cx, h + 7.9, fz], [cx, h + 9.3, fz], 0.04), C("#3a3028"))
    B.add("ferro", cylBetween([cx - 0.4, h + 8.9, fz], [cx + 0.4, h + 8.9, fz], 0.04), C("#3a3028"))
    // Inside: hinted cross vaults above the pillars and the light on the altar.
    for (const z of [-54, -60, -66, -72]) {
      for (const x of [13, 22]) B.add("pietraChiara", boxAt([x - 0.75, 11.6, z - 0.75], [x + 0.75, 12, z + 0.75]), C(STONE))
      B.add("pietraChiara", spandrel(4.5, 3, 0.5, 1.2).translate(17.5, 12, z), C("#e6e0d4"))
    }
    const altar = new THREE.PointLight("#ffb46a", 50, 18, 1.3)
    altar.position.set(17.5, 4, -76)
    root.add(altar)
    // Benandanti banners on the west side, towards the main street.
    for (const z of [-55, -73]) banner(atlas.bannerB, [-1, 0, 0], [minX - 0.3, 7.5, z], 4.5)
  }

  // --- Bell tower: belfry mullioned windows and spire ---------------------------------------
  {
    const { minX, maxX, minZ, maxZ, height: h } = CAMPANILE
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const half = (maxX - minX) / 2
    for (const [n, p] of [
      [[0, 0, 1], [cx, 0, maxZ]],
      [[0, 0, -1], [cx, 0, minZ]],
      [[1, 0, 0], [maxX, 0, cz]],
      [[-1, 0, 0], [minX, 0, cz]]
    ] as [V, V][]) {
      for (const dx of [-0.85, 0.85]) {
        const m = faceMatrix(n, p)
        const at = new THREE.Vector3(dx, h - 3, 0).applyMatrix4(m)
        lancet(n, [at.x, at.y, at.z], 0.5, 2.6)
      }
      // string courses
      onFace("pietraChiara", boxAt([-half - 0.1, 0, 0], [half + 0.1, 0.25, 0.15]), n, [p[0], h - 6.4, p[2]], C(STONE))
    }
    B.add("pietraChiara", boxAt([minX - 0.2, h, minZ - 0.2], [maxX + 0.2, h + 0.4, maxZ + 0.2]), C(STONE))
    B.add("pietra", new THREE.ConeGeometry(half * 1.35, 9, 4).rotateY(Math.PI / 4).translate(cx, h + 0.4 + 4.5, cz), C("#bdb5a6"))
    B.add("ferro", cylBetween([cx, h + 9.4, cz], [cx, h + 11, cz], 0.05), C("#3a3028"))
    B.add("marmo", sphere([cx, h + 11.1, cz], 0.18), C("#d9b45a"))
  }

  // --- San Michele: the round chapel of the mummies ------------------------------------------
  {
    const { x, z, r, height: h } = SAN_MICHELE
    B.add("pietraChiara", new THREE.CylinderGeometry(r, r + 0.08, h, 20).translate(x, h / 2, z), C("#e4dccd"))
    B.add("pietraChiara", new THREE.CylinderGeometry(r + 0.18, r + 0.18, 0.35, 20).translate(x, h - 0.1, z), C(STONE))
    B.add("coppi", new THREE.ConeGeometry(r + 0.5, 3.2, 20).translate(x, h + 1.7, z), C("#c88a6c"))
    B.add("pietraChiara", new THREE.CylinderGeometry(0.5, 0.55, 1.1, 8).translate(x, h + 3.5, z), C(STONE))
    B.add("coppi", new THREE.ConeGeometry(0.7, 1, 8).translate(x, h + 4.5, z), C("#b07060"))
    // The door towards the churchyard, to the west, with its lunette; round slit windows.
    const door = faceMatrix([-1, 0, 0], [x - r - 0.02, 0, z])
    B.add("legno", boxAt([-0.75, 0, 0], [0.75, 2.4, 0.06]).applyMatrix4(door), C("#6a4428"))
    B.add("pietraChiara", archRing(0.75, 1.0, 0.2).translate(0, 2.4, 0.1).applyMatrix4(door), C(STONE))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5
      B.add("pietra", new THREE.CircleGeometry(0.28, 12).rotateY(-a + Math.PI / 2).translate(x + Math.cos(a) * (r + 0.02), h - 1.6, z + Math.sin(a) * (r + 0.02)), C(DARK))
    }
  }

  // --- Palazzo Comunale: pointed loggia arches, mullioned windows, clock ----------------------
  const hands: THREE.Mesh[] = []
  {
    const { minX, maxX, minZ, maxZ, loggiaH, roof: top } = COMUNE
    const arch = (a: number) => spandrel(a, 2, 0.6, a * 0.35)
    // Street front (x = maxX): three arches between the pillars.
    for (const [z0, z1] of [[59, 62.33], [63.33, 66.67], [67.67, 71]] as const) {
      B.add("pietraChiara", arch((z1 - z0) / 2).rotateY(Math.PI / 2).translate(maxX - 0.3, loggiaH - 2, (z0 + z1) / 2), C(STONE))
    }
    // North and south sides: two arches each.
    for (const z of [minZ + 0.3, maxZ - 0.3]) {
      for (const [x0, x1] of [[COMUNE.loggiaX, -11.5], [-10.5, maxX - 1]] as const) {
        B.add("pietraChiara", arch((x1 - x0) / 2).translate((x0 + x1) / 2, loggiaH - 2, z), C(STONE))
      }
    }
    // Mullioned windows on the main floor, on the street and the sides.
    for (const z of [61, 65, 69]) {
      for (const dz of [-0.5, 0.5]) lancet([1, 0, 0], [maxX, 9.5, z + dz], 0.38, 2)
      onFace("pietraChiara", boxAt([-1.1, -2.1, 0], [1.1, -1.95, 0.25]), [1, 0, 0], [maxX, 9.5, z], C(STONE))
    }
    for (const x of [-21, -17, -13, -9]) {
      lancet([0, 0, -1], [x, 9.5, minZ], 0.42, 2)
      lancet([0, 0, 1], [x, 9.5, maxZ], 0.42, 2)
    }
    roof(minX, minZ, maxX, maxZ, top, C("#e8dcc8"), 3.2, "pietraChiara")
    // Clock tower: dials, belfry and pyramid roof.
    const tx = (CLOCK.minX + CLOCK.maxX) / 2
    const tz = (CLOCK.minZ + CLOCK.maxZ) / 2
    const cy = CLOCK.top - 2.4
    B.add("atlas", atlasDisc(atlas.clock, 1.3, 40).rotateY(Math.PI / 2).translate(CLOCK.maxX + 0.03, cy, tz))
    B.add("pietraChiara", new THREE.TorusGeometry(1.38, 0.1, 6, 40).rotateY(Math.PI / 2).translate(CLOCK.maxX + 0.05, cy, tz), C(STONE))
    for (const [len, w] of [[0.7, 0.09], [1.05, 0.06]] as const) {
      const g = new THREE.BoxGeometry(0.03, len, w).translate(0, len / 2 - 0.08, 0)
      const hand = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#1a1612" }))
      hand.position.set(CLOCK.maxX + 0.08, cy, tz)
      root.add(hand)
      hands.push(hand)
    }
    B.add("pietraChiara", boxAt([CLOCK.minX - 0.2, CLOCK.top, CLOCK.minZ - 0.2], [CLOCK.maxX + 0.2, CLOCK.top + 0.3, CLOCK.maxZ + 0.2]), C(STONE))
    // Swallowtail merlons (decor: the top of the tower can't be reached).
    for (const [x0, z0, x1, z1] of [
      [CLOCK.minX - 0.2, CLOCK.minZ - 0.2, CLOCK.maxX + 0.2, CLOCK.minZ + 0.2],
      [CLOCK.minX - 0.2, CLOCK.maxZ - 0.2, CLOCK.maxX + 0.2, CLOCK.maxZ + 0.2]
    ] as const) {
      for (let x = x0 + 0.15; x < x1 - 0.4; x += 0.95) B.add("pietraChiara", boxAt([x, CLOCK.top + 0.3, z0], [x + 0.5, CLOCK.top + 1.0, z1]), C(STONE))
    }
    B.add("coppi", new THREE.ConeGeometry(3.1, 3.4, 4).rotateY(Math.PI / 4).translate(tx, CLOCK.top + 2.3, tz), C("#b8705a"))
    for (const z of [61, 69]) banner(atlas.bannerM, [1, 0, 0], [maxX, 5.9 + 0.1, z], 4)
  }

  // --- the gates: pointed vault in the passage, arches on the faces, coats of arms ----------
  for (const s of [-1, 1] as const) {
    const { passHalf: ph, passH, depthOut, depthIn, top } = GATE
    const zo = s * (WALL.outZ + depthOut)
    const zi = s * (WALL.inZ - depthIn)
    const zc = (zo + zi) / 2
    const depth = Math.abs(zo - zi)
    B.add("pietra", spandrel(ph, 1.5, depth, ph * 0.4).translate(0, passH - 1.5, zc), C("#c8c0b2"))
    for (const z of [zo, zi]) {
      const out = Math.sign(z - zc)
      B.add("pietraChiara", archRing(ph, ph + 0.6, 0.3, ph * 0.4).translate(0, passH - 1.5, z + out * 0.15), C(STONE))
    }
    banner(s < 0 ? atlas.bannerB : atlas.bannerM, [0, 0, -s], [0, 8.8, zo], 3.6)
    banner(s < 0 ? atlas.bannerB : atlas.bannerM, [0, 0, s], [0, 9.5, zi], 3.2)
    // Tower crown: cornice on corbels.
    for (let x = -GATE.halfX + 0.3; x < GATE.halfX; x += 0.8) {
      for (const z of [Math.min(zo, zi), Math.max(zo, zi)]) B.add("pietra", boxAt([x, top - 0.5, z - 0.12], [x + 0.25, top - 0.1, z + 0.12]), C("#b8b0a2"))
    }
  }

  // Banners along the wall walk, facing inward.
  for (const z of [-40, 0, 40]) {
    banner(z < 0 ? atlas.bannerB : atlas.bannerM, [1, 0, 0], [-WALL.inX, 3.5, z], 3.2)
    banner(z < 0 ? atlas.bannerB : atlas.bannerM, [-1, 0, 0], [WALL.inX, 3.5, z], 3.2)
  }

  return {
    update() {
      const d = new Date()
      const min = d.getMinutes() + d.getSeconds() / 60
      const hr = (d.getHours() % 12) + min / 60
      // Seen from the east (from the street), clockwise is a negative rotation around x.
      hands[0].rotation.x = -(hr / 12) * Math.PI * 2
      hands[1].rotation.x = -(min / 60) * Math.PI * 2
    }
  }
}

/** Beyond the edges: valley floor with fields, steep mountains east and west. */
function backdrop(kit: SceneryKit): THREE.Object3D[] {
  const { map } = kit
  const { minX, maxX, minZ, maxZ } = map.bounds
  const height = (x: number, z: number) => {
    const dx = Math.max(minX - x, x - maxX, 0)
    const dz = Math.max(minZ - z, z - maxZ, 0)
    const d = Math.max(dx, dz)
    // The Plauris to the east is higher and closer; to the west the Portis mountains.
    const east = x > 0 ? 1.15 : 0.9
    const wall = smooth(25, 330, dx) * (420 + 420 * fbm(x / 310 + 5, z / 310)) * east
    // The valley floor rises gently northwards (the Portis narrows) and drops southwards.
    const valley = z < 0 ? smooth(200, 1100, dz) * 90 : -smooth(300, 1200, dz) * 15
    return -0.3 + wall + valley * smooth(0, 60, d) + fbm(x / 90, z / 90) * 6 * smooth(0, 50, d)
  }
  const terrain = makeHeightfield(height, map.bounds, 717)
  terrain.name = "valle-dal-tiliment"

  // Poplars and cypresses along the moat and the fields, outside the walls.
  const trees = new THREE.Group()
  trees.name = "pioppi"
  const r = rng(733)
  const crown = new THREE.MeshLambertMaterial({ color: "#4f7034" })
  const trunk = new THREE.MeshLambertMaterial({ color: "#5a4632" })
  const crownGeo = new THREE.ConeGeometry(1.4, 9, 7).translate(0, 7.5, 0)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 3.2, 5).translate(0, 1.6, 0)
  const spots: [number, number][] = []
  for (let i = 0; i < 90; i++) {
    const side = r() < 0.5 ? -1 : 1
    const alongZ = r() < 0.75
    const x = alongZ ? side * (maxX + 6 + r() * 30) : (r() - 0.5) * 2 * (maxX + 30)
    const z = alongZ ? (r() - 0.5) * 2 * (maxZ + 40) : side * (maxZ + 6 + r() * 40)
    if (height(x, z) > 6) continue
    spots.push([x, z])
  }
  const crowns = new THREE.InstancedMesh(crownGeo, crown, spots.length)
  const trunks = new THREE.InstancedMesh(trunkGeo, trunk, spots.length)
  const m = new THREE.Matrix4()
  spots.forEach(([x, z], i) => {
    const s = 0.8 + r() * 0.5
    m.makeScale(s, s * (0.9 + r() * 0.4), s).setPosition(x, height(x, z), z)
    crowns.setMatrixAt(i, m)
    trunks.setMatrixAt(i, m)
  })
  for (const mesh of [crowns, trunks]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  trees.add(crowns, trunks)
  return [terrain, trees]
}

export const scenery: Scenery = {
  build,
  backdrop,
  menu: {
    path: [
      [0, 26, -128],
      [52, 32, -70],
      [58, 24, 0],
      [44, 30, 72],
      [0, 22, 126],
      [-46, 30, 70],
      [-58, 24, 0],
      [-48, 32, -72]
    ],
    look: [
      [0, 8, -96],
      [17, 10, -62],
      [0, 4, 0],
      [-14, 10, 65],
      [0, 8, 96],
      [-15, 9, 60],
      [0, 3, 0],
      [17, 12, -60]
    ]
  }
}
