"""
La Cassele dal Miedi: the vineyard's sulphate sprayer turned field hospital. A hammered
copper tank with the red cross enamelled on both sides, the hand pump on top, a suitcase
handle, and the brass lance with its stopcock, its nozzle and a bunch of chamomile tied on.

    blender -b --python assets/blender/miedi.py -- <out.glb> [preview-folder]

The game reads these node names: `body`, the moving part `pouch` (the pump's rod and handle:
its origin is where it leaves the pump) and the points `muzzle` and `left` (the left hand).

`miedi_copper` (hammered copper) is drawn by this script the first time it runs; the leather
is `mescul_leather` (Poly Haven "brown_leather", CC0).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
import kit
from kit import box, cut, lathe, marker, material, part, ribbon, slab, tube
from mathutils import Matrix, Vector, noise

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

R = 0.06  # the tank's radius
TZ = 0.08  # and the height of its axis above the grip
LZ = 0.05  # the lance's axis


def hammered(size=512, cells=21):
    """Draws tex/miedi_copper_{d,n,r}.jpg: copper beaten with a round hammer, tarnished in patches. It tiles."""
    import numpy as np

    paths = {s: os.path.join(kit.HERE, "tex", f"miedi_copper_{s}.jpg") for s in "dnr"}
    if all(os.path.exists(p) for p in paths.values()):
        return
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:size, 0:size] / size
    # every blow leaves a shallow bowl; where two meet there is a ridge
    grid = np.stack(np.meshgrid(np.arange(cells), np.arange(cells)), -1).reshape(-1, 2)
    centres = (grid + rng.uniform(0.05, 0.95, grid.shape)) / cells
    h = np.full((size, size), 1e9)
    for (cx, cy), d in zip(centres, rng.uniform(0, 0.30, len(centres))):
        dx = np.minimum(np.abs(x - cx), 1 - np.abs(x - cx))
        dy = np.minimum(np.abs(y - cy), 1 - np.abs(y - cy))
        h = np.minimum(h, (dx * dx + dy * dy) * cells * cells + d)

    def cloud(beta):
        f = np.fft.fftfreq(size)[:, None] ** 2 + np.fft.fftfreq(size)[None, :] ** 2
        f[0, 0] = 1
        c = np.fft.ifft2((rng.normal(size=(size, size)) + 1j * rng.normal(size=(size, size))) / f ** (beta / 2)).real
        return (c - c.min()) / (c.max() - c.min())

    h = h + 0.5 * cloud(2.6)  # the sheet is not flat either
    slope = 2.2  # a bowl 6 mm wide and a tenth or two deep
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2 * slope
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2 * slope
    k = 1 / np.sqrt(gx * gx + gy * gy + 1)
    normal = np.stack([-gx * k, -gy * k, k], -1) * 0.5 + 0.5
    tarnish = np.clip((cloud(2.4) - 0.42) * 3.2, 0, 1)
    ridge = np.clip((h - h.mean()) * 2.5 + 0.5, 0, 1)  # the ridges are rubbed bright, the bowls stay dull
    shade = 1 - tarnish * 0.22 * (1 - 0.5 * ridge)
    colour = np.stack([shade, shade ** 1.25, shade ** 1.4], -1) * (0.94 + 0.06 * ridge[..., None])
    rough = 0.25 + 0.20 * tarnish + 0.07 * (1 - ridge) + 0.05 * cloud(1.2)
    for s, a in (("d", colour), ("n", normal), ("r", np.repeat(rough[..., None], 3, -1))):
        img = bpy.data.images.new("drawn", size, size)
        img.pixels.foreach_set(np.concatenate([np.clip(a, 0, 1), np.ones((size, size, 1))], -1).astype(np.float32).ravel())
        img.filepath_raw = paths[s]
        img.file_format = "JPEG"
        img.save()
        bpy.data.images.remove(img)


hammered()

# three tiles of the hammered sheet go once around the tank
COPPER = material("copper", (0.95, 0.55, 0.35), metallic=1.0, roughness=0.36, texture="miedi_copper", scale=3 / (2 * math.pi * R))
BAND = material("old-copper", (0.52, 0.30, 0.17), metallic=1.0, roughness=0.46)
BRASS = material("brass", (0.85, 0.62, 0.26), metallic=1.0, roughness=0.3)
STEEL = material("blued-steel", (0.16, 0.175, 0.20), metallic=1.0, roughness=0.42)
WORN = material("worn-steel", (0.42, 0.43, 0.44), metallic=1.0, roughness=0.26)
WOOD = material("walnut", (0.46, 0.25, 0.15), roughness=0.5, texture="walnut", scale=3.2)
PALE = material("pale-wood", (0.95, 0.62, 0.36), roughness=0.5, texture="walnut", scale=5.0)
LEATHER = material("leather", (1.0, 0.95, 0.85), roughness=0.8, texture="mescul_leather", scale=9.0)
ENAMEL = material("white-enamel", (0.86, 0.85, 0.80), roughness=0.22)
RED = material("red-enamel", (0.62, 0.03, 0.03), roughness=0.25)
TWINE = material("twine", (0.50, 0.38, 0.20), roughness=0.95)
STEM = material("stem", (0.20, 0.36, 0.10), roughness=0.8)
PETAL = material("petal", (0.92, 0.92, 0.86), roughness=0.7)
POLLEN = material("pollen", (0.90, 0.58, 0.04), roughness=0.8)


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


def spline(ctrl, n=8):
    """A smooth line through the control points."""
    P = [Vector(p) for p in ctrl]
    m, out = len(P), []
    for i in range(m - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, m - 1)]
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
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


def around(o, angle, radius, y):
    """Sets on the tank, at `angle` around it, something built pointing up (+Z) from the origin."""
    return place(o, Matrix.Translation((radius * math.cos(angle), y, TZ + radius * math.sin(angle))) @ Matrix.Rotation(math.pi / 2 - angle, 4, "Y"))


def patch(name, r0, r1, a0, a1, y0, y1, mat, bevel=0.0006, segs=10):
    """A plate curved to the tank: between two radii, two angles around it and two stations along it."""
    verts, faces = [], []
    for r in (r0, r1):
        for y in (y0, y1):
            for i in range(segs + 1):
                a = a0 + (a1 - a0) * i / segs
                verts.append((r * math.cos(a), y, TZ + r * math.sin(a)))
    n = segs + 1
    for i in range(segs):
        faces += [(i, i + 1, n + i + 1, n + i), (2 * n + i, 3 * n + i, 3 * n + i + 1, 2 * n + i + 1)]  # inner, outer
        faces += [(i, 2 * n + i, 2 * n + i + 1, i + 1), (n + i, n + i + 1, 3 * n + i + 1, 3 * n + i)]  # the two long edges
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


def wrap_uv(o, mat, y0, y1):
    """Rolls the texture around the tank, and over its two domes, instead of projecting it from the sides."""
    me = o.data
    uv = me.uv_layers[0].data
    index = list(me.materials).index(mat)
    for poly in me.polygons:
        if poly.material_index != index:
            continue
        on_barrel = y0 <= poly.center.y <= y1
        a0 = math.atan2(poly.center.z - TZ, poly.center.x)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            r = math.hypot(v.x, v.z - TZ)
            a = math.atan2(v.z - TZ, v.x)
            if on_barrel:  # measured from the face's own angle, so the face that closes the turn is not stretched back across it
                uv[li].uv = (v.y, (a0 + (a - a0 + math.pi) % (2 * math.pi) - math.pi) * R)
            else:  # a dome is laid out flat around its pole: nothing is pinched there
                d = R * math.atan2(r, 1.15 * max(0.0, v.y - y1 if poly.center.y > y1 else y0 - v.y))
                uv[li].uv = (d * math.cos(a), d * math.sin(a))


# --- the tank ---------------------------------------------------------------------------------
dome = [(R * math.sin(math.pi / 2 * i / 10), 0.052 * math.cos(math.pi / 2 * i / 10)) for i in range(11)]
tank = lathe("tank", [(r, -0.160 - a) for r, a in dome] + [(R, 0.040)] + [(r, 0.040 + a) for r, a in reversed(dome)], (0, 0, TZ), COPPER, steps=48)
# the domes are lapped over the barrel, soldered and riveted
seams = [lathe(f"seam{i}", [(R - 0.001, -0.0045), (R + 0.0011, -0.0045), (R + 0.0016, -0.003), (R + 0.0016, 0.003), (R + 0.0011, 0.0045), (R - 0.001, 0.0045)], (0, y, TZ), BAND, steps=44) for i, y in enumerate((-0.160, 0.040))]
rivets = [around(rivet(f"seam-rivet{i}-{k}", BRASS, 0.0021), 2 * math.pi * (k + 0.5) / 18, R + 0.0016, y) for i, y in enumerate((-0.160, 0.040)) for k in range(18)]

# the two straps that clamp it to the frame, drawn tight by a screw
straps, clamps = [], []
for i, y in enumerate((-0.12, -0.02)):
    straps.append(lathe(f"strap{i}", [(R - 0.001, -0.007), (R + 0.0015, -0.007), (R + 0.0021, -0.0056), (R + 0.0015, -0.0042), (R + 0.0015, 0.0042), (R + 0.0021, 0.0056), (R + 0.0015, 0.007), (R - 0.001, 0.007)], (0, y, TZ), BAND, steps=44))
    for s in (-1, 1):
        clamps.append(around(box(f"clamp-ear{i}{s}", (0.004, 0.012, 0.011), (s * 0.006, 0, 0.004), BAND, bevel=0.001), math.radians(52), R, y))
    clamps.append(around(tube(f"clamp-screw{i}", 0.0022, 0.026, (-0.013, 0, 0.0055), WORN, axis="X", steps=10, bevel=0.0003), math.radians(52), R, y))
    clamps.append(around(lathe(f"clamp-nut{i}", [(0, 0), (0.0046, 0), (0.0046, 0.004), (0, 0.004)], (0.008, 0, 0.0055), BRASS, axis="X", steps=6, bevel=0.0005), math.radians(52), R, y))
    clamps.append(around(lathe(f"clamp-head{i}", [(0, -0.0035), (0.0025, -0.003), (0.0042, -0.0012), (0.0042, 0)], (-0.008, 0, 0.0055), BRASS, axis="X", steps=12), math.radians(52), R, y))

# the red cross, enamelled on a white plate, on both sides
cross = []
for s, mid in ((0, math.pi), (1, 0.0)):
    half = 0.0255 / R
    cross.append(patch(f"plate{s}", R - 0.001, R + 0.0014, mid - half, mid + half, -0.0955, -0.0445, ENAMEL, bevel=0.0008, segs=12))
    cross.append(patch(f"cross-up{s}", R + 0.001, R + 0.0021, mid - 0.0185 / R, mid + 0.0185 / R, -0.0755, -0.0645, RED, bevel=0.0004, segs=8))
    cross.append(patch(f"cross-across{s}", R + 0.001, R + 0.0021, mid - 0.0055 / R, mid + 0.0055 / R, -0.0885, -0.0515, RED, bevel=0.0004, segs=4))
    cross += [around(rivet(f"plate-rivet{s}{k}", BRASS, 0.0019), mid + sa * 0.0215 / R, R + 0.0014, -0.07 + sy * 0.0215) for k, (sa, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1)))]

# the filler, with its knurled cap
filler = lathe("filler-neck", [(0, 0.132), (0.0185, 0.132), (0.0185, 0.1405), (0.0165, 0.1425), (0.0135, 0.143), (0.0135, 0.146)], (0, 0.008, 0), BRASS, axis="Z", steps=24)
cap_profile = [(0, 0.1455), (0.0158, 0.1455)]
for i in range(5):
    cap_profile += [(0.0166, 0.1462 + i * 0.0017), (0.0158, 0.1470 + i * 0.0017)]
cap_profile += [(0.0152, 0.1552), (0.0125, 0.1568), (0.0055, 0.1572), (0.0048, 0.1582), (0.0048, 0.1600), (0.0036, 0.1612), (0, 0.1614)]
cap = lathe("filler-cap", cap_profile, (0, 0.008, 0), BRASS, axis="Z", steps=24)

# the pump's barrel, soldered into the top; the rod comes out through the gland nut
barrel = lathe("pump-barrel", [(0, 0.130), (0.0215, 0.130), (0.0215, 0.1395), (0.0195, 0.1418), (0.0150, 0.1428), (0.0143, 0.1445), (0.0143, 0.1575), (0.0158, 0.1582), (0.0163, 0.1600), (0.0158, 0.1618), (0.0120, 0.1625), (0, 0.1625)], (0, -0.06, 0), BRASS, axis="Z", steps=28)
gland = lathe("pump-gland", [(0, 0.162), (0.0098, 0.162), (0.0098, 0.1682), (0.0062, 0.1688), (0.0048, 0.1688), (0.0048, 0.167), (0, 0.167)], (0, -0.06, 0), WORN, axis="Z", steps=6, bevel=0.0007)
gland.rotation_euler = (0, 0, 0.3)

# the suitcase handle on the shooter's side: leather between two brass loops screwed to the straps
HANDLE = math.radians(127)
out = Vector((math.cos(HANDLE), 0, math.sin(HANDLE)))
across = Vector((-math.sin(HANDLE), 0, math.cos(HANDLE)))
rise = lambda y, h: Vector((0, y, TZ)) + out * (R + h)
handle = band("handle", spline([rise(-0.121, 0.0075), rise(-0.108, 0.011), rise(-0.092, 0.021), rise(-0.070, 0.0265), rise(-0.048, 0.021), rise(-0.032, 0.011), rise(-0.019, 0.0075)], n=6), across, 0.017, 0.0048, LEATHER, bevel=0.0019)
pad = band("handle-pad", spline([rise(-0.097, 0.0145), rise(-0.085, 0.0205), rise(-0.070, 0.0228), rise(-0.055, 0.0205), rise(-0.043, 0.0145)], n=6), across, 0.0135, 0.0040, LEATHER, bevel=0.0017)
loops = []
for i, y in enumerate((-0.12, -0.02)):
    loops.append(around(box(f"handle-loop{i}", (0.024, 0.0125, 0.0125), (0, 0, 0.0075), BRASS, bevel=0.0028), HANDLE, R, y))
    loops.append(around(box(f"handle-foot{i}", (0.032, 0.0105, 0.003), (0, 0, 0.0026), BRASS, bevel=0.001), HANDLE, R, y))
    loops += [around(place(rivet(f"handle-screw{i}{s}", WORN, 0.0021), Matrix.Translation((s * 0.0137, 0, 0.0042))), HANDLE, R, y) for s in (-1, 1)]

# --- the frame under it, the grip and the trigger ------------------------------------------------
frame = slab("frame", [(-0.137, 0.022), (-0.137, 0.011), (-0.128, 0.005), (0.066, 0.005), (0.087, 0.014), (0.087, 0.022)], 0.022, STEEL, bevel=0.003)
saddles = [box(f"saddle{i}", (0.056, 0.016, 0.014), (0, y, 0.021), STEEL, bevel=0.003) for i, y in enumerate((-0.12, -0.02))]
grip = slab("grip", [(0.020, 0.012), (-0.024, 0.012), (-0.032, -0.012), (-0.047, -0.076), (-0.041, -0.089), (-0.010, -0.092), (-0.003, -0.080), (0.010, -0.022)], 0.031, WOOD, bevel=0.009)
grip_screws = [lathe(f"grip-screw{s}", [(0, 0), (0.0036, 0), (0.0036, 0.0008), (0.002, 0.0016), (0, 0.0017)], (s * 0.0153, -0.022, -0.036), BRASS, axis="X", steps=12) for s in (-1, 1)]
grip_screws[0].data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
grip_screws[0].data.flip_normals()
guard = ribbon("guard", [(0.082, 0.007), (0.083, -0.006), (0.074, -0.018), (0.040, -0.021), (0.022, -0.016), (0.014, 0.006)], 0.0028, 0.013, STEEL)
trigger = box("trigger", (0.006, 0.007, 0.024), (0, 0.046, -0.003), WORN, bevel=0.002, rot=(0.35, 0, 0))
# the trigger opens the stopcock through a rod along the right side
rod = pipe("trigger-rod", [(0.0128, 0.040, 0.011), (0.0128, 0.086, 0.011), (0.0135, 0.094, 0.016), (0.0135, 0.1135, 0.036)], 0.0015, WORN, steps=6)
rod_pins = [lathe(f"rod-pin{i}", [(0, 0), (0.0026, 0), (0.0026, 0.0045), (0, 0.0045)], (0.0105, y, z), BRASS, axis="X", steps=10, bevel=0.0004) for i, (y, z) in enumerate(((0.040, 0.011), (0.1135, 0.036)))]

# --- the outlet, the stopcock and the lance ----------------------------------------------------------
outlet = lathe("outlet", [(0, 0.068), (0.0150, 0.068), (0.0150, 0.0915), (0.0135, 0.0935), (0.0090, 0.094), (0.0090, 0.097)], (0, 0, LZ), BRASS, steps=20)
nut0 = lathe("outlet-nut", [(0, 0.0965), (0.0122, 0.0965), (0.0122, 0.1045), (0, 0.1045)], (0, 0, LZ), BRASS, steps=6, bevel=0.0008)
cock = lathe("stopcock", [(0, 0.104), (0.0085, 0.104), (0.0085, 0.1065), (0.0118, 0.109), (0.0132, 0.1135), (0.0118, 0.118), (0.0085, 0.1205), (0.0085, 0.1245), (0, 0.1245)], (0, 0, LZ), BRASS, steps=20)
plug = lathe("stopcock-plug", [(0, -0.0165), (0.0050, -0.0165), (0.0058, -0.0150), (0.0058, 0.0150), (0.0050, 0.0165), (0.0030, 0.0170), (0.0030, 0.0205), (0, 0.0205)], (0, 0.1135, LZ), BRASS, axis="X", steps=16)
crank = box("stopcock-crank", (0.003, 0.007, 0.022), (0.0195, 0.1135, LZ - 0.007), WORN, bevel=0.0012)
nut1 = lathe("lance-nut", [(0, 0.124), (0.0105, 0.124), (0.0105, 0.133), (0, 0.133)], (0, 0, LZ), BRASS, steps=6, bevel=0.0008)
nut1.rotation_euler = (0, 0.26, 0)
lance = lathe("lance", [(0, 0.132), (0.0062, 0.132), (0.0062, 0.396), (0, 0.396)], (0, 0, LZ), BRASS, steps=20)
# a turned wooden sleeve where the left hand holds it, between two ferrules
sleeve = lathe("lance-sleeve", [(0.0062, 0.148), (0.0100, 0.149), (0.0122, 0.154), (0.0128, 0.166), (0.0120, 0.180), (0.0114, 0.190), (0.0120, 0.200), (0.0128, 0.212), (0.0122, 0.222), (0.0100, 0.227), (0.0062, 0.228)], (0, 0, LZ), PALE, steps=22)
ferrules = [lathe(f"ferrule{i}", [(0.0062, -0.004), (0.0098, -0.004), (0.0104, -0.0025), (0.0104, 0.0025), (0.0098, 0.004), (0.0062, 0.004)], (0, y, LZ), BRASS, steps=24) for i, y in enumerate((0.146, 0.230))]
nozzle_profile = [(0.0062, 0.388), (0.0090, 0.389)]
for i in range(6):  # the knurled union
    nozzle_profile += [(0.0118, 0.3900 + i * 0.002), (0.0110, 0.3910 + i * 0.002)]
nozzle_profile += [(0.0118, 0.402), (0.0105, 0.4035), (0.0100, 0.407), (0.0064, 0.432), (0.0064, 0.436), (0.0054, 0.440), (0.0022, 0.440), (0.0022, 0.430), (0, 0.430)]
nozzle = lathe("nozzle", nozzle_profile, (0, 0, LZ), BAND, steps=22)

hard = part("hard", [tank, *seams, *rivets, *straps, *clamps, *cross, filler, cap, barrel, gland, *loops, frame, *saddles, grip, *grip_screws, guard, trigger, rod, *rod_pins, outlet, nut0, cock, plug, crank, nut1, lance, sleeve, *ferrules, nozzle])
wrap_uv(hard, COPPER, -0.160, 0.040)

# --- the chamomile, tied to the lance with twine ---------------------------------------------------------
TIE = Vector((0, 0.284, LZ + 0.0085))
soft = [handle, pad]
twine_pts = [(0.0078 * math.cos(2 * math.pi * i / 16), 0.2795 + 0.0022 * i / 16, LZ + 0.0015 + 0.0090 * math.sin(2 * math.pi * i / 16)) for i in range(16 * 4 + 1)]
soft.append(pipe("twine", twine_pts, 0.0011, TWINE, steps=6))
soft.append(blob("twine-knot", (0.0028, 0.0030, 0.0022), (0.0015, 0.2835, LZ + 0.0112), TWINE, rough=0.3, seed=2.0, steps=10, rings=6))
flowers = [((0.0165, 0.322, 0.0705), (0.42, 0.84, 0.34)), ((0.001, 0.331, 0.0800), (0.0, 0.82, 0.57)), ((-0.0160, 0.319, 0.0700), (-0.48, 0.80, 0.36)), ((0.0035, 0.309, 0.0655), (0.10, 0.96, 0.26))]
for f, (head, facing) in enumerate(flowers):
    head, facing = Vector(head), Vector(facing).normalized()
    turn = Matrix.Translation(head) @ Vector((0, 1, 0)).rotation_difference(facing).to_matrix().to_4x4()
    for k in range(13):
        petal = blob(f"petal{f}-{k}", (0.0020, 0.0005, 0.0050), (0, 0, 0.0078), PETAL, steps=6, rings=4)
        soft.append(place(petal, turn @ Matrix.Rotation(2 * math.pi * k / 13 + f, 4, "Y") @ Matrix.Rotation(0.22 + 0.12 * math.sin(k * 2.4 + f), 4, "X")))
    soft.append(place(blob(f"pollen{f}", (0.0046, 0.0038, 0.0046), (0, 0.0012, 0), POLLEN, steps=14, rings=8), turn))
    soft.append(place(blob(f"sepal{f}", (0.0032, 0.0024, 0.0032), (0, -0.0014, 0), STEM, steps=10, rings=6), turn))
    foot = Vector((0.004 * math.cos(f * 1.7), 0.250 - 0.004 * f, LZ + 0.0075 + 0.001 * math.sin(f * 1.7)))
    soft.append(pipe(f"stem{f}", spline([foot, TIE + Vector((0.003 * math.cos(f * 1.7), 0, 0.001 * (f % 2))), head - facing * 0.014, head - facing * 0.002], n=5), 0.0008, STEM, steps=5))
soft = part("soft", soft, crease=180)

body = join("body", [hard, soft])

# --- the pump's rod and handle: up and down ----------------------------------------------------------------
PUMP = (0, -0.06, 0.15)
rod = pipe("pump-rod", [(0, -0.06, 0.118), (0, -0.06, 0.1675)] + spline([(0, -0.06, 0.1675), (0, -0.0615, 0.1722), (0, -0.0665, 0.1745), (0, -0.075, 0.1745)], n=4)[1:] + [(0, -0.1295, 0.1745)], 0.0034, WORN, steps=12)
socket = lathe("pump-socket", [(0, -0.012), (0.0058, -0.012), (0.0058, -0.004), (0.0098, -0.003), (0.0098, 0.003), (0.0058, 0.004), (0.0058, 0.012), (0, 0.012)], (0, -0.130, 0.1745), BRASS, axis="X", steps=20)
grips = []
for s in (-1, 1):  # the cross handle, turned in pale wood
    g = lathe(f"pump-grip{s}", [(0.0058, 0.0035), (0.0082, 0.0045), (0.0092, 0.010), (0.0086, 0.018), (0.0090, 0.026), (0.0096, 0.031), (0.0084, 0.0355), (0.0050, 0.0375), (0, 0.038)], (0, -0.130, 0.1745), PALE, axis="X", steps=20)
    if s < 0:
        g.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        g.data.flip_normals()
    grips.append(g)
pump = part("pouch", [rod, socket, *grips], pivot=PUMP)

marker("muzzle", (0, 0.44, LZ))
marker("left", (0, 0.18, 0.03))
marker("trigger", (0, 0.0495, -0.002))  # the face the trigger finger presses
kit.drop_cutters()

if len(args) > 1:
    # as the shooter sees it from the hip, from both sides and from the front
    kit.preview(os.path.join(args[1], "miedi-fp.png"), eye=(-0.15, -0.36, 0.17), target=(-0.15, 1.0, 0.17), lens=17.5)
    kit.preview(os.path.join(args[1], "miedi-side.png"), eye=(-0.95, 0.10, 0.30), target=(0, 0.10, 0.06), lens=50)
    kit.preview(os.path.join(args[1], "miedi-right.png"), eye=(0.55, -0.40, 0.32), target=(0, -0.04, 0.07), lens=50)
    kit.preview(os.path.join(args[1], "miedi-front.png"), eye=(-0.36, 0.56, 0.24), target=(0, 0.16, 0.06), lens=50)
kit.export(args[0])
