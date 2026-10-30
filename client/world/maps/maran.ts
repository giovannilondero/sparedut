/**
 * Lagune di Maran: la aghe basse cu lis barenis e lis cjanis, lis briculis dai canâi, i
 * casons di pae, la foresterie de riserve (cun dentri jets a cjast, cusine, fogolâr e
 * bagns) e il casot di osservazion: la bale di spieli che e zire, lis lûs coloradis, il
 * paviment che al cambie colôr a timp, i fenicotars che a balin, il cjoc distirât cul cjâf
 * sul scjalin (al sta ben, al duar) e la pignate de bire. Fûr, altris fenicotars te aghe;
 * tal fonts lis Alps e il cjampanili di Maran.
 *
 * Dut ce che si tocje al sta tai dâts (`shared/maps/maran.ts`): culì dome decors e il
 * fonts.
 */
import * as THREE from "three"
import {
  BOARDWALK_Y,
  BOARDWALKS,
  CASON_TOP,
  CASONS,
  CASOT,
  DISCO,
  FORESTERIE,
  LAND,
  LANDS,
  OPENINGS,
  PATHS,
  PIGNATE,
  PONT,
  SCJALIN,
  SEA,
  SHELF,
  STAIRS,
  TREES,
  WATER,
  type Land
} from "../../../shared/maps/maran.ts"
import { fbm, makeHeightfield, smooth } from "../backdrop.ts"
import { boxAt, quad, type V } from "../geo.ts"
import type { Scenery, SceneryKit } from "../scenery.ts"

const BPM = 124

/** Una scritta su tela, per insegne e cartelli. */
function sign(lines: readonly string[], w: number, h: number, bg: string, ink: string, font = "Georgia, serif"): THREE.Mesh {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = Math.round((512 * h) / w)
  const g = c.getContext("2d")!
  g.fillStyle = bg
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = ink
  g.lineWidth = 6
  g.strokeRect(8, 8, c.width - 16, c.height - 16)
  g.fillStyle = ink
  g.textAlign = "center"
  g.textBaseline = "middle"
  lines.forEach((line, i) => {
    const size = i === 0 ? c.height / (lines.length + 1.2) : c.height / (lines.length + 3)
    g.font = `${i === 0 ? "bold " : "italic "}${Math.round(size)}px ${font}`
    g.fillText(line, c.width / 2, (c.height * (i + 0.75)) / (lines.length + 0.5), c.width - 40)
  })
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }))
}

/** Il fenicotar: corpo rosa, cuel a S, bec plegât cu la ponte nere, gjambis lungjis. */
function flamingo() {
  const pink = new THREE.MeshLambertMaterial({ color: "#f28aa2" })
  const deep = new THREE.MeshLambertMaterial({ color: "#d9506e" })
  const black = new THREE.MeshLambertMaterial({ color: "#1a1416" })
  const leg = new THREE.MeshLambertMaterial({ color: "#e06a84" })
  const g = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = 0.82
  g.add(body)
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.16, 0.15, 0.27), pink)
  body.add(torso)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6).rotateX(-1.9), deep)
  tail.position.set(0, 0.02, -0.3)
  body.add(tail)
  const wings = [-1, 1].map((sx) => {
    const p = new THREE.Group()
    p.position.set(sx * 0.12, 0.05, 0)
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.04, 0.1, 0.24).translate(sx * 0.03, 0, -0.03), deep)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5).scale(0.03, 0.06, 0.1).translate(sx * 0.03, -0.02, -0.24), black)
    p.add(w, tip)
    body.add(p)
    return p
  })
  // il cuel: un tubo a S che va sù e indenant, il cjâf su la ponte
  const neck = new THREE.Group()
  neck.position.set(0, 0.08, 0.2)
  body.add(neck)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.18, 0.1),
    new THREE.Vector3(0, 0.36, -0.04),
    new THREE.Vector3(0, 0.52, 0.02),
    new THREE.Vector3(0, 0.6, 0.1)
  ])
  neck.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), pink))
  const head = new THREE.Group()
  head.position.set(0, 0.6, 0.1)
  neck.add(head)
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), pink))
  const beak = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.11, 6).rotateX(Math.PI / 2 + 0.7).translate(0, -0.03, 0.08), new THREE.MeshLambertMaterial({ color: "#f4e0d0" }))
  const beakTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6).rotateX(Math.PI / 2 + 1.2).translate(0, -0.08, 0.12), black)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), black)
    eye.position.set(sx * 0.04, 0.015, 0.03)
    head.add(eye)
  }
  head.add(beak, beakTip)
  // gjambis: anche, zenoli che si plee indaûr, pît
  const legs = [-1, 1].map((sx) => {
    const hip = new THREE.Group()
    hip.position.set(sx * 0.06, 0.8, -0.02)
    g.add(hip)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5).translate(0, -0.2, 0), leg)
    hip.add(upper)
    const knee = new THREE.Group()
    knee.position.y = -0.4
    hip.add(knee)
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), leg))
    knee.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.4, 5).translate(0, -0.2, 0), leg))
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.1).translate(0, -0.4, 0.04), leg)
    knee.add(foot)
    return { hip, knee }
  })
  g.traverse((o) => (o.castShadow = true))
  return { g, body, neck, head, wings, legs }
}

/** Il cjoc: distirât par tiere, il cjâf sul scjalin, la bocje vierte. Al respire. */
function sleeper() {
  const g = new THREE.Group()
  const skin = new THREE.MeshLambertMaterial({ color: "#e0a888" })
  const shirt = new THREE.MeshLambertMaterial({ color: "#b04030" })
  const check = new THREE.MeshLambertMaterial({ color: "#5a1a14" })
  const pants = new THREE.MeshLambertMaterial({ color: "#3a4a6a" })
  const shoe = new THREE.MeshLambertMaterial({ color: "#2a1a10" })
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    o.position.set(x, y, z)
    o.rotation.set(rx, ry, rz)
    o.castShadow = true
    g.add(o)
    return o
  }
  // Il cuarp al va lunc l'ass x: i pîts a x=0, il cjâf viers +x (sul scjalin).
  const chest = new THREE.Group()
  chest.position.set(1.35, 0.14, 0)
  chest.rotation.z = 0.2
  g.add(chest)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.42), shirt)
  torso.castShadow = true
  chest.add(torso)
  for (const z of [-0.12, 0.04, 0.18]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.225, 0.03), check)
    stripe.position.z = z
    chest.add(stripe)
  }
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1.3, 0.8, 1.1), shirt)
  belly.position.set(-0.12, 0.06, 0)
  chest.add(belly)
  box(0.56, 0.16, 0.18, pants, 0.75, 0.09, -0.11, 0, 0, 0.05)
  box(0.3, 0.15, 0.17, pants, 0.62, 0.22, 0.12, 0, 0, -0.6) // une gjambe plegade
  box(0.32, 0.14, 0.16, pants, 0.36, 0.2, 0.12, 0, 0, 0.6)
  box(0.12, 0.1, 0.22, shoe, 0.2, 0.06, 0.12)
  box(0.5, 0.15, 0.17, pants, 0.25, 0.08, -0.11)
  box(0.1, 0.18, 0.12, shoe, -0.02, 0.1, -0.11)
  // braçs: un sul pet, chel altri distirât cu la butilie
  box(0.4, 0.1, 0.1, shirt, 1.42, 0.3, 0.06, 0, 0.5, 0.2)
  box(0.42, 0.09, 0.1, shirt, 1.3, 0.06, -0.42, 0, -0.7, 0)
  box(0.1, 0.07, 0.1, skin, 1.08, 0.05, -0.62)
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8).rotateZ(Math.PI / 2 - 0.2), new THREE.MeshStandardMaterial({ color: "#3a6a2a", roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }))
  bottle.position.set(0.92, 0.04, -0.68)
  g.add(bottle)
  // cjâf sul scjalin, cul nâs ros
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin)
  head.position.set(1.83, 0.36, 0)
  g.add(head)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color: "#d04a40" }))
  nose.position.set(1.85, 0.47, 0)
  g.add(nose)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).scale(1, 0.6, 1.4), new THREE.MeshLambertMaterial({ color: "#3a1010" }))
  mouth.position.set(1.8, 0.44, 0.05)
  g.add(mouth)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#6a6060" }))
  hair.position.set(1.85, 0.36, 0)
  g.add(hair)
  // il cjapiel colât
  const hat = new THREE.Group()
  hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), new THREE.MeshLambertMaterial({ color: "#3a4a2a" })))
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), new THREE.MeshLambertMaterial({ color: "#3a4a2a" }))
  crown.position.y = 0.06
  hat.add(crown)
  const feather = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.22, 0.03), new THREE.MeshLambertMaterial({ color: "#2a2a2a" }))
  feather.position.set(0.08, 0.14, 0)
  feather.rotation.z = -0.4
  hat.add(feather)
  hat.position.set(1.65, 0.02, 0.55)
  hat.rotation.set(0.3, 0.6, 0.2)
  g.add(hat)
  // "Zzz": letaris che a van sù e a sparissin
  const zMat = (() => {
    const c = document.createElement("canvas")
    c.width = c.height = 64
    const x = c.getContext("2d")!
    x.font = "bold 52px Georgia, serif"
    x.fillStyle = "#ffffff"
    x.textAlign = "center"
    x.textBaseline = "middle"
    x.fillText("z", 32, 34)
    const t = new THREE.CanvasTexture(c)
    return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })
  })()
  const zs = Array.from({ length: 3 }, () => {
    const s = new THREE.Sprite(zMat.clone())
    g.add(s)
    return s
  })
  return {
    g,
    update(t: number) {
      // respir lunc, cul russâ
      const breath = Math.sin(t * 1.4)
      chest.scale.set(1, 1 + 0.06 * breath, 1 + 0.03 * breath)
      belly.scale.setScalar(1 + 0.05 * breath)
      zs.forEach((s, i) => {
        const p = (t * 0.35 + i / 3) % 1
        s.position.set(1.9 + p * 0.3, 0.6 + p * 0.9, Math.sin(p * 6 + i) * 0.12)
        s.scale.setScalar(0.12 + p * 0.22)
        s.material.opacity = Math.sin(p * Math.PI)
      })
    }
  }
}

/** Une bricule: trê pâi tal ploc leâts insiemi in alt, a segnâ il canâl. */
function bricola(kit: SceneryKit, x: number, z: number, lean: number) {
  const { B, C, cylBetween } = kit
  const top: V = [x + lean * 0.1, WATER + 3.2, z]
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + lean
    B.add("legno", cylBetween([x + Math.cos(a) * 0.35, -2, z + Math.sin(a) * 0.35], top, 0.13, 0.11, 6), C("#6a5a48"))
  }
  B.add("ferro", new THREE.TorusGeometry(0.16, 0.03, 4, 10).rotateX(Math.PI / 2).translate(top[0], top[1] - 0.4, top[2]), C("#3a3430"))
}

/** Un cason di pescjadôrs: mûrs di cane e tet di pae fin cuasi par tiere, la puarte nere. */
function cason(kit: SceneryKit, c: (typeof CASONS)[number]) {
  const { B, C } = kit
  const alongX = c.maxX - c.minX >= c.maxZ - c.minZ
  const y0 = LAND
  const wallTop = y0 + 1.1
  const ridge = y0 + CASON_TOP + 0.7
  // mûrs bas di cane
  B.add("fen", boxAt([c.minX + 0.2, y0, c.minZ + 0.2], [c.maxX - 0.2, wallTop, c.maxZ - 0.2]), C("#b8a070"))
  // tet a dôs aghis fin a 30 cm di tiere, cul colm lunc il lât lunc
  const shape = new THREE.Shape()
  const half = alongX ? (c.maxZ - c.minZ) / 2 + 0.4 : (c.maxX - c.minX) / 2 + 0.4
  shape.moveTo(-half, 0)
  shape.lineTo(half, 0)
  shape.lineTo(0, ridge - y0 - 0.3)
  shape.closePath()
  const len = (alongX ? c.maxX - c.minX : c.maxZ - c.minZ) + 0.6
  const roof = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false })
  roof.translate(0, 0, -len / 2)
  if (alongX) roof.rotateY(Math.PI / 2)
  roof.translate((c.minX + c.maxX) / 2, y0 + 0.3, (c.minZ + c.maxZ) / 2)
  B.add("fen", roof, C("#a08a5a"))
  // la puarte su la tieste
  const cx = (c.minX + c.maxX) / 2
  const cz = (c.minZ + c.maxZ) / 2
  const d = alongX ? boxAt([c.maxX + 0.25, y0, cz - 0.45], [c.maxX + 0.3, y0 + 1.9, cz + 0.45]) : boxAt([cx - 0.45, y0, c.maxZ + 0.25], [cx + 0.45, y0 + 1.9, c.maxZ + 0.3])
  B.add("legno", d, C("#2a2018"))
  // il fum dal cjamin: un pâl di len cul cjapiel
  B.add("legno", kit.cylBetween([cx, ridge - 0.6, cz], [cx, ridge + 0.5, cz], 0.12), C("#5a4a3a"))
}

export const scenery: Scenery = {
  build(kit) {
    const { B, C, root, R, cylBetween, sphere, map } = kit
    const quality = { lights: [] as THREE.Light[] }

    // --- aghe e rivis -----------------------------------------------------------------------
    const { minX, maxX, minZ, maxZ } = map.bounds
    B.add("acqua", kit.face([minX, WATER - 0.01, minZ], [maxX, WATER, maxZ], "top"), C("#b8e0d8"))
    /** La normâl in fûr dal ôr `i` (il poligon al pues jessi zirât in ducj i doi sens). */
    const outward = (l: Land) => {
      let area = 0
      for (let i = 0; i < l.poly.length; i++) {
        const a = l.poly[i]
        const b = l.poly[(i + 1) % l.poly.length]
        area += a[0] * b[1] - b[0] * a[1]
      }
      return (i: number): [number, number, number] => {
        const a = l.poly[i]
        const b = l.poly[(i + 1) % l.poly.length]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const sg = area > 0 ? 1 : -1
        return [(sg * (b[1] - a[1])) / len, (sg * -(b[0] - a[0])) / len, len]
      }
    }
    /** Un ôr al è sul confin de mape (là no si viôt e no si met nuie). */
    const onBorder = (a: readonly [number, number], b: readonly [number, number]) =>
      (Math.abs(a[0] - b[0]) < 1e-6 && (Math.abs(Math.abs(a[0]) - maxX) < 1e-6)) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(Math.abs(a[1]) - maxZ) < 1e-6)
    /** Lis tieris sutis come lis à la fisiche: cuvierte lisse e la rive di fanc che e cale te aghe. */
    for (const l of LANDS) {
      const shape = new THREE.Shape(l.poly.map(([x, z]) => new THREE.Vector2(x, -z)))
      B.add(l.mat === "terra" ? "terra" : "erba", new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, LAND, 0), C(l.tint))
      const out = outward(l)
      for (let i = 0; i < l.poly.length; i++) {
        const a = l.poly[i]
        const b = l.poly[(i + 1) % l.poly.length]
        if (onBorder(a, b)) continue
        const [nx, nz] = out(i)
        const w = SHELF + 0.2
        B.add("terra", kit.orient(quad([a[0], LAND, a[1]], [b[0], LAND, b[1]], [b[0] + nx * w, SEA, b[1] + nz * w], [a[0] + nx * w, SEA, a[1] + nz * w]), [nx, 1, nz]), C("#8a7a5a"))
      }
    }
    // i trois di tiere batude, un fregul parsore la cuvierte
    for (const path of PATHS) {
      for (let i = 0; i + 1 < path.length; i++) {
        const [ax, az] = path[i]
        const [bx, bz] = path[i + 1]
        const len = Math.hypot(bx - ax, bz - az)
        const px = (-(bz - az) / len) * 0.9
        const pz = ((bx - ax) / len) * 0.9
        B.add("terra", kit.orient(quad([ax - px, LAND + 0.04, az - pz], [ax + px, LAND + 0.04, az + pz], [bx + px, LAND + 0.04, bz + pz], [bx - px, LAND + 0.04, bz - pz]), [0, 1, 0]), C("#c8b890"))
        B.add("terra", new THREE.CircleGeometry(0.9, 10).rotateX(-Math.PI / 2).translate(bx, LAND + 0.04, bz), C("#c8b890"))
      }
    }

    // --- cjanis tal ôr des tieris, dulà che no si rive cu lis passerelis ---------------------
    const reedCol = [C("#d8dca0"), C("#e8d890"), C("#c0cc88")]
    const landing = (x: number, z: number) =>
      BOARDWALKS.some((w) => x > w.minX - 1.5 && x < w.maxX + 1.5 && z > w.minZ - 1.5 && z < w.maxZ + 1.5) ||
      (x > PONT.x0 - 2 && x < PONT.x1 + 2 && z > PONT.z0 - 2 && z < PONT.z1 + 2)
    let reedN = 0
    const reed = (x: number, z: number) => {
      if (landing(x, z) || x < minX + 1 || x > maxX - 1 || z < minZ + 1 || z > maxZ - 1) return
      const h = 1.4 + R() * 1.3
      const lx = (R() - 0.5) * 0.3
      B.add("erba", cylBetween([x, WATER - 0.3, z], [x + lx, WATER + h, z + (R() - 0.5) * 0.3], 0.025, 0.008, 3), reedCol[reedN % 3])
      if (reedN++ % 3 === 0) B.add("terra", sphere([x + lx, WATER + h - 0.1, z], 0.05, 3, 5), C("#5a4030"))
    }
    for (const l of LANDS) {
      const out = outward(l)
      for (let i = 0; i < l.poly.length; i++) {
        const a = l.poly[i]
        const b = l.poly[(i + 1) % l.poly.length]
        if (onBorder(a, b)) continue
        const [nx, nz, len] = out(i)
        for (let k = 0; k < len * 1.3; k++) {
          const t = R()
          const off = 0.4 + R() * 1.4
          reed(a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + nz * off)
        }
      }
    }

    // --- briculis e barcjis ---------------------------------------------------------------
    for (const [x, z] of [[-15, -38], [15, -38], [-15, 0], [10, -20], [-15, 40], [15, 50], [-62, 10], [62, -8], [35, 56], [-40, 56]] as const) bricola(kit, x, z, R() * 3)
    const hull = (x: number, z: number, yaw: number, col: string) => {
      const s = new THREE.Shape()
      s.moveTo(-0.7, 0)
      s.quadraticCurveTo(-0.75, 2.2, 0, 3.4)
      s.quadraticCurveTo(0.75, 2.2, 0.7, 0)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, WATER - 0.1, 1.7)
      g.rotateY(yaw).translate(x, 0, z)
      B.add("legno", g, C(col))
    }
    hull(18, 56, 0.3, "#3a5a7a")
    hull(-20, 52, -0.2, "#7a3a2a")
    hull(-44, 47, 1.2, "#e8e0d0")

    // --- passerelis: breis e pâi -----------------------------------------------------------
    for (const w of BOARDWALKS) {
      const alongX = w.maxX - w.minX > w.maxZ - w.minZ
      const len = alongX ? w.maxX - w.minX : w.maxZ - w.minZ
      for (let a = 0.6; a < len; a += 2.4) {
        for (const side of [0, 1]) {
          const x = alongX ? w.minX + a : side ? w.maxX - 0.1 : w.minX + 0.1
          const z = alongX ? (side ? w.maxZ - 0.1 : w.minZ + 0.1) : w.minZ + a
          B.add("legno", cylBetween([x, LAND - 0.1, z], [x, LAND + 1, z], 0.06, 0.06, 5), C("#7a6448"))
        }
      }
      for (const side of [0, 1]) {
        const a: V = alongX ? [w.minX, LAND + 0.95, side ? w.maxZ - 0.12 : w.minZ + 0.08] : [side ? w.maxX - 0.12 : w.minX + 0.08, LAND + 0.95, w.minZ]
        const b: V = alongX ? [w.maxX, LAND + 1.0, a[2] + 0.04] : [a[0] + 0.04, LAND + 1.0, w.maxZ]
        B.add("legno", boxAt(a, b), C("#8a7050"))
      }
      // lis breis (un fregul parsore la tiere dulà che si poin) e i trâfs disot
      const y = BOARDWALK_Y + 0.03
      for (let a = 0; a < len; a += 0.35) {
        const g = alongX ? boxAt([w.minX + a, y - 0.06, w.minZ], [w.minX + a + 0.3, y, w.maxZ]) : boxAt([w.minX, y - 0.06, w.minZ + a], [w.maxX, y, w.minZ + a + 0.3])
        B.add("legno", g, C("#ffffff").offsetHSL(0, 0, (R() - 0.5) * 0.1))
      }
      for (const side of [0.25, 0.75]) {
        const g = alongX
          ? boxAt([w.minX, y - 0.22, w.minZ + (w.maxZ - w.minZ) * side - 0.08], [w.maxX, y - 0.06, w.minZ + (w.maxZ - w.minZ) * side + 0.08])
          : boxAt([w.minX + (w.maxX - w.minX) * side - 0.08, y - 0.22, w.minZ], [w.minX + (w.maxX - w.minX) * side + 0.08, y - 0.06, w.maxZ])
        B.add("legno", g, C("#6a5440"))
      }
    }

    // --- il puintut a schene di mus ------------------------------------------------------------
    {
      const P = PONT
      const yAt = (z: number) => (z < P.up ? LAND + ((P.deck - LAND) * (z - P.z0)) / (P.up - P.z0) : z > P.down ? P.deck - ((P.deck - LAND) * (z - P.down)) / (P.z1 - P.down) : P.deck)
      for (let z = P.z0 + 0.2; z < P.z1 - 0.1; z += 0.34) B.add("legno", boxAt([P.x0 - 0.05, yAt(z) - 0.02, z - 0.15], [P.x1 + 0.05, yAt(z) + 0.03, z + 0.15]), C("#ffffff").offsetHSL(0, 0, (R() - 0.5) * 0.12))
      for (const x of [P.x0 - 0.06, P.x1 + 0.06]) {
        for (let z = P.z0 + 0.3; z <= P.z1 - 0.2; z += 1.5) B.add("legno", cylBetween([x, z > P.up && z < P.down ? SEA : yAt(z) - 0.3, z], [x, yAt(z) + P.rail, z], 0.06, 0.06, 6), C("#6a5038"))
        // il corimano: un toc par ogni tratt, che al seguìs la schene
        for (const [a, b] of [[P.z0 + 0.3, P.up], [P.up, P.down], [P.down, P.z1 - 0.2]] as const) {
          B.add("legno", cylBetween([x, yAt(a) + P.rail, a], [x, yAt(b) + P.rail, b], 0.05, 0.05, 6), C("#8a6a48"))
          B.add("legno", cylBetween([x, yAt(a) + P.rail * 0.5, a], [x, yAt(b) + P.rail * 0.5, b], 0.035, 0.035, 5), C("#7a5e40"))
        }
      }
      // i pâi tal ploc sot dal plan
      for (const z of [P.up + 0.3, (P.up + P.down) / 2, P.down - 0.3]) {
        for (const x of [P.x0 + 0.3, P.x1 - 0.3]) B.add("legno", cylBetween([x, -1.5, z], [x, P.under, z], 0.12, 0.12, 6), C("#5a4434"))
      }
    }

    // --- arbui: i stes de fisiche (il tronc al colît), la frasche alte -------------------------
    for (const t of TREES) {
      const s = t.s
      const h = 3 * s
      const bend = (R() - 0.5) * 0.4
      B.add("legno", cylBetween([t.x, LAND - 0.1, t.z], [t.x + bend, LAND + h, t.z + bend * 0.5], 0.2 * s, 0.12 * s, 7), C("#6a5444").offsetHSL(0, 0, (R() - 0.5) * 0.06))
      const green = C("#5a7a48").offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + R()
        const r = (0.5 + R() * 0.7) * s
        B.add("erba", sphere([t.x + bend + Math.cos(a) * r, LAND + h + (0.2 + R() * 1.1) * s, t.z + Math.sin(a) * r], (1 + R() * 0.5) * s, 0.75, 7), green)
      }
      B.add("erba", sphere([t.x + bend, LAND + h + 1.4 * s, t.z], 1.1 * s, 0.8, 7), green)
    }

    // --- casons ------------------------------------------------------------------------------
    for (const c of CASONS) cason(kit, c)

    // --- foresterie ----------------------------------------------------------------------------
    const F = FORESTERIE
    // cornîs ator di puartis e balcons, su dutis dôs lis musis dal mûr
    for (const o of OPENINGS) {
      if (o.mat !== "intonacoBianco") continue
      const fr = 0.08
      const out = 0.05
      const [x0, y0, z0] = o.min
      const [x1, y1, z1] = o.max
      const col = C(o.door ? "#5a3a24" : "#4a6a4a")
      // la cornîs e sta su lis musis dal mûr, no dentri te vierzidure (li e tremave cul intonac);
      // il bancâl al sta un fregul parsore il mûr
      if (o.alongX) {
        for (const [za, zb] of [[z0 - out, z0], [z1, z1 + out]] as const) {
          B.add("legno", boxAt([x0 - fr, y0, za], [x0, y1 + fr, zb]), col)
          B.add("legno", boxAt([x1, y0, za], [x1 + fr, y1 + fr, zb]), col)
          B.add("legno", boxAt([x0, y1, za], [x1, y1 + fr, zb]), col)
        }
        if (!o.door) B.add("pietraChiara", boxAt([x0 - fr, y0 - 0.06, z0 - out - 0.04], [x1 + fr, y0 + 0.04, z1 + out + 0.04]), C("#e8e0d0"))
      } else {
        for (const [xa, xb] of [[x0 - out, x0], [x1, x1 + out]] as const) {
          B.add("legno", boxAt([xa, y0, z0 - fr], [xb, y1 + fr, z0]), col)
          B.add("legno", boxAt([xa, y0, z1], [xb, y1 + fr, z1 + fr]), col)
          B.add("legno", boxAt([xa, y1, z0], [xb, y1 + fr, z1]), col)
        }
        if (!o.door) B.add("pietraChiara", boxAt([x0 - out - 0.04, y0 - 0.06, z0 - fr], [x1 + out + 0.04, y0 + 0.04, z1 + fr]), C("#e8e0d0"))
      }
    }
    // zocul di piere su la façade, interot dulà che a son lis puartis
    {
      const doors = OPENINGS.filter((o) => o.door && o.alongX && o.min[2] >= F.maxZ - F.t - 0.01).map((o) => [o.min[0], o.max[0]] as const).sort((a, b) => a[0] - b[0])
      let at = F.minX - 0.06
      for (const [d0, d1] of [...doors, [F.maxX + 0.06, F.maxX + 0.06] as const]) {
        if (d0 - at > 0.01) B.add("pietra", boxAt([at, 0, F.maxZ], [d0, 0.5, F.maxZ + 0.06]), C("#b8b0a0"))
        at = d1
      }
    }
    // la cornîs dal tet: dome ator dai mûrs, di fûr (sore il tet e taponave il bûs de scjale)
    for (const [a, b] of [
      [[F.minX - 0.1, F.roof - 0.2, F.minZ - 0.1], [F.maxX + 0.1, F.roof, F.minZ]],
      [[F.minX - 0.1, F.roof - 0.2, F.maxZ], [F.maxX + 0.1, F.roof, F.maxZ + 0.1]],
      [[F.minX - 0.1, F.roof - 0.2, F.minZ], [F.minX, F.roof, F.maxZ]],
      [[F.maxX, F.roof - 0.2, F.minZ], [F.maxX + 0.1, F.roof, F.maxZ]]
    ] as [V, V][]) B.add("pietraChiara", boxAt(a, b), C("#ece6da"))
    // pavimenti di dentri: cotto in salon, piastrelis in cusine, bagns e te sale de scjale
    B.add("porfido", boxAt([F.minX + F.t, 0, F.minZ + F.t], [2, 0.04, F.maxZ - F.t]), C("#c88a5a"))
    B.add("marmo", boxAt([2.4, 0, F.minZ + F.t], [F.maxX - F.t, 0.04, F.maxZ - F.t]), C("#d8dcd8"))
    // insegne su la façade
    const plaque = sign(["Foresterie", "Riserve naturâl des Focis dal Stele"], 5, 1.1, "#f4ecd8", "#3a4a2a")
    plaque.position.set(-1, 3.0, F.maxZ + 0.06)
    root.add(plaque)
    // la bandiere dal Friûl sul tet
    B.add("ferro", cylBetween([-18, F.roof, -80], [-18, F.roof + 6, -80], 0.05), C("#c8c8c8"))
    const flag = sign(["🦅"], 1.8, 1.2, "#2a5aa8", "#e8c040", "serif")
    flag.position.set(-17.05, F.roof + 5.35, -80)
    ;(flag.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide
    root.add(flag)

    // salon: bancjis, fogolâr cu la nape, cuadris
    for (const x of [-16.55, -14.45, -4.55, -2.45]) B.add("legno", boxAt([x - 0.2, 0, -79.8], [x + 0.2, 0.45, -74.2]), C("#9a6a40"))
    B.add("pietra", boxAt([-19.6, 1.2, -69.7], [-18.4, 3.6, -66.8]), C("#d8d0c4"))
    B.add("pietraChiara", boxAt([-19.6, 1.15, -69.8], [-18.3, 1.3, -66.7]), C("#a89a88"))
    const fire = new THREE.PointLight("#ff9a40", 18, 9, 1.6)
    fire.position.set(-18.4, 0.8, -68.25)
    root.add(fire)
    B.add("luce", sphere([-18.9, 0.55, -68.25], 0.25, 0.6, 8), new THREE.Color(3, 1.2, 0.3))
    const map1 = sign(["Lagune di Maran", "Focis dal Stele · Val Cjanâl Gnûf"], 3, 1.6, "#e8dcc0", "#2a4a6a")
    map1.position.set(-8, 2.2, F.minZ + F.t + 0.04)
    root.add(map1)
    // cusine: plan di açâl, fornei, pignatis
    B.add("ferro", boxAt([3, 0.95, F.minZ + 0.4], [12.2, 1.0, -80.9]), C("#b8bcc0"))
    B.add("ferro", boxAt([6, 0.95, -77.4], [9.5, 1.0, -76.2]), C("#b8bcc0"))
    for (const [x, r] of [[4.2, 0.18], [5.2, 0.22], [10.5, 0.16]] as const) {
      B.add("ferro", cylBetween([x, 1.0, -81.2], [x, 1.0 + r * 1.4, -81.2], r, r, 12), C("#9a9ea4"))
    }
    // bagns: cessos e lavandins
    for (const x of [3.6, 5.6, 7.6, 9.6, 11.6]) B.add("marmo", boxAt([x - 0.2, 0, -72.9], [x + 0.2, 0.42, -72.3]), C("#f4f4f0"))
    for (const x of [4, 6, 8]) B.add("marmo", boxAt([x - 0.3, 0.8, F.maxZ - 0.75], [x + 0.3, 0.9, F.maxZ - 0.4]), C("#f4f4f0"))
    for (const x of [7.4, 11.4]) B.add("marmo", boxAt([x - 0.2, F.f1, F.maxZ - 1.4], [x + 0.2, F.f1 + 0.42, F.maxZ - 0.8]), C("#f4f4f0"))
    // cameradis: jets a cjast (il jet disot al è tai dâts; culì materas, cussins, il jet disore)
    for (const [x0, x1] of [[-19.6, -6], [-5.6, 6]] as const) {
      for (let x = x0 + 0.4; x + 0.9 <= x1 - 0.3; x += 1.9) {
        const doorX = x0 < -6 ? [-14, -12.5] : [-1, 0.5]
        const rows: [number, number][] = [[F.maxZ - F.t - 2, F.maxZ - F.t]]
        if (x + 0.9 < doorX[0] - 0.6 || x > doorX[1] + 0.6) rows.push([-77.6, -75.6])
        for (const [z0, z1] of rows) {
          const blanket = C(["#4a6a9a", "#9a4a3a", "#5a7a4a", "#8a7a3a"][Math.floor(R() * 4)])
          B.add("stoffa", boxAt([x + 0.04, F.f1 + 0.6, z0 + 0.05], [x + 0.86, F.f1 + 0.72, z1 - 0.05]), blanket)
          B.add("stoffa", boxAt([x + 0.1, F.f1 + 0.72, z1 - 0.45], [x + 0.8, F.f1 + 0.8, z1 - 0.1]), C("#f0ece4"))
          B.add("stoffa", boxAt([x + 0.04, F.f1 + 1.55, z0 + 0.05], [x + 0.86, F.f1 + 1.67, z1 - 0.05]), blanket)
          B.add("legno", boxAt([x, F.f1 + 1.45, z0], [x + 0.9, F.f1 + 1.55, z1]), C("#8a6040"))
          for (const px of [x, x + 0.84]) for (const pz of [z0, z1 - 0.06]) B.add("legno", boxAt([px, F.f1, pz], [px + 0.06, F.f1 + 1.9, pz + 0.06]), C("#7a5030"))
        }
      }
    }
    // scjalis: scjalins sui plans inclinâts e il corimano
    for (const st of [STAIRS.first, STAIRS.second]) {
      const up = st === STAIRS.second
      for (let k = 0; k < 20; k++) {
        const z = STAIRS.z0 + (k + 0.5) * ((STAIRS.z1 - STAIRS.z0) / 20)
        const y = up ? F.f1 + (F.roof - F.f1) * ((z - STAIRS.z0) / (STAIRS.z1 - STAIRS.z0)) : F.f1 - F.f1 * ((z - STAIRS.z0) / (STAIRS.z1 - STAIRS.z0))
        B.add("legno", boxAt([st.x0, y, z - 0.04], [st.x1, y + 0.03, z + 0.04]), C("#5a3a20"))
      }
    }
    // lûs di dentri
    for (const [x, y, z] of [[-9, 3.3, -73], [7, 3.3, -77], [7, 3.3, -68], [-12, 7.2, -71], [0, 7.2, -71], [9.5, 7.2, -71], [16, 7.2, -79], [16, 3.3, -79]] as const) {
      const l = new THREE.PointLight("#ffe0b0", 9, 10, 1.4)
      l.position.set(x, y, z)
      root.add(l)
      quality.lights.push(l)
      B.add("luce", sphere([x, y + 0.15, z], 0.14, 0.6, 8), new THREE.Color(2.4, 2.1, 1.6))
    }

    // --- tiere a nord: bancjis e la tabele ----------------------------------------------------
    for (const [x, z] of [[-8, -58], [8, -58]] as const) {
      B.add("legno", boxAt([x - 1, LAND + 0.42, z - 0.25], [x + 1, LAND + 0.48, z + 0.25]), C("#8a6040"))
      for (const dx of [-0.8, 0.8]) B.add("ferro", boxAt([x + dx - 0.05, LAND, z - 0.2], [x + dx + 0.05, LAND + 0.42, z + 0.2]), C("#3a3a3a"))
    }
    const tab = sign(["Riserve naturâl", "Focis dal Stele"], 2.4, 1.2, "#5a3a24", "#f0e0b0")
    tab.position.set(-4.5, 1.6, -47.9)
    root.add(tab)
    B.add("legno", cylBetween([-5.5, LAND, -48], [-5.5, LAND + 2.3, -48], 0.06), C("#5a3a24"))
    B.add("legno", cylBetween([-3.5, LAND, -48], [-3.5, LAND + 2.3, -48], 0.06), C("#5a3a24"))

    // --- il casot di osservazion -----------------------------------------------------------
    const K = CASOT
    // il tet: pae parsore lis breis, e la insegne su la puarte
    B.add("fen", boxAt([K.minX - 0.5, K.top + 0.3, K.minZ - 0.5], [K.maxX + 0.5, K.top + 0.55, K.maxZ + 0.5]), C("#a89060"))
    const casotSign = sign(["Casot di osservazion", "No sta disturbâ i fenicotars"], 2.6, 0.8, "#e8dcc0", "#3a2a1a")
    casotSign.position.set(K.minX - 0.02, 2.7, 27)
    casotSign.rotation.y = -Math.PI / 2
    root.add(casotSign)
    // paviment di breis e il scjalin
    B.add("legno", boxAt([K.minX + K.t, LAND, K.minZ + K.t], [K.maxX - K.t, LAND + 0.04, K.maxZ - K.t]), C("#a07a50"))
    B.add("legno", boxAt([SCJALIN.minX - 0.04, SCJALIN.top - 0.04, SCJALIN.minZ], [SCJALIN.minX + 0.06, SCJALIN.top + 0.01, SCJALIN.maxZ]), C("#6a4a2a"))

    // la pignate de bire, cul mescul e la sbrume
    {
      const cx = (PIGNATE.minX + PIGNATE.maxX) / 2
      const cz = (PIGNATE.minZ + PIGNATE.maxZ) / 2
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, PIGNATE.top - LAND, 20, 1, true), new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }))
      pot.position.set(cx, (PIGNATE.top + LAND) / 2, cz)
      pot.castShadow = true
      root.add(pot)
      B.add("ferro", new THREE.TorusGeometry(0.5, 0.025, 6, 24).rotateX(Math.PI / 2).translate(cx, PIGNATE.top, cz), C("#7a8086"))
      for (const sx of [-1, 1]) B.add("ferro", new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI).translate(cx + sx * 0.52, PIGNATE.top - 0.08, cz).rotateY(0), C("#5a5e62"))
      const beer = new THREE.Mesh(new THREE.CircleGeometry(0.47, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d89a2a", roughness: 0.15, emissive: "#3a2000" }))
      beer.position.set(cx, PIGNATE.top - 0.1, cz)
      root.add(beer)
      for (let i = 0; i < 9; i++) {
        const a = R() * Math.PI * 2
        const r = R() * 0.35
        B.add("stoffa", sphere([cx + Math.cos(a) * r, PIGNATE.top - 0.08, cz + Math.sin(a) * r], 0.08 + R() * 0.06, 0.35, 8), C("#fff8e8"))
      }
      B.add("legno", cylBetween([cx + 0.1, PIGNATE.top - 0.3, cz], [cx + 0.45, PIGNATE.top + 0.5, cz - 0.2], 0.025), C("#b08a5a"))
      // tacis sparniçadis
      for (const [x, z, tip] of [[48.9, 28.4, 0], [47.1, 30.4, 1], [49.3, 30.6, 0]] as const) {
        const g = new THREE.CylinderGeometry(0.05, 0.04, 0.14, 10)
        if (tip) g.rotateZ(Math.PI / 2)
        g.translate(x, LAND + (tip ? 0.05 : 0.07), z)
        B.add("vetro", g, C("#e8c860"))
      }
    }

    // il cjoc, cul cjâf sul scjalin
    const drunk = sleeper()
    drunk.g.position.set(SCJALIN.minX - 1.85, LAND + 0.04, 24.4)
    root.add(drunk.g)

    // il paviment de discoteche: piastrelis che a cambin colôr a timp
    const tiles: THREE.MeshBasicMaterial[] = []
    const floor = { x0: 41.5, z0: 24.5, n: 4, m: 4, s: 1.25 }
    for (let i = 0; i < floor.n; i++) {
      for (let j = 0; j < floor.m; j++) {
        const mat = new THREE.MeshBasicMaterial({ color: "#222", toneMapped: false })
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(floor.s - 0.06, floor.s - 0.06).rotateX(-Math.PI / 2), mat)
        tile.position.set(floor.x0 + (i + 0.5) * floor.s, LAND + 0.08, floor.z0 + (j + 0.5) * floor.s)
        root.add(tile)
        tiles.push(mat)
      }
    }
    const PALETTE = ["#ff2a8a", "#2ae8ff", "#ffe02a", "#8a2aff", "#2aff6a", "#ff7a2a"].map((c) => new THREE.Color(c))

    // la bale di spieli, cu la cjadene
    const [bx, by, bz] = DISCO
    B.add("ferro", cylBetween([bx, by + 0.35, bz], [bx, K.top, bz], 0.01), C("#c0c0c0"))
    const ballMat = new THREE.MeshStandardMaterial({ color: "#e8e8f0", metalness: 1, roughness: 0.12, flatShading: true, envMap: (kit.MATS.ferro as THREE.MeshStandardMaterial).envMap ?? null, emissive: "#202030" })
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 2), ballMat)
    ball.position.set(bx, by, bz)
    root.add(ball)
    // i spots di lûs su mûrs e sofit: ognidun al cor lunc il so cercli
    const spotMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const inner = { x0: K.minX + K.t + 0.02, x1: K.maxX - K.t - 0.02, y0: LAND + 0.1, y1: K.top - 0.02, z0: K.minZ + K.t + 0.02, z1: K.maxZ - K.t - 0.02 }
    const spots = Array.from({ length: 46 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.06 + R() * 0.05, 8), spotMat.clone())
      ;(m.material as THREE.MeshBasicMaterial).color.copy(PALETTE[i % PALETTE.length]).lerp(new THREE.Color("#fff"), 0.5)
      root.add(m)
      return { m, el: Math.asin(R() * 1.6 - 0.8), az: R() * Math.PI * 2 }
    })
    const ray = new THREE.Vector3()
    const discoLights = PALETTE.slice(0, 3).map((c, i) => {
      const l = new THREE.PointLight(c, 14, 9, 1.2)
      l.position.set(bx, 2.2, bz)
      root.add(l)
      quality.lights.push(l)
      return { l, i }
    })

    // i fenicotars che a balin
    const dancers = [[42.6, 25.6], [45.2, 25.2], [42.8, 28.6], [45.6, 28.8], [44, 30.6]].map(([x, z], i) => {
      const f = flamingo()
      f.g.position.set(x, LAND + 0.08, z)
      f.g.rotation.y = R() * Math.PI * 2
      root.add(f.g)
      return { ...f, i, base: f.g.rotation.y }
    })
    // e chei fûr, te aghe, che no balin
    const waders = [[-20, -30], [-24, -25], [-18, -22], [20, 4], [24, 8], [-50, 36], [-46, 40], [52, 52], [56, 54], [60, -30], [-30, 52]].map(([x, z], i) => {
      const f = flamingo()
      f.g.position.set(x, SEA, z)
      f.g.rotation.y = R() * Math.PI * 2
      f.legs[1].knee.rotation.x = i % 3 === 0 ? -2.2 : 0
      f.legs[1].hip.rotation.x = i % 3 === 0 ? 0.9 : 0
      root.add(f.g)
      return { ...f, i }
    })

    return {
      update(t) {
        const beat = (t * BPM) / 60
        const kick = Math.max(0, 1 - (beat % 1) * 3)
        const bar = Math.floor(beat)
        // paviment: ogni bot une gnove combinazion
        tiles.forEach((m, i) => {
          const on = (i * 7 + bar * 3) % 5 < 3
          m.color.copy(PALETTE[(i + bar) % PALETTE.length]).multiplyScalar(on ? 0.6 + kick * 0.8 : 0.08)
        })
        ball.rotation.y = t * 0.6
        for (const s of spots) {
          const az = s.az + t * 0.6
          ray.set(Math.cos(s.el) * Math.cos(az), Math.sin(s.el), Math.cos(s.el) * Math.sin(az))
          // il prin mûr che al tocje il rai de bale
          let k = Infinity
          for (const [d, lo, hi, o] of [[ray.x, inner.x0, inner.x1, bx], [ray.y, inner.y0, inner.y1, by], [ray.z, inner.z0, inner.z1, bz]] as const) {
            if (Math.abs(d) < 1e-5) continue
            k = Math.min(k, ((d > 0 ? hi : lo) - o) / d)
          }
          s.m.position.set(bx + ray.x * k, by + ray.y * k, bz + ray.z * k)
          s.m.lookAt(bx, by, bz)
        }
        for (const { l, i } of discoLights) {
          const a = t * (0.9 + i * 0.4) + (i * Math.PI * 2) / 3
          l.position.set(bx + Math.cos(a) * 2.5, 2.3, bz + Math.sin(a) * 2.5)
          l.intensity = 8 + kick * 18
        }
        for (const d of dancers) {
          const ph = beat * Math.PI + d.i
          d.g.position.y = LAND + 0.08 + Math.abs(Math.sin(ph)) * 0.08
          d.g.rotation.y = d.base + Math.sin(beat * 0.25 * Math.PI + d.i) * 0.9
          d.body.rotation.z = Math.sin(ph) * 0.12
          d.neck.rotation.z = Math.sin(ph + 0.6) * 0.35
          d.neck.rotation.x = Math.sin(ph * 0.5) * 0.2
          d.head.rotation.y = Math.sin(ph * 0.5 + 1) * 0.5
          const flap = 0.2 + Math.max(0, Math.sin(ph * 0.5)) * 0.9
          d.wings[0].rotation.z = flap
          d.wings[1].rotation.z = -flap
          // une gjambe sù e jù: a bots alternâts
          const lift = Math.max(0, Math.sin(ph * 0.5 + (d.i % 2) * Math.PI))
          d.legs[0].hip.rotation.x = 0.9 * lift
          d.legs[0].knee.rotation.x = -2 * lift
        }
        for (const w of waders) {
          w.neck.rotation.x = Math.sin(t * 0.3 + w.i) * 0.15
          w.head.rotation.y = Math.sin(t * 0.5 + w.i * 2) * 0.4
        }
        drunk.update(t)
      },
      setQuality(q) {
        for (const l of quality.lights) l.visible = q !== "bassa"
        fire.visible = q !== "bassa"
      }
    }
  },

  backdrop({ map }) {
    const { minX, maxX, minZ, maxZ } = map.bounds
    // Dut ator la lagune (sot de aghe), a nord la planure e lis Alps tal fonts.
    const height = (x: number, z: number) => {
      const dx = Math.max(minX - x, x - maxX, 0)
      const dz = Math.max(minZ - z, z - maxZ, 0)
      const out = Math.hypot(dx, dz)
      const barene = (fbm(x / 60, z / 60) - 0.55) * 3
      const lagoon = -1.2 + Math.max(-0.4, barene) * smooth(20, 80, out)
      const plain = smooth(-160, -260, z) * (1.4 + fbm(x / 200, z / 200) * 2)
      const alps = smooth(-700, -1250, z) * (380 + 520 * fbm(x / 300 + 4, z / 300))
      return Math.max(lagoon, plain - 0.2) + alps
    }
    const terrain = makeHeightfield(height, map.bounds, 707)
    // il mâr di fûr al à il bûs de mape: dentri e je za la aghe (dôs a 2 cm a tremavin)
    const ring = new THREE.Shape([new THREE.Vector2(-1300, -1300), new THREE.Vector2(1300, -1300), new THREE.Vector2(1300, 1300), new THREE.Vector2(-1300, 1300)])
    ring.holes.push(new THREE.Path([new THREE.Vector2(minX, -minZ), new THREE.Vector2(minX, -maxZ), new THREE.Vector2(maxX, -maxZ), new THREE.Vector2(maxX, -minZ)]))
    const sea = new THREE.Mesh(new THREE.ShapeGeometry(ring).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#4a8088", roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.9 }))
    sea.position.y = WATER
    sea.receiveShadow = true
    // Maran a nord-ovest: lis cjasis e la tor milenarie
    const town = new THREE.Group()
    const r = (() => {
      let a = 11
      return () => ((a = (a * 16807) % 2147483647) / 2147483647)
    })()
    const walls = new THREE.MeshLambertMaterial({ color: "#e8d4b0" })
    const roofs = new THREE.MeshLambertMaterial({ color: "#b05a3a" })
    for (let i = 0; i < 40; i++) {
      const w = 6 + r() * 8
      const h = 6 + r() * 7
      const x = -320 + i * 9 + r() * 4
      const z = -330 - r() * 40
      const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), walls)
      house.position.set(x, h / 2, z)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 3, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8), roofs)
      roof.position.set(x, h + 1.5, z)
      town.add(house, roof)
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 42, 8), new THREE.MeshLambertMaterial({ color: "#d8c4a0" }))
    tower.position.set(-180, 21, -350)
    const top = new THREE.Mesh(new THREE.ConeGeometry(6.5, 10, 4).rotateY(Math.PI / 4), roofs)
    top.position.set(-180, 47, -350)
    town.add(tower, top)
    return [terrain, sea, town]
  },

  menu: {
    path: [
      [-30, 22, -110],
      [40, 18, -70],
      [70, 14, 10],
      [40, 12, 60],
      [-20, 16, 100],
      [-70, 20, 30],
      [-70, 22, -50]
    ],
    look: [
      [0, 5, -72],
      [10, 4, -60],
      [44, 2, 27],
      [44, 2, 27],
      [0, 2, 70],
      [-30, 2, 0],
      [0, 6, -72]
    ]
  },
  light: { sun: [-0.4, 0.55, 0.7], fog: 0.0012 }
}

