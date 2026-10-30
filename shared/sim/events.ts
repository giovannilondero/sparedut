/**
 * Ciò che succede in un tick, come dati semplici: l'host lo gira ai client
 * (suoni, scie, kill feed, annunci).
 */
import type { PickupKind, Team } from "../map.ts"
import type { ProjectileKind, WeaponId } from "../weapons.ts"

export type P3 = readonly [number, number, number]

export type KillCause = WeaponId | "sgnape" | "mine" | "tampieste" | "fall"

/** Chi ha vinto: una squadra, nessuno, o l'ultimo in piedi della Tampieste. */
export type Winner = Team | "pari" | { readonly player: string; readonly name: string }

export type GameEvent =
  | { readonly t: "shot"; readonly s: string; readonly w: WeaponId; readonly o: P3; readonly e: readonly P3[]; readonly hw: readonly boolean[] }
  | { readonly t: "melee"; readonly s: string; readonly hit: boolean }
  | { readonly t: "launch"; readonly s: string; readonly k: ProjectileKind }
  | { readonly t: "hit"; readonly a: string | null; readonly v: string; readonly d: number; readonly h: boolean; readonly kill: boolean }
  | { readonly t: "kill"; readonly k: string | null; readonly v: string; readonly w: KillCause; readonly h: boolean; readonly n: number }
  | { readonly t: "boom"; readonly p: P3; readonly k: ProjectileKind }
  | { readonly t: "bounce"; readonly p: P3 }
  | { readonly t: "pick"; readonly s: string; readonly k: PickupKind }
  | { readonly t: "flag"; readonly team: Team; readonly a: "taken" | "dropped" | "returned" | "captured"; readonly s: string | null }
  | { readonly t: "hill"; readonly team: Team | null }
  | { readonly t: "pad"; readonly s: string }
  | { readonly t: "spawn"; readonly s: string }
  | { readonly t: "reload"; readonly s: string; readonly w: WeaponId }
  | { readonly t: "streak"; readonly s: string; readonly n: number }
  | { readonly t: "cart"; readonly a: "push" | "stop" | "back" | "arrived" }
  | { readonly t: "heal"; readonly s: string; readonly v: string; readonly n: number }
  | { readonly t: "match"; readonly a: "start" | "end"; readonly winner: Winner | null }
