/**
 * Le parti che si muovono: raccoglibili, frico-bandiera, cerchio della culine,
 * il cjar sul suo binario (Spingi il Cjar), il muro della tempesta (La Tampieste),
 * le torrette con la mitraie che girano e scaldano, le porte da sfondare.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { TEAMS, type MapDef, type PickupKind, type Team } from "../../shared/map.ts"
import type { WorldFrame } from "../contracts.ts"

export const TEAM_COLOR: Record<Team, THREE.Color> = {
  benandanti: new THREE.Color("#7fd16b"),
  malandanti: new THREE.Color("#d0435a")
}

/** Fonde primitive colorate per vertice in un'unica geometria. */
function bake(parts: [THREE.BufferGeometry, string][]): THREE.BufferGeometry {
  const c = new THREE.Color()
  const list = parts.map(([g0, hex]) => {
    const g = g0.index ? g0.toNonIndexed() : g0
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k)
    c.set(hex)
    const n = g.getAttribute("position").count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    g.setAttribute("color", new THREE.BufferAttribute(col, 3))
    return g
  })
  return mergeGeometries(list)!
}

function fricoDisc(r: number, h: number): [THREE.BufferGeometry, string][] {
  const disc = new THREE.CylinderGeometry(r, r * 0.96, h, 20)
  const crust = new THREE.TorusGeometry(r * 0.93, h * 0.55, 6, 20)
  crust.rotateX(Math.PI / 2)
  const out: [THREE.BufferGeometry, string][] = [[disc, "#e8b648"], [crust, "#b8742a"]]
  // bolle croccanti
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = r * (0.2 + (i % 3) * 0.22)
    const b = new THREE.SphereGeometry(r * 0.09, 6, 4)
    b.scale(1, 0.4, 1)
    b.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d)
    out.push([b, "#c98a30"])
  }
  return out
}

function pickupGeo(kind: PickupKind): THREE.BufferGeometry {
  switch (kind) {
    case "frico": {
      const g = bake(fricoDisc(0.36, 0.09))
      g.rotateX(Math.PI / 2.6)
      return g
    }
    case "gubane": {
      // spirale di pasta dorata su base a cupola
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 80; i++) {
        const a = (i / 80) * Math.PI * 5
        const r = 0.04 + (i / 80) * 0.26
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.16 - (i / 80) * 0.1, Math.sin(a) * r))
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.055, 6)
      const dome = new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      dome.scale(1, 0.45, 1)
      const sugar = new THREE.CylinderGeometry(0.33, 0.33, 0.03, 20)
      sugar.translate(0, -0.01, 0)
      return bake([[dome, "#b4692c"], [tube, "#d79a4c"], [sugar, "#7a3e1c"]])
    }
    case "sgnape": {
      const prof = [[0, 0], [0.13, 0], [0.14, 0.02], [0.14, 0.34], [0.12, 0.4], [0.05, 0.47], [0.045, 0.62], [0.05, 0.64], [0, 0.64]]
      const bottle = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14)
      const label = new THREE.CylinderGeometry(0.143, 0.143, 0.14, 14, 1, true)
      label.translate(0, 0.18, 0)
      const cork = new THREE.CylinderGeometry(0.04, 0.035, 0.07, 8)
      cork.translate(0, 0.67, 0)
      const g = bake([[bottle, "#cfe6d6"], [label, "#f2e3b8"], [cork, "#8a6238"]])
      g.translate(0, -0.3, 0)
      return g
    }
    case "munizions": {
      const crate = new THREE.BoxGeometry(0.62, 0.4, 0.44)
      const parts: [THREE.BufferGeometry, string][] = [[crate, "#9a6a3a"]]
      for (const y of [-0.12, 0.12]) {
        const slat = new THREE.BoxGeometry(0.64, 0.06, 0.46)
        slat.translate(0, y, 0)
        parts.push([slat, "#6b4524"])
      }
      for (let i = 0; i < 5; i++) {
        const b = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8)
        b.translate(-0.2 + i * 0.1, 0.28, 0)
        const tip = new THREE.ConeGeometry(0.035, 0.07, 8)
        tip.translate(-0.2 + i * 0.1, 0.395, 0)
        parts.push([b, "#c99a3a"], [tip, "#b06a3a"])
      }
      return bake(parts)
    }
    case "lanciafrico": {
      const tube = new THREE.CylinderGeometry(0.13, 0.15, 1.0, 14, 1, true)
      tube.rotateZ(Math.PI / 2.4)
      tube.translate(0, 0.15, 0)
      const ring1 = new THREE.TorusGeometry(0.15, 0.03, 6, 14)
      ring1.rotateY(Math.PI / 2)
      ring1.rotateZ(Math.PI / 2.4 - Math.PI / 2)
      ring1.translate(0.42, 0.33, 0)
      const parts: [THREE.BufferGeometry, string][] = [[tube, "#c4713c"], [ring1, "#8a4a22"]]
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const leg = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5)
        leg.rotateZ(0.35)
        leg.rotateY(a)
        leg.translate(Math.cos(a) * 0.1, -0.2, -Math.sin(a) * 0.1)
        parts.push([leg, "#4a3a2a"])
      }
      const disc = fricoDisc(0.12, 0.04).map(([g, c]) => {
        g.rotateZ(Math.PI / 2.4)
        g.translate(0.5, 0.36, 0)
        return [g, c] as [THREE.BufferGeometry, string]
      })
      return bake([...parts, ...disc])
    }
  }
}

const KIND_GLOW: Record<PickupKind, string> = {
  frico: "#ffc94a",
  gubane: "#ff9a4a",
  sgnape: "#9ef2c8",
  munizions: "#ffe08a",
  lanciafrico: "#ff7a3a"
}

/** Anello luminoso a terra, additivo. */
function glowMaterial(color: THREE.Color | string, opacity = 0.6): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
}

/** La mitraie su treppiede con lo scudo: `yaw` gira lo scudo e l'arma, `pitch` solo l'arma. */
function turretModel(envMap: THREE.Texture | null) {
  const steel = new THREE.MeshStandardMaterial({ color: "#4a4e52", metalness: 0.5, roughness: 0.45, envMap })
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2c2e", metalness: 0.4, roughness: 0.55, envMap })
  const olive = new THREE.MeshStandardMaterial({ color: "#5a6040", metalness: 0.3, roughness: 0.7 })
  const wood = new THREE.MeshLambertMaterial({ color: "#7a5030" })
  const brass = new THREE.MeshStandardMaterial({ color: "#c9a043", metalness: 0.6, roughness: 0.35 })
  const hot = new THREE.MeshStandardMaterial({ color: "#5a5e62", metalness: 0.5, roughness: 0.4, emissive: new THREE.Color(0, 0, 0), envMap })
  const root = new THREE.Group()
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.castShadow = true
    parent.add(o)
    return o
  }
  // treppiede: tre gambe dal perno a terra
  const PIV = 1.2
  for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) {
    const foot = new THREE.Vector3(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75)
    const top = new THREE.Vector3(0, PIV - 0.1, 0)
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.04, foot.distanceTo(top), 6), dark, root)
    leg.position.copy(foot).add(top).multiplyScalar(0.5)
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize())
  }
  mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 10), dark, root, 0, PIV - 0.1, 0)
  const yawG = new THREE.Group()
  yawG.position.y = PIV
  root.add(yawG)
  // lo scudo, curvo, con la feritoia per mirare
  const shield = new THREE.CylinderGeometry(1.6, 1.6, 0.66, 18, 1, true, -0.28, 0.56).rotateY(Math.PI).translate(0, 0, 1.6)
  const sh = mesh(shield, olive, yawG, 0, -0.12, -0.42)
  ;(sh.material as THREE.Material).side = THREE.DoubleSide
  mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), dark, yawG, 0, -0.1, -0.3)
  const pitchG = new THREE.Group()
  yawG.add(pitchG)
  // l'arma: camicia d'acqua (che arrossa col calore), castello, impugnature a vanga
  const jacket = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.75, 16).rotateX(Math.PI / 2), hot, pitchG, 0, 0.06, -0.55)
  mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.18, 10).rotateX(Math.PI / 2), dark, pitchG, 0, 0.06, -1.0)
  mesh(new THREE.BoxGeometry(0.16, 0.15, 0.4), steel, pitchG, 0, 0.05, -0.02)
  mesh(new THREE.BoxGeometry(0.12, 0.02, 0.2), steel, pitchG, 0, 0.13, 0.05)
  for (const gx of [-0.09, 0.09]) {
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), wood, pitchG, gx, 0.04, 0.3)
    mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), dark, pitchG, gx, 0.1, 0.24)
    mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), dark, pitchG, gx, -0.02, 0.24)
  }
  // cassetta delle munizioni e nastro
  mesh(new THREE.BoxGeometry(0.14, 0.18, 0.28), olive, pitchG, 0.2, -0.05, 0)
  for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6).rotateZ(Math.PI / 2), brass, pitchG, 0.11, 0.06 - i * 0.02, -0.02)
  // vapore quando è surriscaldata: sbuffi che salgono dalla camicia
  const steamMat = new THREE.MeshBasicMaterial({ color: "#e8eef0", transparent: true, opacity: 0.35, depthWrite: false })
  const steam = Array.from({ length: 5 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), steamMat)
    m.position.set(0, 0.12, -0.3 - i * 0.12)
    m.visible = false
    pitchG.add(m)
    return m
  })
  return { root, yawG, pitchG, hot, jacket, steam, gun: pitchG }
}

/** Una porta di assi (le dimensioni del suo blocco), con le traverse. */
function doorModel(min: readonly number[], max: readonly number[]) {
  const g = new THREE.Group()
  const w = max[0] - min[0]
  const h = max[1] - min[1]
  const d = max[2] - min[2]
  const alongZ = d > w
  const plank = new THREE.MeshLambertMaterial({ color: "#7a5434" })
  const batten = new THREE.MeshLambertMaterial({ color: "#4a3220" })
  const iron = new THREE.MeshLambertMaterial({ color: "#2a2622" })
  const span = alongZ ? d : w
  const n = Math.max(3, Math.round(span / 0.2))
  for (let i = 0; i < n; i++) {
    const a = -span / 2 + (span * (i + 0.5)) / n
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? w : span / n - 0.01, h - (i % 2) * 0.03, alongZ ? span / n - 0.01 : d), plank)
    m.position.set(alongZ ? 0 : a, -(i % 2) * 0.015, alongZ ? a : 0)
    m.castShadow = true
    g.add(m)
  }
  for (const y of [-h * 0.32, h * 0.32]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? w + 0.06 : span, 0.12, alongZ ? span : d + 0.06), batten)
    b.position.y = y
    g.add(b)
  }
  const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), iron)
  k.position.set(alongZ ? -w / 2 - 0.03 : span * 0.35, 0, alongZ ? span * 0.35 : -d / 2 - 0.03)
  g.add(k)
  g.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  return g
}

export function createDynamic(scene: THREE.Object3D, envMap: THREE.Texture | null, map: MapDef) {
  const { pickups: PICKUPS, hill: HILL, track: TRACK } = map
  // --- torrette e porte ---
  const turrets = map.turrets.map((spot) => {
    const t = turretModel(envMap)
    t.root.position.set(spot.at[0], spot.at[1], spot.at[2])
    scene.add(t.root)
    return { ...t, spot, yaw: spot.yaw, pitch: 0 }
  })
  const doors = map.doors.map((d) => {
    const g = doorModel(d.min, d.max)
    scene.add(g)
    return { g, rest: g.position.clone() }
  })
  const hotColor = new THREE.Color()
  // --- raccoglibili ---
  const pickMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1, envMap, emissive: "#3a2410", emissiveIntensity: 0.6 })
  const ghostMat = new THREE.MeshBasicMaterial({ color: "#fff4dc", transparent: true, opacity: 0.16, depthWrite: false })
  const geos = new Map<PickupKind, THREE.BufferGeometry>()
  const ringGeo = new THREE.RingGeometry(0.45, 0.62, 32)
  ringGeo.rotateX(-Math.PI / 2)
  const pickups = PICKUPS.map((p, i) => {
    const geo = geos.get(p.kind) ?? pickupGeo(p.kind)
    geos.set(p.kind, geo)
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geo, pickMat)
    mesh.castShadow = false
    mesh.position.set(p.at[0], p.at[1] + 1, p.at[2])
    const ring = new THREE.Mesh(ringGeo, glowMaterial(KIND_GLOW[p.kind], 0.55))
    ring.position.set(p.at[0], p.at[1] + 0.04, p.at[2])
    scene.add(mesh, ring)
    return { mesh, ring, phase: i * 1.7, y: p.at[1] + 1 }
  })

  // --- frico-bandiere ---
  const flags = TEAMS.map((team) => {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), new THREE.MeshLambertMaterial({ color: "#5a3c22" }))
    pole.position.y = 1.6
    const wheel = new THREE.Mesh(bake(fricoDisc(0.55, 0.18)), pickMat)
    wheel.rotation.x = Math.PI / 2
    wheel.position.y = 3.55
    const bannerGeo = new THREE.PlaneGeometry(1.3, 0.85, 12, 1)
    bannerGeo.translate(0.7, 0, 0)
    const banner = new THREE.Mesh(bannerGeo, new THREE.MeshLambertMaterial({ color: TEAM_COLOR[team], side: THREE.DoubleSide, emissive: TEAM_COLOR[team], emissiveIntensity: 0.25 }))
    banner.position.y = 2.55
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 12, 1, true), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: TEAM_COLOR[team] } },
      vertexShader: "varying float vY; void main() { vY = position.y / 30.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 uColor; varying float vY; void main() { gl_FragColor = vec4(uColor * pow(1.0 - vY, 3.0) * 0.32, 1.0); }",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }))
    beam.position.y = 15
    const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 40).rotateX(-Math.PI / 2), glowMaterial(TEAM_COLOR[team], 0.5))
    base.position.y = 0.03
    g.add(pole, wheel, banner, beam, base)
    g.visible = false
    scene.add(g)
    const rest = Float32Array.from(bannerGeo.getAttribute("position").array)
    return { team, g, wheel, banner, beam, base, rest }
  })

  // --- culine ---
  const hillMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uPulse;
      varying vec2 vP;
      void main() {
        float r = length(vP) / ${HILL.radius.toFixed(2)};
        float edge = smoothstep(0.86, 0.98, r) * (1.0 - smoothstep(0.98, 1.02, r));
        float a = atan(vP.y, vP.x);
        float dash = step(0.5, fract(a * 6.0 / 3.14159 + uTime * 0.25));
        float inner = smoothstep(0.8, 0.84, r) * (1.0 - smoothstep(0.84, 0.86, r)) * dash;
        float fill = 0.10 * smoothstep(0.2, 1.0, r);
        float p = 1.0 + uPulse * (0.6 * sin(uTime * 7.0));
        gl_FragColor = vec4(uColor * (edge * 1.3 + inner * 0.8 + fill) * p, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  })
  const hillDisc = new THREE.Mesh(new THREE.CircleGeometry(HILL.radius + 0.1, 72), hillMat)
  hillDisc.rotation.x = -Math.PI / 2
  hillDisc.position.set(HILL.at[0], HILL.at[1] + 0.05, HILL.at[2])
  const curtainMat = new THREE.ShaderMaterial({
    uniforms: { uColor: hillMat.uniforms.uColor, uTime: hillMat.uniforms.uTime, uPulse: hillMat.uniforms.uPulse },
    vertexShader: "varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; uniform float uTime, uPulse; varying float vY; void main() { float p = 1.0 + uPulse * 0.6 * sin(uTime * 7.0); gl_FragColor = vec4(uColor * pow(1.0 - vY, 2.0) * 0.35 * p, 1.0); }",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(HILL.radius, HILL.radius, 2.4, 72, 1, true), curtainMat)
  curtain.position.set(HILL.at[0], HILL.at[1] + 1.2, HILL.at[2])
  const hill = new THREE.Group()
  hill.add(hillDisc, curtain)
  hill.visible = false
  scene.add(hill)
  const neutral = new THREE.Color("#fff6e0")
  const amber = new THREE.Color("#ffb347")

  // --- il cjar e il suo percorso ---
  const cart = new THREE.Group()
  const wheels: THREE.Mesh[] = []
  {
    const wood = new THREE.MeshLambertMaterial({ color: "#8a5a34" })
    const dark = new THREE.MeshLambertMaterial({ color: "#5a3a22" })
    const iron = new THREE.MeshLambertMaterial({ color: "#2a2622" })
    const hay = new THREE.MeshLambertMaterial({ color: "#e0c060" })
    const L = 1.5, W = 0.85, bed = 0.62
    const boxes: [number, number, number, number, number, number, THREE.Material][] = [
      [L * 2, 0.12, W * 2, 0, bed, 0, wood],
      [L * 2, 0.45, 0.07, 0, bed + 0.3, -W, wood],
      [L * 2, 0.45, 0.07, 0, bed + 0.3, W, wood],
      [0.07, 0.6, W * 2, -L, bed + 0.36, 0, wood],
      [0.07, 0.6, W * 2, L, bed + 0.36, 0, wood],
      [0.1, 0.1, W * 2 + 0.5, -L * 0.6, 0.55, 0, dark],
      [0.1, 0.1, W * 2 + 0.5, L * 0.6, 0.55, 0, dark]
    ]
    for (const [w, h, d, x, y, z, m] of boxes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      cart.add(mesh)
    }
    // il timone, per tirare
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6).rotateZ(Math.PI / 2), dark)
    pole.position.set(L + 0.95, 0.45, 0)
    cart.add(pole)
    // ruote a raggi
    for (const x of [-L * 0.6, L * 0.6]) for (const z of [-W - 0.2, W + 0.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 18).rotateX(Math.PI / 2), wood)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 4, 20), iron)
      wheel.add(rim)
      for (let k = 0; k < 6; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), dark)
        spoke.rotation.z = (k / 6) * Math.PI
        spoke.position.z = Math.sign(z) * 0.04
        wheel.add(spoke)
      }
      wheel.position.set(x, 0.55, z)
      wheel.castShadow = true
      cart.add(wheel)
      wheels.push(wheel)
    }
    // il carico: fieno a mucchio
    const r = (i: number) => (Math.sin(i * 12.9898) * 43758.5453) % 1
    for (let i = 0; i < 7; i++) {
      const lump = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 7), hay)
      lump.scale.set(1 + Math.abs(r(i)) * 0.4, 0.55, 0.9)
      lump.position.set(-1 + i * 0.33, bed + 0.5 + Math.abs(r(i + 9)) * 0.2, (r(i + 3) - 0.5) * 0.4)
      lump.castShadow = true
      cart.add(lump)
    }
  }
  const pushRing = new THREE.Mesh(new THREE.RingGeometry(3.7, 4, 48).rotateX(-Math.PI / 2), glowMaterial("#7fd16b", 0.5))
  pushRing.position.y = 0.05
  cart.add(pushRing)
  cart.visible = false
  scene.add(cart)

  // il percorso: un nastro tratteggiato appena sopra il terreno
  const trail = (() => {
    const pos: number[] = []
    const uv: number[] = []
    let along = 0
    for (let i = 1; i < TRACK.length; i++) {
      const a = TRACK[i - 1]
      const b = TRACK[i]
      const dx = b[0] - a[0]
      const dz = b[2] - a[2]
      const len = Math.hypot(dx, b[1] - a[1], dz)
      const nx = (-dz / Math.max(1e-6, Math.hypot(dx, dz))) * 0.18
      const nz = (dx / Math.max(1e-6, Math.hypot(dx, dz))) * 0.18
      const y0 = a[1] + 0.06
      const y1 = b[1] + 0.06
      const quad = [
        [a[0] - nx, y0, a[2] - nz, along], [a[0] + nx, y0, a[2] + nz, along], [b[0] + nx, y1, b[2] + nz, along + len],
        [a[0] - nx, y0, a[2] - nz, along], [b[0] + nx, y1, b[2] + nz, along + len], [b[0] - nx, y1, b[2] - nz, along + len]
      ]
      for (const [x, y, z, u] of quad) {
        pos.push(x, y, z)
        uv.push(u, 0)
      }
      along += len
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: "varying float vU; void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uTime; varying float vU; void main() { float d = step(0.5, fract(vU * 0.5 - uTime * 0.6)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.6) * d * 0.5, 1.0); }",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
    const m = new THREE.Mesh(g, mat)
    m.visible = false
    scene.add(m)
    return { m, mat }
  })()
  let cartLast: { x: number; z: number } | null = null
  let wheelA = 0

  // --- la tempesta: un muro di grandine che si stringe ---
  const stormMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        // strisce di grandine che cadono, più fitte in basso
        vec2 q = vec2(vUv.x * 900.0, vUv.y * 40.0 + uTime * 9.0);
        float streak = step(0.93, h(floor(q))) * (1.0 - fract(q.y));
        float base = 0.28 + 0.2 * (1.0 - vUv.y);
        vec3 col = mix(vec3(0.35, 0.45, 0.6), vec3(0.85, 0.92, 1.0), streak);
        gl_FragColor = vec4(col, base + streak * 0.5);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  })
  const storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 96, 1, true), stormMat)
  storm.renderOrder = 2
  storm.visible = false
  scene.add(storm)

  return {
    update(dt: number, t: number, frame: WorldFrame) {
      turrets.forEach((tu, i) => {
        const v = frame.turrets[i]
        const yaw = v?.manned ? v.yaw : tu.spot.yaw
        const pitch = v?.manned ? v.pitch : -0.05
        // l'arma insegue lo sguardo di chi la usa, a riposo torna dritta
        let dy = yaw - tu.yaw
        dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI
        const k = Math.min(1, dt * (v?.manned ? 25 : 3))
        tu.yaw += dy * k
        tu.pitch += (pitch - tu.pitch) * k
        tu.yawG.rotation.y = tu.yaw
        tu.pitchG.rotation.x = tu.pitch
        tu.gun.visible = !v?.mine
        const heat = v?.heat ?? 0
        hotColor.setRGB(1.6 * heat * heat, 0.35 * heat * heat * heat, 0)
        if (v?.jammed) hotColor.multiplyScalar(0.8 + 0.4 * Math.sin(t * 9))
        tu.hot.emissive.copy(hotColor)
        tu.steam.forEach((m, j) => {
          m.visible = !!v?.jammed
          if (!m.visible) return
          const ph = (t * 0.8 + j * 0.2) % 1
          m.position.y = 0.12 + ph * 0.7
          m.scale.setScalar(0.6 + ph * 1.4)
        })
      })
      doors.forEach((d, i) => {
        const hp = frame.doors[i] ?? 1
        d.g.visible = hp > 0
        // più è presa, più le assi sono storte
        const hurt = 1 - hp
        d.g.rotation.set(hurt * 0.05, hurt * 0.12, hurt * 0.04)
        d.g.position.set(d.rest.x, d.rest.y - hurt * 0.04, d.rest.z)
      })
      const c = frame.cart
      cart.visible = trail.m.visible = !!c
      if (c) {
        cart.position.set(c.at[0], c.at[1], c.at[2])
        // il cjar guarda lungo il binario: la sua lunghezza è sull'asse x
        cart.rotation.y = c.yaw + Math.PI / 2
        if (cartLast) wheelA -= Math.hypot(c.at[0] - cartLast.x, c.at[2] - cartLast.z) / 0.55
        cartLast = { x: c.at[0], z: c.at[2] }
        for (const w of wheels) w.rotation.z = wheelA
        ;(pushRing.material as THREE.MeshBasicMaterial).color.copy(c.contested ? amber : c.pushers > 0 ? TEAM_COLOR.benandanti : neutral)
        trail.mat.uniforms.uTime.value = t
      } else cartLast = null
      const s = frame.storm
      storm.visible = !!s
      if (s) {
        storm.position.set(s.x, 20, s.z)
        storm.scale.set(s.radius, 1, s.radius)
        stormMat.uniforms.uTime.value = t
      }
      pickups.forEach((p, i) => {
        const on = frame.pickups[i] ?? true
        p.mesh.material = on ? pickMat : ghostMat
        p.mesh.position.y = p.y + Math.sin(t * 2 + p.phase) * 0.12
        p.mesh.rotation.y = t * 1.3 + p.phase
        p.ring.visible = on
        const s = 1 + Math.sin(t * 3 + p.phase) * 0.08
        p.ring.scale.set(s, 1, s)
      })

      for (const f of flags) {
        const v = frame.flags?.[f.team]
        f.g.visible = !!v
        if (!v) continue
        f.g.position.set(v.pos[0], v.pos[1], v.pos[2])
        const carried = v.state === "carried"
        f.g.scale.setScalar(carried ? 0.45 : 1)
        f.g.rotation.z = v.state === "dropped" ? 0.22 : 0
        f.beam.visible = !carried
        f.base.visible = v.state === "base"
        f.wheel.rotation.z = t * 0.8
        // il drappo sventola
        const pos = f.banner.geometry.getAttribute("position") as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const x = f.rest[i * 3]
          pos.setZ(i, Math.sin(x * 3.2 - t * 6) * 0.12 * x)
        }
        pos.needsUpdate = true
        f.banner.geometry.computeVertexNormals()
      }

      hill.visible = !!frame.hill
      if (frame.hill) {
        const h = frame.hill
        const u = hillMat.uniforms
        u.uTime.value = t
        u.uPulse.value = h.contested ? 1 : 0
        const target = h.contested ? amber : h.owner ? TEAM_COLOR[h.owner] : neutral
        ;(u.uColor.value as THREE.Color).lerp(target, Math.min(1, dt * 6))
      }
    }
  }
}
