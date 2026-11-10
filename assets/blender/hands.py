"""
The shooter's hands and sleeves, for the first-person weapon.

    blender -b --python assets/blender/hands.py -- <out.glb> [preview-folder]

The hand is the realistic one of Blender's Human Base Meshes (CC0, `hand-base.blend`). This
script gives it a skeleton, paints its skin, and then closes it on every weapon in turn: the
weapons' own files are read from the folder of <out.glb> (build them first), and each finger
bends until it meets the model. What is exported:
  - `skin`: the RIGHT hand at rest, bound to the skeleton `rig`;
  - `rig.poses` (a JSON string): for `<weapon>_right`, `<weapon>_left` and `toss_left`, where every
    bone goes, and `wrist`/`elbow`: where the forearm leaves and which way;
  - `sleeve`: the linen sleeve with its cuff, from its origin towards -Y.
A pose is in the game's axes, relative to the point the hand holds (the weapon's origin for the
right hand, its `left` point for the left one). The left hands are solved in a mirror: the game
flips them back (`client/models/hands.ts`).

HANDS_ONLY=cramar,mandi limits the previews to those weapons; HANDS_DEBUG=1 prints every solve.
"""
import json
import math
import os
import re
import sys

import bpy
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

# --- the base mesh and where its joints are -----------------------------------------------------
with bpy.data.libraries.load(os.path.join(kit.HERE, "hand-base.blend")) as (src, dst):
    dst.objects = ["Hand  - Realistic"]
base = dst.objects[0]
bpy.context.scene.collection.objects.link(base)
base.name = "skin"
VERTS = [v.co.copy() for v in base.data.vertices]
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

# --- skin: one colour per vertex -----------------------------------------------------------------
me = base.data
SKIN_TONE = Vector((0.56, 0.29, 0.19))
PALM_TONE = Vector((0.63, 0.36, 0.28))
BLOOD = Vector((0.60, 0.20, 0.15))
NAIL_TONE = Vector((0.72, 0.52, 0.46))
neighbours = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices
    neighbours[a].append(b)
    neighbours[b].append(a)
group = {g.index: g.name for g in base.vertex_groups}
tips = ("index3", "middle3", "ring3", "little3", "thumb3")
mids = ("index2", "middle2", "ring2", "little2", "index1", "middle1", "ring1", "little1", "thumb2")
tones = []
for v in me.vertices:
    near = [me.vertices[i].co for i in neighbours[v.index]]
    mean = sum(near, Vector()) / len(near)
    size = sum((p - v.co).length for p in near) / len(near)
    hollow = max(0.0, min(1.0, (mean - v.co).dot(v.normal) / size * 2.2))  # a crease, a web between fingers
    ridge = max(0.0, min(1.0, (v.co - mean).dot(v.normal) / size * 2.5))  # a knuckle, a tendon
    w = {group[g.group]: g.weight for g in v.groups}
    tip = sum(w.get(n, 0) for n in tips)
    finger = sum(w.get(n, 0) for n in mids)
    inside = max(0.0, v.normal.dot(PALM))
    back = max(0.0, -v.normal.dot(PALM))
    c = SKIN_TONE.lerp(PALM_TONE, inside * 0.8)
    c = c.lerp(BLOOD, min(1.0, tip * 0.5 + finger * back * ridge * 0.7 + ridge * back * 0.35 + hollow * 0.25))
    c = c * (1.0 - 0.6 * hollow)
    tones.append(c)

# nails: the faces on the back of each fingertip
skin_mat = bpy.data.materials.new("skin")
nail_mat = bpy.data.materials.new("nail")
for m, rough in ((skin_mat, 0.44), (nail_mat, 0.3)):
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    paint = m.node_tree.nodes.new("ShaderNodeVertexColor")
    paint.layer_name = "Col"
    m.node_tree.links.new(paint.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.append(m)
nailed = set()
for name, joints, pad, half in [(n, JOINTS[n], PALM, 0.0050 if n != "little" else 0.0042) for n in JOINTS] + [("thumb", THUMB, THUMB_PAD, 0.0066)]:
    h, t = joints[-2], joints[-1]
    a = (t - h).normalized()
    out = (-pad - (-pad).dot(a) * a).normalized()
    side = a.cross(out)
    for f in me.polygons:
        c = f.center - h
        if 0.48 * (t - h).length < c.dot(a) < 1.05 * (t - h).length and f.normal.dot(out) > 0.72 and abs(c.dot(side)) < half and c.dot(out) > 0:
            f.material_index = 1
            nailed.update(f.vertices)
for i in nailed:
    tones[i] = NAIL_TONE.copy()
col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
for i, c in enumerate(tones):
    col.data[i].color = (c.x, c.y, c.z, 1.0)
me.color_attributes.active_color = col
me.color_attributes.render_color_index = 0


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

# a rounder, lighter skin (the weights and the colours follow)
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
SPREAD = {"index": 3, "middle": 0, "ring": -3, "little": -8}
LIMIT = (88, 105, 72)  # how far a knuckle, a middle joint and a last joint close
LOOSE = (30, 42, 28)  # a finger that meets nothing
STEP = 2
FLESH = 0.78  # how much of its girth a finger keeps when it presses on something
KNUCKLES = (JOINTS["index"][0] + JOINTS["little"][0]) / 2
PADS = []  # what of the palm lies on the thing: the knuckles and the middle of the hand
for _name, _j in JOINTS.items():
    _root = WRIST + Vector(((_j[0].x - WRIST.x) * 0.45, 0, -0.012))
    PADS += [(_j[0], 0.0105), (_root.lerp(_j[0], 0.55), 0.011)]


def near(tree, p, r):
    return tree is not None and tree.find_nearest(p, r)[0] is not None


def touches(tree, a, b, r):
    """Whether the bone from `a` to `b`, `r` thick, is on the thing."""
    return any(near(tree, a.lerp(b, t), r) for t in (0.3, 0.5, 0.7, 0.85, 1.0))


def angle_about(axis, a, b):
    """The signed angle from `a` to `b` around `axis`."""
    return math.atan2(a.cross(b).dot(axis), a.dot(b))


def finger_bones(finger, angles):
    """Where the three bones of a finger are (the rig's space) when its joints close by `angles` degrees."""
    m = REST[f"{finger}0"]
    out = []
    for k in range(3):
        turn = Matrix.Rotation(rad(angles[k]), 4, "X")
        if k == 0:
            turn = Matrix.Rotation(rad(SPREAD[finger]), 4, "Z") @ turn
        m = m @ REL[f"{finger}{k + 1}"] @ turn
        out.append(m)
    return out


def close_fingers(tree, frame, open_to=None, trigger=False):
    """
    Every joint closes until its bone lies on the thing. Gives each finger's angles and whether it met
    anything, and how far the fingers are left from the thing, summed: the less, the better the hold
    (but for the index, with `trigger`: that one goes where the trigger is, not round the grip).
    """
    found, left_over = {}, 0.0
    for finger in FINGER_NAMES:
        angles, met = [0, 0, 0], False
        for k in range(3):
            b = f"{finger}{k + 1}"
            limit = LIMIT[k] if k or open_to is None else min(LIMIT[k], open_to)
            if trigger and finger == "index" and k == 2:
                limit = 24  # a trigger finger lies flat on the trigger
            while angles[k] < limit:
                angles[k] += STEP
                m = frame @ finger_bones(finger, angles)[k]
                if touches(tree, m.translation, m @ Vector((0, LENGTH[b], 0)), GIRTH[b] * FLESH):
                    angles[k] -= STEP
                    met = True
                    break
        found[finger] = (angles, met)
        if tree is not None and not (trigger and finger == "index"):
            bones = finger_bones(finger, angles)
            for k, weight in ((1, 0.5), (2, 1.0)):
                b = f"{finger}{k + 1}"
                end = frame @ bones[k] @ Vector((0, LENGTH[b], 0))
                left_over += weight * min(0.03, max(0.0, tree.find_nearest(end)[3] - GIRTH[b])) if met else weight * 0.03
            left_over += 0.0002 * max(0, 150 - sum(angles))  # a finger lying along the thing does not hold it
    return found, left_over


class Grasp:
    """A hand closed on something: `frame` puts the rest hand in the weapon's space, `pose` its bones."""

    def __init__(self, frame, pose, wrist, arm):
        self.frame, self.pose, self.wrist, self.arm = frame, pose, wrist, arm


def spread_of(v):
    """A number, or a range (low, high) to try every 4 millimetres."""
    return [v] if isinstance(v, (int, float)) else list(range(v[0], v[1] + 1, 4))


def grasp(label, tree, hold, elbow, axis, palm=None, seat=0, rise=0, turn=0.0, thumb=None, open_to=None, trigger=False, reach=100, roll=(0.3, 0.6, 0.8)):
    """
    Closes the right hand on the thing in `tree` (the weapon's space, Blender's axes; None: on nothing).
    `hold`: the point held. `axis`: where the thumb side of the hand points, the line of the knuckles.
    `palm`: where the palm faces, towards the thing; None for a round thing, held from the side that
    asks least of the wrist. `turn`: degrees the palm turns around `axis`.
    `seat`: how far in front of the held point the knuckles lie, `rise`: how far towards the thumb
    side the hand sits (millimetres); a range (low, high) is searched for the hold that wraps best,
    and of those that wrap as well, the one highest on the thing and furthest back. `trigger`: the
    index is the trigger finger, and is left out of that. `reach`: from how far the palm comes in
    (millimetres): less, when something else stands beside what is held.
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

    def frame_of(seat, rise):
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
            frame, t = frame_of(s, r)
            if frame is not None:
                tried.append((close_fingers(tree, frame, open_to, trigger), frame, t, s, r))
    assert tried, f"{label}: the palm meets nothing"
    least = min(c[0][1] for c in tried)
    (found, left_over), frame, t, seat, rise = max((c for c in tried if c[0][1] <= least + 0.004), key=lambda c: (c[4], -c[3]))

    pose = {"palm": REST["palm"].copy()}
    pivot = Matrix.Translation(WRIST)
    pose["forearm"] = pivot @ UP.rotation_difference(arm).to_matrix().to_4x4() @ pivot.inverted() @ REST["forearm"]
    for i, finger in enumerate(FINGER_NAMES):
        angles, met = found[finger]
        if not met:  # in the air: it does what its neighbour does
            others = [found[f][0] for f in sorted(FINGER_NAMES, key=lambda f: abs(FINGER_NAMES.index(f) - i)) if found[f][1]]
            angles[:] = others[0] if others else LOOSE
        pose[f"{finger}0"] = REST[f"{finger}0"].copy()
        for k, m in enumerate(finger_bones(finger, angles)):
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
        away = turnm.transposed() @ (mid - tree.find_nearest(mid)[0])
        away = (away - away.dot(u) * u).normalized()
        chosen = None
        for swing in (0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80):
            pole = Matrix.Rotation(rad(swing), 3, u) @ away
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

    if DEBUG or math.degrees(off) > 25:
        print(f"  {label}: seat {seat} rise {rise} ({left_over * 1000:.0f} mm left, least {least * 1000:.0f}), palm {t * 1000:.0f} mm from the hold, wrist {math.degrees(off):.0f} degrees off the elbow, fingers " + " ".join(f"{found[f][0]}{'' if found[f][1] else '~'}" for f in FINGER_NAMES))
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
    """The weapon's model as the game has it at rest: its meshes (but the parts in `ignore`) and its `left` point."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f"{weapon}.glb"))
    bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o not in before]
    left = next((o.matrix_world.translation.copy() for o in objs if o.name.split(".")[0] == "left"), None)
    for o in [o for o in objs if o.type != "MESH" or o.name.split(".")[0] in ("far", *ignore)]:
        objs.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    return objs, left


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
previews = args[1] if len(args) > 1 else None
only = [w for w in os.environ.get("HANDS_ONLY", "").split(",") if w]


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
for weapon, spec in WEAPONS.items():
    if only and weapon not in only:
        continue
    objs, left_at = load(weapon, spec.get("ignore", ()))
    extras = []
    g = grasp(f"{weapon} right", tree_of(objs), (0, 0, 0), elbow_of(weapon, "right"), **spec["right"])
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
