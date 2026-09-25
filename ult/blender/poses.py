"""Pose vocabulary for the fight, as channel dicts for Actor.key().

Conventions (see rigkit): actor space is +Y forward, +Z up, feet at the origin. Arm
targets in "chest" space are relative to that arm's shoulder joint, in chest body axes.
`inward` is mirrored per side so one call describes either hand: positive = toward the
body's centre line.

Minecraft proportions for reference: shoulder joint 1.39 up, chin ~1.52, eyes ~1.75,
hip joint 0.76, arm reach 0.57, leg 0.76.
"""

from __future__ import annotations

from .rigkit import Limb, quat_body

SIDE = {"R": 1.0, "L": -1.0}


def hand(side, inward, fwd, up, space="chest", hint=None):
    """IK hand target. hint: where the elbow points, chest axes, mirrored like inward."""
    s = SIDE[side]
    h = None if hint is None else (hint[0] * s, hint[1], hint[2])
    return Limb("ik", at=(-inward * s, fwd, up), space=space, hint=h)


def hand_world(pos, hint=None):
    return Limb("ik", at=tuple(pos), space="world", hint=hint)


def foot(side, out, fwd, up=0.0, hint=None, space="actor"):
    """IK foot in actor space; `out` is sideways away from the centre line."""
    s = SIDE[side]
    h = (0.15 * s, 1.0, 0.0) if hint is None else (hint[0] * s, hint[1], hint[2])
    return Limb("ik", at=(out * s, fwd, up), space=space, hint=h)


def arm_fk(side, out, fwd, down, bend, elbow=(0.3, -1.0, -0.2)):
    """FK arm: upper arm direction (out/fwd/down), elbow fold, elbow direction."""
    s = SIDE[side]
    return Limb("fk", aim=(out * s, fwd, -down), bend=bend,
                hint=(elbow[0] * s, elbow[1], elbow[2]))


def leg_fk(side, out, fwd, down, bend, knee=(0.1, 1.0, 0.0)):
    s = SIDE[side]
    return Limb("fk", aim=(out * s, fwd, -down), bend=bend,
                hint=(knee[0] * s, knee[1], knee[2]))


def body(fwd=0.0, side=0.0, turn=0.0):
    return quat_body(fwd, side, turn)


# ------------------------------------------------------------------------ stances

def guard(lead="L", crouch=0.06, turn=-22.0):
    """Boxing guard: lead foot forward, rear fist at the chin, lead fist out front."""
    rear = "R" if lead == "L" else "L"
    t = turn if lead == "L" else -turn
    return {
        "hips": (0.0, 0.0, 0.764 - crouch),
        "body": body(4, 0, t),
        "torso": (4, 0, 0), "chest": (4, 0, -6 if lead == "L" else 6), "head": (-6, 0, -t * 0.8),
        "arm_" + rear: hand(rear, 0.16, 0.26, 0.14, hint=(0.6, -0.2, -1.0)),
        "arm_" + lead: hand(lead, 0.10, 0.40, 0.10, hint=(0.6, -0.2, -1.0)),
        "leg_" + lead: foot(lead, 0.14, 0.26),
        "leg_" + rear: foot(rear, 0.20, -0.24),
    }


def stance_wide(depth=0.24, fists=True):
    """Horse stance: feet wide, hips low, fists pulled to the hips, elbows out."""
    d = {
        "hips": (0.0, 0.0, 0.764 - depth),
        "body": body(8, 0, 0),
        "torso": (6, 0, 0), "chest": (-4, 0, 0), "head": (-10, 0, 0),
        "leg_R": foot("R", 0.48, 0.02, hint=(0.7, 1.0, 0.0)),
        "leg_L": foot("L", 0.48, 0.02, hint=(0.7, 1.0, 0.0)),
    }
    if fists:
        d["arm_R"] = hand("R", -0.18, 0.02, -0.34, hint=(1.0, -0.6, 0.0))
        d["arm_L"] = hand("L", -0.18, 0.02, -0.34, hint=(1.0, -0.6, 0.0))
    return d


def kneel(knee="R", lean=28.0, hand_down="R"):
    """One knee on the ground, the other foot planted, a hand propping on the floor."""
    other = "L" if knee == "R" else "R"
    d = {
        "hips": (0.0, -0.05, 0.40),
        "body": body(lean, 0, 0),
        "torso": (8, 0, 0), "chest": (6, 0, 0), "head": (-30, 0, 0),
        "leg_" + knee: foot(knee, 0.16, -0.38, 0.02, hint=(0.1, 0.4, -1.0)),
        "leg_" + other: foot(other, 0.16, 0.34, 0.0),
    }
    free = "L" if hand_down == "R" else "R"
    d["arm_" + hand_down] = Limb("ik", at=(0.26 * SIDE[hand_down], 0.30, 0.0),
                                 space="actor", hint=(0.5 * SIDE[hand_down], -1.0, 0.0))
    d["arm_" + free] = hand(free, 0.05, 0.30, -0.30, hint=(0.5, -0.5, -1.0))
    return d


def squat_ready(depth=0.34):
    """Ishigori's low crouch: wide knees, fists hanging low in front."""
    return {
        "hips": (0.0, -0.05, 0.764 - depth),
        "body": body(34, 0, 0),
        "torso": (10, 0, 0), "chest": (8, 0, 0), "head": (-42, 0, 0),
        "leg_R": foot("R", 0.34, 0.12, hint=(0.6, 1.0, 0.0)),
        "leg_L": foot("L", 0.34, 0.12, hint=(0.6, 1.0, 0.0)),
        "arm_R": hand("R", 0.12, 0.34, -0.42, hint=(0.8, -0.3, 0.0)),
        "arm_L": hand("L", 0.12, 0.34, -0.42, hint=(0.8, -0.3, 0.0)),
    }


# ------------------------------------------------------------------------ motion

def run_cycle(actor, f0, f1, stride_frames=10, lean=18.0, arms="pump", phase=0.0,
              bob=0.05):
    """Key a run in place (the path moves the entity) from f0 to f1.

    arms: "pump" (sprinting) or "spread" (balancing along an edge).
    """
    f = float(f0)
    k = int(round(phase))
    half = stride_frames / 2.0
    while f <= f1 + 1e-6:
        right = (k % 2 == 0)
        a, b = ("R", "L") if right else ("L", "R")
        # contact: front leg reaching, back leg pushing
        actor.key(f, ease="io",
                  hips=(0.0, 0.0, 0.70 - bob),
                  body=body(lean, 0, 6 if right else -6),
                  chest=(4, 0, -10 if right else 10), head=(-lean * 0.7, 0, 0),
                  **{"leg_" + a: leg_fk(a, 0.02, 0.62, 0.78, 38),
                     "leg_" + b: leg_fk(b, 0.02, -0.55, 0.83, 70)})
        if arms == "pump":
            actor.key(f, ease="io", **{
                "arm_" + b: arm_fk(b, 0.12, 0.75, 0.62, 95, elbow=(0.2, -1.0, -0.3)),
                "arm_" + a: arm_fk(a, 0.15, -0.55, 0.83, 60, elbow=(0.2, -1.0, 0.2))})
        else:
            actor.key(f, ease="io", **{
                "arm_" + a: arm_fk(a, 1.0, 0.1 if right else -0.1, 0.05 if right else -0.12, 12),
                "arm_" + b: arm_fk(b, 1.0, -0.1 if right else 0.1, -0.1 if right else 0.08, 15)})
        # passing/flight: hips up, legs tucked
        fm = f + half * 0.5
        if fm < f1:
            actor.key(fm, ease="io", hips=(0.0, 0.0, 0.72 + bob),
                      **{"leg_" + a: leg_fk(a, 0.02, 0.25, 0.97, 30),
                         "leg_" + b: leg_fk(b, 0.02, -0.05, 1.0, 110)})
        f += half
        k += 1


def flying_back(tumble=0.0):
    """Blown backwards through the air: back arched, limbs trailing forward."""
    return {
        "hips": (0.0, 0.0, 0.9),
        "body": body(-70 + tumble, 0, 0),
        "torso": (-10, 0, 0), "chest": (-14, 0, 0), "head": (28, 0, 0),
        "arm_R": arm_fk("R", 0.5, 0.75, -0.3, 30, elbow=(0.3, -1.0, 0.0)),
        "arm_L": arm_fk("L", 0.6, 0.6, -0.5, 45, elbow=(0.3, -1.0, 0.0)),
        "leg_R": leg_fk("R", 0.1, 0.8, 0.5, 40),
        "leg_L": leg_fk("L", 0.15, 0.55, 0.8, 20),
    }
