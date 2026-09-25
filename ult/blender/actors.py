"""The characters: one addon-generated biped rig per role, with the addon's own bundled
body and default skins (Steve / Alex) - exactly what Generate Epic Fight Rig makes.

The rig object is the entity. Its object transform is the entity's path through the
domain (yaw only, as Minecraft entities turn); everything below it is the Epic Fight
animation the exporter writes.
"""

from __future__ import annotations

import bpy

from . import addon
from .motion import Actor

# role -> (addon build variant, display name)
CAST = {
    "yuta": ("biped", "Yuta"),            # the caster: Steve proportions
    "ishigori": ("biped_slim_arm", "Ishigori"),
}


def _collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def spawn(role):
    """Build the rig + bodies for a role and return an Actor wrapping it."""
    addon.ensure()
    from efb import assets
    from efbpy.ops import build_default_rig

    variant, label = CAST[role]
    ctx = bpy.context
    before = set(bpy.data.objects)
    arm = assets.armature(variant)
    mesh = assets.body_mesh(variant)
    rig, _ = build_default_rig(ctx, arm, mesh, variant, assets.skin_path(variant))
    made = [o for o in bpy.data.objects if o not in before]
    rig.name = label
    rig.data.name = label
    col = _collection("Actors")
    for o in made:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
        if o is not rig and o.type == "MESH" and o.parent is rig:
            o.name = label + ("-body.smooth" if o.name.endswith(".smooth") else "-body")
    # widget meshes are shared helpers; keep them out of renders
    for o in bpy.data.objects:
        if o.name.startswith("WGT-"):
            o.hide_render = True
            o.hide_viewport = True
    for o in made:
        if o.name.endswith(".smooth"):
            o.hide_render = True
            o.hide_viewport = True
    rig.show_in_front = False
    rig["ult_role"] = role
    return Actor(role, rig)
