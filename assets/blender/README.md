# Weapons modelled in Blender

Each `<id>.py` builds one weapon on the helpers in `kit.py` and exports
`client/public/models/<id>.glb`, which the realistic look loads in place of the
primitives of `client/models/weapons.ts`.

```sh
pnpm models                # all of them (about 20 s)
bun scripts/models.ts mandi   # one
# with Cycles previews to look at:
/Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/mandi.py -- client/public/models/mandi.glb /tmp/previews
```

The game reads the nodes by name: `body`, one node per moving part named like the key in
the builder's `parts` (`mag`, `slide`, `shells0`…), and the points `muzzle` and `left`.
Each file also carries `far`, the whole weapon joined and thinned to 3000 triangles: what
the other players are seen holding.
Everything is authored in weapon space at rest, where the primitive version has it: pivots,
hands and animations stay the ones in the game code.

## Hands (`hands.py`)

Not a weapon: the shooter's right hand (Blender's CC0 Human Base Meshes, `hand-base.blend`) on a
skeleton, its sleeve, and a pose for each hand on each weapon. The poses are solved, not drawn:
the script loads every weapon's `.glb`, lays the palm on what is held and closes each finger until
it touches the model. So build the weapons first (`pnpm models` does), and rebuild the hands when
a grip, a fore-end or a `left` point moves. How a weapon is held (pistol grip, stock, handle,
cradle…) is the `WEAPONS` table of the script; `client/models/hands.ts` bakes a
pose into a mesh for `client/viewmodel.ts`.

```sh
bun scripts/models.ts hands
# stills of some weapons with their hands on, from the shooter's eye and from close by (nothing is exported):
HANDS_ONLY=mandi,cramar /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/hands.py -- client/public/models/hands.glb /tmp/previews
```

## Textures (`tex/`)

Sources for the models, not shipped: the exporter packs what a model uses into its `.glb`.
From [Poly Haven](https://polyhaven.com), CC0:

| Files | Asset |
|---|---|
| `walnut_*` | `american_walnut_veneer` |
| `hessian_*` | `hessian_230` |
| `mescul_beech_*` | `ash_veneer` |
| `mescul_leather_*`, `lanciafrico_leather_*` | `brown_leather` |
| `mulin_stone_*` | `rough_concrete` |

The others (`doplete-scroll_*`, `cjampanili-stone_*`, `miedi_copper_*`, `lanciafrico_copper_n`,
`lanciafrico_frico_*`) are drawn by the scripts themselves, and redrawn when missing.
