/**
 * Graphic looks over the same world. A look restyles the materials it finds in the scene
 * and owns the way a frame reaches the screen. `?look=ver` picks one (remembered in
 * localStorage); "cumo" is the game as it always was, drawn exactly as before.
 *
 *  - cumo: the original graphics
 *  - ver:  realistic: photographed surfaces with relief, smooth models that reflect the
 *          sky, a harder sun, haze, a film grade and ambient occlusion
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

/**
 * Photographed surfaces that take the place of the drawn ones (CC0, from Poly Haven: see
 * `client/public/tex/README.md`), by the material's name. The number is how many times
 * the photograph repeats over one tile of the texture it replaces.
 */
const PHOTOS: Record<string, number> = {
  pietra: 1,
  pietraChiara: 1,
  intonaco: 1,
  porfido: 1,
  coppi: 1,
  legno: 1,
  erba: 1,
  terra: 1,
  roccia: 1
}

/** The average colour of an image, in linear light. */
function meanOf(image: CanvasImageSource): THREE.Color {
  const c = document.createElement("canvas")
  c.width = c.height = 16
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.drawImage(image, 0, 0, 16, 16)
  const d = g.getImageData(0, 0, 16, 16).data
  const sum = new THREE.Color(0, 0, 0)
  const px = new THREE.Color()
  for (let i = 0; i < d.length; i += 4) sum.add(px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace))
  return sum.multiplyScalar(4 / d.length)
}

interface Photo {
  readonly map: THREE.Texture
  readonly normal: THREE.Texture
  readonly mean: THREE.Color
}

/**
 * The relief around the map is coloured one triangle at a time: the facets are what makes
 * it read as low-poly. Averaging the colours that meet at each grid point leaves woods,
 * fields and rock shading into each other over the same smooth normals.
 */
function blendFacets(mesh: THREE.Mesh) {
  const pos = mesh.geometry.getAttribute("position")
  const col = mesh.geometry.getAttribute("color")
  if (!pos || !col || mesh.geometry.index) return
  const sums = new Map<string, [number, number, number, number]>()
  const key = (i: number) => `${Math.round(pos.getX(i))},${Math.round(pos.getZ(i))}`
  for (let i = 0; i < pos.count; i++) {
    const k = key(i)
    const s = sums.get(k) ?? [0, 0, 0, 0]
    s[0] += col.getX(i)
    s[1] += col.getY(i)
    s[2] += col.getZ(i)
    s[3]++
    sums.set(k, s)
  }
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!
    col.setXYZ(i, s[0] / s[3], s[1] / s[3], s[2] / s[3])
  }
  col.needsUpdate = true
}

/**
 * The mountains get their ground from two aerial photographs, laid out in world metres:
 * alpine meadow where the slope is gentle and green, limestone cliff where it is steep or
 * bare. The blended vertex colour stays as the tint (woods darker, fields paler), each
 * photograph is repeated at a second, much larger scale so that no tile shows from afar.
 */
const MOUNTAIN_VERTEX = /* glsl */ `
  #include <begin_vertex>
  vHfPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vHfNormal = normal;
`
const MOUNTAIN_FRAGMENT = /* glsl */ `
  #include <color_fragment>
  {
    vec3 hn = normalize( vHfNormal );
    vec3 tint = diffuseColor.rgb;
    float hi = max( tint.r, max( tint.g, tint.b ) ), lo = min( tint.r, min( tint.g, tint.b ) );
    float bare = 1.0 - smoothstep( 0.18, 0.4, ( hi - lo ) / max( hi, 1e-3 ) );
    float rocky = max( smoothstep( 0.3, 0.52, 1.0 - hn.y ), bare );
    // the cliff is projected along the three axes: on a wall a top-down photograph would smear
    vec3 w = pow( abs( hn ), vec3( 4.0 ) );
    w /= w.x + w.y + w.z;
    vec3 rock = texture2D( hfRock, vHfPos.zy / 85.0 ).rgb * w.x + texture2D( hfRock, vHfPos.xz / 85.0 ).rgb * w.y + texture2D( hfRock, vHfPos.xy / 85.0 ).rgb * w.z;
    // one large-scale sample breaks the tiling of both grounds
    float macro = texture2D( hfMeadow, vHfPos.xz / 530.0 ).g / hfMeadowMean.g;
    rock *= 0.5 + 0.5 * macro;
    // strata and cracks read from far away only with more contrast than the photograph has
    rock = hfRockMean * pow( rock / hfRockMean, vec3( 1.9 ) );
    vec3 meadow = texture2D( hfMeadow, vHfPos.xz / 70.0 ).rgb;
    meadow *= 0.5 + 0.5 * macro;
    // bare rock is limestone grey whatever the zone was painted: half its own colour
    vec3 stone = mix( tint, vec3( dot( tint, vec3( 0.3333 ) ) ) * vec3( 1.02, 1.0, 0.96 ), 0.55 ) * rock / hfRockMean;
    diffuseColor.rgb = mix( tint * meadow / hfMeadowMean, stone, rocky );
  }
`
/** Distance cools a mountain: its haze leans to the blue of the air instead of the warm horizon. */
const MOUNTAIN_FOG = /* glsl */ `
  #ifdef USE_FOG
    float hfFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * 0.45 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * vec3( 0.84, 0.95, 1.14 ), hfFog );
  #endif
`
function mountain(m: THREE.MeshLambertMaterial, meadow: Photo, rock: Photo) {
  // seen from below and from far: more filtering only costs
  meadow.map.anisotropy = rock.map.anisotropy = 2
  m.onBeforeCompile = (shader) => {
    shader.uniforms.hfMeadow = { value: meadow.map }
    shader.uniforms.hfRock = { value: rock.map }
    shader.uniforms.hfMeadowMean = { value: meadow.mean }
    shader.uniforms.hfRockMean = { value: rock.mean }
    shader.vertexShader = "varying vec3 vHfPos;\nvarying vec3 vHfNormal;\n" + shader.vertexShader.replace("#include <begin_vertex>", MOUNTAIN_VERTEX)
    shader.fragmentShader = "uniform sampler2D hfMeadow;\nuniform sampler2D hfRock;\nuniform vec3 hfMeadowMean;\nuniform vec3 hfRockMean;\nvarying vec3 vHfPos;\nvarying vec3 vHfNormal;\n" + shader.fragmentShader.replace("#include <color_fragment>", MOUNTAIN_FRAGMENT).replace("#include <fog_fragment>", MOUNTAIN_FOG)
  }
  m.customProgramCacheKey = () => "mountain"
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
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.25 );
  // the cold goes in the half-shadows only: black stays black, and dark grass stays green
  c += vec3( -0.002, 0.004, 0.011 ) * smoothstep( 0.0, 0.1, l ) * ( 1.0 - smoothstep( 0.12, 0.45, l ) );
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

  // Photographs load once per page and are shared by every map's materials.
  const loader = new THREE.TextureLoader()
  const photos = new Map<string, Promise<Photo>>()
  const photoOf = (name: string): Promise<Photo> => {
    let p = photos.get(name)
    if (!p) {
      const load = async (file: string, srgb: boolean) => {
        const t = await loader.loadAsync(`/tex/${file}.webp`)
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.setScalar(PHOTOS[name] ?? 1)
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        if (srgb) t.colorSpace = THREE.SRGBColorSpace
        return t
      }
      p = Promise.all([load(`${name}_d`, true), load(`${name}_n`, false)]).then(([map, normal]) => ({ map, normal, mean: meanOf(map.image as CanvasImageSource) }))
      photos.set(name, p)
    }
    return p
  }
  /**
   * Relief first, from the drawn texture; then, where there is one, the photograph. Its
   * colour is brought to the average of the texture it replaces: the palette of every
   * wall, roof and street stays the one the maps were painted with.
   */
  const surfaced: Restyle = (m) => {
    relieved(m)
    if (!(m instanceof THREE.MeshLambertMaterial) || !m.map || !(m.name in PHOTOS)) return
    const drawn = meanOf(m.map.image as CanvasImageSource)
    void photoOf(m.name).then((photo) => {
      const k = (a: number, b: number) => THREE.MathUtils.clamp(a / Math.max(b, 1e-3), 0.3, 3)
      m.color.setRGB(m.color.r * k(drawn.r, photo.mean.r), m.color.g * k(drawn.g, photo.mean.g), m.color.b * k(drawn.b, photo.mean.b))
      m.map = photo.map
      m.normalMap = photo.normal
      m.needsUpdate = true
    })
  }

  const seen = new WeakSet<THREE.Material>()
  const lit = new WeakSet<THREE.Object3D>()
  const blended = new WeakSet<THREE.Object3D>()
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
      if (o instanceof THREE.DirectionalLight) o.intensity *= 1.3
      else if (o instanceof THREE.HemisphereLight) o.intensity *= 0.88
      else return
      lit.add(o)
    })
    if (scene.fog instanceof THREE.FogExp2 && !hazed.has(scene.fog)) {
      scene.fog.density *= 1.4
      hazed.add(scene.fog)
    }
    restyle(scene, seen, surfaced)
    scene.traverse((o) => {
      if (!o.userData.heightfield || blended.has(o)) return
      blended.add(o)
      blendFacets(o as THREE.Mesh)
      const m = (o as THREE.Mesh).material
      if (m instanceof THREE.MeshLambertMaterial) void Promise.all([photoOf("montePrato"), photoOf("monteRoccia")]).then(([meadow, rock]) => mountain(m, meadow, rock))
    })
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
