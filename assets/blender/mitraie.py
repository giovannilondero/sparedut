"""
La Mitraie de Postazion: the turret's heavy machine gun, seen from behind its spade grips.
A riveted receiver with its top cover and brass feed block, the perforated jacket ending in
a flared muzzle, the cloth belt coming in from the right, the thumb trigger between the grips.

    blender -b --python assets/blender/mitraie.py -- <out.glb> [preview-folder]

Nothing on it moves: the game reads the node `body` and the points `muzzle` and `left` (the
left hand's grip). The origin is the right-hand grip, so the gun itself sits to its left.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
import kit
from kit import box, cut, lathe, marker, material, part, slab, tube
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

# on screen a metal is only what it reflects: none of these is as dark as the real thing
STEEL = material("gun-steel", (0.23, 0.245, 0.27), metallic=1.0, roughness=0.4)
SHROUD = material("jacket-steel", (0.33, 0.34, 0.355), metallic=1.0, roughness=0.42)
WORN = material("worn-steel", (0.46, 0.47, 0.48), metallic=1.0, roughness=0.3)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
BULLET = material("bullet-copper", (0.80, 0.42, 0.26), metallic=1.0, roughness=0.35)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
CLOTH = material("hessian", (0.72, 0.66, 0.50), roughness=0.95, texture="hessian", scale=14.0)
DARK = material("shadow", (0.025, 0.025, 0.03), roughness=1.0)

CX = -0.09  # the gun's centre line: the right-hand grip, the origin, is 9 cm to its right
AXIS = 0.06  # height of the barrel's axis above the grips' middle
JACKET = 0.055  # the jacket's radius


def light(o, segments=1):
    """Small parts do not need three segments on every rounded edge."""
    for m in o.modifiers:
        if m.type == "BEVEL":
            m.segments = segments
    return o


def aim(o, normal):
    """Turns an object built along +Y so that it points along `normal`."""
    o.rotation_euler = Vector((0, 1, 0)).rotation_difference(Vector(normal).normalized()).to_euler()
    return o


def stud(name, r, h, at, normal, mat, steps=7):
    """A domed rivet head sitting on a surface at `at`."""
    return aim(lathe(name, [(r, -h * 0.2), (r, 0), (r * 0.85, h * 0.55), (r * 0.45, h * 0.92), (0, h)], at, mat, steps=steps), normal)


def cartridge(name, at):
    """A rifle cartridge pointing along +Y from its base at `at`."""
    case = lathe(f"{name}-case", [(0, 0), (0.0060, 0), (0.0060, 0.0012), (0.0051, 0.0017), (0.0051, 0.0027), (0.0058, 0.0032), (0.0056, 0.030), (0.0041, 0.035), (0.0041, 0.040)], at, BRASS, steps=10)
    bullet = lathe(f"{name}-bullet", [(0.0039, 0.0395), (0.0038, 0.044), (0.0029, 0.0475), (0.0013, 0.0505), (0, 0.051)], at, BULLET, steps=10)
    # the belt is two layers of cloth stitched between the rounds: each sits in its pocket
    pocket = lathe(f"{name}-pocket", [(0.0056, 0.0075), (0.0067, 0.0082), (0.0067, 0.0328), (0.0056, 0.0335)], at, CLOTH, steps=10)
    return [case, bullet, pocket]


def strip(name, line, thickness, y0, y1, mat):
    """A band of cloth following `line`, a list of (x, z), and reaching from y0 to y1."""
    verts, faces = [], []
    n = len(line)
    for i, (x, z) in enumerate(line):
        xa, za = line[max(i - 1, 0)]
        xb, zb = line[min(i + 1, n - 1)]
        d = Vector((xb - xa, zb - za)).normalized()
        nx, nz = -d.y * thickness / 2, d.x * thickness / 2
        verts += [(x + nx, y0, z + nz), (x - nx, y0, z - nz), (x - nx, y1, z - nz), (x + nx, y1, z + nz)]
    for i in range(n - 1):
        a, b = i * 4, i * 4 + 4
        faces += [(a + k, a + (k + 1) % 4, b + (k + 1) % 4, b + k) for k in range(4)]
    faces += [(3, 2, 1, 0), tuple(range((n - 1) * 4, n * 4))]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    return o


# --- the receiver: side plates riveted to the frame, the cover hinged on top ---------------------------
receiver = box("receiver", (0.100, 0.230, 0.088), (CX, 0.085, 0.044), STEEL, bevel=0.003)
cover = box("cover", (0.104, 0.158, 0.014), (CX, 0.049, 0.095), STEEL, bevel=0.003)
cover_rib = light(box("cover-rib", (0.030, 0.110, 0.003), (CX, 0.065, 0.1030), STEEL, bevel=0.0012))
hinge = tube("cover-hinge", 0.0055, 0.110, (CX - 0.055, 0.1265, 0.0975), WORN, axis="X", steps=14)
latch = light(box("cover-latch", (0.024, 0.014, 0.008), (CX, -0.024, 0.1055), WORN, bevel=0.002))
rivets = []
for s in (-1, 1):
    for z in (0.008, 0.080):
        rivets += [stud(f"rivet{s}{z}{i}", 0.0032, 0.002, (CX + s * 0.050, -0.015 + i * 0.04, z), (s, 0, 0), WORN) for i in range(6)]
    rivets += [stud(f"rivet{s}m{i}", 0.0032, 0.002, (CX + s * 0.050, y, 0.044), (s, 0, 0), WORN) for i, y in enumerate((-0.015, 0.185))]
spring = box("spring-cover", (0.017, 0.172, 0.034), (CX - 0.0575, 0.092, 0.046), STEEL, bevel=0.005)
spring_screw = light(lathe("spring-screw", [(0, -0.003), (0.006, -0.003), (0.007, -0.002), (0.007, 0.0)], (CX - 0.0575, 0.006, 0.046), WORN, steps=6, bevel=0.0005))
spring_studs = [stud(f"spring-stud{i}", 0.003, 0.002, (CX - 0.066, y, 0.046), (-1, 0, 0), WORN) for i, y in enumerate((0.03, 0.155))]

# the crank handle, on the right
crank_boss = lathe("crank-boss", [(0.013, 0), (0.013, 0.004), (0.009, 0.006), (0.009, 0.011), (0.0045, 0.012), (0, 0.012)], (CX + 0.050, 0.110, 0.050), WORN, axis="X", steps=18)
crank_arm = light(box("crank-arm", (0.006, 0.066, 0.013), (CX + 0.0585, 0.081, 0.046), STEEL, bevel=0.003, rot=(0.14, 0, 0)), 2)
crank_knob = lathe("crank-knob", [(0.004, 0), (0.004, 0.003), (0.0075, 0.006), (0.0085, 0.012), (0.0075, 0.018), (0.004, 0.021), (0, 0.0215)], (CX + 0.0615, 0.052, 0.042), WORN, axis="X", steps=16)

# the feed block, in brass, with the belt's way cut through it
feed = cut(box("feed-block", (0.116, 0.060, 0.034), (CX, 0.158, 0.103), BRASS, bevel=0.003), [box("feedway", (0.14, 0.052, 0.016), (CX, 0.158, 0.0965), None, bevel=0)])
feed_floor = box("feed-floor", (0.110, 0.050, 0.002), (CX, 0.158, 0.0895), DARK, bevel=0)
feed_screws = [light(lathe(f"feed-screw{i}", [(0, 0), (0.004, 0), (0.004, 0.0015), (0, 0.0015)], (CX + x, 0.158 + y, 0.1195), WORN, axis="Z", steps=10, bevel=0.0004)) for i, (x, y) in enumerate(((-0.046, -0.02), (-0.046, 0.02), (0.046, -0.02), (0.046, 0.02)))]

# the belt: in from the right, where it hangs down to the ammunition box; the empty end out to the left
WAY = 0.0965
path = [(CX - 0.020, WAY), (-0.030, WAY)] + [(-0.030 + 0.013 * math.sin(a), WAY - 0.013 + 0.013 * math.cos(a)) for a in (i * math.pi / 12 for i in range(1, 7))] + [(-0.017, z) for z in (0.06, 0.03, 0.0, -0.03, -0.06, -0.085)]
belt = strip("belt", path, 0.003, 0.140, 0.166, CLOTH)
rounds, along, at = [], 0.004, 0.0
for (xa, za), (xb, zb) in zip(path, path[1:]):
    seg = math.hypot(xb - xa, zb - za)
    while along < at + seg:
        k = (along - at) / seg
        rounds += cartridge(f"round{len(rounds)}", (xa + (xb - xa) * k, 0.1325, za + (zb - za) * k))
        along += 0.0147
    at += seg
empty = strip("belt-empty", [(CX + 0.030, WAY), (CX - 0.060, WAY), (CX - 0.068, WAY - 0.002), (CX - 0.078, WAY - 0.009), (CX - 0.084, WAY - 0.022), (CX - 0.086, WAY - 0.040)], 0.003, 0.140, 0.166, CLOTH)

# the sights: a ladder with its notch on the cover, a blade on a band at the far end of the jacket
sight_base = light(box("rear-sight-base", (0.032, 0.034, 0.006), (CX, 0.020, 0.105), STEEL, bevel=0.0015))
leaf = cut(light(box("rear-sight-leaf", (0.026, 0.003, 0.034), (CX, 0.010, 0.123), STEEL, bevel=0.0007)), [
    box("notch", (0.0036, 0.01, 0.007), (CX, 0.010, 0.1385), None, bevel=0),
    box("window", (0.013, 0.01, 0.015), (CX, 0.010, 0.1185), None, bevel=0),
])
slider = light(box("rear-sight-slider", (0.030, 0.006, 0.0045), (CX, 0.010, 0.1295), WORN, bevel=0.001))
sight_knob = lathe("rear-sight-knob", [(0.003, 0), (0.005, 0.001), (0.005, 0.005), (0.003, 0.006), (0, 0.006)], (CX + 0.016, 0.026, 0.106), WORN, axis="X", steps=12)
sight_band = light(lathe("front-sight-band", [(JACKET - 0.0005, 0), (JACKET + 0.0025, 0), (JACKET + 0.0025, 0.016), (JACKET - 0.0005, 0.016), (JACKET - 0.0005, 0)], (CX, 0.692, AXIS), STEEL, steps=48, bevel=0.0007))
blade = slab("front-sight", [(0.690, 0.116), (0.712, 0.116), (0.706, 0.140), (0.701, 0.140)], 0.0032, STEEL, bevel=0.0007, segments=1, at=(CX, 0, 0))

# --- the jacket, drilled all over, and what shows through the holes ---------------------------------------
shell = lathe("jacket", [(JACKET - 0.0026, 0), (JACKET, 0), (JACKET, 0.535), (JACKET - 0.0026, 0.535), (JACKET - 0.0026, 0)], (CX, 0.2, AXIS), SHROUD, steps=48)
holes = []
for i in range(7):
    for k in range(4):
        t = (k + 0.5 * (i % 2)) * math.pi / 4
        d = Vector((math.cos(t), 0, math.sin(t)))
        holes.append(aim(tube(f"hole{i}{k}", 0.0105, 0.14, tuple(Vector((CX, 0.285 + i * 0.066, AXIS)) - d * 0.07), None, steps=14, bevel=0), d))
cut(shell, holes)
liner = tube("jacket-liner", JACKET - 0.011, 0.53, (CX, 0.202, AXIS), DARK, steps=32, bevel=0)
gland = lathe("jacket-gland", [(0.030, 0), (0.0575, 0), (0.0588, 0.0015), (0.0588, 0.017), (0.0572, 0.019), (0.0572, 0.027), (0.0558, 0.029), (JACKET - 0.001, 0.029)], (CX, 0.196, AXIS), BRASS, steps=48)
gland_studs = [stud(f"gland-stud{i}", 0.003, 0.002, (CX + 0.0588 * math.cos(t), 0.205, AXIS + 0.0588 * math.sin(t)), (math.cos(t), 0, math.sin(t)), WORN) for i, t in enumerate(k * math.pi / 4 + 0.39 for k in range(8))]
front = lathe("jacket-cap", [(JACKET - 0.001, 0), (0.0572, 0.001), (0.0572, 0.017), (0.0555, 0.020), (0.049, 0.022), (0.044, 0.022), (0.042, 0.0245), (0.031, 0.0245), (0.029, 0.022), (0.026, 0.022), (0.026, 0.018)], (CX, 0.722, AXIS), SHROUD, steps=48)
muzzle_gland = lathe("muzzle-gland", [(0.020, 0), (0.0275, 0), (0.0285, 0.001), (0.0285, 0.010), (0.0265, 0.012), (0.020, 0.012)], (CX, 0.742, AXIS), BRASS, steps=32)
cone = lathe("flash-hider", [(0.0185, 0), (0.0195, 0.002), (0.0262, 0.090), (0.0272, 0.094), (0.0272, 0.097), (0.0245, 0.097), (0.0110, 0.020), (0.0110, 0.010)], (CX, 0.752, AXIS), STEEL, steps=32)
bore = tube("bore", 0.0112, 0.002, (CX, 0.768, AXIS), DARK, steps=16, bevel=0)

# --- the spade grips: a frame of flat bar across the back plate, the thumb trigger in the middle -----------------
GRIPS = -0.040  # where they stand, along the gun
plate = box("back-plate", (0.096, 0.007, 0.164), (CX, -0.0335, 0.020), STEEL, bevel=0.003)
plate_screws = [light(lathe(f"plate-screw{i}", [(0, -0.0015), (0.0042, -0.0015), (0.0042, 0)], (CX + x, -0.037, z), WORN, steps=10, bevel=0.0004)) for i, (x, z) in enumerate(((-0.038, 0.092), (0.038, 0.092), (-0.038, -0.030), (0.038, -0.030)))]
bars = [box(f"grip-bar{i}", (0.200, 0.011, 0.010), (CX, GRIPS, z), STEEL, bevel=0.003) for i, z in enumerate((-0.056, 0.056))]
grips = []
for i, x in enumerate((0.0, -0.18)):
    grips.append(lathe(f"grip{i}", [(0.0120, 0), (0.0148, 0.004), (0.0162, 0.018), (0.0170, 0.051), (0.0162, 0.084), (0.0148, 0.098), (0.0120, 0.102)], (x, GRIPS, -0.051), WOOD, axis="Z", steps=24))
    for j, z in enumerate((-0.051, 0.045)):
        grips.append(light(lathe(f"grip-ferrule{i}{j}", [(0.010, 0), (0.0156, 0), (0.0156, 0.006), (0.010, 0.006)], (x, GRIPS, z), WORN, axis="Z", steps=24, bevel=0.0006)))
    grips += [stud(f"grip-nut{i}{j}", 0.0048, 0.003, (x, GRIPS, s * 0.061), (0, 0, s), WORN, steps=6) for j, s in enumerate((-1, 1))]
trigger_stem = light(box("trigger-stem", (0.014, 0.016, 0.014), (CX, -0.043, 0.020), STEEL, bevel=0.002))
# a butterfly: one pad for each thumb
trigger = [light(box("trigger", (0.050, 0.005, 0.012), (CX, -0.0525, 0.020), BRASS, bevel=0.002))]
trigger += [lathe(f"trigger-pad{i}", [(0, -0.0045), (0.0105, -0.0045), (0.0135, -0.0028), (0.0135, 0.0005), (0.0115, 0.002), (0, 0.002)], (CX + x, -0.0525, 0.020), BRASS, steps=20) for i, x in enumerate((-0.026, 0.026))]
trigger_pin = tube("trigger-pin", 0.003, 0.030, (CX - 0.015, -0.049, 0.008), WORN, axis="X", steps=10, bevel=0)
safety = light(box("safety", (0.010, 0.010, 0.020), (CX, -0.041, -0.012), WORN, bevel=0.003, rot=(0.3, 0, 0)), 2)

# what it turns on, under the receiver
cradle = box("cradle", (0.052, 0.064, 0.030), (CX, 0.140, -0.013), STEEL, bevel=0.004)
pintle = tube("pintle", 0.008, 0.074, (CX - 0.037, 0.140, -0.014), WORN, axis="X", steps=16)

body = part("body", [receiver, cover, cover_rib, hinge, latch, *rivets, spring, spring_screw, *spring_studs, crank_boss, crank_arm, crank_knob, feed, feed_floor, *feed_screws, belt, *rounds, empty, sight_base, leaf, slider, sight_knob, sight_band, blade, shell, liner, gland, *gland_studs, front, muzzle_gland, cone, bore, plate, *plate_screws, *bars, *grips, trigger_stem, *trigger, trigger_pin, safety, cradle, pintle])

marker("muzzle", (CX, 0.85, AXIS))
marker("left", (-0.18, -0.06, 0.0))
kit.drop_cutters()

if len(args) > 1:
    # as the gunner sees it, from the hip and when aiming; then from the side and from the front
    kit.preview(os.path.join(args[1], "mitraie-fp.png"), eye=(-0.09, -0.34, 0.25), target=(-0.09, 1.0, 0.25), lens=17.5)
    kit.preview(os.path.join(args[1], "mitraie-aim.png"), eye=(0.0, -0.38, 0.175), target=(0.0, 1.0, 0.175), lens=17.5)
    kit.preview(os.path.join(args[1], "mitraie-side.png"), eye=(0.75, 0.33, 0.22), target=(CX, 0.33, 0.04), lens=40)
    kit.preview(os.path.join(args[1], "mitraie-rear.png"), eye=(-0.42, -0.42, 0.30), target=(CX, 0.10, 0.04), lens=50)
    kit.preview(os.path.join(args[1], "mitraie-front.png"), eye=(0.25, 1.15, 0.22), target=(CX, 0.45, 0.05), lens=50)
kit.export(args[0])
