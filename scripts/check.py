"""Sanity gates. Run after a build and export:

    python3 scripts/check.py

1. rigkit's predicted hand/foot/elbow/knee positions match what Blender evaluates on the
   addon's rig, over every 7th frame of the staged range (so an IK aim really lands).
2. out/anim_rootmotion/<role>.json, imported back with the addon onto a fresh rig parked
   at the caster's frame-0 transform, reproduces the scene's joint positions.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from ult import paths  # noqa: E402

TOL = 0.01    # blocks; the shake jitter is the largest reduction error

bpy.ops.wm.open_mainfile(filepath=paths.BLEND)
from ult.blender import actors, addon, build  # noqa: E402
addon.ensure()
sc = bpy.context.scene
f0, f1 = build.SLICE
frames = list(range(f0, f1 + 1, 7))
rigs = {o["ult_role"]: o for o in sc.objects if o.get("ult_role")}

# gate 1 needs the choreography's actors, so rebuild them in memory (no save)
cast = build.build(save=False, with_env=False)
sc = bpy.context.scene
worst1 = 0.0
pairs = {"hand_R": ("Tool_R", "head"), "hand_L": ("Tool_L", "head"),
         "foot_R": ("Leg_R", "tail"), "foot_L": ("Leg_L", "tail"),
         "elbow_R": ("Hand_R", "head"), "knee_L": ("Leg_L", "head")}
for role, actor in cast.items():
    rig = actor.rig
    for f in frames:
        sc.frame_set(f)
        lm = actor.landmarks(f)
        for key, (bone, end) in pairs.items():
            real = rig.matrix_world @ getattr(rig.pose.bones[bone], end)
            worst1 = max(worst1, (lm[key] - real).length)
print("gate 1: solver vs Blender, worst %.5f blocks" % worst1)

src = {}
for role, actor in cast.items():
    for f in frames:
        sc.frame_set(f)
        o = actor.rig
        src[(role, f)] = {j: (o.matrix_world @ o.pose.bones[j].head).copy()
                          for j in ("Head", "Tool_R", "Tool_L", "Leg_L", "Root")}
sc.frame_set(f0)
origin = cast["yuta"].rig.matrix_world.copy()

from efb import assets  # noqa: E402
from efb.animjson import loads  # noqa: E402
from efb.rig import Rig  # noqa: E402
from efbpy.animimport import import_document  # noqa: E402
from efbpy.ops import build_default_rig  # noqa: E402

worst2 = 0.0
for role in cast:
    variant = actors.CAST[role][0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon.ensure()
    arm = assets.armature(variant)
    rig, _ = build_default_rig(bpy.context, arm, None, variant, None)
    rig.matrix_world = origin
    with open(paths.out("anim_rootmotion", role + ".json"), "rb") as fh:
        doc = loads(fh.read())
    import_document(rig, Rig(arm, coord=False), doc, fps=30, name="check", source="check",
                    bake_ik=False)
    sc = bpy.context.scene
    for f in frames:
        sc.frame_set(f)
        for j, p in src[(role, f)].items():
            worst2 = max(worst2, (p - rig.matrix_world @ rig.pose.bones[j].head).length)
print("gate 2: exported clip round trip, worst %.5f blocks" % worst2)
ok = worst1 < TOL and worst2 < TOL
print("OK" if ok else "FAILED")
sys.exit(0 if ok else 1)
