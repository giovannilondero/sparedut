"""
Modelling helpers for the weapons, run inside Blender (`blender -b --python <weapon>.py`).

Everything is authored in Blender's axes, in metres, with the right-hand grip at the origin:
+Y is where the barrel points, +Z is up, +X is the shooter's right. The glTF exporter turns
that into the game's axes (barrel towards -z, y up).
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# --- materials ---------------------------------------------------------------------------

def material(name, color, metallic=0.0, roughness=0.5, texture=None, scale=1.0, tint=1.0):
    """A Principled material; `texture` is the name of a colour/normal/roughness set in tex/."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if texture:
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (scale, scale, scale)
        links.new(nodes.new("ShaderNodeTexCoord").outputs["UV"], mapping.inputs["Vector"])

        def image(suffix, colorspace):
            path = os.path.join(HERE, "tex", f"{texture}_{suffix}.jpg")
            if not os.path.exists(path):
                return None
            n = nodes.new("ShaderNodeTexImage")
            n.image = bpy.data.images.load(path, check_existing=True)
            n.image.colorspace_settings.name = colorspace
            links.new(mapping.outputs["Vector"], n.inputs["Vector"])
            return n

        d = image("d", "sRGB")
        if d:
            mix = nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            links.new(d.outputs["Color"], mix.inputs["A"])
            mix.inputs["B"].default_value = (tint * color[0], tint * color[1], tint * color[2], 1.0)
            # The exporter understands a texture multiplied by a factor: it becomes the base colour factor.
            links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        n = image("n", "Non-Color")
        if n:
            nm = nodes.new("ShaderNodeNormalMap")
            links.new(n.outputs["Color"], nm.inputs["Color"])
            links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        r = image("r", "Non-Color")
        if r:
            links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    return m


# --- meshes ------------------------------------------------------------------------------

def _object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mat:
        me.materials.append(mat)
    return o


def _finish(o, bevel, segments=3):
    """Rounded edges are what catches the light on a real object: every part gets them."""
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(35)
        b.harden_normals = False
    return o


def box(name, size, at, mat, bevel=0.0015, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2 for s in size)
    v = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    o = _object(name, v, f, mat)
    o.location = at
    o.rotation_euler = rot
    return _finish(o, bevel)


def lathe(name, profile, at, mat, axis="Y", steps=40, bevel=0.0):
    """Revolves `profile`, a list of (radius, distance along the axis), around `axis`."""
    verts, faces = [], []
    rings = []
    for r, a in profile:
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, a, 0.0))
        else:
            rings.append(list(range(len(verts), len(verts) + steps)))
            for i in range(steps):
                t = 2 * math.pi * i / steps
                verts.append((r * math.cos(t), a, r * math.sin(t)))
    for a, b in zip(rings, rings[1:]):
        for i in range(steps):
            j = (i + 1) % steps
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                faces.append((a[0], b[i], b[j]))
            elif len(b) == 1:
                faces.append((a[i], b[0], a[j]))
            else:
                faces.append((a[i], b[i], b[j], a[j]))
    o = _object(name, verts, faces, mat)
    # built around Y: turn it to the requested axis
    if axis == "X":
        o.data.transform(Matrix.Rotation(-math.pi / 2, 4, "Z"))
    elif axis == "Z":
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    o.location = at
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return _finish(o, bevel, 2)


def tube(name, radius, length, at, mat, axis="Y", steps=32, bevel=0.0008):
    """A solid cylinder from `at` along +axis."""
    return lathe(name, [(0, 0), (radius, 0), (radius, length), (0, length)], at, mat, axis, steps, bevel)


def slab(name, outline, width, mat, bevel=0.004, segments=4, at=(0, 0, 0)):
    """A side outline (a list of (y, z), counter-clockwise seen from +X) given a thickness along X."""
    n = len(outline)
    h = width / 2
    verts = [(-h, y, z) for y, z in outline] + [(h, y, z) for y, z in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    o = _object(name, verts, faces, mat)
    o.location = at
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return _finish(o, bevel, segments)


def cut(o, cutters):
    """Removes the cutters' volume from `o`. The cut comes before the bevel: its edges are rounded too."""
    for c in cutters:
        m = o.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
        m.solver = "EXACT"
        o.modifiers.move(len(o.modifiers) - 1, 0)
        c.hide_render = True
        c["cutter"] = True
    return o


def ribbon(name, line, thickness, width, mat, bevel=0.0008):
    """A strip of metal bent along `line`, a list of (y, z): trigger guards, straps."""
    left, right = [], []
    for i, (y, z) in enumerate(line):
        y0, z0 = line[max(i - 1, 0)]
        y1, z1 = line[min(i + 1, len(line) - 1)]
        d = Vector((y1 - y0, z1 - z0)).normalized()
        n = Vector((-d.y, d.x)) * thickness / 2
        left.append((y + n.x, z + n.y))
        right.append((y - n.x, z - n.y))
    return slab(name, left + right[::-1], width, mat, bevel, 2)


def _select(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def part(name, objs, pivot=(0, 0, 0), crease=38):
    """
    Joins `objs` (modifiers applied) into one object whose origin is `pivot`. Edges sharper
    than `crease` degrees stay hard; a soft thing (cloth) takes 180.
    """
    _select(objs)
    bpy.ops.object.convert(target="MESH")
    _select(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.transform(Matrix.Translation(-Vector(pivot)))
    o.location = pivot
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.set_sharp_from_angle(angle=math.radians(crease))
    uv_box(o)
    return o


def uv_box(o):
    """UVs in metres, projected along each face's dominant axis: textures keep a real scale."""
    me = o.data
    uv = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if ax >= ay and ax >= az:
                uv.data[li].uv = (v.y, v.z)
            elif ay >= az:
                uv.data[li].uv = (v.x, v.z)
            else:
                uv.data[li].uv = (v.y, v.x)


def drop_cutters():
    for o in [o for o in bpy.context.scene.objects if o.get("cutter")]:
        bpy.data.objects.remove(o, do_unlink=True)


def marker(name, at):
    """An empty the game reads as a point: the muzzle, the left hand."""
    e = bpy.data.objects.new(name, None)
    e.location = at
    bpy.context.scene.collection.objects.link(e)
    return e


# --- output ------------------------------------------------------------------------------

def export(path):
    drop_cutters()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, use_selection=True, export_image_format="WEBP", export_image_quality=85, export_yup=True)
    print(f"exported {path}: {os.path.getsize(path) // 1024} KB")


def preview(path, eye, target, lens=35.0, size=(1280, 720), samples=48):
    """A quick Cycles still, to look at the model before it goes into the game."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = "Filmic" if "Filmic" in [v.name for v in type(scene.view_settings).bl_rna.properties["view_transform"].enum_items] else scene.view_settings.view_transform
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    cam.data.clip_start = 0.01
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = Euler((math.radians(50), 0, math.radians(-40)))
    scene.collection.objects.link(sun)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun):
        bpy.data.objects.remove(o, do_unlink=True)
