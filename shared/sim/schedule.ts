/** Un tick della simulazione, nell'ordine in cui le cose succedono. */
import { ApplyDamage } from "./systems/damage.ts"
import { ApplyInputs } from "./systems/input.ts"
import { MedicAura } from "./systems/medic.ts"
import { HandleJoin, HandleLeave, HandleTeamChanges } from "./systems/lobby.ts"
import { AdvanceTick, MatchFlow } from "./systems/match.ts"
import { MovePlayers, RecordHistory } from "./systems/movement.ts"
import { CollectPickups } from "./systems/pickups.ts"
import { PlayObjectives } from "./systems/objectives.ts"
import { FlyProjectiles } from "./systems/projectiles.ts"
import { Respawn } from "./systems/respawn.ts"
import { StormDamage } from "./systems/storm.ts"
import { UseWeapons } from "./systems/weapons.ts"
import { Game } from "./schema.ts"

export const simulate = Game.Schedule(
  AdvanceTick,
  HandleLeave,
  HandleJoin,
  Game.Schedule.applyDeferred(),
  HandleTeamChanges,
  ApplyInputs,
  MatchFlow,
  Respawn,
  MovePlayers,
  UseWeapons,
  FlyProjectiles,
  MedicAura,
  StormDamage,
  ApplyDamage,
  RecordHistory,
  CollectPickups,
  PlayObjectives,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions()
)
