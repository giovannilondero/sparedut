"""
Il Cjanon des Gjalinis: a tinsmith's brass tube strapped to the forearm, with a bell mouth, a
loading hatch and a pressure gauge, a feather left stuck in it, and the next hen sitting in
the mouth, craning her neck out to see where she is going.

    blender -b --python assets/blender/gjalinis.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving part `frico` (the hen, hidden for a moment
after each shot: her origin is where the game hangs her, in the mouth) and the point `muzzle`.
It is held with one hand: there is no `left`.

The beaten sheet is `miedi_copper` (drawn by miedi.py), the leather `mescul_leather` (Poly
Haven "brown_leather", CC0).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
import kit
from kit import box, lathe, marker, material, part, ribbon, slab, tube
from mathutils import Matrix, Vector, noise

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

R = 0.062  # the tube's radius
AZ = 0.075  # and the height of its axis above the grip

# three tiles of the beaten sheet go once around the tube; the blows are faint on a rolled tube
SHEET = material("brass-sheet", (0.88, 0.64, 0.27), metallic=1.0, roughness=0.32, texture="miedi_copper", scale=3 / (2 * math.pi * R))
if "Normal Map" in SHEET.node_tree.nodes:
    SHEET.node_tree.nodes["Normal Map"].inputs["Strength"].default_value = 0.32
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
COPPER = material("copper", (0.95, 0.55, 0.35), metallic=1.0, roughness=0.34)
BAND = material("old-copper", (0.52, 0.30, 0.17), metallic=1.0, roughness=0.46)
STEEL = material("blued-steel", (0.16, 0.175, 0.20), metallic=1.0, roughness=0.42)
WORN = material("worn-steel", (0.42, 0.43, 0.44), metallic=1.0, roughness=0.26)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
LEATHER = material("leather", (1.0, 0.95, 0.85), roughness=0.8, texture="mescul_leather", scale=9.0)
BLACK = material("bakelite", (0.025, 0.022, 0.02), roughness=0.3)
ENAMEL = material("white-enamel", (0.88, 0.87, 0.82), roughness=0.25)
RED = material("red-enamel", (0.62, 0.03, 0.03), roughness=0.3)
INK = material("ink", (0.03, 0.03, 0.035), roughness=0.5)
FEATHER = material("feather", (0.90, 0.88, 0.82), roughness=0.85)
COMB = material("comb", (0.70, 0.045, 0.035), roughness=0.5)
BEAK = material("beak", (0.88, 0.52, 0.07), roughness=0.42)
EYE = material("eye", (0.012, 0.01, 0.01), roughness=0.08)
IRIS = material("iris", (0.80, 0.33, 0.04), roughness=0.3)


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
    """A round section swept along `pts`; `radius` may be a list, one for each point."""
    fr = frames(pts, closed)
    n = len(fr)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    verts, faces = [], []
    for (p, u, v), r in zip(fr, radii):
        for k in range(steps):
            a = 2 * math.pi * k / steps
            verts.append(tuple(p + (u * math.cos(a) + v * math.sin(a)) * r))
    for i in range(n if closed else n - 1):
        a, b = i * steps, ((i + 1) % n) * steps
        for k in range(steps):
            j = (k + 1) % steps
            faces.append((a + k, b + k, b + j, a + j))
    if not closed:
        faces += [tuple(reversed(range(steps))), tuple(range((n - 1) * steps, n * steps))]
    return _normals(kit._object(name, verts, faces, mat))


def spline(ctrl, n=8, closed=False):
    """A smooth line through the control points (which may carry more than three numbers: a radius too)."""
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


def band(name, pts, side, width, thick, mat, bevel=0.0015):
    """A flat strap swept along `pts`; `side` is the direction of its width."""
    side = Vector(side).normalized()
    pts = [Vector(p) for p in pts]
    n = len(pts)
    verts, faces = [], []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        up = side.cross(t).normalized()
        verts += [tuple(p + side * sw * width / 2 + up * su * thick / 2) for sw, su in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(n - 1):
        for k in range(4):
            j = (k + 1) % 4
            faces.append((i * 4 + k, (i + 1) * 4 + k, (i + 1) * 4 + j, i * 4 + j))
    faces += [(3, 2, 1, 0), tuple(range((n - 1) * 4, n * 4))]
    return kit._finish(_normals(kit._object(name, verts, faces, mat)), bevel, 2)


def blob(name, radii, at, mat, rot=(0, 0, 0), rough=0.0, seed=0.0, steps=16, rings=10):
    """An ellipsoid, its surface pushed in and out if `rough`."""
    prof = [(math.sin(math.pi * i / rings), -math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0], prof[-1] = (0, -1), (0, 1)
    o = lathe(name, prof, at, mat, steps=steps)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in o.data.vertices:
        d = v.co.normalized()
        v.co = Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * (1 + rough * noise.noise(d * 1.7 + off))
    o.rotation_euler = rot
    return o


def place(o, m):
    """Moves an object built in a frame of its own to where it belongs."""
    o.data.transform(m @ o.matrix_basis)
    o.matrix_basis = Matrix.Identity(4)
    return o


def facing(at, z, y=(0, 0, 1)):
    """The frame at `at` whose Z points along `z`, and whose Y leans towards `y`."""
    z = Vector(z).normalized()
    x = Vector(y).cross(z).normalized()
    m = Matrix((x, z.cross(x), z)).transposed().to_4x4()
    m.translation = Vector(at)
    return m


def on_tube(angle, radius, y):
    """The frame of something built pointing up (+Z) from the origin, set on the tube at `angle` around it."""
    return Matrix.Translation((radius * math.cos(angle), y, AZ + radius * math.sin(angle))) @ Matrix.Rotation(math.pi / 2 - angle, 4, "Y")


def patch(name, r0, r1, a0, a1, y0, y1, mat, bevel=0.0006, segs=10):
    """A plate curved to the tube: between two radii, two angles around it and two stations along it."""
    verts, faces = [], []
    for r in (r0, r1):
        for y in (y0, y1):
            for i in range(segs + 1):
                a = a0 + (a1 - a0) * i / segs
                verts.append((r * math.cos(a), y, AZ + r * math.sin(a)))
    n = segs + 1
    for i in range(segs):
        faces += [(i, i + 1, n + i + 1, n + i), (2 * n + i, 3 * n + i, 3 * n + i + 1, 2 * n + i + 1)]
        faces += [(i, 2 * n + i, 2 * n + i + 1, i + 1), (n + i, n + i + 1, 3 * n + i + 1, 3 * n + i)]
    faces += [(0, n, 3 * n, 2 * n), (segs, 2 * n + segs, 3 * n + segs, n + segs)]
    return kit._finish(_normals(kit._object(name, verts, faces, mat)), bevel, 2)


def rivet(name, mat, r=0.0024):
    return lathe(name, [(r, -0.0004), (r * 0.9, 0.0007), (r * 0.5, 0.0014), (0, 0.0016)], (0, 0, 0), mat, axis="Z", steps=8)


def join(name, parts):
    """One object out of parts that keep their own hard and soft edges."""
    kit._select(parts)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def plain_uv(o):
    """What has no texture needs no UVs: left as projected, they would only split its vertices in the file."""
    me = o.data
    uv = me.uv_layers[0].data
    plain = [not any(n.type == "TEX_IMAGE" for n in m.node_tree.nodes) for m in me.materials]
    for poly in me.polygons:
        if plain[poly.material_index]:
            for li in poly.loop_indices:
                uv[li].uv = (0, 0)
    return o


def wrap_uv(o, mat):
    """Rolls the texture around the tube instead of projecting it from the sides."""
    me = o.data
    uv = me.uv_layers[0].data
    index = list(me.materials).index(mat)
    for poly in me.polygons:
        if poly.material_index != index:
            continue
        a0 = math.atan2(poly.center.z - AZ, poly.center.x)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a = a0 if math.hypot(v.x, v.z - AZ) < 1e-5 else a0 + (math.atan2(v.z - AZ, v.x) - a0 + math.pi) % (2 * math.pi) - math.pi
            uv[li].uv = (v.y, a * R)


# --- the tube: closed behind, a bell at the mouth, hollow as far as the hen needs ------------------
tube_profile = [
    (0, -0.2725), (0.022, -0.2715), (0.042, -0.2680), (0.0545, -0.2625), (0.0605, -0.2555), (R, -0.2480), (R, 0.352),
    (0.0626, 0.368), (0.0642, 0.383), (0.0672, 0.397), (0.0715, 0.410), (0.0765, 0.4205), (0.0780, 0.4250),
    (0.0752, 0.4250), (0.0700, 0.4120), (0.0655, 0.3985), (0.0622, 0.3840), (0.0603, 0.3690), (0.0595, 0.352), (0.0595, 0.215), (0, 0.215),
]
barrel = lathe("tube", tube_profile, (0, 0, AZ), SHEET, steps=48)
# the edge of the bell is rolled over a wire ring
lip = lathe("lip", [(0.0772 + 0.0052 * math.cos(2 * math.pi * i / 12), 0.4268 + 0.0052 * math.sin(2 * math.pi * i / 12)) for i in range(13)], (0, 0, AZ), BAND, steps=48)
# hoops shrunk on, riveted; and the seam of the sheet, lapped and riveted along the shooter's side
hoops, rivets = [], []
for i, y in enumerate((0.28, 0.12, -0.04)):
    hoops.append(lathe(f"hoop{i}", [(R - 0.001, -0.0075), (R + 0.0016, -0.0075), (R + 0.0023, -0.0060), (R + 0.0016, -0.0045), (R + 0.0016, 0.0045), (R + 0.0023, 0.0060), (R + 0.0016, 0.0075), (R - 0.001, 0.0075)], (0, y, AZ), BAND, steps=48))
    rivets += [place(rivet(f"hoop-rivet{i}-{k}", BRASS, 0.0022), on_tube(2 * math.pi * (k + 0.5) / 12, R + 0.0016, y)) for k in range(12)]
SEAM = math.radians(133)
seam = patch("seam", R - 0.001, R + 0.0010, SEAM - 0.006 / R, SEAM + 0.006 / R, -0.246, 0.352, SHEET, bevel=0.0005, segs=3)
rivets += [place(rivet(f"seam-rivet{k}", BRASS, 0.0019), on_tube(SEAM, R + 0.0010, -0.232 + 0.0282 * k)) for k in range(21) if abs((-0.232 + 0.0282 * k + 0.04) % 0.16 - 0.0) > 0.012]

# --- the loading hatch on top: a copper collar, a hinged lid with its latch and the pressure knob ---
HATCH = 0.12
collar = lathe("hatch-collar", [(0, 0.112), (0.0405, 0.112), (0.0405, 0.1235), (0.0385, 0.1260), (0.0345, 0.1268), (0.0340, 0.1290), (0.0340, 0.1590), (0.0352, 0.1600), (0.0352, 0.1618), (0, 0.1618)], (0, HATCH, 0), COPPER, axis="Z", steps=32)
lid = lathe("hatch-lid", [(0, 0.1612), (0.0372, 0.1612), (0.0380, 0.1622), (0.0380, 0.1672), (0.0368, 0.1688), (0.0300, 0.1712), (0.0180, 0.1730), (0, 0.1736)], (0, HATCH, 0), BAND, axis="Z", steps=32)
lid_rivets = [place(rivet(f"lid-rivet{k}", BRASS, 0.0020), Matrix.Translation((0.0305 * math.cos(a), HATCH + 0.0305 * math.sin(a), 0.1706)) @ Matrix.Rotation(0.22, 4, Vector((-math.sin(a), math.cos(a), 0)))) for k, a in enumerate(2 * math.pi * (k + 0.5) / 8 for k in range(8))]
# the hinge behind, towards the shooter
hinge = [tube("hinge-pin", 0.0017, 0.034, (-0.017, HATCH - 0.0405, 0.1655), WORN, axis="X", steps=10, bevel=0.0003)]
hinge += [lathe(f"hinge-knuckle{i}", [(0, 0), (0.0036, 0), (0.0036, 0.0085), (0, 0.0085)], (x, HATCH - 0.0405, 0.1655), BRASS, axis="X", steps=12, bevel=0.0005) for i, x in enumerate((-0.0145, -0.0042, 0.0061))]
hinge.append(box("hinge-leaf-lid", (0.030, 0.016, 0.0022), (0, HATCH - 0.0325, 0.1692), BRASS, bevel=0.0008, rot=(0.12, 0, 0)))
hinge.append(box("hinge-leaf-collar", (0.030, 0.0022, 0.020), (0, HATCH - 0.0362, 0.1535), BRASS, bevel=0.0008))
# the latch in front: a swing bolt with a wing nut
latch = [box("latch-ear", (0.012, 0.010, 0.004), (0, HATCH + 0.0405, 0.1672), BRASS, bevel=0.001)]
latch.append(tube("latch-bolt", 0.0021, 0.030, (0, HATCH + 0.0415, 0.150), WORN, axis="Z", steps=10, bevel=0.0003))
latch.append(lathe("latch-boss", [(0, 0), (0.0048, 0), (0.0048, 0.0045), (0.0030, 0.0055), (0, 0.0055)], (0, HATCH + 0.0415, 0.1692), BRASS, axis="Z", steps=14, bevel=0.0004))
latch += [box(f"latch-wing{s}", (0.0095, 0.0022, 0.0085), (s * 0.0072, HATCH + 0.0415, 0.1765), BRASS, bevel=0.001, rot=(0, -s * 0.45, 0)) for s in (-1, 1)]
latch.append(box("latch-lug", (0.010, 0.008, 0.008), (0, HATCH + 0.0385, 0.150), BRASS, bevel=0.0015))
# the black knob that lets the pressure off
knob = [lathe("knob-stem", [(0, 0.170), (0.0058, 0.170), (0.0058, 0.1745), (0.0034, 0.1755), (0.0034, 0.180), (0, 0.180)], (0.019, HATCH, 0), BRASS, axis="Z", steps=16)]
knob.append(lathe("knob", [(0, 0.1795), (0.0050, 0.1795), (0.0082, 0.1815), (0.0092, 0.1850), (0.0086, 0.1890), (0.0060, 0.1915), (0, 0.1922)], (0.019, HATCH, 0), BLACK, axis="Z", steps=20))

# --- the pressure gauge, on a bent pipe, turned to face the shooter -----------------------------------
GAUGE = facing((-0.0850, 0.056, 0.1075), (-0.56, -0.60, 0.57))
gauge = [lathe("gauge-case", [(0, -0.0100), (0.0185, -0.0100), (0.0212, -0.0078), (0.0212, 0.0020), (0.0236, 0.0030), (0.0240, 0.0052), (0.0228, 0.0072), (0.0206, 0.0076), (0.0202, 0.0046), (0, 0.0046)], (0, 0, 0), BRASS, axis="Z", steps=28)]
gauge.append(lathe("gauge-dial", [(0, 0.0040), (0.0203, 0.0040), (0.0203, 0.0050), (0, 0.0050)], (0, 0, 0), ENAMEL, axis="Z", steps=28))
for k in range(11):  # the scale: the last marks are in the red
    a = math.radians(225 - 27 * k)
    long = k % 2 == 0
    gauge.append(box(f"gauge-mark{k}", (0.0036 if long else 0.0024, 0.0008 if k < 8 else 0.0018, 0.0004), (math.cos(a) * 0.0165, math.sin(a) * 0.0165, 0.0051), RED if k >= 8 else INK, bevel=0, rot=(0, 0, a)))
needle = math.radians(225 - 27 * 8.6)  # well into the red, as usual
gauge.append(box("gauge-needle", (0.0165, 0.0011, 0.0005), (math.cos(needle) * 0.0060, math.sin(needle) * 0.0060, 0.0058), RED, bevel=0, rot=(0, 0, needle)))
gauge.append(lathe("gauge-hub", [(0, 0.0050), (0.0022, 0.0050), (0.0022, 0.0062), (0.0012, 0.0066), (0, 0.0066)], (0, 0, 0), BRASS, axis="Z", steps=12))
gauge = [place(o, GAUGE) for o in gauge]
back = GAUGE @ Vector((0, 0, -0.010))
foot = Vector((R * math.cos(math.radians(158)), 0.078, AZ + R * math.sin(math.radians(158))))
radial = Vector((math.cos(math.radians(158)), 0, math.sin(math.radians(158))))
gauge.append(pipe("gauge-pipe", spline([foot - radial * 0.004, foot + radial * 0.010, back - (GAUGE.to_3x3() @ Vector((0, 0, 1))) * 0.012, back + (GAUGE.to_3x3() @ Vector((0, 0, 1))) * 0.002], n=6), 0.0036, BRASS, steps=10))
gauge.append(place(lathe("gauge-flange", [(0, -0.002), (0.0085, -0.002), (0.0085, 0.0018), (0.0060, 0.0030), (0.0060, 0.0055), (0, 0.0055)], (0, 0, 0), BRASS, axis="Z", steps=6, bevel=0.0006), on_tube(math.radians(158), R, 0.078)))

# --- the handle underneath, for the hand, and the trigger -----------------------------------------------
bracket = slab("bracket", [(-0.014, 0.018), (-0.014, 0.005), (-0.006, -0.002), (0.064, -0.002), (0.082, 0.006), (0.082, 0.018)], 0.024, STEEL, bevel=0.003)
bracket_feet = [box(f"bracket-foot{i}", (0.050, 0.012, 0.010), (0, y, 0.0165), STEEL, bevel=0.0025) for i, y in enumerate((-0.006, 0.074))]
handle = lathe("handle", [(0.0100, -0.0745), (0.0138, -0.0700), (0.0152, -0.0620), (0.0146, -0.0500), (0.0136, -0.0400), (0.0142, -0.0290), (0.0152, -0.0180), (0.0146, -0.0090), (0.0128, -0.0040)], (0, 0.02, 0), WOOD, axis="Z", steps=28)
handle_caps = [lathe("handle-pommel", [(0, -0.0800), (0.0085, -0.0795), (0.0122, -0.0770), (0.0128, -0.0745), (0.0105, -0.0738), (0, -0.0738)], (0, 0.02, 0), BRASS, axis="Z", steps=24)]
handle_caps.append(lathe("handle-ferrule", [(0.0125, -0.0048), (0.0150, -0.0042), (0.0154, -0.0020), (0.0150, 0.0000), (0.0120, 0.0002)], (0, 0.02, 0), BRASS, axis="Z", steps=24))
guard = ribbon("guard", [(0.078, 0.001), (0.079, -0.010), (0.071, -0.021), (0.050, -0.024), (0.040, -0.019), (0.0375, -0.006)], 0.0028, 0.013, STEEL)
trigger = box("trigger", (0.006, 0.007, 0.022), (0, 0.058, -0.009), WORN, bevel=0.002, rot=(0.35, 0, 0))

hard = part("hard", [barrel, lip, *hoops, *rivets, seam, collar, lid, *lid_rivets, *hinge, *latch, *knob, *gauge, bracket, *bracket_feet, handle, *handle_caps, guard, trigger])
wrap_uv(hard, SHEET)

# --- the leather cuffs that strap it to the forearm, each drawn tight by a buckled belt ----------------------
soft = []
BUCKLE = math.radians(118)
for i, y in enumerate((-0.12, -0.24)):
    soft.append(lathe(f"cuff{i}", [(R - 0.001, -0.0170), (R + 0.0030, -0.0168), (R + 0.0046, -0.0150), (R + 0.0050, -0.0128), (R + 0.0044, -0.0118), (R + 0.0052, -0.0106), (R + 0.0058, 0.0), (R + 0.0052, 0.0106), (R + 0.0044, 0.0118), (R + 0.0050, 0.0128), (R + 0.0046, 0.0150), (R + 0.0030, 0.0168), (R - 0.001, 0.0170)], (0, y, AZ), LEATHER, steps=36))
    soft.append(lathe(f"belt{i}", [(R + 0.0040, -0.0068), (R + 0.0074, -0.0066), (R + 0.0080, -0.0052), (R + 0.0080, 0.0052), (R + 0.0074, 0.0066), (R + 0.0040, 0.0068)], (0, y, AZ), LEATHER, steps=36))
    # the belt's tail, past the buckle, lifting a little
    tail = [Vector((math.cos(a) * r, y, AZ + math.sin(a) * r)) for a, r in ((BUCKLE + 0.02 + 0.05 * k, R + 0.0094 + 0.00006 * k * k) for k in range(9))]
    soft.append(band(f"belt-tail{i}", tail, (0, 1, 0), 0.0125, 0.0026, LEATHER, bevel=0.001))
cuffs = part("cuffs", soft, crease=60)
buckles = []
for i, y in enumerate((-0.12, -0.24)):
    m = on_tube(BUCKLE, R + 0.0092, y)
    frame = pipe(f"buckle{i}", spline([(-0.0085, -0.0095, 0), (0.0085, -0.0095, 0), (0.0105, -0.0075, 0), (0.0105, 0.0075, 0), (0.0085, 0.0095, 0), (-0.0085, 0.0095, 0), (-0.0105, 0.0075, 0), (-0.0105, -0.0075, 0)], n=3, closed=True), 0.0015, BRASS, steps=8, closed=True)
    buckles.append(place(frame, m))
    buckles.append(place(tube(f"buckle-prong{i}", 0.0011, 0.021, (-0.0105, 0, 0.0012), BRASS, axis="X", steps=8, bevel=0.0002), m))
    buckles.append(place(box(f"belt-keeper{i}", (0.006, 0.016, 0.0042), (0, 0, 0.0008), LEATHER, bevel=0.0012), on_tube(BUCKLE + 0.30, R + 0.0098, y)))
buckles = part("buckles", buckles)

# --- a feather left stuck under the first hoop, as a keepsake ------------------------------------------------------
QUILL = on_tube(math.radians(119), R + 0.0012, 0.268) @ Matrix.Rotation(0.42, 4, "Z") @ Matrix.Rotation(-1.12, 4, "X") @ Matrix.Rotation(-0.5, 4, "Z")  # on the shooter's side, where it shows
quill = pipe("quill", [(0, 0, 0), (0, 0.0005, 0.03), (0, 0.002, 0.06), (0, 0.006, 0.098)], [0.0010, 0.0009, 0.0007, 0.0003], FEATHER, steps=6)
vane = blob("vane", (0.0105, 0.0009, 0.036), (0, 0.0026, 0.064), FEATHER, rot=(-0.06, 0, 0), rough=0.10, seed=3.0, steps=14, rings=12)
for v in vane.data.vertices:  # a feather is not flat: it curls, and it is widest below the middle
    v.co.y += 30 * v.co.x * v.co.x + 1.5 * v.co.z * v.co.z
    v.co.x *= 1 - 0.35 * v.co.z / 0.036
down = [blob(f"down{s}", (0.0050, 0.0010, 0.0080), (s * 0.003, 0.0012, 0.026), FEATHER, rot=(0, s * 0.5, 0), rough=0.3, seed=5.0 + s, steps=8, rings=6) for s in (-1, 1)]
feather = part("feather", [place(o, QUILL) for o in (quill, vane, *down)], crease=180)

body = plain_uv(join("body", [hard, cuffs, buckles, feather]))

# --- the hen ---------------------------------------------------------------------------------------------------
PERCH = (0, 0.36, 0.085)  # where the game hangs her
hen = [
    blob("hen-body", (0.0470, 0.0720, 0.0450), (0, 0.352, 0.0780), FEATHER, rot=(0.10, 0, 0), rough=0.04, seed=1.0, steps=28, rings=16),
    blob("hen-breast", (0.0400, 0.0400, 0.0390), (0, 0.390, 0.0800), FEATHER, rough=0.05, seed=2.0, steps=24, rings=14),
]
# she stretches her neck out under the lip of the bell and up, to look over it
neck = spline([(0, 0.380, 0.088, 0.0350), (0, 0.412, 0.1040, 0.0300), (0, 0.4370, 0.1200, 0.0245), (0, 0.4520, 0.1400, 0.0205), (0, 0.4575, 0.1580, 0.0185), (0, 0.4590, 0.1680, 0.0160)], n=5)
hen.append(pipe("hen-neck", [p.xyz for p in neck], [p.w for p in neck], FEATHER, steps=20))


def plume(name, at, along, outward, radii, mat=FEATHER, seed=0.0):
    """A feather lying on her: `radii` are its half width, half thickness and half length."""
    return place(blob(name, radii, (0, 0, 0), mat, rough=0.12, seed=seed, steps=8, rings=6), facing(at, along, outward))


# the hackles, lying down the neck in two rows
for row, (y, z, r, n, size) in enumerate(((0.4480, 0.1330, 0.0200, 9, 0.0125), (0.4300, 0.1130, 0.0255, 11, 0.0150), (0.4080, 0.0990, 0.0310, 12, 0.0170))):
    axis = Vector((0, 0.62, 0.78)) if row == 0 else Vector((0, 0.84, 0.54))
    side = Vector((1, 0, 0))
    up = axis.cross(side)
    for k in range(n):
        a = 2 * math.pi * (k + 0.5 * row) / n
        out = side * math.cos(a) + up * math.sin(a)
        hen.append(plume(f"hackle{row}-{k}", Vector((0, y, z)) + out * (r - 0.0012) - axis * size * 0.55, -axis + out * 0.22, out, (size * 0.50, 0.0020, size), seed=row * 20 + k))
# folded wings, and the tail up behind (inside the tube there is no room to flap)
for s in (-1, 1):
    hen.append(blob(f"wing{s}", (0.0100, 0.0500, 0.0280), (s * 0.0410, 0.345, 0.0850), FEATHER, rot=(0.25, 0, -s * 0.10), rough=0.05, seed=4.0 + s, steps=16, rings=12))
    for k in range(3):
        hen.append(plume(f"flight{s}{k}", (s * (0.0440 - 0.004 * k), 0.312 - 0.010 * k, 0.0760 + 0.010 * k), (0, -0.95, -0.20 + 0.12 * k), (s, 0, 0.2), (0.0085, 0.0022, 0.0260), seed=30 + k))
for k in range(5):
    a = (k - 2) * 0.30
    hen.append(plume(f"tail{k}", (math.sin(a) * 0.020, 0.290, 0.1080 + math.cos(a) * 0.004), (math.sin(a) * 0.5, -0.72, 0.52), (0, 0.5, 0.8), (0.0090, 0.0020, 0.0240), seed=40 + k))
# her legs, tucked: only the cannon's next customer sees them
for s in (-1, 1):
    hen.append(pipe(f"shank{s}", [(s * 0.019, 0.362, 0.040), (s * 0.020, 0.366, 0.0215)], 0.0034, BEAK, steps=8))
    hen += [pipe(f"toe{s}{k}", [(s * 0.020, 0.366, 0.0215), (s * 0.020 + 0.0115 * math.sin(a), 0.366 + 0.0115 * math.cos(a), 0.0185)], [0.0026, 0.0014], BEAK, steps=6) for k, a in enumerate((-0.6, 0.0, 0.6))]

# her head, turned to look ahead with one eye, as hens do
HEAD = Matrix.Translation((0, 0.4600, 0.1690)) @ Matrix.Rotation(math.radians(38), 4, "Z") @ Matrix.Rotation(math.radians(-6), 4, "X") @ Matrix.Rotation(math.radians(-8), 4, "Y")
head = [blob("hen-head", (0.0190, 0.0235, 0.0200), (0, 0, 0), FEATHER, rough=0.03, seed=6.0, steps=24, rings=14)]
head.append(blob("hen-crown", (0.0150, 0.0170, 0.0120), (0, -0.0060, 0.0100), FEATHER, steps=16, rings=10))
upper = lathe("beak-upper", [(0, -0.004), (0.0086, 0.0), (0.0074, 0.006), (0.0052, 0.013), (0.0026, 0.0195), (0, 0.0225)], (0, 0.0185, -0.0005), BEAK, steps=14)
for v in upper.data.vertices:  # flattened, and hooked down at the tip
    v.co.z = v.co.z * (0.78 if v.co.z > 0 else 0.30) - 9.0 * max(0.0, v.co.y - 0.008) ** 2
lower = lathe("beak-lower", [(0, -0.004), (0.0070, 0.0), (0.0056, 0.006), (0.0034, 0.012), (0, 0.0165)], (0, 0.0185, -0.0030), BEAK, steps=14)
for v in lower.data.vertices:
    v.co.z = v.co.z * (0.10 if v.co.z > 0 else 0.55)
head += [upper, lower]
# the comb: five points, the tallest in the middle
comb_outline = [(-0.0200, 0.0080), (-0.0225, 0.0190), (-0.0215, 0.0265), (-0.0160, 0.0235), (-0.0135, 0.0300), (-0.0105, 0.0355), (-0.0060, 0.0285), (-0.0035, 0.0350), (0.0000, 0.0405), (0.0040, 0.0320), (0.0070, 0.0365), (0.0100, 0.0395), (0.0130, 0.0305), (0.0160, 0.0320), (0.0190, 0.0330), (0.0215, 0.0250), (0.0245, 0.0215), (0.0240, 0.0140), (0.0200, 0.0060)]
head.append(slab("comb", comb_outline, 0.0058, COMB, bevel=0.0024, segments=3))
for s in (-1, 1):
    head.append(blob(f"wattle{s}", (0.0042, 0.0058, 0.0100), (s * 0.0048, 0.0170, -0.0200), COMB, rot=(0.25, s * 0.12, 0), rough=0.08, seed=8.0 + s, steps=12, rings=10))
    head.append(blob(f"cheek{s}", (0.0030, 0.0095, 0.0080), (s * 0.0168, 0.0090, -0.0010), COMB, rough=0.1, seed=10.0 + s, steps=12, rings=8))
    head.append(blob(f"earlobe{s}", (0.0022, 0.0042, 0.0050), (s * 0.0178, -0.0030, -0.0070), FEATHER, steps=10, rings=6))
    head.append(blob(f"iris{s}", (0.0024, 0.0046, 0.0046), (s * 0.0176, 0.0105, 0.0040), IRIS, steps=14, rings=8))
    head.append(blob(f"pupil{s}", (0.0020, 0.0027, 0.0027), (s * 0.0190, 0.0108, 0.0040), EYE, steps=12, rings=8))
hen += [place(o, HEAD) for o in head]
frico = plain_uv(part("frico", hen, pivot=PERCH, crease=180))

marker("muzzle", (0, 0.45, AZ))
marker("trigger", (0, 0.0615, -0.008))  # the face the trigger finger presses
kit.drop_cutters()

if len(args) > 1:
    # as the shooter sees it from the hip, from the side, the hen from the front and the hatch from behind
    kit.preview(os.path.join(args[1], "gjalinis-fp.png"), eye=(-0.16, -0.36, 0.19), target=(-0.16, 1.0, 0.19), lens=17.5)
    kit.preview(os.path.join(args[1], "gjalinis-side.png"), eye=(-1.05, 0.09, 0.30), target=(0, 0.09, 0.07), lens=50)
    kit.preview(os.path.join(args[1], "gjalinis-hen.png"), eye=(-0.26, 0.72, 0.22), target=(0, 0.42, 0.11), lens=50)
    kit.preview(os.path.join(args[1], "gjalinis-top.png"), eye=(-0.34, -0.22, 0.34), target=(0, 0.08, 0.10), lens=50)
kit.export(args[0])
