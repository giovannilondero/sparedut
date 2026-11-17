"""
La Doplete: the plevan's side-by-side hammer gun. A silver action engraved with scrolls, two
outside hammers, a top lever, blued barrels under a sighting rib, a carved walnut stock with
the parish priest's little brass cross let into both sides of the butt.

    blender -b --python assets/blender/doplete.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving parts `barrels` (they drop around the
hinge pin, fore-end and all) and `shells0`, `shells1` (the two cartridges, in their chambers),
and the points `muzzle` and `left` (the left hand, on the fore-end).

The scroll engraving is a texture drawn by this script (tex/doplete-scroll_*.jpg): it is
written again only when the files are missing.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import box, cut, lathe, marker, material, part, ribbon, slab, tube

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()


# --- the engraving ---------------------------------------------------------------------------
def scroll_texture(prefix, size=512):
    """Scrolls, flowers and a punched ground, tileable: colour, relief and roughness."""
    import numpy as np

    paths = {s: os.path.join(kit.HERE, "tex", f"{prefix}_{s}.jpg") for s in "dnr"}
    if all(os.path.exists(p) for p in paths.values()):
        return
    n = size
    v, u = np.mgrid[0:n, 0:n] / n
    # four spirals to a tile, turning opposite ways like the squares of a chessboard
    cu, cv = (u * 2) % 1 - 0.5, (v * 2) % 1 - 0.5
    hand = np.where((np.floor(u * 2) + np.floor(v * 2)) % 2 == 0, 1.0, -1.0)
    r, th = np.hypot(cu, cv), np.arctan2(cv, cu * hand)
    pitch = 0.105
    d = np.abs((r / pitch - th / (2 * np.pi)) % 1.0 - 0.5) * pitch
    width = 0.027 * (0.82 + 0.18 * np.cos(7 * th + 30 * r))
    vine = np.clip(1 - (d / width) ** 2, 0, 1) * np.clip((0.445 - r) / 0.03, 0, 1)
    bud = np.clip(1 - (r / 0.055) ** 2, 0, 1)
    # a four-petalled flower where four spirals meet, a bead between each two
    qu, qv = (u * 2 + 0.5) % 1 - 0.5, (v * 2 + 0.5) % 1 - 0.5
    qr, qt = np.hypot(qu, qv), np.arctan2(qv, qu)
    flower = np.clip(1 - (qr / (0.022 + 0.105 * np.abs(np.cos(2 * qt)) ** 1.5)) ** 2, 0, 1)
    bead = np.maximum(np.clip(1 - (np.hypot(qu, cv) / 0.04) ** 2, 0, 1), np.clip(1 - (np.hypot(cu, qv) / 0.04) ** 2, 0, 1))
    relief = np.maximum.reduce([vine, bud, flower, bead])
    noise = np.random.default_rng(7).random((n, n))
    noise = (noise + np.roll(noise, 1, 0) + np.roll(noise, 1, 1)) / 3
    ground = relief < 0.02
    height = relief + np.where(ground, 0.10 * noise, 0.0)
    height = (height + np.roll(height, 1, 0) + np.roll(height, -1, 0) + np.roll(height, 1, 1) + np.roll(height, -1, 1)) / 5
    k = 3.2 * n / 512
    nx = -(np.roll(height, -1, 1) - np.roll(height, 1, 1)) * k
    ny = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) * k
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    lift = np.clip(relief * 1.6, 0, 1)
    colour = (0.58 + 0.42 * lift) * np.where(ground, 0.88 + 0.12 * noise, 1.0)
    rough = 0.62 - 0.36 * lift
    one = np.ones_like(nx)
    for s, (cr, cg, cb) in {"d": (colour, colour, colour), "n": (nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5), "r": (rough, rough, rough)}.items():
        img = bpy.data.images.new(f"{prefix}_{s}", n, n, alpha=False)
        img.pixels.foreach_set(np.stack([cr, cg, cb, one], axis=-1).astype(np.float32).ravel())
        img.filepath_raw = paths[s]
        img.file_format = "JPEG"
        img.save()
        bpy.data.images.remove(img)


def carved_wood(name, color, scale, relief_scale, strength=1.0):
    """Walnut with the scrolls cut into it: the wood's colour and gloss, the engraving's relief."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    uv = nodes.new("ShaderNodeTexCoord")

    def image(file, colorspace, s):
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (s, s, s)
        links.new(uv.outputs["UV"], mapping.inputs["Vector"])
        n = nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(kit.HERE, "tex", file), check_existing=True)
        n.image.colorspace_settings.name = colorspace
        links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(image("walnut_d.jpg", "sRGB", scale).outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*color, 1.0)
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nm = nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = strength
    links.new(image("doplete-scroll_n.jpg", "Non-Color", relief_scale).outputs["Color"], nm.inputs["Color"])
    links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(image("walnut_r.jpg", "Non-Color", scale).outputs["Color"], bsdf.inputs["Roughness"])
    return m


scroll_texture("doplete-scroll")

WALNUT = (0.52, 0.27, 0.15)
SILVER = material("engraved-silver", (0.84, 0.82, 0.78), metallic=1.0, roughness=0.32, texture="doplete-scroll", scale=19.0)
PLAIN = material("silver", (0.74, 0.73, 0.71), metallic=1.0, roughness=0.30)
BLUE = material("blued-steel", (0.17, 0.185, 0.21), metallic=1.0, roughness=0.36)
WORN = material("worn-steel", (0.36, 0.37, 0.38), metallic=1.0, roughness=0.30)
BRASS = material("brass", (0.92, 0.70, 0.30), metallic=1.0, roughness=0.26)
WOOD = material("walnut", WALNUT, roughness=0.5, texture="walnut", scale=3.2)
CARVED = carved_wood("carved-walnut", WALNUT, 3.2, 9.0)
HORN = material("horn", (0.07, 0.055, 0.05), roughness=0.42)
HULL = material("cartridge-red", (0.46, 0.045, 0.04), roughness=0.55)

AXIS = 0.047  # height of the barrels' axes above the grip
GAP = 0.0125  # each barrel's axis is this far from the middle
HINGE = (0.08, 0.035)  # (y, z) of the pin the barrels drop around
BREECH = 0.04  # y of the face the barrels close against


# --- helpers ---------------------------------------------------------------------------------
def curve(points, n=5, closed=False):
    """A smooth line through `points` (Catmull-Rom), `n` steps between each pair."""
    m = len(points)
    get = (lambda i: points[i % m]) if closed else (lambda i: points[min(max(i, 0), m - 1)])
    out = []
    for i in range(m if closed else m - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return out if closed else out + [points[-1]]


def loft(name, rings, mat, bevel=0.0):
    """A skin over `rings`, lists of the same number of (x, y, z) points; the ends are closed."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        faces += [(a + i, a + (i + 1) % n, b + (i + 1) % n, b + i) for i in range(n)]
    faces += [tuple(range(n)), tuple(range((len(rings) - 1) * n, len(rings) * n))]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width, b.segments, b.limit_method, b.angle_limit = bevel, 2, "ANGLE", math.radians(35)
    return o


def oval(y, zb, zt, hw, p=2.6, lean=0.0, top=1.0, n=24):
    """A rounded section of a stock at `y`: from zb to zt, hw to each side; `p` squares it,
    `top` narrows the upper half (a comb), `lean` tips the section back at the top."""
    ring = []
    zc, hh = (zb + zt) / 2, (zt - zb) / 2
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = hw * math.copysign(abs(c) ** (2 / p), c)
        z = hh * math.copysign(abs(s) ** (2 / p), s)
        if s > 0:
            x *= 1 - (1 - top) * s
        ring.append((x, y - lean * z, zc + z))
    return ring


def cradle(y, zb, zc, zt, hw, p=2.4, n=14):
    """A section of the fore-end: a rounded belly from zb up to zc, then straight sides to zt."""
    ring = [(hw, y, zt)]
    for i in range(n + 1):
        a = -math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        ring.append((hw * math.copysign(abs(c) ** (2 / p), c), y, zc + (zc - zb) * math.copysign(abs(s) ** (2 / p), s)))
    return ring + [(-hw, y, zt)]


def stud(name, r, h, at, mat, side=1, steps=14):
    """A domed pin or screw head standing `h` proud of a side face (side: +1 right, -1 left)."""
    s = side
    return lathe(name, [(0, -0.001 * s), (r, -0.001 * s), (r, 0.45 * h * s), (0.7 * r, h * s), (0, h * s)], at, mat, axis="X", steps=steps)


def ring(name, inner, outer, half, at, mat, axis="X", steps=24, bevel=0.0004):
    return lathe(name, [(inner, -half), (outer, -half), (outer, half), (inner, half), (inner, -half)], at, mat, axis=axis, steps=steps, bevel=bevel)


def arc(centre, r, a0, a1, n):
    return [(centre[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), centre[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


# --- body: action, locks, hammers ---------------------------------------------------------------
# the bar ends in a round knuckle around the hinge pin: the fore-end iron turns around it
action = slab("action", [(BREECH, 0.050), (0.008, 0.050), (-0.004, 0.046), (-0.005, 0.030), (-0.005, 0.008), (-0.003, 0.004), (0.030, 0.010), *arc(HINGE, 0.010, -90, 0, 5), (BREECH, HINGE[1])], 0.045, SILVER, bevel=0.003, segments=3)
fences = [lathe(f"fence{i}", [(0, -0.0135), (0.0050, -0.0125), (0.0090, -0.0100), (0.0116, -0.0062), (0.0129, -0.0010), (0.0131, 0.004), (0.0131, 0.0134), (0, 0.0134)], (x, 0.0265, AXIS), SILVER, steps=28) for i, x in enumerate((-GAP, GAP))]
strikers = [lathe(f"striker{i}", [(0, 0), (0.0024, 0), (0.0024, 0.007), (0, 0.007)], (x, 0.0115, 0.0545), WORN, steps=12) for i, x in enumerate((-0.0205, 0.0205))]
strap = slab("top-strap", [(BREECH, 0.0585), (0.010, 0.0585), *curve([(0.0, 0.0565), (-0.020, 0.0478), (-0.050, 0.0325), (-0.072, 0.0284)], 3), (-0.072, 0.024), (-0.050, 0.026), (-0.020, 0.040), (0.0, 0.046), (BREECH, 0.046)], 0.014, PLAIN, bevel=0.0012, segments=2)
strap_screw = lathe("strap-screw", [(0, 0), (0.0026, 0), (0.0026, 0.0006), (0, 0.0009)], (0, -0.058, 0.0296), WORN, axis="Z", steps=14)

lever = ribbon("top-lever", [(0.019, 0.0606), (0.009, 0.0606), (0.0, 0.0589), (-0.020, 0.0503), (-0.037, 0.0418)], 0.0034, 0.0062, PLAIN)
lever_boss = lathe("top-lever-boss", [(0, 0), (0.0064, 0), (0.0064, 0.0036), (0.0050, 0.0048), (0, 0.0050)], (0, 0.014, 0.0584), PLAIN, axis="Z", steps=24)
# the thumb piece: a domed oval lying on the slope of the strap
lever_pad = lathe("top-lever-pad", [(0, -0.0020), (0.0050, -0.0020), (0.0064, -0.0008), (0.0064, 0.0006), (0.0048, 0.0020), (0, 0.0026)], (0, -0.0365, 0.0432), PLAIN, axis="Z", steps=24)
lever_pad.scale = (1.0, 1.25, 1.0)
lever_pad.rotation_euler = (0.47, 0, 0)

plate_line = curve([(-0.010, 0.0450), (-0.022, 0.0405), (-0.0285, 0.0300), (-0.0240, 0.0200), (-0.008, 0.0140), (0.018, 0.0125), (0.045, 0.0185), (0.060, 0.0250), (0.0635, 0.0305), (0.059, 0.0345), (0.045, 0.0348), (0.0405, 0.0400), (0.037, 0.0462), (0.015, 0.0468)], 3, closed=True)
plates, hammers, pins = [], [], []
hammer_line = curve([(-0.002, 0.0285), (0.0045, 0.0310), (0.0065, 0.0370), (0.0075, 0.0450), (0.0125, 0.0515), (0.0142, 0.0565), (0.0105, 0.0600), (0.0040, 0.0625), (-0.0040, 0.0680), (-0.0100, 0.0755), (-0.0158, 0.0805), (-0.0180, 0.0780), (-0.0125, 0.0700), (-0.0075, 0.0615), (-0.0052, 0.0520), (-0.0066, 0.0440), (-0.0096, 0.0380), (-0.0086, 0.0310)], 3, closed=True)
for i, side in enumerate((-1, 1)):
    plates.append(slab(f"lock-plate{i}", plate_line, 0.0022, SILVER, bevel=0.0007, segments=2, at=(side * 0.0234, 0, 0)))
    hammers.append(slab(f"hammer{i}", hammer_line, 0.0050, PLAIN, bevel=0.0014, segments=2, at=(side * 0.0270, 0, 0)))
    hammers.append(box(f"hammer-nose{i}", (0.0088, 0.0055, 0.0062), (side * 0.0236, 0.0118, 0.0560), PLAIN, bevel=0.0012))
    pins.append(stud(f"hammer-screw{i}", 0.0036, 0.0014, (side * 0.0295, -0.002, 0.036), WORN, side))
    pins += [stud(f"lock-pin{i}{j}", 0.0019, 0.0006, (side * 0.0245, y, z), WORN, side) for j, (y, z) in enumerate(((0.030, 0.022), (0.050, 0.0285), (-0.018, 0.031)))]

guard = ribbon("guard", [*curve([(0.060, 0.0185), (0.0635, 0.006), (0.058, -0.008), (0.045, -0.0165), (0.028, -0.0180), (0.012, -0.0140), (0.002, -0.0060), (-0.006, 0.0005)], 4), (-0.020, -0.0048), (-0.050, -0.0160), (-0.062, -0.0190)], 0.0028, 0.011, BLUE)
triggers = [slab(f"trigger{i}", [(y0 - 0.003, 0.012), (y0 + 0.003, 0.012), *curve([(y0 + 0.0035, 0.004), (y0 + 0.0048, -0.003), (y0 + 0.0085, -0.0095)], 3), (y0 + 0.0060, -0.0105), *curve([(y0 + 0.0020, -0.0050), (y0 - 0.0010, 0.0020), (y0 - 0.0028, 0.0080)], 3)], 0.0045, BLUE, bevel=0.001, segments=2, at=(x, 0, 0)) for i, (x, y0) in enumerate(((0.004, 0.035), (-0.004, 0.019)))]

# --- body: stock ---------------------------------------------------------------------------------
# (y, bottom, top, half-width, squareness, lean, comb): a straight English grip, a comb, a pitched butt
stations = curve([
    (0.004, 0.0040, 0.0535, 0.0222, 4.0, 0.0, 1.0),
    (-0.020, -0.0040, 0.0465, 0.0220, 3.6, 0.0, 1.0),
    (-0.050, -0.0150, 0.0315, 0.0185, 2.6, 0.0, 1.0),
    (-0.080, -0.0220, 0.0270, 0.0165, 2.3, 0.0, 1.0),
    (-0.105, -0.0290, 0.0270, 0.0170, 2.3, 0.0, 0.95),
    (-0.128, -0.0360, 0.0330, 0.0182, 2.5, 0.0, 0.85),
    (-0.150, -0.0435, 0.0355, 0.0196, 2.8, 0.02, 0.80),
    (-0.220, -0.0680, 0.0225, 0.0208, 3.2, 0.08, 0.80),
    (-0.300, -0.0960, 0.0070, 0.0208, 3.2, 0.16, 0.82),
    (-0.3135, -0.1005, 0.0045, 0.0206, 3.2, 0.18, 0.82),
], 3)
stock = loft("stock", [oval(y, zb, zt, hw, p, lean, top) for y, zb, zt, hw, p, lean, top in stations], WOOD)
# the carving starts behind the hand
stock.data.materials.append(CARVED)
for poly in stock.data.polygons:
    if poly.center.y < -0.116:
        poly.material_index = 1
plate = loft("butt-plate", [oval(-0.3135, -0.1010, 0.0050, 0.0208, 3.2, 0.18, 0.82), oval(-0.3205, -0.1010, 0.0050, 0.0208, 3.2, 0.18, 0.82), oval(-0.3235, -0.0975, 0.0020, 0.0175, 3.0, 0.18, 0.82)], HORN, bevel=0.0012)

# the plevan's cross, let into both sides of the butt
W0, W1 = 0.0030, 0.0050
cross_line = [(0.013, -W1), (0.013, W1), (W0, W0), (W1, 0.014), (-W1, 0.014), (-W0, W0), (-0.013, W1), (-0.013, -W1), (-W0, -W0), (-W1, -0.026), (W1, -0.026), (W0, -W0)]
crosses = []
for i, side in enumerate((-1, 1)):
    c = slab(f"cross{i}", cross_line, 0.0022, BRASS, bevel=0.0006, segments=2, at=(side * 0.0205, -0.208, -0.014))
    c.rotation_euler = (0.18, 0, 0)
    crosses += [c, stud(f"cross-boss{i}", 0.0030, 0.0012, (side * 0.0215, -0.208, -0.014), BRASS, side)]

swivel = [ring("butt-swivel", 0.0048, 0.0062, 0.0010, (0, -0.250, -0.0855), WORN, steps=20), box("butt-swivel-base", (0.006, 0.010, 0.004), (0, -0.250, -0.0790), WORN, bevel=0.001, rot=(0.34, 0, 0))]

body = part("body", [action, *fences, *strikers, strap, strap_screw, lever, lever_boss, lever_pad, *plates, *hammers, *pins, guard, *triggers, stock, plate, *crosses, *swivel])

# --- barrels (with the fore-end: all of it drops around the hinge) -----------------------------
bore = [(0, 0.075), (0.0100, 0.075), (0.0100, 0.0), (0.0128, 0.0), (0.0128, 0.060), (0.0119, 0.200), (0.0111, 0.450), (0.0108, 0.597), (0.0104, 0.600), (0.0093, 0.600), (0.0093, 0.560), (0, 0.560)]
tubes = [lathe(f"barrel{i}", bore, (x, BREECH, AXIS), BLUE, steps=32) for i, x in enumerate((GAP, -GAP))]
rib = slab("rib", [(BREECH + 0.0005, 0.050), (0.638, 0.050), (0.638, 0.0612), (BREECH + 0.0005, 0.0628)], 0.0085, BLUE, bevel=0.0008, segments=2)
keel = slab("bottom-rib", [(0.335, 0.0375), (0.638, 0.0395), (0.638, 0.045), (0.335, 0.045)], 0.007, BLUE, bevel=0.0008, segments=2)
lump = box("lump", (0.016, 0.050, 0.010), (0, 0.0655, 0.0402), BLUE, bevel=0.001)
bead = lathe("bead", [(0, 0), (0.0020, 0.0006), (0.0028, 0.0025), (0.0020, 0.0046), (0, 0.0052)], (0, 0.628, 0.0610), BRASS, axis="Z", steps=14)
extractor = box("extractor", (0.0055, 0.0024, 0.016), (0, BREECH + 0.0008, AXIS), WORN, bevel=0.0006)
iron = slab("fore-end-iron", [*arc(HINGE, 0.0108, 0, -62, 5), (0.100, 0.0165), (0.1285, 0.0118), (0.1285, 0.044), (0.0908, 0.044)], 0.047, SILVER, bevel=0.002, segments=3)
fore = loft("fore-end", [cradle(y, zb, 0.036, 0.046, hw) for y, zb, hw in curve([(0.128, 0.0118, 0.0262), (0.200, 0.0112, 0.0268), (0.300, 0.0135, 0.0262), (0.3335, 0.0170, 0.0257)], 3)], CARVED, bevel=0.0015)
tip = loft("fore-end-tip", [cradle(0.3335, 0.0170, 0.036, 0.046, 0.0258), cradle(0.3400, 0.0190, 0.037, 0.046, 0.0252), cradle(0.3440, 0.0240, 0.039, 0.046, 0.0235)], HORN, bevel=0.0012)
sling = [ring("barrel-swivel", 0.0048, 0.0062, 0.0010, (0, 0.420, 0.0300), WORN, steps=20), box("barrel-swivel-base", (0.006, 0.010, 0.004), (0, 0.420, 0.0365), WORN, bevel=0.001)]
barrels = part("barrels", [*tubes, rib, keel, lump, bead, extractor, iron, fore, tip, *sling], pivot=(0, *HINGE))

# --- the two cartridges, in their chambers ----------------------------------------------------
shells = []
for i, x in enumerate((GAP, -GAP)):
    head = lathe(f"head{i}", [(0, 0.0388), (0.0108, 0.0388), (0.0108, 0.0400), (0.0099, 0.0402), (0.0099, 0.0520)], (x, 0, AXIS), BRASS, steps=20)
    primer = lathe(f"primer{i}", [(0, 0.0384), (0.0030, 0.0384), (0.0030, 0.0389)], (x, 0, AXIS), WORN, steps=12)
    hull = lathe(f"hull{i}", [(0.0099, 0.0520), (0.0097, 0.0526), (0.0097, 0.0985), (0.0088, 0.1005), (0.0060, 0.1010), (0, 0.1004)], (x, 0, AXIS), HULL, steps=20)
    shells.append(part(f"shells{i}", [head, primer, hull], pivot=(x, HINGE[0], AXIS)))

marker("muzzle", (0, 0.645, AXIS))
marker("left", (0, 0.25, 0.005))
kit.drop_cutters()
kit.export(args[0])

if len(args) > 1:
    out = args[1]
    kit.preview(os.path.join(out, "doplete-fp.png"), eye=(-0.14, -0.34, 0.14), target=(-0.14, 1.0, 0.14), lens=17.5)
    kit.preview(os.path.join(out, "doplete-side.png"), eye=(-1.45, 0.16, 0.05), target=(0, 0.16, -0.01), lens=50)
    kit.preview(os.path.join(out, "doplete-action.png"), eye=(-0.30, -0.10, 0.17), target=(0, 0.03, 0.03), lens=50)
    kit.preview(os.path.join(out, "doplete-butt.png"), eye=(-0.42, -0.36, 0.10), target=(0, -0.17, -0.02), lens=50)
    # as the reload leaves it: the barrels dropped, one cartridge on its way in
    for sh in shells:
        sh.parent = barrels
        sh.matrix_parent_inverse = barrels.matrix_world.inverted()
    barrels.rotation_euler = (-0.65, 0, 0)
    shells[0].location.y -= 0.05
    kit.preview(os.path.join(out, "doplete-open.png"), eye=(-0.32, -0.26, 0.24), target=(0, 0.05, 0.03), lens=50)
