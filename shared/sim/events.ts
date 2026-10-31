/**
 * What happens in a tick, as plain data: the host forwards it to the clients
 * (sounds, tracers, kill feed, announcements).
 */
import type { PickupKind, Team } from "../map.ts"
import type { ProjectileKind, WeaponId } from "../weapons.ts"

export type P3 = readonly [number, number, number]

export type KillCause = WeaponId | "sgnape" | "mine" | "tampieste" | "fall"

/** Who won: a team, nobody, or the last one standing in the Tampieste. */
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
  /** A turret: mounted, dismounted, overheated, cool again. */
  | { readonly t: "turret"; readonly i: number; readonly s: string | null; readonly a: "on" | "off" | "hot" | "cool" }
  /** A door hit (splinters) or broken down. */
  | { readonly t: "door"; readonly i: number; readonly s: string; readonly a: "hit" | "broken" }
  /** Feathers from a gjaline that burst on you: you can't see anything for a while. */
  | { readonly t: "plumis"; readonly v: string; readonly n: number }
  | { readonly t: "match"; readonly a: "start" | "end"; readonly winner: Winner | null }
