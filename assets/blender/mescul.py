"""
Il Mescul: grandma's polenta paddle, a metre of turned beech with a leather-wrapped grip, a
cord to hang it by the hearth, a crack mended with copper wire and polenta still stuck to the
blade (she never washes it).

    blender -b --python assets/blender/mescul.py -- <out.glb> [preview-folder]

The game reads these node names: `body` (nothing moves on its own: the whole paddle swings)
and the points `muzzle` (the tip of the blade) and `left` (the left hand on the shaft).

Textures of its own, from Poly Haven (CC0): `mescul_beech` is "ash_veneer", `mescul_leather`
is "brown_leather".
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
import kit
from kit import cut, lathe, marker, material, part, slab, tube
from mathutils import Matrix, Vector, noise

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

# the exporter clamps a colour that multiplies a texture to 1: a pale wood needs a pale photograph
BEECH = material("beech", (1.0, 0.90, 0.70), roughness=0.6, texture="mescul_beech", scale=2.0)
BURNT = material("burnt-beech", (0.30, 0.17, 0.09), roughness=0.6, texture="mescul_beech", scale=2.0)
LEATHER = material("leather", (1.0, 0.95, 0.85), roughness=0.8, texture="mescul_leather", scale=9.0)
CORD = material("cord", (0.50, 0.38, 0.20), roughness=0.95)
COPPER = material("copper", (0.95, 0.55, 0.35), metallic=1.0, roughness=0.36)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.32)
POLENTA = material("polenta", (0.86, 0.50, 0.05), roughness=0.72)
CRUST = material("polenta-crust", (0.55, 0.27, 0.04), roughness=0.9)


# --- helpers of this weapon -------------------------------------------------------------------

def _normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def frames(pts, closed=False):
    """A point, a normal and a binormal for each point of a line: the normal is carried along without twisting."""
    pts = [Vector(p) for p in pts]
    n, out, normal = len(pts), [], None
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if closed or i > 0 else p
        b = pts[(i + 1) % n] if closed or i < n - 1 else p
        t = (b - a).normalized()
        normal = t.orthogonal().normalized() if normal is None else (normal - t * normal.dot(t)).normalized()
        out.append((p, normal, t.cross(normal)))
    return out


def pipe(name, pts, radius, mat, steps=8, closed=False):
    """A round section swept along `pts`."""
    fr = frames(pts, closed)
    n = len(fr)
    verts, faces = [], []
    for p, u, v in fr:
        for k in range(steps):
            a = 2 * math.pi * k / steps
            verts.append(tuple(p + (u * math.cos(a) + v * math.sin(a)) * radius))
    for i in range(n if closed else n - 1):
        a, b = i * steps, ((i + 1) % n) * steps
        for k in range(steps):
            j = (k + 1) % steps
            faces.append((a + k, b + k, b + j, a + j))
    if not closed:
        faces += [tuple(reversed(range(steps))), tuple(range((n - 1) * steps, n * steps))]
    return _normals(kit._object(name, verts, faces, mat))


def spline(ctrl, n=8, closed=False):
    """A smooth line through the control points."""
    P = [Vector(p) for p in ctrl]
    m, out = len(P), []
    for i in range(m if closed else m - 1):
        p0 = P[(i - 1) % m] if closed or i > 0 else P[i]
        p1, p2 = P[i], P[(i + 1) % m]
        p3 = P[(i + 2) % m] if closed or i + 2 < m else p2
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    if not closed:
        out.append(P[-1])
    return out


def rope(name, pts, radius, mat, strands=3, turns=10, closed=False):
    """Strands twisted around `pts`, as a laid cord is."""
    fr = frames(pts, closed)
    n = len(fr)
    out = []
    for s in range(strands):
        line = []
        for i, (p, u, v) in enumerate(fr):
            a = 2 * math.pi * (s / strands + turns * i / (n if closed else n - 1))
            line.append(p + (u * math.cos(a) + v * math.sin(a)) * radius * 0.52)
        out.append(pipe(f"{name}{s}", line, radius * 0.56, mat, steps=5, closed=closed))
    return out


def wrap(name, period, turns, pitch, start, mat, steps=28):
    """A strip wound around Y from `start`; `period` is one turn's profile, [(radius, 0..1 along the pitch)]."""
    m = len(period)
    rows = m * turns + 1
    verts, faces = [], []
    for i in range(rows):
        r, a = period[i % m]
        y = start + (i // m + a) * pitch
        for k in range(steps):
            t = 2 * math.pi * k / steps
            verts.append((r * math.cos(t), y + pitch * k / steps, r * math.sin(t)))
    for i in range(rows - 1):
        for k in range(steps - 1):
            faces.append((i * steps + k, (i + 1) * steps + k, (i + 1) * steps + k + 1, i * steps + k + 1))
        if i + 1 + m < rows:  # the seam: a turn later, one pitch further on
            faces.append((i * steps + steps - 1, (i + 1) * steps + steps - 1, (i + 1 + m) * steps, (i + m) * steps))
    return _normals(kit._object(name, verts, faces, mat))


def blob(name, radii, at, mat, rot=(0, 0, 0), rough=0.12, grain=0.03, seed=0.0, steps=24, rings=14):
    """A lump of something soft: an ellipsoid whose surface is pushed in and out."""
    prof = [(math.sin(math.pi * i / rings), -math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0], prof[-1] = (0, -1), (0, 1)
    o = lathe(name, prof, at, mat, steps=steps)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in o.data.vertices:
        d = v.co.normalized()
        k = 1 + rough * noise.noise(d * 1.7 + off) + grain * noise.noise(d * 6.0 + off)
        v.co = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * k
    o.rotation_euler = rot
    return o


def join(name, parts):
    """One object out of parts that keep their own hard and soft edges."""
    kit._select(parts)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


# --- the shaft, turned in one piece ---------------------------------------------------------
# (radius, distance along the shaft); the grip is at 0, the pommel behind it, the blade far ahead
def taper(y):
    return 0.0159 - 0.0019 * (y - 0.112) / 0.51


shaft_profile = [(0.0176 * math.sin(2.42 * i / 12), -0.1625 - 0.0176 * math.cos(2.42 * i / 12)) for i in range(13)]  # the pommel, a ball
shaft_profile += [
    (0.0107, -0.1455), (0.0104, -0.1425), (0.0110, -0.1395), (0.0130, -0.1362), (0.0152, -0.1325), (0.0165, -0.128), (0.0169, -0.123), (0.0165, -0.117), (0.0158, -0.108),
    (0.0158, -0.091), (0.0165, -0.0885), (0.0171, -0.0855), (0.0171, -0.0825), (0.0165, -0.0795), (0.0158, -0.077),  # a bead behind the leather
    (0.0158, 0.078), (0.0170, 0.0805), (0.0180, 0.084), (0.0184, 0.088), (0.0180, 0.092), (0.0168, 0.0955), (0.0154, 0.098), (0.0149, 0.101), (0.0153, 0.104), (0.0160, 0.107), (0.0159, 0.112),
]
for y in (0.50, 0.54, 0.60):  # the seats of the three burnt rings
    r = taper(y)
    shaft_profile += [(r, y - 0.0052), (r - 0.0014, y - 0.0040), (r - 0.0014, y + 0.0040), (r, y + 0.0052)]
shaft_profile += [(0.0140, 0.622), (0.0131, 0.640), (0.0112, 0.662), (0.0088, 0.688), (0.0068, 0.712), (0.0052, 0.735), (0, 0.742)]
shaft = lathe("shaft", shaft_profile, (0, 0, 0), BEECH, steps=32)
cut(shaft, [tube("cord-hole", 0.0042, 0.06, (0, -0.1625, -0.03), None, axis="Z", steps=16, bevel=0)])

rings = []
for i, y in enumerate((0.50, 0.54, 0.60)):
    r = taper(y) - 0.0014
    rings.append(lathe(f"burnt-ring{i}", [(r, -0.0040), (r + 0.0018, -0.0032), (r + 0.0027, -0.0015), (r + 0.0029, 0.0), (r + 0.0027, 0.0015), (r + 0.0018, 0.0032), (r, 0.0040)], (0, y, 0), BURNT, steps=32))
# two lines burnt in with a wire while it turned on the lathe, ahead of the grip
rings += [lathe(f"burnt-line{i}", [(0.0155, -0.0009), (0.01588, -0.0005), (0.01588, 0.0005), (0.0155, 0.0009)], (0, y, 0), BURNT, steps=32) for i, y in enumerate((0.124, 0.131))]

# --- the blade: the shaft flattens into a paddle, thinner towards the tip ------------------------
def half_width(y):
    if y < 0.74:
        t = (y - 0.63) / 0.11
        return 0.0118 + (0.0272 - 0.0118) * (3 * t * t - 2 * t ** 3)
    if y < 0.79:
        return 0.0272
    t = (y - 0.79) / 0.05
    return 0.0272 * math.sqrt(max(0.0, 1 - t * t))


ys = [0.630 + 0.110 * i / 10 for i in range(11)] + [0.765, 0.79] + [0.79 + 0.05 * math.sin(math.pi / 2 * i / 10) for i in range(1, 11)]
outline = [(y, half_width(y)) for y in ys] + [(y, -half_width(y)) for y in reversed(ys[:-1])]
blade = slab("blade", outline, 0.016, BEECH, bevel=0.0038, segments=3)
for v in blade.data.vertices:
    v.co.x *= 1.0 - 0.36 * max(0.0, min(1.0, (v.co.y - 0.64) / 0.20))  # 16 mm at the neck, 10 at the tip
blade.rotation_euler = (0, math.pi / 2, 0)  # the outline was drawn on its face: lay it flat

# --- the grip: a leather strip wound on, whipped at both ends ---------------------------------------
strip = wrap("grip-wrap", [(0.0180, 0.0), (0.0197, 0.10), (0.0194, 0.55), (0.0190, 0.93)], 11, 0.0125, -0.0745, LEATHER)
collars = [lathe(f"grip-collar{i}", [(0.0160, 0), (0.0196, 0.0006), (0.0206, 0.0022), (0.0206, 0.0068), (0.0196, 0.0084), (0.0160, 0.009)], (0, y, 0), LEATHER, steps=28) for i, y in enumerate((-0.0775, 0.0685))]
tacks = [lathe(f"tack{i}", [(0, 0.0018), (0.0016, 0.0014), (0.0026, 0.0002), (0.0028, -0.001)], (0.0204, y, 0), BRASS, axis="X", steps=12) for i, y in enumerate((-0.073, 0.073))]
for t in tacks:  # the head faces outwards
    t.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    t.data.flip_normals()

# --- the crack by the neck, bound with copper wire ---------------------------------------------------
wire_pts = [((taper(0.57) + 0.0008) * math.cos(2 * math.pi * i / 18), 0.566 + 0.0019 * i / 18, (taper(0.57) + 0.0008) * math.sin(2 * math.pi * i / 18)) for i in range(18 * 10 + 1)]
wire = pipe("wire", wire_pts, 0.00095, COPPER, steps=5)
# the two ends twisted together and bent flat
twist = rope("wire-twist", spline([(0.0146, 0.566, 0.0052), (0.0172, 0.570, 0.0062), (0.0178, 0.576, 0.0040), (0.0170, 0.582, 0.0022)], n=8), 0.0015, COPPER, strands=2, turns=3)

hard = part("hard", [shaft, *rings, blade, strip, *collars, *tacks, wire, *twist])

# --- the cord it hangs from, through the pommel ----------------------------------------------------
loop = spline([(0, -0.1625, 0.0), (0, -0.165, 0.016), (0, -0.180, 0.0255), (0, -0.200, 0.022), (0, -0.2125, 0.008), (0, -0.2125, -0.008), (0, -0.200, -0.022), (0, -0.180, -0.0255), (0, -0.165, -0.016)], n=14, closed=True)
cord = rope("cord", loop, 0.0030, CORD, turns=11, closed=True)
knot = blob("cord-knot", (0.0052, 0.0050, 0.0066), (0, -0.2125, 0.0), CORD, rough=0.25, grain=0.0, seed=4.0, steps=14, rings=8)

# --- the polenta nobody scraped off -------------------------------------------------------------------
polenta = [
    # the skin it left on both faces of the blade, thicker towards the tip
    blob("polenta-skin-top", (0.0235, 0.058, 0.0070), (0.002, 0.772, 0.0035), POLENTA, rough=0.22, grain=0.04, seed=1.0, steps=36, rings=22),
    blob("polenta-skin-under", (0.021, 0.046, 0.0064), (-0.003, 0.785, -0.0035), POLENTA, rough=0.25, grain=0.04, seed=2.0, steps=32, rings=18),
    # and the lumps
    blob("lump0", (0.0250, 0.0220, 0.0135), (0.012, 0.722, 0.0100), POLENTA, rot=(0.1, 0.2, 0.5), rough=0.24, grain=0.035, seed=3.0, steps=30, rings=16),
    blob("lump1", (0.0200, 0.0180, 0.0115), (-0.016, 0.782, -0.0090), POLENTA, rot=(0.2, -0.1, 1.1), rough=0.24, grain=0.035, seed=5.0),
    blob("lump2", (0.0170, 0.0160, 0.0100), (0.009, 0.668, -0.0100), POLENTA, rot=(-0.1, 0.1, 0.3), rough=0.24, grain=0.035, seed=7.0),
    blob("lump3", (0.0150, 0.0135, 0.0088), (0.001, 0.812, 0.0085), POLENTA, rot=(0.0, 0.2, 2.0), rough=0.24, grain=0.035, seed=9.0),
    blob("lump4", (0.0135, 0.0125, 0.0080), (-0.011, 0.692, 0.0100), POLENTA, rot=(0.2, 0.0, 0.8), rough=0.24, grain=0.035, seed=11.0),
    blob("lump5", (0.0100, 0.0105, 0.0060), (0.0125, 0.607, -0.0065), POLENTA, rot=(0.0, -0.5, 0.2), rough=0.24, grain=0.035, seed=13.0, steps=18, rings=10),
    # crumbs gone dark and hard
    blob("crust0", (0.0065, 0.0080, 0.0040), (-0.017, 0.742, 0.0068), CRUST, rough=0.3, grain=0.08, seed=15.0, steps=14, rings=8),
    blob("crust1", (0.0050, 0.0058, 0.0034), (0.016, 0.800, -0.0052), CRUST, rough=0.3, grain=0.08, seed=17.0, steps=14, rings=8),
    blob("crust2", (0.0042, 0.0050, 0.0030), (0.004, 0.645, 0.0105), CRUST, rough=0.3, grain=0.08, seed=19.0, steps=14, rings=8),
    blob("crust3", (0.0036, 0.0046, 0.0028), (-0.0125, 0.627, 0.0062), CRUST, rough=0.3, grain=0.08, seed=21.0, steps=14, rings=8),
]
soft = part("soft", [*cord, knot, *polenta], crease=180)

body = join("body", [hard, soft])

marker("muzzle", (0, 0.84, 0))
marker("left", (0, 0.24, 0))
kit.drop_cutters()

if len(args) > 1:
    # from the hip (in the game it is held raised and tilted: this one is only indicative), the whole
    # length, and the two ends up close
    kit.preview(os.path.join(args[1], "mescul-fp.png"), eye=(-0.2, -0.38, 0.2), target=(-0.2, 1.0, 0.2), lens=17.5)
    kit.preview(os.path.join(args[1], "mescul-side.png"), eye=(-1.25, 0.33, 0.75), target=(0, 0.33, 0), lens=50)
    kit.preview(os.path.join(args[1], "mescul-blade.png"), eye=(-0.16, 0.50, 0.16), target=(0, 0.72, 0), lens=50)
    kit.preview(os.path.join(args[1], "mescul-grip.png"), eye=(-0.22, -0.30, 0.14), target=(0, -0.06, 0), lens=50)
kit.export(args[0])
