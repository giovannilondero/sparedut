/**
 * Lo scenario del Fuart di Osôf: il colle di roccia con le scarpate murate, il campanile
 * di San Pieri, i bastioni con gallerie e garitte, la polveriera, i pini sul pendio e,
 * oltre, la pianura del Tagliamento con le Prealpi a nord.
 *
 * Tutto ciò che si tocca sta nei dati (`shared/maps/osoppo.ts`): qui solo decori sottili
 * e ciò che sta fuori dai bordi.
 */
import * as THREE from "three"
import { FORT, O_BASTION, O_LOW, O_RAMPART, O_TOP } from "../../../shared/maps/osoppo.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { boxAt, quad, rng, type V } from "../geo.ts"
import type { K, Scenery, SceneryKit } from "../scenery.ts"

const E = FORT.edge

/** Distanza in pianta dal rettangolo giocabile. */
function outside(b: SceneryKit["map"]["bounds"], x: number, z: number) {
  return Math.hypot(Math.max(b.minX - x, x - b.maxX, 0), Math.max(b.minZ - z, z - b.maxZ, 0))
}

/**
 * Il rilievo attorno al forte: al bordo vale la quota del ripiano (altopiano o piazzali),
 * poi il colle scende ripido fino alla pianura (~44 m più in basso); a nord le Prealpi,
 * a est le colline verso Gemona.
 */
function heightOf(b: SceneryKit["map"]["bounds"]) {
  return (x: number, z: number) => {
    const o = outside(b, x, z)
    const top = O_TOP * smooth(E + 4, E - 4, Math.abs(z))
    const plain = -44 + fbm(x / 300, z / 300) * 5
    const k = Math.min(1, o / 55) ** 0.7
    let h = top + (plain - top) * k
    h += fbm(x / 35 + 5, z / 35) * 6 * smooth(1, 12, o) * (1 - smooth(35, 60, o))
    const north = smooth(-480, -1000, z) * (320 + 420 * fbm(x / 260 + 3, z / 260))
    const east = smooth(450, 900, x) * (160 + 200 * fbm(x / 200, z / 200 + 2))
    return h + north + east
  }
}

/** Distanze dal bordo delle righe della scarpata vicina (fitte vicino al muro). */
const RINGS = [0, 0.8, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 90]
const NEAR = RINGS[RINGS.length - 1]

export const scenery: Scenery = {
  build(kit) {
    const { B, C, map, orient, cylBetween, sphere, roof, door, win } = kit
    const bounds = map.bounds
    const height = heightOf(bounds)
    const R = rng(4242)

    // --- il colle vicino: scarpata murata al bordo, roccia sui pendii, prato e pini -----------
    {
      const inner = (a0: number, a1: number) => {
        const out: number[] = []
        for (let a = a0; a < a1 - 0.01; a += 5) out.push(a)
        out.push(a1)
        return out
      }
      const xs = [...RINGS.slice(1).reverse().map((o) => bounds.minX - o), ...inner(bounds.minX, bounds.maxX), ...RINGS.slice(1).map((o) => bounds.maxX + o)]
      const zs = [...RINGS.slice(1).reverse().map((o) => bounds.minZ - o), ...inner(bounds.minZ, bounds.maxZ), ...RINGS.slice(1).map((o) => bounds.maxZ + o)]
      const grass = ["#7d8f52", "#8e9a4a", "#6f8a3e", "#86924f"].map(C)
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1]
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
        if (cx > bounds.minX && cx < bounds.maxX && cz > bounds.minZ && cz < bounds.maxZ) continue
        const h00 = height(x0, z0), h10 = height(x1, z0), h01 = height(x0, z1), h11 = height(x1, z1)
        const g = orient(quad([x0, h01, z1], [x1, h11, z1], [x1, h10, z0], [x0, h00, z0]), [0, 1, 0])
        const span = Math.min(x1 - x0, z1 - z0)
        const slope = (Math.max(h00, h10, h01, h11) - Math.min(h00, h10, h01, h11)) / span
        const o = outside(bounds, cx, cz)
        let key: K = "erba"
        let col = grass[Math.floor(R() * grass.length)].clone().offsetHSL(0, 0, (R() - 0.5) * 0.05)
        if (o < 0.8) {
          // la scarpata del forte, in conci
          key = "pietra"
          col = C("#cfc6b6")
        } else if (slope > 0.9) {
          key = "roccia"
          col = C("#c8c2b6").offsetHSL(0, 0, (R() - 0.5) * 0.08)
        }
        B.add(key, g, col)
      }
      // Pini e qualche latifoglia sul pendio.
      for (let n = 0; n < 220; n++) {
        const side = R()
        const t = R()
        const o = 6 + R() * 80
        const w = bounds.maxX - bounds.minX + 2 * o
        const d = bounds.maxZ - bounds.minZ + 2 * o
        let x: number, z: number
        if (side < 0.3) [x, z] = [bounds.minX - o, bounds.minZ - o + t * d]
        else if (side < 0.6) [x, z] = [bounds.maxX + o, bounds.minZ - o + t * d]
        else if (side < 0.8) [x, z] = [bounds.minX - o + t * w, bounds.minZ - o]
        else [x, z] = [bounds.minX - o + t * w, bounds.maxZ + o]
        const y = height(x, z) - 0.3
        const s = 0.8 + R() * 0.6
        if (R() < 0.7) {
          B.add("legno", cylBetween([x, y, z], [x, y + 2.4 * s, z], 0.22 * s, 0.16 * s, 6), C("#6a4a32"))
          B.add("erba", new THREE.ConeGeometry(2.3 * s, 7.5 * s, 7).translate(x, y + 2 * s + 3.75 * s, z), C("#3b5a2c").offsetHSL(0, 0, (R() - 0.5) * 0.06))
        } else {
          B.add("legno", cylBetween([x, y, z], [x, y + 3 * s, z], 0.25 * s, 0.18 * s, 6), C("#6a4a32"))
          B.add("erba", sphere([x, y + 4.2 * s, z], 2.6 * s, 0.85, 8), C("#55743a").offsetHSL(0, 0, (R() - 0.5) * 0.06))
        }
      }
    }

    // --- pareti di roccia fra le rampe della strada militare ----------------------------------
    {
      const gaps: [number, number][] = []
      let a = bounds.minX
      for (const [r0, r1] of FORT.ramps) {
        gaps.push([a, r0])
        a = r1
      }
      gaps.push([a, bounds.maxX])
      for (const s of [-1, 1]) for (const [x0, x1] of gaps) {
        const z = s * (E + 0.03)
        B.add("roccia", orient(quad([x0, O_LOW, z], [x1, O_LOW, z], [x1, O_TOP, z], [x0, O_TOP, z]), [0, 0, s]), C("#bdb6aa"))
        // massi piccoli ai piedi (troppo bassi per ripararsi)
        for (let k = 0; k < (x1 - x0) / 3; k++) {
          const g = new THREE.DodecahedronGeometry(0.25 + R() * 0.25).scale(1, 0.6, 1)
          B.add("roccia", g.translate(x0 + R() * (x1 - x0), O_LOW + 0.1, s * (E + 0.4 + R() * 1.2)), C("#a8a294"))
        }
      }
    }

    // --- bastioni trasversali: cordone, cornici delle gallerie, lapidi, garitte ---------------
    const garitta = (p: V) => {
      const [x, y, z] = p
      B.add("pietra", new THREE.CylinderGeometry(0.75, 0.35, 0.8, 10).translate(x, y - 0.4, z), C("#d6cdbd"))
      B.add("pietraChiara", new THREE.CylinderGeometry(0.8, 0.8, 2.2, 10).translate(x, y + 1.1, z))
      B.add("coppi", new THREE.ConeGeometry(1.05, 1.1, 10).translate(x, y + 2.75, z), C("#b88a72"))
      // feritoie
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) B.add("pietra", boxAt([-0.08, 0, -0.04], [0.08, 0.6, 0.04]).translate(0, y + 1.2, 0.79).rotateY(a).translate(x, 0, z), C("#2a2622"))
    }
    for (const s of [-1, 1]) {
      const zo = s * FORT.rampart.z1
      const zi = s * FORT.rampart.z0
      for (const [x0, x1] of [[bounds.minX, FORT.gate[0]], [FORT.gate[1], bounds.maxX]] as const) {
        B.add("pietraChiara", cylBetween([x0, O_TOP + 3.7, zo + s * 0.12], [x1, O_TOP + 3.7, zo + s * 0.12], 0.2, 0.2, 8), C("#efe7d8"))
        B.add("pietraChiara", cylBetween([x0, O_TOP + 3.7, zi - s * 0.12], [x1, O_TOP + 3.7, zi - s * 0.12], 0.2, 0.2, 8), C("#efe7d8"))
      }
      // gallerie: stipiti e architrave in pietra chiara su entrambe le facce
      for (const [t0, t1] of FORT.tunnels) for (const zf of [zo, zi]) {
        const out = zf === zo ? s : -s
        const f0 = zf, f1 = zf + out * 0.12
        const lo = Math.min(f0, f1), hi = Math.max(f0, f1)
        B.add("pietraChiara", boxAt([t0 - 0.5, O_TOP, lo], [t0, O_TOP + 3, hi]), C("#e8dfcf"))
        B.add("pietraChiara", boxAt([t1, O_TOP, lo], [t1 + 0.5, O_TOP + 3, hi]), C("#e8dfcf"))
        B.add("pietraChiara", boxAt([t0 - 0.5, O_TOP + 3, lo], [t1 + 0.5, O_TOP + 3.45, hi]), C("#efe7d8"))
        // la lapide col leone sopra la galleria
        B.add("marmo", boxAt([(t0 + t1) / 2 - 1, O_TOP + 3.6, lo], [(t0 + t1) / 2 + 1, O_TOP + 4.6, hi]), C("#f2ece0"))
      }
      // pilastri della porta, a filo del muro
      for (const x of [FORT.gate[0], FORT.gate[1]]) {
        const d = x < 0 ? -1 : 1
        for (const zf of [zo, zi]) {
          const out = zf === zo ? s : -s
          B.add("pietraChiara", boxAt([Math.min(x, x + d * 0.7), O_TOP, Math.min(zf, zf + out * 0.15)], [Math.max(x, x + d * 0.7), O_RAMPART + 0.4, Math.max(zf, zf + out * 0.15)]), C("#e8dfcf"))
        }
        B.add("pietraChiara", sphere([x + d * 0.35, O_RAMPART + 0.75, s * (FORT.rampart.z0 + FORT.rampart.z1) / 2], 0.35, 1, 10), C("#efe7d8"))
      }
      // garitte agli spigoli, sporgenti oltre il bordo
      for (const x of [bounds.minX - 1.1, bounds.maxX + 1.1]) garitta([x, O_RAMPART, s * (FORT.rampart.z1 - 0.8)])
    }
    for (const z of [FORT.bastion.minZ + 0.9, FORT.bastion.maxZ - 0.9]) garitta([bounds.maxX + 1.1, O_BASTION, z])
    for (const z of [bounds.minZ + 1.5, bounds.maxZ - 1.5]) for (const x of [bounds.minX - 1.1, bounds.maxX + 1.1]) garitta([x, O_LOW + 1.2, z])

    // --- campanile di San Pieri: cella campanaria, cornici, cuspide ---------------------------
    {
      const { minX, maxX, minZ, maxZ, top } = FORT.tower
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
      for (const y of [O_TOP + 8, top - 5.2, top]) B.add("pietraChiara", boxAt([minX - 0.15, y - 0.3, minZ - 0.15], [maxX + 0.15, y, maxZ + 0.15]), C("#ece4d4"))
      // bifore della cella: vani scuri con l'arco, su ogni faccia
      const faces: [V, number, number, number][] = [
        [[0, 0, 1], maxZ + 0.02, minX, maxX],
        [[0, 0, -1], minZ - 0.02, minX, maxX],
        [[1, 0, 0], maxX + 0.02, minZ, maxZ],
        [[-1, 0, 0], minX - 0.02, minZ, maxZ]
      ]
      for (const [n, plane, a0, a1] of faces) {
        const alongX = n[2] !== 0
        for (const u of [a0 + (a1 - a0) * 0.3, a0 + (a1 - a0) * 0.7]) {
          const P = (du: number, y: number): V => (alongX ? [u + du, y, plane] : [plane, y, u + du])
          const y0 = top - 4.6, y1 = top - 2.2
          B.add("pietra", orient(quad(P(-0.5, y0), P(0.5, y0), P(0.5, y1), P(-0.5, y1)), n), C("#1e1a16"))
          const arc = new THREE.CircleGeometry(0.5, 10, 0, Math.PI)
          if (alongX) arc.translate(u, y1, plane)
          else arc.rotateY(Math.PI / 2).translate(plane, y1, u)
          B.add("pietra", orient(arc, n), C("#1e1a16"))
        }
      }
      // cuspide a piramide e croce
      B.add("coppi", new THREE.ConeGeometry(Math.SQRT1_2 * (maxX - minX) + 0.3, 4.2, 4).rotateY(Math.PI / 4).translate(cx, top + 2.1, cz), C("#a87866"))
      B.add("ferro", cylBetween([cx, top + 4.1, cz], [cx, top + 5.6, cz], 0.05), C("#2a2622"))
      B.add("ferro", cylBetween([cx - 0.45, top + 5.1, cz], [cx + 0.45, top + 5.1, cz], 0.04), C("#2a2622"))
      // la campana, appena visibile dentro la cella
      const bell = new THREE.LatheGeometry([[0, 0], [0.55, 0], [0.5, 0.15], [0.35, 0.6], [0.25, 0.85], [0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)), 12)
      B.add("ferro", bell.translate(cx, top - 4.2, cz), C("#9a7a3a"))
    }

    // --- rovine di San Pieri: stipiti del portale, macerie minute, ciuffi d'erba sui muri ------
    {
      const { minX, maxX, minZ, maxZ } = FORT.church
      for (const z of [-3.35, 3]) B.add("pietraChiara", boxAt([maxX, O_TOP, z], [maxX + 0.12, O_TOP + 4.2, z + 0.35]), C("#e8dfcf"))
      for (let k = 0; k < 60; k++) {
        const inside = R() < 0.6
        const x = inside ? minX + 1.2 + R() * (maxX - minX - 2.4) : minX + R() * (maxX - minX)
        const z = inside ? minZ + 1.2 + R() * (maxZ - minZ - 2.4) : (R() < 0.5 ? minZ - 0.6 - R() * 1.5 : maxZ + 0.6 + R() * 1.5)
        const g = new THREE.DodecahedronGeometry(0.12 + R() * 0.2).scale(1, 0.55, 1)
        B.add("pietra", g.translate(x, O_TOP + 0.06, z), C("#cfc6b6"))
      }
      // erba e cespugli in cima ai muri crollati (sottili: non riparano)
      const tops = map.blocks.filter((b) => b.mat === "pietra" && b.look === "muro" && b.min[0] >= minX && b.max[0] <= maxX && b.min[2] >= minZ && b.max[2] <= maxZ)
      for (const b of tops) {
        const len = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])
        for (let k = 0; k < len / 2; k++) {
          const x = b.min[0] + R() * (b.max[0] - b.min[0])
          const z = b.min[2] + R() * (b.max[2] - b.min[2])
          B.add("erba", sphere([x, b.max[1] + 0.1, z], 0.35 + R() * 0.3, 0.5, 6), C("#5e7a35"))
        }
      }
    }

    // --- polveriere: volta a capanna, porta di ferro, feritoie ---------------------------------
    {
      const { minX, maxX, minZ, maxZ, top } = FORT.powder
      for (const s of [1, -1]) {
        const [x0, x1] = s > 0 ? [minX, maxX] : [-maxX, -minX]
        const [z0, z1] = s > 0 ? [minZ, maxZ] : [-maxZ, -minZ]
        roof(x0, z0, x1, z1, top, C("#cfc6b6"), 1.6, "pietra")
        const nx = s > 0 ? -1 : 1
        const fx = s > 0 ? minX : -minX
        door([nx, 0, 0], [fx, O_LOW, s * ((minZ + maxZ) / 2)], 1.4, 2.4, C("#4a4a48"))
        for (const dz of [-4, 4]) win([nx, 0, 0], [fx, O_LOW + 3.2, s * ((minZ + maxZ) / 2) + dz], 0.25, 0.9, null, false)
      }
    }

    // --- la bandiera del Friûl sul bastione est -----------------------------------------------
    {
      const x = FORT.bastion.maxX - 1.2, z = 0
      B.add("ferro", cylBetween([x, O_BASTION, z], [x, O_BASTION + 9, z], 0.07, 0.05), C("#3a3632"))
      B.add("stoffa", quad([x, O_BASTION + 7, z], [x, O_BASTION + 7, z - 3], [x, O_BASTION + 8.8, z - 3], [x, O_BASTION + 8.8, z]), C("#2a5ab8"))
      B.add("stoffa", quad([x - 0.01, O_BASTION + 7.6, z - 0.9], [x - 0.01, O_BASTION + 7.6, z - 2.1], [x - 0.01, O_BASTION + 8.3, z - 2.1], [x - 0.01, O_BASTION + 8.3, z - 0.9]), C("#f0c830"))
    }
  },

  backdrop({ map }) {
    const height = heightOf(map.bounds)
    // Vicino al forte il rilievo lo disegna la scarpata fine di `build`: qui si abbassa sotto.
    const far = (x: number, z: number) => height(x, z) - 6 * (1 - smooth(NEAR - 20, NEAR, outside(map.bounds, x, z)))
    return [makeHeightfield(far, map.bounds, 911)]
  },

  menu: {
    path: [[0, 34, -118], [72, 30, -62], [80, 38, 24], [24, 28, 116], [-62, 32, 72], [-78, 30, -28]],
    look: [[0, 8, -40], [0, 8, -20], [12, 9, 0], [0, 8, 32], [-22, 12, 4], [-24, 16, -12]]
  }
}
