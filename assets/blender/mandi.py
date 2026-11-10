"""
La Mandi: a 1930s Italian pocket pistol with an open-topped slide, a ring hammer, walnut
grips and brass furniture (muzzle collar, front sight, grip screws, butt collar and the
magazine's floorplate with its finger spur).

    blender -b --python assets/blender/mandi.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving parts `mag` (slides out along the raked
grip) and `slide` (runs back along the barrel), and the point `muzzle`.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import box, cut, lathe, marker, material, part, ribbon, slab, tube

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

STEEL = material("blued-steel", (0.20, 0.215, 0.24), metallic=1.0, roughness=0.38)
WORN = material("worn-steel", (0.34, 0.35, 0.36), metallic=1.0, roughness=0.30)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
WOOD = material("dark-walnut", (0.36, 0.19, 0.11), roughness=0.5, texture="walnut", scale=5.0)
COPPER = material("bullet", (0.80, 0.42, 0.26), metallic=1.0, roughness=0.35)

AXIS = 0.075  # height of the barrel's axis above the grip
RAKE = 0.28  # the grip leans back by this much
C, S = math.cos(RAKE), math.sin(RAKE)


def G(f, u):
    """A point of the raked grip (f forward, u up along the grip) in the weapon's (y, z)."""
    return (f * C + u * S, -f * S + u * C)


def raked(outline):
    return [G(f, u) for f, u in outline]


def curve(points, n=5):
    """A smooth line through `points` (Catmull-Rom), `n` steps between each pair."""
    out = []
    for i in range(len(points) - 1):
        p0, p1, p2, p3 = points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, len(points) - 1)]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return out + [points[-1]]


def regrain(o, mat, angle):
    """Turns the UVs of the faces of `mat` so the grain runs along the piece."""
    c, s = math.cos(angle), math.sin(angle)
    slot = o.data.materials.find(mat.name)
    uv = o.data.uv_layers[0].data
    for poly in o.data.polygons:
        if poly.material_index == slot:
            for li in poly.loop_indices:
                u, v = uv[li].uv
                uv[li].uv = (u * c - v * s, u * s + v * c)


def bar(name, section, y0, y1, mat, bevel=0.001, segments=2):
    """A cross-section, a list of (x, z), drawn out along the barrel from y0 to y1."""
    o = slab(name, [(-x, z) for x, z in section], y1 - y0, mat, bevel, segments, at=(0, (y0 + y1) / 2, 0))
    o.rotation_euler = (0, 0, math.pi / 2)
    return o


def stud(name, r, h, at, mat, side=1, steps=14):
    """A domed pin or screw head standing `h` proud of a side face (side: +1 right, -1 left)."""
    s = side
    return lathe(name, [(0, -0.001 * s), (r, -0.001 * s), (r, 0.45 * h * s), (0.7 * r, h * s), (0, h * s)], at, mat, axis="X", steps=steps)


def ring(name, inner, outer, half, at, mat, axis="X", steps=24, bevel=0.0005):
    return lathe(name, [(inner, -half), (outer, -half), (outer, half), (inner, half), (inner, -half)], at, mat, axis=axis, steps=steps, bevel=bevel)


# --- body ---------------------------------------------------------------------------------
# the frame in one piece: dust cover, the tang over the web of the hand, the raked grip
tang = curve([(-0.034, 0.0605), (-0.043, 0.0575), (-0.0515, 0.0515), (-0.0505, 0.0475), (-0.042, 0.043), (-0.031, 0.031), (-0.0235, 0.016), G(-0.0218, 0.0)], 4)
back = curve([G(-0.0218, 0.0), G(-0.0228, -0.020), G(-0.0226, -0.042), G(-0.0205, -0.066)], 4)
front = curve([G(0.0190, -0.066), G(0.0198, -0.030), G(0.0205, 0.0), (0.0240, 0.0125), (0.0262, 0.0250), (0.0310, 0.0318)], 4)
frame = slab("frame", [(0.137, 0.0605), *tang, *back[1:], *front, (0.058, 0.0335), (0.0635, 0.0385), (0.070, 0.0425), (0.134, 0.043), (0.139, 0.050)], 0.028, STEEL, bevel=0.0038)
collar = box("butt-collar", (0.036, 0.046, 0.008), (0, *G(-0.002, -0.068)), BRASS, bevel=0.002, rot=(-RAKE, 0, 0))
well = box("mag-well", (0.0225, 0.0305, 0.110), (0, *G(-0.002, -0.030)), None, bevel=0, rot=(-RAKE, 0, 0))
cut(frame, [well])
cut(collar, [well])

panels = [slab(f"grip-panel{i}", raked([(0.0170, 0.019), (0.0125, 0.0265), (-0.0140, 0.0265), (-0.0195, 0.019), (-0.0206, -0.020), (-0.0195, -0.061), (0.0155, -0.061), (0.0166, -0.020)]), 0.0048, WOOD, bevel=0.0024, segments=3, at=(x, 0, 0)) for i, x in enumerate((-0.0152, 0.0152))]
screws = []
for i, side in enumerate((-1, 1)):
    for j, u in enumerate((0.006, -0.046)):
        y, z = G(-0.002, u)
        screws.append(ring(f"escutcheon{i}{j}", 0.0, 0.0052, 0.0006, (side * 0.0176, y, z), BRASS, steps=20, bevel=0.0003))
        screws.append(stud(f"grip-screw{i}{j}", 0.0034, 0.0016, (side * 0.0180, y, z), WORN, side))

guard = ribbon("guard", curve([(0.0655, 0.042), (0.0705, 0.031), (0.0695, 0.018), (0.0625, 0.0075), (0.050, 0.0028), (0.037, 0.0026), (0.027, 0.0062), (0.0215, 0.0105)], 4), 0.003, 0.011, STEEL)
trigger = slab("trigger", [(0.040, 0.036), (0.047, 0.036), *curve([(0.0478, 0.030), (0.0482, 0.022), (0.0500, 0.0155), (0.0535, 0.0105)], 3), (0.0505, 0.0095), *curve([(0.0465, 0.0140), (0.0440, 0.0210), (0.0420, 0.0280)], 3)], 0.006, WORN, bevel=0.0012, segments=2)

# the barrel is fixed to the frame: the slide runs back over it
barrel = lathe("barrel", [(0, 0.004), (0.0078, 0.004), (0.0078, 0.178), (0.0070, 0.180), (0.0046, 0.180), (0.0046, 0.150), (0, 0.150)], (0, 0, AXIS), WORN, steps=28)
muzzle_collar = lathe("muzzle-collar", [(0.0078, 0.1556), (0.0112, 0.1556), (0.0122, 0.1566), (0.0122, 0.1612), (0.0112, 0.1622), (0.0078, 0.1622)], (0, 0, AXIS), BRASS, steps=32)
spring_plug = lathe("spring-plug", [(0.0042, 0), (0.0042, 0.0012), (0.003, 0.002), (0, 0.002)], (0, 0.1385, 0.052), WORN, steps=16)

hammer_ring = ring("hammer-ring", 0.0034, 0.0068, 0.003, (0, -0.0450, 0.0705), STEEL, bevel=0.0006)
hammer_neck = slab("hammer-neck", [(-0.0345, 0.048), (-0.0345, 0.070), (-0.0395, 0.0705), (-0.0425, 0.064), (-0.042, 0.050), (-0.039, 0.046)], 0.006, STEEL, bevel=0.001, segments=2)

# the lever on the left side, pins through the frame, the heel catch and the lanyard ring
lever = slab("safety-lever", [(0.072, 0.0570), (0.052, 0.0556), (0.047, 0.0575), (0.0440, 0.0570), (0.0440, 0.0515), (0.050, 0.0512), (0.072, 0.0500)], 0.0022, WORN, bevel=0.0008, segments=2, at=(-0.0150, 0, 0))
lever_pad = box("safety-pad", (0.0040, 0.0050, 0.0058), (-0.0160, 0.0465, 0.0545), WORN, bevel=0.0012)
lever_boss = stud("safety-boss", 0.0046, 0.0026, (-0.0140, 0.070, 0.0535), WORN, -1, steps=18)
pins = [stud(f"pin{i}", r, 0.0007, (side * 0.0140, y, z), WORN, side) for i, (side, y, z, r) in enumerate(((-1, 0.042, 0.047, 0.0022), (1, 0.042, 0.047, 0.0022), (-1, -0.036, 0.051, 0.003), (1, -0.036, 0.051, 0.003), (-1, 0.112, 0.052, 0.0022), (1, 0.112, 0.052, 0.0022), (1, 0.070, 0.0535, 0.003)))]
catch = box("heel-catch", (0.010, 0.005, 0.009), (0, *G(-0.0225, -0.060)), WORN, bevel=0.0012, rot=(-RAKE, 0, 0))
lanyard = ring("lanyard-ring", 0.0040, 0.0056, 0.0009, (-0.009, *G(-0.0265, -0.050)), WORN, steps=20, bevel=0.0003)

body = part("body", [frame, collar, *panels, *screws, guard, trigger, barrel, muzzle_collar, spring_plug, hammer_ring, hammer_neck, lever, lever_pad, lever_boss, *pins, catch, lanyard])

# --- slide (open on top, as on the Italian service pistols) ----------------------------------
section = [(-0.014, 0.061), (0.014, 0.061), (0.014, 0.080), (0.0115, 0.0865), (0.0060, 0.089), (-0.0060, 0.089), (-0.0115, 0.0865), (-0.014, 0.080)]
shell = bar("slide-shell", section, -0.035, 0.155, STEEL, bevel=0.0009)
cutters = [
    tube("bore", 0.0088, 0.170, (0, 0.004, AXIS), None, steps=28, bevel=0),
    box("window", (0.0125, 0.083, 0.02), (0, 0.0765, 0.088), None, bevel=0),
    box("hammer-slot", (0.0078, 0.040, 0.021), (0, -0.016, 0.0695), None, bevel=0),
]
for side in (-1, 1):
    cutters += [box(f"serration{side}{i}", (0.01, 0.0017, 0.018), (side * 0.0178, -0.0305 + i * 0.0034, 0.0755), None, bevel=0) for i in range(8)]
    cutters.append(box(f"rail{side}", (0.01, 0.176, 0.0012), (side * 0.0183, 0.060, 0.0637), None, bevel=0))
    # the long panel milled into each flank, ahead of the grasping grooves
    cutters.append(box(f"flute{side}", (0.01, 0.118, 0.0058), (side * 0.0182, 0.081, 0.0725), None, bevel=0))
cut(shell, cutters)
front_sight = slab("front-sight", [(0.139, 0.0885), (0.152, 0.0885), (0.151, 0.097), (0.146, 0.097)], 0.0032, BRASS, bevel=0.0005, segments=2)
rear_sight = cut(box("rear-sight", (0.015, 0.008, 0.0065), (0, -0.027, 0.0915), STEEL, bevel=0.0008), [box("notch", (0.0032, 0.02, 0.004), (0, -0.027, 0.0937), None, bevel=0)])
extractor = box("extractor", (0.0014, 0.030, 0.003), (0.0141, 0.016, 0.079), WORN, bevel=0.0005)
slide = part("slide", [shell, front_sight, rear_sight, extractor], pivot=(0, 0.06, AXIS))
regrain(body, WOOD, math.pi / 2 - RAKE)

# --- magazine ---------------------------------------------------------------------------------
MAG = G(-0.002, -0.072)
tube_ = box("mag-body", (0.0215, 0.0295, 0.0865), (0, *G(-0.002, -0.0288)), WORN, bevel=0.0028, rot=(-RAKE, 0, 0))
holes = []
for i in range(4):
    y, z = G(-0.006, -0.058 + i * 0.014)
    h = tube(f"witness{i}", 0.0017, 0.04, (-0.02, y, z), None, axis="X", steps=12, bevel=0)
    holes.append(h)
cut(tube_, holes)
floor = slab("mag-floor", raked([(-0.0215, -0.0722), (0.0200, -0.0722), (0.0300, -0.0770), (0.0335, -0.0815), (0.0300, -0.0835), (0.0190, -0.0800), (-0.0215, -0.0800)]), 0.030, BRASS, bevel=0.0016, segments=3)
y, z = G(-0.016, 0.0165)
case = lathe("cartridge", [(0, 0), (0.0044, 0), (0.0044, 0.017), (0.0041, 0.0175)], (0, y, z), BRASS, steps=16)
bullet = lathe("bullet", [(0.0041, 0.0175), (0.0039, 0.021), (0.0028, 0.0245), (0.0012, 0.0262), (0, 0.0265)], (0, y, z), COPPER, steps=16)
for o in (case, bullet):
    o.rotation_euler = (-RAKE, 0, 0)
mag = part("mag", [tube_, floor, case, bullet], pivot=(0, *MAG))

marker("muzzle", (0, 0.185, AXIS))
marker("trigger", (0, 0.049, 0.021))  # the face the trigger finger presses
kit.drop_cutters()
kit.export(args[0])

if len(args) > 1:
    out = args[1]
    kit.preview(os.path.join(out, "mandi-fp.png"), eye=(-0.13, -0.36, 0.13), target=(-0.13, 1.0, 0.13), lens=17.5)
    kit.preview(os.path.join(out, "mandi-side.png"), eye=(-0.34, 0.06, 0.06), target=(0, 0.05, 0.02), lens=50)
    kit.preview(os.path.join(out, "mandi-front.png"), eye=(0.20, 0.34, 0.14), target=(0, 0.06, 0.03), lens=50)
    # the parts as the animations move them: the slide back, the magazine half out
    slide.location.y -= 0.035
    mag.location.y -= 0.09 * S
    mag.location.z -= 0.09 * C
    kit.preview(os.path.join(out, "mandi-open.png"), eye=(-0.34, -0.30, 0.02), target=(0, 0.02, -0.03), lens=50)
