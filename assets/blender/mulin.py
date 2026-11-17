"""
Il Mulin: a hand-cranked six-barrel gun built around a mill's millstone. The stone, dressed
with its furrows and hooped in iron, is the breech; the barrels turn in front of it, the
mill's crank sticks out of the side and the belt comes up from a wooden box on the right.

    blender -b --python assets/blender/mulin.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving parts `spinner` (the barrel cluster, which
turns around its own axis: its origin is on it) and `mag` (the ammunition box with its belt),
and the points `muzzle` and `left` (the left hand).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import kit
from kit import box, cut, lathe, marker, material, part, ribbon, slab, tube
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()


def grained(name, color, roughness=0.55, scale=3.2):
    """
    A pale wood: the walnut's grain (its relief and its roughness) under a plain colour. A
    colour texture can only darken, and the exporter drops a tint above one.
    """
    m = material(name, color, roughness=roughness)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(nodes.new("ShaderNodeTexCoord").outputs["UV"], mapping.inputs["Vector"])

    def image(suffix):
        n = nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(kit.HERE, "tex", f"walnut_{suffix}.jpg"), check_existing=True)
        n.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    bump = nodes.new("ShaderNodeNormalMap")
    links.new(image("n").outputs["Color"], bump.inputs["Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(image("r").outputs["Color"], bsdf.inputs["Roughness"])
    return m


# on screen a metal is only what it reflects: none of these is as dark as the real thing
STEEL = material("gun-steel", (0.25, 0.265, 0.29), metallic=1.0, roughness=0.38)
IRON = material("forged-iron", (0.31, 0.30, 0.29), metallic=1.0, roughness=0.48)
WORN = material("worn-steel", (0.46, 0.47, 0.48), metallic=1.0, roughness=0.3)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
JACKET = material("bullet-copper", (0.80, 0.42, 0.26), metallic=1.0, roughness=0.35)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
DARK = material("dark-walnut", (0.27, 0.15, 0.09), roughness=0.55, texture="walnut", scale=3.2)
BEECH = grained("beech", (0.66, 0.47, 0.27))
STONE = material("millstone", (1.0, 0.96, 0.88), roughness=0.9, texture="mulin_stone", scale=7.0)
FURROW = material("millstone-furrow", (0.40, 0.37, 0.33), roughness=1.0, texture="mulin_stone", scale=7.0)
CANVAS = material("belt-canvas", (0.50, 0.44, 0.30), roughness=0.95)
BLACK = material("bore", (0.02, 0.02, 0.02), roughness=1.0)

AXIS = 0.07  # height of the barrels' axis above the grip
R = 0.085  # the millstone's radius


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


def stud(name, r, h, at, normal, mat, steps=8):
    """A domed rivet head sitting on a surface at `at`."""
    return aim(lathe(name, [(r, -h * 0.2), (r, 0), (r * 0.85, h * 0.55), (r * 0.45, h * 0.92), (0, h)], at, mat, steps=steps), normal)


def cartridge(name, at):
    """A rifle cartridge pointing along +Y from its base at `at`."""
    case = lathe(f"{name}-case", [(0, 0), (0.0058, 0), (0.0058, 0.0012), (0.0049, 0.0017), (0.0049, 0.0027), (0.0056, 0.0032), (0.0054, 0.026), (0.0040, 0.031), (0.0040, 0.036)], at, BRASS, steps=12)
    bullet = lathe(f"{name}-bullet", [(0.0038, 0.0355), (0.0037, 0.041), (0.0028, 0.046), (0.0012, 0.0495), (0, 0.050)], at, JACKET, steps=12)
    return [case, bullet]


# --- the millstone ------------------------------------------------------------------------
ST = (0, -0.08, AXIS)  # the centre of its rear face, the one the shooter looks at
stone = lathe("millstone", [(0.018, 0.012), (0.018, 0.0), (R - 0.003, 0.0), (R, 0.003), (R, 0.057), (R - 0.003, 0.06), (0.018, 0.06)], ST, STONE, steps=64, bevel=0.0007)
light(stone)

# The dressing: eight harps, each with a master furrow tangent to the eye and two shorter
# ones parallel to it, as on a real runner stone.
EYE = 0.0215
furrows, floors = [], []
for i in range(8):
    t = i * math.pi / 4
    d = Vector((math.cos(t), math.sin(t)))
    n = Vector((-d.y, d.x))
    for k in range(3):
        o = EYE + k * 0.021
        s0 = max(o - EYE * math.sqrt(2), 0.0) + (0.004 if k else 0.012)
        s1 = math.sqrt(R * R - o * o)
        c = n * o + d * (s0 + s1 + 0.004) / 2
        furrows.append(box(f"furrow{i}{k}", (s1 + 0.004 - s0, 0.006, 0.0036), (c.x, ST[1], AXIS + c.y), None, bevel=0, rot=(0, -t, 0)))
        s1 = math.sqrt((R - 0.005) ** 2 - o * o)
        c = n * o + d * (s0 + s1) / 2
        floors.append(box(f"furrow-floor{i}{k}", (s1 - s0, 0.001, 0.0034), (c.x, ST[1] + 0.0025, AXIS + c.y), FURROW, bevel=0, rot=(0, -t, 0)))
cut(stone, furrows)

# iron hoops shrunk onto the rim, riveted
hoops, rivets = [], []
for j, a in enumerate((0.006, 0.043)):
    hoops.append(light(lathe(f"hoop{j}", [(R - 0.001, 0), (R + 0.0022, 0), (R + 0.0022, 0.011), (R - 0.001, 0.011), (R - 0.001, 0)], (ST[0], ST[1] + a, ST[2]), IRON, steps=64, bevel=0.0006)))
    for i in range(10):
        t = (i + 0.5 * j) * math.pi / 5 + 0.2
        rivets.append(stud(f"hoop-rivet{j}{i}", 0.0028, 0.0018, ((R + 0.0022) * math.cos(t), ST[1] + a + 0.0055, AXIS + (R + 0.0022) * math.sin(t)), (math.cos(t), 0, math.sin(t)), WORN))

# the rynd: the iron plate in the eye, with the end of the axle and its nut
rynd = light(lathe("rynd", [(0, -0.0035), (0.0235, -0.0035), (0.0255, -0.0018), (0.0255, 0.002)], ST, IRON, steps=32, bevel=0.0005))
rynd_rivets = [stud(f"rynd-rivet{i}", 0.0026, 0.0016, (0.0185 * math.cos(i * math.pi / 2 + 0.785), ST[1] - 0.0035, AXIS + 0.0185 * math.sin(i * math.pi / 2 + 0.785)), (0, -1, 0), WORN) for i in range(4)]
nut = lathe("axle-nut", [(0, -0.0105), (0.0085, -0.0105), (0.0095, -0.0095), (0.0095, -0.003)], ST, WORN, steps=6, bevel=0.0005)
axle_end = light(lathe("axle-end", [(0, -0.0145), (0.0038, -0.0145), (0.0046, -0.0135), (0.0046, -0.010)], ST, STEEL, steps=14, bevel=0.0003))
strap = light(box("stone-strap", (0.016, 0.003, 0.050), (0, ST[1] - 0.0012, 0.022), IRON, bevel=0.0008))
strap_rivets = [stud(f"strap-rivet{i}", 0.0028, 0.0018, (0, ST[1] - 0.0027, z), (0, -1, 0), WORN) for i, z in enumerate((0.012, 0.035))]

# what the barrels turn against, and the feed on its right-hand side
breech = light(lathe("breech-plate", [(0.018, 0), (0.054, 0), (0.054, 0.010), (0.050, 0.013), (0.024, 0.013)], (0, -0.02, AXIS), STEEL, steps=48, bevel=0.0006))
feed = box("feed-block", (0.026, 0.056, 0.032), (0.061, 0.004, 0.080), STEEL, bevel=0.002)
feed_cover = light(box("feed-cover", (0.028, 0.050, 0.003), (0.061, 0.004, 0.0972), BRASS, bevel=0.001))
feed_knob = lathe("feed-knob", [(0.004, 0), (0.0055, 0.001), (0.0055, 0.004), (0.003, 0.0055), (0, 0.0055)], (0.061, 0.016, 0.0985), WORN, axis="Z", steps=12)
feed_lip = light(box("feed-lip", (0.022, 0.050, 0.0025), (0.061, 0.004, 0.0635), BRASS, bevel=0.0008))

# --- the bed, the grip, the frame under the barrels ---------------------------------------------
bed = slab("bed", [(-0.100, 0.030), (-0.100, 0.012), (-0.094, 0.004), (0.094, 0.004), (0.100, 0.008), (0.100, 0.017), (0.054, 0.017), (0.050, 0.0225), (-0.010, 0.0225), (-0.014, 0.030)], 0.066, WOOD, bevel=0.004, segments=3)
bed_cap = light(box("bed-cap", (0.068, 0.004, 0.0135), (0, 0.1015, 0.0106), STEEL, bevel=0.001))
bed_bolts = [stud(f"bed-bolt{i}", 0.0032, 0.002, (s * 0.0332, y, 0.014), (s, 0, 0), WORN) for i, (s, y) in enumerate(((-1, -0.086), (-1, 0.086), (1, -0.086), (1, 0.086)))]

grip = slab("grip", [(0.018, 0.010), (-0.022, 0.010), (-0.027, -0.012), (-0.038, -0.078), (-0.033, -0.090), (-0.004, -0.093), (0.003, -0.082), (0.011, -0.022)], 0.031, WOOD, bevel=0.009)
grip_screws = [light(lathe(f"grip-screw{i}", [(0, 0), (0.0045, 0), (0.0045, 0.0012), (0, 0.0012)], (s * 0.0153 - (0.0012 if s < 0 else 0), -0.019, -0.055), BRASS, axis="X", steps=12, bevel=0.0004)) for i, s in enumerate((-1, 1))]
guard = ribbon("guard", [(0.078, 0.006), (0.079, -0.006), (0.070, -0.018), (0.040, -0.021), (0.022, -0.016), (0.014, 0.004)], 0.0028, 0.013, STEEL)
trigger = light(box("trigger", (0.006, 0.007, 0.022), (0, 0.044, -0.004), WORN, bevel=0.002, rot=(0.35, 0, 0)))

rail = box("rail", (0.018, 0.215, 0.010), (0, 0.19, 0.0105), STEEL, bevel=0.0015)
yoke = light(lathe("yoke", [(0.0478, 0), (0.0548, 0), (0.0548, 0.012), (0.0478, 0.012), (0.0478, 0)], (0, 0.262, AXIS), STEEL, steps=48, bevel=0.0008))
yoke_foot = light(box("yoke-foot", (0.032, 0.016, 0.008), (0, 0.268, 0.0175), STEEL, bevel=0.0015))
fore = lathe("fore-grip", [(0, 0), (0.010, 0), (0.0145, 0.004), (0.0158, 0.013), (0.0140, 0.050), (0.0150, 0.084), (0.0165, 0.096), (0.0165, 0.1055)], (0, 0.26, -0.10), BEECH, axis="Z", steps=24)
ferrule = light(lathe("fore-grip-ferrule", [(0.012, 0), (0.0178, 0), (0.0178, 0.0115), (0.012, 0.0115)], (0, 0.26, -0.006), BRASS, axis="Z", steps=24, bevel=0.0006))
fore_bolt = stud("fore-grip-bolt", 0.004, 0.002, (0, 0.26, -0.10), (0, 0, -1), WORN)

# --- the handle over the stone and the sight -------------------------------------------------------
posts, feet = [], []
for i, s in enumerate((-1, 1)):
    top = AXIS + math.sqrt(R * R - 0.04 * 0.04)
    lean = math.asin(0.04 / R)
    posts.append(tube(f"handle-post{i}", 0.0042, 0.172 - top + 0.004, (s * 0.04, -0.05, top - 0.004), IRON, axis="Z", steps=12, bevel=0))
    feet.append(light(box(f"handle-foot{i}", (0.020, 0.024, 0.003), (s * (0.04 + 0.0015 * math.sin(lean)), -0.05, top + 0.0015 * math.cos(lean)), IRON, bevel=0.0008, rot=(0, s * lean, 0))))
bar = tube("handle-bar", 0.0042, 0.104, (-0.052, -0.05, 0.170), IRON, axis="X", steps=12, bevel=0.0006)
sleeve = lathe("handle-sleeve", [(0.0042, 0), (0.0078, 0.0015), (0.0090, 0.012), (0.0094, 0.032), (0.0090, 0.052), (0.0078, 0.0625), (0.0042, 0.064)], (-0.032, -0.05, 0.170), BEECH, axis="X", steps=20)
rib = ribbon("sight-rib", [(-0.031, 0.1535), (-0.022, 0.166), (-0.006, 0.172), (0.052, 0.174)], 0.003, 0.009, IRON)
rib_rivet = stud("rib-rivet", 0.0026, 0.0016, (0, -0.0305, 0.1575), (0, -0.5, 0.86), WORN)
post = tube("sight-post", 0.0016, 0.017, (0, 0.047, 0.174), BRASS, axis="Z", steps=8, bevel=0)
bead = lathe("sight-bead", [(0, 0), (0.0022, 0.0008), (0.003, 0.003), (0.0022, 0.0052), (0, 0.006)], (0, 0.047, 0.189), BRASS, axis="Z", steps=10)

# --- the mill's crank, on the right -------------------------------------------------------------------
HANDLE = (-0.063, 0.033)  # (y, z) of the handle, a crank's throw away from the shaft
boss = lathe("crank-boss", [(0.014, 0), (0.014, 0.004), (0.009, 0.006), (0.009, 0.012), (0.0046, 0.012), (0.0046, 0.031), (0, 0.031)], (R - 0.002, -0.05, AXIS), IRON, axis="X", steps=20)
arm = light(box("crank-arm", (0.005, 0.013, 0.054), (0.1095, (HANDLE[0] - 0.05) / 2, (HANDLE[1] + AXIS) / 2), IRON, bevel=0.002, rot=(-math.atan2(-0.05 - HANDLE[0], AXIS - HANDLE[1]), 0, 0)), 2)
knob = lathe("crank-handle", [(0.0042, 0), (0.0042, 0.003), (0.0076, 0.005), (0.0088, 0.020), (0.0078, 0.040), (0.0060, 0.044), (0, 0.045)], (0.112, HANDLE[0], HANDLE[1]), BEECH, axis="X", steps=18)
knob_pin = stud("crank-pin", 0.0036, 0.002, (0.107, HANDLE[0], HANDLE[1]), (-1, 0, 0), WORN)

body = part("body", [stone, *floors, *hoops, *rivets, rynd, *rynd_rivets, nut, axle_end, strap, *strap_rivets, breech, feed, feed_cover, feed_knob, feed_lip, bed, bed_cap, *bed_bolts, grip, *grip_screws, guard, trigger, rail, yoke, yoke_foot, fore, ferrule, fore_bolt, *posts, *feet, bar, sleeve, rib, rib_rivet, post, bead, boss, arm, knob, knob_pin])

# --- the barrel cluster: everything here is centred on the axis it turns around ----------------------
carrier = light(lathe("barrel-carrier", [(0.010, 0), (0.046, 0), (0.046, 0.008), (0.043, 0.010), (0.0225, 0.010), (0.0225, 0.068)], (0, -0.005, AXIS), STEEL, steps=48, bevel=0.0006))
barrels = []
for i in range(6):
    t = i * math.pi / 3
    at = (0.034 * math.cos(t), -0.005, AXIS + 0.034 * math.sin(t))
    barrels.append(lathe(f"barrel{i}", [(0.011, 0.004), (0.011, 0.085), (0.0102, 0.090), (0.0102, 0.5395), (0.0109, 0.5405), (0.0109, 0.5485), (0.0100, 0.550), (0.0056, 0.550), (0.0056, 0.534)], at, STEEL, steps=18))
    barrels.append(tube(f"bore{i}", 0.0056, 0.002, (at[0], at[1] + 0.533, at[2]), BLACK, steps=10, bevel=0))
plates = []
for i, y in enumerate((0.07, 0.30, 0.52)):
    hole = 0.0225 if i < 2 else 0.007
    plates.append(lathe(f"plate{i}", [(hole, 0), (0.048, 0), (0.050, 0.002), (0.050, 0.0054), (0.0488, 0.0062), (0.0488, 0.0078), (0.050, 0.0086), (0.050, 0.012), (0.048, 0.014), (hole, 0.014)], (0, y - 0.007, AXIS), BRASS, steps=48))
shaft = tube("shaft", 0.008, 0.49, (0, 0.06, AXIS), STEEL, steps=14, bevel=0)
cap = lathe("shaft-nut", [(0.013, 0), (0.013, 0.006), (0.0105, 0.008), (0.0105, 0.013), (0.008, 0.021), (0.004, 0.026), (0, 0.027)], (0, 0.527, AXIS), BRASS, steps=6, bevel=0.0005)
spinner = part("spinner", [carrier, *barrels, *plates, shaft, cap], pivot=(0, 0.1, AXIS))

# --- the ammunition box, with the belt that climbs into the feed ---------------------------------------
BELT = 0.061
chest = box("ammo-box", (0.050, 0.120, 0.068), (BELT, 0, -0.008), DARK, bevel=0.003)
lid = box("ammo-lid", (0.053, 0.123, 0.012), (BELT, 0, 0.032), DARK, bevel=0.003)
bands = [light(box(f"ammo-band{i}", (0.0518, 0.012, 0.0695), (BELT, y, -0.008), BRASS, bevel=0.0008)) for i, y in enumerate((-0.044, 0.044))]
latch = light(box("ammo-latch", (0.003, 0.016, 0.022), (BELT + 0.0268, 0, 0.022), BRASS, bevel=0.001))
latch_stud = stud("ammo-latch-stud", 0.003, 0.002, (BELT + 0.0283, 0, 0.016), (1, 0, 0), WORN)
slot = box("ammo-slot", (0.016, 0.062, 0.001), (BELT, 0.004, 0.0381), BLACK, bevel=0)
belt = light(box("belt", (0.0026, 0.026, 0.056), (BELT, 0.004, 0.058), CANVAS, bevel=0.0008))
rounds = [o for i in range(4) for o in cartridge(f"round{i}", (BELT, -0.021, 0.044 + i * 0.0125))]
mag = part("mag", [chest, lid, *bands, latch, latch_stud, slot, belt, *rounds], pivot=(0.06, 0, 0))

# at the barrels' mouths (the primitive model has it 10 cm short of them)
marker("muzzle", (0, 0.548, AXIS))
marker("left", (0, 0.26, -0.06))
kit.drop_cutters()

if len(args) > 1:
    # as the shooter sees it from the hip, from the side, and the two ends
    kit.preview(os.path.join(args[1], "mulin-fp.png"), eye=(-0.15, -0.38, 0.20), target=(-0.15, 1.0, 0.20), lens=17.5)
    kit.preview(os.path.join(args[1], "mulin-side.png"), eye=(-0.85, 0.20, 0.18), target=(0, 0.20, 0.04), lens=50)
    kit.preview(os.path.join(args[1], "mulin-rear.png"), eye=(0.30, -0.42, 0.22), target=(0.02, 0.0, 0.05), lens=50)
    kit.preview(os.path.join(args[1], "mulin-front.png"), eye=(0.45, 0.80, 0.26), target=(0.02, 0.22, 0.05), lens=50)
kit.export(args[0])
