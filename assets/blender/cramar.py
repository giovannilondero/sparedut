"""
Il Mitra dal Cramâr: a 1920s submachine gun with a finned barrel, a compensator, walnut
furniture and a drum, with the pedlar's spice pouch hanging under the fore-end.

    blender -b --python assets/blender/cramar.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving parts `mag`, `bolt`, `pouch` (their
origin is the pivot they move around) and the points `muzzle` and `left` (the left hand).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import box, cut, lathe, marker, material, part, ribbon, slab, tube

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

# blued steel is dark but not black: on screen a metal is only what it reflects
STEEL = material("blued-steel", (0.16, 0.175, 0.20), metallic=1.0, roughness=0.42)
WORN = material("worn-steel", (0.30, 0.31, 0.32), metallic=1.0, roughness=0.28)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
SACK = material("hessian", (0.75, 0.66, 0.48), roughness=0.95, texture="hessian", scale=14.0)
ROPE = material("rope", (0.55, 0.45, 0.28), roughness=1.0)
CINNAMON = material("cinnamon", (0.30, 0.13, 0.05), roughness=0.85)

AXIS = 0.06  # height of the barrel's axis above the grip

# --- body ---------------------------------------------------------------------------------
receiver = box("receiver", (0.040, 0.275, 0.046), (0, 0.0625, 0.062), STEEL, bevel=0.004)
cut(receiver, [
    box("slot", (0.007, 0.115, 0.012), (0, -0.005, 0.085), None, bevel=0),  # the bolt handle's track
    box("port", (0.012, 0.046, 0.017), (0.020, 0.075, 0.067), None, bevel=0),  # ejection port
])
frame = box("frame", (0.030, 0.175, 0.034), (0, 0.0125, 0.025), STEEL, bevel=0.003)
guard = ribbon("guard", [(0.082, 0.010), (0.083, -0.004), (0.074, -0.016), (0.040, -0.019), (0.022, -0.014), (0.014, 0.008)], 0.0028, 0.013, STEEL)
trigger = box("trigger", (0.006, 0.007, 0.022), (0, 0.046, -0.001), WORN, bevel=0.002, rot=(0.35, 0, 0))
pins = [lathe(f"pin{i}", [(0, 0), (0.0032, 0), (0.0032, 0.0012), (0, 0.0012)], (x, y, z), WORN, axis="X", steps=14, bevel=0.0004) for i, (x, y, z) in enumerate(((-0.0212, 0.150, 0.052), (-0.0212, -0.050, 0.052), (-0.0162, 0.060, 0.030), (0.020, 0.150, 0.052), (0.020, -0.050, 0.052)))]
# the long step milled along both sides of the receiver
cut(receiver, [box(f"flute{i}", (0.003, 0.150, 0.010), (x, 0.085, 0.074), None, bevel=0) for i, x in enumerate((-0.0205, 0.0205))])
catch = box("drum-catch", (0.004, 0.022, 0.012), (-0.0165, 0.085, 0.032), WORN, bevel=0.0012)
selector = lathe("selector", [(0, 0), (0.005, 0), (0.005, 0.003), (0, 0.003)], (-0.0165, -0.03, 0.03), WORN, axis="X", steps=16, bevel=0.0006)

grip = slab("grip", [(0.020, 0.012), (-0.024, 0.012), (-0.032, -0.012), (-0.047, -0.076), (-0.041, -0.089), (-0.010, -0.092), (-0.003, -0.080), (0.010, -0.022)], 0.031, WOOD, bevel=0.009)
butt = slab("butt", [(-0.070, 0.074), (-0.110, 0.072), (-0.285, 0.050), (-0.297, 0.044), (-0.297, -0.062), (-0.288, -0.072), (-0.262, -0.070), (-0.135, 0.004), (-0.075, 0.010)], 0.040, WOOD, bevel=0.012)
plate = box("butt-plate", (0.036, 0.005, 0.110), (0, -0.2985, -0.010), STEEL, bevel=0.002)

sight_base = box("rear-sight-base", (0.024, 0.034, 0.006), (0, -0.050, 0.0875), STEEL, bevel=0.0012)
ears = [box(f"rear-sight-ear{i}", (0.003, 0.026, 0.017), (x, -0.050, 0.097), STEEL, bevel=0.001) for i, x in enumerate((-0.0105, 0.0105))]
leaf = cut(box("rear-sight-leaf", (0.014, 0.003, 0.013), (0, -0.056, 0.0945), STEEL, bevel=0.0006), [box("notch", (0.003, 0.01, 0.006), (0, -0.056, 0.100), None, bevel=0)])

# barrel: a collar at the receiver, the cooling fins, then the plain tube to the compensator
profile = [(0, 0), (0.0165, 0), (0.0165, 0.009), (0.0105, 0.009)]
for i in range(17):
    a = 0.012 + i * 0.0072
    profile += [(0.0105, a), (0.0158, a + 0.0006), (0.0158, a + 0.0028), (0.0105, a + 0.0034)]
profile += [(0.0105, 0.137), (0.0088, 0.142), (0.0088, 0.245), (0, 0.245)]
barrel = lathe("barrel", profile, (0, 0.200, AXIS), STEEL, steps=36)

comp = lathe("compensator", [(0, 0), (0.0105, 0), (0.0135, 0.004), (0.0135, 0.041), (0.012, 0.045), (0.0068, 0.045), (0.0068, 0.020), (0, 0.020)], (0, 0.440, AXIS), STEEL, steps=32, bevel=0.0006)
cut(comp, [box(f"comp-slot{i}", (0.03, 0.0035, 0.012), (0, 0.451 + i * 0.0085, AXIS + 0.012), None, bevel=0) for i in range(4)])
front_sight = box("front-sight", (0.0028, 0.014, 0.024), (0, 0.432, 0.083), STEEL, bevel=0.0008)
front_ring = lathe("front-sight-band", [(0.0088, 0), (0.0125, 0), (0.0125, 0.016), (0.0088, 0.016)], (0, 0.424, AXIS), STEEL, steps=28, bevel=0.0008)

rail = box("grip-rail", (0.014, 0.165, 0.008), (0, 0.2775, 0.037), STEEL, bevel=0.0015)
fore = slab("fore-end", [(0.214, 0.034), (0.346, 0.034), (0.353, 0.026), (0.351, 0.002), (0.336, -0.008), (0.232, -0.008), (0.214, 0.002), (0.211, 0.024)], 0.038, WOOD, bevel=0.010)
swivel = ribbon("swivel", [(0.300, -0.008), (0.300, -0.018), (0.312, -0.018), (0.312, -0.008)], 0.002, 0.012, WORN)

body = part("body", [receiver, frame, guard, trigger, selector, *pins, catch, grip, butt, plate, sight_base, *ears, leaf, barrel, comp, front_sight, front_ring, rail, fore, swivel])

# --- drum (cartridges lie along the barrel: the drum's faces look fore and aft) ----------------
DRUM = (0, 0.099, -0.045)
face = [(0, 0.004), (0.012, 0.004), (0.014, 0.0), (0.022, 0.0), (0.024, 0.003), (0.046, 0.003), (0.048, 0.0006), (0.060, 0.0006), (0.066, 0.004), (0.068, 0.009)]
shell = face + [(r, 0.062 - a) for r, a in reversed(face)]
drum = lathe("drum", shell, DRUM, STEEL, steps=64, bevel=0.0005)
rivets = [lathe(f"rivet{i}", [(0, -0.0016), (0.0022, -0.0008), (0.003, 0.001)], (DRUM[0] + 0.054 * math.cos(i * math.pi / 4), DRUM[1] + 0.0006, DRUM[2] + 0.054 * math.sin(i * math.pi / 4)), BRASS, steps=10) for i in range(8)]
hub = lathe("drum-hub", [(0, -0.003), (0.008, -0.003), (0.011, 0.0), (0.011, 0.004)], (DRUM[0], DRUM[1], DRUM[2]), BRASS, steps=24, bevel=0.0005)
key = box("winding-key", (0.050, 0.004, 0.011), (DRUM[0], DRUM[1] + 0.064, DRUM[2]), BRASS, bevel=0.002, rot=(0, 0.5, 0))
key_hub = lathe("key-hub", [(0.011, 0.058), (0.011, 0.064), (0.008, 0.067), (0, 0.067)], DRUM, BRASS, steps=24, bevel=0.0005)
tower = box("drum-tower", (0.028, 0.050, 0.046), (0, 0.130, 0.020), STEEL, bevel=0.002)
mag = part("mag", [drum, *rivets, hub, key, key_hub, tower], pivot=(0, 0.13, 0))

# --- bolt handle ------------------------------------------------------------------------------
stem = tube("bolt-stem", 0.0036, 0.012, (0, 0.02, 0.082), WORN, axis="Z", steps=16)
knob = lathe("bolt-knob", [(0, 0), (0.005, 0.001), (0.0082, 0.005), (0.0082, 0.009), (0.005, 0.013), (0, 0.014)], (0, 0.02, 0.092), WORN, axis="Z", steps=24, bevel=0.0006)
bolt = part("bolt", [stem, knob], pivot=(0, 0.02, 0.092))

# --- the cramâr's spice pouch ---------------------------------------------------------------
HANG = (0, 0.21, 0.032)
cord = tube("pouch-cord", 0.0014, 0.050, (HANG[0], HANG[1], HANG[2] - 0.050), ROPE, axis="Z", steps=8, bevel=0)
sack = lathe("pouch-sack", [(0, 0), (0.008, 0.001), (0.015, 0.004), (0.021, 0.009), (0.026, 0.017), (0.029, 0.027), (0.0285, 0.037), (0.025, 0.046), (0.019, 0.054), (0.012, 0.060), (0.009, 0.063), (0.010, 0.067), (0.013, 0.071), (0.016, 0.074), (0.013, 0.0735), (0.006, 0.070), (0, 0.066)], (HANG[0], HANG[1], HANG[2] - 0.118), SACK, axis="Z", steps=28)
tie = lathe("pouch-tie", [(0.009, 0), (0.0125, 0.0015), (0.0125, 0.004), (0.009, 0.0055)], (HANG[0], HANG[1], HANG[2] - 0.059), ROPE, axis="Z", steps=20)
sticks = [tube(f"cinnamon{i}", 0.0038, 0.05, (HANG[0] + dx, HANG[1] + dy, HANG[2] - 0.062), CINNAMON, axis="Z", steps=10, bevel=0.0005) for i, (dx, dy) in enumerate(((0.005, 0.003), (-0.004, -0.003)))]
sticks[0].rotation_euler = (0.2, 0.3, 0)
sticks[1].rotation_euler = (-0.2, -0.22, 0)
pouch = part("pouch", [cord, sack, tie, *sticks], pivot=HANG, crease=180)

marker("muzzle", (0, 0.485, AXIS))
marker("left", (0, 0.28, -0.012))
kit.drop_cutters()

if len(args) > 1:
    # as the shooter sees it from the hip, and from the side
    kit.preview(os.path.join(args[1], "cramar-fp.png"), eye=(-0.14, -0.36, 0.15), target=(-0.14, 1.0, 0.15), lens=17.5)
    kit.preview(os.path.join(args[1], "cramar-side.png"), eye=(-0.62, 0.16, 0.16), target=(0, 0.09, 0.02), lens=50)
    kit.preview(os.path.join(args[1], "cramar-front.png"), eye=(0.42, 0.62, 0.20), target=(0, 0.12, 0.02), lens=50)
kit.export(args[0])
