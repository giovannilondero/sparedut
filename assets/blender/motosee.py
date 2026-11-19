"""
La Motosee: a chainsaw borrowed from a woodshed in Cjargne. The orange engine housing with the
air vents of its cylinder cover, the starter on the left with its pull cord, the clutch cover on
the right where the bar comes out and the exhaust in front; the black wrap handle over the top
for the left hand, the chain brake in front of it, the rear handle with its throttle under the
right hand; the bar forward with the chain around it, and a few wood chips still caught in it.

    blender -b --python assets/blender/motosee.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving part `chain` (its links and cutters, which
run along the bar while it cuts: the game slides them by a whole cutter's length, two links) and
the points `muzzle` (the nose of the bar) and `left` (the left hand on the wrap handle). The
layout matches `motosee()` in `client/models/weapons.ts`: the rear grip at the origin, the bar
3.5 cm right of it and 2.5 cm above it, from 27 cm to 70 cm ahead, 6.4 cm deep.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import box, lathe, marker, material, part, ribbon, slab, tube

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

ORANGE = material("housing-orange", (0.85, 0.30, 0.05), roughness=0.45)
GREY = material("housing-grey", (0.16, 0.16, 0.17), roughness=0.6)
RUBBER = material("handle-rubber", (0.035, 0.035, 0.035), roughness=0.85)
# on screen a metal is only what it reflects: none of these is as dark as the real thing
BAR = material("bar-steel", (0.52, 0.53, 0.55), metallic=1.0, roughness=0.32)
LINK = material("chain-steel", (0.30, 0.30, 0.31), metallic=1.0, roughness=0.45)
CUTTER = material("cutter-chrome", (0.80, 0.80, 0.80), metallic=1.0, roughness=0.18)
EXHAUST = material("exhaust", (0.36, 0.33, 0.30), metallic=1.0, roughness=0.6)
CHIP = material("wood-chip", (0.85, 0.70, 0.50), roughness=0.8, texture="mescul_beech", scale=3.0)

# the bar, in Blender's axes: 3.5 cm right of the grip, its middle 2.5 cm above it
BX, BZ = 0.035, 0.025
Y0, Y1 = 0.27, 0.70  # from behind the clutch cover to the centre of the nose
H = 0.064
PITCH = 0.024


def light(o, segments=1):
    """Small parts do not need three segments on every rounded edge."""
    for m in o.modifiers:
        if m.type == "BEVEL":
            m.segments = segments
    return o


# --- the rear handle and the throttle --------------------------------------------------
rear = ribbon("rear-handle", [(0.07, 0.0), (-0.06, 0.0), (-0.08, 0.03), (-0.08, 0.09), (-0.06, 0.115), (0.07, 0.115)], 0.03, 0.032, RUBBER)
throttle = light(box("throttle", (0.012, 0.03, 0.02), (0, 0.025, -0.022), GREY, bevel=0.002))
lockout = light(box("lockout", (0.012, 0.03, 0.012), (0, 0.0, 0.018), GREY, bevel=0.002))

# --- the engine: the housing in profile, the crankcase under it, vents and caps ----------
housing = slab("housing", [(0.06, -0.01), (0.26, -0.01), (0.275, 0.06), (0.25, 0.12), (0.19, 0.165), (0.09, 0.162), (0.06, 0.12)], 0.12, ORANGE, bevel=0.014, segments=4)
crankcase = box("crankcase", (0.112, 0.2, 0.04), (0, 0.16, -0.012), GREY, bevel=0.008)
cover = slab("cylinder-cover", [(0.13, 0.15), (0.23, 0.12), (0.245, 0.135), (0.2, 0.172), (0.13, 0.172)], 0.09, GREY, bevel=0.006, at=(0, 0, 0.0))
vents = [light(box(f"vent{i}", (0.004, 0.05, 0.006), (-0.061, 0.13 + i * 0.006, 0.05 + i * 0.014), RUBBER, bevel=0.001)) for i in range(5)]
fuel = light(lathe("fuel-cap", [(0, 0), (0.016, 0), (0.016, 0.012), (0.012, 0.016), (0, 0.016)], (-0.03, 0.08, 0.15), GREY, axis="Z", steps=20, bevel=0.002))
oil = light(lathe("oil-cap", [(0, 0), (0.012, 0), (0.012, 0.01), (0, 0.012)], (0.03, 0.08, 0.15), RUBBER, axis="Z", steps=16, bevel=0.002))

# the starter on the left, its pull cord and handle
starter = lathe("starter", [(0, 0), (0.052, 0), (0.052, 0.014), (0.044, 0.02), (0, 0.022)], (-0.06, 0.15, 0.06), GREY, axis="X", steps=28, bevel=0.002)
starter.rotation_euler = (0, 0, math.pi)
grips = [light(box(f"starter-rib{i}", (0.004, 0.06, 0.004), (-0.084, 0.15, 0.04 + i * 0.012), RUBBER, bevel=0.001)) for i in range(4)]
cord = tube("cord", 0.002, 0.03, (-0.083, 0.12, 0.085), RUBBER, axis="Z", steps=6)
pull = light(box("pull", (0.014, 0.05, 0.016), (-0.086, 0.12, 0.122), RUBBER, bevel=0.005), 2)

# the clutch cover on the right, where the bar comes out, with its two nuts; the exhaust in front
clutch = slab("clutch-cover", [(0.17, -0.005), (0.3, -0.005), (0.3, 0.05), (0.26, 0.085), (0.17, 0.085)], 0.03, ORANGE, bevel=0.008, at=(0.072, 0, 0))
nuts = [light(lathe(f"nut{i}", [(0, 0), (0.009, 0), (0.009, 0.01), (0, 0.01)], (0.087, y, 0.025), EXHAUST, axis="X", steps=6, bevel=0.001)) for i, y in enumerate((0.215, 0.255))]
muffler = box("muffler", (0.05, 0.03, 0.05), (0.0, 0.282, 0.035), EXHAUST, bevel=0.006)
dogs = slab("felling-dogs", [(0.29, -0.01), (0.3, -0.01), (0.315, 0.0), (0.302, 0.012), (0.315, 0.024), (0.302, 0.036), (0.315, 0.048), (0.3, 0.06), (0.29, 0.06)], 0.004, EXHAUST, bevel=0.001, at=(0.06, 0, 0))

# --- the wrap handle for the left hand, and the chain brake in front of it --------------
HY = 0.2
wrap_top = tube("wrap-top", 0.01, 0.12, (-0.07, HY, 0.21), RUBBER, axis="X", steps=16)
wrap_left = tube("wrap-left", 0.01, 0.2, (-0.07, HY, 0.01), RUBBER, axis="Z", steps=16)
wrap_foot = tube("wrap-foot", 0.01, 0.06, (0.05, HY, 0.155), RUBBER, axis="Z", steps=16)
corners = [light(lathe(f"wrap-corner{i}", [(0, -0.011), (0.011, 0.0), (0, 0.011)], at, RUBBER, axis="Z", steps=12), 1) for i, at in enumerate(((-0.07, HY, 0.21), (0.05, HY, 0.21)))]
brake = box("chain-brake", (0.13, 0.008, 0.11), (0, 0.248, 0.175), RUBBER, bevel=0.003, rot=(-0.25, 0, 0))

# --- the bar, its rivets and the nose sprocket ---------------------------------------------
nose = [(Y1 + (H / 2) * math.sin(a), BZ - (H / 2) * math.cos(a)) for a in [i * math.pi / 10 for i in range(11)]]
bar = slab("bar", [(Y0, BZ - H / 2 - 0.004), *nose, (Y0, BZ + H / 2 + 0.004)], 0.008, BAR, bevel=0.0015, segments=2, at=(BX, 0, 0))
rivets = [light(lathe(f"rivet{i}", [(0, -0.006), (0.005, -0.006), (0.005, 0.006), (0, 0.006)], (BX, y, BZ), LINK, axis="X", steps=10, bevel=0.001)) for i, y in enumerate((0.33, 0.36, Y1))]

# --- the chain: links along both edges and a cutter every other link ---------------------
chain_parts = []
n = int((Y1 - Y0) / PITCH)
for i in range(n + 1):
    y = Y0 + i * PITCH
    for side in (1, -1):
        z = BZ + side * (H / 2 + 0.003)
        chain_parts.append(light(box(f"link{i}{side}", (0.011, PITCH * 0.94, 0.008), (BX, y, z), LINK, bevel=0.0012)))
        if i % 2 == 0:
            # the cutter: a raised hook with its depth gauge in front
            chain_parts.append(light(box(f"cutter{i}{side}", (0.013, 0.011, 0.008), (BX, y - 0.004, z + side * 0.006), CUTTER, bevel=0.0012)))
            chain_parts.append(light(box(f"gauge{i}{side}", (0.006, 0.004, 0.005), (BX, y + 0.006, z + side * 0.005), LINK, bevel=0.0008)))
# round the nose: the links that bend over it (they run with the rest)
for k in range(1, 8):
    a = k * math.pi / 8
    r = H / 2 + 0.003
    chain_parts.append(light(box(f"nose-link{k}", (0.011, 0.012, 0.008), (BX, Y1 + r * math.sin(a), BZ - r * math.cos(a)), LINK, bevel=0.0012, rot=(a, 0, 0))))

# wood chips from the woodshed still stuck in the guard and on the bar
chips = [light(box(f"chip{i}", (0.016, 0.01, 0.004), at, CHIP, bevel=0.001, rot=rot)) for i, (at, rot) in enumerate((((0.05, 0.27, 0.065), (0.4, 0.8, 0)), ((0.03, 0.29, 0.075), (-0.6, -1.2, 0.3)), ((0.055, 0.28, -0.01), (1.2, 2.4, 0)), ((0.03, 0.4, 0.06), (0.2, 0.3, 0.1))))]

body = part(
    "body",
    [rear, throttle, lockout, housing, crankcase, cover, *vents, fuel, oil, starter, *grips, cord, pull, clutch, *nuts, muffler, dogs, wrap_top, wrap_left, wrap_foot, *corners, brake, bar, *rivets, *chips],
)
chain = part("chain", chain_parts, pivot=(BX, 0, BZ))

marker("muzzle", (BX, Y1 + H / 2, BZ))
marker("left", (-0.01, HY, 0.21))
kit.drop_cutters()

if len(args) > 1:
    kit.preview(os.path.join(args[1], "motosee-right.png"), eye=(0.75, 0.15, 0.3), target=(0.0, 0.33, 0.05), lens=40)
    kit.preview(os.path.join(args[1], "motosee-left.png"), eye=(-0.7, 0.55, 0.35), target=(0.0, 0.3, 0.05), lens=40)
    kit.preview(os.path.join(args[1], "motosee-shooter.png"), eye=(0.12, -0.35, 0.35), target=(0.02, 0.4, 0.04), lens=32)
kit.export(args[0])
