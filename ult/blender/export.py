"""Everything the game needs, written with the addon's own exporters.

    out/anim/<role>.json            Epic Fight animation, body only (the entity moves
                                    along out/paths/<role>.json)
    out/anim_rootmotion/<role>.json same clip with the entity path folded into the root,
                                    for playing on an entity parked at the caster's feet
    out/paths/<role>.json           entity path: time, x/y/z (VIX rig frame), yaw
    out/vix/<shot>.json + out/vix/<shot>/<camera>.json   VIX shot manifest and cameras
    out/events/<shot>.json          flashes, shakes, hit-stops, particles, beams, bolts

Every position is in the VIX rig frame the camera export uses: x forward, y up, z right
of the caster at frame 0, in blocks, time in seconds.
"""

from __future__ import annotations

import json
import math
import os

import bpy
from mathutils import Matrix, Vector

from ult import FPS, paths

from . import addon

EVENTS_TEXT = "ULT-events.json"
ORIGIN = "Yuta"
SHOT_NAME = "ult_sendai"


def store_events(events):
    txt = bpy.data.texts.get(EVENTS_TEXT) or bpy.data.texts.new(EVENTS_TEXT)
    txt.clear()
    txt.write(json.dumps(events))


def _rig_frame(scene, f0):
    from efb.vixexport import RigFrame
    from efbpy.animscene import from_matrix
    scene.frame_set(f0)
    o = bpy.data.objects[ORIGIN]
    world = o.matrix_world.copy()
    return RigFrame.from_matrix(from_matrix(world)), world


def _to_rig(rig, origin_world, p):
    return [round(v, 4) for v in rig.pos(tuple(p), tuple(origin_world.translation))]


def export_events(scene, f0, f1, name=SHOT_NAME):
    txt = bpy.data.texts.get(EVENTS_TEXT)
    events = json.loads(txt.as_string()) if txt else []
    rig, ow = _rig_frame(scene, f0)
    out = []
    for e in sorted(events, key=lambda e: e["frame"]):
        if not f0 <= e["frame"] <= f1:
            continue
        e = dict(e)
        e["time"] = round((e.pop("frame") - f0) / FPS, 4)
        for k in ("pos", "start", "end"):
            if k in e:
                e[k] = _to_rig(rig, ow, e[k])
        for k in ("direction", "normal"):
            if k in e:
                d = Vector(e[k])
                from efb.vixexport import blender_offset_to_vix_pos
                local = Matrix.Rotation(-rig.yaw, 3, "Z") @ d
                e[k] = [round(v, 4) for v in blender_offset_to_vix_pos(tuple(local))]
        if "frames" in e:
            e["duration"] = round(e.pop("frames") / FPS, 4)
        out.append(e)
    path = paths.out("events", name + ".json")
    with open(path, "w") as fh:
        json.dump({"format": "ult-events/1", "name": name, "fps": FPS,
                   "frame": "vix rig: x forward, y up, z right of the caster at t=0",
                   "events": out}, fh, indent=1)
    return path, len(out)


def export_paths(scene, roles, f0, f1):
    rig, ow = _rig_frame(scene, f0)
    written = []
    for role, obj in roles.items():
        rows = []
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            m = obj.matrix_world
            fwd = m.to_3x3() @ Vector((0.0, 1.0, 0.0))
            yaw = math.degrees(math.atan2(-fwd.x, fwd.y) - rig.yaw)
            rows.append([round((f - f0) / FPS, 4)] + _to_rig(rig, ow, m.translation)
                        + [round(yaw, 3)])
        path = paths.out("paths", role + ".json")
        with open(path, "w") as fh:
            json.dump({"format": "ult-path/1", "columns": ["time", "x", "y", "z", "yaw"],
                       "yaw": "degrees relative to the caster's yaw at t=0, CCW",
                       "rows": rows}, fh)
        written.append(path)
    return written


def _armature_for(obj):
    from efb import assets
    from efbpy.animscene import ARMATURE_PROP
    return assets.armature(obj.get(ARMATURE_PROP, "biped"))


def export_animations(scene, roles, f0, f1, rootmotion=False):
    """One EF clip per role. rootmotion folds the object path into CTRL-Master."""
    from efb import clip as efc
    from efb.animjson import ATTRIBUTES
    from efbpy.animexport import export_file
    info = {}
    sub = "anim_rootmotion" if rootmotion else "anim"
    for role, obj in roles.items():
        path = paths.out(sub, role + ".json")
        restore = None
        if rootmotion:
            restore = _fold_path(scene, obj, f0, f1)
        try:
            _, inf = export_file(path, obj, _armature_for(obj), mode=efc.AUTO,
                                 frame_range=(f0, f1), fps=FPS, format=ATTRIBUTES)
        finally:
            if restore:
                restore()
        info[role] = {k: inf[k] for k in ("mode", "frames", "tracks", "keys") if k in inf}
        info[role]["drift"] = round(inf.get("lerp_drift", inf.get("drift", 0.0)), 5)
        info[role]["path"] = os.path.relpath(path, paths.ROOT)
    return info


def _fold_path(scene, obj, f0, f1):
    """Swap in a copy of the action whose CTRL-Master carries the entity path relative to
    the caster's frame-0 transform, with the object pinned there. Returns an undo."""
    from efbpy.animscene import action_curves
    from .motion import _write_curve, _dp, _ensure_action
    from efbpy.animimport import _assign_slot
    ad = obj.animation_data
    orig = ad.action
    orig_slot = getattr(ad, "action_slot", None)
    _, origin = _rig_frame(scene, f0)
    rest = obj.data.bones["CTRL-Master"].matrix_local
    rows_l, rows_q, rows_s = [], [], []
    frames = list(range(f0, f1 + 1))
    master = obj.pose.bones["CTRL-Master"]
    for f in frames:
        scene.frame_set(f)
        m = origin.inverted() @ obj.matrix_world
        base = master.matrix_basis.copy()
        b = rest.inverted() @ m @ rest @ base
        loc, rot, sca = b.decompose()
        if rows_q and rot.dot(rows_q[-1]) < 0:
            rot = -rot
        rows_l.append(tuple(loc))
        rows_q.append(rot)
        rows_s.append(tuple(sca))
    tmp = orig.copy()
    tmp.name = orig.name + "-rootmotion"
    ad.action = tmp
    if orig_slot is not None and hasattr(tmp, "slots") and tmp.slots:
        ad.action_slot = tmp.slots[0]
    for fc in list(action_curves(tmp, obj)):
        if fc.data_path in ("location", "rotation_euler", "scale") or \
                fc.data_path.startswith('pose.bones["CTRL-Master"]'):
            for bag in _bags(tmp, obj):
                if fc in list(bag.fcurves):
                    bag.fcurves.remove(fc)
                    break
    for ch, rows, tol in (("location", rows_l, 0.002),
                          ("rotation_quaternion", [tuple(q) for q in rows_q], 0.0015),
                          ("scale", rows_s, 0.002)):
        idx = _dp(rows, tol)
        for i in range(len(rows[0])):
            _write_curve(tmp, 'pose.bones["CTRL-Master"].' + ch, i, "CTRL-Master",
                         [frames[j] for j in idx], [rows[j][i] for j in idx])
    saved = (obj.location.copy(), obj.rotation_euler.copy())
    obj.matrix_world = origin

    def undo():
        ad.action = orig
        if orig_slot is not None:
            try:
                ad.action_slot = orig_slot
            except (AttributeError, TypeError, RuntimeError):
                pass
        bpy.data.actions.remove(tmp)
        obj.location, obj.rotation_euler = saved
    return undo


def _bags(action, obj):
    from efbpy.animscene import curve_bags
    return curve_bags(action, obj)


def export_vix(scene, name=SHOT_NAME):
    from efbpy.camexport import export_shot
    scene["ef_origin"] = ORIGIN
    scene["ef_origin_mode"] = "locked"
    out_dir = os.path.join(paths.OUT, "vix")
    os.makedirs(out_dir, exist_ok=True)
    path, shot = export_shot(scene, out_dir, name, strict=True)
    return path, shot.manifest()


def export_all(f0, f1):
    addon.ensure()
    scene = bpy.context.scene
    roles = {o["ult_role"]: o for o in scene.objects if o.get("ult_role")}
    report = {"frames": [f0, f1], "fps": FPS}
    report["vix"], manifest = export_vix(scene)
    report["vix"] = os.path.relpath(report["vix"], paths.ROOT)
    report["vix_cameras"] = len(manifest["cameras"])
    report["vix_warnings"] = manifest["warnings"]
    report["events"], report["event_count"] = export_events(scene, f0, f1)
    report["events"] = os.path.relpath(report["events"], paths.ROOT)
    report["paths"] = [os.path.relpath(p, paths.ROOT) for p in export_paths(scene, roles, f0, f1)]
    report["anim"] = export_animations(scene, roles, f0, f1)
    report["anim_rootmotion"] = export_animations(scene, roles, f0, f1, rootmotion=True)
    with open(paths.out("export_report.json"), "w") as fh:
        json.dump(report, fh, indent=2)
    return report
