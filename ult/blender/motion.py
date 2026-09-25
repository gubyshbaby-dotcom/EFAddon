"""Actor timelines: sparse keys per channel, baked to one pose per frame, written back
as reduced LINEAR fcurves on the addon's FK controls and the actor object.

Every channel keeps its own keys, so a punch can key an arm while the legs carry on with
whatever they were doing. A key's `ease` shapes the way INTO that key:

  lin     straight
  io      smooth in and out (the default)
  in/in3  accelerate into the key (wind-ups, falls)
  out/out3/out5  arrive fast and settle (strikes; out5 is a smear-speed snap)
  step    hold the previous value and jump on the key's frame (cuts, teleports)

Arms and legs are keyed as rigkit.Limb specs. Two IK keys in the same space interpolate
their target and are re-solved every frame (straight punches, planted feet, a two handed
grip); anything else interpolates the solved rotations (arcs: swings, slashes, runs).
"""

from __future__ import annotations

import bisect
import math
import random

import bpy
from mathutils import Matrix, Quaternion, Vector

from .rigkit import (NEUTRAL_LIMB, Limb, Pose, PoseEvaluator, RigModel, Solved,
                     quat_body)

LIMBS = ("arm_R", "leg_R", "leg_L", "arm_L")     # arm_L last: it may grip the right tool
SIMPLE = {"hips": "vec", "body": "quat", "torso": "ang", "chest": "ang", "head": "ang",
          "shoulder_R": "ang", "shoulder_L": "ang", "tool_R": "ang", "tool_L": "ang",
          "tool_R_scale": "num", "tool_L_scale": "num", "scale": "num"}


def _pow_out(p):
    return lambda u: 1.0 - (1.0 - u) ** p


EASE = {
    "lin": lambda u: u,
    "io": lambda u: u * u * (3.0 - 2.0 * u),
    "io3": lambda u: 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2,
    "in": lambda u: u * u,
    "in3": lambda u: u ** 3,
    "out": _pow_out(2),
    "out3": _pow_out(3),
    "out5": _pow_out(5),
    "step": lambda u: 1.0 if u >= 1.0 else 0.0,
}


class Track:
    def __init__(self, kind):
        self.kind = kind
        self.frames = []
        self.values = []
        self.eases = []

    def add(self, f, v, ease="io"):
        f = float(f)
        i = bisect.bisect_left(self.frames, f)
        if i < len(self.frames) and abs(self.frames[i] - f) < 1e-6:
            self.values[i], self.eases[i] = v, ease
        else:
            self.frames.insert(i, f)
            self.values.insert(i, v)
            self.eases.insert(i, ease)

    def __bool__(self):
        return bool(self.frames)

    def span(self, f):
        """(i0, i1, u): neighbouring key indices and the eased blend between them."""
        n = len(self.frames)
        if n == 0:
            return None
        i = bisect.bisect_right(self.frames, f)
        if i == 0:
            return 0, 0, 0.0
        if i >= n:
            return n - 1, n - 1, 0.0
        f0, f1 = self.frames[i - 1], self.frames[i]
        u = (f - f0) / (f1 - f0) if f1 > f0 else 1.0
        return i - 1, i, EASE[self.eases[i]](max(0.0, min(1.0, u)))

    def value(self, f, default=None):
        sp = self.span(f)
        if sp is None:
            return default
        i0, i1, u = sp
        a, b = self.values[i0], self.values[i1]
        if i0 == i1 or u <= 0.0:
            return a
        if u >= 1.0:
            return b
        return blend(self.kind, a, b, u)


def blend(kind, a, b, u):
    if kind == "vec":
        return Vector(a).lerp(Vector(b), u)
    if kind == "quat":
        qa, qb = Quaternion(a), Quaternion(b)
        if qa.dot(qb) < 0.0:
            qb = -qb
        return qa.slerp(qb, u)
    if kind == "ang":
        return tuple(x + (y - x) * u for x, y in zip(a, b))
    return a + (b - a) * u


def _vec(v):
    return Vector(v) if v is not None else None


def _as_quat(v):
    if isinstance(v, Quaternion):
        return v
    if len(v) == 4:
        return Quaternion(v)
    return quat_body(*v)


class Actor:
    """One character: its rig object, its keys, and the path its entity follows."""

    def __init__(self, name, rig, obj_scale=1.0):
        self.name = name
        self.rig = rig
        self.model = RigModel(rig)
        self.ev = PoseEvaluator(self.model)
        self.obj_scale = obj_scale
        self.tracks = {k: Track(t) for k, t in SIMPLE.items()}
        self.limbs = {k: Track("limb") for k in LIMBS}
        self.pos = Track("vec")
        self.yaw = Track("num")
        self.noise = []          # (f0, f1, amp_deg, hz, seed, decay)
        self._resolved = {}

    # ------------------------------------------------------------------ keying
    def key(self, f, ease="io", **ch):
        """Key any mix of channels at frame f. Angles in degrees; `body` takes
        (fwd, side, turn) or a Quaternion; limbs take rigkit.Limb."""
        for name, v in ch.items():
            if v is None:
                continue
            if name in self.limbs:
                self.limbs[name].add(f, v, ease)
            elif name == "body":
                self.tracks["body"].add(f, _as_quat(v), ease)
            elif name == "hips":
                self.tracks["hips"].add(f, Vector(v), ease)
            elif name in self.tracks:
                self.tracks[name].add(f, tuple(v) if isinstance(v, (tuple, list)) else v, ease)
            else:
                raise KeyError("%s: no channel %r" % (self.name, name))
        self._resolved.clear()

    def place(self, f, pos, yaw=None, ease="step"):
        """Where the entity is. `yaw` in degrees, 0 = facing +Y, positive = CCW."""
        self.pos.add(f, Vector(pos), ease)
        if yaw is not None:
            self.yaw.add(f, float(yaw), ease)

    def shake(self, f0, f1, amp=4.0, hz=12.0, decay=True, seed=None):
        self.noise.append((f0, f1, amp, hz, seed if seed is not None else len(self.noise) * 7 + 3, decay))

    def hide(self, f, ease="step"):
        self.key(f, ease=ease, scale=0.01)

    def show(self, f, ease="step"):
        self.key(f, ease=ease, scale=1.0)

    # ------------------------------------------------------------------ evaluation
    def world(self, f):
        pos = self.pos.value(f, Vector())
        yaw = self.yaw.value(f, 0.0)
        return (Matrix.Translation(pos) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
                @ Matrix.Scale(self.obj_scale, 4))

    def simple_pose(self, f):
        p = Pose()
        t = self.tracks
        p.hips = t["hips"].value(f, None)
        p.body = t["body"].value(f, Quaternion())
        for n in ("torso", "chest", "head", "shoulder_R", "shoulder_L", "tool_R", "tool_L"):
            p.__dict__[n] = t[n].value(f, (0.0, 0.0, 0.0))
        p.tool_R_scale = t["tool_R_scale"].value(f, 1.0)
        p.tool_L_scale = t["tool_L_scale"].value(f, 1.0)
        p.scale = t["scale"].value(f, 1.0)
        for f0, f1, amp, hz, seed, decay in self.noise:
            if f0 <= f <= f1:
                k = 1.0 - (f - f0) / max(1.0, f1 - f0) if decay else 1.0
                a = amp * k
                rnd = random.Random(seed * 1000 + int(f))
                jitter = (rnd.uniform(-a, a), rnd.uniform(-a, a) * 0.5, rnd.uniform(-a, a) * 0.6)
                p.chest = tuple(c + j for c, j in zip(p.chest, jitter))
                p.head = tuple(c + j * 0.7 for c, j in zip(p.head, jitter))
        return p

    def _limb_spec(self, key, i):
        return self.limbs[key].values[i]

    def _resolve_key(self, key, i):
        """Solved rotation of limb key i, at that key's own frame."""
        ck = (key, i)
        if ck in self._resolved:
            return self._resolved[ck]
        f = self.limbs[key].frames[i]
        pose, _, solved = self._evaluate(f, only=key, stop_at=key)
        self._resolved[ck] = solved[key]
        return solved[key]

    def _evaluate(self, f, only=None, stop_at=None):
        pose = self.simple_pose(f)
        frames = self.ev.frames(pose)
        inv_world = self.world(f).inverted()
        solved = {}
        tools = {}
        for key in LIMBS:
            tr = self.limbs[key]
            sp = tr.span(f)
            if sp is None:
                spec = NEUTRAL_LIMB[key]
                solved[key] = self.ev.solve(frames, key, spec, inv_world)
            else:
                i0, i1, u = sp
                a, b = tr.values[i0], tr.values[i1]
                if i0 == i1 or u <= 0.0 or u >= 1.0 or (
                        a.mode == "ik" and b.mode == "ik" and a.space == b.space):
                    if i0 == i1 or u <= 0.0:
                        spec = a
                    elif u >= 1.0:
                        spec = b
                    else:
                        ha = Vector(a.hint) if a.hint else None
                        hb = Vector(b.hint) if b.hint else None
                        hint = (ha.lerp(hb, u) if ha is not None and hb is not None
                                else (ha or hb))
                        spec = Limb("ik", at=tuple(Vector(a.at).lerp(Vector(b.at), u)),
                                    space=a.space, hint=tuple(hint) if hint is not None else None)
                    tool = tools.get("R") if spec.space == "tool_R" else tools.get("L")
                    solved[key] = self.ev.solve(frames, key, spec, inv_world, tool)
                else:
                    sa = self._resolve_key(key, i0)
                    sb = self._resolve_key(key, i1)
                    qa, qb = sa.q, sb.q
                    if qa.dot(qb) < 0.0:
                        qb = -qb
                    solved[key] = Solved(qa.slerp(qb, u), sa.bend + (sb.bend - sa.bend) * u)
            if key.startswith("arm"):
                side = key[-1]
                tools[side] = self.ev.tool_matrix(frames, side, solved[key], pose)
            if stop_at == key:
                break
        return pose, frames, solved

    def evaluate(self, f):
        pose, frames, solved = self._evaluate(f)
        return pose, solved

    def landmarks(self, f):
        """World positions of hips, chest, head, hands, feet at frame f."""
        pose, solved = self.evaluate(f)
        w = self.world(f)
        return {k: w @ v for k, v in self.ev.joint_positions(pose, solved).items()}

    def bone_world(self, f, name="CTRL-Head"):
        """World matrix of a spine control (CTRL-COG/Root/Torso/Chest/Head)."""
        pose, frames, solved = self._evaluate(f)
        return self.world(f) @ frames[name]

    def face_point(self, f, right=0.0, up=0.25, fwd=0.26):
        """A point on the front of the head: right/up/fwd in the head's own axes."""
        m = self.bone_world(f, "CTRL-Head")
        # head bone: X right, Y up, Z back
        return m @ Vector((right, up, -fwd))

    def tool_world(self, f, side="R"):
        pose, frames, solved = self._evaluate(f)
        return self.world(f) @ self.ev.tool_matrix(frames, side, solved["arm_" + side], pose)


# ---------------------------------------------------------------------- baking

def _dp(values, tol):
    """Douglas-Peucker on rows of `values` (n x k list); returns kept indices."""
    n = len(values)
    if n < 3:
        return list(range(n))
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        a, b = values[lo], values[hi]
        span = hi - lo
        worst, at = -1.0, -1
        for i in range(lo + 1, hi):
            t = (i - lo) / span
            v = values[i]
            err = max(abs(v[j] - (a[j] + (b[j] - a[j]) * t)) for j in range(len(v)))
            if err > worst:
                worst, at = err, i
        if worst > tol:
            keep[at] = True
            stack.append((lo, at))
            stack.append((at, hi))
    return [i for i, k in enumerate(keep) if k]


def _ensure_action(idblock, name):
    """The action animating `idblock`, created with a slot of the right ID type on
    layered-action builds (4.4+); legacy builds just get a plain action."""
    ad = idblock.animation_data or idblock.animation_data_create()
    if ad.action is None:
        act = bpy.data.actions.new(name)
        ad.action = act
        if hasattr(act, "slots"):
            if not act.slots:
                act.slots.new(idblock.id_type, idblock.name[:60])
            try:
                ad.action_slot = act.slots[0]
            except (AttributeError, TypeError, RuntimeError):
                pass
    return ad.action


def _write_curve(action, path, index, group, frames, values):
    from efbpy.animimport import _new_curve
    fc = _new_curve(action, path, index, group)
    fc.keyframe_points.add(len(frames))
    flat = []
    for f, v in zip(frames, values):
        flat += (f, v)
    fc.keyframe_points.foreach_set("co", flat)
    ip = [bpy.types.Keyframe.bl_rna.properties["interpolation"].enum_items["LINEAR"].value] * len(frames)
    fc.keyframe_points.foreach_set("interpolation", ip)
    fc.update()
    return fc


def _group_keys(samples, frames, tol, cuts):
    """samples: list of tuples per frame. Returns (key_frames, key_values).

    Where a shot cut is also a discontinuity (a teleport or a snapped pose, not fast but
    continuous motion), the previous value is held right up to the cut, so the game's
    in-between frames do not smear across it."""
    idx = set(_dp(samples, tol))
    holds = []
    fset = {f: i for i, f in enumerate(frames)}

    def step(i):
        if i <= 0 or i >= len(samples):
            return 0.0
        return max(abs(x - y) for x, y in zip(samples[i - 1], samples[i]))
    for c in cuts:
        i = fset.get(c)
        if i is None or i == 0:
            continue
        jump = step(i)
        if jump > tol * 4 and jump > 3.0 * max(step(i - 1), step(i + 1)):
            idx.update((i - 1, i))
            holds.append((c - 0.02, samples[i - 1]))
    keys = sorted([(frames[i], samples[i]) for i in idx] + holds, key=lambda x: x[0])
    return [f for f, _ in keys], [v for _, v in keys]


BONE_CHANNELS = {"CTRL-Master": ("scale",), "CTRL-COG": ("location", "rotation_quaternion"),
                 "CTRL-Tool_R": ("rotation_quaternion", "scale"),
                 "CTRL-Tool_L": ("rotation_quaternion", "scale")}
TOL = {"location": 0.002, "rotation_quaternion": 0.0015, "scale": 0.002}


def bake(actor: Actor, f0, f1, cuts=(), action_name=None):
    """Evaluate every frame in [f0, f1] and write reduced LINEAR keys."""
    rig = actor.rig
    for p in ("ik_arm_r", "ik_arm_l", "ik_leg_r", "ik_leg_l"):
        rig[p] = 0.0
    frames = list(range(int(f0), int(f1) + 1))
    per_bone = {}
    path_loc, path_rot = [], []
    for f in frames:
        pose, solved = actor.evaluate(f)
        ctr = actor.ev.controls(pose, solved)
        for bone, mb in ctr.items():
            loc, rot, sca = mb.decompose()
            d = per_bone.setdefault(bone, {"location": [], "rotation_quaternion": [], "scale": []})
            q = d["rotation_quaternion"]
            if q and Quaternion(q[-1]).dot(rot) < 0.0:
                rot = -rot
            d["location"].append(tuple(loc))
            q.append(tuple(rot))
            d["scale"].append(tuple(sca))
        w = actor.world(f)
        path_loc.append(tuple(w.translation))
        path_rot.append((math.radians(actor.yaw.value(f, 0.0)),))
    action = _ensure_action(rig, action_name or ("ULT-" + actor.name))
    for bone, chans in per_bone.items():
        wanted = BONE_CHANNELS.get(bone, ("rotation_quaternion",))
        pb = rig.pose.bones[bone]
        pb.rotation_mode = "QUATERNION"
        path_base = 'pose.bones["%s"].' % bone
        for ch in wanted:
            kf, kv = _group_keys(chans[ch], frames, TOL[ch], cuts)
            for i in range(len(kv[0])):
                _write_curve(action, path_base + ch, i, bone, kf, [v[i] for v in kv])
    # the entity path lives on the object itself
    rig.rotation_mode = "XYZ"
    kf, kv = _group_keys(path_loc, frames, 0.002, cuts)
    for i in range(3):
        _write_curve(action, "location", i, "Object", kf, [v[i] for v in kv])
    kf, kv = _group_keys(path_rot, frames, 0.001, cuts)
    _write_curve(action, "rotation_euler", 2, "Object", kf, [v[0] for v in kv])
    rig.scale = (actor.obj_scale,) * 3
    return action
