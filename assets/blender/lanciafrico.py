"""
Il Lanciafrico: a shoulder launcher beaten out of copper. The tube is a rolled sheet with a
riveted seam, its mouth is the cjaldîr (the polenta cauldron, bail handle and all), the
round it throws is a frico, and the wooden spoon is tied to the tube, just in case.

    blender -b --python assets/blender/lanciafrico.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving part `frico` (the round sitting in the
cauldron's mouth: its origin is its centre) and the points `muzzle` and `left` (the left hand).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
import kit
import numpy as np
from kit import box, cut, lathe, marker, material, part, ribbon, slab
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

TEX = os.path.join(kit.HERE, "tex")


# --- textures made here: a hammered relief for the copper, and the frico's crust ----------------

def save(path, rgb):
    """Writes an array of rows of (r, g, b) in 0..1, bottom row first, as a JPEG."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new("generated", w, h, alpha=False)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "JPEG"
    img.save(quality=88)
    bpy.data.images.remove(img)


def relief(height, strength):
    """The normal map of a tiling height field."""
    size = height.shape[0]
    du = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * size / 2
    dv = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * size / 2
    n = np.dstack([-du * strength, -dv * strength, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def hammered(path, size=512, dents=260):
    """Planished copper: every hammer blow leaves a shallow bowl, with a ridge where two meet."""
    rng = np.random.default_rng(3)
    v, u = np.mgrid[0:size, 0:size] / size
    h = np.full((size, size), 9.0)
    for cu, cv in rng.random((dents, 2)):
        du = np.abs(u - cu)
        dv = np.abs(v - cv)
        h = np.minimum(h, np.minimum(du, 1 - du) ** 2 + np.minimum(dv, 1 - dv) ** 2)
    save(path, relief(h, 1.9))


def value_noise(rng, size, cells):
    """Smooth tiling noise in 0..1 with `cells` lumps across."""
    g = rng.random((cells, cells))
    x = np.arange(size) * cells / size
    i = x.astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    j = (i + 1) % cells
    rows = g[:, i] * (1 - f) + g[:, j] * f
    return rows[i, :] * (1 - f)[:, None] + rows[j, :] * f[:, None]


def frico_maps(colour, normal, size=512):
    """A frico seen from above: gold where the cheese melted, brown where it caught, a crisp darker edge."""
    rng = np.random.default_rng(11)
    blotch = sum(value_noise(rng, size, c) * a for c, a in ((3, 0.4), (6, 0.3), (12, 0.2), (24, 0.1)))
    fine = sum(value_noise(rng, size, c) * a for c, a in ((24, 0.5), (48, 0.3), (96, 0.2)))
    speck = value_noise(rng, size, 36) * 0.6 + value_noise(rng, size, 80) * 0.4
    v, u = np.mgrid[0:size, 0:size] / size - 0.5
    r = np.hypot(u, v) / 0.46  # 1 at the rim (see the frico's UVs)
    toast = np.clip((blotch - 0.5) * 2.6 + 0.30 + 0.5 * r ** 5, 0, 1)
    toast = toast * toast * (3 - 2 * toast)
    gold, brown, deep, cream = (np.array(c) for c in ((1.0, 0.74, 0.26), (0.74, 0.41, 0.12), (0.42, 0.20, 0.07), (1.0, 0.90, 0.56)))
    c = gold + (brown - gold) * toast[..., None]
    # bubbles of cheese that stayed pale, and specks that caught
    pale = np.clip((fine - 0.60) * 7, 0, 1) * (1 - toast)
    c += (cream - c) * pale[..., None] * 0.7
    caught = np.clip((speck - 0.64) * 8, 0, 1) * np.clip(toast * 1.5, 0, 1)
    c += (deep - c) * caught[..., None] * 0.75
    c += (deep - c) * np.clip((r - 0.93) * 7, 0, 1)[..., None] * 0.8
    c *= 0.92 + 0.16 * fine[..., None]
    save(colour, c)
    save(normal, relief(blotch * 0.010 + fine * 0.006 + speck * 0.003, 3.0))


if not os.path.exists(os.path.join(TEX, "lanciafrico_copper_n.jpg")):
    hammered(os.path.join(TEX, "lanciafrico_copper_n.jpg"))
if not os.path.exists(os.path.join(TEX, "lanciafrico_frico_d.jpg")):
    frico_maps(os.path.join(TEX, "lanciafrico_frico_d.jpg"), os.path.join(TEX, "lanciafrico_frico_n.jpg"))


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
        n.image = bpy.data.images.load(os.path.join(TEX, f"walnut_{suffix}.jpg"), check_existing=True)
        n.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    bump = nodes.new("ShaderNodeNormalMap")
    links.new(image("n").outputs["Color"], bump.inputs["Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(image("r").outputs["Color"], bsdf.inputs["Roughness"])
    return m


# on screen a metal is only what it reflects: none of these is as dark as the real thing
COPPER = material("copper", (0.86, 0.47, 0.31), metallic=1.0, roughness=0.34, texture="lanciafrico_copper", scale=9.0)
PLAIN = material("copper-fittings", (0.62, 0.31, 0.20), metallic=1.0, roughness=0.42)
INSIDE = material("copper-inside", (0.50, 0.27, 0.19), metallic=1.0, roughness=0.5)
STEEL = material("gun-steel", (0.25, 0.265, 0.29), metallic=1.0, roughness=0.38)
IRON = material("forged-iron", (0.31, 0.30, 0.29), metallic=1.0, roughness=0.48)
WORN = material("worn-steel", (0.46, 0.47, 0.48), metallic=1.0, roughness=0.3)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
BEECH = grained("beech", (0.68, 0.49, 0.28))
LEATHER = material("leather", (0.80, 0.62, 0.50), roughness=0.7, texture="lanciafrico_leather", scale=7.0)
ROPE = material("rope", (0.55, 0.45, 0.28), roughness=1.0)
FRICO = material("frico", (1.0, 1.0, 1.0), roughness=0.62, texture="lanciafrico_frico", scale=1.0)

AXIS = 0.10  # height of the tube's axis above the grip
TUBE = 0.05  # its radius


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


def hoop(name, r, a, at, mat, steps=20, sides=8, axis="Y"):
    """A ring of round section `a`, of radius `r`, around `axis`."""
    circle = [(r + a * math.cos(i * 2 * math.pi / sides), a * math.sin(i * 2 * math.pi / sides)) for i in range(sides + 1)]
    return lathe(name, circle, at, mat, axis=axis, steps=steps)


def pipe(name, points, r, mat, sides=6, closed=False):
    """A round rod (or a rope) following `points`."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    verts, faces, u = [], [], None
    for i, p in enumerate(pts):
        a = pts[i - 1] if closed or i > 0 else p
        b = pts[(i + 1) % n] if closed or i < n - 1 else p
        t = (b - a).normalized()
        u = (u - t * u.dot(t)).normalized() if u else t.orthogonal().normalized()
        v = t.cross(u)
        verts += [p + (u * math.cos(k * 2 * math.pi / sides) + v * math.sin(k * 2 * math.pi / sides)) * r for k in range(sides)]
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        faces += [(i * sides + k, i * sides + (k + 1) % sides, j * sides + (k + 1) % sides, j * sides + k) for k in range(sides)]
    if not closed:
        faces += [tuple(reversed(range(sides))), tuple(range((n - 1) * sides, n * sides))]
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


def wrap_uv(o, mats, radius):
    """
    Rolls the UVs of the copper around the tube's axis (the seam underneath), in metres like
    the rest: projected flat, the hammer marks would stretch down the sides.
    """
    me = o.data
    uv = me.uv_layers[0]
    wanted = {i for i, m in enumerate(me.materials) if m in mats}
    for poly in me.polygons:
        if poly.material_index not in wanted or abs(poly.normal.y) > 0.92:
            continue
        cos = [me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices]
        angles = [math.atan2(c.x, c.z - AXIS) for c in cos]
        if max(angles) - min(angles) > math.pi:
            angles = [a + 2 * math.pi if a < 0 else a for a in angles]
        for li, a, c in zip(poly.loop_indices, angles, cos):
            uv.data[li].uv = (a * radius, c.y)


# --- the tube: a rolled sheet, its seam riveted along the top, hooped and capped -------------------
barrel = lathe("tube", [(TUBE - 0.004, 0), (TUBE, 0), (TUBE, 0.5), (TUBE - 0.004, 0.5)], (0, -0.18, AXIS), COPPER, steps=48)
seam = light(box("seam", (0.013, 0.468, 0.0018), (0, 0.066, AXIS + TUBE + 0.0004), COPPER, bevel=0.0006))
seam_rivets = [stud(f"seam-rivet{i}", 0.0031, 0.0019, (0, -0.13 + i * 0.04, AXIS + TUBE + 0.0013), (0, 0, 1), PLAIN) for i in range(11)]
band = [(TUBE - 0.001, 0), (TUBE + 0.0028, 0), (TUBE + 0.0038, 0.0018), (TUBE + 0.0038, 0.0102), (TUBE + 0.0028, 0.012), (TUBE - 0.001, 0.012)]
bands = [lathe(f"band{i}", band, (0, y - 0.006, AXIS), PLAIN, steps=48) for i, y in enumerate((-0.15, 0.05, 0.25))]
collar = lathe("collar", [(TUBE - 0.001, 0), (TUBE + 0.003, 0), (TUBE + 0.004, 0.002), (TUBE + 0.004, 0.015), (TUBE + 0.0065, 0.019), (TUBE - 0.001, 0.019)], (0, 0.303, AXIS), PLAIN, steps=48)
collar_rivets = [stud(f"collar-rivet{i}", 0.003, 0.0018, ((TUBE + 0.004) * math.cos(t), 0.311, AXIS + (TUBE + 0.004) * math.sin(t)), (math.cos(t), 0, math.sin(t)), COPPER) for i, t in enumerate(k * math.pi / 5 + 0.3 for k in range(10))]
cap = lathe("end-cap", [(0, 0.0025), (0.028, 0.0025), (0.031, 0.0), (0.0475, 0.0), (0.0535, 0.004), (0.0535, 0.017), (0.0518, 0.019), (TUBE - 0.001, 0.019)], (0, -0.193, AXIS), PLAIN, steps=48)
cap_rivets = [stud(f"cap-rivet{i}", 0.003, 0.0018, (0.0535 * math.cos(t), -0.182, AXIS + 0.0535 * math.sin(t)), (math.cos(t), 0, math.sin(t)), COPPER) for i, t in enumerate(k * math.pi / 4 + 0.39 for k in range(8))]

# the leather pad that goes against the shoulder
board = box("pad-board", (0.078, 0.006, 0.090), (0, -0.196, AXIS), LEATHER, bevel=0.002)
cushion = box("pad-cushion", (0.069, 0.022, 0.081), (0, -0.208, AXIS), LEATHER, bevel=0.0105)
pad_studs = [stud(f"pad-stud{i}", 0.0034, 0.0022, (x * 0.0345, -0.199, AXIS + z * 0.0405), (0, -1, 0), BRASS) for i, (x, z) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1)))]

# --- sights, in brass --------------------------------------------------------------------------------
rear_base = light(box("rear-sight-base", (0.034, 0.016, 0.004), (0, -0.08, AXIS + TUBE + 0.0015), BRASS, bevel=0.0012))
rear_ears = [light(box(f"rear-sight-ear{i}", (0.004, 0.009, 0.028), (x, -0.08, 0.166), BRASS, bevel=0.0012)) for i, x in enumerate((-0.012, 0.012))]
rear_leaf = cut(light(box("rear-sight-leaf", (0.022, 0.003, 0.012), (0, -0.081, 0.1585), BRASS, bevel=0.0006)), [box("notch", (0.004, 0.01, 0.007), (0, -0.081, 0.164), None, bevel=0)])
front_base = light(box("front-sight-base", (0.012, 0.018, 0.004), (0, 0.28, AXIS + TUBE + 0.0015), BRASS, bevel=0.0012))
front_post = light(box("front-sight", (0.003, 0.006, 0.021), (0, 0.28, 0.1625), BRASS, bevel=0.0008))

# --- the trigger group and the two grips -----------------------------------------------------------------
housing = slab("housing", [(-0.030, 0.058), (-0.030, 0.020), (-0.022, 0.012), (0.080, 0.012), (0.086, 0.020), (0.086, 0.058)], 0.024, STEEL, bevel=0.003, segments=3)
pins = [light(lathe(f"pin{i}", [(0, 0), (0.003, 0), (0.003, 0.0012), (0, 0.0012)], (x, y, z), WORN, axis="X", steps=12, bevel=0.0004)) for i, (x, y, z) in enumerate(((-0.0132, 0.052, 0.028), (-0.0132, -0.014, 0.034), (0.012, 0.052, 0.028), (0.012, -0.014, 0.034)))]
grip = slab("grip", [(0.019, 0.014), (-0.023, 0.014), (-0.030, -0.012), (-0.043, -0.077), (-0.037, -0.090), (-0.007, -0.093), (0.000, -0.081), (0.010, -0.022)], 0.031, WOOD, bevel=0.009)
grip_screws = [light(lathe(f"grip-screw{i}", [(0, 0), (0.0045, 0), (0.0045, 0.0012), (0, 0.0012)], (s * 0.0153 - (0.0012 if s < 0 else 0), -0.022, -0.055), BRASS, axis="X", steps=12, bevel=0.0004)) for i, s in enumerate((-1, 1))]
guard = ribbon("guard", [(0.080, 0.014), (0.081, -0.004), (0.072, -0.016), (0.040, -0.019), (0.022, -0.014), (0.014, 0.010)], 0.0028, 0.013, STEEL)
trigger = light(box("trigger", (0.006, 0.007, 0.022), (0, 0.045, 0.0), WORN, bevel=0.002, rot=(0.35, 0, 0)))

clamp = lathe("fore-grip-clamp", [(TUBE - 0.001, 0), (TUBE + 0.003, 0), (TUBE + 0.003, 0.022), (TUBE - 0.001, 0.022)], (0, 0.189, AXIS), IRON, steps=48, bevel=0.0007)
light(clamp)
socket = light(lathe("fore-grip-socket", [(0.0125, 0), (0.0172, 0), (0.0172, 0.016), (0.0125, 0.016)], (0, 0.2, 0.036), BRASS, axis="Z", steps=24, bevel=0.0007))
fore = lathe("fore-grip", [(0, 0), (0.011, 0), (0.0146, 0.003), (0.0156, 0.012), (0.0138, 0.046), (0.0146, 0.076), (0.0156, 0.091), (0.0156, 0.096)], (0, 0.2, -0.055), WOOD, axis="Z", steps=24)
butt = lathe("fore-grip-cap", [(0, -0.0045), (0.011, -0.0045), (0.0162, -0.001), (0.0162, 0.004), (0.0148, 0.005)], (0, 0.2, -0.055), BRASS, axis="Z", steps=24)

# --- the cjaldîr ----------------------------------------------------------------------------------------
POT = 0.32  # where its bottom meets the tube
outside = [(TUBE - 0.001, -0.004), (TUBE, 0.0), (0.064, 0.008), (0.077, 0.022), (0.087, 0.040), (0.094, 0.060), (0.0975, 0.080), (0.098, 0.100), (0.0955, 0.118), (0.0905, 0.132), (0.088, 0.140), (0.0892, 0.146), (0.0915, 0.150)]
inside = [(0.0895, 0.150), (0.0872, 0.146), (0.086, 0.140), (0.0885, 0.132), (0.0935, 0.118), (0.096, 0.100), (0.0955, 0.080), (0.092, 0.060), (0.085, 0.040), (0.075, 0.023), (0.062, 0.010), (TUBE - 0.004, 0.003), (TUBE - 0.004, -0.06)]
pot = lathe("pot", outside, (0, POT, AXIS), COPPER, steps=56)
pot_inside = lathe("pot-inside", inside, (0, POT, AXIS), INSIDE, steps=56)
rim = hoop("pot-rim", 0.0907, 0.0038, (0, POT + 0.150, AXIS), PLAIN, steps=56)

EAR = 0.44  # where the bail hangs from, along the tube
BAIL = 0.1015  # its radius
LEAN = 0.12  # it lies back against the pot's shoulder
ears, bail_points = [], []
for i, s in enumerate((-1, 1)):
    ears.append(light(box(f"ear-plate{i}", (0.004, 0.024, 0.030), (s * 0.0965, EAR, AXIS), PLAIN, bevel=0.0015)))
    ears += [stud(f"ear-rivet{i}{k}", 0.0028, 0.0017, (s * 0.0985, EAR, AXIS + z), (s, 0, 0), COPPER) for k, z in enumerate((-0.010, 0.010))]
    ears.append(hoop(f"ear-eye{i}", 0.0052, 0.0021, (s * BAIL, EAR, AXIS), IRON, steps=14, sides=6, axis="Z"))
hook = [(BAIL + 0.0085, 0.0005), (BAIL + 0.0085, -0.006), (BAIL + 0.005, -0.0105), (BAIL + 0.001, -0.009), (BAIL, -0.004)]
arc = [(BAIL * math.cos(i * math.pi / 28), BAIL * math.sin(i * math.pi / 28)) for i in range(29)]
for x, up in hook + arc + [(-x, up) for x, up in reversed(hook)]:
    bail_points.append((x, EAR - up * math.sin(LEAN), AXIS + up * math.cos(LEAN)))
bail = pipe("bail", bail_points, 0.003, IRON, sides=8)

# --- the wooden spoon, tied on where the shooter can see it ------------------------------------------------
TOP = AXIS + TUBE
SPOON = math.radians(-52)  # how far round the tube from the top (negative: to the shooter's left)
handle = lathe("spoon-handle", [(0, 0), (0.0042, 0.001), (0.0056, 0.008), (0.0050, 0.10), (0.0044, 0.20), (0.0052, 0.226)], (0, -0.11, TOP + 0.0072), BEECH, steps=10)
handle.scale = (1, 1, 0.62)
bowl = lathe("spoon-bowl", [(0, 0), (0.010, 0.0008), (0.017, 0.004), (0.020, 0.009), (0.0205, 0.0115), (0.0193, 0.0118), (0.0172, 0.0078), (0.011, 0.0044), (0, 0.0032)], (0, 0.143, TOP + 0.0022), BEECH, axis="Z", steps=20)
bowl.scale = (0.85, 1.42, 1)
ties = []
for i, y in enumerate((-0.042, -0.0375, 0.098, 0.1025)):
    loop = [((0.0519 + 0.0108 * math.exp(-((t / 0.17) ** 2))), t) for t in (k * 2 * math.pi / 56 - math.pi for k in range(56))]
    ties.append(pipe(f"tie{i}", [(r * math.sin(t), y, AXIS + r * math.cos(t)) for r, t in loop], 0.0019, ROPE, sides=6, closed=True))
knots = [lathe(f"knot{i}", [(0, 0), (0.003, 0.0012), (0.0042, 0.004), (0.003, 0.0068), (0, 0.008)], (0.0535 * math.sin(0.42), y - 0.002, AXIS + 0.0535 * math.cos(0.42)), ROPE, steps=8) for i, y in enumerate((-0.0397, 0.1003))]
spoon = part("spoon", [handle, bowl, *ties, *knots])
spoon.data.transform(Matrix.Translation((0, 0, AXIS)) @ Matrix.Rotation(SPOON, 4, "Y") @ Matrix.Translation((0, 0, -AXIS)))

body = part("body", [barrel, seam, *seam_rivets, *bands, collar, *collar_rivets, cap, *cap_rivets, board, cushion, *pad_studs, rear_base, *rear_ears, rear_leaf, front_base, front_post, housing, *pins, grip, *grip_screws, guard, trigger, clamp, socket, fore, butt, pot, pot_inside, rim, *ears, bail, spoon])
wrap_uv(body, (COPPER,), TUBE)

# --- the frico: loaded like a mortar bomb, it sits in the cauldron's mouth -------------------------------------
LOADED = (0, 0.43, AXIS)
crust = [(0, 0.0095), (0.014, 0.0100), (0.030, 0.0098), (0.046, 0.0092), (0.060, 0.0094), (0.068, 0.0110), (0.074, 0.0098), (0.0775, 0.0055), (0.0785, 0.0005), (0.0770, -0.0045), (0.0725, -0.0082), (0.064, -0.0098), (0.046, -0.0100), (0.024, -0.0102), (0, -0.0100)]
round_ = lathe("frico", crust, LOADED, FRICO, steps=48)
for v in round_.data.vertices:
    # nobody fries a perfect disc: a wavy outline, and lumps where the potato is
    t = math.atan2(v.co.z, v.co.x)
    r = math.hypot(v.co.x, v.co.z)
    k = 1 + (r / 0.078) ** 2 * (0.035 * math.sin(3 * t + 0.7) + 0.022 * math.sin(5 * t + 2.1) + 0.012 * math.sin(11 * t + 0.4))
    v.co.x *= k
    v.co.z *= k
    v.co.y += 0.0016 * math.sin(70 * v.co.x + 1.0) * math.cos(62 * v.co.z + 2.0) + 0.0009 * math.sin(150 * v.co.x + 55 * v.co.z)
frico = part("frico", [round_], pivot=LOADED, crease=180)
uv = frico.data.uv_layers[0]
for loop in frico.data.loops:
    # the crust's picture lies flat across both faces, its dark edge on the rim
    co = frico.data.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (0.5 + co.x / 0.17, 0.5 + co.z / 0.17)

marker("muzzle", (0, 0.48, AXIS))
marker("left", (0, 0.2, 0.0))
marker("trigger", (0, 0.0485, 0.001))  # the face the trigger finger presses
kit.drop_cutters()

if len(args) > 1:
    # as the shooter sees it from the hip, from the side, and the two ends
    kit.preview(os.path.join(args[1], "lanciafrico-fp.png"), eye=(-0.17, -0.40, 0.21), target=(-0.17, 1.0, 0.21), lens=17.5)
    kit.preview(os.path.join(args[1], "lanciafrico-side.png"), eye=(-0.85, 0.14, 0.20), target=(0, 0.14, 0.06), lens=50)
    kit.preview(os.path.join(args[1], "lanciafrico-rear.png"), eye=(-0.34, -0.52, 0.30), target=(0.0, 0.0, 0.08), lens=50)
    kit.preview(os.path.join(args[1], "lanciafrico-front.png"), eye=(0.36, 0.86, 0.24), target=(0, 0.30, 0.09), lens=50)
kit.export(args[0])
