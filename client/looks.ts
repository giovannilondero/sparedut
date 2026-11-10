/**
 * PROTOTYPE: graphic looks over the same world, to compare art directions.
 * A look restyles the materials it finds in the scene and owns the way a frame reaches
 * the screen. `?look=fumet` picks one (remembered in localStorage); "cumo" is the game
 * as it is, drawn exactly as before.
 *
 *  - cumo:    the current graphics
 *  - fumet:   comic book: flat two-tone light, flattened textures, ink outlines, dots in the shade
 *  - strolic: almanac woodcut: paper, ink hatching that thickens with the shade, hand-tinted washes
 *  - ver:     realistic: PBR surfaces with relief, ambient occlusion, bloom, film grade
 */
import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js"
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"

export const LOOKS = {
  cumo: "Cumò",
  fumet: "Fumet",
  strolic: "Strolic",
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

const LIT = "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );"
const BANDED = "float dotNL = inkBand( dot( geometryNormal, directLight.direction ) );"
const BAND = "float inkBand( float x ) { return smoothstep( 0.0, 0.05, x ) * 0.78 + smoothstep( 0.55, 0.6, x ) * 0.22; }\n"
/**
 * A painted surface: its colour from a blurry mip level (no grain), and a drawn line
 * where the sharp texture is clearly darker than that (mortar joints, planks, tiles).
 */
const PAINTED = /* glsl */ `
  vec4 sampledDiffuseColor = texture2D( map, vMapUv, 3.5 );
  float inkJoint = dot( sampledDiffuseColor.rgb - texture2D( map, vMapUv, 0.4 ).rgb, vec3( 0.3333 ) ) / ( dot( sampledDiffuseColor.rgb, vec3( 0.3333 ) ) + 0.02 );
  sampledDiffuseColor.rgb *= 1.0 - 0.65 * smoothstep( 0.14, 0.3, inkJoint );
`
const LIGHT_CHUNKS = ["lights_lambert_pars_fragment", "lights_physical_pars_fragment", "lights_phong_pars_fragment"] as const

/** Comic light, in place: the sun either hits a face or it doesn't, and textures lose their grain. */
const inked: Restyle = (m) => {
  if (!(m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhongMaterial)) return
  m.bumpMap = null
  const flatten = m.alphaTest === 0
  m.onBeforeCompile = (shader) => {
    let f = BAND + shader.fragmentShader
    for (const chunk of LIGHT_CHUNKS) f = f.replace(`#include <${chunk}>`, THREE.ShaderChunk[chunk].replace(LIT, BANDED))
    if (flatten) f = f.replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace("vec4 sampledDiffuseColor = texture2D( map, vMapUv );", PAINTED))
    shader.fragmentShader = f
  }
  m.customProgramCacheKey = () => `inked-${flatten}`
  m.needsUpdate = true
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

/** How rough a world surface is, and how deep its relief (by the material's name: the map's `K`). */
const SURFACES: Record<string, { rough: number; relief: number; metal?: number }> = {
  pietra: { rough: 0.9, relief: 3 },
  pietraChiara: { rough: 0.82, relief: 2 },
  intonaco: { rough: 0.95, relief: 1.2 },
  porfido: { rough: 0.55, relief: 3.5 },
  legno: { rough: 0.75, relief: 2 },
  cassa: { rough: 0.75, relief: 2 },
  fen: { rough: 1, relief: 2.5 },
  coppi: { rough: 0.8, relief: 3.5 },
  erba: { rough: 1, relief: 2 },
  terra: { rough: 1, relief: 3 },
  roccia: { rough: 0.95, relief: 4 },
  sacs: { rough: 1, relief: 3 }
}

/** Physically based surfaces: textured Lambert becomes Standard with relief, flat facets are smoothed. */
const physical: Restyle = (m) => {
  if (m instanceof THREE.MeshStandardMaterial) {
    if (m.flatShading) {
      m.flatShading = false
      m.needsUpdate = true
    }
    return
  }
  if (!(m instanceof THREE.MeshLambertMaterial) || !m.map) return
  const s = SURFACES[m.name] ?? { rough: 0.88, relief: 2 }
  const pbr = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color,
    map: m.map,
    vertexColors: m.vertexColors,
    side: m.side,
    alphaTest: m.alphaTest,
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
    emissive: m.emissive,
    emissiveIntensity: m.emissiveIntensity,
    roughness: s.rough,
    metalness: s.metal ?? 0
  })
  if (m.alphaTest === 0) pbr.normalMap = reliefOf(m.map, s.relief)
  return pbr
}

/** 0 by day, 1 at night: read off the horizon colour the world paints as its background. */
const hsl = { h: 0, s: 0, l: 0 }
function nightOf(scene: THREE.Scene): number {
  if (!(scene.background instanceof THREE.Color)) return 0
  return 1 - THREE.MathUtils.smoothstep(scene.background.getHSL(hsl).l, 0.12, 0.35)
}

// --- ink looks: fumet, strolic ------------------------------------------------------------

const INK_FRAGMENT = /* glsl */ `
uniform sampler2D tWorld;
uniform sampler2D tWorldDepth;
uniform sampler2D tOver;
uniform sampler2D tOverDepth;
uniform vec2 uRes;
uniform vec2 uNearFar;
uniform vec2 uOverNearFar;
uniform float uHasOver;
uniform int uMode;
uniform float uNight;
varying vec2 vUv;

const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float tri( float x ) { return abs( fract( x ) - 0.5 ) * 2.0; }

// 1/z is linear across the screen on a flat surface: its second difference is zero on a
// plane, and jumps on a crease or a silhouette.
float invZ( sampler2D t, vec2 uv, vec2 nf ) {
  float ndc = texture2D( t, uv ).x * 2.0 - 1.0;
  return ( nf.y + nf.x - ndc * ( nf.y - nf.x ) ) / ( 2.0 * nf.x * nf.y );
}
/** x: silhouette, y: crease, z: distance in metres. */
vec3 edges( sampler2D t, vec2 uv, vec2 nf, float weight ) {
  float c = invZ( t, uv, nf );
  float r = weight * mix( 1.7, 0.9, smoothstep( 4.0, 50.0, 1.0 / c ) ) * uRes.y / 900.0;
  vec2 o = r / uRes;
  float l = invZ( t, uv - vec2( o.x, 0.0 ), nf ), rr = invZ( t, uv + vec2( o.x, 0.0 ), nf );
  float d = invZ( t, uv - vec2( 0.0, o.y ), nf ), u = invZ( t, uv + vec2( 0.0, o.y ), nf );
  float near = max( max( c, max( l, rr ) ), max( d, u ) );
  float lap = ( abs( l + rr - 2.0 * c ) + abs( d + u - 2.0 * c ) ) / near;
  return vec3( smoothstep( 0.03, 0.08, lap ), smoothstep( 0.004, 0.011, lap ), 1.0 / near );
}

void main() {
  vec3 col = texture2D( tWorld, vUv ).rgb;
  vec3 e = edges( tWorldDepth, vUv, uNearFar, 1.35 );
  float sky = step( 0.99999, texture2D( tWorldDepth, vUv ).x );
  // far away the lines thin out: a town in the distance is not a black scribble
  float ink = max( e.x, e.y * 0.75 ) * mix( 1.0, 0.3, smoothstep( 35.0, 220.0, e.z ) );
  if ( uHasOver > 0.5 ) {
    vec4 over = texture2D( tOver, vUv );
    vec3 eo = edges( tOverDepth, vUv, uOverNearFar, 1.5 );
    col = col * ( 1.0 - over.a ) + over.rgb;
    ink = max( ink * ( 1.0 - over.a ), max( eo.x, eo.y * 0.6 ) );
    sky *= 1.0 - over.a;
  }

  // to display range on the brightest channel alone: hue and saturation stay as painted
  // a woodcut has no dark paper: at night it is printed lighter, on blue stock
  if ( uMode == 1 ) col *= 1.0 + 7.0 * uNight;
  float v = max( max( col.r, col.g ), max( col.b, 1e-4 ) );
  col *= ( 1.0 - exp( -1.3 * v ) ) / v;
  v = max( max( col.r, col.g ), max( col.b, 1e-4 ) );
  float l = dot( col, LUMA );
  vec2 px = gl_FragCoord.xy * 720.0 / uRes.y;

  if ( uMode == 0 ) {
    // comic: a few flat values, violet shade with dots in the darkest part, black ink
    col = mix( vec3( l ), col, 1.18 );
    // the steps are even to the eye (square root), and the darkest one is not black
    float steps = sqrt( v ) * 5.0;
    float q = max( 0.3, ( floor( steps ) + smoothstep( 0.4, 0.6, fract( steps ) ) ) / 5.0 );
    col *= q * q / v;
    float shade = ( 1.0 - smoothstep( 0.03, 0.16, l ) ) * ( 1.0 - sky );
    col = mix( col, col * vec3( 0.9, 0.92, 1.35 ) + vec3( 0.004, 0.004, 0.02 ), shade );
    vec2 hp = mat2( 0.7071, -0.7071, 0.7071, 0.7071 ) * px / 6.0;
    float dots = step( length( fract( hp ) - 0.5 ), 0.38 * ( 1.0 - smoothstep( 0.01, 0.07, l ) ) );
    col *= 1.0 - 0.35 * dots * ( 1.0 - sky );
    col = mix( col, vec3( 0.006, 0.005, 0.008 ), ink );
  } else {
    // woodcut: paper, a wash of the hue, and all the shade carried by ink lines
    vec2 p = px + 2.5 * vec2( noise( px * 0.03 ), noise( px * 0.03 + 9.0 ) );
    vec3 hue = col / v;
    vec3 paper = mix( vec3( 0.93, 0.87, 0.74 ), vec3( 0.5, 0.62, 0.78 ), uNight ) * ( 0.95 + 0.05 * noise( px * 0.9 ) );
    vec3 wash = paper * mix( vec3( 1.0 ), hue, 0.72 ) * mix( 0.72, 1.0, smoothstep( 0.1, 0.55, v ) );
    // a saturated colour is its wash, not a dark tone: a red coat stays red
    float tone = 1.0 - smoothstep( 0.03, 0.5, mix( l, v, 0.6 ) );
    // the sky is cut in level strokes, everything else on the diagonal
    float h1 = mix( tri( ( p.x + p.y ) / 7.0 ), tri( p.y / 7.0 ), sky );
    float h2 = tri( ( p.x - p.y ) / 7.0 );
    float t1 = tone * 0.8, t2 = ( tone - 0.6 ) * 2.0;
    float lines = ( 1.0 - smoothstep( t1 - 0.14, t1 + 0.14, h1 ) ) * smoothstep( 0.1, 0.26, tone );
    lines = max( lines, ( 1.0 - smoothstep( t2 - 0.14, t2 + 0.14, h2 ) ) * step( 0.6, tone ) );
    lines = max( lines, smoothstep( 0.92, 0.98, tone ) );
    float black = max( lines, ink ) * ( 0.9 + 0.1 * noise( px * 0.6 + 3.0 ) );
    col = mix( wash, vec3( 0.03, 0.022, 0.018 ), black );
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`

function createInkLook(id: "fumet" | "strolic", renderer: THREE.WebGLRenderer): Look {
  const target = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) })
  const world = target()
  const over = target()
  const material = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: INK_FRAGMENT,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tWorld: { value: world.texture },
      tWorldDepth: { value: world.depthTexture },
      tOver: { value: over.texture },
      tOverDepth: { value: over.depthTexture },
      uRes: { value: new THREE.Vector2() },
      uNearFar: { value: new THREE.Vector2() },
      uOverNearFar: { value: new THREE.Vector2() },
      uHasOver: { value: 0 },
      uMode: { value: id === "fumet" ? 0 : 1 },
      uNight: { value: 0 }
    }
  })
  const quad = new FullScreenQuad(material)
  const seen = new WeakSet<THREE.Material>()
  const size = new THREE.Vector2()
  const clear = new THREE.Color()
  return {
    id,
    render(scene, camera, overlay) {
      renderer.getDrawingBufferSize(size)
      if (world.width !== size.x || world.height !== size.y) {
        world.setSize(size.x, size.y)
        over.setSize(size.x, size.y)
      }
      restyle(scene, seen, inked)
      if (overlay) restyle(overlay.scene, seen, inked)
      const u = material.uniforms
      u.uRes.value.copy(size)
      u.uNearFar.value.set(camera.near, camera.far)
      u.uHasOver.value = overlay ? 1 : 0
      u.uNight.value = nightOf(scene)

      const autoClear = renderer.autoClear
      renderer.autoClear = true
      renderer.setRenderTarget(world)
      renderer.render(scene, camera)
      if (overlay) {
        const alpha = renderer.getClearAlpha()
        renderer.getClearColor(clear)
        renderer.setClearColor(0x000000, 0)
        renderer.setRenderTarget(over)
        renderer.render(overlay.scene, overlay.camera)
        renderer.setClearColor(clear, alpha)
        u.uOverNearFar.value.set(overlay.camera.near, overlay.camera.far)
      }
      renderer.setRenderTarget(null)
      quad.render(renderer)
      renderer.autoClear = autoClear
    }
  }
}

// --- realistic look -----------------------------------------------------------------------

/** Draws the weapon over the finished world, with a depth buffer of its own. */
class OverlayPass extends Pass {
  overlay: Overlay | null = null
  constructor() {
    super()
    this.needsSwap = false
  }
  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!this.overlay) return
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(read)
    renderer.clearDepth()
    renderer.render(this.overlay.scene, this.overlay.camera)
    renderer.autoClear = autoClear
  }
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNight;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
    void main() {
      vec2 d = vUv - 0.5;
      // the lens: colours part slightly towards the corners
      float ca = dot( d, d ) * 0.006;
      vec3 c = vec3( texture2D( tDiffuse, vUv - d * ca ).r, texture2D( tDiffuse, vUv ).g, texture2D( tDiffuse, vUv + d * ca ).b );
      // the night is exposed longer and graded softer, or it is only black
      gl_FragColor = vec4( c * ( 1.0 + 1.2 * uNight ), 1.0 );
      #include <tonemapping_fragment>
      c = gl_FragColor.rgb;
      // the film: less colour, more contrast, cold shadows and warm lights
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, 0.8 );
      c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.45 - 0.35 * uNight );
      c += vec3( -0.004, 0.008, 0.022 ) * ( 1.0 - smoothstep( 0.0, 0.45, l ) );
      c *= mix( vec3( 1.0 ), vec3( 1.05, 1.0, 0.92 ), smoothstep( 0.4, 1.0, l ) );
      c *= 1.0 - dot( d, d ) * 0.6;
      c += ( hash( gl_FragCoord.xy + fract( uTime ) * 91.7 ) - 0.5 ) * 0.03 * smoothstep( 0.0, 0.25, l );
      gl_FragColor = vec4( c, 1.0 );
      #include <colorspace_fragment>
    }
  `
}

function createRealLook(renderer: THREE.WebGLRenderer): Look {
  const scene0 = new THREE.Scene()
  const camera0 = new THREE.PerspectiveCamera()
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }))
  const draw = new RenderPass(scene0, camera0)
  const ao = new GTAOPass(scene0, camera0, 4, 4)
  ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 2.5, scale: 1.35, samples: 12, screenSpaceRadius: false })
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 })
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
  const weapon = new OverlayPass()
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.22, 0.7, 0.92)
  const grade = new ShaderPass(GRADE)
  composer.addPass(draw)
  composer.addPass(ao)
  composer.addPass(weapon)
  composer.addPass(bloom)
  composer.addPass(grade)

  const seen = new WeakSet<THREE.Material>()
  const lit = new WeakSet<THREE.Object3D>()
  const size = new THREE.Vector2()
  const hazed = new WeakSet<THREE.FogExp2>()
  let w = 0, h = 0, ratio = 0
  const pmrem = new THREE.PMREMGenerator(renderer)
  const fallback = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return {
    id: "ver",
    render(scene, camera, overlay) {
      renderer.getSize(size)
      if (size.x !== w || size.y !== h || renderer.getPixelRatio() !== ratio) {
        w = size.x
        h = size.y
        ratio = renderer.getPixelRatio()
        composer.setPixelRatio(ratio)
        composer.setSize(w, h)
      }
      // The sky's reflection lights every surface (a plain room where there is no sky).
      let env = fallback
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (m instanceof THREE.MeshStandardMaterial && m.envMap) env = m.envMap
      })
      // In the open: a harder sun, a softer sky, and haze that swallows the far hills.
      if (env !== fallback && nightOf(scene) < 0.5) scene.traverse((o) => {
        if (lit.has(o)) return
        if (o instanceof THREE.DirectionalLight) o.intensity *= 1.45
        else if (o instanceof THREE.HemisphereLight) o.intensity *= 0.5
        else return
        lit.add(o)
      })
      if (scene.fog instanceof THREE.FogExp2 && !hazed.has(scene.fog)) {
        scene.fog.density *= 1.4
        hazed.add(scene.fog)
      }
      restyle(scene, seen, physical)
      scene.environment = env
      scene.environmentIntensity = env === fallback ? 0.2 : 0.55
      if (overlay) {
        restyle(overlay.scene, seen, physical)
        overlay.scene.environment = env
        overlay.scene.environmentIntensity = env === fallback ? 0.3 : 0.8
      }
      draw.scene = ao.scene = scene
      draw.camera = ao.camera = camera
      weapon.overlay = overlay ?? null
      grade.uniforms.uTime.value = performance.now() / 1000
      grade.uniforms.uNight.value = nightOf(scene)
      composer.render()
    }
  }
}

export function createLook(id: LookId, renderer: THREE.WebGLRenderer): Look {
  if (id === "fumet" || id === "strolic") return createInkLook(id, renderer)
  if (id === "ver") return createRealLook(renderer)
  return {
    id,
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
