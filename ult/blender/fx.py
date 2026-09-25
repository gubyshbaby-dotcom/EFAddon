"""Visual effects in Blender, and the event log Minecraft replays them from.

Nothing here is part of the Epic Fight animation: these are scene objects that make the
Blender cut read like the reference (impact flashes, strobes, speed lines, lightning,
Granite Blast beams, shock rings, dust, debris, blood, glass cracks). Every helper also
appends an entry to EVENTS, so out/events/*.json tells the mod what to spawn, where and
when: particles, beams, screen flashes, shakes and hit-stops.

Positions in EVENTS are Blender world space here; the exporter converts them to the
VIX rig frame (x forward, y up, z right of the caster at frame 0).
"""

from __future__ import annotations

import math
import random

import bpy
from mathutils import Matrix, Vector

EVENTS = []
FX_COLLECTION = "FX"

WHITE = (1.0, 1.0, 1.0)
BLACK = (0.0, 0.0, 0.0)
CYAN = (0.35, 0.85, 1.0)
PINK = (1.0, 0.45, 0.85)
BEAM_CORE = (0.85, 0.97, 1.0)
DUST = (0.62, 0.58, 0.53)
DEBRIS = (0.18, 0.18, 0.2)
BLOOD = (0.55, 0.04, 0.04)


def event(etype, f, **params):
    e = {"type": etype, "frame": int(f)}
    for k, v in params.items():
        e[k] = tuple(v) if isinstance(v, Vector) else v
    EVENTS.append(e)
    return e


# ------------------------------------------------------------------ scene plumbing

def _col():
    col = bpy.data.collections.get(FX_COLLECTION)
    if col is None:
        col = bpy.data.collections.new(FX_COLLECTION)
        bpy.context.scene.collection.children.link(col)
    return col


def _link(obj):
    _col().objects.link(obj)
    return obj


def visible(obj, f_on, f_off):
    """Visible for frames [f_on, f_off] only (constant keys)."""
    for attr in ("hide_render", "hide_viewport"):
        setattr(obj, attr, True)
        obj.keyframe_insert(attr, frame=0)
        setattr(obj, attr, False)
        obj.keyframe_insert(attr, frame=f_on)
        setattr(obj, attr, True)
        obj.keyframe_insert(attr, frame=f_off + 1)
    _constant(obj)


def _constant(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return
    from .motion import _ensure_action  # noqa: F401  (layered or legacy, same curves)
    from efbpy.animscene import action_curves
    for fc in action_curves(ad.action, idblock):
        if fc.data_path in ("hide_render", "hide_viewport"):
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"


def _set_blend(mat):
    for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(mat, attr, val)
        except (AttributeError, TypeError):
            pass
    for attr in ("use_backface_culling",):
        try:
            setattr(mat, attr, False)
        except AttributeError:
            pass


def emission_mat(name, color, strength=4.0, alpha=1.0):
    """Emission mixed with transparency. Returns (material, emission node, mix node)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    em.inputs["Color"].default_value = tuple(color) + (1.0,)
    em.inputs["Strength"].default_value = strength
    mix.inputs[0].default_value = alpha
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    m.diffuse_color = tuple(color) + (1.0,)
    _set_blend(m)
    return m, em, mix


def flat_mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = tuple(color) + (1.0,)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = tuple(color) + (1.0,)
    return m


def key_value(sock, frames_values, interp="LINEAR"):
    """Key a node socket's default_value at [(frame, value), ...]."""
    for f, v in frames_values:
        sock.default_value = v
        sock.keyframe_insert("default_value", frame=f)


def _mesh_obj(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    if mat is not None:
        me.materials.append(mat)
    return _link(obj)


def _key_scale(obj, frames_scales):
    for f, s in frames_scales:
        obj.scale = (s, s, s) if not isinstance(s, (tuple, list)) else s
        obj.keyframe_insert("scale", frame=f)


def _key_loc(obj, frames_locs):
    for f, p in frames_locs:
        obj.location = p
        obj.keyframe_insert("location", frame=f)


# ------------------------------------------------------------------ screen space

def screen(cam, name, f0, f1, dist=0.12):
    """A full-frame plane glued in front of a shot camera. Returns (obj, emission, mix)."""
    c = cam.obj.data
    h = 2.0 * dist * math.tan(math.atan(18.0 / c.lens)) * 1.2
    w = h * 16.0 / 9.0 * 1.2
    mat, em, mix = emission_mat("MAT-" + name, WHITE, 1.0, 0.0)
    obj = _mesh_obj(name, [(-w, -h, -dist), (w, -h, -dist), (w, h, -dist), (-w, h, -dist)],
                    [(0, 1, 2, 3)], mat)
    obj.parent = cam.obj
    visible(obj, f0, f1)
    return obj, em, mix


def flash(cam, frames, color=WHITE, name=None):
    """Screen flashes: frames = [(frame, alpha)], held per frame (anime impact frames).
    color may be a per-frame list of rgb to strobe white/black."""
    f0 = min(f for f, _ in frames)
    f1 = max(f for f, _ in frames)
    obj, em, mix = screen(cam, name or "FLASH-%s-%d" % (cam.name, f0), f0, f1)
    em.inputs["Strength"].default_value = 1.0
    for i, (f, a) in enumerate(frames):
        col = color[i] if isinstance(color, list) else color
        em.inputs["Color"].default_value = tuple(col) + (1.0,)
        em.inputs["Color"].keyframe_insert("default_value", frame=f)
        mix.inputs[0].default_value = a
        mix.inputs[0].keyframe_insert("default_value", frame=f)
        event("screen_flash", f, color=list(col), alpha=round(a, 3), frames=1)
    _step_node_keys(obj.data.materials[0])
    return obj


def _step_node_keys(mat):
    ad = mat.node_tree.animation_data
    if not ad or not ad.action:
        return
    from efbpy.animscene import action_curves
    for fc in action_curves(ad.action, mat.node_tree):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"


def speedlines(cam, f0, f1, color=(0.92, 0.96, 1.0), radial=False, density=60.0,
               alpha=0.5, depth=7.0, name=None):
    """Anime speed lines: thin streaks of mixed length, redrawn every 2 frames.

    The sheet sits `depth` blocks in front of the camera, i.e. behind the characters,
    the way the reference paints them into the background. radial=True for zooms."""
    obj, em, mix = screen(cam, name or "SPEED-%s-%d" % (cam.name, f0), f0, f1, dist=depth)
    mat = obj.data.materials[0]
    nt = mat.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    flick = nt.nodes.new("ShaderNodeValue")
    for f in range(f0, f1 + 2, 2):
        flick.outputs[0].default_value = (f * 0.731) % 17.0
        flick.outputs[0].keyframe_insert("default_value", frame=f)
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    if radial:
        cx = nt.nodes.new("ShaderNodeMath")
        cx.operation = "SUBTRACT"
        cx.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs["X"], cx.inputs[0])
        cy = nt.nodes.new("ShaderNodeMath")
        cy.operation = "SUBTRACT"
        cy.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs["Y"], cy.inputs[0])
        ang = nt.nodes.new("ShaderNodeMath")
        ang.operation = "ARCTAN2"
        nt.links.new(cy.outputs[0], ang.inputs[0])
        nt.links.new(cx.outputs[0], ang.inputs[1])
        across = nt.nodes.new("ShaderNodeMath")
        across.operation = "MULTIPLY"
        across.inputs[1].default_value = density / 2.0
        nt.links.new(ang.outputs[0], across.inputs[0])
        rl = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(cx.outputs[0], rl.inputs["X"])
        nt.links.new(cy.outputs[0], rl.inputs["Y"])
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(rl.outputs[0], ln.inputs[0])
        along_src = ln.outputs["Value"]
    else:
        across = nt.nodes.new("ShaderNodeMath")
        across.operation = "MULTIPLY"
        across.inputs[1].default_value = density * 2.0
        nt.links.new(sep.outputs["Y"], across.inputs[0])
        along_src = sep.outputs["X"]
    along = nt.nodes.new("ShaderNodeMath")
    along.operation = "MULTIPLY_ADD"
    along.inputs[1].default_value = 3.0
    nt.links.new(along_src, along.inputs[0])
    nt.links.new(flick.outputs[0], along.inputs[2])
    nt.links.new(across.outputs[0], comb.inputs["X"])
    nt.links.new(along.outputs[0], comb.inputs["Y"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "2D"
    noise.inputs["Scale"].default_value = 1.0
    noise.inputs["Detail"].default_value = 0.0
    nt.links.new(comb.outputs[0], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.66
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.74
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    fac = ramp.outputs["Color"]
    if radial:
        clear = nt.nodes.new("ShaderNodeMapRange")
        clear.inputs["From Min"].default_value = 0.12
        clear.inputs["From Max"].default_value = 0.35
        nt.links.new(along_src, clear.inputs["Value"])
        mm = nt.nodes.new("ShaderNodeMath")
        mm.operation = "MULTIPLY"
        nt.links.new(fac, mm.inputs[0])
        nt.links.new(clear.outputs["Result"], mm.inputs[1])
        fac = mm.outputs[0]
    am = nt.nodes.new("ShaderNodeMath")
    am.operation = "MULTIPLY"
    am.inputs[1].default_value = alpha
    nt.links.new(fac, am.inputs[0])
    nt.links.new(am.outputs[0], mix.inputs[0])
    em.inputs["Color"].default_value = tuple(color) + (1.0,)
    em.inputs["Strength"].default_value = 1.2
    _step_node_keys(mat)
    event("speed_lines", f0, frames=f1 - f0 + 1, radial=radial)
    return obj


# ------------------------------------------------------------------ lightning (GN)

_BOLT_GROUP = None


def _bolt_group():
    """Geometry nodes: a jagged tube from Start to End that re-draws every 2 frames."""
    global _BOLT_GROUP
    if _BOLT_GROUP is not None:
        return _BOLT_GROUP
    ng = bpy.data.node_groups.new("ULT-Bolt", "GeometryNodeTree")
    itf = ng.interface
    itf.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    socks = {}
    for name, typ, default in (("Start", "NodeSocketVector", (0, 0, 0)),
                               ("End", "NodeSocketVector", (0, 0, 1)),
                               ("Amplitude", "NodeSocketFloat", 0.3),
                               ("Radius", "NodeSocketFloat", 0.03),
                               ("Seed", "NodeSocketFloat", 0.0),
                               ("Bow", "NodeSocketVector", (0, 0, 0))):
        s = itf.new_socket(name, in_out="INPUT", socket_type=typ)
        s.default_value = default
        socks[name] = s
    N = ng.nodes
    L = ng.links
    gin = N.new("NodeGroupInput")
    gout = N.new("NodeGroupOutput")
    line = N.new("GeometryNodeCurvePrimitiveLine")
    L.new(gin.outputs["Start"], line.inputs["Start"])
    L.new(gin.outputs["End"], line.inputs["End"])
    res = N.new("GeometryNodeResampleCurve")
    res.inputs["Count"].default_value = 28
    L.new(line.outputs[0], res.inputs[0])
    # stepped time: floor(frame / 2)
    st = N.new("GeometryNodeInputSceneTime")
    half = N.new("ShaderNodeMath")
    half.operation = "MULTIPLY"
    half.inputs[1].default_value = 0.5
    L.new(st.outputs["Frame"], half.inputs[0])
    flo = N.new("ShaderNodeMath")
    flo.operation = "FLOOR"
    L.new(half.outputs[0], flo.inputs[0])
    wadd = N.new("ShaderNodeMath")
    wadd.operation = "ADD"
    L.new(flo.outputs[0], wadd.inputs[0])
    L.new(gin.outputs["Seed"], wadd.inputs[1])
    pos = N.new("GeometryNodeInputPosition")
    noise = N.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 2.5
    noise.inputs["Detail"].default_value = 6.0
    L.new(pos.outputs[0], noise.inputs["Vector"])
    L.new(wadd.outputs[0], noise.inputs["W"])
    sub = N.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (0.5, 0.5, 0.5)
    L.new(noise.outputs["Color"], sub.inputs[0])
    # pin both ends: sin(pi * t)
    par = N.new("GeometryNodeSplineParameter")
    pm = N.new("ShaderNodeMath")
    pm.operation = "MULTIPLY"
    pm.inputs[1].default_value = math.pi
    L.new(par.outputs["Factor"], pm.inputs[0])
    sn = N.new("ShaderNodeMath")
    sn.operation = "SINE"
    L.new(pm.outputs[0], sn.inputs[0])
    env = N.new("ShaderNodeMath")
    env.operation = "MULTIPLY"
    L.new(sn.outputs[0], env.inputs[0])
    L.new(gin.outputs["Amplitude"], env.inputs[1])
    sc = N.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    L.new(sub.outputs[0], sc.inputs[0])
    L.new(env.outputs[0], sc.inputs["Scale"])
    bow = N.new("ShaderNodeVectorMath")
    bow.operation = "SCALE"
    L.new(gin.outputs["Bow"], bow.inputs[0])
    L.new(sn.outputs[0], bow.inputs["Scale"])
    tot = N.new("ShaderNodeVectorMath")
    tot.operation = "ADD"
    L.new(sc.outputs[0], tot.inputs[0])
    L.new(bow.outputs[0], tot.inputs[1])
    setp = N.new("GeometryNodeSetPosition")
    L.new(res.outputs[0], setp.inputs["Geometry"])
    L.new(tot.outputs[0], setp.inputs["Offset"])
    circ = N.new("GeometryNodeCurvePrimitiveCircle")
    circ.inputs["Resolution"].default_value = 5
    L.new(gin.outputs["Radius"], circ.inputs["Radius"])
    c2m = N.new("GeometryNodeCurveToMesh")
    L.new(setp.outputs[0], c2m.inputs["Curve"])
    L.new(circ.outputs[0], c2m.inputs["Profile Curve"])
    L.new(c2m.outputs[0], gout.inputs["Geometry"])
    _BOLT_GROUP = ng
    return ng


def _sock_id(ng, name):
    for item in ng.interface.items_tree:
        if getattr(item, "in_out", None) == "INPUT" and item.name == name:
            return item.identifier
    raise KeyError(name)


def bolt(name, start, end, f0, f1, color=CYAN, radius=0.03, amp=0.35, seed=0.0,
         strength=4.0, keys=None, bow=(0, 0, 0)):
    """A flickering lightning arc. keys: [(frame, {"Start":..,"End":..,"Amplitude":..})]
    to animate it; values are keyed on the modifier inputs."""
    me = bpy.data.meshes.new(name)
    obj = _link(bpy.data.objects.new(name, me))
    mat, em, mix = emission_mat("MAT-" + name, color, strength, 1.0)
    me.materials.append(mat)
    mod = obj.modifiers.new("Bolt", "NODES")
    mod.node_group = _material_group(mat)
    ids = {n: _sock_id(mod.node_group, n)
           for n in ("Start", "End", "Amplitude", "Radius", "Seed", "Bow")}
    for k, v in (("Start", start), ("End", end), ("Amplitude", amp), ("Radius", radius),
                 ("Seed", seed), ("Bow", bow)):
        _set_input(mod, ids[k], v)
    for f, vals in (keys or []):
        for k, v in vals.items():
            _set_input(mod, ids[k], v)
            obj.keyframe_insert('modifiers["Bolt"]["%s"]' % ids[k], frame=f)
    visible(obj, f0, f1)
    event("lightning", f0, frames=f1 - f0 + 1, start=list(start), end=list(end),
          color=list(color))
    return obj


def _set_input(mod, ident, value):
    """Write a modifier input in place. Assigning a Python tuple would replace the float
    array Blender made for a vector socket with a double array, which geometry nodes then
    reads as garbage."""
    if isinstance(value, (tuple, list, Vector)):
        mod[ident][:] = [float(v) for v in value]
    else:
        mod[ident] = float(value)


def _material_group(mat):
    """The bolt group with a Set Material on its output, one per material."""
    key = "ULT-Bolt-" + mat.name
    ng = bpy.data.node_groups.get(key)
    if ng is None:
        ng = _bolt_group().copy()
        ng.name = key
        out = next(n for n in ng.nodes if n.bl_idname == "NodeGroupOutput")
        link = next(l for l in ng.links if l.to_node == out)
        src = link.from_socket
        ng.links.remove(link)
        sm = ng.nodes.new("GeometryNodeSetMaterial")
        sm.inputs["Material"].default_value = mat
        ng.links.new(src, sm.inputs["Geometry"])
        ng.links.new(sm.outputs["Geometry"], out.inputs["Geometry"])
    return ng


# ------------------------------------------------------------------ beams, rings

def _cylinder(name, radius, length, verts=12, mat=None, cap=True):
    """Cylinder along +Y from 0 to length."""
    vs, fs = [], []
    for i in range(verts):
        a = 2 * math.pi * i / verts
        vs.append((radius * math.cos(a), 0.0, radius * math.sin(a)))
        vs.append((radius * math.cos(a), length, radius * math.sin(a)))
    for i in range(verts):
        j = (i + 1) % verts
        fs.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    if cap:
        fs.append(tuple(2 * i for i in range(verts))[::-1])
        fs.append(tuple(2 * i + 1 for i in range(verts)))
    return _mesh_obj(name, vs, fs, mat)


def _aim(obj, p0, p1):
    d = Vector(p1) - Vector(p0)
    obj.location = p0
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = d.to_track_quat("Y", "Z")
    return d.length


def beam(name, p0, p1, f0, f_full, f_end, width=0.9, color=CYAN, f_fade=None):
    """Granite Blast: a thick glowing column from p0 to p1. It shoots out between f0 and
    f_full, holds, then thins away until f_end."""
    length = (Vector(p1) - Vector(p0)).length
    core_m, core_e, core_x = emission_mat("MAT-" + name + "-core", BEAM_CORE, 7.0, 1.0)
    glow_m, glow_e, glow_x = emission_mat("MAT-" + name + "-glow", color, 3.5, 0.4)
    core = _cylinder(name + "-core", width * 0.45, 1.0, 14, core_m)
    glow = _cylinder(name + "-glow", width, 1.0, 16, glow_m)
    for o in (core, glow):
        _aim(o, p0, p1)
        o.scale = (0.2, 0.001, 0.2)
        o.keyframe_insert("scale", frame=f0)
        o.scale = (1.0, length, 1.0)
        o.keyframe_insert("scale", frame=f_full)
        o.scale = (1.0, length, 1.0)
        o.keyframe_insert("scale", frame=f_fade or max(f_full, f_end - 6))
        o.scale = (0.05, length, 0.05)
        o.keyframe_insert("scale", frame=f_end)
        visible(o, f0, f_end)
    event("beam", f0, start=list(p0), end=list(p1), width=width, color=list(color),
          grow_frames=f_full - f0, frames=f_end - f0 + 1)
    return core, glow


def ring(name, center, normal, f0, f1, r0=0.3, r1=4.0, thick=0.12, color=CYAN,
         strength=10.0):
    """Expanding shock ring, fading."""
    verts, faces, n = [], [], 48
    for i in range(n):
        a = 2 * math.pi * i / n
        verts.append((math.cos(a) * (1 - thick), math.sin(a) * (1 - thick), 0.0))
        verts.append((math.cos(a), math.sin(a), 0.0))
    for i in range(n):
        j = (i + 1) % n
        faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    mat, em, mix = emission_mat("MAT-" + name, color, strength, 1.0)
    obj = _mesh_obj(name, verts, faces, mat)
    obj.location = center
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector(normal).to_track_quat("Z", "Y")
    _key_scale(obj, [(f0, r0), (f0 + (f1 - f0) * 0.35, r1 * 0.8), (f1, r1)])
    key_value(mix.inputs[0], [(f0, 1.0), (f0 + (f1 - f0) * 0.5, 0.8), (f1, 0.0)])
    visible(obj, f0, f1)
    event("shock_ring", f0, pos=list(center), normal=list(normal), radius=r1,
          frames=f1 - f0 + 1, color=list(color))
    return obj


# ------------------------------------------------------------------ particles

def _blob(name, radius, mat, subdiv=1):
    bm_me = bpy.data.meshes.new(name)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    bm.to_mesh(bm_me)
    bm.free()
    obj = bpy.data.objects.new(name, bm_me)
    bm_me.materials.append(mat)
    return _link(obj)


def _box(name, size, mat):
    s = size / 2
    vs = [(-s, -s, -s), (s, -s, -s), (s, s, -s), (-s, s, -s), (-s, -s, s), (s, -s, s), (s, s, s), (-s, s, s)]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return _mesh_obj(name, vs, fs, mat)


def dust(name, center, f0, count=14, spread=2.5, size=1.2, direction=(0, 0, 1),
         life=40, color=DUST, seed=1):
    """A billowing cloud: puffs pushed out along `direction`, swelling and settling."""
    rnd = random.Random(seed)
    mat = flat_mat("MAT-" + name, color, 1.0)
    d = Vector(direction).normalized() if Vector(direction).length > 0 else Vector((0, 0, 1))
    objs = []
    for i in range(count):
        o = _blob("%s-%02d" % (name, i), 0.5, mat, 1)
        v = (d * rnd.uniform(0.4, 1.0) + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1),
                                                   rnd.uniform(-0.3, 1)))).normalized()
        dist = spread * rnd.uniform(0.5, 1.0)
        s0, s1 = size * rnd.uniform(0.2, 0.4), size * rnd.uniform(0.8, 1.5)
        c = Vector(center)
        a = f0 + rnd.randint(0, 3)
        _key_loc(o, [(a, c), (a + 8, c + v * dist * 0.7), (a + life, c + v * dist + Vector((0, 0, 0.6)))])
        _key_scale(o, [(a, s0), (a + 8, s1 * 0.8), (a + life * 0.8, s1), (a + life, 0.01)])
        o.rotation_euler = (rnd.random() * 3, rnd.random() * 3, rnd.random() * 3)
        visible(o, a, a + life)
        objs.append(o)
    event("particles", f0, kind="dust", pos=list(center), count=count, spread=spread,
          direction=list(d), frames=life)
    return objs


def debris(name, center, f0, count=16, speed=0.35, direction=(0, 0, 1), cone=0.8,
           size=0.25, life=40, color=DEBRIS, seed=2, gravity=0.012):
    """Chunks thrown along `direction` (blocks/frame), falling under gravity."""
    rnd = random.Random(seed)
    mat = flat_mat("MAT-" + name, color, 1.0)
    d = Vector(direction).normalized()
    objs = []
    for i in range(count):
        o = _box("%s-%02d" % (name, i), size * rnd.uniform(0.4, 1.2), mat)
        v = (d + Vector((rnd.uniform(-cone, cone), rnd.uniform(-cone, cone),
                         rnd.uniform(-cone, cone)))).normalized() * speed * rnd.uniform(0.5, 1.3)
        c = Vector(center)
        keys = []
        for t in range(0, life + 1, 3):
            keys.append((f0 + t, c + v * t - Vector((0, 0, gravity * t * t))))
        _key_loc(o, keys)
        spin = Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4)))
        o.rotation_euler = (0, 0, 0)
        o.keyframe_insert("rotation_euler", frame=f0)
        o.rotation_euler = tuple(spin * life)
        o.keyframe_insert("rotation_euler", frame=f0 + life)
        visible(o, f0, f0 + life)
        objs.append(o)
    event("particles", f0, kind="debris", pos=list(center), count=count, speed=speed,
          direction=list(d), frames=life)
    return objs


def blood(name, origin_fn, f0, count=8, direction=(0, 0, 1), speed=0.12, life=16, seed=3):
    """Droplets flung off a moving point (origin_fn(f) -> Vector)."""
    rnd = random.Random(seed)
    mat = flat_mat("MAT-" + name, BLOOD, 0.4)
    d = Vector(direction).normalized()
    for i in range(count):
        o = _blob("%s-%02d" % (name, i), 0.022, mat, 1)
        a = f0 + rnd.randint(0, 4)
        v = (d + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(-0.3, 0.5)))).normalized()
        sp = speed * rnd.uniform(0.6, 1.4)
        keys = []
        for t in range(0, life + 1, 2):
            keys.append((a + t, origin_fn(a) + v * sp * t - Vector((0, 0, 0.004 * t * t))))
        _key_loc(o, keys)
        s = rnd.uniform(0.6, 1.6)
        _key_scale(o, [(a, (s, s * 2.5, s)), (a + life, (s * 0.5, s, s * 0.5))])
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = v.to_track_quat("Y", "Z")
        visible(o, a, a + life)
    event("particles", f0, kind="blood", pos=list(origin_fn(f0)), count=count,
          direction=list(d), frames=life)


def cracks(name, origin, right, up, f0, f1, width=12.0, height=16.0, seed=4, color=(0.1, 0.12, 0.16)):
    """Glass cracks spreading down a facade from `origin` (top middle). right/up span the
    wall plane; cracks appear progressively between f0 and f1."""
    rnd = random.Random(seed)
    mat = flat_mat("MAT-" + name, color, 0.3)
    right, up = Vector(right).normalized(), Vector(up).normalized()
    normal = right.cross(up)
    o = Vector(origin) + normal * 0.03
    made = []
    n = 26
    for i in range(n):
        t = i / (n - 1)
        # crack centres walk downward over time
        cy = -t * height
        cx = rnd.uniform(-width / 2, width / 2) * (0.4 + 0.6 * t)
        c = o + right * cx + up * cy
        verts, faces = [], []
        for arm in range(rnd.randint(4, 7)):
            ang = rnd.uniform(0, 2 * math.pi)
            p = Vector(c)
            seg_dir = right * math.cos(ang) + up * math.sin(ang)
            for s in range(rnd.randint(2, 4)):
                step = seg_dir * rnd.uniform(0.3, 0.9)
                q = p + step
                w = normal.cross(step).normalized() * 0.03
                base = len(verts)
                verts += [p - w, p + w, q + w, q - w]
                faces.append((base, base + 1, base + 2, base + 3))
                p = q
                ang += rnd.uniform(-0.6, 0.6)
                seg_dir = right * math.cos(ang) + up * math.sin(ang)
        ob = _mesh_obj("%s-%02d" % (name, i), verts, faces, mat)
        fa = int(f0 + t * (f1 - f0))
        visible(ob, fa, f1 + 400)
        made.append(ob)
    event("glass_cracks", f0, pos=list(origin), frames=f1 - f0 + 1)
    return made


def impact(f, pos, strength=1.0, cam=None, flash_color=WHITE, ring_normal=None,
           name=None, hitstop=0):
    """Bundle for one blow landing: event, camera shake, optional flash and ring."""
    name = name or "HIT-%d" % f
    event("impact", f, pos=list(pos), strength=strength, hitstop_frames=hitstop)
    if cam is not None:
        cam.shake(f, f + int(6 + 10 * strength), amp=0.6 + 1.6 * strength, hz=11.0,
                  pos=0.02 * strength)
        event("camera_shake", f, strength=strength, frames=int(6 + 10 * strength))
    if ring_normal is not None:
        ring(name + "-ring", pos, ring_normal, f, f + 10, r0=0.2, r1=1.2 + strength,
             color=(1, 1, 1), strength=6.0)


def burst(name, pos, f0, f1, radius=1.0, color=WHITE, strength=6.0):
    """A glowing ball that blooms out of an impact point and fades."""
    mat, em, mix = emission_mat("MAT-" + name, color, strength, 1.0)
    o = _blob(name, 1.0, mat, 2)
    o.location = pos
    mid = f0 + max(1, (f1 - f0) // 3)
    _key_scale(o, [(f0, radius * 0.15), (mid, radius), (f1, radius * 1.2)])
    key_value(mix.inputs[0], [(f0, 1.0), (mid, 0.9), (f1, 0.0)])
    visible(o, f0, f1)
    event("burst", f0, pos=list(pos), radius=radius, color=list(color), frames=f1 - f0 + 1)
    return o
