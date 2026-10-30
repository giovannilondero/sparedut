/**
 * Il contratto fra il mondo visibile (`client/world.ts`) e lo scenario di ogni mappa.
 *
 * `world.ts` disegna da sé tutto ciò che sta nei dati della mappa: terreno, rampe,
 * edifici (finestre, porte, tetti, portici), blocchi per materiale e `look`, fontane,
 * bancarelle, cjars di fen sui trampolini. Lo scenario aggiunge i monumenti e i decori
 * della mappa (solo grafica: niente che si tocchi), lo sfondo oltre i bordi e il giro
 * della camera del menu.
 */
import type * as THREE from "three"
import type { MapDef } from "../../shared/map.ts"
import type { Quality } from "../contracts.ts"
import type { Sky } from "./backdrop.ts"
import type { Batch, Inst, V } from "./geo.ts"
import type { Atlas, WorldTextures } from "./tex.ts"

/** I materiali del mondo: ogni geometria aggiunta al `Batch` ne sceglie uno. */
export type K =
  | "pietra"
  | "pietraChiara"
  | "intonaco"
  | "porfido"
  | "legno"
  | "cassa"
  | "fen"
  | "coppi"
  | "erba"
  | "marmo"
  | "ferro"
  | "pavimento"
  | "stoffa"
  | "vetro"
  | "luce"
  | "acqua"
  | "terra"
  | "roccia"
  | "sacs"
  | "atlas"

/** Le ripetizioni istanziate: finestre, cornici, scuri, porte, vasi, capitelli, basi, comignoli. */
export interface Instances {
  readonly vetro: Inst
  readonly cornice: Inst
  readonly scuri: Inst
  readonly porta: Inst
  readonly vaso: Inst
  readonly capitello: Inst
  readonly base: Inst
  readonly comignolo: Inst
}

export interface SceneryKit {
  readonly map: MapDef
  /** Geometria statica fusa per materiale (UV in mondo, colore per vertice). */
  readonly B: Batch<K>
  readonly I: Instances
  /** Il gruppo della mappa: luci e oggetti animati vanno qui (si buttano col cambio mappa). */
  readonly root: THREE.Group
  readonly MATS: Readonly<Record<K, THREE.Material>>
  readonly tex: WorldTextures
  readonly atlas: Atlas
  /** Caso deterministico. */
  readonly R: () => number
  readonly C: (hex: string) => THREE.Color
  /** Quota del terreno (blocchi `terreno` e rampe) in un punto. */
  readonly groundAt: (x: number, z: number) => number
  /** Una faccia di una scatola come quadrilatero (normale uscente). */
  readonly face: (min: V, max: V, side: "top" | "bottom" | "east" | "west" | "south" | "north") => THREE.BufferGeometry
  /** Gira la geometria perché la normale guardi verso `dir`. */
  readonly orient: (g: THREE.BufferGeometry, dir: V) => THREE.BufferGeometry
  /** Cilindro fra due punti. */
  readonly cylBetween: (a: V, b: V, r0: number, r1?: number, seg?: number) => THREE.BufferGeometry
  readonly sphere: (c: V, r: number, sy?: number, seg?: number) => THREE.BufferGeometry
  /** Tetto a falde sul rettangolo, colmo lungo il lato lungo. */
  readonly roof: (x0: number, z0: number, x1: number, z1: number, yTop: number, gable: THREE.Color, rise?: number, gableKey?: K) => { ridge: number; alongZ: boolean; rise: number }
  /** Finestra (vetro, cornice, scuri se `shutter`) sulla faccia di normale `n` centrata in `p`. */
  readonly win: (n: V, p: V, w: number, h: number, shutter: THREE.Color | null, vase: boolean) => void
  /** Porta con la base in `p`. */
  readonly door: (n: V, p: V, w: number, h: number, tint: THREE.Color) => void
}

/** Ciò che lo scenario anima dopo la costruzione. */
export interface SceneryLive {
  update?(t: number): void
  setQuality?(q: Quality): void
}

export interface Scenery {
  /** Monumenti e decori della mappa, dentro i `bounds`. */
  build(kit: SceneryKit): SceneryLive | void
  /** Lo sfondo irraggiungibile oltre i bordi (montagne, colline, alberi). */
  backdrop(kit: SceneryKit): THREE.Object3D[]
  /** Il giro lento della camera del menu: punti (chiusi ad anello) e dove guarda. */
  readonly menu: { readonly path: readonly V[]; readonly look: readonly V[] }
  /** Luce e foschia: direzione del sole o della luna (verso l'astro), nebbia, giorno o notte. */
  readonly light?: { readonly sun?: V; readonly fog?: number; readonly sky?: Sky }
}
