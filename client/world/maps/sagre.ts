/**
 * Sagre dal Frico, the training's fair, after the frico fair of Carpacco: bunting and festoon
 * bulbs over the street, a numbered board hung over the start of every station, and each
 * station dressed as its own stall. The houses, the stalls, the bar, the beam, the shed and the
 * crates come from the data (`shared/maps/sagre.ts`); here only paint and signs on the ground
 * and on the walls, and what hangs out of reach overhead, so nothing drawn can be walked into.
 * At the end of the square, the church with its bell tower; beyond the edges, the Friulian plain.
 *
 * No lights: the bulbs glow by themselves (unlit), so the fair costs no more per pixel than a
 * map without them.
 */
import * as THREE from "three"
import { SAGRE, SAGRE_STATIONS, SQUARE } from "../../../shared/maps/sagre.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { archPanel, archRing, Batch, boxAt, faceMatrix, tri, type V } from "../geo.ts"
import type { Scenery, SceneryKit } from "../scenery.ts"
import { atlasDisc, atlasQuad, type Region, type SignSpec } from "../tex.ts"

/** Half the street's width (the houses' fronts). */
const STREET = 6
/** Paint on the ground sits this high: under the lowest step a body notices. */
const PAINT = 0.025
/** Signs and paint on a wall stand this far off it. */
const OFF = 0.04
const NORTH: V = [0, 0, 1]
const SOUTH: V = [0, 0, -1]
const WEST: V = [-1, 0, 0]
const EAST: V = [1, 0, 0]

const serif = (px: number, italic = false) => `${italic ? "italic " : ""}bold ${px}px Georgia, serif`
const sans = (px: number) => `bold ${px}px sans-serif`

/** The fair's painted signs. Words are the game's own names (weapons, pickups, modes). */
const SIGNS = {
  welcome: { text: "Sagre dal Frico", bg: "#5b1d16", fg: "#f6dc8c", font: serif(50, true) },
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`n${i + 1}`, { text: `${i + 1}`, bg: "#f4ead2", fg: "#8a1d1d", font: serif(56) }])),
  ...Object.fromEntries([1, 2, 3, 4].map((d) => [`slot${d}`, { text: `${d}`, bg: "#2c4a7a", fg: "#f4f1ea", font: sans(56) }])),
  mandi: { text: "La Mandi", bg: "#2a3a2a", fg: "#e8e0c0", font: serif(46) },
  mescul: { text: "Mescul de Polente", bg: "#e9e0c8", fg: "#5b3a1a", font: serif(44, true) },
  cramar: { text: "Mitra dal Cramâr", bg: "#3f6a8a", fg: "#f4f1ea", font: serif(44) },
  doplete: { text: "Dopiete di Pre Checo", bg: "#5a2a4a", fg: "#f2d27a", font: serif(44) },
  cjampanili: { text: "Il Cjampanili", bg: "#e9e0c8", fg: "#2c4a7a", font: serif(46) },
  mulin: { text: "Il Mulin", bg: "#7a4a1e", fg: "#f6e6b0", font: serif(46) },
  gjalinis: { text: "Cjanon des Gjalinis", bg: "#c8862a", fg: "#2a1a10", font: serif(44) },
  armarie: { text: "Armarie", bg: "#3a2616", fg: "#f1c96a", font: serif(50, true) },
  bombis: { text: "Bombis di Sgnape", bg: "#cfe6d6", fg: "#1e4a30", font: serif(44) },
  minis: { text: "Minis di Raibl", bg: "#4a4440", fg: "#f2c040", font: serif(44) },
  frico: { text: "Frico", bg: "#e8b648", fg: "#5b1d16", font: serif(46, true) },
  gubane: { text: "Gubane", bg: "#b4692c", fg: "#fbefd0", font: serif(46, true) },
  sgnape: { text: "Sgnape", bg: "#cfe6d6", fg: "#1e4a30", font: serif(46, true) },
  munizions: { text: "Munizions", bg: "#4a4a36", fg: "#f2e3b8", font: sans(42) },
  mitraie: { text: "Mitraie de Postazion", bg: "#3a3a3a", fg: "#f0f0f0", font: sans(40) },
  lanciafrico: { text: "Lanciafrico", bg: "#8a1d1d", fg: "#f6dc8c", font: serif(46, true) },
  miedi: { text: "Cassele dal Miedi", bg: "#f4f1ea", fg: "#1f5a33", font: serif(44) },
  cjape: { text: "Cjape il Frico", bg: "#5b1d16", fg: "#f6dc8c", font: serif(46, true) },
  placute: { text: "Re de Plaçute", bg: "#e9e0c8", fg: "#5b3a1a", font: serif(46, true) },
  cjar: { text: "Spinç il Cjar", bg: "#7a5434", fg: "#f6e6b0", font: serif(46, true) },
  tampieste: { text: "La Tampieste", bg: "#2a3550", fg: "#d8e4f4", font: serif(46, true) },
  bataie: { text: "Bataie di Gnot", bg: "#1d1d2a", fg: "#e8c84a", font: serif(46, true) }
} as const satisfies Record<string, SignSpec>
type SignId = keyof typeof SIGNS

/** Each primary's stall at station 5, by the x where its counter starts, and the side of the street. */
const STALLS = [
  { sign: "cramar", x0: -48, side: "north", awning: ["#3f6a8a", "#f4f1ea"] },
  { sign: "doplete", x0: -38, side: "north", awning: ["#5a2a4a", "#f2d27a"] },
  { sign: "mulin", x0: -28, side: "north", awning: ["#7a4a1e", "#f6e6b0"] },
  { sign: "gjalinis", x0: -18, side: "north", awning: ["#c8862a", "#2a1a10"] },
  { sign: "cjampanili", x0: -48, side: "south", awning: ["#2c4a7a", "#e9e0c8"] }
] as const satisfies readonly { sign: SignId; x0: number; side: "north" | "south"; awning: readonly [string, string] }[]

const PICKUP_COLOR = { frico: "#e8b648", gubane: "#b4692c", sgnape: "#9fd0b4", munizions: "#6a6a4a" } as const
const BUNTING = [["#7fd16b", "#f4ead2", "#e8c84a"], ["#d0435a", "#f4ead2", "#e8b04a"], ["#2a5ab8", "#f0c830"]] as const

function dress(kit: SceneryKit) {
  const { B, C, root, atlas, cylBetween, sphere, face, roof, door } = kit
  const S = SAGRE_STATIONS
  const ids = Object.keys(SIGNS) as SignId[]
  const sheet = kit.paint(ids.map((id) => SIGNS[id]))
  const region = Object.fromEntries(ids.map((id, i) => [id, sheet.regions[i]])) as Record<SignId, Region>
  const SB = new Batch<"insegnis">({ insegnis: 1 }, ["insegnis"])

  // --- helpers ----------------------------------------------------------------------------

  /** A sign flat on a wall facing `n`, centred at `p`, `h` tall; its board a hair behind it. */
  const sign = (id: SignId, n: V, p: V, h: number) => {
    const at: V = [p[0] + n[0] * OFF, p[1], p[2] + n[2] * OFF]
    SB.add("insegnis", atlasQuad(region[id], h).applyMatrix4(faceMatrix(n, at)))
  }
  /** Paint flat on the ground. */
  const ground = (g: THREE.BufferGeometry, color: string, y = PAINT) => B.add("stoffa", g.rotateX(-Math.PI / 2).translate(0, y, 0), C(color))
  const disc = (x: number, z: number, r: number, color: string, y = PAINT) => ground(new THREE.CircleGeometry(r, 32).translate(x, -z, 0), color, y)
  const ring = (x: number, z: number, r0: number, r1: number, color: string, y = PAINT + 0.003) => ground(new THREE.RingGeometry(r0, r1, 40).translate(x, -z, 0), color, y)
  const strip = (x0: number, z0: number, x1: number, z1: number, color: string) => B.add("stoffa", face([x0, PAINT, z0], [x1, PAINT, z1], "top"), C(color))
  /** A target painted on a wall facing `n`. */
  const target = (n: V, p: V, r: number) => {
    const m = faceMatrix(n, [p[0] + n[0] * 0.02, p[1], p[2] + n[2] * 0.02])
    const cols = ["#f4ead2", "#c8394e", "#f4ead2", "#c8394e"]
    B.add("stoffa", new THREE.CircleGeometry(r * 1.08, 32).applyMatrix4(m), C("#3a2616"))
    cols.forEach((c, i) => B.add("stoffa", new THREE.CircleGeometry(r * (1 - i * 0.25), 32).translate(0, 0, 0.004 * (i + 1)).applyMatrix4(m), C(c)))
  }
  /** A wire strung between two points, sagging, with pennants (and bulbs every so often). */
  const bunting = (a: V, b: V, sag: number, cols: readonly string[], bulbs: boolean) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const n = Math.floor(len / 0.8)
    const P = (s: number): V => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - sag * 4 * s * (1 - s), a[2] + (b[2] - a[2]) * s]
    for (let i = 0; i < n; i++) {
      const p0 = P(i / n), p1 = P((i + 0.6) / n), p2 = P((i + 1) / n)
      B.add("ferro", cylBetween(p0, p2, 0.012, 0.012, 3), C("#3a3028"))
      B.add("stoffa", tri(p0, p1, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.42, (p0[2] + p1[2]) / 2]), C(cols[i % cols.length]))
      if (bulbs && i % 2 === 1) B.add("luce", sphere([p2[0], p2[1] - 0.08, p2[2]], 0.07, 1.3, 6), new THREE.Color(2.4, 1.8, 0.9))
    }
  }
  /**
   * Boards hung on a wire across the street (or the square) at `x`, side by side around `z`:
   * `west` is what a player walking east reads, `east` its back.
   */
  const hang = (x: number, z: number, y: number, h: number, west: readonly SignId[], east: readonly SignId[] = west, span = STREET) => {
    const widths = west.map((id) => h * region[id].aspect)
    const gap = 0.25
    const total = widths.reduce((a, w) => a + w, 0) + gap * (west.length - 1)
    const wireY = y + h / 2 + 0.9
    B.add("ferro", cylBetween([x, wireY, -span], [x, wireY, span], 0.015, 0.015, 4), C("#3a3028"))
    let z0 = z - total / 2
    west.forEach((id, i) => {
      const w = widths[i]
      const zc = z0 + w / 2
      B.add("legno", boxAt([x - 0.03, y - h / 2 - 0.08, zc - w / 2 - 0.08], [x + 0.03, y + h / 2 + 0.08, zc + w / 2 + 0.08]), C("#6a4a30"))
      for (const dz of [-w / 2 + 0.15, w / 2 - 0.15]) B.add("ferro", cylBetween([x, y + h / 2 + 0.08, zc + dz], [x, wireY, zc + dz], 0.01, 0.01, 3), C("#2a2622"))
      SB.add("insegnis", atlasQuad(region[id], h, w).applyMatrix4(faceMatrix(WEST, [x - 0.035, y, zc])))
      const back = east[i] ?? id
      SB.add("insegnis", atlasQuad(region[back], h, Math.min(w, h * region[back].aspect)).applyMatrix4(faceMatrix(EAST, [x + 0.035, y, zc])))
      z0 += w + gap
    })
  }

  // --- over the street: bunting and the stations' boards -----------------------------------

  const entries = S.map((s) => s.area.minX)
  for (let x = -146, k = 0; x < SQUARE.minX - 2; x += 7, k++) {
    if (entries.some((e) => Math.abs(e + 1.6 - x) < 2)) continue
    bunting([x, 6.7, -STREET], [x + 2.5, 6.7, STREET], 0.9, BUNTING[k % BUNTING.length], k % 2 === 0)
  }
  // two long festoons along the street, under the eaves
  for (const z of [-STREET, STREET]) for (let x = -148; x < SQUARE.minX - 10; x += 24) bunting([x, 6.5, z], [x + 24, 6.5, z], 0.6, BUNTING[2], true)
  // the square: criss-cross from the houses' fronts
  for (let i = 0; i < 4; i++) {
    const x = SQUARE.minX + 6 + i * 16
    bunting([x, 8.2, SQUARE.minZ], [x + 10, 8.2, SQUARE.maxZ], 1.6, BUNTING[i % 3], true)
    bunting([x + 10, 8.2, SQUARE.minZ], [x, 8.2, SQUARE.maxZ], 1.6, BUNTING[(i + 1) % 3], false)
  }

  // A board over the start of every station: its number (and, at the first, the fair's name).
  S.forEach((s, i) => {
    const n = `n${i + 1}` as SignId
    const square = s.area.minX >= SQUARE.minX
    const x = s.area.minX + (i === 0 ? 8 : square ? 3.5 : 1.6)
    if (i === 0) hang(x, 0, 5.2, 0.8, ["welcome", n], [n, "welcome"])
    else if (i === 11) hang(x, 0, 6.2, 0.8, ["bataie", n], [n, "bataie"], SQUARE.maxZ)
    else hang(x, 0, square ? 6.2 : 5.2, 0.8, [n], [n], square ? SQUARE.maxZ : STREET)
  })

  // --- 1. look and move: the marker -----------------------------------------------------------
  {
    const [x, , z] = S[0].marker
    ;["#c8394e", "#f4ead2", "#c8394e", "#f4ead2"].forEach((c, i) => disc(x, z, 1.2 - i * 0.3, c, PAINT + i * 0.002))
    // the first stall's own sign, from the town's atlas
    B.add("atlas", atlasQuad(atlas.signs.frico, 0.5).applyMatrix4(faceMatrix(SOUTH, [-139, 3.9, STREET - OFF])))
  }

  // --- 2. the obstacle course: the bar, the beam, the sprint ----------------------------------
  {
    const { bar, beam, sprintFrom, sprintLine } = S[1]
    // red and white bands on both faces of the bar
    const bands = 12
    for (let i = 0; i < bands; i++) {
      const z0 = -STREET + (2 * STREET * i) / bands, z1 = -STREET + (2 * STREET * (i + 1)) / bands
      const c = C(i % 2 ? "#f4ead2" : "#c8394e")
      B.add("stoffa", face([bar.min[0] - 0.012, 0.05, z0], [bar.max[0], bar.max[1] - 0.02, z1], "west"), c)
      B.add("stoffa", face([bar.min[0], 0.05, z0], [bar.max[0] + 0.012, bar.max[1] - 0.02, z1], "east"), c)
    }
    // the beam: yellow and black slanted bands on its lower edge, arrows pointing down, its underside painted
    const y0 = beam.min[1], band = 0.45
    for (const [x, n] of [[beam.min[0] - 0.012, -1], [beam.max[0] + 0.012, 1]] as const) {
      for (let i = 0; i < 24; i++) {
        const z0 = -STREET + i * 0.5
        const c = C(i % 2 ? "#1d1d1d" : "#f2c040")
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y0, z0 + 0.5), new THREE.Vector3(x, y0 + band, Math.min(STREET, z0 + 0.75)), new THREE.Vector3(x, y0 + band, z0 + 0.25)])
        g.setIndex([0, 1, 2, 0, 2, 3])
        g.computeVertexNormals()
        B.add("stoffa", kit.orient(g, [n, 0, 0]), c)
      }
      for (const z of [-3.6, 0, 3.6]) {
        const yt = y0 + 1.5
        B.add("stoffa", kit.orient(tri([x, yt, z - 0.5], [x, yt, z + 0.5], [x, yt - 0.7, z]), [n, 0, 0]), C("#f4ead2"))
        B.add("stoffa", face([x, yt, z - 0.18], [x, yt + 0.6, z + 0.18], n < 0 ? "west" : "east"), C("#f4ead2"))
      }
    }
    B.add("stoffa", face([beam.min[0], y0 - 0.005, -STREET], [beam.max[0], y0, STREET], "bottom"), C("#f2c040"))
    // the start of the run-up, chevrons pointing east, the finish line in black and white squares
    strip(sprintFrom[0] - 0.08, -STREET + 0.2, sprintFrom[0] + 0.08, STREET - 0.2, "#f4f1ea")
    for (let x = sprintFrom[0] + 1.5; x < sprintLine - 1; x += 2.2) for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.15, 1.3).rotateZ(s * 0.9).translate(x, -s * 0.45, 0)
      ground(g, "#f4f1ea")
    }
    for (let i = 0; i < 40; i++) for (let j = 0; j < 2; j++) {
      const z0 = -STREET + i * 0.3, x0 = sprintLine + j * 0.3
      strip(x0, z0, x0 + 0.3, z0 + 0.3, (i + j) % 2 ? "#1d1d1d" : "#f4f1ea")
    }
    // and the finish banner overhead
    for (let i = 0; i < 24; i++) for (let j = 0; j < 2; j++) {
      const z0 = -STREET + i * 0.5, y = 4.4 + j * 0.4
      const c = C((i + j) % 2 ? "#1d1d1d" : "#f4f1ea")
      B.add("stoffa", face([sprintLine, y, z0], [sprintLine, y + 0.4, z0 + 0.5], "west"), c)
    }
    B.add("ferro", cylBetween([sprintLine, 5.25, -STREET], [sprintLine, 5.25, STREET], 0.02, 0.02, 4), C("#3a3028"))
  }

  // --- 3. always with you: targets on the walls, the shed --------------------------------------
  {
    for (const x of [-94, -86, -68]) {
      target(NORTH, [x, 2.4, -STREET], 0.55)
      target(SOUTH, [x + 2, 2.4, STREET], 0.55)
    }
    sign("mandi", SOUTH, [-88, 3.7, STREET], 0.55)
    // the shed: its front in planks, its name over the door, a roof over it all
    const { doorFront } = S[2]
    const x0 = doorFront[0] - 2, x1 = doorFront[0] + 2
    for (let x = x0 + 0.2; x < x1; x += 0.5) B.add("legno", boxAt([x - 0.04, 2.6, -STREET], [x + 0.04, 7, -STREET + 0.03]), C("#5a3a22"))
    sign("mescul", NORTH, [doorFront[0], 3.3, -STREET + 0.03], 0.42)
    roof(x0, -32, x1, -STREET - 0.3, 7, C("#8a5a34"), 1.1, "legno")
  }

  // --- 4. changing weapon: the slots' numbers --------------------------------------------------
  ;([1, 2, 3, 4] as const).forEach((d, i) => {
    sign(`slot${d}` as SignId, NORTH, [-59 + i * 2.6, 2.6, -STREET], 0.9)
    sign(`slot${d}` as SignId, SOUTH, [-59 + i * 2.6, 2.6, STREET], 0.9)
  })

  // --- 5. the stalls: one per primary, its name, its colours, its line ---------------------------
  for (const st of STALLS) {
    const n = st.side === "north" ? NORTH : SOUTH
    const wall = st.side === "north" ? -STREET : STREET
    // a cloth of the stall's own colours on the wall behind it, in vertical stripes
    for (let i = 0; i < 10; i++) {
      const xa = st.x0 - 0.4 + i * 0.68
      B.add("stoffa", face([xa, 3.25, wall + n[2] * 0.02], [xa + 0.68, 4.5, wall + n[2] * 0.02], st.side === "north" ? "south" : "north"), C(st.awning[i % 2]))
    }
    sign(st.sign, n, [st.x0 + 3, 3.75, wall], 0.55)
    // a valance of the stall's own colours along the wall, above its awning
    for (let i = 0; i < 12; i++) {
      const xa = st.x0 + i * 0.5
      const g = tri([xa, 3.3, wall + n[2] * 0.03], [xa + 0.5, 3.3, wall + n[2] * 0.03], [xa + 0.25, 2.95, wall + n[2] * 0.03])
      B.add("stoffa", kit.orient(g, n), C(st.awning[i % 2]))
    }
  }
  for (const [id, { at }] of Object.entries(S[4].stalls)) {
    const [x, , z] = at.at
    strip(x + 0.5, z - 0.7, x + 0.62, z + 0.7, "#f4f1ea")
    if (id === "cjampanili") target(SOUTH, [3, 2.2, STREET], 0.7)
  }

  // --- 6. the armoury: a wardrobe in the wall --------------------------------------------------
  {
    const xc = 13
    B.add("legno", boxAt([xc - 1.8, 0, -STREET], [xc + 1.8, 3.1, -STREET + 0.06]), C("#7a4a2c"))
    B.add("legno", boxAt([xc - 1.95, 3.1, -STREET], [xc + 1.95, 3.35, -STREET + 0.1]), C("#5a3420"))
    for (const s of [-1, 1]) B.add("legno", boxAt([xc + s * 0.9 - 0.75, 0.3, -STREET + 0.06], [xc + s * 0.9 + 0.75, 2.8, -STREET + 0.09]), C("#94603a"))
    for (const s of [-0.12, 0.12]) B.add("ferro", boxAt([xc + s - 0.03, 1.3, -STREET + 0.09], [xc + s + 0.03, 1.7, -STREET + 0.11]), C("#c9a040"))
    sign("armarie", NORTH, [xc, 3.9, -STREET], 0.6)
  }

  // --- 7. bombs and mines: the throwing line, the targets, the mine's spot ----------------------
  {
    const { bombAt, bombTargets, mineAt, mineRoute } = S[6]
    strip(bombAt[0] - 0.08, -STREET + 0.2, bombAt[0] + 0.08, STREET - 0.2, "#f4f1ea")
    for (const [x, , z] of bombTargets) {
      ring(x, z, 0.75, 0.9, "#e8b04a")
      disc(x, z, 0.25, "#e8b04a")
    }
    const [mx, , mz] = mineAt
    ring(mx, mz, 0.9, 1.05, "#c8394e")
    for (const s of [-1, 1]) ground(new THREE.PlaneGeometry(0.16, 1.6).rotateZ(s * Math.PI / 4).translate(mx, -mz, 0), "#c8394e", PAINT + 0.002)
    // the path the bot walks over it, dashed
    const [a, b] = [mineRoute[0], mineRoute[mineRoute.length - 1]]
    for (let z = a[2]; z < b[2]; z += 0.8) if (Math.abs(z - mz) > 1.1) strip(a[0] - 0.05, z, a[0] + 0.05, z + 0.4, "#f4f1ea")
    sign("bombis", NORTH, [32, 3.7, -STREET], 0.55)
    sign("minis", SOUTH, [mx, 3.7, STREET], 0.55)
  }

  // --- 8. pickups: a plate and a name for each -------------------------------------------------
  for (const [kind, i] of Object.entries(S[7].pickups) as [keyof typeof PICKUP_COLOR, number][]) {
    const [x, , z] = SAGRE.pickups[i].at
    ring(x, z, 0.85, 1.0, PICKUP_COLOR[kind])
    disc(x, z, 0.85, "#e9e0c8")
    sign(kind, SOUTH, [x, 3.0, STREET], 0.5)
  }

  // --- 9. the turret's range and the Lanciafrico -----------------------------------------------
  {
    const spot = SAGRE.turrets[S[8].turret]
    const [tx, , tz] = spot.at
    ring(tx, tz, 1.3, 1.5, "#f4f1ea")
    for (let x = tx + 5; x < S[8].area.maxX - 2; x += 5) strip(x - 0.06, -STREET + 0.5, x + 0.06, -STREET + 2, "#f4f1ea")
    for (let x = tx + 5; x < S[8].area.maxX - 2; x += 5) strip(x - 0.06, STREET - 2, x + 0.06, STREET - 0.5, "#f4f1ea")
    sign("mitraie", NORTH, [tx, 3.7, -STREET], 0.5)
    const [lx, , lz] = SAGRE.pickups[S[8].lanciafrico].at
    ring(lx, lz, 0.95, 1.15, "#e8c84a")
    disc(lx, lz, 0.95, "#8a1d1d")
    sign("lanciafrico", SOUTH, [lx, 3.3, STREET], 0.55)
  }

  // --- 10. the medic: a blanket for the wounded, green crosses ---------------------------------
  {
    const [wx, , wz] = S[9].wounded.at
    strip(wx - 1.1, wz - 0.6, wx + 1.1, wz + 0.6, "#5a6a8a")
    strip(wx - 1.0, wz - 0.5, wx + 1.0, wz + 0.5, "#7a8aaa")
    for (const [n, z] of [[NORTH, -STREET], [SOUTH, STREET]] as const) {
      const x = wx - 3
      const m = faceMatrix(n, [x, 3.0, z + n[2] * 0.02])
      B.add("stoffa", new THREE.PlaneGeometry(1.2, 1.2).applyMatrix4(m), C("#f4f1ea"))
      B.add("stoffa", new THREE.PlaneGeometry(0.9, 0.28).translate(0, 0, 0.005).applyMatrix4(m), C("#2f8a4a"))
      B.add("stoffa", new THREE.PlaneGeometry(0.28, 0.9).translate(0, 0, 0.005).applyMatrix4(m), C("#2f8a4a"))
    }
    sign("miedi", NORTH, [wx + 1, 3.9, -STREET], 0.5)
  }

  // --- 11. the modes: flag bases, the plaçute, the cjar's track ----------------------------------
  {
    for (const [team, reg] of [["benandanti", atlas.bannerB], ["malandanti", atlas.bannerM]] as const) {
      const [x, , z] = SAGRE.flagBases[team]
      const col = team === "benandanti" ? "#4f9a3e" : "#b8324a"
      disc(x, z, 2.1, col)
      ring(x, z, 1.2, 1.5, "#f4ead2")
      B.add("atlas", atlasQuad(reg, 4.5).applyMatrix4(faceMatrix(NORTH, [x, 6.2, SQUARE.minZ + OFF])))
    }
    sign("cjape", NORTH, [140, 3.8, SQUARE.minZ], 0.6)
    // the plaçute: a round of pale stone with a dark rim
    const { at, radius } = SAGRE.hill
    disc(at[0], at[2], radius, "#e8e0d0", 0.015)
    ring(at[0], at[2], radius - 0.45, radius, "#c8862a", 0.018)
    hang(at[0], at[2], 6.4, 0.8, ["placute"], ["tampieste"], SQUARE.maxZ)
    // the cjar's track: sleepers and two low rails, flush with the ground, a chequered end
    const [a, b] = [SAGRE.track[0], SAGRE.track[SAGRE.track.length - 1]]
    for (let x = a[0]; x <= b[0]; x += 0.8) B.add("legno", boxAt([x - 0.11, 0, a[2] - 0.85], [x + 0.11, 0.035, a[2] + 0.85]), C("#6a5038"))
    for (const dz of [-0.55, 0.55]) B.add("ferro", boxAt([a[0], 0.035, a[2] + dz - 0.04], [b[0], 0.055, a[2] + dz + 0.04]), C("#4a4440"))
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) strip(b[0] + 0.3 + j * 0.3, a[2] - 0.9 + i * 0.3, b[0] + 0.6 + j * 0.3, a[2] - 0.6 + i * 0.3, (i + j) % 2 ? "#1d1d1d" : "#f4f1ea")
    sign("cjar", SOUTH, [(a[0] + b[0]) / 2, 3.8, SQUARE.maxZ], 0.6)
  }

  // --- 12. the church at the end of the square, with its bell tower ------------------------------
  {
    const x = SQUARE.maxX
    door(WEST, [x, 0, 0], 2.6, 4.2, C("#6a3e22"))
    B.add("pietraChiara", archRing(1.3, 1.75, 0.3, 0).rotateY(-Math.PI / 2).translate(x - 0.05, 4.2, 0), C("#ece4d4"))
    for (const z of [-1.55, 1.55]) B.add("pietraChiara", boxAt([x - 0.08, 0, z - 0.2], [x, 4.2, z + 0.2]), C("#ece4d4"))
    // the front rises over the row in a stone pediment, with the rose window in it
    const [g0, g1, eave, apex] = [-7.5, 7.5, 12, 17.5]
    B.add("pietraChiara", kit.orient(tri([x - 0.06, eave, g0], [x - 0.06, eave, g1], [x - 0.06, apex, 0]), WEST), C("#ece4d4"))
    B.add("pietraChiara", kit.orient(tri([x - 0.06, eave, g1], [x - 0.06, eave, g0], [x - 0.06, apex, 0]), EAST), C("#d8d0c0"))
    B.add("pietraChiara", boxAt([x - 0.3, eave - 0.3, g0 - 0.3], [x, eave, g1 + 0.3]), C("#e2d8c4"))
    for (const sgn of [-1, 1]) B.add("pietraChiara", cylBetween([x - 0.15, eave, sgn * (g1 + 0.3)], [x - 0.15, apex + 0.2, 0], 0.18, 0.18, 4), C("#e2d8c4"))
    for (const z of [g0, g1]) B.add("pietraChiara", boxAt([x - 0.1, 0, z - 0.35], [x, eave, z + 0.35]), C("#e2d8c4"))
    B.add("atlas", atlasDisc(atlas.rose, 1.4, 32).rotateY(-Math.PI / 2).translate(x - 0.09, 14, 0))
    B.add("pietraChiara", new THREE.TorusGeometry(1.5, 0.14, 6, 32).rotateY(Math.PI / 2).translate(x - 0.1, 14, 0), C("#ece4d4"))
    // the tower rises from the façade, over the roof
    const [t0, t1, z0, z1] = [x, x + 4, -2.2, 2.2]
    const top = 26
    for (const side of ["east", "west", "south", "north"] as const) B.add("intonaco", face([t0, 11, z0], [t1, top, z1], side), C("#efe8d8"))
    B.add("pietraChiara", boxAt([t0 - 0.15, top - 0.4, z0 - 0.15], [t1 + 0.15, top, z1 + 0.15]), C("#e2d8c4"))
    B.add("pietraChiara", boxAt([t0 - 0.1, 18.6, z0 - 0.1], [t1 + 0.1, 18.9, z1 + 0.1]), C("#e2d8c4"))
    // belfry openings on the four sides
    for (const [n, p] of [[WEST, [t0 - 0.02, 21.4, 0]], [EAST, [t1 + 0.02, 21.4, 0]], [SOUTH, [(t0 + t1) / 2, 21.4, z0 - 0.02]], [NORTH, [(t0 + t1) / 2, 21.4, z1 + 0.02]]] as const) {
      const m = faceMatrix(n, p as V)
      B.add("pietra", archPanel(0.7, 2.2, 0).applyMatrix4(m), C("#2a2622"))
    }
    const spire = new THREE.ConeGeometry(3.2, 5, 4).rotateY(Math.PI / 4).translate((t0 + t1) / 2, top + 2.5, 0)
    B.add("coppi", spire, C("#b07060"))
    B.add("ferro", cylBetween([(t0 + t1) / 2, top + 5, 0], [(t0 + t1) / 2, top + 6.6, 0], 0.05), C("#2a2622"))
    B.add("ferro", cylBetween([(t0 + t1) / 2, top + 6.1, -0.45], [(t0 + t1) / 2, top + 6.1, 0.45], 0.05), C("#2a2622"))
  }

  // the sheet of signs: one mesh
  for (const m of SB.build({ insegnis: sheet.material })) root.add(m)
}

export const scenery: Scenery = {
  build(kit) {
    dress(kit)
  },
  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    const out = (x: number, z: number) => Math.hypot(Math.max(minX - x, x - maxX, 0), Math.max(minZ - z, z - maxZ, 0))
    // The plain around Carpacco, with the Prealps far to the north.
    const height = (x: number, z: number) => -0.5 + fbm(x / 120, z / 120) * 2 * smooth(4, 40, out(x, z)) + smooth(-500, -1100, z) * (260 + 380 * fbm(x / 240, z / 240 + 4))
    return [makeHeightfield(height, map.bounds, 1952)]
  },
  menu: {
    path: [[-140, 12, 0], [-40, 14, -2], [60, 13, 2], [150, 18, -10], [170, 22, 16], [40, 15, 0]],
    look: [[-100, 2, 0], [0, 2, 0], [100, 2, 0], [170, 1, 0], [140, 1, 4], [-60, 2, 0]]
  }
}
