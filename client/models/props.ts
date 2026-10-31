/**
 * Props shared between the viewmodel and effects: the boce of sgnape with its fuse
 * and the frico wheel. Geometries are cached: each call only creates the meshes.
 */
import * as THREE from "three"
import { canvasTexture, fricoTex, std } from "./kit.ts"

const labelTex = () =>
  canvasTexture("sgnape-label", 128, 64, (g, w, h) => {
    g.fillStyle = "#f3ead2"
    g.fillRect(0, 0, w, h)
    g.strokeStyle = "#7a1f1f"
    g.lineWidth = 3
    g.strokeRect(4, 4, w - 8, h - 8)
    g.fillStyle = "#7a1f1f"
    g.font = "bold 22px Georgia, serif"
    g.textAlign = "center"
    g.textBaseline = "middle"
    g.fillText("SGNAPE", w / 2, h / 2 - 6)
    g.font = "11px Georgia, serif"
    g.fillText("Glemone · 70°", w / 2, h / 2 + 16)
  })

let bottleGeo: { glass: THREE.BufferGeometry; liquid: THREE.BufferGeometry; label: THREE.BufferGeometry; cork: THREE.BufferGeometry; rag: THREE.BufferGeometry } | null = null

const bottleMats = () => ({
  glass: std("p-glass", { color: 0xcfeee6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }),
  liquid: std("p-liquid", { color: 0xbfe2ff, emissive: 0x10304a, roughness: 0.2 }),
  label: std("p-label", { map: labelTex(), roughness: 0.9 }),
  cork: std("p-cork", { color: 0xb08a5a, roughness: 1 }),
  rag: std("p-rag", { color: 0xe8dcc0, roughness: 1, emissive: 0x401000 })
})

/** A grappa bottle ~22 cm tall, base at y=0. */
export function sgnapeBottle(): THREE.Group {
  if (!bottleGeo) {
    const prof = [
      [0.001, 0],
      [0.034, 0],
      [0.037, 0.01],
      [0.037, 0.11],
      [0.028, 0.14],
      [0.012, 0.16],
      [0.012, 0.2],
      [0.014, 0.205]
    ].map(([r, y]) => new THREE.Vector2(r, y))
    bottleGeo = {
      glass: new THREE.LatheGeometry(prof, 12),
      liquid: new THREE.CylinderGeometry(0.031, 0.031, 0.1, 10).translate(0, 0.058, 0),
      label: new THREE.CylinderGeometry(0.038, 0.038, 0.055, 12, 1, true).translate(0, 0.065, 0),
      cork: new THREE.CylinderGeometry(0.011, 0.01, 0.022, 8).translate(0, 0.212, 0),
      rag: new THREE.BoxGeometry(0.012, 0.04, 0.006).translate(0, 0.24, 0)
    }
  }
  const m = bottleMats()
  const g = new THREE.Group()
  g.add(new THREE.Mesh(bottleGeo.liquid, m.liquid))
  g.add(new THREE.Mesh(bottleGeo.label, m.label))
  g.add(new THREE.Mesh(bottleGeo.cork, m.cork))
  g.add(new THREE.Mesh(bottleGeo.rag, m.rag))
  const glass = new THREE.Mesh(bottleGeo.glass, m.glass)
  glass.renderOrder = 1
  g.add(glass)
  return g
}

let fricoGeo: { disc: THREE.BufferGeometry; rim: THREE.BufferGeometry } | null = null

/** A frico wheel, ~32 cm across, faces towards ±y. */
export function fricoDisc(): THREE.Group {
  if (!fricoGeo) fricoGeo = { disc: new THREE.CylinderGeometry(0.16, 0.16, 0.035, 18), rim: new THREE.TorusGeometry(0.155, 0.018, 6, 18).rotateX(Math.PI / 2) }
  const mat = std("p-frico", { color: 0xf0b850, map: fricoTex(), roughness: 0.7, emissive: 0x5a2400 })
  const g = new THREE.Group()
  g.add(new THREE.Mesh(fricoGeo.disc, mat))
  g.add(new THREE.Mesh(fricoGeo.rim, mat))
  return g
}

let henGeo: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; beak: THREE.BufferGeometry; comb: THREE.BufferGeometry; wattle: THREE.BufferGeometry; tail: THREE.BufferGeometry; wing: THREE.BufferGeometry; eye: THREE.BufferGeometry; leg: THREE.BufferGeometry } | null = null

/**
 * The gjaline: a white hen ~40 cm long facing +z, with its feet at y≈-0.15.
 * The wings (`wings`, left and right) rotate around the z axis to flap.
 */
export function gjaline(): { g: THREE.Group; wings: THREE.Object3D[] } {
  if (!henGeo) {
    henGeo = {
      body: new THREE.SphereGeometry(1, 14, 10).scale(0.13, 0.12, 0.18),
      head: new THREE.SphereGeometry(0.065, 10, 8).translate(0, 0.15, 0.15),
      beak: new THREE.ConeGeometry(0.022, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0.14, 0.235),
      comb: new THREE.BoxGeometry(0.018, 0.05, 0.08).translate(0, 0.225, 0.15),
      wattle: new THREE.SphereGeometry(0.02, 6, 5).scale(1, 1.6, 1).translate(0, 0.095, 0.2),
      tail: new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(-0.9).translate(0, 0.08, -0.19),
      wing: new THREE.SphereGeometry(1, 10, 6).scale(0.16, 0.025, 0.11).translate(0.15, 0, 0),
      eye: new THREE.SphereGeometry(0.012, 6, 4),
      leg: new THREE.CylinderGeometry(0.01, 0.01, 0.1, 5).translate(0, -0.15, 0)
    }
  }
  const white = std("p-hen", { color: 0xfaf6ee, roughness: 0.95 })
  const red = std("p-hen-red", { color: 0xd8281e, roughness: 0.6 })
  const yellow = std("p-hen-beak", { color: 0xf0b030, roughness: 0.5 })
  const black = std("p-hen-eye", { color: 0x101010, roughness: 0.3 })
  const g = new THREE.Group()
  const G = henGeo
  g.add(new THREE.Mesh(G.body, white), new THREE.Mesh(G.head, white), new THREE.Mesh(G.tail, white))
  g.add(new THREE.Mesh(G.beak, yellow), new THREE.Mesh(G.comb, red), new THREE.Mesh(G.wattle, red))
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(G.eye, black)
    eye.position.set(sx * 0.052, 0.165, 0.185)
    const leg = new THREE.Mesh(G.leg, yellow)
    leg.position.set(sx * 0.05, 0, -0.02)
    g.add(eye, leg)
  }
  const wings = [-1, 1].map((sx) => {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.08, 0.04, 0)
    const w = new THREE.Mesh(G.wing, white)
    w.scale.x = sx
    pivot.add(w)
    g.add(pivot)
    return pivot
  })
  g.traverse((o) => (o.castShadow = true))
  return { g, wings }
}
