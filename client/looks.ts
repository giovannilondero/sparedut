/**
 * Graphic looks over the same world. A look restyles the materials it finds in the scene
 * and owns the way a frame reaches the screen. `?look=ver` picks one (remembered in
 * localStorage); "cumo" is the game as it always was, drawn exactly as before.
 *
 *  - cumo: the original graphics
 *  - ver:  realistic: surfaces with relief, smooth models that reflect the sky, a harder
 *          sun, haze, a film grade and ambient occlusion
 *
 * "ver" is built to cost little more than "cumo": the world is still drawn once, straight
 * to the canvas. The grade lives in the tone mapping of every material (no extra pass),
 * and the occlusion is computed at half resolution and multiplied over the image.
 */
import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js"
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js"
import type { Quality } from "./contracts.ts"

export const LOOKS = {
  cumo: "Cumò",
  ver: "Vêr"
} as const
export type LookId = keyof typeof LOOKS
export const LOOK_IDS = Object.keys(LOOKS) as LookId[]

/** A scene drawn on top of the world with its own depth: the weapon in first person. */
export interface Overlay {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
}
export interface Look {
  readonly id: LookId
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay | null): void
  setQuality(q: Quality): void
}

const STORE = "sparedut.look"
const isLook = (s: string | null): s is LookId => !!s && s in LOOKS

/** `?look=` wins and is remembered; otherwise the last one chosen. */
export function lookFromUrl(): LookId {
  const q = new URLSearchParams(location.search).get("look")
  if (isLook(q)) {
    localStorage.setItem(STORE, q)
    return q
  }
  const saved = localStorage.getItem(STORE)
  return isLook(saved) ? saved : "cumo"
}

/** A small bar to switch look (reloads the page). Hidden while the mouse is captured. */
export function mountLookSwitcher(current: LookId) {
  const bar = document.createElement("div")
  bar.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:50;display:flex;gap:4px;padding:4px;border-radius:8px;background:rgba(12,10,8,.7);font:12px ui-sans-serif,system-ui,sans-serif"
  for (const id of LOOK_IDS) {
    const b = document.createElement("button")
    b.textContent = LOOKS[id]
    b.style.cssText = `cursor:pointer;padding:4px 9px;border-radius:5px;border:1px solid ${id === current ? "#e8b64c" : "transparent"};background:${id === current ? "#e8b64c" : "transparent"};color:${id === current ? "#1d1408" : "#f3e9d2"};font:inherit`
    b.addEventListener("click", () => {
      localStorage.setItem(STORE, id)
      const url = new URL(location.href)
      url.searchParams.set("look", id)
      location.assign(url)
    })
    bar.append(b)
  }
  document.body.append(bar)
  document.addEventListener("pointerlockchange", () => (bar.hidden = !!document.pointerLockElement))
}

// --- restyling ----------------------------------------------------------------------------

type Restyle = (m: THREE.Material) => THREE.Material | void

/** Runs `fn` once on every material under `root`; a returned material takes its place. */
function restyle(root: THREE.Object3D, seen: WeakSet<THREE.Material>, fn: Restyle) {
  root.traverse((o) => {
    const holder = o as THREE.Mesh
    const m = holder.material
    if (!m) return
    if (Array.isArray(m)) {
      for (let i = 0; i < m.length; i++) m[i] = once(m[i], seen, fn)
    } else holder.material = once(m, seen, fn)
  })
}
function once(m: THREE.Material, seen: WeakSet<THREE.Material>, fn: Restyle): THREE.Material {
  if (seen.has(m)) return m
  seen.add(m)
  const next = fn(m) ?? m
  seen.add(next)
  return next
}

/** A tangent-space normal map from the brightness of a canvas texture (darker = deeper). */
const reliefs = new WeakMap<THREE.Texture, THREE.Texture | null>()
function reliefOf(map: THREE.Texture, strength: number): THREE.Texture | null {
  const hit = reliefs.get(map)
  if (hit !== undefined) return hit
  const src = map.image as unknown
  let out: THREE.Texture | null = null
  if (src instanceof HTMLCanvasElement && src.width * src.height <= 2048 * 2048) {
    const { width: w, height: h } = src
    const data = src.getContext("2d")!.getImageData(0, 0, w, h).data
    const height = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) height[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const g = c.getContext("2d")!
    const img = g.createImageData(w, h)
    const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)]
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y) + (at(x + 2, y) - at(x - 2, y)) * 0.5) * strength
      const dy = (at(x, y + 1) - at(x, y - 1) + (at(x, y + 2) - at(x, y - 2)) * 0.5) * strength
      const l = 1 / Math.hypot(dx, dy, 1)
      const i = (y * w + x) * 4
      img.data[i] = (-dx * l * 0.5 + 0.5) * 255
      img.data[i + 1] = (dy * l * 0.5 + 0.5) * 255
      img.data[i + 2] = (l * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    out = new THREE.CanvasTexture(c)
    out.wrapS = map.wrapS
    out.wrapT = map.wrapT
    out.repeat.copy(map.repeat)
    out.anisotropy = map.anisotropy
  }
  reliefs.set(map, out)
  return out
}

/** How deep the relief of a world surface is (by the material's name: the map's `K`). */
const RELIEF: Record<string, number> = {
  pietra: 3,
  pietraChiara: 2,
  intonaco: 1.2,
  porfido: 3.5,
  legno: 2,
  cassa: 2,
  fen: 2.5,
  coppi: 3.5,
  erba: 2,
  terra: 3,
  roccia: 4,
  sacs: 3
}

/**
 * Relief on the textured surfaces, smooth facets on the models. The world keeps its
 * Lambert materials: a physical one pays for every light on every pixel, and a map with
 * lanterns (plus the flashes of a firefight) has many.
 */
const relieved: Restyle = (m) => {
  if (m instanceof THREE.MeshStandardMaterial && m.flatShading) {
    m.flatShading = false
    m.needsUpdate = true
  }
  if (!(m instanceof THREE.MeshLambertMaterial) || !m.map || m.alphaTest > 0) return
  const relief = reliefOf(m.map, RELIEF[m.name] ?? 2)
  if (!relief) return
  m.bumpMap = null
  m.normalMap = relief
  m.needsUpdate = true
}

/** 0 by day, 1 at night: read off the horizon colour the world paints as its background. */
const hsl = { h: 0, s: 0, l: 0 }
function nightOf(scene: THREE.Scene): number {
  if (!(scene.background instanceof THREE.Color)) return 0
  return 1 - THREE.MathUtils.smoothstep(scene.background.getHSL(hsl).l, 0.12, 0.35)
}

// --- realistic look -----------------------------------------------------------------------

/**
 * The film: ACES, then less colour, more contrast, cold shadows and warm lights. It runs
 * as the renderer's custom tone mapping, inside every material's own shader.
 */
const FILM = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 0.82 );
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.35 );
  c += vec3( -0.004, 0.008, 0.022 ) * ( 1.0 - smoothstep( 0.0, 0.45, l ) );
  c *= mix( vec3( 1.0 ), vec3( 1.05, 1.0, 0.92 ), smoothstep( 0.4, 1.0, l ) );
  return saturate( c );
}
`

/** Multiplies the occlusion and a vignette over what is already on the canvas. */
const SHADE_FRAGMENT = /* glsl */ `
uniform sampler2D tAo;
uniform float uAo;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float ao = mix( 1.0, texture2D( tAo, vUv ).r, uAo );
  gl_FragColor = vec4( vec3( ao * ( 1.0 - dot( d, d ) * 0.5 ) ), 1.0 );
}
`
const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`
/** The occlusion pass draws into its own targets: with its output off it never touches these. */
const NO_TARGET = null as unknown as THREE.WebGLRenderTarget
/** The occlusion is soft: half the canvas in each direction is enough, and four times cheaper. */
const AO_SCALE = 0.5

function createRealLook(renderer: THREE.WebGLRenderer): Look {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace("vec3 CustomToneMapping( vec3 color ) { return color; }", FILM)
  renderer.toneMapping = THREE.CustomToneMapping
  const exposure = renderer.toneMappingExposure

  const ao = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 4, 4)
  ao.output = GTAOPass.OUTPUT.Off
  ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 2, scale: 1, samples: 8, screenSpaceRadius: false })
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, rings: 2, samples: 8 })
  // Only solid surfaces occlude: smoke, glows, sprites and cut-outs would leave dark boxes.
  const hidden: THREE.Object3D[] = []
  const gbuffer = ao as unknown as { _overrideVisibility(): void; _restoreVisibility(): void }
  gbuffer._overrideVisibility = () => {
    ao.scene.traverse((o) => {
      if (!o.visible) return
      const m = (o as THREE.Mesh).material
      const one = Array.isArray(m) ? m[0] : m
      const solid = (o as THREE.Mesh).isMesh ? !!one && !one.transparent && one.depthWrite && one.alphaTest === 0 && !(one instanceof THREE.ShaderMaterial) : !one
      if (solid) return
      o.visible = false
      hidden.push(o)
    })
  }
  gbuffer._restoreVisibility = () => {
    for (const o of hidden) o.visible = true
    hidden.length = 0
  }
  const shade = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: SHADE_FRAGMENT,
    uniforms: { tAo: { value: ao.pdRenderTarget.texture }, uAo: { value: 1 } },
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor
  })
  const quad = new FullScreenQuad(shade)

  const seen = new WeakSet<THREE.Material>()
  const lit = new WeakSet<THREE.Object3D>()
  const hazed = new WeakSet<THREE.FogExp2>()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const fallback = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  const size = new THREE.Vector2()
  let aoW = 0, aoH = 0
  let occlusion = true

  /** Relief, the sky reflected on models and metals, a harder sun, more haze. */
  const prepare = (scene: THREE.Scene, overlay?: Overlay | null) => {
    // The sky reflects on models and metals (a plain room where there is no sky).
    let env = fallback
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m instanceof THREE.MeshStandardMaterial && m.envMap) env = m.envMap
    })
    const night = nightOf(scene)
    if (env !== fallback && night < 0.5) scene.traverse((o) => {
      if (lit.has(o)) return
      if (o instanceof THREE.DirectionalLight) o.intensity *= 1.35
      else if (o instanceof THREE.HemisphereLight) o.intensity *= 0.72
      else return
      lit.add(o)
    })
    if (scene.fog instanceof THREE.FogExp2 && !hazed.has(scene.fog)) {
      scene.fog.density *= 1.4
      hazed.add(scene.fog)
    }
    restyle(scene, seen, relieved)
    scene.environment = env
    scene.environmentIntensity = env === fallback ? 0.2 : 0.3
    if (overlay) {
      restyle(overlay.scene, seen, relieved)
      overlay.scene.environment = env
      overlay.scene.environmentIntensity = env === fallback ? 0.3 : 0.8
    }
    // the night is exposed longer, or the grade leaves it black
    renderer.toneMappingExposure = exposure * (1 + 0.9 * night)
  }

  return {
    id: "ver",
    setQuality(q) {
      // the one part that costs frames (a second, small drawing of the scene): high quality only
      occlusion = q === "alta"
    },
    render(scene, camera, overlay) {
      prepare(scene, overlay)
      renderer.autoClear = false
      renderer.clear()
      renderer.render(scene, camera)

      if (occlusion) {
        renderer.getDrawingBufferSize(size)
        const w = Math.ceil(size.x * AO_SCALE), h = Math.ceil(size.y * AO_SCALE)
        if (w !== aoW || h !== aoH) ao.setSize((aoW = w), (aoH = h))
        ao.scene = scene
        ao.camera = camera
        // the shadows are already drawn for this frame: the depth pass must not redo them
        const shadows = renderer.shadowMap.autoUpdate
        renderer.shadowMap.autoUpdate = false
        ao.render(renderer, NO_TARGET, NO_TARGET, 0, false)
        renderer.shadowMap.autoUpdate = shadows
        renderer.setRenderTarget(null)
      }
      // over an image already mapped for display the occlusion bites harder: it goes on at part strength
      shade.uniforms.uAo.value = occlusion ? 0.6 : 0
      quad.render(renderer)

      if (!overlay) return
      renderer.clearDepth()
      renderer.render(overlay.scene, overlay.camera)
    }
  }
}

export function createLook(id: LookId, renderer: THREE.WebGLRenderer): Look {
  if (id === "ver") return createRealLook(renderer)
  return {
    id,
    setQuality() {},
    render(scene, camera, overlay) {
      renderer.autoClear = false
      renderer.clear()
      renderer.render(scene, camera)
      if (!overlay) return
      renderer.clearDepth()
      renderer.render(overlay.scene, overlay.camera)
    }
  }
}
