import { Arsenal, Attackers, Controls, Game, Life, Motion, Player, Projectile, Stats, TeamOf } from "./schema.ts"

export const PlayersRead = Game.Query({
  selection: {
    player: Game.Query.read(Player),
    team: Game.Query.read(TeamOf),
    motion: Game.Query.read(Motion),
    life: Game.Query.read(Life)
  }
})

export const ProjectilesWrite = Game.Query({
  selection: { projectile: Game.Query.write(Projectile) }
})

export { Arsenal, Attackers, Controls, Life, Motion, Player, Projectile, Stats, TeamOf }
