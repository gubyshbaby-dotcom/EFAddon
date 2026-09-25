"""Posing the addon's biped control rig from code.

The addon's rig drives the 20 Epic Fight joints through controls. Everything here keys
the FK side only (every ik_* blend at 0), so what the exporter samples is exactly what
this module computed: no solver runs in Blender between our keys and the file.

A pose is described in body terms - where the hips are, how the spine bends, where a hand
or foot should be - and resolved here to control-bone rotations with a two-bone solve
that respects the rig's hinge axes (local X on Hand_* and Leg_*, the same axis the addon's
Hinge limit constrains).

Frames of reference used by the pose parameters:

  actor   the actor object's local space: +Y forward, +Z up, origin at the feet.
          The object itself is the entity; it carries the world path.
  body    axes of a spine segment: X right, Y forward, Z up.
  chest   body axes of the chest, origin at the shoulder joint of the limb in question.
  hips    body axes of the root, origin at the hip joint of the leg in question.
  world   Blender world space; converted through the actor's matrix at that frame.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from mathutils import Matrix, Quaternion, Vector

SPINE_BONES = ("CTRL-Torso", "CTRL-Chest", "CTRL-Head")
SIDES = ("R", "L")

# Rest rotation shared by every spine control: bone X = right, Y = up, Z = back.
_B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
_B_INV = _B.inverted()


def rad(d):
    return math.radians(d)


def body_rot(fwd=0.0, side=0.0, turn=0.0) -> Matrix:
    """A rotation in body axes: bend forward, lean right, turn left (CCW from above)."""
    return (Matrix.Rotation(rad(turn), 4, "Z") @ Matrix.Rotation(rad(-fwd), 4, "X")
            @ Matrix.Rotation(rad(side), 4, "Y"))


def quat_body(fwd=0.0, side=0.0, turn=0.0) -> Quaternion:
    return body_rot(fwd, side, turn).to_quaternion()


def _norm(v, fallback=(0.0, 1.0, 0.0)):
    v = Vector(v)
    if v.length < 1e-9:
        return Vector(fallback)
    return v.normalized()


def _perp(v, axis):
    """Component of v perpendicular to unit `axis`, normalised; None when parallel."""
    p = Vector(v) - axis * Vector(v).dot(axis)
    return p.normalized() if p.length > 1e-6 else None


def frame_from_yz(y: Vector, z: Vector, origin: Vector) -> Matrix:
    x = y.cross(z).normalized()
    z = x.cross(y).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = origin
    return m


# ----------------------------------------------------------------------------- specs

@dataclass(frozen=True)
class Limb:
    """One arm or leg at one key.

    mode "ik":  `at` is the hand/foot position in `space`; `hint` is where the elbow
                or knee should point (chest/hips body axes for those spaces, else the
                same space as `at`).
    mode "fk":  `aim` is the upper segment's direction in chest/hips body axes, `bend`
                the fold in degrees (elbow +, knee + means a normal bend), `hint` the
                direction the lower segment swings toward.
    """
    mode: str = "fk"
    at: tuple = (0.0, 0.0, 0.0)
    space: str = "chest"
    aim: tuple = (0.0, 0.0, -1.0)
    bend: float = 0.0
    hint: tuple = None


@dataclass
class Solved:
    """What a limb resolves to at one frame: its upper segment's rotation relative to
    the parent body frame, and the fold."""
    q: Quaternion
    bend: float


# ----------------------------------------------------------------------------- model

class RigModel:
    """Rest data of one generated rig, and the pose -> control basis maths."""

    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None)
                       for b in rig.data.bones}
        self.local_rest = {}
        for n, m in self.rest.items():
            p = self.parent[n]
            self.local_rest[n] = m if p is None else self.rest[p].inverted() @ m
        self.cog_rest = self.rest["CTRL-COG"].translation.copy()
        self.limb = {}
        for key, up, low, hinge_sign in (("arm_R", "FK-Arm_R", "FK-Hand_R", 1.0),
                                         ("arm_L", "FK-Arm_L", "FK-Hand_L", 1.0),
                                         ("leg_R", "FK-Thigh_R", "FK-Leg_R", -1.0),
                                         ("leg_L", "FK-Thigh_L", "FK-Leg_L", -1.0)):
            ur, lr = self.rest[up], self.rest[low]
            l1 = (lr.translation - ur.translation).length
            tail = self.rig.data.bones[low].tail_local
            l2 = (tail - lr.translation).length
            y_low_in_up = (ur.to_3x3().inverted() @ lr.to_3x3()).col[1]
            delta = math.degrees(math.atan2(y_low_in_up.z, y_low_in_up.y))
            # the fold the rig allows: the FK hinge's local-X band, as a bend
            lo, hi = -180.0, 180.0
            for c in rig.pose.bones[low].constraints:
                if c.type == "LIMIT_ROTATION" and c.use_limit_x:
                    lo, hi = math.degrees(c.min_x), math.degrees(c.max_x)
                    break
            band = ((lo + delta, hi + delta) if hinge_sign > 0
                    else (-hi - delta, -lo - delta))
            self.limb[key] = dict(up=up, low=low, l1=l1, l2=l2, delta=delta,
                                  sign=hinge_sign, band=band)

    # basis of a bone whose armature-space pose should be `pose`, under `parent_pose`
    def basis(self, name, pose, parent_pose):
        return (parent_pose @ self.local_rest[name]).inverted() @ pose

    def follow(self, name, parent_pose):
        """Armature-space pose of a bone left at its rest basis under parent_pose."""
        return parent_pose @ self.local_rest[name]


# ----------------------------------------------------------------------------- solve

def two_bone(root: Vector, target: Vector, l1, l2, hint: Vector):
    """(upper_dir, lower_dir) reaching from root toward target, the middle joint pushed
    toward `hint`. Out-of-reach targets straighten the limb along the line."""
    d = target - root
    dist = d.length
    dn = _norm(d, (0.0, 0.0, -1.0))
    dist = max(abs(l1 - l2) + 1e-4, min(dist, l1 + l2 - 1e-4))
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)
    a = math.acos(max(-1.0, min(1.0, cos_a)))
    side = _perp(hint, dn) or _perp(Vector((0.0, 0.0, 1.0)), dn) or _perp(Vector((1, 0, 0)), dn)
    upper = (dn * math.cos(a) + side * math.sin(a)).normalized()
    joint = root + upper * l1
    lower = _norm(root + dn * dist - joint)
    return upper, lower


def limb_matrices(model: RigModel, key, parent_pose: Matrix, frame_rot: Matrix,
                  solved: Solved):
    """Armature-space matrices of the FK pair, from a Solved in the parent body frame.

    frame_rot is the parent body frame (rotation only, armature space); the upper
    segment's rest orientation in that frame is what `solved.q` rotates.
    """
    info = model.limb[key]
    up_pose0 = model.follow(info["up"], parent_pose)
    origin = up_pose0.translation.copy()
    # rest orientation of the upper bone expressed in the parent body frame
    rest_in_frame = frame_rot.to_3x3().inverted() @ up_pose0.to_3x3()
    rot = frame_rot.to_3x3() @ solved.q.to_matrix() @ rest_in_frame
    up = rot.to_4x4()
    up.translation = origin
    theta = info["sign"] * solved.bend - info["delta"]
    low = up @ (model.rest[info["up"]].inverted() @ model.rest[info["low"]]) \
        @ Matrix.Rotation(rad(theta), 4, "X")
    return up, low


def solve_limb(model: RigModel, key, parent_pose: Matrix, frame_rot: Matrix,
               limb: Limb, to_arm: Matrix) -> Solved:
    """Resolve one Limb spec against the current parent pose.

    to_arm maps the limb's `space` to armature space (already chosen by the caller).
    """
    info = model.limb[key]
    up_pose0 = model.follow(info["up"], parent_pose)
    origin = up_pose0.translation.copy()
    fr = frame_rot.to_3x3()
    fr_inv = fr.inverted()
    rest_in_frame = fr_inv @ up_pose0.to_3x3()
    hint_local = Vector(limb.hint) if limb.hint else _default_hint(key)
    arm = key.startswith("arm")
    fallback_joint = Vector((0.0, -1.0, 0.0)) if arm else Vector((0.0, 1.0, 0.0))
    # `hint` is always where the middle joint points: the outside of the fold. The lower
    # segment swings the other way.
    if limb.mode == "fk":
        up_dir = _norm(limb.aim, (0.0, 0.0, -1.0))
        jd = (_perp(hint_local, up_dir) or _perp(fallback_joint, up_dir)
              or _perp(Vector((0.0, 0.0, 1.0)), up_dir))
        swing = -jd
        bend = limb.bend
    else:
        target = to_arm @ Vector(limb.at)
        if limb.space in ("chest", "hips", "tool_R", "tool_L"):
            hint_arm = fr @ hint_local
        else:
            hint_arm = to_arm.to_3x3() @ hint_local
        u, v = two_bone(origin, target, info["l1"], info["l2"], hint_arm)
        up_dir = fr_inv @ u
        low_dir = fr_inv @ v
        bend = math.degrees(u.angle(v)) if (u - v).length > 1e-6 else 0.0
        swing = _perp(low_dir, up_dir) if bend > 0.5 else None
        if swing is None:
            jd = (_perp(fr_inv @ hint_arm, up_dir) or _perp(fallback_joint, up_dir)
                  or _perp(Vector((0.0, 0.0, 1.0)), up_dir))
            swing = -jd
    # Upper segment frame in body axes: Y along the bone. Arms fold toward +Z (the hinge
    # opens positive), legs toward -Z (the knee band is negative), so Z is the swing for
    # an arm and the knee's own direction for a leg.
    zdir = swing if arm else -swing
    m = frame_from_yz(up_dir, zdir, Vector())
    q = (m.to_3x3() @ _rest_y_frame(rest_in_frame).inverted()).to_quaternion()
    lo, hi = info["band"]
    return Solved(q, max(lo + 0.01, min(hi - 0.01, bend)))


def _rest_y_frame(rest_in_frame):
    """The upper bone's own rest frame, re-orthonormalised as (X, Y, Z)."""
    y = rest_in_frame.col[1].normalized()
    z = rest_in_frame.col[2].normalized()
    return frame_from_yz(y, z, Vector()).to_3x3()


def _default_hint(key):
    s = 1.0 if key.endswith("R") else -1.0
    if key.startswith("arm"):
        return Vector((0.35 * s, -0.7, -0.6))   # elbow out, back and down
    return Vector((0.12 * s, 1.0, 0.0))         # knee forward, a little out


# ----------------------------------------------------------------------------- pose

@dataclass
class Pose:
    """Everything one frame of one actor needs. Angles in degrees."""
    hips: Vector = None                      # COG head, actor space
    body: Quaternion = field(default_factory=Quaternion)
    torso: tuple = (0.0, 0.0, 0.0)           # fwd, side, turn
    chest: tuple = (0.0, 0.0, 0.0)
    head: tuple = (0.0, 0.0, 0.0)
    shoulder_R: tuple = (0.0, 0.0, 0.0)      # shrug: fwd, side(up), turn
    shoulder_L: tuple = (0.0, 0.0, 0.0)
    arm_R: Limb = None
    arm_L: Limb = None
    leg_R: Limb = None
    leg_L: Limb = None
    tool_R: tuple = (0.0, 0.0, 0.0)          # euler degrees on CTRL-Tool_R
    tool_L: tuple = (0.0, 0.0, 0.0)
    tool_R_scale: float = 1.0
    tool_L_scale: float = 1.0
    scale: float = 1.0


NEUTRAL_LIMB = {
    "arm_R": Limb("fk", aim=(0.12, 0.0, -1.0), bend=12.0, hint=(0.3, -1.0, 0.0)),
    "arm_L": Limb("fk", aim=(-0.12, 0.0, -1.0), bend=12.0, hint=(-0.3, -1.0, 0.0)),
    "leg_R": Limb("fk", aim=(0.02, 0.0, -1.0), bend=0.0, hint=(0.1, 1.0, 0.0)),
    "leg_L": Limb("fk", aim=(-0.02, 0.0, -1.0), bend=0.0, hint=(-0.1, 1.0, 0.0)),
}


class PoseEvaluator:
    """Pose -> {control bone: (location, quaternion, scale)} for one rig."""

    def __init__(self, model: RigModel):
        self.m = model

    def frames(self, pose: Pose):
        """Armature-space matrices of the spine chain and the limb parents."""
        m = self.m
        out = {}
        master = Matrix.Scale(pose.scale, 4) @ m.rest["CTRL-Master"]
        out["CTRL-Master"] = master
        hips = pose.hips if pose.hips is not None else m.cog_rest
        cog = Matrix.Translation(Vector(hips) * pose.scale) @ \
            (Matrix.Scale(pose.scale, 4) @ pose.body.to_matrix().to_4x4() @ _B)
        out["CTRL-COG"] = cog
        root = m.follow("CTRL-Root", cog)
        out["CTRL-Root"] = root
        prev = root
        for name, ang in zip(SPINE_BONES, (pose.torso, pose.chest, pose.head)):
            p0 = m.follow(name, prev)
            cur = p0 @ (_B_INV @ body_rot(*ang) @ _B)
            out[name] = cur
            prev = cur if name != "CTRL-Head" else prev
        chest = out["CTRL-Chest"]
        for s in SIDES:
            sh = m.follow("CTRL-Shoulder_" + s, chest)
            rest_rot = m.rest["CTRL-Shoulder_" + s].to_3x3()
            f, u, t = pose.shoulder_R if s == "R" else pose.shoulder_L
            # shrug: rotate the collar in chest body axes about its own pivot
            r_body = body_rot(f, (u if s == "R" else -u), t)
            frame = chest.to_3x3() @ _B_INV.to_3x3()
            sh_rot = frame @ r_body.to_3x3() @ frame.inverted() @ sh.to_3x3()
            sh2 = sh_rot.to_4x4()
            sh2.translation = sh.translation
            out["CTRL-Shoulder_" + s] = sh2
            out["CTRL-Detach-Arm_" + s] = m.follow("CTRL-Detach-Arm_" + s, sh2)
            out["CTRL-Detach-Thigh_" + s] = m.follow("CTRL-Detach-Thigh_" + s, root)
        return out

    def body_frame(self, mat):
        """Rotation-only armature matrix of a spine bone's body axes."""
        r = (mat.to_3x3().normalized() @ _B_INV.to_3x3()).to_4x4()
        return r

    def limb_parent(self, frames, key):
        s = key[-1]
        if key.startswith("arm"):
            return frames["CTRL-Detach-Arm_" + s], self.body_frame(frames["CTRL-Chest"])
        return frames["CTRL-Detach-Thigh_" + s], self.body_frame(frames["CTRL-Root"])

    def tool_matrix(self, frames, side, solved_arm, pose: Pose):
        """Armature matrix of the Tool_<side> socket. The held item points down its -Z."""
        key = "arm_" + side
        parent, frame = self.limb_parent(frames, key)
        up, low = limb_matrices(self.m, key, parent, frame, solved_arm)
        ang = pose.tool_R if side == "R" else pose.tool_L
        sc = pose.tool_R_scale if side == "R" else pose.tool_L_scale
        e = Matrix.Rotation(rad(ang[2]), 4, "Z") @ Matrix.Rotation(rad(ang[1]), 4, "Y") \
            @ Matrix.Rotation(rad(ang[0]), 4, "X") @ Matrix.Scale(max(sc, 1e-3), 4)
        return low @ (self.m.rest["FK-Hand_" + side].inverted()
                      @ self.m.rest["Tool_" + side]) @ e

    def space_matrix(self, frames, key, space, actor_inv_world=None, tool=None):
        """Armature matrix of a limb spec's `space`."""
        if space in ("tool_R", "tool_L"):
            if tool is None:
                raise ValueError("%s needs the other hand solved first" % space)
            t = tool.copy()
            t.normalize()
            return t
        parent, frame = self.limb_parent(frames, key)
        if space in ("chest", "hips"):
            up = self.m.limb[key]["up"]
            o = self.m.follow(up, parent).translation
            mm = frame.copy()
            mm.translation = o
            return mm
        if space == "actor":
            return Matrix.Identity(4)
        if space == "world":
            return actor_inv_world if actor_inv_world is not None else Matrix.Identity(4)
        raise ValueError(space)

    def solve(self, frames, key, limb: Limb, actor_inv_world=None, tool=None) -> Solved:
        parent, frame = self.limb_parent(frames, key)
        return solve_limb(self.m, key, parent, frame, limb,
                          self.space_matrix(frames, key, limb.space, actor_inv_world, tool))

    def controls(self, pose: Pose, solved: dict):
        """{bone: Matrix basis} for every control this module keys."""
        m = self.m
        fr = self.frames(pose)
        out = {}
        out["CTRL-Master"] = Matrix.Scale(pose.scale, 4)
        out["CTRL-COG"] = m.basis("CTRL-COG", fr["CTRL-COG"], fr["CTRL-Master"])
        prev = fr["CTRL-Root"]
        for name in SPINE_BONES:
            out[name] = m.basis(name, fr[name], prev if name != "CTRL-Head" else fr["CTRL-Chest"])
            if name == "CTRL-Torso":
                prev = fr[name]
        for s in SIDES:
            out["CTRL-Shoulder_" + s] = m.basis("CTRL-Shoulder_" + s,
                                                fr["CTRL-Shoulder_" + s], fr["CTRL-Chest"])
        for key, sol in solved.items():
            parent, frame = self.limb_parent(fr, key)
            up, low = limb_matrices(m, key, parent, frame, sol)
            info = m.limb[key]
            out[info["up"]] = m.basis(info["up"], up, parent)
            out[info["low"]] = m.basis(info["low"], low, up)
        for s, ang, sc in (("R", pose.tool_R, pose.tool_R_scale),
                           ("L", pose.tool_L, pose.tool_L_scale)):
            e = Matrix.Rotation(rad(ang[2]), 4, "Z") @ Matrix.Rotation(rad(ang[1]), 4, "Y") \
                @ Matrix.Rotation(rad(ang[0]), 4, "X")
            out["CTRL-Tool_" + s] = e @ Matrix.Scale(max(sc, 1e-3), 4)
        return out

    def joint_positions(self, pose: Pose, solved: dict):
        """Armature-space positions of a few landmarks, for aiming cameras and FX."""
        m = self.m
        fr = self.frames(pose)
        pts = {"hips": fr["CTRL-Root"].translation.copy(),
               "chest": fr["CTRL-Chest"].translation.copy()}
        head = fr["CTRL-Head"]
        pts["head"] = (head @ Matrix.Translation((0.0, 0.25 * pose.scale, 0.0))).translation.copy()
        pts["head_top"] = (head @ Matrix.Translation((0.0, 0.5 * pose.scale, 0.0))).translation.copy()
        for key, sol in solved.items():
            parent, frame = self.limb_parent(fr, key)
            up, low = limb_matrices(m, key, parent, frame, sol)
            info = m.limb[key]
            end = (low @ Matrix.Translation((0.0, info["l2"], 0.0))).translation.copy()
            name = {"arm_R": "hand_R", "arm_L": "hand_L", "leg_R": "foot_R",
                    "leg_L": "foot_L"}[key]
            pts[name] = end
            pts[{"arm_R": "elbow_R", "arm_L": "elbow_L", "leg_R": "knee_R",
                 "leg_L": "knee_L"}[key]] = low.translation.copy()
        return pts
