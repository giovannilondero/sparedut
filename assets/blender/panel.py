"""
Il Panel dal Casot: a section of the casot's wall at Lagune di Maran, torn off with bare hands.
Four planks gone grey in the lagoon's salt, two battens and a brace behind them, the nails still
in, the plank ends broken where they gave way at the sill and the lintel, and a leather strap to
hold it by. It is carried in front like a shield, held by its right edge.

    blender -b --python assets/blender/panel.py -- <out.glb> [preview-folder]

The game reads these node names: `body` (nothing moves on its own: the whole board is shoved
forward) and the points `muzzle` (the middle of its face) and `left` (the left hand on the far
edge). The board matches `PANEL_SIZE` in `client/models/weapons.ts`: 1 m by 1 m, its right edge
8 cm right of the grip, from 55 cm below it to 45 cm above.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import box, lathe, marker, material, part, ribbon, slab

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

# weathered planks: the walnut set, greyed and paled as far as a multiplied colour allows
GREY = material("plank-grey", (0.42, 0.39, 0.35), roughness=0.9, texture="walnut", scale=1.4)
BROWN = material("plank-brown", (0.55, 0.43, 0.32), roughness=0.85, texture="walnut", scale=1.4)
BATTEN = material("batten", (0.34, 0.27, 0.21), roughness=0.9, texture="walnut", scale=1.6)
RAW = material("splinter", (0.85, 0.70, 0.50), roughness=0.8, texture="mescul_beech", scale=3.0)
IRON = material("nail", (0.22, 0.18, 0.15), metallic=0.6, roughness=0.75)
LEATHER = material("strap", (1.0, 0.92, 0.82), roughness=0.85, texture="lanciafrico_leather", scale=8.0)

W, H = 1.0, 1.0
X0 = 0.08 - W  # left edge (+X is the right)
Z0 = -0.55  # bottom edge
T = 0.028  # plank thickness, along Y (the face looks along +Y)
N = 4


def plank(i, mat):
    """A plank with both ends broken: a jagged outline in X and Z, thick along Y."""
    xa = X0 + i * W / N + 0.006
    xb = X0 + (i + 1) * W / N - 0.006
    # broken ends: a few teeth across the width, different on each plank
    seed = [0.3, 1.7, 0.9, 2.4][i]
    teeth = 11

    def edge(z, sign, length):
        """Splintered, not sawn: two waves of different length and a sliver every few points."""
        pts = []
        for k in range(teeth + 1):
            x = xa + (xb - xa) * k / teeth
            wave = 0.5 + 0.35 * math.sin(seed * 5 + k * 0.9) + 0.15 * math.sin(seed * 11 + k * 3.7)
            sliver = 0.6 if (k + int(seed * 3)) % 4 == 0 else 0.0
            pts.append((x, z - sign * length * min(1.0, max(0.0, wave * 0.6 + sliver))))
        return pts

    top = edge(Z0 + H - [0.02, 0.06, 0.0, 0.04][i], 1, 0.035)
    bottom = edge(Z0 + [0.0, 0.03, 0.01, 0.0][i], -1, 0.03)
    # counter-clockwise seen from +X once turned: the outline is in (−x, z)
    outline = [(-x, z) for x, z in bottom] + [(-x, z) for x, z in reversed(top)]
    o = slab(f"plank{i}", outline[::-1], T, mat, bevel=0.003, segments=2)
    # the slab is thick along X: turn it so that it is thick along Y, the outline across X
    o.rotation_euler = (0, 0, math.pi / 2)
    # each plank a little out of true, as old boards are
    o.rotation_euler[1] = (i - 1.5) * 0.008
    return o


planks = [plank(i, BROWN if i % 2 else GREY) for i in range(N)]
battens = [box(f"batten{j}", (W - 0.06, 0.026, 0.08), (X0 + W / 2, -T / 2 - 0.013, z), BATTEN, bevel=0.004) for j, z in enumerate((0.25, -0.33))]
brace_len = math.hypot(W - 0.16, 0.5)
brace = box("brace", (brace_len, 0.024, 0.07), (X0 + W / 2, -T / 2 - 0.014, -0.04), BATTEN, bevel=0.004, rot=(0, math.atan2(0.5, W - 0.16), 0))

# the nails' heads on the face, where the planks meet the battens
nails = []
for j, z in enumerate((0.25, -0.33)):
    for i in range(N):
        x = X0 + (i + 0.5) * W / N + (0.03 if (i + j) % 2 else -0.03)
        nails.append(lathe(f"nail{j}{i}", [(0, 0.004), (0.006, 0.003), (0.0075, 0.0), (0.0075, -0.002)], (x, T / 2, z), IRON, axis="Y", steps=10))

# splinters still hanging off the broken ends
splinters = [box(f"splinter{k}", (0.012, 0.006, 0.06 + 0.02 * (k % 2)), (X0 + x, 0.004, Z0 - 0.02), RAW, bevel=0.001, rot=(0, a, 0)) for k, (x, a) in enumerate(((0.2, 0.35), (0.48, -0.3), (0.78, 0.2)))]

# the strap behind the right edge, where the right hand goes
strap = ribbon("strap", [(-T / 2 - 0.004, -0.07), (-0.05, -0.06), (-0.075, -0.02), (-0.075, 0.02), (-0.05, 0.06), (-T / 2 - 0.004, 0.07)], 0.008, 0.035, LEATHER)
strap.location = (0.0, 0, 0)

body = part("body", [*planks, *battens, brace, *nails, *splinters, strap])

marker("muzzle", (X0 + W / 2, 0.04, 0))
marker("left", (X0 + 0.08, -0.05, -0.05))
kit.drop_cutters()

if len(args) > 1:
    kit.preview(os.path.join(args[1], "panel-front.png"), eye=(-0.42 + 0.6, 2.0, 0.3), target=(-0.42, 0, -0.05), lens=40)
    kit.preview(os.path.join(args[1], "panel-back.png"), eye=(-0.42 - 0.8, -1.8, 0.4), target=(-0.42, 0, -0.05), lens=40)
kit.export(args[0])
