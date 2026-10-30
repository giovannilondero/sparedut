/**
 * Lo scenario des Trinceis dal Pal Piçul: breis su lis parêts e sul font des trinceis,
 * la ferade Decauville, il fîl spinât, lis busis des granadis, la cjasute sdrumade, il
 * canon te caverne, la stue dal ricovar e lis Alps Cjargnelis ator.
 * Dut decor sutîl: ce che al ripare al è za tai blocs de mape.
 */
import * as THREE from "three"
import { trackPoint, trackLength } from "../../../shared/map.ts"
import { CUTS, NARROW_CUTS, T_FLOOR, T_TOP } from "../../../shared/maps/trincee.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { boxAt, rng, type V } from "../geo.ts"
import type { Scenery, SceneryKit } from "../scenery.ts"

const RUST = "#6e3a22"
const WOOD = "#8a6846"

/** Breis orizontâls e pâi su ogni parêt di trincee (dulà che la tiere di flanc e je plui basse). */
function revetments({ map, B, C, groundAt }: SceneryKit, r: () => number) {
  const { minX, maxX, minZ, maxZ } = map.bounds
  const inside = (x: number, z: number) => x > minX && x < maxX && z > minZ && z < maxZ
  for (const b of map.blocks) {
    if (b.look !== "terreno" || b.max[1] < T_TOP - 0.01 || b.min[1] > T_FLOOR + 0.01) continue
    const [x0, , z0] = b.min
    const [x1, , z1] = b.max
    for (const side of ["east", "west", "south", "north"] as const) {
      const alongX = side === "south" || side === "north"
      const plane = side === "east" ? x1 : side === "west" ? x0 : side === "south" ? z1 : z0
      const out = side === "east" || side === "south" ? 1 : -1
      const a0 = alongX ? x0 : z0
      const a1 = alongX ? x1 : z1
      // La parêt e va dividude dulà che il vueit di flanc al finìs (un flanc al pò tocjâ trinceis e tiere).
      const step = 0.5
      let runStart: number | null = null
      const flush = (end: number) => {
        if (runStart === null || end - runStart < 0.6) {
          runStart = null
          return
        }
        const s0 = runStart, s1 = end
        runStart = null
        const P = (a: number, y: number, d: number): V => (alongX ? [a, y, plane + out * d] : [plane + out * d, y, a])
        const box = (a: number, c: number, y0: number, y1: number, d0: number, d1: number) => {
          const p = P(a, y0, d0), q = P(c, y1, d1)
          return boxAt([Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2])], [Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2])])
        }
        // breis
        for (let y = 0.05; y < T_TOP - 0.1; y += 0.36) B.add("legno", box(s0, s1, y, y + 0.3, 0, 0.04), C(WOOD).offsetHSL(0, 0, (r() - 0.5) * 0.12))
        // pâi
        for (let a = s0 + 0.15; a < s1 - 0.1; a += 1.7) B.add("legno", box(a, a + 0.12, 0, T_TOP + 0.15, 0.03, 0.13), C("#5c4430"))
      }
      for (let a = a0 + step / 2; a < a1; a += step) {
        const probe = alongX ? [a, plane + out * 0.3] : [plane + out * 0.3, a]
        const low = inside(probe[0], probe[1]) && groundAt(probe[0], probe[1]) < T_FLOOR + 0.3
        if (low && runStart === null) runStart = a - step / 2
        if (!low) flush(a - step / 2)
      }
      flush(a1)
    }
  }
}

/** Breis di len sul font des trinceis strentis. */
function duckboards({ B, C }: SceneryKit, r: () => number) {
  for (const [x0, z0, x1, z1] of NARROW_CUTS) {
    const alongX = x1 - x0 > z1 - z0
    // In prime linie lis breis a stan sul passaç di daûr (il graduin al è denant).
    const frontLine = alongX && Math.abs(z0) + Math.abs(z1) === 79
    const c = frontLine ? Math.sign(z0) * 40.3 : alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
    const a0 = alongX ? x0 : z0
    const a1 = alongX ? x1 : z1
    const tint = C("#7a5a3c")
    for (let a = a0 + 0.3; a < a1 - 0.2; a += 0.34) {
      const w = 0.42 + (r() - 0.5) * 0.06
      const g = alongX ? boxAt([a, T_FLOOR, c - w], [a + 0.24, T_FLOOR + 0.05, c + w]) : boxAt([c - w, T_FLOOR, a], [c + w, T_FLOOR + 0.05, a + 0.24])
      B.add("legno", g, tint.clone().offsetHSL(0, 0, (r() - 0.5) * 0.14))
    }
    // i doi lunghers sot des breis
    for (const s of [-0.3, 0.3]) {
      const g = alongX ? boxAt([a0 + 0.2, T_FLOOR, c + s - 0.04], [a1 - 0.2, T_FLOOR + 0.03, c + s + 0.04]) : boxAt([c + s - 0.04, T_FLOOR, a0 + 0.2], [c + s + 0.04, T_FLOOR + 0.03, a1 - 0.2])
      B.add("legno", g, C("#5a4030"))
    }
  }
}

/** La ferade Decauville (scartament di 60 cm): rotais di fier e traviersis di len. */
function railway({ map, B, C, cylBetween }: SceneryKit) {
  const track = map.track
  const gauge = 0.3
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    const dx = b[0] - a[0], dz = b[2] - a[2]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len, nz = dx / len
    for (const s of [-1, 1]) {
      B.add("ferro", cylBetween([a[0] + nx * gauge * s, a[1] + 0.13, a[2] + nz * gauge * s], [b[0] + nx * gauge * s, b[1] + 0.13, b[2] + nz * gauge * s], 0.035, 0.035, 5), C("#5a4a40"))
    }
  }
  const total = trackLength(track)
  const sleeper = new THREE.BoxGeometry(1.0, 0.08, 0.16)
  for (let d = 0.3; d < total; d += 0.7) {
    const p = trackPoint(track, d)
    const q = trackPoint(track, Math.min(total, d + 0.05))
    const pitch = Math.atan2(q.at[1] - p.at[1], Math.hypot(q.at[0] - p.at[0], q.at[2] - p.at[2]) || 1)
    const g = sleeper.clone().rotateX(-pitch).rotateY(p.yaw).translate(p.at[0], p.at[1] + 0.05, p.at[2])
    B.add("legno", g, C("#6a4a34"))
  }
  sleeper.dispose()
  // Un vagonut ribaltât e un mucj di rotais di ricambi te buse taliane.
  B.add("ferro", boxAt([-9, T_FLOOR, 77], [-6.5, T_FLOOR + 0.12, 82]), C(RUST))
  B.add("ferro", boxAt([-9, T_FLOOR + 0.12, 77.3], [-6.5, T_FLOOR + 0.2, 81.7]), C("#5a3a26"))
}

/** Fîl spinât: pâi di fier stuarts e trê fîi che a pendin, cun vierturis pai passaçs. */
function barbedWire({ B, C, cylBetween }: SceneryKit, r: () => number) {
  const gaps: [number, number][] = [[-36, -28], [-4, 4], [28, 36]]
  for (const z of [33.5, 24, -24, -33.5]) {
    const posts: V[] = []
    for (let x = -43; x <= 43; x += 2.4) {
      if (gaps.some(([a, b]) => x > a && x < b)) {
        if (posts.length) strands(posts)
        posts.length = 0
        continue
      }
      const lean = (r() - 0.5) * 0.35
      const p: V = [x + (r() - 0.5) * 0.4, T_TOP, z + (r() - 0.5) * 0.6]
      B.add("ferro", cylBetween(p, [p[0] + lean, T_TOP + 1.1 + r() * 0.3, p[2] + lean * 0.5], 0.025, 0.02, 4), C(RUST))
      posts.push(p)
    }
    strands(posts)
  }
  function strands(posts: V[]) {
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1], b = posts[i]
      for (const h of [0.35, 0.7, 1.0]) {
        const m: V = [(a[0] + b[0]) / 2, T_TOP + h - 0.12, (a[2] + b[2]) / 2]
        B.add("ferro", cylBetween([a[0], T_TOP + h, a[2]], m, 0.008, 0.008, 3), C("#3a3430"))
        B.add("ferro", cylBetween(m, [b[0], T_TOP + h, b[2]], 0.008, 0.008, 3), C("#3a3430"))
      }
      // il rodul di fîl par tiere
      if (i % 3 === 0) B.add("ferro", new THREE.TorusGeometry(0.35, 0.012, 3, 10).rotateY(r() * 3).translate(m3(a, b, 0.5)[0], T_TOP + 0.3, m3(a, b, 0.5)[2]), C("#3a3430"))
    }
  }
}
const m3 = (a: V, b: V, k: number): V => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** Busis di granade: un disc scûr e un ôr di tiere voltade (dome decor, si cjamine parsore). */
function craters({ B, C, sphere }: SceneryKit, r: () => number) {
  for (let i = 0; i < 26; i++) {
    const x = -40 + r() * 80
    const z = -33 + r() * 66
    if (CUTS.some(([x0, z0, x1, z1]) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3)) continue
    const rad = 1.2 + r() * 2.2
    B.add("terra", new THREE.CircleGeometry(rad, 18).rotateX(-Math.PI / 2).translate(x, T_TOP + 0.02, z), C("#5a4636"))
    B.add("terra", new THREE.CircleGeometry(rad * 0.55, 14).rotateX(-Math.PI / 2).translate(x, T_TOP + 0.03, z), C("#3e3026"))
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + r() * 0.4
      B.add("terra", sphere([x + Math.cos(a) * rad, T_TOP - 0.05, z + Math.sin(a) * rad], 0.35 + r() * 0.25, 0.4, 6), C("#6a5440"))
    }
  }
}

/** La cjasute sdrumade: maserie par tiere e travs dal cuviert colâts. */
function ruin({ B, C, cylBetween, sphere }: SceneryKit, r: () => number) {
  for (let i = 0; i < 18; i++) B.add("pietra", sphere([-10.5 + r() * 5.2, T_TOP + 0.05, -3.6 + r() * 5], 0.15 + r() * 0.22, 0.7, 5), C("#b8b0a4"))
  B.add("legno", cylBetween([-10.6, T_TOP + 2.1, -3.7], [-6.2, T_TOP + 0.1, 1.2], 0.11, 0.1, 6), C("#4a3624"))
  B.add("legno", cylBetween([-5.3, T_TOP + 2.5, 1.7], [-9.5, T_TOP + 0.1, -2.2], 0.1, 0.09, 6), C("#4a3624"))
  B.add("legno", cylBetween([-10.7, T_TOP + 2.15, 1.7], [-10.7, T_TOP + 0.6, -3.0], 0.09, 0.09, 6), C("#3a2a1c"))
}

/** Il canon (un 305 austriac in piçul) te caverne e la stue dal ricovar talian. */
function guns({ B, C, cylBetween }: SceneryKit) {
  B.add("ferro", cylBetween([13, 1.45, -96.4], [13, 1.75, -90.6], 0.26, 0.17, 12), C("#4c5040"))
  B.add("ferro", cylBetween([13, 1.4, -97.2], [13, 1.45, -96.3], 0.38, 0.36, 12), C("#3c4034"))
  for (const x of [10.8, 15.2]) {
    B.add("legno", new THREE.CylinderGeometry(0.7, 0.7, 0.14, 16).rotateZ(Math.PI / 2).translate(x, 0.7, -96), C("#5a3e28"))
    B.add("ferro", new THREE.TorusGeometry(0.7, 0.04, 4, 18).rotateY(Math.PI / 2).translate(x, 0.7, -96), C("#2a2622"))
  }
  // Munizions dal canon.
  for (let i = 0; i < 5; i++) B.add("ferro", cylBetween([9.3 + i * 0.28, 0.9, -97.8], [9.3 + i * 0.28, 1.5, -97.8], 0.11, 0.08, 8), C("#8a7040"))
  // Stue e tubo che al salte fûr dal cuviert dal ricovar.
  B.add("ferro", cylBetween([-4.6, 0, 94], [-4.6, 0.8, 94], 0.3, 0.3, 10), C("#2e2a26"))
  B.add("ferro", cylBetween([-4.6, 0.8, 94], [-4.6, 4.6, 94], 0.07, 0.07, 6), C(RUST))
  // Cussins di len e un mapamont sul taulîr.
  B.add("stoffa", boxAt([-5.4, 0.9, 97.2], [-3.6, 0.92, 98.4]), C("#d8cfae"))
  // Pâl cu la bandiere taliane e chê austriache sui comants (tele fine).
  for (const [x, z, cols] of [[16.5, 85, ["#2e8b3a", "#f2efe6", "#c8302c"]], [-16.5, -85, ["#d02a2a", "#f2efe6", "#d02a2a"]]] as const) {
    B.add("legno", cylBetween([x, 3.6, z], [x, 7.6, z], 0.05, 0.04, 6), C("#5a4030"))
    cols.forEach((c, i) => B.add("stoffa", boxAt([x + 0.05 + i * 0.5, 6.6, z - 0.01], [x + 0.55 + i * 0.5, 7.5, z + 0.01]), C(c)))
  }
}

/** Il prât ator de mape, a la stesse quote de tiere: il rilêf al cres plui in là. */
function nearGround({ map, B, C, face }: SceneryKit) {
  const { minX, maxX, minZ, maxZ } = map.bounds
  const R = 70
  const rings: [V, V][] = [
    [[minX - R, T_TOP - 4, minZ - R], [minX, T_TOP, maxZ + R]],
    [[maxX, T_TOP - 4, minZ - R], [maxX + R, T_TOP, maxZ + R]],
    [[minX, T_TOP - 4, minZ - R], [maxX, T_TOP, minZ]],
    [[minX, T_TOP - 4, maxZ], [maxX, T_TOP, maxZ + R]]
  ]
  for (const [a, b] of rings) {
    B.add("erba", face(a, b, "top"), C("#a8b088"))
    for (const s of ["east", "west", "south", "north"] as const) B.add("roccia", face(a, b, s), C("#b0aaa0"))
  }
  // cret a nord e a sud, sore il prât: la creste e cole
  const r = rng(515)
  for (let i = 0; i < 40; i++) {
    const side = i % 4
    const x = side < 2 ? minX - 8 - r() * 50 : side === 2 ? minX + r() * (maxX - minX) : maxX + 8 + r() * 50
    const z = side === 0 ? minZ + r() * (maxZ - minZ) : side === 1 ? minZ - 8 - r() * 50 : side === 2 ? (r() < 0.5 ? minZ - 8 - r() * 50 : maxZ + 8 + r() * 50) : minZ + r() * (maxZ - minZ)
    const s = 2 + r() * 5
    B.add("roccia", new THREE.DodecahedronGeometry(s, 0).scale(1, 0.5 + r() * 0.8, 1).rotateY(r() * 3).translate(x, T_TOP + s * 0.2, z), C("#c0b8ac").offsetHSL(0, 0, (r() - 0.5) * 0.1))
  }
}

export const scenery: Scenery = {
  build(kit) {
    const r = rng(1916)
    revetments(kit, r)
    duckboards(kit, r)
    railway(kit)
    barbedWire(kit, r)
    craters(kit, r)
    ruin(kit, r)
    guns(kit)
    nearGround(kit)
    // Lûs: la lampe dal ricovar e il fûc te caverne.
    const lamp = new THREE.PointLight("#ffb46a", 18, 9, 1.5)
    lamp.position.set(0, 2.3, 96)
    const cave = new THREE.PointLight("#ffa858", 26, 12, 1.5)
    cave.position.set(13, 2.6, -95)
    kit.root.add(lamp, cave)
    return {
      update(t: number) {
        lamp.intensity = 18 * (0.9 + 0.1 * Math.sin(t * 11))
        cave.intensity = 26 * (0.85 + 0.1 * Math.sin(t * 7) + 0.05 * Math.sin(t * 23))
      },
      setQuality(q) {
        lamp.visible = cave.visible = q !== "bassa"
      }
    }
  },
  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    const out = (x: number, z: number) => Math.hypot(Math.max(minX - x, x - maxX, 0), Math.max(minZ - z, z - maxZ, 0))
    // Lis Alps Cjargnelis: creste lungje a est e ovest (la linie dal front), pichs plui alts a nord.
    const height = (x: number, z: number) => {
      const d = out(x, z)
      const ridge = 1 - smooth(0, 900, Math.abs(z)) * 0.3
      const peaks = 260 + 420 * fbm(x / 210 + 7, z / 210 - 3) + 260 * smooth(-200, -900, z) * fbm(x / 90, z / 90)
      return T_TOP - 1.5 + smooth(70, 520, d) * peaks * ridge
    }
    return [makeHeightfield(height, { minX: minX - 70, maxX: maxX + 70, minZ: minZ - 70, maxZ: maxZ + 70 }, 1915)]
  },
  menu: {
    path: [[-34, 9, 52], [-6, 7, 34], [30, 10, 26], [36, 13, -12], [12, 9, -46], [-26, 11, -52], [-38, 16, -4], [-20, 20, 30]],
    look: [[0, 1, 40], [10, 1, 0], [0, 1, -38], [-8, 2, -1], [0, 1, -40], [13, 2, -94], [0, 1, 40], [-8, 2, 0]]
  },
  light: { sun: [0.5, 0.55, 0.62], fog: 0.0016 }
}
