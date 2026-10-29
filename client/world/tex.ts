/**
 * Texture procedurali su canvas: pietra romanica, intonaci, porfido, coppi, legno,
 * fieno, marmo, e un atlante con insegne, rosone, quadrante dell'orologio e stendardi.
 */
import * as THREE from "three"
import { rng } from "./geo.ts"

type Ctx = CanvasRenderingContext2D

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return [c, c.getContext("2d")!]
}

let aniso = 4
export function setAnisotropy(n: number) {
  aniso = Math.max(1, Math.min(8, n))
}

function toTex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  return t
}

/** Rumore fine su tutti i pixel (±amt). */
function grain(g: Ctx, w: number, h: number, amt: number, seed: number) {
  const r = rng(seed)
  const d = g.getImageData(0, 0, w, h)
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (r() - 0.5) * amt
    d.data[i] += n
    d.data[i + 1] += n
    d.data[i + 2] += n
  }
  g.putImageData(d, 0, 0)
}

/** Macchie morbide (velature) che si ripetono senza cuciture. */
function blotches(g: Ctx, w: number, h: number, n: number, color: string, maxR: number, seed: number) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = maxR * (0.3 + r() * 0.7)
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
      gr.addColorStop(0, color)
      gr.addColorStop(1, "rgba(0,0,0,0)")
      g.fillStyle = gr
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
    }
  }
}

/** Disegna un rettangolo ripetendolo oltre i bordi (tiling). */
function wrapRect(g: Ctx, w: number, h: number, x: number, y: number, rw: number, rh: number, draw: (x: number, y: number) => void) {
  for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
    if (x + ox + rw < 0 || x + ox > w || y + oy + rh < 0 || y + oy > h) continue
    draw(x + ox, y + oy)
  }
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** Corsi di conci: righe di altezza variabile, conci di lunghezza variabile. */
function masonry(size: number, seed: number, o: {
  mortar: string
  rows: number[]
  len: [number, number]
  stone: (r: () => number) => string
  joint: number
  radius: number
}): HTMLCanvasElement {
  const [c, g] = canvas(size)
  const r = rng(seed)
  g.fillStyle = o.mortar
  g.fillRect(0, 0, size, size)
  const total = o.rows.reduce((a, b) => a + b, 0)
  let y = 0
  for (const rh0 of o.rows) {
    const rh = (rh0 / total) * size
    let x = r() * size
    const end = x + size
    while (x < end - 4) {
      const len = Math.min(o.len[0] + r() * (o.len[1] - o.len[0]), end - x)
      const col = o.stone(r)
      const j = o.joint
      wrapRect(g, size, size, x, y, len, rh, (px, py) => {
        g.fillStyle = col
        roundRect(g, px + j, py + j, len - j * 2, rh - j * 2, o.radius)
        g.fill()
        // luce in alto, ombra in basso: un filo di rilievo
        g.fillStyle = "rgba(255,255,255,0.10)"
        g.fillRect(px + j + 2, py + j, len - j * 2 - 4, 2)
        g.fillStyle = "rgba(0,0,0,0.16)"
        g.fillRect(px + j + 2, py + rh - j - 3, len - j * 2 - 4, 3)
      })
      x += len
    }
    y += rh
  }
  blotches(g, size, size, 14, "rgba(60,50,40,0.10)", size * 0.2, seed + 1)
  grain(g, size, size, 22, seed + 2)
  return c
}

export interface WorldTextures {
  pietra: THREE.Texture
  pietraChiara: THREE.Texture
  intonaco: THREE.Texture
  porfido: THREE.Texture
  legno: THREE.Texture
  dipinto: THREE.Texture
  cassa: THREE.Texture
  fen: THREE.Texture
  coppi: THREE.Texture
  erba: THREE.Texture
  marmo: THREE.Texture
  pavimento: THREE.Texture
  facciata: THREE.Texture
}

export function makeTextures(): WorldTextures {
  // Pietra grigia del Duomo: corsi irregolari, conci grigio-beige.
  const pietra = masonry(512, 11, {
    mortar: "#a9a296",
    rows: [9, 6, 8, 5, 10, 7, 6, 9, 7, 8, 6, 9],
    len: [40, 130],
    joint: 2,
    radius: 5,
    stone: (r) => `hsl(${30 + r() * 15}, ${6 + r() * 8}%, ${50 + r() * 16}%)`
  })
  // Pietra chiara squadrata (colonne, cornici, loggia).
  const pietraChiara = masonry(512, 12, {
    mortar: "#c9c0ae",
    rows: [1, 1, 1, 1, 1, 1, 1, 1],
    len: [110, 190],
    joint: 1.5,
    radius: 2,
    stone: (r) => `hsl(${38 + r() * 8}, ${14 + r() * 8}%, ${78 + r() * 8}%)`
  })

  // Intonaco quasi bianco (il colore lo danno i vertici): velature, colature, cadute.
  const intonaco = (() => {
    const s = 512
    const [c, g] = canvas(s)
    const r = rng(21)
    g.fillStyle = "#f4f0e8"
    g.fillRect(0, 0, s, s)
    blotches(g, s, s, 26, "rgba(120,100,80,0.06)", 120, 22)
    blotches(g, s, s, 18, "rgba(255,255,255,0.22)", 90, 23)
    // colature verticali
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s, l = 40 + r() * 160
      const gr = g.createLinearGradient(0, y, 0, y + l)
      gr.addColorStop(0, "rgba(90,80,70,0.10)")
      gr.addColorStop(1, "rgba(90,80,70,0)")
      g.fillStyle = gr
      wrapRect(g, s, s, x, y, 3, l, (px, py) => g.fillRect(px, py, 2 + r() * 3, l))
    }
    // intonaco caduto: si vede la pietra sotto
    for (let i = 0; i < 4; i++) {
      const x = r() * s, y = r() * s, w = 20 + r() * 40, h = 14 + r() * 24
      wrapRect(g, s, s, x, y, w, h, (px, py) => {
        g.fillStyle = "#b8ab98"
        roundRect(g, px, py, w, h, 8)
        g.fill()
        g.strokeStyle = "rgba(80,70,60,0.5)"
        g.lineWidth = 1
        for (let k = 0; k < 3; k++) {
          g.beginPath()
          g.moveTo(px + 3, py + 4 + k * (h / 3))
          g.lineTo(px + w - 3, py + 4 + k * (h / 3))
          g.stroke()
        }
      })
    }
    grain(g, s, s, 14, 24)
    return c
  })()

  // Porfido a cubetti, file sfalsate, toni viola-rossicci.
  const porfido = (() => {
    const s = 512
    const [c, g] = canvas(s)
    const r = rng(31)
    g.fillStyle = "#5a504a"
    g.fillRect(0, 0, s, s)
    const n = 20
    const cell = s / n
    for (let row = 0; row < n; row++) {
      const off = (row % 2) * cell * 0.5 + (r() - 0.5) * 4
      for (let col = 0; col < n; col++) {
        const x = col * cell + off + (r() - 0.5) * 3, y = row * cell + (r() - 0.5) * 2
        const w = cell - 3 - r() * 2, h = cell - 3 - r() * 2
        const col0 = `hsl(${10 + r() * 25}, ${8 + r() * 10}%, ${42 + r() * 18}%)`
        wrapRect(g, s, s, x, y, w, h, (px, py) => {
          g.fillStyle = col0
          roundRect(g, px, py, w, h, 4)
          g.fill()
          g.fillStyle = "rgba(255,240,220,0.08)"
          g.fillRect(px + 2, py + 2, w - 6, 3)
        })
      }
    }
    blotches(g, s, s, 10, "rgba(20,15,10,0.12)", 100, 32)
    grain(g, s, s, 26, 33)
    return c
  })()

  const planks = (seed: number, base: [number, number, number], vertical: boolean, rows = 8) => {
    const s = 256
    const [c, g] = canvas(s)
    const r = rng(seed)
    const ph = s / rows
    for (let i = 0; i < rows; i++) {
      const l = base[2] + (r() - 0.5) * 10
      g.fillStyle = `hsl(${base[0] + (r() - 0.5) * 6}, ${base[1]}%, ${l}%)`
      if (vertical) g.fillRect(i * ph, 0, ph, s)
      else g.fillRect(0, i * ph, s, ph)
      g.strokeStyle = `hsla(${base[0]}, ${base[1]}%, ${l - 14}%, 0.5)`
      g.lineWidth = 1
      for (let k = 0; k < 5; k++) {
        g.beginPath()
        const o = i * ph + 3 + r() * (ph - 6)
        for (let t = 0; t <= s; t += 16) {
          const w = Math.sin(t * 0.03 + k * 2 + r()) * 1.5
          if (vertical) g.lineTo(o + w, t)
          else g.lineTo(t, o + w)
        }
        g.stroke()
      }
      g.fillStyle = "rgba(0,0,0,0.45)"
      if (vertical) g.fillRect(i * ph, 0, 2, s)
      else g.fillRect(0, i * ph, s, 2)
    }
    grain(g, s, s, 14, seed + 1)
    return c
  }
  const legno = planks(41, [30, 36, 46], false)
  const dipinto = (() => {
    // persiane: listelli orizzontali chiari (il colore lo dà l'istanza)
    const s = 128
    const [c, g] = canvas(s)
    g.fillStyle = "#e8e8e4"
    g.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = "rgba(0,0,0,0.28)"
      g.fillRect(0, y + 6, s, 2)
      g.fillStyle = "rgba(255,255,255,0.4)"
      g.fillRect(0, y, s, 1)
    }
    g.fillStyle = "rgba(0,0,0,0.35)"
    g.fillRect(0, 0, 6, s)
    g.fillRect(s - 6, 0, 6, s)
    g.fillRect(s / 2 - 2, 0, 4, s)
    grain(g, s, s, 18, 44)
    return c
  })()
  const cassa = (() => {
    const c = planks(51, [34, 40, 50], false, 5)
    const g = c.getContext("2d")!
    const s = c.width
    g.strokeStyle = "#6b4a2b"
    g.lineWidth = 22
    g.strokeRect(11, 11, s - 22, s - 22)
    g.beginPath()
    g.moveTo(16, 16)
    g.lineTo(s - 16, s - 16)
    g.stroke()
    g.fillStyle = "rgba(0,0,0,0.6)"
    for (const [x, y] of [[11, 11], [s - 11, 11], [11, s - 11], [s - 11, s - 11]]) g.fillRect(x - 2, y - 2, 4, 4)
    return c
  })()

  const fen = (() => {
    const s = 256
    const [c, g] = canvas(s)
    const r = rng(61)
    g.fillStyle = "#b8923e"
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 1400; i++) {
      const x = r() * s, y = r() * s, a = (r() - 0.5) * 1.6, l = 10 + r() * 28
      g.strokeStyle = `hsl(${40 + r() * 14}, ${45 + r() * 25}%, ${40 + r() * 35}%)`
      g.lineWidth = 0.8 + r() * 1.4
      wrapRect(g, s, s, x - l, y - l, l * 2, l * 2, (px, py) => {
        g.beginPath()
        g.moveTo(px + l, py + l)
        g.lineTo(px + l + Math.cos(a) * l, py + l + Math.sin(a) * l)
        g.stroke()
      })
    }
    return c
  })()

  // Coppi: canali lungo u, corsi lungo v.
  const coppi = (() => {
    const s = 256
    const [c, g] = canvas(s)
    const r = rng(71)
    const cw = s / 8, ch = s / 6
    for (let row = 0; row < 6; row++) {
      const off = (row % 2) * cw * 0.5
      for (let col = -1; col < 8; col++) {
        const x = col * cw + off, y = row * ch
        const h = 10 + r() * 14, l = 34 + r() * 16
        const moss = r() < 0.015
        const gr = g.createLinearGradient(x, 0, x + cw, 0)
        const base = moss ? `hsl(70, 25%, ${l - 10}%)` : `hsl(${h}, ${48 + r() * 18}%, ${l}%)`
        gr.addColorStop(0, "rgba(40,15,8,1)")
        gr.addColorStop(0.18, base)
        gr.addColorStop(0.5, moss ? `hsl(70, 25%, ${l}%)` : `hsl(${h + 4}, 55%, ${l + 14}%)`)
        gr.addColorStop(0.82, base)
        gr.addColorStop(1, "rgba(40,15,8,1)")
        g.fillStyle = gr
        g.fillRect(x, y, cw, ch)
        g.fillStyle = "rgba(20,8,4,0.55)"
        g.fillRect(x, y + ch - 4, cw, 4)
      }
    }
    grain(g, s, s, 18, 72)
    return c
  })()

  const erba = (() => {
    const s = 256
    const [c, g] = canvas(s)
    const r = rng(81)
    g.fillStyle = "#5e7a35"
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `hsl(${75 + r() * 30}, ${35 + r() * 20}%, ${22 + r() * 25}%)`
      g.fillRect(r() * s, r() * s, 1.5, 3 + r() * 4)
    }
    return c
  })()

  const marmo = (() => {
    const s = 512
    const [c, g] = canvas(s)
    const r = rng(91)
    g.fillStyle = "#efeae2"
    g.fillRect(0, 0, s, s)
    blotches(g, s, s, 12, "rgba(200,190,175,0.35)", 140, 92)
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(110,105,100,${0.12 + r() * 0.25})`
      g.lineWidth = 0.6 + r() * 1.6
      g.beginPath()
      let x = r() * s, y = r() * s
      g.moveTo(x, y)
      for (let k = 0; k < 10; k++) {
        x += (r() - 0.3) * 70
        y += (r() - 0.5) * 50
        g.lineTo(x, y)
      }
      g.stroke()
    }
    grain(g, s, s, 8, 93)
    return c
  })()

  // Pavimento della navata: rombi di marmo bianco e rosso di Verona.
  const pavimento = (() => {
    const s = 256
    const [c, g] = canvas(s)
    g.drawImage(marmo, 0, 0, s, s)
    g.fillStyle = "rgba(170,70,55,0.75)"
    const q = s / 2
    for (const [cx, cy] of [[q, q], [0, 0], [s, 0], [0, s], [s, s]]) {
      g.beginPath()
      g.moveTo(cx, cy - q / 1.4)
      g.lineTo(cx + q / 1.4, cy)
      g.lineTo(cx, cy + q / 1.4)
      g.lineTo(cx - q / 1.4, cy)
      g.closePath()
      g.fill()
    }
    g.strokeStyle = "rgba(60,50,40,0.35)"
    g.lineWidth = 2
    g.strokeRect(0, 0, s, s)
    grain(g, s, s, 10, 94)
    return c
  })()

  // Facciate lontane: intonaco con 3×3 finestre e scuri verdi.
  const facciata = (() => {
    const s = 256
    const [c, g] = canvas(s)
    g.fillStyle = "#efe9de"
    g.fillRect(0, 0, s, s)
    blotches(g, s, s, 8, "rgba(120,100,80,0.12)", 80, 101)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = 30 + i * 80, y = 34 + j * 76
      g.fillStyle = "#3b4a3a"
      g.fillRect(x - 12, y, 12, 40)
      g.fillRect(x + 28, y, 12, 40)
      g.fillStyle = "#2a2a30"
      g.fillRect(x, y, 28, 40)
      g.fillStyle = "#d8d0c0"
      g.fillRect(x - 3, y + 40, 34, 5)
    }
    g.fillStyle = "rgba(0,0,0,0.3)"
    g.fillRect(0, 0, s, 10)
    grain(g, s, s, 10, 102)
    return c
  })()

  return {
    pietra: toTex(pietra),
    pietraChiara: toTex(pietraChiara),
    intonaco: toTex(intonaco),
    porfido: toTex(porfido),
    legno: toTex(legno),
    dipinto: toTex(dipinto),
    cassa: toTex(cassa),
    fen: toTex(fen),
    coppi: toTex(coppi),
    erba: toTex(erba),
    marmo: toTex(marmo),
    pavimento: toTex(pavimento),
    facciata: toTex(facciata)
  }
}

// --- atlante -------------------------------------------------------------------------------

/** Rettangolo UV nell'atlante, con le proporzioni originali (larghezza/altezza). */
export interface Region {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
  readonly aspect: number
}

export type SignId = "ostarie" | "latarie" | "frico" | "cineteca" | "municipio" | "viebini" | "farmacie" | "place"
export interface Atlas {
  texture: THREE.Texture
  signs: Record<SignId, Region>
  rose: Region
  clock: Region
  bannerB: Region
  bannerM: Region
}

export function makeAtlas(): Atlas {
  const S = 1024
  const [c, g] = canvas(S)
  g.clearRect(0, 0, S, S)
  const region = (x: number, y: number, w: number, h: number): Region => ({
    u0: x / S,
    u1: (x + w) / S,
    // canvas y in basso = v alto (flipY)
    v0: 1 - (y + h) / S,
    v1: 1 - y / S,
    aspect: w / h
  })

  // Insegne: impacchettate a righe nella metà alta.
  const specs: [SignId, string, string, string, string][] = [
    ["ostarie", "Ostarie", "#3a2616", "#f1c96a", "italic bold 46px Georgia, serif"],
    ["latarie", "Latarie", "#e9e0c8", "#2c4a7a", "bold 46px Georgia, serif"],
    ["frico", "Frico & Polente", "#5b1d16", "#f6dc8c", "italic bold 44px Georgia, serif"],
    ["cineteca", "CINETECA DEL FRIULI", "#eee4cc", "#8a1d1d", "bold 44px Georgia, serif"],
    ["municipio", "MUNICIPIO", "rgba(0,0,0,0)", "#5b5040", "bold 52px Georgia, serif"],
    ["viebini", "Vie Bini", "#f4f1ea", "#1d1d1d", "bold 40px sans-serif"],
    ["farmacie", "Farmacie", "#1f5a33", "#f2f2f2", "bold 44px sans-serif"],
    ["place", "Place dal Municipi", "#f4f1ea", "#1d1d1d", "bold 40px sans-serif"]
  ]
  const signs = {} as Record<SignId, Region>
  let x = 0, y = 0
  const RH = 72
  for (const [id, text, bg, fg, font] of specs) {
    g.font = font
    const w = Math.ceil(g.measureText(text).width) + 48
    if (x + w > S) {
      x = 0
      y += RH + 4
    }
    if (bg !== "rgba(0,0,0,0)") {
      g.fillStyle = bg
      roundRect(g, x + 2, y + 2, w - 4, RH - 4, 8)
      g.fill()
      g.strokeStyle = fg
      g.lineWidth = 3
      roundRect(g, x + 8, y + 8, w - 16, RH - 16, 6)
      g.stroke()
    }
    g.fillStyle = fg
    g.textAlign = "center"
    g.textBaseline = "middle"
    g.fillText(text, x + w / 2, y + RH / 2 + 2)
    signs[id] = region(x, y, w, RH)
    x += w + 4
  }

  // Rosone: vetri colorati e trafori di pietra (in basso a sinistra, 512²).
  const rose = (() => {
    const ox = 0, oy = 512, R = 250, cx = ox + 256, cy = oy + 256
    g.save()
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = "#1a2550"
    g.fillRect(ox, oy, 512, 512)
    const n = 16
    const glass = ["#28408f", "#9b2230", "#d6a73a", "#2e6a4f", "#3a50a8", "#b8432a"]
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
      for (let k = 0; k < 3; k++) {
        g.fillStyle = glass[(i + k * 2) % glass.length]
        g.beginPath()
        g.arc(cx, cy, R * (0.42 + k * 0.2 + 0.18), a0, a1)
        g.arc(cx, cy, R * (0.42 + k * 0.2), a1, a0, true)
        g.closePath()
        g.fill()
      }
    }
    // luce attraverso il vetro
    const gl = g.createRadialGradient(cx - 60, cy - 60, 10, cx, cy, R)
    gl.addColorStop(0, "rgba(255,240,200,0.35)")
    gl.addColorStop(1, "rgba(0,0,0,0.25)")
    g.fillStyle = gl
    g.fillRect(ox, oy, 512, 512)
    // trafori
    g.strokeStyle = "#ddd3bd"
    g.lineCap = "round"
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      g.lineWidth = 9
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3)
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      g.stroke()
      // archetti trilobati alla corona
      const am = a + Math.PI / n
      g.lineWidth = 6
      g.beginPath()
      g.arc(cx + Math.cos(am) * R * 0.8, cy + Math.sin(am) * R * 0.8, R * 0.11, 0, Math.PI * 2)
      g.stroke()
    }
    for (const k of [0.3, 0.62, 0.98]) {
      g.lineWidth = k > 0.9 ? 22 : 10
      g.beginPath()
      g.arc(cx, cy, R * k, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = "#ddd3bd"
    g.beginPath()
    g.arc(cx, cy, R * 0.12, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = "#c79a3a"
    g.beginPath()
    g.arc(cx, cy, R * 0.07, 0, Math.PI * 2)
    g.fill()
    g.restore()
    return region(ox, oy, 512, 512)
  })()

  // Quadrante dell'orologio con numeri romani.
  const clock = (() => {
    const ox = 512, oy = 512, cx = ox + 128, cy = oy + 128, R = 124
    g.fillStyle = "#f3ecd8"
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 8
    g.strokeStyle = "#2a2622"
    g.stroke()
    g.lineWidth = 2
    g.beginPath()
    g.arc(cx, cy, R * 0.72, 0, Math.PI * 2)
    g.stroke()
    const roman = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"]
    g.fillStyle = "#2a2622"
    g.font = "bold 24px Georgia, serif"
    g.textAlign = "center"
    g.textBaseline = "middle"
    roman.forEach((t, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2
      g.fillText(t, cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84)
    })
    g.fillStyle = "#b8862e"
    g.beginPath()
    g.arc(cx, cy, 10, 0, Math.PI * 2)
    g.fill()
    return region(ox, oy, 256, 256)
  })()

  // Stendardi: finocchio (benandanti) e sorgo (malandanti), coda a punte.
  const banner = (ox: number, color: string, edge: string, emblem: (cx: number, cy: number) => void) => {
    const oy = 512, w = 128, h = 512
    g.fillStyle = color
    g.beginPath()
    g.moveTo(ox + 2, oy)
    g.lineTo(ox + w - 2, oy)
    g.lineTo(ox + w - 2, oy + h - 60)
    g.lineTo(ox + w * 0.75, oy + h - 8)
    g.lineTo(ox + w * 0.5, oy + h - 60)
    g.lineTo(ox + w * 0.25, oy + h - 8)
    g.lineTo(ox + 2, oy + h - 60)
    g.closePath()
    g.fill()
    g.strokeStyle = edge
    g.lineWidth = 6
    g.stroke()
    g.fillStyle = "rgba(0,0,0,0.18)"
    for (let i = 0; i < 4; i++) g.fillRect(ox + 16 + i * 30, oy, 6, h - 70)
    emblem(ox + w / 2, oy + 220)
    return region(ox, oy, w, h)
  }
  const bannerB = banner(768, "#4f9a3e", "#e9f2c8", (cx, cy) => {
    // finocchio: gambo e ombrelle
    g.strokeStyle = "#f4f0c0"
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(cx, cy + 140)
    g.lineTo(cx, cy - 40)
    g.stroke()
    for (const [dx, dy] of [[-34, -70], [0, -95], [34, -70], [-20, -20], [22, -24]]) {
      g.lineWidth = 2.5
      for (let k = -3; k <= 3; k++) {
        g.beginPath()
        g.moveTo(cx, cy - 40)
        g.lineTo(cx + dx + k * 5, cy + dy)
        g.stroke()
      }
      g.fillStyle = "#f2dc5a"
      for (let k = -3; k <= 3; k++) {
        g.beginPath()
        g.arc(cx + dx + k * 5, cy + dy, 3.5, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
  const bannerM = banner(896, "#b8324a", "#f2d27a", (cx, cy) => {
    // scopa di sorgo
    g.strokeStyle = "#f2d27a"
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(cx, cy - 120)
    g.lineTo(cx, cy + 20)
    g.stroke()
    g.lineWidth = 2.5
    for (let k = -9; k <= 9; k++) {
      g.beginPath()
      g.moveTo(cx + k * 1.5, cy + 20)
      g.quadraticCurveTo(cx + k * 3, cy + 80, cx + k * 5, cy + 140)
      g.stroke()
    }
    g.fillStyle = "#5a1020"
    g.fillRect(cx - 16, cy + 26, 32, 8)
  })

  const texture = toTex(c, false)
  return { texture, signs, rose, clock, bannerB, bannerM }
}

/** Quadrilatero verticale che mostra una regione dell'atlante, centrato, in xy, verso +z. */
export function atlasQuad(r: Region, h: number, w = h * r.aspect): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? r.u1 : r.u0, uv.getY(i) ? r.v1 : r.v0)
  return g
}

/** Disco che mostra una regione quadrata dell'atlante (rosone, orologio). */
export function atlasDisc(r: Region, radius: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, seg)
  const uv = g.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0))
  return g
}
