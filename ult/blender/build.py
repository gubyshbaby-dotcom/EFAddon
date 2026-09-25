"""Build the whole scene from nothing: domain, cast, choreography, cameras, effects.

    python3 scripts/build.py                 (headless, bpy module)
    blender --background --python scripts/build.py
    or, inside Blender with the addon enabled: run scripts/build.py from the Text editor

Every run starts from an empty file, so the .blend is a pure function of this code.
"""

from __future__ import annotations

import os

import bpy

from ult import FPS, paths

from . import actors, addon, camera, fx

SLICE = (0, 489)          # frames staged so far (acts 1-2)


def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon.ensure()
    camera.CAMERAS.clear()
    fx.EVENTS.clear()
    import ult.blender.fx as _fx
    _fx._BOLT_GROUP = None


def _scene(frame_end):
    sc = bpy.context.scene
    sc.name = "ULT-Sendai"
    sc.render.fps = FPS
    sc.render.fps_base = 1.0
    sc.frame_start = 0
    sc.frame_end = frame_end
    sc.frame_current = 0
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.view_settings.view_transform = "Standard"
    return sc


def _look(sc):
    """Bloom on anything emissive, via the compositor (5.0 node-group API or the older
    scene.node_tree one)."""
    try:
        if hasattr(sc, "compositing_node_group"):
            tree = bpy.data.node_groups.new("ULT-Compositing", "CompositorNodeTree")
            sc.compositing_node_group = tree
            rl = tree.nodes.new("CompositorNodeRLayers")
            gl = tree.nodes.new("CompositorNodeGlare")
            out = tree.nodes.new("NodeGroupOutput")
            tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        else:
            sc.use_nodes = True
            tree = sc.node_tree
            for n in list(tree.nodes):
                tree.nodes.remove(n)
            rl = tree.nodes.new("CompositorNodeRLayers")
            gl = tree.nodes.new("CompositorNodeGlare")
            out = tree.nodes.new("CompositorNodeComposite")
        for attr, val in (("glare_type", "BLOOM"), ("quality", "MEDIUM")):
            try:
                setattr(gl, attr, val)
            except (TypeError, AttributeError):
                pass
        for name, val in (("Threshold", 1.4), ("Strength", 0.7), ("Size", 0.55)):
            if name in gl.inputs:
                gl.inputs[name].default_value = val
        for attr, val in (("threshold", 1.0), ("size", 7), ("mix", 0.0)):
            if hasattr(gl, attr):
                try:
                    setattr(gl, attr, val)
                except TypeError:
                    pass
        tree.links.new(rl.outputs["Image"], gl.inputs["Image"])
        tree.links.new(gl.outputs["Image"], out.inputs[0])
    except Exception as exc:  # the look is optional; never fail a build on it
        print("compositor glow skipped:", exc)


def _placeholder_env():
    """Used only when ult.domain / ult.blender.env are not available yet."""
    mat = fx.flat_mat("MAT-turf", (0.12, 0.45, 0.16))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -12.5))
    o = bpy.context.object
    o.scale = (22, 26, 25)
    o.data.materials.append(mat)
    o.name = "Placeholder-roof"
    red = fx.flat_mat("MAT-red", (0.55, 0.1, 0.1))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-3, 10, 2))
    s = bpy.context.object
    s.scale = (15, 5, 4)
    s.data.materials.append(red)
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.22, 0.3, 0.75, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    bpy.context.scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.86, 0.72)
    sun.rotation_euler = (0.9, 0.2, -1.2)
    bpy.context.scene.collection.objects.link(sun)


def _environment():
    try:
        from ult import domain
        from . import env
    except ImportError:
        _placeholder_env()
        return None
    grid = domain.build_grid()
    return env.build_environment(grid)


def _reference(sc):
    """The reference clip as each camera's background (off by default) and its audio on
    the sequencer, so the cut can be checked against it in the viewport."""
    if not os.path.exists(paths.REF_VIDEO):
        return
    try:
        clip = bpy.data.movieclips.load(paths.REF_VIDEO)
        clip.frame_start = 0
    except RuntimeError:
        clip = None
    for c in camera.CAMERAS:
        d = c.obj.data
        d.show_background_images = False
        if clip is not None:
            bg = d.background_images.new()
            bg.source = "MOVIE_CLIP"
            bg.clip = clip
            bg.alpha = 0.5
            bg.display_depth = "FRONT"
    try:
        if not sc.sequence_editor:
            sc.sequence_editor_create()
        seqs = getattr(sc.sequence_editor, "strips", None) or sc.sequence_editor.sequences
        seqs.new_sound("ref-audio", paths.REF_VIDEO, 3, 0)
    except (RuntimeError, AttributeError, TypeError):
        pass


def build(save=True, frame_end=SLICE[1], with_env=True):
    _reset()
    sc = _scene(frame_end)
    _look(sc)
    if with_env:
        _environment()
    else:
        _placeholder_env()
    cast = {role: actors.spawn(role) for role in actors.CAST}
    from . import choreo
    for act in choreo.acts():
        act.stage(cast)
    cuts = sorted({c.f0 for c in camera.CAMERAS})
    for a in cast.values():
        from .motion import bake
        bake(a, SLICE[0], frame_end, cuts=cuts)
    camera.bake_all(sc)
    from .export import store_events
    store_events(fx.EVENTS)
    _reference(sc)
    sc.frame_set(0)
    if save:
        os.makedirs(paths.OUT, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=paths.BLEND, compress=True)
    return cast
