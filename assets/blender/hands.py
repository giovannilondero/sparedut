"""
The shooter's hands and sleeves, for the first-person weapon.

    blender -b --python assets/blender/hands.py -- <out.glb> [preview-folder]

Three nodes, all for the RIGHT arm (the game mirrors them for the left):
  - `fist`: a hand closed around a grip, a stick, a handle;
  - `cup`:  a looser hand, cradling a fore-end;
  - `sleeve`: the linen sleeve with its cuff, from the wrist towards the elbow.

A hand's origin is the centre of what it holds. Its frame, in Blender's axes: the held
thing runs along Z with the thumb side up, the forearm leaves towards -Y, the palm faces -X.
The wrist is at `WRIST`; the sleeve starts at its own origin and runs along -Y.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import lathe, marker, material, part, tube

args = sys.argv[sys.argv.index("--") + 1:]
kit.reset()

SKIN = material("skin", (0.62, 0.34, 0.22), roughness=0.52)
NAIL = material("nail", (0.74, 0.50, 0.40), roughness=0.28)


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
CUFF = material("cuff", (0.20, 0.11, 0.06), roughness=0.9, texture="hessian", scale=30.0)
HORN = material("horn-button", (0.42, 0.33, 0.22), roughness=0.4)

WRIST = Vector((0.021, -0.082, -0.002))
UP = Vector((0, 0, 1))


def flesh(bm, p, q, r1, r2):
    """A rounded limb from p to q: two balls and the cone between them."""
    p, q = Vector(p), Vector(q)
    for at, r in ((p, r1), (q, r2)):
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r, matrix=Matrix.Translation(at))
    d = q - p
    turn = UP.rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r1, radius2=r2, depth=d.length, matrix=Matrix.Translation((p + q) / 2) @ turn)


def lump(bm, at, radii):
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0, matrix=Matrix.Translation(at) @ Matrix.Diagonal((*radii, 1.0)))


def nail(name, at, along, out, length, width):
    """A nail: a thin rounded plate lying on the fingertip, `out` being the way it faces."""
    bm = bmesh.new()
    lump(bm, Vector((0, 0, 0)), (0.0011, length / 2, width / 2))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(NAIL)
    return oriented(o, at, along, out)


def oriented(o, at, along, out):
    """Places `o` at `at` with its Y along `along` and its X along `out`."""
    y = Vector(along).normalized()
    x = (Vector(out) - Vector(out).dot(y) * y).normalized()
    z = x.cross(y)
    o.matrix_world = Matrix.Translation(at) @ Matrix((x, y, z)).transposed().to_4x4()
    return o


def hand(name, fingers, thumb, shift):
    """
    `fingers`: the joints of the index finger seen from above (x, y): knuckle, two joints, tip.
    `thumb`: its four joints (x, y, z). `shift`: how far the palm sits from the held thing.
    """
    bm = bmesh.new()
    nails = []
    # (height on the held thing, length, thickness) from the index to the little finger
    for i, (z, length, r) in enumerate(((0.0225, 1.0, 0.0090), (0.0040, 1.08, 0.0093), (-0.0140, 1.0, 0.0088), (-0.0305, 0.82, 0.0076))):
        k = Vector((fingers[0][0], fingers[0][1], z))
        joints = [k] + [k + (Vector((x, y, z)) - k) * length for x, y in fingers[1:]]
        # the little finger's knuckle sits a little back, as the palm's edge curves
        if i == 3:
            joints = [j + Vector((-0.002, -0.004, 0)) for j in joints]
        for (p, q), (r1, r2) in zip(zip(joints, joints[1:]), ((r, r * 0.92), (r * 0.92, r * 0.84), (r * 0.84, r * 0.74))):
            flesh(bm, p, q, r1, r2)
        # the knuckle shows on the back of the hand
        lump(bm, joints[0] + Vector((0.004, -0.004, 0)), (0.0085, 0.011, r * 1.02))
        d = joints[3] - joints[2]
        mid = joints[2] + d * 0.62
        out = Vector((mid.x, mid.y, 0)).normalized()
        nails.append(nail(f"{name}-nail{i}", mid + out * r * 0.70, d, out, 0.0115, r * 1.5))
        # the middle joint is the thickest part of a finger
        lump(bm, joints[1], (r * 1.02, r * 1.02, r * 0.98))

    a, b, c, d = (Vector(p) for p in thumb)
    flesh(bm, a, b, 0.0135, 0.0112)
    flesh(bm, b, c, 0.0112, 0.0100)
    flesh(bm, c, d, 0.0100, 0.0086)
    mid = c + (d - c) * 0.6
    out = (Vector((mid.x, mid.y, 0)).normalized() + Vector((0, 0, 0.45))).normalized()
    nails.append(nail(f"{name}-nail-thumb", mid + out * 0.0074, d - c, out, 0.013, 0.0125))

    s = Vector((shift, 0, 0))
    lump(bm, Vector((0.024, -0.020, -0.004)) + s, (0.0125, 0.036, 0.043))  # palm and back of the hand
    lump(bm, Vector((0.017, -0.034, 0.014)) + s, (0.014, 0.022, 0.019))  # ball of the thumb
    lump(bm, Vector((0.019, -0.040, -0.027)) + s, (0.012, 0.021, 0.016))  # heel, little-finger side
    # the wrist, wider than it is thick
    w0, w1 = Vector((0.022, -0.046, -0.002)) + s, WRIST + Vector((0, -0.03, 0))
    turn = UP.rotation_difference((w1 - w0).normalized()).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.021, radius2=0.0195, depth=(w1 - w0).length, matrix=Matrix.Translation((w0 + w1) / 2) @ turn @ Matrix.Diagonal((1.0, 1.42, 1.0, 1.0)))

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    skin = bpy.data.objects.new(f"{name}-skin", me)
    bpy.context.scene.collection.objects.link(skin)
    me.materials.append(SKIN)
    # one skin over all of it: fused, softened, then thinned
    remesh = skin.modifiers.new("fuse", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.0011
    smooth = skin.modifiers.new("soften", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 6
    thin = skin.modifiers.new("thin", "DECIMATE")
    thin.ratio = 0.07
    return part(name, [skin, *nails], crease=180)


# closed around a 3.4 cm grip
fist = hand(
    "fist",
    fingers=[(0.031, 0.006), (-0.002, 0.029), (-0.024, 0.017), (-0.030, -0.004)],
    thumb=[(0.024, -0.040, 0.016), (0.004, -0.036, 0.040), (-0.022, -0.020, 0.046), (-0.030, 0.008, 0.042)],
    shift=0.0,
)
# cradling something 5 to 6 cm across
cup = hand(
    "cup",
    fingers=[(0.036, 0.000), (0.016, 0.035), (-0.008, 0.043), (-0.028, 0.034)],
    thumb=[(0.030, -0.040, 0.016), (0.012, -0.040, 0.040), (-0.014, -0.034, 0.050), (-0.034, -0.014, 0.050)],
    shift=0.005,
)

# --- sleeve: a gathered cuff, then loose linen with its folds ------------------------------------
band = lathe("cuff-band", [(0, 0.004), (0.030, 0.004), (0.0335, 0.0), (0.0345, -0.004), (0.0345, -0.030), (0.0335, -0.034), (0.030, -0.036)], (0, 0, 0), CUFF, steps=28, bevel=0.0008)
button = lathe("cuff-button", [(0, 0.0026), (0.004, 0.002), (0.0052, 0.0), (0, 0.0)], (0, 0, 0), HORN, steps=14)
button.rotation_euler = (math.pi / 2, 0, 0)
button.location = (0, -0.017, 0.0345)
profile = [(0.031, -0.030)]
for i in range(1, 60):
    a = -0.030 - i * 0.0075
    t = i / 59
    # gathered tight at the cuff, billowing, then the folds of a sleeve pushed up the forearm
    r = 0.034 + 0.016 * min(1.0, i / 9) + 0.006 * t + 0.0030 * math.sin(i * 1.9) * (0.4 + 0.6 * math.sin(i * 0.37) ** 2)
    profile.append((r, a))
profile.append((0, profile[-1][1]))
cloth = lathe("sleeve-cloth", profile, (0, 0, 0), LINEN, steps=40)
# folds are not rings: a slow noise pushes them out of round
noise = bpy.data.textures.new("folds", "CLOUDS")
noise.noise_scale = 0.045
push = cloth.modifiers.new("folds", "DISPLACE")
push.texture = noise
push.strength = 0.012
push.mid_level = 0.5
push.texture_coords = "GLOBAL"
sleeve = part("sleeve", [band, button, cloth], crease=60)
sleeve.data.transform(Matrix.Diagonal((1.0, 1.0, 0.86, 1.0)))  # a forearm is not round

marker("wrist", WRIST)
kit.export(args[0], far=False)

if len(args) > 1:
    # as on a weapon: the fist on a grip with its sleeve, the cup beside it
    steel = material("grip", (0.2, 0.2, 0.22), metallic=1.0, roughness=0.4)
    tube("grip", 0.017, 0.14, (0, 0, -0.07), steel, axis="Z")
    sleeve.location = WRIST
    cup.location = (-0.16, 0, 0)
    tube("fore-end", 0.027, 0.14, (-0.16, 0, -0.07), steel, axis="Z")
    kit.preview(os.path.join(args[1], "hands-left.png"), eye=(-0.62, 0.16, 0.16), target=(-0.06, -0.05, 0.0), lens=50)
    kit.preview(os.path.join(args[1], "hands-back.png"), eye=(0.42, -0.22, 0.24), target=(-0.06, -0.06, 0.0), lens=50)
    kit.preview(os.path.join(args[1], "hands-top.png"), eye=(-0.08, -0.20, 0.34), target=(-0.08, -0.05, 0.0), lens=50)
