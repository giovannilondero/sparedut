"""
Il Cjampanili: a bolt-action sniper rifle in dark walnut with a long scope, and where the
scope's elevation turret should be, the bell tower of the village rebuilt stone by stone:
ashlar shaft, clock, belfry with its bronze bell, tiled spire, golden ball and cross.

    blender -b --python assets/blender/cjampanili.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving part `bolt` (it turns around the barrel's
axis and runs back) and the points `muzzle` and `left` (the left hand, under the fore-end).

The tower's masonry is a texture drawn by this script (tex/cjampanili-stone_*.jpg): it is
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


# --- the masonry -----------------------------------------------------------------------------
def stone_texture(prefix, size=256):
    """Ashlar in running bond, four courses to a tile, tileable: colour, relief and roughness."""
    import numpy as np

    paths = {s: os.path.join(kit.HERE, "tex", f"{prefix}_{s}.jpg") for s in "dnr"}
    if all(os.path.exists(p) for p in paths.values()):
        return
    n = size
    v, u = np.mgrid[0:n, 0:n] / n
    row = np.floor(v * 4)
    uu = (u * 2 + 0.5 * (row % 2)) % 2
    col = np.floor(uu)
    bu, bv = uu % 1, (v * 4) % 1
    # distance from the joint, in tiles: a block is 1/2 wide and 1/4 high
    edge = np.minimum(np.minimum(bu, 1 - bu) * 0.5, np.minimum(bv, 1 - bv) * 0.25)
    face = np.clip(edge / 0.022, 0, 1)
    face = face * face * (3 - 2 * face)
    rng = np.random.default_rng(11)
    tone = rng.random((4, 2))[row.astype(int) % 4, col.astype(int) % 2]
    grain = rng.random((n, n))
    for _ in range(2):
        grain = (grain + np.roll(grain, 1, 0) + np.roll(grain, -1, 0) + np.roll(grain, 1, 1) + np.roll(grain, -1, 1)) / 5
    grain = (grain - grain.min()) / (grain.max() - grain.min())
    height = face * (0.9 + 0.1 * tone) + 0.16 * grain
    k = 2.6 * n / 256
    nx = -(np.roll(height, -1, 1) - np.roll(height, 1, 1)) * k
    ny = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) * k
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    shade = (0.60 + 0.40 * face) * (0.84 + 0.16 * tone) * (0.93 + 0.07 * grain)
    # the stones do not all come from the same bed: some warmer, some greyer
    warm = 0.96 + 0.04 * tone
    rough = 0.95 - 0.12 * face * grain
    one = np.ones_like(nx)
    for s, (cr, cg, cb) in {"d": (shade, shade * warm, shade * warm * warm), "n": (nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5), "r": (rough, rough, rough)}.items():
        img = bpy.data.images.new(f"{prefix}_{s}", n, n, alpha=False)
        img.pixels.foreach_set(np.stack([cr, cg, cb, one], axis=-1).astype(np.float32).ravel())
        img.filepath_raw = paths[s]
        img.file_format = "JPEG"
        img.save()
        bpy.data.images.remove(img)


stone_texture("cjampanili-stone")

STEEL = material("blued-steel", (0.17, 0.185, 0.21), metallic=1.0, roughness=0.40)
SCOPE = material("scope-black", (0.15, 0.155, 0.17), metallic=1.0, roughness=0.34)
WORN = material("worn-steel", (0.40, 0.41, 0.42), metallic=1.0, roughness=0.28)
BRASS = material("brass", (0.90, 0.68, 0.30), metallic=1.0, roughness=0.28)
GOLD = material("gold", (1.0, 0.78, 0.34), metallic=1.0, roughness=0.22)
GLASS = material("lens", (0.36, 0.52, 0.85), metallic=1.0, roughness=0.06)
WOOD = material("dark-walnut", (0.34, 0.185, 0.11), roughness=0.5, texture="walnut", scale=3.2)
HORN = material("horn", (0.06, 0.05, 0.045), roughness=0.45)
RUBBER = material("rubber", (0.035, 0.032, 0.03), roughness=0.85)
STONE = material("ashlar", (0.88, 0.83, 0.74), roughness=0.9, texture="cjampanili-stone", scale=62.0)
DRESSED = material("dressed-stone", (0.72, 0.67, 0.58), roughness=0.85)
TILE = material("roof-tile", (0.58, 0.17, 0.09), roughness=0.75)
ENAMEL = material("enamel", (0.92, 0.90, 0.82), roughness=0.35)
DARK = material("shadow", (0.03, 0.025, 0.02), roughness=0.95)

AXIS = 0.06  # height of the barrel's axis above the grip
SIGHT = 0.125  # height of the scope's axis
RAKE = 0.3  # the pistol grip leans back by this much
C, S = math.cos(RAKE), math.sin(RAKE)


# --- helpers ---------------------------------------------------------------------------------
def G(f, u):
    """A point of the raked grip (f forward, u up along the grip) in the weapon's (y, z)."""
    return (f * C + u * S, -f * S + u * C)


def curve(points, n=5):
    """A smooth line through `points` (Catmull-Rom), `n` steps between each pair."""
    out = []
    for i in range(len(points) - 1):
        p0, p1, p2, p3 = points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, len(points) - 1)]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return out + [points[-1]]


def loft(name, rings, mat, bevel=0.0):
    """A skin over `rings`, lists of the same number of (x, y, z) points; the ends are closed."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
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


def superellipse(a, b, p, n):
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        yield a * math.copysign(abs(c) ** (2 / p), c), b * math.copysign(abs(s) ** (2 / p), s)


def oval(y, zb, zt, hw, p=2.6, n=24):
    """A rounded section of the stock at `y`: from zb to zt, hw to each side; `p` squares it."""
    return [(x, y, (zb + zt) / 2 + z) for x, z in superellipse(hw, (zt - zb) / 2, p, n)]


def grip_ring(u, hw, hf, f0=0.0, p=2.6, n=20):
    """A section of the pistol grip, across its raked axis at height `u`, centred f0 ahead of it."""
    return [(x, *G(f0 + f, u)) for x, f in superellipse(hw, hf, p, n)]


def bar(name, section, y0, y1, mat, bevel=0.001, segments=2):
    """A cross-section, a list of (x, z), drawn out along the barrel from y0 to y1."""
    o = slab(name, [(-x, z) for x, z in section], y1 - y0, mat, bevel, segments, at=(0, (y0 + y1) / 2, 0))
    o.rotation_euler = (0, 0, math.pi / 2)
    return o


def stud(name, r, h, at, mat, side=1, steps=14):
    """A domed pin or screw head standing `h` proud of a side face (side: +1 right, -1 left)."""
    s = side
    return lathe(name, [(0, -0.001 * s), (r, -0.001 * s), (r, 0.45 * h * s), (0.7 * r, h * s), (0, h * s)], at, mat, axis="X", steps=steps)


def ring(name, inner, outer, half, at, mat, axis="X", steps=24, bevel=0.0004):
    return lathe(name, [(inner, -half), (outer, -half), (outer, half), (inner, half), (inner, -half)], at, mat, axis=axis, steps=steps, bevel=bevel)


def arch(w, h, z0=0.0, a0=0.0, n=8):
    """A round-headed opening `w` wide and `h` high standing on z0, as an outline around a0."""
    r = w / 2
    return [(a0 - r, z0), (a0 + r, z0)] + [(a0 + r * math.cos(math.pi * i / n), z0 + h - r + r * math.sin(math.pi * i / n)) for i in range(n + 1)]


# --- body: stock -------------------------------------------------------------------------------
# (y, bottom, top, half-width, squareness): fore-end, the bed of the action, wrist, butt
stations = curve([
    (0.484, 0.0260, 0.0500, 0.0120, 2.4),
    (0.478, 0.0190, 0.0530, 0.0185, 3.0),
    (0.440, 0.0155, 0.0540, 0.0205, 3.6),
    (0.300, 0.0145, 0.0540, 0.0212, 3.8),
    (0.160, 0.0155, 0.0545, 0.0218, 4.0),
    (0.100, 0.0180, 0.0550, 0.0222, 4.0),
    (0.050, 0.0230, 0.0550, 0.0222, 4.0),
    (0.000, 0.0220, 0.0550, 0.0218, 3.8),
    (-0.035, 0.0170, 0.0540, 0.0208, 3.4),
    (-0.048, 0.0140, 0.0485, 0.0200, 3.0),
    (-0.075, 0.0095, 0.0455, 0.0188, 2.6),
    (-0.105, 0.0055, 0.0445, 0.0186, 2.5),
    (-0.140, 0.0015, 0.0470, 0.0194, 2.6),
    (-0.200, -0.0055, 0.0575, 0.0204, 2.9),
    (-0.290, -0.0150, 0.0645, 0.0210, 3.2),
    (-0.318, -0.0180, 0.0660, 0.0210, 3.2),
], 3)
stock = loft("stock", [oval(*s) for s in stations], WOOD)
pad = loft("butt-pad", [oval(-0.318, -0.0185, 0.0665, 0.0213, 3.2), oval(-0.329, -0.0185, 0.0665, 0.0213, 3.2), oval(-0.333, -0.0150, 0.0630, 0.0180, 3.0)], RUBBER, bevel=0.001)
spacer = loft("butt-spacer", [oval(-0.3165, -0.0188, 0.0668, 0.0215, 3.2), oval(-0.3190, -0.0188, 0.0668, 0.0215, 3.2)], ENAMEL)
# the grip widens backwards where it meets the stock: the web of the hand sits under that curve
grip = loft("grip", [grip_ring(u, hw, hf, f0) for u, hw, hf, f0 in curve([(0.034, 0.0150, 0.0300, -0.0080), (0.010, 0.0150, 0.0262, -0.0058), (-0.006, 0.0150, 0.0212, -0.0010), (-0.030, 0.0152, 0.0205, 0.0), (-0.055, 0.0160, 0.0218, 0.0), (-0.066, 0.0165, 0.0225, 0.0)], 3)], WOOD)
grip_cap = loft("grip-cap", [grip_ring(-0.066, 0.0167, 0.0228), grip_ring(-0.0705, 0.0167, 0.0228), grip_ring(-0.0728, 0.0145, 0.0205)], HORN, bevel=0.0008)
cheek = loft("cheek-rest", [oval(*s) for s in ((-0.157, 0.050, 0.068, 0.0115, 2.4), (-0.162, 0.050, 0.079, 0.0140, 2.6), (-0.170, 0.050, 0.0850, 0.0158, 2.9), (-0.182, 0.050, 0.0865, 0.0165, 3.0), (-0.272, 0.050, 0.0865, 0.0165, 3.0), (-0.284, 0.050, 0.0850, 0.0158, 2.9), (-0.291, 0.050, 0.079, 0.0140, 2.6), (-0.295, 0.050, 0.068, 0.0115, 2.4))], WOOD)
cheek_screws = [stud(f"cheek-screw{i}", 0.0032, 0.0014, (-0.0163, y, 0.066), WORN, -1) for i, y in enumerate((-0.195, -0.258))]
tip = loft("fore-end-tip", [oval(0.4745, 0.0180, 0.0535, 0.0192, 3.0), oval(0.4800, 0.0190, 0.0530, 0.0186, 3.0), oval(0.4880, 0.0240, 0.0510, 0.0140, 2.6)], HORN, bevel=0.0008)
swivels = [ring("fore-swivel", 0.0050, 0.0064, 0.0010, (0, 0.430, 0.0090), WORN, steps=20), box("fore-swivel-base", (0.006, 0.010, 0.004), (0, 0.430, 0.0150), WORN, bevel=0.001), ring("butt-swivel", 0.0050, 0.0064, 0.0010, (0, -0.262, -0.0180), WORN, steps=20), box("butt-swivel-base", (0.006, 0.010, 0.004), (0, -0.262, -0.0115), WORN, bevel=0.001, rot=(0.11, 0, 0))]

# --- body: action and barrel ---------------------------------------------------------------------
# a hollow receiver: the bolt shows through the ejection port and leaves it empty when drawn back
receiver = lathe("receiver", [(0.0100, 0), (0.0160, 0), (0.0172, 0.002), (0.0172, 0.050), (0.0162, 0.052), (0.0162, 0.150), (0.0178, 0.153), (0.0178, 0.198), (0.0168, 0.200), (0.0100, 0.200), (0.0100, 0)], (0, -0.040, AXIS), STEEL, steps=36)
cut(receiver, [box("port", (0.026, 0.070, 0.027), (0.017, 0.065, 0.0715), None, bevel=0)])
bolt_stop = box("bolt-stop", (0.004, 0.018, 0.008), (-0.0178, -0.026, 0.062), WORN, bevel=0.0012)
barrel = lathe("barrel", [(0, 0), (0.0128, 0), (0.0128, 0.030), (0.0118, 0.045), (0.0098, 0.340), (0.0090, 0.720), (0, 0.720)], (0, 0.160, AXIS), STEEL, steps=28)
brake = lathe("muzzle-brake", [(0.0090, 0), (0.0138, 0.002), (0.0146, 0.004), (0.0146, 0.040), (0.0134, 0.0425), (0.0052, 0.0425), (0.0052, 0.004), (0.0, 0.004)], (0, 0.880, AXIS), WORN, steps=32)
cut(brake, [box(f"brake-port{i}", (0.04, 0.0058, 0.0046), (0, 0.8915 + i * 0.0105, AXIS), None, bevel=0) for i in range(3)])
guard = ribbon("guard", curve([(0.062, 0.0235), (0.0625, 0.014), (0.056, 0.0065), (0.045, 0.0030), (0.033, 0.0026), (0.0245, 0.0060)], 4), 0.0028, 0.012, STEEL)
trigger = slab("trigger", [(0.036, 0.024), (0.043, 0.024), *curve([(0.0432, 0.018), (0.0440, 0.012), (0.0468, 0.0075)], 3), (0.0440, 0.0068), *curve([(0.0405, 0.0110), (0.0385, 0.0170)], 3)], 0.0055, WORN, bevel=0.001, segments=2)
floor = box("floorplate", (0.016, 0.082, 0.003), (0, 0.108, 0.0178), STEEL, bevel=0.001)
floor_pins = [lathe(f"floor-screw{i}", [(0, 0), (0.003, 0), (0.003, -0.0006), (0, -0.0009)], (0, y, 0.0166), WORN, axis="Z", steps=12) for i, y in enumerate((0.075, 0.142))]

# --- body: scope -----------------------------------------------------------------------------------
scope = lathe("scope", [
    (0, -0.0930), (0.0175, -0.0930), (0.0175, -0.0975), (0.0225, -0.0975), (0.0232, -0.0960), (0.0232, -0.0900), (0.0218, -0.0890),
    (0.0218, -0.0700), (0.0226, -0.0690), (0.0226, -0.0620), (0.0218, -0.0610), (0.0205, -0.0560), (0.0150, -0.0450),
    (0.0150, 0.0620), (0.0185, 0.0660), (0.0185, 0.0940), (0.0150, 0.0980), (0.0150, 0.2050),
    (0.0200, 0.2200), (0.0262, 0.2330), (0.0275, 0.2360), (0.0275, 0.2790), (0.0282, 0.2800), (0.0282, 0.2850), (0.0262, 0.2850), (0.0262, 0.2760), (0, 0.2760),
], (0, 0, SIGHT), SCOPE, steps=40)
grooves = [ring(f"focus-rib{i}", 0.0224, 0.0230, 0.0006, (0, -0.0672 + i * 0.0017, SIGHT), SCOPE, axis="Y", steps=40, bevel=0) for i in range(4)]
lenses = [lathe("ocular", [(0, -0.0945), (0.0176, -0.0940), (0.0176, -0.0926), (0, -0.0926)], (0, 0, SIGHT), GLASS, steps=32), lathe("objective", [(0, 0.2755), (0.0263, 0.2755), (0.0263, 0.2770), (0, 0.2782)], (0, 0, SIGHT), GLASS, steps=40)]
windage = lathe("windage-turret", [(0, 0), (0.0088, 0), (0.0088, 0.0040), (0.0076, 0.0046), (0.0076, 0.0110), (0.0088, 0.0116), (0.0088, 0.0146), (0.0072, 0.0158), (0, 0.0158)], (0.0170, 0.080, SIGHT), SCOPE, axis="X", steps=28)
parallax = lathe("parallax-cap", [(0, 0), (0.0080, 0), (0.0080, -0.0040), (0.0066, -0.0052), (0, -0.0052)], (-0.0170, 0.080, SIGHT), SCOPE, axis="X", steps=28)
mounts = []
for i, y in enumerate((-0.012, 0.135)):
    mounts.append(ring(f"scope-ring{i}", 0.0148, 0.0188, 0.0062, (0, y, SIGHT), STEEL, axis="Y", steps=36, bevel=0.0007))
    mounts.append(box(f"mount-post{i}", (0.016, 0.0124, 0.034), (0, y, 0.0915), STEEL, bevel=0.0018))
    mounts.append(box(f"mount-foot{i}", (0.024, 0.022, 0.006), (0, y, 0.0790), STEEL, bevel=0.0015))
    for side in (-1, 1):
        mounts.append(box(f"ring-ear{i}{side}", (0.0065, 0.0124, 0.0075), (side * 0.0208, y, SIGHT), STEEL, bevel=0.0012))
        mounts += [lathe(f"ring-screw{i}{side}{j}", [(0, 0), (0.0017, 0), (0.0017, 0.0008), (0, 0.0011)], (side * 0.0212, y + dy, SIGHT + 0.0037), WORN, axis="Z", steps=10) for j, dy in enumerate((-0.0032, 0.0032))]

# --- body: the bell tower, standing where the elevation turret would be ----------------------------
TY = 0.080  # the tower's axis along the scope
B = SIGHT + 0.0185 - 0.0003  # its foot, on the scope's saddle
HALF = 0.0104  # half the side of the shaft
turret = lathe("tower-turret", [(0, -0.0015), (0.0142, -0.0015), (0.0142, 0.0022), (0.0132, 0.0030), (0, 0.0030)], (0, TY, B), BRASS, axis="Z", steps=36)
knurls = [box(f"turret-knurl{i}", (0.0008, 0.0010, 0.0030), (0.0142 * math.cos(i * math.pi / 14), TY + 0.0142 * math.sin(i * math.pi / 14), B + 0.0004), BRASS, bevel=0, rot=(0, 0, i * math.pi / 14)) for i in range(28)]
plinth = box("tower-plinth", (0.0256, 0.0256, 0.0050), (0, TY, B + 0.0055), DRESSED, bevel=0.0006)
step = box("tower-step", (0.0232, 0.0232, 0.0016), (0, TY, B + 0.0087), DRESSED, bevel=0.0004)
shaft = box("tower-shaft", (2 * HALF, 2 * HALF, 0.0456), (0, TY, B + 0.0322), STONE, bevel=0.0004)
# the openings are pockets in the masonry with the dark of the inside at their bottom
openings, darks = [], []
DEPTH = 0.0014
for side in (-1, 1):
    front = TY + side * HALF
    for j, outline in enumerate((arch(0.0058, 0.0092, B + 0.0098), arch(0.0030, 0.0078, B + 0.0245))):
        openings.append(bar(f"opening-y{side}{j}", outline, front - 0.002, front + 0.002, None, bevel=0))
        darks.append(bar(f"dark-y{side}{j}", outline, min(front - side * 0.0010, front - side * 0.0020), max(front - side * 0.0010, front - side * 0.0020), DARK, bevel=0))
    for j, outline in enumerate((arch(0.0030, 0.0078, B + 0.0160, TY), arch(0.0030, 0.0078, B + 0.0340, TY))):
        openings.append(slab(f"opening-x{side}{j}", outline, 0.004, None, bevel=0, at=(side * HALF, 0, 0)))
        darks.append(slab(f"dark-x{side}{j}", outline, 0.0010, DARK, bevel=0, at=(side * (HALF - 0.0015), 0, 0)))
cut(shaft, openings)
clocks = []
for side in (-1, 1):
    front = TY + side * HALF
    zc = B + 0.0440
    clocks.append(lathe(f"clock-rim{side}", [(0.0046, 0), (0.0046, side * 0.0009), (0.0060, side * 0.0009), (0.0064, side * 0.0004), (0.0064, 0), (0.0046, 0)], (0, front, zc), GOLD, steps=28))
    clocks.append(lathe(f"clock-face{side}", [(0, -side * 0.0005), (0.0047, -side * 0.0005), (0.0047, side * 0.0004), (0, side * 0.0004)], (0, front, zc), ENAMEL, steps=28))
    # ten past ten, as on every clock that wants to look its best
    for length, angle in ((0.0026, -1.05), (0.0040, 1.05)):
        clocks.append(box(f"clock-hand{side}{length}", (0.0006, 0.0004, length), (side * -0.5 * length * math.sin(angle), front + side * 0.0005, zc + 0.5 * length * math.cos(angle)), DARK, bevel=0, rot=(0, -side * angle, 0)))
    clocks.append(lathe(f"clock-boss{side}", [(0, 0), (0.0006, 0), (0.0006, side * 0.0009), (0, side * 0.0009)], (0, front, zc), GOLD, steps=8))
cornice1 = [box("tower-moulding1", (0.0226, 0.0226, 0.0012), (0, TY, B + 0.0546), DRESSED, bevel=0.0003), box("tower-cornice1", (0.0254, 0.0254, 0.0026), (0, TY, B + 0.0565), DRESSED, bevel=0.0005)]
belfry = box("belfry", (2 * HALF, 2 * HALF, 0.0150), (0, TY, B + 0.0653), DRESSED, bevel=0.0004)
cut(belfry, [bar("belfry-arch-y", arch(0.0112, 0.0118, B + 0.0590), TY - 0.02, TY + 0.02, None, bevel=0), slab("belfry-arch-x", arch(0.0112, 0.0118, B + 0.0590, TY), 0.04, None, bevel=0)])
belfry_floor = box("belfry-floor", (0.0190, 0.0190, 0.0010), (0, TY, B + 0.0586), DARK, bevel=0)
bell = lathe("bell", [(0, 0.0098), (0.0014, 0.0096), (0.0030, 0.0084), (0.0037, 0.0056), (0.0042, 0.0030), (0.0054, 0.0010), (0.0056, 0.0002), (0.0048, 0.0002), (0.0040, 0.0018), (0, 0.0022)], (0, TY, B + 0.0602), BRASS, axis="Z", steps=24)
clapper = lathe("clapper", [(0, 0), (0.0009, 0.0004), (0.0011, 0.0012), (0.0005, 0.0020), (0.0004, 0.0040), (0, 0.0040)], (0.0006, TY, B + 0.0592), DARK, axis="Z", steps=8)
yoke = box("bell-yoke", (0.0180, 0.0016, 0.0014), (0, TY, B + 0.0703), DARK, bevel=0.0003)
cornice2 = [box("tower-moulding2", (0.0226, 0.0226, 0.0010), (0, TY, B + 0.0732), DRESSED, bevel=0.0003), box("tower-cornice2", (0.0260, 0.0260, 0.0026), (0, TY, B + 0.0749), DRESSED, bevel=0.0005)]
# a four-sided spire, the tiles laid in courses
ROOF, RISE, ROWS = B + 0.0762, 0.0320, 9
tiles = [(0.0, 0.0), (0.0198, 0.0)]
for i in range(ROWS):
    r0, r1 = 0.0198 * (1 - i / ROWS) ** 1.08, 0.0198 * (1 - (i + 1) / ROWS) ** 1.08
    tiles += [(r0, i * RISE / ROWS + 0.0006), (r1 + 0.0007, (i + 1) * RISE / ROWS)]
tiles.append((0, RISE))
roof = lathe("spire", tiles, (0, TY, ROOF), TILE, axis="Z", steps=4)
roof.rotation_euler = (0, 0, math.pi / 4)
ball = lathe("spire-ball", [(0, 0), (0.0016, 0.0005), (0.0024, 0.0024), (0.0016, 0.0043), (0, 0.0048)], (0, TY, ROOF + RISE - 0.0012), GOLD, axis="Z", steps=14)
cross = [box("spire-cross", (0.0013, 0.0013, 0.0108), (0, TY, ROOF + RISE + 0.0084), GOLD, bevel=0.0003), box("spire-cross-arm", (0.0064, 0.0013, 0.0013), (0, TY, ROOF + RISE + 0.0100), GOLD, bevel=0.0003)]
tower = [turret, *knurls, plinth, step, shaft, *darks, *clocks, *cornice1, belfry, belfry_floor, bell, clapper, yoke, *cornice2, roof, ball, *cross]

body = part("body", [stock, pad, spacer, grip, grip_cap, cheek, *cheek_screws, tip, *swivels, receiver, bolt_stop, barrel, brake, guard, trigger, floor, *floor_pins, scope, *grooves, *lenses, windage, parallax, *mounts, *tower])

# --- bolt: the handle turns up around the barrel's axis, then the whole of it runs back -------------
PIVOT = (0, -0.030, AXIS)
bolt_body = lathe("bolt-body", [(0, -0.054), (0.0096, -0.054), (0.0096, 0.150), (0.0082, 0.152), (0, 0.152)], (0, 0, AXIS), WORN, steps=24)
shroud = lathe("bolt-shroud", [(0, -0.0865), (0.0050, -0.0865), (0.0074, -0.0845), (0.0074, -0.0780), (0.0060, -0.0770), (0.0060, -0.0740), (0.0106, -0.0720), (0.0106, -0.0575), (0.0096, -0.0560)], (0, 0, AXIS), STEEL, steps=24)
handle = lathe("bolt-handle", [(0, 0.003), (0.0064, 0.003), (0.0060, 0.012), (0.0043, 0.028), (0.0040, 0.0380), (0.0060, 0.0395), (0.0080, 0.0425), (0.0087, 0.0465), (0.0080, 0.0505), (0.0060, 0.0535), (0.0030, 0.0552), (0, 0.0556)], (0, -0.050, AXIS), WORN, axis="X", steps=20)
handle.rotation_euler = (0, 0.296, 0)
flag = box("safety-flag", (0.0030, 0.0100, 0.0070), (0, -0.0655, AXIS + 0.0125), WORN, bevel=0.001)
bolt = part("bolt", [bolt_body, shroud, handle, flag], pivot=PIVOT)

marker("muzzle", (0, 0.925, AXIS))
marker("left", (0, 0.30, 0.012))
marker("trigger", (0, 0.044, 0.013))  # the face the trigger finger presses
kit.drop_cutters()
kit.export(args[0])

if len(args) > 1:
    out = args[1]
    kit.preview(os.path.join(out, "cjampanili-fp.png"), eye=(-0.14, -0.34, 0.14), target=(-0.14, 1.0, 0.14), lens=17.5)
    kit.preview(os.path.join(out, "cjampanili-side.png"), eye=(-1.75, 0.30, 0.12), target=(0, 0.30, 0.09), lens=50)
    kit.preview(os.path.join(out, "cjampanili-tower.png"), eye=(-0.22, -0.16, 0.26), target=(0, 0.08, 0.19), lens=70)
    kit.preview(os.path.join(out, "cjampanili-action.png"), eye=(0.34, -0.22, 0.24), target=(0, 0.03, 0.08), lens=50)
    # as the animation leaves it: the handle up, the bolt back
    bolt.rotation_euler = (0, -1.1, 0)
    bolt.location.y -= 0.07
    kit.preview(os.path.join(out, "cjampanili-open.png"), eye=(0.30, -0.24, 0.22), target=(0, 0.0, 0.07), lens=50)
