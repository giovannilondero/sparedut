/**
 * Le parti che si muovono: raccoglibili, frico-bandiera, cerchio della culine.
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

export function createDynamic(scene: THREE.Object3D, envMap: THREE.Texture | null, map: MapDef) {
  const { pickups: PICKUPS, hill: HILL } = map
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

  return {
    update(dt: number, t: number, frame: WorldFrame) {
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
