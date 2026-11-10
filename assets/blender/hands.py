"""
The shooter's hands and sleeves, for the first-person weapon.

    blender -b --python assets/blender/hands.py -- <out.glb> [preview-folder]

The hand is the realistic one of Blender's Human Base Meshes (CC0, `hand-base.blend`): a smooth
base, with no nails and no joints. This script makes it a working man's hand (stouter fingers,
knuckles), gives it a skeleton, draws its skin on its own unwrap (colours and relief: the nails,
the folds of the joints), and then closes it on every weapon in turn: the weapons' own files are
read from the folder of <out.glb> (build them first), and each finger bends until it meets the
model. What is exported:
  - `skin`: the RIGHT hand at rest, bound to the skeleton `rig`;
  - `rig.poses` (a JSON string): for `<weapon>_right`, `<weapon>_left` and `toss_left`, where every
    bone goes, and `wrist`/`elbow`: where the forearm leaves and which way;
  - `sleeve`: the linen sleeve with its cuff, from its origin towards -Y.
A pose is in the game's axes, relative to the point the hand holds (the weapon's origin for the
right hand, its `left` point for the left one). The left hands are solved in a mirror: the game
flips them back (`client/models/hands.ts`).

HANDS_ONLY=cramar,mandi limits the previews to those weapons (`bare`: the hand alone, with the two
images of its skin; `toss`: the bottle); HANDS_DEBUG=1 prints every solve.
"""
import json
import math
import os
import re
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import lathe, material, part

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()
rad = math.radians
DEBUG = bool(os.environ.get("HANDS_DEBUG"))
MODELS = os.path.dirname(os.path.abspath(args[0]))
previews = args[1] if len(args) > 1 else None
only = [w for w in os.environ.get("HANDS_ONLY", "").split(",") if w]

# --- the base mesh and where its joints are -----------------------------------------------------
with bpy.data.libraries.load(os.path.join(kit.HERE, "hand-base.blend")) as (src, dst):
    dst.objects = ["Hand  - Realistic"]
base = dst.objects[0]
bpy.context.scene.collection.objects.link(base)
base.name = "skin"
me = base.data
VERTS = [v.co.copy() for v in me.vertices]
PALM = Vector((0, 1, 0))  # the palm faces +Y, the fingers hang towards -Z, the thumb is at +X
UP = Vector((0, 0, 1))


def trace(tip, u, reach=0.013, n=30, step=0.004):
    """The centreline of a finger, from its tip along `u`."""
    c, line = tip.copy(), [tip.copy()]
    for k in range(1, n):
        s = k * step
        ring = [v for v in VERTS if abs((v - tip).dot(u) - s) < 0.003 and ((v - c) - (v - c).dot(u) * u).length < reach]
        if len(ring) < 4:
            break
        c = sum(ring, Vector()) / len(ring)
        line.append(tip + u * s + ((c - tip) - (c - tip).dot(u) * u))
    return line


def along(line, s, step=0.004):
    i = min(len(line) - 2, int(s / step))
    return line[i].lerp(line[i + 1], s / step - i)


WRIST = Vector((1.405, 0.011, 0.352))
# name: where its tip is (x), its length from the knuckle
FINGERS = {"index": (1.459, 0.090), "middle": (1.423, 0.100), "ring": (1.391, 0.093), "little": (1.354, 0.072)}
JOINTS = {}
for name, (x, length) in FINGERS.items():
    tip = min((v for v in VERTS if abs(v.x - x) < 0.012 and v.z < 0.2), key=lambda v: v.z)
    line = trace(tip, UP)
    knuckle = along(line, length)
    knuckle.y = along(line, length * 0.8).y - 0.004  # the knuckle lies under the back of the hand
    JOINTS[name] = [knuckle, along(line, length * 0.53), along(line, length * 0.25) + Vector((0, -0.001, 0)), tip + Vector((0, -0.004, 0.003))]
thumb_tip = max(VERTS, key=lambda v: v.x)
thumb_line = trace(thumb_tip, (Vector((1.441, 0.02, 0.333)) - thumb_tip).normalized(), reach=0.016)
THUMB = [Vector((1.437, 0.016, 0.327)), Vector((1.461, 0.024, 0.292)), along(thumb_line, 0.030), thumb_tip + Vector((-0.004, -0.002, 0.004))]
THUMB_PAD = Vector((-0.55, 0.78, -0.3)).normalized()  # the way the thumb's pad faces at rest
# every digit: its name, its four points from the hand to the tip, the way its pad faces
DIGITS = [(name, j, PALM) for name, j in JOINTS.items()] + [("thumb", THUMB, THUMB_PAD)]

# --- a working man's hand: stouter fingers with their joints, the knuckles of a fist --------------
STOUT = 0.08  # how much thicker a finger is than the base's


def on_digit(p):
    """The digit a point is nearest to: how far from its line, the point of the line, how far along it, which."""
    best = None
    for i, (_name, j, _pad) in enumerate(DIGITS):
        run = 0.0
        for k in range(3):
            d = j[k + 1] - j[k]
            s = max(0.0, min(1.0, (p - j[k]).dot(d) / d.length_squared))
            c = j[k] + d * s
            if best is None or (p - c).length < best[0]:
                best = ((p - c).length, c, run + s * d.length, i)
            run += d.length
    return best


for v in me.vertices:
    gap, c, u, i = on_digit(v.co)
    if gap > 0.017:
        continue
    name, j, _pad = DIGITS[i]
    l0, l1 = (j[1] - j[0]).length, (j[2] - j[1]).length
    if name == "thumb":  # its first bone is inside the hand
        t = (u - l0 - 0.1 * l1) / (0.4 * l1)
        joints = ((l0, 0.03, 0.006), (l0 + l1, 0.05, 0.005))
    else:
        t = (u - 0.2 * l0) / (0.4 * l0)
        joints = ((l0, 0.06, 0.005), (l0 + l1, 0.045, 0.004))
    t = max(0.0, min(1.0, t))
    grow = STOUT * t * t * (3 - 2 * t) + sum(more * math.exp(-((u - at) / wide) ** 2) for at, more, wide in joints)
    v.co = c + (v.co - c) * (1 + grow)
for _name, j in JOINTS.items():
    for v in me.vertices:
        rel = v.co - j[0]
        flat = rel - rel.dot(PALM) * PALM
        if rel.dot(PALM) < 0 and flat.length < 0.02:
            v.co -= PALM * 0.0016 * math.exp(-(flat.length / 0.0075) ** 2) * max(0.0, min(1.0, -v.normal.dot(PALM) * 1.5))
me.update()
VERTS = [v.co.copy() for v in me.vertices]

# --- skeleton -----------------------------------------------------------------------------------
rig = bpy.data.objects.new("rig", bpy.data.armatures.new("rig"))
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent, roll):
    b = rig.data.edit_bones.new(name)
    b.head, b.tail = head, tail
    b.parent = parent
    b.align_roll(roll)  # z looks where the pad does: x is then the axis a joint closes around
    return b


forearm = bone("forearm", Vector((1.408, 0.005, 0.445)), WRIST, None, PALM)
palm_b = bone("palm", WRIST, JOINTS["middle"][0], forearm, PALM)
for name, j in JOINTS.items():
    root = WRIST + Vector(((j[0].x - WRIST.x) * 0.45, 0, -0.012))
    p = bone(f"{name}0", root, j[0], palm_b, PALM)
    for k in range(3):
        p = bone(f"{name}{k + 1}", j[k], j[k + 1], p, PALM)
p = palm_b
for k in range(3):
    p = bone(f"thumb{k + 1}", THUMB[k], THUMB[k + 1], p, THUMB_PAD)
bpy.ops.object.mode_set(mode="OBJECT")

kit._select([base])
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
assert len(base.vertex_groups) > 10, "automatic weights failed"

# The automatic weights blend a joint over half a finger, and a bent finger then looks like a hose:
# on the fingers each bone takes more of what is mostly its own, and the bend gathers at the joint.
SHARP = 2.2
PHALANX = re.compile(r"(index|middle|ring|little)[123]$|thumb[23]$")
for v in me.vertices:
    weights = [(g.group, g.weight) for g in v.groups]
    if not weights or not PHALANX.match(base.vertex_groups[max(weights, key=lambda g: g[1])[0]].name):
        continue
    total = sum(w ** SHARP for _g, w in weights)
    for g, w in weights:
        base.vertex_groups[g].add([v.index], w ** SHARP / total, "REPLACE")


def girth(name):
    """How thick the hand is around a bone: the mean distance of its own skin from it."""
    b = rig.data.bones[name]
    h, d, length = b.head_local, (b.tail_local - b.head_local).normalized(), b.length
    index = base.vertex_groups[name].index
    out = []
    for v in me.vertices:
        if max(((g.weight, g.group) for g in v.groups), default=(0, -1))[1] != index:
            continue
        s = (v.co - h).dot(d)
        if 0.2 * length < s < 0.8 * length:
            out.append(((v.co - h) - s * d).length)
    return sum(out) / len(out) if out else 0.008


GIRTH = {b.name: girth(b.name) for b in rig.data.bones}

# --- skin: its colours and its relief, drawn on the hand's own unwrap ----------------------------
# Every texel of the unwrap knows where it is on the hand; what is there (a nail, the folds of a
# joint, the flush of a knuckle) is worked out from the digit it belongs to.
SIZE = 1024
NAIL = {"index": 0.0115, "middle": 0.012, "ring": 0.0115, "little": 0.0098, "thumb": 0.0145}  # how long each nail is
END = {name: 0.0045 if name == "thumb" else 0.003 for name in NAIL}  # from a digit's last point to its very end


def unit(a):
    return a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-12)


def smooth(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def line_of(x, width):
    """A groove or a band `width` wide around x = 0."""
    return np.exp(-(x / width) ** 2)


def grain(q, cell, seed):
    """Smooth noise between -1 and 1, `cell` metres to a lump."""
    g = q / cell
    i = np.floor(g).astype(np.int64)
    f = g - i
    f = f * f * (3 - 2 * f)
    out = np.zeros(len(q))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                n = ((i[:, 0] + dx) * 73856093) ^ ((i[:, 1] + dy) * 19349663) ^ ((i[:, 2] + dz) * 83492791) ^ seed
                n = ((n ^ (n >> 13)) * 1274126177) & 0x7FFFFFFF
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w * ((n >> 8) & 0xFFFF) / 65535.0
    return out * 2 - 1


me.calc_loop_triangles()
co = np.array([v.co for v in me.vertices])
no = np.array([v.normal for v in me.vertices])

# how much of the sky each vertex sees: the webs between the fingers and the hollow of the palm see less
solid = BVHTree.FromPolygons([v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
RAYS = 24
sky = np.zeros(len(me.vertices))
for v in me.vertices:
    n = v.normal
    t = n.orthogonal().normalized()
    b = n.cross(t)
    seen = total = 0.0
    for i in range(RAYS):
        z = (i + 0.5) / RAYS
        r = math.sqrt(1 - z * z)
        d = t * (r * math.cos(i * 2.39996)) + b * (r * math.sin(i * 2.39996)) + n * z
        total += z
        if solid.ray_cast(v.co + n * 0.0008, d, 0.03)[0] is None:
            seen += z
    sky[v.index] = seen / total
beside = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices
    beside[a].append(b)
    beside[b].append(a)
sky = np.array([(sky[i] + sum(sky[k] for k in near) / max(1, len(near))) / 2 for i, near in enumerate(beside)])

# which triangle of the unwrap each texel is in, and where in it
uv = np.array([l.uv for l in me.uv_layers[0].data])
tri_loops = np.array([t.loops for t in me.loop_triangles])
tri_verts = np.array([t.vertices for t in me.loop_triangles])
owner = np.full((SIZE, SIZE), -1, np.int32)
share = np.zeros((SIZE, SIZE, 3))
for i, (a, b, c) in enumerate(uv[tri_loops] * SIZE - 0.5):
    x0, y0 = np.maximum(np.floor(np.minimum(np.minimum(a, b), c)).astype(int) - 1, 0)
    x1, y1 = np.minimum(np.ceil(np.maximum(np.maximum(a, b), c)).astype(int) + 1, SIZE - 1)
    det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if x1 < x0 or y1 < y0 or abs(det) < 1e-9:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    la = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
    lb = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
    lc = 1 - la - lb
    inside = (la >= -0.03) & (lb >= -0.03) & (lc >= -0.03)
    owner[ys[inside], xs[inside]] = i
    share[ys[inside], xs[inside]] = np.stack([la, lb, lc], -1)[inside]

# every texel on the hand: where it is, how it faces, and the directions its u and v run in
ys, xs = np.nonzero(owner >= 0)
tri = owner[ys, xs]
corner = tri_verts[tri]
P = np.einsum("nk,nkc->nc", share[ys, xs], co[corner])
N = unit(np.einsum("nk,nkc->nc", share[ys, xs], no[corner]))
SKY = np.einsum("nk,nk->n", share[ys, xs], sky[corner])
e1, e2 = co[tri_verts[:, 1]] - co[tri_verts[:, 0]], co[tri_verts[:, 2]] - co[tri_verts[:, 0]]
d1, d2 = uv[tri_loops[:, 1]] - uv[tri_loops[:, 0]], uv[tri_loops[:, 2]] - uv[tri_loops[:, 0]]
det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
det = np.where(np.abs(det) < 1e-12, 1e-12, det)[:, None]
T = ((e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / det)[tri]
B = ((e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / det)[tri]
T = unit(T - N * (T * N).sum(1, keepdims=True))
B = B - N * (B * N).sum(1, keepdims=True)
B = unit(B - T * (B * T).sum(1, keepdims=True))


def from_line(q, a, b):
    d = b - a
    s = np.clip((q - a) @ d / (d @ d), 0.0, 1.0)
    return np.linalg.norm(q - (a + s[:, None] * d), axis=1)


LINES = [(name, [np.array(p) for p in j], np.array(pad)) for name, j, pad in DIGITS]
away = np.stack([np.minimum.reduce([from_line(P, j[k], j[k + 1]) for k in range(3)]) for _name, j, _pad in LINES])
DIGIT = np.where(away.min(0) < 0.02, away.argmin(0), -1)


def frame_of(a, pad):
    """Along a digit, out of its back, across it."""
    a = a / np.linalg.norm(a)
    o = -pad + (pad @ a) * a
    o = o / np.linalg.norm(o)
    return a, o, np.cross(a, o)


def relief(q, parts=False):
    """
    How high the skin stands at the points `q` (metres): its grain, the nails, the folds of the joints.
    With `parts`, also where the nails are, their free edge, the flushed skin and the sides of the fingers.
    """
    high = 0.000014 * grain(q, 0.0016, 11) + 0.000009 * grain(q, 0.0008, 5)
    nail, edge, flush, flank = (np.zeros(len(q)) for _ in range(4))
    for i, (name, j, pad) in enumerate(LINES):
        mine = DIGIT == i
        p, n = q[mine], N[mine]
        red = np.zeros(len(p))
        # the nail: a plate, with a fold of skin at its sides and at its root
        a, o, s = frame_of(j[3] - j[2], pad)
        rel = p - j[3]
        back = END[name] - rel @ a  # from the very end of the digit
        up = smooth(0.05, 0.3, n @ o)
        length, half, start = NAIL[name], 0.66 * GIRTH[f"{name}3"], 0.002
        qx, qy = np.abs(back - start - length / 2), np.abs(rel @ s)

        def rounded(r):
            dx, dy = qx - (length / 2 - r), qy - (half - r)
            return np.hypot(np.maximum(dx, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(dx, dy), 0) - r

        sd = np.where(back < start + length / 2, rounded(0.0016), rounded(half * 0.85))  # square at the tip, round at the root
        plate = smooth(0.00025, -0.00025, sd) * up
        dh = 0.00022 * plate - 0.0002 * line_of(sd, 0.00045) * up * smooth(start + 0.001, start + 0.003, back)
        red += 0.3 * smooth(0.2, 0.6, -(n @ o)) * smooth(0.2, 0.5, (p - j[2]) @ a / np.linalg.norm(j[3] - j[2]))  # the pad
        # the two joints: folds across the back, each bowed around the joint, and creases inside
        for k, lines, wide in ((1, (-0.0046, -0.0027, -0.001, 0.001, 0.0027, 0.0046), 0.0078), (2, (-0.0026, -0.0009, 0.0009, 0.0026), 0.0064)):
            a, o, s = frame_of(j[k + 1] - j[k - 1], pad)
            rel = p - j[k]
            u, v = rel @ a + 0.0005 * grain(p, 0.005, 17 + k), rel @ s
            up, down = smooth(0.15, 0.5, n @ o), smooth(0.15, 0.5, -(n @ o))
            for at in lines:
                reach = wide * (0.55 + 0.45 * abs(at) / abs(lines[0]))  # the outer folds are the longer ones
                bow = np.sqrt(np.clip(1 - (v / (reach * 1.25)) ** 2, 0.0, 1.0))
                dh -= 0.00013 * up * smooth(1.0, 0.55, np.abs(v) / reach) * line_of(u - at * bow, 0.00035)
            dh -= 0.00016 * down * sum(line_of(u - x, 0.00042) for x in ((-0.001, 0.001) if k == 1 and name != "thumb" else (0.0,)))
            red += 0.45 * line_of(u, 0.006 if k == 1 else 0.0045) * up
        a, o, s = frame_of(j[3] - j[0], pad)
        rel = p - j[0]
        if name != "thumb":
            # where the finger leaves the palm, and the knuckle of the fist
            first = np.linalg.norm(j[1] - j[0])
            dh -= 0.0002 * smooth(0.15, 0.5, -(n @ o)) * line_of(rel @ frame_of(j[1] - j[0], pad)[0] - 0.5 * first, 0.00045)
            red += 0.35 * line_of(np.linalg.norm(rel - np.outer(rel @ o, o), axis=1), 0.009) * smooth(0.15, 0.5, n @ o)
        high[mine] += dh
        if parts:
            nail[mine] = plate
            edge[mine] = plate * smooth(start + 0.0022, start + 0.001, back)
            flush[mine] = red
            flank[mine] = smooth(0.55, 0.95, np.abs(n @ s)) * smooth(0.3, 0.5, (rel @ a) / np.linalg.norm(j[3] - j[0]))
    return (high, nail, edge, flush, flank) if parts else high


def tone(r, g, b):
    return np.array((r, g, b)) / 255.0


BACK_TONE, INSIDE_TONE, FLUSH_TONE = tone(186, 128, 98), tone(208, 150, 126), tone(168, 88, 72)
NAIL_TONE, NAIL_EDGE = tone(204, 150, 134), tone(226, 204, 184)
high, nail, edge, flush, flank = relief(P, True)
STEP_ACROSS = 0.0002
slope_t = (relief(P + T * STEP_ACROSS) - relief(P - T * STEP_ACROSS)) / (2 * STEP_ACROSS)
slope_b = (relief(P + B * STEP_ACROSS) - relief(P - B * STEP_ACROSS)) / (2 * STEP_ACROSS)
bump = unit(np.stack([-slope_t, -slope_b, np.ones(len(P))], 1))
colour = BACK_TONE + (INSIDE_TONE - BACK_TONE) * smooth(-0.2, 0.7, N @ np.array(PALM))[:, None]
colour = colour + (FLUSH_TONE - colour) * np.clip(flush, 0.0, 0.75)[:, None]
colour = colour * (1 + 0.035 * grain(P, 0.009, 3) + 0.02 * grain(P, 0.003, 7))[:, None]
shade = (0.62 + 0.38 * smooth(0.25, 0.95, SKY)) * (1 - 0.12 * flank) * (1 - 0.3 * smooth(0.00005, 0.00017, -high))
colour = colour * shade[:, None] ** np.array((0.75, 1.0, 1.1))  # a shadow on skin stays warm
colour = colour + (NAIL_TONE - colour) * nail[:, None]
colour = colour + (NAIL_EDGE - colour) * (0.55 * edge)[:, None]


def picture(name, texels, flat, data=False):
    """The texels as an image the exporter packs; around the unwrap its border is repeated, so no seam shows."""
    img = np.empty((SIZE, SIZE, 3))
    img[:] = flat
    img[ys, xs] = np.clip(texels, 0.0, 1.0)
    known = owner >= 0
    for _ in range(8):
        total, count = np.zeros_like(img), np.zeros((SIZE, SIZE))
        for shift in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            k = np.roll(known, shift, (0, 1))
            total += np.roll(img, shift, (0, 1)) * k[..., None]
            count += k
        new = ~known & (count > 0)
        img[new] = total[new] / count[new][:, None]
        known = known | new
    out = bpy.data.images.new(name, SIZE, SIZE, alpha=False)
    if data:
        out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(np.concatenate([img, np.ones((SIZE, SIZE, 1))], -1).astype(np.float32).ravel())
    out.filepath_raw = os.path.join(previews if previews and "bare" in only else TEMP, f"{name}.png")
    out.file_format = "PNG"
    out.save()
    return out


TEMP = tempfile.mkdtemp(prefix="hands-")
skin_mat = bpy.data.materials.new("skin")
skin_mat.use_nodes = True
nodes, links = skin_mat.node_tree.nodes, skin_mat.node_tree.links
bsdf = nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.6
paint = nodes.new("ShaderNodeTexImage")
paint.image = picture("hand-colour", colour, BACK_TONE)
links.new(paint.outputs["Color"], bsdf.inputs["Base Color"])
folds = nodes.new("ShaderNodeTexImage")
folds.image = picture("hand-relief", bump * 0.5 + 0.5, (0.5, 0.5, 1.0), data=True)
bumps = nodes.new("ShaderNodeNormalMap")
links.new(folds.outputs["Color"], bumps.inputs["Color"])
links.new(bumps.outputs["Normal"], bsdf.inputs["Normal"])
me.materials.clear()
me.materials.append(skin_mat)

# a rounder, lighter skin (the weights and the unwrap follow)
kit._select([base])
for kind, set_up in (("SUBSURF", lambda m: setattr(m, "levels", 1)), ("DECIMATE", lambda m: setattr(m, "ratio", 0.42))):
    m = base.modifiers.new(kind.lower(), kind)
    set_up(m)
    bpy.ops.object.modifier_apply(modifier=m.name)
for p in base.data.polygons:
    p.use_smooth = True

# --- closing the hand on what it holds -----------------------------------------------------------
B2G = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))  # Blender's axes to the game's
G2B = B2G.inverted()
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
ORDER = [b.name for b in rig.data.bones]  # parents first
REST = {b.name: b.matrix_local.copy() for b in rig.data.bones}
PARENT = {b.name: b.parent.name if b.parent else None for b in rig.data.bones}
LENGTH = {b.name: b.length for b in rig.data.bones}
REL = {n: (REST[PARENT[n]].inverted() @ REST[n]) if PARENT[n] else REST[n] for n in ORDER}  # a bone in its parent
FINGER_NAMES = ("index", "middle", "ring", "little")
LIMIT = (86, 100, 62)  # how far a knuckle, a middle joint and a last joint close
LOOSE = (30, 42, 28)  # a finger that meets nothing
COUPLE = (36, 40, 40)  # how much further than the finger beside it a joint closes: they share their tendons
LAST = 0.7  # of the middle joint's bend, what the last joint takes at most (and 8 degrees): a hooked tip is a claw
STEP = 2
FLESH = 0.78  # how much of its girth a finger keeps when it presses on something
TOUCH = 0.9  # and when it lies against the finger beside it
KNUCKLES = (JOINTS["index"][0] + JOINTS["little"][0]) / 2
PADS = []  # what of the palm lies on the thing: the knuckles and the middle of the hand
for _name, _j in JOINTS.items():
    _root = WRIST + Vector(((_j[0].x - WRIST.x) * 0.45, 0, -0.012))
    PADS += [(_j[0], 0.0105), (_root.lerp(_j[0], 0.55), 0.011)]
SPREAD = dict.fromkeys(FINGER_NAMES, 0.0)  # degrees each finger swings sideways from rest: worked out below
HINGE = REST["middle1"].to_3x3() @ Vector((1, 0, 0))  # what the fingers close around


def near(tree, p, r):
    return tree is not None and tree.find_nearest(p, r)[0] is not None


def touches(tree, a, b, r):
    """Whether the bone from `a` to `b`, `r` thick, is on the thing."""
    return any(near(tree, a.lerp(b, t), r) for t in (0.3, 0.5, 0.7, 0.85, 1.0))


def angle_about(axis, a, b):
    """The signed angle from `a` to `b` around `axis`."""
    return math.atan2(a.cross(b).dot(axis), a.dot(b))


def finger_bones(finger, angles, spread=None):
    """
    Where the three bones of a finger are (the rig's space) when its joints close by `angles` degrees.
    Every finger closes around the middle finger's axis, whichever way it points itself: fingers that
    lie side by side when straight then stay side by side all the way into a fist.
    """
    m = REST[f"{finger}0"]
    out = []
    for k in range(3):
        m = m @ REL[f"{finger}{k + 1}"]
        if k == 0:
            m = m @ Matrix.Rotation(rad(SPREAD[finger] if spread is None else spread), 4, "Z")
        m = m @ Matrix.Rotation(rad(angles[k]), 4, m.to_3x3().inverted() @ HINGE)
        out.append(m)
    return out


# The base has its fingers fanned out. A hand that holds something has them side by side: each swings
# towards the middle finger until it lies against the one beside it.
def beads(finger, spread):
    """A straight finger as balls down its length, from the middle of its first bone."""
    out = []
    for k, m in enumerate(finger_bones(finger, (0, 0, 0), spread)):
        b = f"{finger}{k + 1}"
        out += [(m @ Vector((0, LENGTH[b] * t, 0)), GIRTH[b]) for t in ((0.6, 0.8, 1.0) if k == 0 else (0.25, 0.5, 0.75, 1.0))]
    return out


def room_between(a, b):
    return min((p - q).length - (r + s) * TOUCH for p, r in a for q, s in b)


for finger, beside_it in (("index", "middle"), ("ring", "middle"), ("little", "ring")):
    other = beads(beside_it, SPREAD[beside_it])
    way = 1 if room_between(beads(finger, 2), other) < room_between(beads(finger, -2), other) else -1
    while abs(SPREAD[finger]) < 32 and room_between(beads(finger, SPREAD[finger] + way * 0.5), other) > 0:
        SPREAD[finger] += way * 0.5
if DEBUG:
    print("  knuckles at", {f: [round(c * 1000) for c in JOINTS[f][0] - JOINTS["middle"][0]] for f in FINGER_NAMES}, "\n  fingers swing together by", SPREAD, "and are", {f: round(GIRTH[f"{f}2"] * 2000, 1) for f in (*FINGER_NAMES, "thumb")}, "mm thick")


def close_finger(tree, frame, finger, caps):
    """Every joint in turn closes until its bone lies on the thing, or as far as `caps` lets it."""
    angles, met = [0, 0, 0], False
    for k in range(3):
        b = f"{finger}{k + 1}"
        while angles[k] + STEP <= (caps[k] if k < 2 else min(caps[2], LAST * angles[1] + 8)):
            angles[k] += STEP
            m = frame @ finger_bones(finger, angles)[k]
            if touches(tree, m.translation, m @ Vector((0, LENGTH[b], 0)), GIRTH[b] * FLESH):
                angles[k] -= STEP
                met = True
                break
    return angles, met


def close_fingers(tree, frame, open_to=None, but_index=False):
    """
    The fingers close on the thing, neighbours alike. Gives each finger's angles and whether it met
    anything, and how far the fingers are left from the thing, summed: the less, the better the hold.
    `but_index`: the index is the trigger finger, and goes where the trigger is (`on_trigger`).
    """
    fingers = [f for f in FINGER_NAMES if not (but_index and f == "index")]
    caps = {f: [LIMIT[0] if open_to is None else min(LIMIT[0], open_to), LIMIT[1], LIMIT[2]] for f in fingers}
    found = {f: close_finger(tree, frame, f, caps[f]) for f in fingers}
    for _ in range(2):  # a finger that closes much further than the one beside it gives way, and closes again
        for i, f in enumerate(fingers):
            met = [g for g in fingers if found[g][1]]
            beside_it = [found[g][0] for g in (max((g for g in met if fingers.index(g) < i), key=fingers.index, default=None), min((g for g in met if fingers.index(g) > i), key=fingers.index, default=None)) if g]
            if beside_it:
                caps[f] = [min(caps[f][k], min(a[k] for a in beside_it) + COUPLE[k]) for k in range(3)]
        found = {f: close_finger(tree, frame, f, caps[f]) for f in fingers}
    left_over = 0.0
    if tree is not None:
        for f in fingers:
            angles, met = found[f]
            bones = finger_bones(f, angles)
            for k, weight in ((1, 0.5), (2, 1.0)):
                b = f"{f}{k + 1}"
                end = frame @ bones[k] @ Vector((0, LENGTH[b], 0))
                left_over += weight * min(0.03, max(0.0, tree.find_nearest(end)[3] - GIRTH[b])) if met else weight * 0.03
            left_over += 0.0002 * max(0, 150 - sum(angles))  # a finger lying along the thing does not hold it
    return found, left_over


def on_trigger(tree, frame, at, step):
    """
    The index on a trigger: the pad of its last bone on the trigger's face `at`, its last joint almost
    straight, and the finger swung sideways from the others as far as an index goes. Gives by how much
    it misses, its angles and its swing; every `step` degrees (coarse: only to know whether it reaches).
    """
    goal = frame.inverted() @ at
    pad = Vector((0, LENGTH["index3"] * 0.55, GIRTH["index3"] * 0.85))
    home = SPREAD["index"]
    out = -1 if home > 0 else 1  # away from the middle finger
    tried = []
    for swing in range(-4, 21, step):
        for a in range(0, 77, step):
            for b in range(8, 97, step):
                angles = (a, b, round(b * 0.3))
                m = finger_bones("index", angles, home + out * swing)[2]
                tried.append(((m @ pad - goal).length + 0.00012 * abs(swing), angles, home + out * swing))
    tried.sort(key=lambda c: c[0])
    if step > 2:
        return tried[0]
    for miss, angles, spread in tried[:300]:  # the nearest that keeps its first two bones out of the weapon
        bones = finger_bones("index", angles, spread)
        if not any(touches(tree, frame @ m.translation, frame @ m @ Vector((0, LENGTH[f"index{k + 1}"] * 0.8, 0)), GIRTH[f"index{k + 1}"] * 0.55) for k, m in enumerate(bones[:2])):
            return miss, angles, spread
    return tried[0]


class Grasp:
    """A hand closed on something: `frame` puts the rest hand in the weapon's space, `pose` its bones."""

    def __init__(self, frame, pose, wrist, arm):
        self.frame, self.pose, self.wrist, self.arm = frame, pose, wrist, arm


def spread_of(v):
    """A number, or a range (low, high) to try every 4 millimetres."""
    return [v] if isinstance(v, (int, float)) else list(range(v[0], v[1] + 1, 4))


def grasp(label, tree, hold, elbow, axis, palm=None, seat=0, rise=0, turn=0.0, thumb=None, open_to=None, trigger=None, reach=100, roll=(0.3, 0.6, 0.8)):
    """
    Closes the right hand on the thing in `tree` (the weapon's space, Blender's axes; None: on nothing).
    `hold`: the point held. `axis`: where the thumb side of the hand points, the line of the knuckles.
    `palm`: where the palm faces, towards the thing; None for a round thing, held from the side that
    asks least of the wrist. `turn`: degrees the palm turns around `axis`.
    `seat`: how far in front of the held point the knuckles lie, `rise`: how far towards the thumb
    side the hand sits (millimetres); a range (low, high) is searched for the hold that wraps best,
    and of those that wrap as well, the one highest on the thing and furthest back. `trigger`: where
    the face of the trigger is; the index goes there, and a hold it cannot reach it from is a worse
    one. `reach`: from how far the palm comes in (millimetres): less, when something else stands
    beside what is held.
    `thumb`: about where its tip goes, millimetres from the middle of the knuckles (towards the thumb
    side, the way the palm faces, towards the wrist), then `roll`: how much of the turn that brings
    their pads on the thing its three bones take. `elbow`: where the elbow is, which bends the wrist
    as far as a wrist goes. `open_to`: the most a knuckle closes.
    """
    a = Vector(axis).normalized()
    elbow = Vector(elbow).normalized()

    def wrist_of(n):
        # where the elbow is, seen from the hand, is where the forearm must go; a wrist bends back
        # 65 degrees and forward 70, 35 towards the little finger and 20 towards the thumb
        turnm = Matrix((a, n, a.cross(n))).transposed()  # the rest hand: thumb side +X, palm +Y, wrist +Z
        want = turnm.transposed() @ elbow
        back_bend = max(rad(-70), min(rad(65), math.atan2(-want.y, want.z)))
        side_bend = max(rad(-20), min(rad(35), math.atan2(-want.x, want.z)))
        arm = Vector((-math.tan(side_bend), -math.tan(back_bend), 1.0)).normalized()
        return turnm, arm, (turnm @ arm).angle(elbow)

    if palm is None:
        some = a.orthogonal().normalized()
        n = min((Matrix.Rotation(rad(k), 3, a) @ some for k in range(0, 360, 10)), key=lambda n: wrist_of(n)[2])
        n = Matrix.Rotation(rad(turn), 3, a) @ n
    else:
        n = Vector(palm)
        n = Matrix.Rotation(rad(turn), 3, a) @ (n - n.dot(a) * a).normalized()
    turnm, arm, off = wrist_of(n)
    w = a.cross(n)  # towards the wrist

    def frame_of_hold(seat, rise):
        """The palm comes in until it lies on the thing."""
        def at(t):
            return Matrix.Translation(Vector(hold) - w * (seat / 1000) + a * (rise / 1000) - n * t - turnm @ KNUCKLES) @ turnm.to_4x4()
        if tree is None:
            return at(0.022), 0.022
        clear = False  # it starts `reach` away, where something else may stand: it must first be free
        for k in range(reach * 2, -12, -1):
            hit = any(near(tree, at(k * 0.0005) @ c, r) for c, r in PADS)
            if hit and clear:
                return at((k + 1) * 0.0005 - 0.0015), k * 0.0005
            clear = not hit
        return None, None

    tried = []
    for r in spread_of(rise):
        for s in spread_of(seat):
            frame, t = frame_of_hold(s, r)
            if frame is None:
                continue
            found, left_over = close_fingers(tree, frame, open_to, trigger is not None)
            if trigger is not None:
                left_over += 2 * on_trigger(tree, frame, trigger, 6)[0]
            tried.append((found, left_over, frame, t, s, r))
    assert tried, f"{label}: the palm meets nothing"
    least = min(c[1] for c in tried)
    found, left_over, frame, t, seat, rise = max((c for c in tried if c[1] <= least + 0.004), key=lambda c: (c[5], -c[4]))

    pose = {"palm": REST["palm"].copy()}
    pivot = Matrix.Translation(WRIST)
    pose["forearm"] = pivot @ UP.rotation_difference(arm).to_matrix().to_4x4() @ pivot.inverted() @ REST["forearm"]
    closed = {}  # finger: its angles and its swing
    for i, finger in enumerate(FINGER_NAMES):
        if finger not in found:
            continue
        angles, met = found[finger]
        if not met:  # in the air: it does what the finger beside it does
            others = [found[f][0] for f in sorted(found, key=lambda f: abs(FINGER_NAMES.index(f) - i)) if found[f][1]]
            angles = others[0] if others else LOOSE
        closed[finger] = (angles, SPREAD[finger])
    missed = 0.0
    if trigger is not None:
        missed, angles, swing = on_trigger(tree, frame, trigger, 2)
        closed["index"] = (angles, swing)
    for finger, (angles, swing) in closed.items():
        pose[f"{finger}0"] = REST[f"{finger}0"].copy()
        for k, m in enumerate(finger_bones(finger, angles, swing)):
            pose[f"{finger}{k + 1}"] = m

    # the thumb: its tip goes on the thing, its joints stay clear of it
    names = ("thumb1", "thumb2", "thumb3")
    if tree is None or thumb is None:
        m = REST["palm"]
        for b in names:
            m = m @ REL[b]
            pose[b] = m
    else:
        to_rest = frame.inverted()
        guess = frame @ KNUCKLES + (a * thumb[0] + n * thumb[1] + w * thumb[2]) / 1000
        on, _normal, _index, gap = tree.find_nearest(guess)
        target = to_rest @ (on + (guess - on).normalized() * GIRTH["thumb3"] * FLESH) if gap > 1e-5 else to_rest @ guess
        l1, l2, l3 = (LENGTH[b] for b in names)
        root = THUMB[0]
        bend = rad(22)  # of the last joint
        far = math.sqrt(l2 * l2 + l3 * l3 + 2 * l2 * l3 * math.cos(bend))
        d = max(abs(l1 - far) + 1e-4, min(l1 + far - 1e-4, (target - root).length))
        u = (target - root).normalized()
        target = root + u * d
        mid = frame @ root.lerp(target, 0.5)
        away_from = turnm.transposed() @ (mid - tree.find_nearest(mid)[0])
        away_from = (away_from - away_from.dot(u) * u).normalized()
        chosen = None
        for swing in (0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80):
            pole = Matrix.Rotation(rad(swing), 3, u) @ away_from
            c = (l1 * l1 + d * d - far * far) / (2 * l1 * d)
            j1 = root + l1 * (c * u + math.sqrt(max(0.0, 1 - c * c)) * pole)
            v = (target - j1).normalized()
            side = u.cross(pole).cross(v).normalized()
            if side.dot(pole) < 0:
                side = -side
            c = (l2 * l2 + far * far - l3 * l3) / (2 * l2 * far)
            j2 = j1 + l2 * (c * v + math.sqrt(max(0.0, 1 - c * c)) * side)
            room = min(tree.find_nearest(frame @ p)[3] - r * FLESH for p, r in ((j1, GIRTH["thumb1"]), (j2, GIRTH["thumb2"]), (j1.lerp(j2, 0.5), GIRTH["thumb2"]), (root.lerp(j1, 0.6), GIRTH["thumb1"])))
            if chosen is None or room > chosen[0]:
                chosen = (room, j1, j2)
            if room >= 0:
                break
        _room, j1, j2 = chosen
        m = REST["palm"]
        for k, (b, head, tail) in enumerate(zip(names, (root, j1, j2), (j1, j2, target))):
            m = m @ REL[b]
            y = (tail - head).normalized()
            r3 = (m.to_3x3() @ Y).rotation_difference(y).to_matrix() @ m.to_3x3()
            # then it rolls, so that its pad looks at the thing
            centre = frame @ head.lerp(tail, 0.5)
            pad = turnm.transposed() @ (tree.find_nearest(centre)[0] - centre)
            pad = pad - pad.dot(y) * y
            if pad.length > 1e-6:
                r3 = Matrix.Rotation(angle_about(y, r3 @ Z, pad.normalized()) * roll[k], 3, y) @ r3
            m = Matrix.Translation(head) @ r3.to_4x4()
            pose[b] = m

    if DEBUG or math.degrees(off) > 25 or missed > 0.006:
        print(f"  {label}: seat {seat} rise {rise} ({left_over * 1000:.0f} mm left, least {least * 1000:.0f}), palm {t * 1000:.0f} mm from the hold, wrist {math.degrees(off):.0f} degrees off the elbow, fingers " + " ".join(f"{f} {list(closed[f][0])}{'' if f not in found or found[f][1] else '~'}" for f in FINGER_NAMES) + (f", {missed * 1000:.0f} mm from the trigger" if trigger is not None else ""))
    return Grasp(frame, pose, frame @ WRIST, turnm @ arm)


def basis_of(pose):
    """The pose as Blender wants it: every bone against its parent."""
    return {b: ((pose[PARENT[b]] @ REL[b]) if PARENT[b] else REST[b]).inverted() @ pose[b] for b in ORDER}


def posed_skin(g, name, mirror=False):
    """The skin in a grasp, as a plain mesh in the weapon's space (for the previews)."""
    for b, m in basis_of(g.pose).items():
        rig.pose.bones[b].matrix_basis = m
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(base.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    o.vertex_groups.clear()
    mesh.transform((Matrix.Diagonal((-1, 1, 1, 1)) if mirror else Matrix.Identity(4)) @ g.frame)
    if mirror:
        mesh.flip_normals()
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    return o


POSES = {}


def record(name, g, hold):
    """A grasp as the game reads it: where every bone goes, in its axes, from the held point."""
    bones = {}
    for b in ORDER:
        m = B2G.to_4x4() @ Matrix.Translation(-Vector(hold)) @ g.frame @ g.pose[b] @ REST[b].inverted() @ G2B.to_4x4()
        q = m.to_quaternion()
        bones[b] = [round(c, 5) for c in (*m.translation, q.x, q.y, q.z, q.w)]
    wrist = B2G @ (g.wrist - Vector(hold))
    POSES[name] = {"bones": bones, "wrist": [round(c, 5) for c in wrist], "elbow": [round(c, 5) for c in wrist + B2G @ g.arm * 0.1]}


# --- the weapons and how each is held -------------------------------------------------------------
# How the game holds each weapon (`HOLD` in client/viewmodel.ts): where its origin is from the eye and
# how it is turned. The elbows are fixed to the shooter, so a turned weapon sees them elsewhere.
HOLDS = {}
with open(os.path.join(kit.HERE, "..", "..", "client", "viewmodel.ts")) as f:
    for m in re.finditer(r"^\s*(\w+): \{ hip: \[([^\]]+)\], rot: \[([^\]]+)\]", f.read(), re.M):
        HOLDS[m[1]] = (Vector([float(c) for c in m[2].split(",")]), [float(c) for c in m[3].split(",")])
assert len(HOLDS) >= 10, "the holds of client/viewmodel.ts were not found"
ELBOW = {"right": Vector((0.25, -0.55, 0.8)), "left": Vector((-0.35, -0.5, 0.8))}  # in the game's axes, from the hand


def held(weapon):
    """The game's turn of a weapon (three.js composes X, then Y, then Z)."""
    rx, ry, rz = HOLDS[weapon][1]
    return (Matrix.Rotation(rx, 3, "X") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rz, 3, "Z"))


def elbow_of(weapon, side):
    """Where the elbow is from a hand on this weapon; a left hand is solved in a mirror, its elbow too."""
    e = G2B @ (held(weapon).inverted() @ ELBOW[side]) if weapon in HOLDS else G2B @ ELBOW[side]
    return Vector((-e.x, e.y, e.z)) if side == "left" else e


# The shapes of a hold, in the weapon's axes (+Y the barrel, +Z up, +X the shooter's right), each for
# the hand that makes it: a left hand's is given as that hand is, and mirrored to be solved.
# `trigger`: the index goes on the weapon's `trigger` point.
GRIP = dict(axis=(0, 0.25, 0.97), palm=(-1, 0, 0), seat=(4, 32), rise=(-56, 0), thumb=(28, 46, -10), trigger=True)  # on a pistol grip, as high as it goes
WRIST_OF_STOCK = dict(axis=(0, 0.6, 0.8), palm=(-1, 0, 0), seat=(-24, 12), rise=(-44, 0), thumb=(28, 46, -10), trigger=True)  # on the neck of a straight stock
HANDLE = dict(axis=(0, 0, 1), seat=(0, 20), rise=(-28, 0), thumb=(42, 36, -6))  # on an upright round handle
CRADLE = dict(axis=(-0.57, 0.82, 0), palm=(0, 0, 1), seat=(10, 26), thumb=(44, 34, 16))  # the left hand under a fore-end, palm up
STICK = dict(axis=(0, 1, 0), seat=(0, 20), thumb=(42, 36, -6))  # around a stick that runs along the barrel
ROD = dict(axis=(-0.5, 0.87, 0), palm=(0, 0, 1), seat=(0, 20), thumb=(42, 36, -6))  # the left hand under a thin rod
LOOSE_HAND = dict(axis=(-0.92, 0.4, 0), palm=(0.3, 0, 1))  # a left hand that holds nothing yet
WEAPONS = {
    "mescul": dict(right=STICK, left=STICK),
    "mandi": dict(right=GRIP),
    "cramar": dict(right=GRIP, left=CRADLE, ignore=("pouch",)),  # its pouch swings: a hand does not rest on it
    "doplete": dict(right=WRIST_OF_STOCK, left=CRADLE),
    "cjampanili": dict(right=GRIP, left=CRADLE),
    "mulin": dict(right=GRIP, left=HANDLE, ignore=("mag",)),  # its box stands where the right hand is: the hand goes into it
    "miedi": dict(right=GRIP, left=ROD),
    "gjalinis": dict(right=GRIP),
    "lanciafrico": dict(right=GRIP, left=HANDLE),
    "mitraie": dict(right=HANDLE, left=HANDLE),
}


def mirrored(spec):
    out = dict(spec)
    for key in ("axis", "palm"):
        if key in spec:
            out[key] = (-spec[key][0], spec[key][1], spec[key][2])
    return out


def tree_of(objs, mirror=False):
    verts, polys = [], []
    for o in objs:
        if o.type != "MESH":
            continue
        first = len(verts)
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            verts.append(Vector((-p.x, p.y, p.z)) if mirror else p)
        polys += [[first + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def load(weapon, ignore=()):
    """The weapon's model as the game has it at rest: its meshes (but the parts in `ignore`) and its points (`left`, `trigger`)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f"{weapon}.glb"))
    bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o not in before]
    points = {o.name.split(".")[0]: o.matrix_world.translation.copy() for o in objs if o.type == "EMPTY"}
    for o in [o for o in objs if o.type != "MESH" or o.name.split(".")[0] in ("far", *ignore)]:
        objs.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    return objs, points


def face_of(tree, at):
    """The face of a trigger: what a finger coming from the muzzle's side meets first."""
    hit = tree.ray_cast(at + Vector((0, 0.012, 0)), Vector((0, -1, 0)), 0.03)[0]
    return hit if hit is not None else at


# --- sleeve: a gathered cuff, then loose linen with its folds ------------------------------------
def woven(name, color, scale):
    """Plain-coloured cloth with the weave as relief only (a colour cannot make a texture paler)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(nodes.new("ShaderNodeTexCoord").outputs["UV"], mapping.inputs["Vector"])
    weave = nodes.new("ShaderNodeTexImage")
    weave.image = bpy.data.images.load(os.path.join(kit.HERE, "tex", "hessian_n.jpg"), check_existing=True)
    weave.image.colorspace_settings.name = "Non-Color"
    links.new(mapping.outputs["Vector"], weave.inputs["Vector"])
    bump = nodes.new("ShaderNodeNormalMap")
    bump.inputs["Strength"].default_value = 0.6
    links.new(weave.outputs["Color"], bump.inputs["Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


LINEN = woven("linen", (0.80, 0.76, 0.66), 26.0)
CUFF = material("cuff", (0.30, 0.17, 0.10), roughness=0.9, texture="hessian", scale=30.0)
HORN = material("horn-button", (0.42, 0.33, 0.22), roughness=0.4)
CUFF_LENGTH = 0.026
band = lathe("cuff-band", [(0.031, 0.004), (0.0355, 0.0), (0.0362, -0.003), (0.0362, -CUFF_LENGTH + 0.003), (0.0355, -CUFF_LENGTH), (0.032, -CUFF_LENGTH - 0.002)], (0, 0, 0), CUFF, steps=28, bevel=0.0008)
button = lathe("cuff-button", [(0, 0.0026), (0.004, 0.002), (0.0052, 0.0), (0, 0.0)], (0, 0, 0), HORN, steps=14)
button.rotation_euler = (math.pi / 2, 0, 0)
button.location = (0, -CUFF_LENGTH / 2, 0.0362)
# loose linen: gathered into the cuff, then widening; its folds come from the noise below, not from rings
profile = [(0.033, -CUFF_LENGTH + 0.002)]
for i in range(1, 48):
    t = i / 47
    profile.append((0.0375 + 0.011 * min(1.0, i / 7) + 0.009 * t, -CUFF_LENGTH - i * 0.0095))
profile.append((0, profile[-1][1]))
cloth = lathe("sleeve-cloth", profile, (0, 0, 0), LINEN, steps=48)
for scale, strength in ((0.07, 0.016), (0.022, 0.006)):  # the big folds of a pushed-up sleeve, then the small creases
    noise = bpy.data.textures.new("folds", "CLOUDS")
    noise.noise_scale = scale
    push = cloth.modifiers.new("folds", "DISPLACE")
    push.texture = noise
    push.strength = strength
    push.mid_level = 0.45
    push.texture_coords = "GLOBAL"
sleeve = part("sleeve", [band, button, cloth], crease=60)

# --- every weapon in turn -------------------------------------------------------------------------
def sleeve_on(g, mirror=False):
    o = sleeve.copy()
    bpy.context.scene.collection.objects.link(o)
    flip = Matrix.Diagonal((-1, 1, 1)) if mirror else Matrix.Identity(3)
    wrist, arm = flip @ g.wrist, flip @ g.arm
    o.matrix_world = Matrix.Translation(wrist + arm * 0.012) @ Vector((0, -1, 0)).rotation_difference(arm).to_matrix().to_4x4()
    return o


def look(weapon, extras, points):
    """Stills of a weapon with its hands on: from the shooter's eye, then each hand from close by."""
    hip, _rot = HOLDS.get(weapon, (Vector((0, -0.3, -0.4)), None))
    turn = held(weapon) if weapon in HOLDS else Matrix.Identity(3)
    eye = G2B @ (turn.inverted() @ -hip)
    ahead = G2B @ (turn.inverted() @ Vector((0, 0, -1)))
    right, left = points
    views = {"eye": (eye, eye + ahead, 17.5), "grip": (right + Vector((-0.20, 0.12, 0.10)), right, 55), "back": (right + Vector((0.13, -0.24, 0.13)), right, 55)}
    if left is not None:
        views["fore"] = (left + Vector((-0.20, -0.12, 0.12)), left, 55)
        views["under"] = (left + Vector((0.12, 0.02, -0.26)), left, 55)
    for view, (at, target, lens) in views.items():
        kit.preview(os.path.join(previews, f"{weapon}-{view}.png"), eye=at, target=target, lens=lens, size=(1280, 720) if view == "eye" else (800, 450), samples=16)
    for o in extras:
        bpy.data.objects.remove(o, do_unlink=True)


sleeve.hide_render = True
if previews and "bare" in only:  # the hand alone: at rest from both sides, then closed on a stick
    middle = Vector((1.425, 0.01, 0.27))
    for view, eye in (("back", (0.03, -0.4, 0.05)), ("palm", (0.03, 0.4, 0.05)), ("side", (0.36, -0.16, 0.0))):
        kit.preview(os.path.join(previews, f"bare-{view}.png"), eye=middle + Vector(eye), target=middle, lens=55, size=(800, 800), samples=24)
    stick = kit.tube("bench-stick", 0.016, 0.3, (0, -0.15, 0), material("bench-wood", (0.5, 0.38, 0.25), roughness=0.7), axis="Y", steps=24)
    bpy.context.view_layer.update()
    g = grasp("bare fist", tree_of([stick]), (0, 0, 0), G2B @ ELBOW["right"], **STICK)
    extras = [posed_skin(g, "bench-right"), sleeve_on(g)]
    for o in extras:
        o.hide_render = False
    for view, eye in (("fist-top", (0.06, -0.14, 0.26)), ("fist-side", (0.28, 0.06, 0.08)), ("fist-front", (-0.1, 0.28, 0.1)), ("fist-under", (-0.05, -0.05, -0.3))):
        kit.preview(os.path.join(previews, f"bare-{view}.png"), eye=Vector(eye), target=Vector((0, 0, 0)), lens=55, size=(800, 800), samples=24)
    for o in (*extras, stick):
        bpy.data.objects.remove(o, do_unlink=True)
for weapon, spec in WEAPONS.items():
    if only and weapon not in only:
        continue
    objs, points = load(weapon, spec.get("ignore", ()))
    left_at = points.get("left")
    tree = tree_of(objs)
    extras = []
    right = dict(spec["right"])
    if right.pop("trigger", False):
        assert "trigger" in points, f"{weapon}: its file has no `trigger` point (rebuild it)"
        right["trigger"] = face_of(tree, points["trigger"])
    g = grasp(f"{weapon} right", tree, (0, 0, 0), elbow_of(weapon, "right"), **right)
    record(f"{weapon}_right", g, (0, 0, 0))
    if previews:
        extras += [posed_skin(g, "bench-right"), sleeve_on(g)]
    two_handed = left_at is not None and "left" in spec
    if two_handed:
        hold = Vector((-left_at.x, left_at.y, left_at.z))
        g = grasp(f"{weapon} left", tree_of(objs, mirror=True), hold, elbow_of(weapon, "left"), **mirrored(spec["left"]))
    else:  # it only comes up to reload
        hold = Vector((0, 0, 0))
        g = grasp(f"{weapon} left", None, hold, elbow_of(weapon, "left"), **mirrored(LOOSE_HAND))
    record(f"{weapon}_left", g, hold)
    if previews:
        if two_handed:
            extras += [posed_skin(g, "bench-left", mirror=True), sleeve_on(g, mirror=True)]
        for o in extras:
            o.hide_render = False
        look(weapon, extras, (Vector((0, 0, 0)), left_at if two_handed else None))
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)

# the left hand that throws the bottle of sgnape: the bottle as `createViewmodel` places it in that hand
glass = material("bench-glass", (0.3, 0.4, 0.3), roughness=0.2)
bottle = lathe("bottle", [(0.001, 0), (0.034, 0), (0.037, 0.01), (0.037, 0.11), (0.028, 0.14), (0.012, 0.16), (0.012, 0.2), (0, 0.2)], (0, 0, 0), glass, axis="Z", steps=24)
turn = Matrix.Rotation(-0.3, 3, "X") @ Matrix.Rotation(0.2, 3, "Z")  # the game's (-0.3, 0, 0.2)
bottle.matrix_world = Matrix.Translation((0, 0.02, 0)) @ (G2B @ turn @ B2G).to_4x4() @ Matrix.Scale(0.8, 4)
bpy.context.view_layer.update()
bottle_axis = (G2B @ turn @ B2G) @ Z
hold = bottle.matrix_world @ Vector((0, 0, 0.055))
hold.x = -hold.x
g = grasp("toss left", tree_of([bottle], mirror=True), hold, elbow_of("toss", "left"), axis=(-bottle_axis.x, bottle_axis.y, bottle_axis.z), seat=(0, 24), thumb=(42, 40, -6))
record("toss_left", g, (0, 0, 0))
if previews and (not only or "toss" in only):
    extras = [posed_skin(g, "bench-left", mirror=True), sleeve_on(g, mirror=True)]
    for o in extras:
        o.hide_render = False
    at = Vector((-hold.x, hold.y, hold.z))
    for view, eye in (("front", at + Vector((0.05, 0.28, 0.1))), ("side", at + Vector((0.28, -0.05, 0.08)))):
        kit.preview(os.path.join(previews, f"toss-{view}.png"), eye=eye, target=at, lens=55, size=(800, 450), samples=16)
    for o in extras:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.data.objects.remove(bottle, do_unlink=True)

# --- out -----------------------------------------------------------------------------------------
if only:
    sys.exit(0)  # a look at some weapons, not a build
sleeve.hide_render = False
rig["poses"] = json.dumps(POSES, separators=(",", ":"))
kit._select([base, rig, sleeve])
bpy.ops.export_scene.gltf(filepath=args[0], export_format="GLB", use_selection=True, export_yup=True, export_extras=True, export_animations=False, export_image_format="WEBP", export_image_quality=85)
print(f"exported {args[0]}: {os.path.getsize(args[0]) // 1024} KB, {len(POSES)} poses")
