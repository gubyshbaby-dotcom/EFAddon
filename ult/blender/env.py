"""The domain as Blender meshes, and the dusk world and sun that light it.

    from ult import domain
    from ult.blender import env
    env.build_environment(domain.build_grid())

Meshing: one quad per visible block side, each with its own four vertices, filled from
numpy through foreach_set (a full build is a few hundred thousand quads in seconds). A
side is visible when the cell next to it lets light through: air, the invisible light
block, or a see-through block (palette kind "glass"); the side between two see-through
blocks is never built. Light blocks are never meshed. Blocks in SHAPES are built lower
than a full block (rails lie flat).

Objects: one per zone of ult.domain.zone_map, named <collection>_<zone>: _shell (the sky,
inward sides only), _ground, _city (the background ring, trees, street furniture),
_tunnel, and one per named building (_turf, _pink, _glass, _atrium, _orange, _slope,
_dome, _parking). The shell object casts no shadow, so the sun reaches inside.

Materials: one per palette entry, "blk.<key>": the display colour, slightly rough, with a
faint per-block tint (face attribute "blk") and darkened block edges (from the UVs) so
large surfaces still read as blocks. See-through blocks are alpha-blended, lamps emit.
The shell uses "Domain_sky" instead: an emissive gradient over world Z, from pink
lavender at the horizon to deep blue-violet at the zenith.

Lighting: a low warm sun from the west and a blue world colour as ambient. It renders in
EEVEE (BLENDER_EEVEE in 5.0, BLENDER_EEVEE_NEXT in 4.2-4.4; see set_engine), Cycles,
where the emissive shell is the sky light, and Workbench (flat material colours).
"""

from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Vector

from ult import domain

# Corners of each block side on the unit cube, counter-clockwise seen from outside, in
# the order +X, -X, +Y, -Y, +Z, -Z.
_SIDES = np.array([
    [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],
    [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
    [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
    [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
    [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)],
], dtype=np.float32)
_NORMALS = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)])
_UV = np.array([(0, 0), (1, 0), (1, 1), (0, 1)], dtype=np.float32)

SHAPES = {"minecraft:rail": 1 / 16}          # block height of non-full blocks
LAMPS = {"minecraft:sea_lantern": 6.0, "minecraft:glowstone": 6.0,
         "minecraft:shroomlight": 5.0}       # emission strength
LAMP_WATTS = 120.0                           # point light put next to each lamp block
GLASS_ALPHA = {"minecraft:glass": 0.3, "minecraft:iron_bars": 0.55,
               "minecraft:gray_stained_glass": 0.8, "minecraft:black_stained_glass": 0.85}

# Sky gradient: (height fraction from the horizon z = -26 to the zenith z = 72, sRGB)
SKY_Z = (-26.0, 72.0)
SKY_STOPS = [
    (0.00, (0.96, 0.78, 0.86)),   # pink haze at the horizon
    (0.12, (0.78, 0.70, 0.96)),   # lavender
    (0.32, (0.46, 0.52, 0.98)),   # periwinkle
    (0.58, (0.24, 0.30, 0.90)),   # saturated blue
    (1.00, (0.12, 0.09, 0.42)),   # deep blue-violet
]
SKY_STRENGTH = 1.0
WORLD_COLOR = (0.36, 0.42, 0.78)   # sRGB, the blue ambient
WORLD_STRENGTH = 0.9
SUN_DIR = (0.93, 0.22, -0.30)      # direction the light travels: from low in the west
SUN_COLOR = (1.0, 0.66, 0.42)
SUN_STRENGTH = 3.2


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ------------------------------------------------------------------------ faces


class Faces:
    """Visible block sides: cell (n, 3) world ints, side (n,) index into _SIDES,
    block (n,) palette id, zone (n,) zone index."""

    def __init__(self, cell, side, block, zone):
        self.cell, self.side, self.block, self.zone = cell, side, block, zone

    def __len__(self):
        return len(self.side)

    def select(self, mask):
        return Faces(self.cell[mask], self.side[mask], self.block[mask], self.zone[mask])


def visible_faces(grid, zmap=None) -> Faces:
    a = grid.a
    kinds = np.array([grid.pal.kind(i) for i in range(len(grid.pal.entries))])
    meshed = np.isin(kinds, ("solid", "glass"))
    opaque = kinds == "solid"
    clear = kinds == "glass"
    p = np.pad(a, 1)                      # air all round
    opaque_p, clear_p = opaque[p], clear[p]
    meshed_a, clear_a = meshed[a], clear[a]
    inner = slice(1, -1)
    cells, sides = [], []
    for s, n in enumerate(_NORMALS):
        nb = tuple(slice(1 + int(d), p.shape[i] - 1 + int(d)) if d else inner
                   for i, d in enumerate(n))
        vis = meshed_a & ~opaque_p[nb] & ~(clear_a & clear_p[nb])
        idx = np.argwhere(vis)
        cells.append(idx)
        sides.append(np.full(len(idx), s, dtype=np.int8))
    idx = np.concatenate(cells)
    block = a[idx[:, 0], idx[:, 1], idx[:, 2]]
    zone = (zmap[idx[:, 0], idx[:, 1], idx[:, 2]] if zmap is not None
            else np.zeros(len(idx), dtype=np.uint8))
    return Faces(idx + grid.lo, np.concatenate(sides), block, zone)


def _cell_noise(cell):
    x, y, z = (cell[:, i].astype(np.int64) for i in range(3))
    h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return (((h >> 8) & 0x3FF) / 1023.0).astype(np.float32)


def faces_mesh(name, faces: Faces, pal, slot_of):
    """A mesh of the faces; slot_of maps palette ids to material indices (array)."""
    n = len(faces)
    co = faces.cell[:, None, :].astype(np.float32) + _SIDES[faces.side]
    for i, (mc, _, _, _) in enumerate(pal.entries):
        h = SHAPES.get(mc)
        if h is not None:
            m = faces.block == i
            co[m, :, 2] = faces.cell[m, None, 2] + _SIDES[faces.side[m], :, 2] * h
    me = bpy.data.meshes.new(name)
    me.vertices.add(4 * n)
    me.vertices.foreach_set("co", co.ravel())
    me.loops.add(4 * n)
    me.loops.foreach_set("vertex_index", np.arange(4 * n, dtype=np.int32))
    me.polygons.add(n)
    me.polygons.foreach_set("loop_start", np.arange(0, 4 * n, 4, dtype=np.int32))
    if not bpy.types.MeshPolygon.bl_rna.properties["loop_total"].is_readonly:    # < 4.0
        me.polygons.foreach_set("loop_total", np.full(n, 4, dtype=np.int32))
    me.polygons.foreach_set("material_index", slot_of[faces.block].astype(np.int32))
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", np.tile(_UV, (n, 1)).ravel())
    blk = me.attributes.new("blk", "FLOAT", "FACE")
    blk.data.foreach_set("value", _cell_noise(faces.cell))
    me.update(calc_edges=True)
    return me


def _radial_normals(me):
    """Smooth normals pointing at the origin: the stepped shell shades like a sphere in
    Workbench (the emissive sky material ignores normals anyway)."""
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    normals = -co / np.linalg.norm(co, axis=1, keepdims=True)
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    me.normals_split_custom_set_from_vertices(normals)


# ------------------------------------------------------------------------ materials


def _node_tree(idblock):
    if idblock.node_tree is None:        # before 5.0 a new material/world has no tree
        idblock.use_nodes = True
    nt = idblock.node_tree
    nt.nodes.clear()
    return nt


def block_material(key, entry):
    """The material of one palette entry (reused if it already exists)."""
    mc, _, rgb, kind = entry
    name = f"blk.{key}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    col = srgb_to_linear(np.array(rgb) / 255.0)
    see_through = kind == "glass" and mc not in SHAPES
    alpha = 1.0
    if see_through:
        alpha = GLASS_ALPHA.get(mc, 0.5)
        if "iron_bars" in mc:
            col = col * 0.45
    nt = _node_tree(mat)
    nodes, links = nt.nodes, nt.links
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.08 if see_through else 0.85
    bsdf.inputs["Alpha"].default_value = alpha

    # faint per-block tint times darkened edges, scaling the flat colour
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "blk"
    tint = nodes.new("ShaderNodeMapRange")
    tint.inputs["To Min"].default_value = 0.9
    tint.inputs["To Max"].default_value = 1.06
    links.new(attr.outputs["Fac"], tint.inputs["Value"])
    uvmap = nodes.new("ShaderNodeUVMap")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uvmap.outputs["UV"], sep.inputs[0])
    edge = None
    for axis in ("X", "Y"):
        inv = nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        links.new(sep.outputs[axis], inv.inputs[1])
        m = nodes.new("ShaderNodeMath")
        m.operation = "MINIMUM"
        links.new(sep.outputs[axis], m.inputs[0])
        links.new(inv.outputs[0], m.inputs[1])
        if edge is not None:
            both = nodes.new("ShaderNodeMath")
            both.operation = "MINIMUM"
            links.new(edge.outputs[0], both.inputs[0])
            links.new(m.outputs[0], both.inputs[1])
            m = both
        edge = m
    edge_fac = nodes.new("ShaderNodeMapRange")
    edge_fac.inputs["From Max"].default_value = 0.07
    edge_fac.inputs["To Min"].default_value = 0.72 if not see_through else 1.0
    links.new(edge.outputs[0], edge_fac.inputs["Value"])
    fac = nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    links.new(tint.outputs[0], fac.inputs[0])
    links.new(edge_fac.outputs[0], fac.inputs[1])
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs[0].default_value = [float(v) for v in col]
    links.new(fac.outputs[0], scale.inputs["Scale"])
    links.new(scale.outputs[0], bsdf.inputs["Base Color"])

    if mc in LAMPS:
        bsdf.inputs["Emission Color"].default_value = (*[float(v) for v in col], 1.0)
        bsdf.inputs["Emission Strength"].default_value = LAMPS[mc]
    if see_through:
        _transparent(mat)
    mat.diffuse_color = (*[float(v) for v in col], alpha)     # Workbench
    mat.roughness = 0.85
    return mat


def _transparent(mat):
    if hasattr(mat, "surface_render_method"):                 # EEVEE Next, 4.2+
        mat.surface_render_method = "DITHERED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "HASHED"
    if hasattr(mat, "use_transparent_shadow"):
        mat.use_transparent_shadow = True


def sky_material(name="Domain_sky"):
    """Emissive vertical gradient over world Z (SKY_STOPS)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = _node_tree(mat)
    nodes, links = nt.nodes, nt.links
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = SKY_STRENGTH
    links.new(emit.outputs[0], out.inputs["Surface"])
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs[0])
    rng = nodes.new("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value, rng.inputs["From Max"].default_value = SKY_Z
    links.new(sep.outputs["Z"], rng.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    els = ramp.color_ramp.elements
    while len(els) < len(SKY_STOPS):
        els.new(0.5)
    for el, (pos, rgb) in zip(els, SKY_STOPS):
        el.position = pos
        el.color = (*[float(v) for v in srgb_to_linear(rgb)], 1.0)
    links.new(rng.outputs[0], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    mid = srgb_to_linear(SKY_STOPS[2][1])
    mat.diffuse_color = (*[float(v) for v in mid], 1.0)       # Workbench
    return mat


# ------------------------------------------------------------------------ scene


def build_environment(grid, collection_name="Domain", zones=None, look=True, lamps=True):
    """Mesh `grid` into collection `collection_name` and light it for dusk.

    zones: (names, uint8 array like grid.a) as from ult.domain.zone_map (the default).
    Rebuilding into an existing collection replaces its objects. look=False leaves the
    scene's world, colour management and engine settings alone; lamps=False skips the
    point lights next to lamp blocks (the subway's ceiling lamps).
    """
    scene = bpy.context.scene
    coll = bpy.data.collections.get(collection_name)
    if coll is None:
        coll = bpy.data.collections.new(collection_name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)

    names, zmap = zones if zones is not None else domain.zone_map(grid)
    faces = visible_faces(grid, zmap)
    pal = grid.pal
    sky = sky_material(f"{collection_name}_sky")

    for zi, zname in enumerate(names):
        sel = faces.select(faces.zone == zi)
        if zname == "shell":
            # only the sides that face into the sphere
            inside = sel.cell + 0.5 + _NORMALS[sel.side]
            sel = sel.select(np.linalg.norm(inside, axis=1) < domain.R_IN)
        if not len(sel):
            continue
        name = f"{collection_name}_{zname}"
        if zname == "shell":
            slot_of = np.zeros(len(pal.entries), dtype=np.int32)
            mats = [sky]
        else:
            used = np.unique(sel.block)
            slot_of = np.zeros(len(pal.entries), dtype=np.int32)
            slot_of[used] = np.arange(len(used))
            mats = [block_material(pal.names[i], pal.entries[i]) for i in used]
        me = faces_mesh(name, sel, pal, slot_of)
        for m in mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        obj["domain_zone"] = zname
        coll.objects.link(obj)
        if zname == "shell":
            obj.visible_shadow = False
            _radial_normals(me)

    add_sun(coll, f"{collection_name}_sun")
    if lamps:
        add_lamp_lights(grid, coll, f"{collection_name}_lamp")
    if look:
        setup_world(scene)
        setup_look(scene)
    return coll


def add_sun(coll, name="Domain_sun"):
    light = bpy.data.lights.new(name, "SUN")
    light.energy = SUN_STRENGTH
    light.color = SUN_COLOR
    light.angle = math.radians(1.5)
    if hasattr(light, "shadow_maximum_resolution"):
        light.shadow_maximum_resolution = 0.02       # blocks are a metre: no need for mm
    obj = bpy.data.objects.new(name, light)
    obj.rotation_euler = Vector(SUN_DIR).normalized().to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(obj)
    return obj


def add_lamp_lights(grid, coll, name="Domain_lamp"):
    """A shadowless point light in the air cell below (or beside) every LAMPS block, so
    EEVEE shows the pools of light the emissive blocks alone would not cast."""
    lamp_ids = [i for i, e in enumerate(grid.pal.entries) if e[0] in LAMPS]
    if not lamp_ids:
        return []
    light = bpy.data.lights.get(name) or bpy.data.lights.new(name, "POINT")
    light.energy = LAMP_WATTS
    light.color = (0.9, 0.95, 1.0)
    light.shadow_soft_size = 0.4
    light.use_shadow = False
    air = np.array([e[3] in ("air", "light") for e in grid.pal.entries])
    objs = []
    for i, j, k in np.argwhere(np.isin(grid.a, lamp_ids)):
        for d in ((0, 0, -1), (0, 0, 1), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)):
            p = np.array((i, j, k)) + d
            if np.all(p >= 0) and np.all(p < grid.a.shape) and air[grid.a[tuple(p)]]:
                obj = bpy.data.objects.new(name, light)
                obj.location = [float(v) for v in grid.lo + (i, j, k) + 0.5 + 0.7 * np.array(d)]
                coll.objects.link(obj)
                objs.append(obj)
                break
    return objs


def setup_world(scene, name="Domain_dusk"):
    world = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    nt = _node_tree(world)
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg.inputs["Color"].default_value = (*[float(v) for v in srgb_to_linear(WORLD_COLOR)], 1.0)
    bg.inputs["Strength"].default_value = WORLD_STRENGTH
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    world.color = [float(v) for v in srgb_to_linear(WORLD_COLOR)]    # Workbench
    scene.world = world
    return world


def setup_look(scene, raytrace=False):
    """Colour management and per-engine settings for the flat, saturated anime look.

    raytrace=True turns on EEVEE's screen-space ray tracing: interiors (the office, the
    tunnel) then darken properly instead of taking the full world ambient, at the cost
    of noise and render time.
    """
    vs = scene.view_settings
    try:
        vs.view_transform = "Standard"
        vs.look = "None"
    except TypeError:
        pass
    ee = scene.eevee
    for attr, value in (("taa_render_samples", 32), ("use_shadows", True),
                        ("use_gtao", True), ("shadow_ray_count", 1),
                        ("shadow_step_count", 4)):
        if hasattr(ee, attr):
            setattr(ee, attr, value)
    if hasattr(ee, "use_raytracing"):
        ee.use_raytracing = raytrace
        if raytrace:
            ee.ray_tracing_method = "SCREEN"
            ee.use_fast_gi = True
            ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    if hasattr(scene, "cycles"):
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_shadows = True
    shading.shadow_intensity = 0.55
    shading.show_cavity = True
    shading.cavity_type = "WORLD"
    scene.display.light_direction = [-float(v) for v in Vector(SUN_DIR).normalized()]


def set_engine(scene, engine):
    """engine: "EEVEE", "CYCLES" or "WORKBENCH"; picks the right EEVEE id per version."""
    ids = {"EEVEE": ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"),
           "CYCLES": ("CYCLES",), "WORKBENCH": ("BLENDER_WORKBENCH",)}[engine.upper()]
    for ident in ids:
        try:
            scene.render.engine = ident
            return ident
        except TypeError:
            continue
    raise RuntimeError(f"no render engine for {engine}")
