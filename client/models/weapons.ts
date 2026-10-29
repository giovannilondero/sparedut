/**
 * L'armeria in tre dimensioni. Ogni arma è costruita da primitive in metri, con
 * l'origine nell'impugnatura della mano destra e la canna verso -z. Il viewmodel usa
 * il gruppo con le parti mobili; gli avatar una copia cotta a colori per vertice.
 */
import * as THREE from "three"
import type { WeaponId } from "../../shared/weapons.ts"
import { Baker, burlapTex, copperTex, engravedTex, fricoTex, put, std, towerTex, woodTex } from "./kit.ts"

export interface WeaponModel {
  readonly root: THREE.Group
  /** Punto della volata (figlio diretto di root). */
  readonly muzzle: THREE.Object3D
  /** Parti mobili per ricarica e colpo; ognuna è un gruppo con il suo perno. */
  readonly parts: {
    readonly mag?: THREE.Object3D
    readonly slide?: THREE.Object3D
    readonly barrels?: THREE.Object3D
    readonly shells?: readonly THREE.Object3D[]
    readonly bolt?: THREE.Object3D
    readonly frico?: THREE.Object3D
    readonly pouch?: THREE.Object3D
  }
  /** Dove sta la mano sinistra (spazio arma), null per le armi a una mano. */
  readonly left: THREE.Vector3 | null
  /** Altezza della linea di mira sopra l'impugnatura. */
  readonly sightH: number
}

// materiali condivisi (in cache nel kit)
const M = {
  wood: () => std("w-wood", { color: 0x8a5a32, map: woodTex(), roughness: 0.7 }),
  darkWood: () => std("w-dwood", { color: 0x5a3519, map: woodTex(), roughness: 0.7 }),
  beech: () => std("w-beech", { color: 0xc9a26b, map: woodTex(), roughness: 0.8 }),
  engraved: () => std("w-engr", { color: 0x8b5530, map: engravedTex(), roughness: 0.6 }),
  steel: () => std("w-steel", { color: 0x5a606a, metalness: 0.35, roughness: 0.42 }),
  darkSteel: () => std("w-dsteel", { color: 0x3a3e45, metalness: 0.3, roughness: 0.5 }),
  silver: () => std("w-silver", { color: 0xa8a8a2, map: engravedTex(), metalness: 0.5, roughness: 0.35 }),
  brass: () => std("w-brass", { color: 0xc9a043, metalness: 0.5, roughness: 0.35 }),
  gold: () => std("w-gold", { color: 0xf0c75a, metalness: 0.6, roughness: 0.25, emissive: 0x3a2800 }),
  copper: () => std("w-copper", { color: 0xc8703f, map: copperTex(), metalness: 0.45, roughness: 0.38 }),
  copperPot: () => std("w-cpot", { color: 0xc8703f, map: copperTex(), metalness: 0.45, roughness: 0.38, side: THREE.DoubleSide }),
  darkCopper: () => std("w-dcopper", { color: 0x7a3c1e, metalness: 0.4, roughness: 0.4 }),
  leather: () => std("w-leather", { color: 0x6b4226, roughness: 0.9 }),
  burlap: () => std("w-burlap", { color: 0xa88f5f, map: burlapTex(), roughness: 1 }),
  polenta: () => std("w-polenta", { color: 0xf2c54a, roughness: 0.95, emissive: 0x2a1a00 }),
  frico: () => std("w-frico", { color: 0xf0b850, map: fricoTex(), roughness: 0.7, emissive: 0x3a1800 }),
  stone: () => std("w-stone", { color: 0xe6dccb, map: towerTex(), roughness: 0.9 }),
  plainStone: () => std("w-pstone", { color: 0xd8cfbf, roughness: 0.9 }),
  roof: () => std("w-roof", { color: 0xa8482f, roughness: 0.8 }),
  glass: () => std("w-glass", { color: 0x9fd0ff, emissive: 0x1a3a5a, metalness: 0.3, roughness: 0.08 }),
  black: () => std("w-black", { color: 0x0b0b0c, roughness: 1 }),
  shell: () => std("w-shell", { color: 0xb02a2a, roughness: 0.6 }),
  cinnamon: () => std("w-cinn", { color: 0x7a3f1d, roughness: 0.9 }),
  rope: () => std("w-rope", { color: 0xb59a6a, roughness: 1 })
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const C = (rt: number, rb: number, h: number, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s)
/** Cilindro coricato lungo z (raggio "alto" verso +z). */
const Z = (parent: THREE.Object3D, rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, s = 12) =>
  put(parent, C(rt, rb, h, s), mat, x, y, z, Math.PI / 2)
const T = (r: number, tube: number, arc = Math.PI * 2, seg = 16) => new THREE.TorusGeometry(r, tube, 6, seg, arc)

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  parent.add(g)
  return g
}

function marker(root: THREE.Object3D, x: number, y: number, z: number) {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  root.add(o)
  return o
}

/** Guardia del grilletto ad arco sotto la carcassa. */
function guard(root: THREE.Object3D, y: number, z: number, r = 0.018) {
  put(root, T(r, 0.003, Math.PI, 10), M.steel(), 0, y, z, 0, Math.PI / 2, Math.PI)
  put(root, B(0.004, 0.016, 0.004), M.steel(), 0, y + 0.004, z + 0.004, 0.3)
}

function pistolGrip(root: THREE.Object3D, mat: THREE.Material, rake: number) {
  const g = group(root, 0, 0, 0, -rake)
  put(g, B(0.03, 0.09, 0.04), mat, 0, -0.02, 0)
  return g
}

// --- le sei armi ----------------------------------------------------------------------
function mescul(): WeaponModel {
  const root = new THREE.Group()
  Z(root, 0.016, 0.014, 0.95, M.beech(), 0, 0, -0.32, 10)
  put(root, B(0.05, 0.016, 0.2), M.beech(), 0, 0, -0.74)
  Z(root, 0.019, 0.019, 0.14, M.leather(), 0, 0, 0, 10)
  put(root, T(0.022, 0.003, Math.PI * 2, 12), M.rope(), 0, 0, 0.19, 0, Math.PI / 2)
  for (const z of [-0.5, -0.54, -0.6]) put(root, T(0.0158, 0.0022, Math.PI * 2, 12), M.darkWood(), 0, 0, z)
  // polenta rimasta attaccata (la nonna non lo lava mai)
  const lumps: [number, number, number, number][] = [
    [0.014, 0.012, -0.72, 0.022],
    [-0.02, -0.01, -0.78, 0.018],
    [0.01, -0.012, -0.66, 0.016],
    [0.0, 0.014, -0.81, 0.013],
    [-0.012, 0.012, -0.69, 0.012],
    [0.018, -0.006, -0.6, 0.009]
  ]
  for (const [x, y, z, r] of lumps) put(root, new THREE.IcosahedronGeometry(r, 0), M.polenta(), x, y, z, x * 40, z * 20, y * 30).scale.set(1.2, 0.75, 1)
  const muzzle = marker(root, 0, 0, -0.84)
  return { root, muzzle, parts: {}, left: new THREE.Vector3(0, 0, -0.24), sightH: 0 }
}

function mandi(): WeaponModel {
  const root = new THREE.Group()
  const grip = group(root, 0, 0, 0, -0.28)
  put(grip, B(0.026, 0.1, 0.04), M.steel(), 0, -0.02, 0)
  put(grip, B(0.034, 0.088, 0.034), M.darkWood(), 0, -0.022, 0.002)
  put(grip, C(0.005, 0.005, 0.036, 8), M.brass(), 0, -0.02, 0.002, 0, 0, Math.PI / 2)
  put(grip, B(0.036, 0.008, 0.044), M.brass(), 0, -0.068, 0.002)
  const mag = group(grip, 0, -0.072, 0.002)
  put(mag, B(0.022, 0.085, 0.03), M.darkSteel(), 0, 0.044, 0)
  put(mag, B(0.03, 0.008, 0.038), M.brass(), 0, -0.004, 0)
  put(root, B(0.03, 0.03, 0.16), M.steel(), 0, 0.045, -0.055)
  const slide = group(root, 0, 0.075, -0.06)
  put(slide, B(0.028, 0.028, 0.19), M.steel(), 0, 0, 0)
  for (let i = 0; i < 4; i++) put(slide, B(0.03, 0.02, 0.003), M.darkSteel(), 0, 0, 0.065 + i * 0.008)
  put(slide, B(0.004, 0.008, 0.01), M.brass(), 0, 0.018, -0.088)
  put(slide, B(0.014, 0.006, 0.006), M.darkSteel(), 0, 0.016, 0.088)
  Z(root, 0.009, 0.009, 0.03, M.darkSteel(), 0, 0.075, -0.165)
  put(root, T(0.0125, 0.003, Math.PI * 2, 14), M.brass(), 0, 0.075, -0.152)
  guard(root, 0.022, -0.035)
  put(root, B(0.008, 0.02, 0.01), M.steel(), 0, 0.09, 0.04, -0.4)
  const muzzle = marker(root, 0, 0.075, -0.185)
  return { root, muzzle, parts: { mag, slide }, left: null, sightH: 0.097 }
}

function cramar(): WeaponModel {
  const root = new THREE.Group()
  pistolGrip(root, M.wood(), 0.25)
  put(root, B(0.045, 0.055, 0.26), M.steel(), 0, 0.06, -0.07)
  put(root, B(0.012, 0.012, 0.012), M.darkSteel(), 0, 0.093, 0.04)
  put(root, B(0.004, 0.014, 0.006), M.brass(), 0, 0.082, -0.42)
  put(root, B(0.04, 0.06, 0.24), M.wood(), 0, 0.04, 0.17, 0.12)
  put(root, B(0.042, 0.075, 0.012), M.darkSteel(), 0, 0.022, 0.29, 0.12)
  Z(root, 0.011, 0.011, 0.24, M.darkSteel(), 0, 0.06, -0.32)
  for (let i = 0; i < 8; i++) Z(root, 0.017, 0.017, 0.006, M.steel(), 0, 0.06, -0.22 - i * 0.018, 14)
  Z(root, 0.015, 0.015, 0.04, M.darkSteel(), 0, 0.06, -0.46)
  const fg = group(root, 0, 0.03, -0.28, -0.15)
  put(fg, B(0.028, 0.075, 0.035), M.wood(), 0, -0.035, 0)
  guard(root, 0.025, -0.03)
  // caricatore a tamburo
  const mag = group(root, 0, 0, -0.13)
  put(mag, C(0.068, 0.068, 0.042, 22), M.steel(), 0, -0.045, 0, 0, 0, Math.PI / 2)
  for (const s of [1, -1]) {
    put(mag, T(0.058, 0.004, Math.PI * 2, 22), M.brass(), s * 0.022, -0.045, 0, 0, Math.PI / 2)
    put(mag, C(0.014, 0.014, 0.006, 10), M.brass(), s * 0.023, -0.045, 0, 0, 0, Math.PI / 2)
  }
  put(mag, B(0.006, 0.02, 0.006), M.darkSteel(), 0.03, -0.045, 0)
  put(mag, B(0.03, 0.03, 0.04), M.steel(), 0, 0.02, 0)
  const bolt = group(root, 0, 0.092, -0.02)
  put(bolt, B(0.01, 0.012, 0.014), M.darkSteel(), 0, 0, 0)
  put(bolt, new THREE.SphereGeometry(0.008, 8, 6), M.steel(), 0, 0.01, 0)
  // il sacchetto delle spezie del cramâr, appeso alla maglietta della cinghia
  const pouch = group(root, 0, 0.032, -0.21)
  put(pouch, C(0.0015, 0.0015, 0.05, 4), M.rope(), 0, -0.025, 0)
  put(pouch, new THREE.SphereGeometry(0.028, 10, 8), M.burlap(), 0, -0.078, 0).scale.set(1, 1.2, 0.9)
  put(pouch, T(0.012, 0.003, Math.PI * 2, 10), M.rope(), 0, -0.05, 0, Math.PI / 2)
  put(pouch, C(0.004, 0.004, 0.05, 6), M.cinnamon(), 0.008, -0.045, 0.004, 0.2, 0, 0.35)
  put(pouch, C(0.004, 0.004, 0.044, 6), M.cinnamon(), -0.006, -0.046, -0.004, -0.2, 0, -0.25)
  const muzzle = marker(root, 0, 0.06, -0.485)
  return { root, muzzle, parts: { mag, bolt, pouch }, left: new THREE.Vector3(0, -0.012, -0.28), sightH: 0.096 }
}

function doplete(): WeaponModel {
  const root = new THREE.Group()
  put(root, B(0.032, 0.045, 0.12), M.engraved(), 0, 0, 0.05, 0.15)
  put(root, B(0.04, 0.1, 0.22), M.engraved(), 0, -0.03, 0.2, 0.18)
  put(root, B(0.042, 0.105, 0.012), M.darkWood(), 0, -0.052, 0.312, 0.18)
  // la crocetta d'ottone del plevan, sui due lati del calcio
  for (const s of [1, -1]) {
    put(root, B(0.002, 0.04, 0.008), M.gold(), s * 0.021, -0.025, 0.2, 0.18)
    put(root, B(0.002, 0.008, 0.028), M.gold(), s * 0.021, -0.014, 0.198, 0.18)
  }
  put(root, B(0.05, 0.045, 0.08), M.silver(), 0, 0.045, -0.04)
  for (const s of [1, -1]) put(root, B(0.006, 0.022, 0.012), M.steel(), s * 0.012, 0.075, -0.004, -0.5)
  guard(root, 0.018, -0.02, 0.02)
  put(root, B(0.004, 0.016, 0.004), M.steel(), 0, 0.026, -0.03, 0.3)
  const barrels = group(root, 0, 0.035, -0.08)
  const shells: THREE.Object3D[] = []
  for (const s of [1, -1]) {
    Z(barrels, 0.012, 0.012, 0.6, M.steel(), s * 0.0125, 0.012, -0.26, 14)
    Z(barrels, 0.009, 0.009, 0.002, M.black(), s * 0.0125, 0.012, -0.561, 10)
    const sh = group(barrels, s * 0.0125, 0.012, 0.0)
    Z(sh, 0.0095, 0.0095, 0.06, M.shell(), 0, 0, -0.025, 10)
    Z(sh, 0.0105, 0.0105, 0.012, M.brass(), 0, 0, 0.004, 10)
    sh.visible = false
    shells.push(sh)
  }
  put(barrels, B(0.008, 0.006, 0.6), M.darkSteel(), 0, 0.026, -0.26)
  put(barrels, new THREE.SphereGeometry(0.003, 6, 4), M.brass(), 0, 0.031, -0.555)
  put(barrels, B(0.04, 0.03, 0.2), M.engraved(), 0, -0.008, -0.15)
  const muzzle = marker(root, 0, 0.047, -0.645)
  return { root, muzzle, parts: { barrels, shells }, left: new THREE.Vector3(0, 0.005, -0.25), sightH: 0.066 }
}

function cjampanili(): WeaponModel {
  const root = new THREE.Group()
  pistolGrip(root, M.darkWood(), 0.3)
  put(root, B(0.04, 0.06, 0.3), M.darkWood(), 0, 0.035, 0.17, 0.06)
  put(root, B(0.035, 0.025, 0.14), M.darkWood(), 0, 0.075, 0.17)
  put(root, B(0.044, 0.085, 0.015), M.black(), 0, 0.024, 0.325, 0.06)
  Z(root, 0.018, 0.018, 0.22, M.steel(), 0, 0.06, -0.05, 16)
  const bolt = group(root, 0, 0.06, 0.03)
  Z(bolt, 0.012, 0.012, 0.06, M.darkSteel(), 0, 0, 0)
  put(bolt, C(0.004, 0.004, 0.05, 6), M.steel(), 0.028, -0.006, 0.02, 0, 0, Math.PI / 2 + 0.25)
  put(bolt, new THREE.SphereGeometry(0.009, 8, 6), M.darkSteel(), 0.052, -0.013, 0.02)
  Z(root, 0.009, 0.011, 0.72, M.darkSteel(), 0, 0.06, -0.52, 12)
  Z(root, 0.015, 0.015, 0.04, M.steel(), 0, 0.06, -0.9)
  for (const z of [-0.89, -0.905]) put(root, B(0.032, 0.004, 0.006), M.black(), 0, 0.06, z)
  put(root, B(0.042, 0.04, 0.36), M.darkWood(), 0, 0.035, -0.3)
  guard(root, 0.025, -0.03)
  // cannocchiale
  for (const z of [0.0, -0.16]) {
    put(root, B(0.012, 0.025, 0.012), M.darkSteel(), 0, 0.09, z)
    put(root, T(0.02, 0.004, Math.PI * 2, 14), M.darkSteel(), 0, 0.125, z)
  }
  Z(root, 0.018, 0.018, 0.26, M.darkSteel(), 0, 0.125, -0.08, 16)
  Z(root, 0.019, 0.028, 0.07, M.darkSteel(), 0, 0.125, -0.245, 16)
  Z(root, 0.024, 0.024, 0.002, M.glass(), 0, 0.125, -0.281, 16)
  Z(root, 0.022, 0.019, 0.05, M.darkSteel(), 0, 0.125, 0.07, 16)
  Z(root, 0.019, 0.019, 0.002, M.glass(), 0, 0.125, 0.096, 14)
  // il campanile in miniatura, rifatto pietra su pietra
  const tw = group(root, 0, 0.03, -0.08)
  tw.scale.setScalar(0.8)
  put(tw, B(0.032, 0.008, 0.032), M.plainStone(), 0, 0.146, 0)
  put(tw, B(0.026, 0.06, 0.026), M.stone(), 0, 0.18, 0)
  put(tw, B(0.032, 0.004, 0.032), M.plainStone(), 0, 0.211, 0)
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(tw, B(0.005, 0.018, 0.005), M.plainStone(), x * 0.011, 0.222, z * 0.011)
  put(tw, new THREE.ConeGeometry(0.007, 0.011, 10, 1, true), M.brass(), 0, 0.222, 0)
  put(tw, B(0.032, 0.004, 0.032), M.plainStone(), 0, 0.233, 0)
  put(tw, new THREE.ConeGeometry(0.024, 0.04, 4), M.roof(), 0, 0.255, 0, 0, Math.PI / 4)
  put(tw, new THREE.SphereGeometry(0.003, 6, 4), M.gold(), 0, 0.277, 0)
  put(tw, B(0.0018, 0.013, 0.0018), M.gold(), 0, 0.284, 0)
  put(tw, B(0.008, 0.0018, 0.0018), M.gold(), 0, 0.286, 0)
  const muzzle = marker(root, 0, 0.06, -0.925)
  return { root, muzzle, parts: { bolt }, left: new THREE.Vector3(0, 0.012, -0.3), sightH: 0.125 }
}

function lanciafrico(): WeaponModel {
  const root = new THREE.Group()
  const y = 0.1
  Z(root, 0.05, 0.05, 0.5, M.copper(), 0, y, -0.07, 20)
  Z(root, 0.052, 0.052, 0.01, M.darkCopper(), 0, y, 0.18, 20)
  for (const z of [0.15, -0.05, -0.25]) put(root, T(0.051, 0.005, Math.PI * 2, 20), M.darkCopper(), 0, y, z)
  for (let z = 0.13; z > -0.3; z -= 0.04) put(root, new THREE.SphereGeometry(0.004, 5, 4), M.darkCopper(), 0, y + 0.05, z)
  // il cjaldîr: la pentola di rame diventa la bocca del lanciatore
  const prof = [
    [0.05, 0],
    [0.075, 0.02],
    [0.094, 0.06],
    [0.098, 0.1],
    [0.088, 0.14],
    [0.092, 0.15]
  ].map(([r, h]) => new THREE.Vector2(r, h))
  put(root, new THREE.LatheGeometry(prof, 22), M.copperPot(), 0, y, -0.32, -Math.PI / 2)
  put(root, T(0.092, 0.007, Math.PI * 2, 24), M.darkCopper(), 0, y, -0.47)
  put(root, T(0.104, 0.004, Math.PI, 20), M.darkSteel(), 0, y, -0.4)
  for (const s of [1, -1]) put(root, B(0.012, 0.02, 0.02), M.darkCopper(), s * 0.098, y, -0.4)
  const frico = group(root, 0, y, -0.43)
  put(frico, C(0.075, 0.075, 0.022, 24), M.frico(), 0, 0, 0, Math.PI / 2)
  put(frico, T(0.072, 0.008, Math.PI * 2, 24), M.frico(), 0, 0, 0)
  pistolGrip(root, M.wood(), 0.2)
  put(root, B(0.02, 0.04, 0.05), M.darkSteel(), 0, 0.045, 0)
  guard(root, 0.02, -0.03)
  put(root, C(0.014, 0.014, 0.09, 10), M.wood(), 0, 0.01, -0.2)
  put(root, C(0.016, 0.016, 0.01, 10), M.brass(), 0, -0.035, -0.2)
  put(root, B(0.07, 0.08, 0.03), M.leather(), 0, y, 0.2)
  for (const s of [1, -1]) put(root, B(0.004, 0.03, 0.004), M.brass(), s * 0.012, y + 0.065, 0.08)
  put(root, B(0.004, 0.022, 0.004), M.brass(), 0, y + 0.062, -0.28)
  // il cucchiaio di legno legato di fianco, non si sa mai
  put(root, B(0.006, 0.004, 0.12), M.beech(), 0.056, y, -0.04)
  put(root, new THREE.SphereGeometry(0.015, 8, 6), M.beech(), 0.056, y, -0.11).scale.set(1, 0.4, 1.3)
  put(root, T(0.054, 0.0025, Math.PI * 2, 20), M.rope(), 0, y, -0.03)
  const muzzle = marker(root, 0, y, -0.48)
  return { root, muzzle, parts: { frico }, left: new THREE.Vector3(0, 0.0, -0.2), sightH: 0.165 }
}

const BUILDERS: Record<WeaponId, () => WeaponModel> = { mescul, mandi, cramar, doplete, cjampanili, lanciafrico }

export const buildWeapon = (id: WeaponId): WeaponModel => BUILDERS[id]()

export interface BakedWeapon {
  readonly geometry: THREE.BufferGeometry
  readonly muzzle: THREE.Vector3
  readonly left: THREE.Vector3 | null
}

const baked = new Map<WeaponId, BakedWeapon>()

/** Versione cotta in terza persona: una geometria sola, condivisa fra tutti gli avatar. */
export function bakedWeapon(id: WeaponId): BakedWeapon {
  let b = baked.get(id)
  if (!b) {
    const m = buildWeapon(id)
    b = { geometry: new Baker().addGroup(m.root).build(), muzzle: m.muzzle.position.clone(), left: m.left }
    m.root.traverse(o => o instanceof THREE.Mesh && o.geometry.dispose())
    baked.set(id, b)
  }
  return b
}
