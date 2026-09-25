"""Act 1 (frames 0-305): the fist fight on the turf roof.

Staging (world, blocks): the turf roof surface is z = 0, the red shed is to the north.
Yuta starts at the origin facing south (yaw 180), Ishigori 1.25 blocks south of him
facing north. Minecraft arms reach 0.57 from the shoulder, so boxing range is ~1.25
between the two and every blow is aimed by IK at a point on the other's face at the
contact frame.

Actor-space reminders: +Y is the actor's forward, so hips (0, -0.1, z) means weight back;
turn + is counter-clockwise (the right shoulder comes forward).
"""

import math
import random

from mathutils import Vector

from .. import fx
from ..camera import ShotCam, fixed, follow
from ..poses import (body, flying_back, foot, guard, hand, hand_world, kneel, leg_fk,
                     squat_ready, stance_wide, arm_fk)
from . import cam

YUTA_YAW = 180.0
ISHI_YAW = 0.0
Y0 = Vector((0.0, 0.0, 0.0))
I0 = Vector((0.0, -1.25, 0.0))


def breathe(A, f0, f1, base, amp=0.012, period=18):
    """Subtle idle rise and fall of the hips between f0 and f1."""
    f, up = f0, True
    while f <= f1:
        A.key(f, ease="io", hips=(base[0], base[1], base[2] + (amp if up else 0.0)))
        f += period // 2
        up = not up


def stage(cast):
    Y, I = cast["yuta"], cast["ishigori"]
    s001(Y, I)
    s003(Y, I)
    s005(Y, I)
    s006(Y, I)
    s007(Y, I)
    s008(Y, I)
    s009(Y, I)
    s010(Y, I)
    s011(Y, I)
    s012(Y, I)


# --------------------------------------------------------------------------- S001
def s001(Y, I):
    """0-32: CU Yuta holding his guard; the wind-up starts as the shot ends."""
    Y.place(0, Y0, YUTA_YAW)
    I.place(0, I0, ISHI_YAW)
    g = guard()
    Y.key(0, **g)
    breathe(Y, 0, 26, g["hips"])
    I.key(0, **guard(turn=-18))
    breathe(I, 0, 40, guard()["hips"], period=22)
    # the eyes can't move on a Minecraft head, so the look is carried by the neck
    Y.key(0, head=(-8, 0, 12))
    Y.key(20, head=(-10, -3, 16), ease="io")
    Y.key(29, head=(-6, 0, 18), ease="io")
    c = cam("S001", lens=45)
    head = follow(Y, "head", (0, 0, -0.14))
    c.key(0, eye=lambda f: head(f) + Vector((1.5, -0.95, -0.28)), target=head)
    c.key(32, eye=lambda f: head(f) + Vector((1.38, -0.86, -0.25)), target=head, ease="lin")
    c.shake(0, 32, amp=0.12, hz=0.9, decay=False)


# --------------------------------------------------------------------------- S003/S004
def s003(Y, I):
    """33-57: flash, then the right straight in slow motion, landing at 54."""
    c = cam("S003", lens=32)
    fx.flash(c, [(33, 1.0), (34, 1.0), (35, 1.0), (36, 0.75), (37, 0.5), (38, 0.3),
                 (39, 0.15), (40, 0.0)])
    # wind-up: weight back, right shoulder pulled away, fist cocked by the ear
    Y.key(30, ease="io", hips=(0.0, -0.08, 0.70), body=body(2, 0, -32), chest=(2, 0, -10),
          arm_R=hand("R", 0.10, 0.06, 0.16, hint=(0.7, -0.6, -0.4)))
    Y.key(35, ease="in", hips=(0.0, -0.13, 0.68), body=body(0, 0, -40), chest=(0, 0, -14),
          head=(-4, 0, 20),
          arm_R=hand("R", 0.02, -0.04, 0.14, hint=(0.8, -0.8, 0.0)),
          arm_L=hand("L", 0.10, 0.44, 0.08, hint=(0.6, -0.2, -1.0)))
    # the step: lead foot slides forward while the fist travels
    Y.key(35, leg_L=foot("L", 0.14, 0.26), leg_R=foot("R", 0.20, -0.24))
    Y.key(46, ease="out", leg_L=foot("L", 0.13, 0.66))
    Y.key(52, ease="io", leg_R=foot("R", 0.20, -0.10, 0.03))
    # Ishigori takes it at 54 still in his guard; key him first so the fist can aim
    I.key(52, **guard(turn=-12))
    contact = 54
    cheek = I.face_point(contact, right=-0.17, up=0.24, fwd=0.20)
    Y.key(contact, ease="io3", hips=(0.0, 0.36, 0.66), body=body(8, 0, 16),
          torso=(6, 0, 4), chest=(6, 0, 14), head=(-8, 0, -6),
          arm_R=hand_world(cheek, hint=(0.0, 0.0, -1.0)),
          arm_L=hand("L", 0.18, 0.18, 0.12, hint=(0.6, -0.2, -1.0)))
    # hit-stop: hold the extension for three frames
    Y.key(contact + 3, ease="lin", arm_R=hand_world(cheek + Vector((0.0, -0.06, 0.0)),
                                                    hint=(0.0, 0.0, -1.0)))
    # Ishigori's head rolls with it (his left cheek: face turns to his right)
    I.key(contact + 2, ease="out5", head=(-4, 10, -38), chest=(-2, 4, -10),
          hips=(0.0, -0.06, 0.70))
    fist = follow(Y, "hand_R")
    c.key(33, eye=lambda f: fist(f) + Vector((-0.95, 0.35, -0.38)), target=fist)
    c.key(53, eye=lambda f: fist(f) + Vector((-0.9, 0.2, -0.34)), target=fist, ease="lin")
    fx.speedlines(c, 38, 53, density=55, alpha=0.5)
    # 54-57: WS on the landing, from beside the pair, low so the sky fills behind
    w = cam("S004", lens=30)
    mid = fixed(Vector((0.0, -0.62, 1.55)))
    w.key(54, eye=fixed((-2.25, -0.45, 1.05)), target=mid)
    w.key(57, eye=fixed((-2.15, -0.5, 1.07)), target=mid, ease="lin")
    fx.speedlines(w, 54, 57, density=50, alpha=0.6)
    fx.impact(contact, cheek, strength=1.0, cam=w, hitstop=3)
    fx.debris("S004-spit", cheek, contact, count=6, speed=0.05, direction=(1, 0, 0.2),
              size=0.05, life=12, color=(0.9, 0.9, 0.95), seed=11)


# --------------------------------------------------------------------------- S005
def s005(Y, I):
    """58-79: Ishigori grins through it and turns back; push in to his eye."""
    # Yuta stays in, fist still on the face, then draws back to guard
    Y.key(66, ease="io", arm_R=hand("R", 0.02, 0.50, 0.18, hint=(0.3, -0.2, -1.0)))
    g = guard()
    Y.key(79, ease="io", hips=(0.0, 0.26, 0.69), body=body(6, 0, -12), chest=(4, 0, -4),
          torso=(4, 0, 0), head=(-6, 0, 8), arm_R=g["arm_R"], arm_L=g["arm_L"],
          leg_R=foot("R", 0.20, -0.14))
    # he holds the turned head, then rolls it back to face Yuta, chin down, and loads
    I.key(64, ease="io", head=(-2, 8, -34))
    I.key(74, ease="io", head=(-14, 2, -6), chest=(4, 0, -4), hips=(0.0, 0.02, 0.69))
    I.key(79, ease="in", head=(-16, 0, -2), body=body(6, 0, -30), chest=(4, 0, -12),
          arm_R=hand("R", 0.04, -0.02, 0.12, hint=(0.8, -0.8, 0.0)))
    c = cam("S005", lens=50)
    face = lambda f: I.face_point(f, right=-0.08, up=0.3, fwd=0.2)
    c.key(58, eye=lambda f: face(f) + Vector((1.3, 0.55, -0.12)), target=face)
    c.key(66, eye=lambda f: face(f) + Vector((1.05, 0.5, -0.08)), target=face, ease="io")
    c.key(79, eye=lambda f: face(f) + Vector((0.7, 0.42, 0.0)), target=face, lens=85,
          ease="in")
    c.key(66, lens=55)


# --------------------------------------------------------------------------- S006
def s006(Y, I):
    """80-103: the counter lands on Yuta's face; the strobe."""
    contact = 82
    # Yuta: guard at contact, then his head is driven round and back
    g = guard()
    Y.key(contact, ease="io", head=(-6, 0, 6))
    Y.key(contact + 4, ease="out5", head=(12, -14, -40), chest=(-6, -4, -14),
          torso=(-4, 0, -4), hips=(0.0, 0.14, 0.67), body=body(-8, -4, -10))
    Y.key(103, ease="out", head=(20, -18, -58), chest=(-12, -6, -20), torso=(-6, 0, -6),
          hips=(0.0, 0.02, 0.60), body=body(-14, -6, -14),
          arm_R=hand("R", 0.0, 0.30, -0.10, hint=(1.0, -0.4, -0.4)),
          arm_L=hand("L", -0.10, 0.32, 0.02, hint=(1.0, -0.4, 0.0)))
    cheek = Y.face_point(contact, right=-0.17, up=0.24, fwd=0.2)
    I.key(contact, ease="out3", body=body(10, 0, 22), chest=(8, 0, 16), torso=(6, 0, 4),
          head=(-10, 0, 0), hips=(0.0, 0.18, 0.66),
          arm_R=hand_world(cheek, hint=(0.0, 0.0, -1.0)),
          leg_R=foot("R", 0.20, -0.12, 0.02))
    # drive through: the fist follows the face as it goes
    push = Y.face_point(95, right=-0.1, up=0.2, fwd=0.12)
    I.key(95, ease="io", arm_R=hand_world(push, hint=(0.0, 0.0, -1.0)),
          hips=(0.0, 0.26, 0.65), body=body(14, 0, 26))
    I.key(103, ease="io", arm_R=hand_world(Y.face_point(103, right=-0.05, up=0.2, fwd=0.05),
                                           hint=(0.0, 0.0, -1.0)))
    c = cam("S006", lens=38)
    hit = fixed(cheek)
    c.key(80, eye=fixed(cheek + Vector((0.62, -1.05, 0.12))), target=hit)
    c.key(103, eye=fixed(cheek + Vector((0.55, -0.85, 0.1))), target=fixed(push), ease="lin")
    W, B = fx.WHITE, fx.BLACK
    strobe = [(80, 0.95), (81, 0.85), (82, 0.5), (83, 0.35), (84, 0.7), (85, 0.72), (86, 0.65),
              (87, 0.0), (88, 0.95), (89, 0.8), (90, 0.45), (91, 0.3), (92, 0.72), (93, 0.72),
              (94, 0.65), (95, 0.95), (96, 0.75), (97, 0.4), (98, 0.3), (99, 0.7),
              (100, 0.72), (101, 0.72), (102, 0.6), (103, 0.0)]
    cols = [W, W, W, W, B, B, B, B, W, W, W, W, B, B, B, W, W, W, W, B, B, B, B, B]
    fx.flash(c, strobe, color=cols, name="STROBE-S006")
    fx.impact(contact, cheek, strength=2.0, cam=c, hitstop=0)
    c.shake(80, 103, amp=1.2, hz=13, decay=False, pos=0.02)
    fx.blood("S006-blood", lambda f: Y.face_point(f, right=0.05, up=0.12, fwd=0.2),
             contact + 2, count=10, direction=(-0.2, 1.0, 0.4), speed=0.08, life=18)


# --------------------------------------------------------------------------- S007
def s007(Y, I):
    """104-129: the exchange. I->Y carries on, Y->I left hook 114, I->Y left hook 122."""
    g = guard()
    # the counter is still buried in Yuta's face as the shot opens; he rides it, then
    # comes back round with a left hook
    held = Y.face_point(108, right=-0.08, up=0.2, fwd=0.08)
    I.key(108, ease="io", arm_R=hand_world(held, hint=(0.0, 0.0, -1.0)),
          hips=(0.0, 0.28, 0.64), body=body(14, 0, 28))
    Y.key(108, ease="io", head=(16, -16, -48), chest=(-10, -4, -16), body=body(-10, -4, -10),
          hips=(0.0, 0.02, 0.61))
    Y.key(111, ease="in", body=body(2, 0, 26), chest=(2, 0, 14), head=(-4, 0, 6),
          hips=(0.0, 0.06, 0.65),
          arm_L=hand("L", 0.0, 0.0, 0.12, hint=(0.9, -0.5, 0.2)),
          arm_R=hand("R", 0.18, 0.24, 0.12, hint=(0.6, -0.2, -1.0)))
    # Ishigori pulls the arm back into guard as the hook comes
    I.key(113, ease="io", **guard(turn=-14))
    I.key(113, head=(-8, 0, 4))
    hit1 = 114
    target = I.face_point(hit1, right=0.17, up=0.24, fwd=0.2)
    Y.key(hit1, ease="out3", body=body(8, 0, -20), chest=(6, 0, -18), torso=(6, 0, -6),
          hips=(0.0, 0.2, 0.66), head=(-8, 0, -6),
          arm_L=hand_world(target, hint=(0.0, 0.2, -1.0)))
    I.key(hit1 + 2, ease="out5", head=(0, -10, 36), chest=(-4, -4, 10),
          hips=(0.0, -0.08, 0.69), body=body(-4, -3, 6))
    I.key(hit1 + 5, ease="io", head=(-4, -6, 30))
    # Ishigori reloads with his left while Yuta's hook is still out
    I.key(119, ease="io", head=(-12, 0, 6), body=body(6, 0, 30), chest=(4, 0, 14),
          hips=(0.0, 0.0, 0.68),
          arm_L=hand("L", 0.02, -0.02, 0.12, hint=(0.9, -0.6, 0.2)))
    Y.key(119, ease="io", arm_L=hand("L", 0.10, 0.36, 0.14, hint=(0.6, -0.2, -1.0)),
          body=body(4, 0, -6), chest=(2, 0, -2), hips=(0.0, 0.14, 0.68))
    hit2 = 122
    yface = Y.face_point(hit2, right=0.17, up=0.24, fwd=0.2)
    I.key(hit2, ease="out3", body=body(10, 0, -26), chest=(6, 0, -16), torso=(6, 0, -4),
          hips=(0.0, 0.22, 0.65), head=(-10, 0, -4),
          arm_L=hand_world(yface, hint=(0.0, 0.2, -1.0)))
    Y.key(hit2 + 2, ease="out5", head=(14, 16, 44), chest=(-10, 6, 16), torso=(-6, 0, 6),
          body=body(-12, 6, 10), hips=(0.0, -0.05, 0.62),
          arm_R=hand("R", -0.05, 0.30, 0.0, hint=(1.0, -0.3, -0.2)),
          arm_L=hand("L", -0.2, 0.2, -0.2, hint=(1.0, -0.3, 0.0)))
    Y.key(129, ease="out", head=(18, 20, 52), chest=(-14, 8, 20), body=body(-16, 8, 14),
          hips=(0.0, -0.1, 0.56))
    I.key(129, ease="io", arm_L=hand_world(yface + Vector((0.2, 0.25, -0.1)), hint=(0.0, 0.2, -1.0)),
          hips=(0.0, 0.3, 0.64))
    # Yuta is shoved back a step by the hook
    Y.place(hit2, Y0, YUTA_YAW, ease="step")
    Y.place(129, Y0 + Vector((0.0, 0.35, 0.0)), YUTA_YAW, ease="out")
    # cameras: whip in from the sky, then two cut-ins
    a = ShotCam("S007a", 104, 114, 30)
    mid = Vector((0.0, -0.62, 1.5))
    a.key(104, eye=fixed((-2.7, -0.2, 1.05)), target=fixed(mid + Vector((-0.4, 0.6, 2.2))))
    a.key(106, eye=fixed((-2.7, -0.4, 1.1)), target=fixed(mid), ease="out3")
    a.key(114, eye=fixed((-2.55, -0.5, 1.12)), target=fixed(mid), ease="lin")
    a.shake(106, 113, amp=0.9, hz=12)
    b = ShotCam("S007b", 114, 122, 28)
    b.key(114, eye=fixed((-2.5, -1.15, 1.3)), target=fixed(mid))
    b.key(122, eye=fixed((-2.4, -1.05, 1.3)), target=fixed(mid + Vector((0.0, -0.1, 0.0))), ease="lin")
    c = ShotCam("S007c", 122, 130, 30)
    c.key(122, eye=fixed((2.3, -0.2, 1.15)), target=fixed(yface + Vector((0.0, -0.3, -0.1))))
    c.key(130, eye=fixed((2.2, 0.0, 1.1)), target=fixed(yface + Vector((0.0, 0.1, -0.15))), ease="lin")
    for s, f0, f1 in ((a, 104, 113), (b, 114, 121), (c, 122, 129)):
        fx.speedlines(s, f0, f1, density=48, alpha=0.45)
    fx.impact(hit1, target, strength=1.0, cam=b, hitstop=2)
    fx.impact(hit2, yface, strength=1.3, cam=c, hitstop=2)
    fx.flash(c, [(122, 0.6), (123, 0.25), (124, 0.0)])
    fx.blood("S007-blood", lambda f: Y.face_point(f, right=0.1, up=0.1, fwd=0.2), hit2 + 1,
             count=8, direction=(1.0, 0.4, 0.3), speed=0.07, life=16, seed=5)


# --------------------------------------------------------------------------- S008
def s008(Y, I):
    """130-149: at ankle height. Yuta's shoes skid back, Ishigori stomps in."""
    Y.key(131, ease="io", hips=(0.0, -0.05, 0.52), body=body(24, 0, 0), chest=(10, 0, 0),
          torso=(10, 0, 0), head=(-20, 0, 6),
          leg_R=foot("R", 0.20, -0.28), leg_L=foot("L", 0.16, 0.30),
          arm_R=hand("R", -0.15, 0.20, -0.45, hint=(0.8, -0.4, 0.0)),
          arm_L=hand("L", -0.2, 0.25, -0.5, hint=(0.8, -0.4, 0.0)))
    Y.place(130, Y0 + Vector((0.0, 0.35, 0.0)), YUTA_YAW)
    Y.place(139, Y0 + Vector((0.0, 1.05, 0.0)), YUTA_YAW, ease="out3")
    Y.key(149, ease="io", hips=(0.0, -0.05, 0.50))
    # Ishigori: lifts the right foot, stomps it down in front at 134
    I.key(130, ease="io", **guard(turn=-10))
    I.key(132, ease="io", leg_R=foot("R", 0.18, 0.05, 0.28, hint=(0.3, 1.0, 0.3)),
          hips=(0.0, 0.1, 0.72), body=body(10, 0, 0))
    I.key(134, ease="in3", leg_R=foot("R", 0.20, 0.42, 0.0), hips=(0.0, 0.3, 0.60),
          body=body(22, 0, 4), chest=(8, 0, 0), head=(-26, 0, 0),
          arm_R=hand("R", 0.0, 0.35, -0.35, hint=(0.8, -0.3, -0.2)),
          arm_L=hand("L", 0.0, 0.35, -0.35, hint=(0.8, -0.3, -0.2)))
    I.place(130, I0, ISHI_YAW)
    I.place(136, I0 + Vector((0.0, 0.62, 0.0)), ISHI_YAW, ease="io")
    I.key(144, ease="io", hips=(0.0, 0.2, 0.58))
    c = cam("S008", lens=22)
    c.key(130, eye=fixed((-0.95, 1.85, 0.1)), target=fixed((0.25, -0.35, 0.16)))
    c.key(149, eye=fixed((-0.95, 2.0, 0.1)), target=fixed((0.25, -0.25, 0.14)), ease="lin")
    stomp = Vector((0.2, -0.2, 0.02))
    fx.impact(134, stomp, strength=0.6, cam=c)
    fx.dust("S008-dust", stomp, 134, count=8, spread=0.9, size=0.35, direction=(0, 0, 1),
            life=18, color=(0.35, 0.55, 0.3), seed=8)


# --------------------------------------------------------------------------- S009
def s009(Y, I):
    """150-193: top-down. Yuta on one knee, Ishigori crouched; he springs at the lens."""
    Y.place(150, Vector((0.0, 1.3, 0.0)), YUTA_YAW)
    I.place(150, Vector((0.0, -0.8, 0.0)), ISHI_YAW)
    k = kneel(knee="R", lean=26, hand_down="R")
    Y.key(152, ease="io", **k)
    Y.key(152, head=(-34, 0, 0))
    breathe(Y, 152, 193, k["hips"], amp=0.018, period=16)
    Y.key(176, ease="io", head=(-14, 4, 6))
    s = squat_ready()
    I.key(152, ease="io", **s)
    breathe(I, 152, 180, s["hips"], amp=0.015, period=20)
    # anticipation, then he launches straight up at the camera
    I.key(184, ease="io", hips=(0.0, -0.1, 0.34), body=body(46, 0, 0), head=(-50, 0, 0))
    I.key(188, ease="out", hips=(0.0, 0.0, 0.9), body=body(-10, 0, 0), head=(-60, 0, 0),
          leg_R=leg_fk("R", 0.1, -0.3, 0.9, 20), leg_L=leg_fk("L", 0.1, -0.2, 0.95, 30),
          arm_R=arm_fk("R", 0.3, 0.6, -0.8, 40), arm_L=arm_fk("L", 0.4, 0.5, -0.8, 50))
    I.place(185, Vector((0.0, -0.8, 0.0)), ISHI_YAW, ease="step")
    I.place(193, Vector((0.0, 0.35, 2.6)), ISHI_YAW, ease="in")
    c = cam("S009", lens=30)
    top = Vector((0.0, 0.25, 0.35))
    c.key(150, eye=fixed(top + Vector((1.2, 0.3, 3.2))), target=fixed(top + Vector((0.6, 0.0, 0.0))),
          roll=130)
    c.key(155, eye=fixed(top + Vector((0.25, 0.1, 4.4))), target=fixed(top), roll=106, ease="out3")
    c.key(186, eye=fixed(top + Vector((0.2, 0.08, 4.2))), target=fixed(top), roll=96, ease="lin")
    c.key(193, eye=fixed(top + Vector((0.15, 0.06, 4.1))), target=fixed(top + Vector((0.0, 0.1, 1.0))),
          roll=82, ease="in")
    c.shake(186, 193, amp=1.6, hz=10, decay=False)


# --------------------------------------------------------------------------- S010
def s010(Y, I):
    """194-261: the burst throws Ishigori off; Yuta sinks into a horse stance and the
    cursed energy coils round him in pink and cyan."""
    Y.place(194, Vector((0.0, 0.8, 0.0)), YUTA_YAW)
    I.place(194, Vector((0.0, -11.5, 0.0)), ISHI_YAW)        # thrown off, behind camera
    I.key(194, ease="step", **squat_ready())
    st = stance_wide(depth=0.3)
    Y.key(194, ease="step", **st)
    Y.key(194, head=(-4, 0, 0))
    # power pulses: the chest opens and the hips sink on each surge
    for f, d in ((210, 0.33), (226, 0.30), (240, 0.34), (256, 0.31)):
        Y.key(f, ease="io", hips=(0.0, 0.0, 0.764 - d), chest=(-8 if d > 0.32 else -3, 0, 0),
              head=(-10 if d > 0.32 else -4, 0, 0))
    c = cam("S010", lens=26)
    tgt = Vector((0.0, 0.8, 0.95))
    c.key(194, eye=fixed((1.5, -3.6, 0.5)), target=fixed(tgt), roll=-5)
    c.key(261, eye=fixed((1.2, -3.0, 0.55)), target=fixed(tgt + Vector((0.0, 0.0, 0.05))),
          roll=-2, ease="lin")
    c.shake(194, 206, amp=1.4, hz=12)
    c.shake(228, 236, amp=0.6, hz=12)
    fx.flash(c, [(194, 1.0), (195, 1.0), (196, 0.8), (197, 0.6), (198, 0.35), (199, 0.15),
                 (200, 0.0)], color=[fx.WHITE, fx.WHITE, (0.85, 0.95, 1.0), (0.8, 0.9, 1.0),
                                     (0.9, 0.8, 1.0), (0.9, 0.8, 1.0), fx.WHITE])
    fx.impact(194, Vector((0.0, 0.0, 1.0)), strength=1.4, hitstop=0)
    coil(Y, 196, 261, seed=21)


def coil(Y, f0, f1, seed=0):
    """Pink and cyan arcs: long ones crawling over the roof toward Yuta, short ones
    snapping between the roof and his body, all redrawn as they jump."""
    rnd = random.Random(seed)
    c0 = Vector((0.0, 0.8, 0.0))
    for i in range(10):
        col = fx.PINK if i % 3 == 0 else fx.CYAN
        crawl = i < 5
        keys = []
        f = f0 + rnd.randint(0, 6)
        while f < f1:
            ang = rnd.uniform(0, 2 * math.pi)
            if crawl:
                r = rnd.uniform(3.0, 7.0)
                start = c0 + Vector((r * math.cos(ang), r * math.sin(ang), 0.05))
                end = c0 + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0.1, 0.9)))
                amp = rnd.uniform(0.5, 1.1)
            else:
                r = rnd.uniform(0.6, 1.6)
                start = c0 + Vector((r * math.cos(ang), r * math.sin(ang), 0.02))
                end = c0 + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0.6, 1.6)))
                amp = rnd.uniform(0.2, 0.45)
            keys.append((f, {"Start": start, "End": end, "Amplitude": amp}))
            f += rnd.randint(5, 11)
        fx.bolt("S010-bolt-%d" % i, keys[0][1]["Start"], keys[0][1]["End"], f0, f1,
                color=col, radius=0.03 if crawl else 0.018, amp=0.5,
                seed=rnd.random() * 50, keys=keys, strength=2.2)
    # the big strokes that cross the whole frame
    for i, (fa, fb, s, e, col) in enumerate((
            (201, 206, (-5.5, -3.0, 5.5), (1.5, 0.0, 0.0), fx.CYAN),
            (228, 233, (-3.6, -0.8, 6.8), (-1.2, -1.5, 0.0), fx.CYAN),
            (237, 243, (0.1, 0.9, 1.3), (0.2, -0.5, 0.0), fx.PINK),
            (250, 257, (6.5, 0.5, 0.2), (-0.2, 0.7, 0.5), fx.CYAN))):
        fx.bolt("S010-stroke-%d" % i, s, e, fa, fb, color=col, radius=0.05, amp=1.0,
                seed=i * 7.3, strength=3.0)


# --------------------------------------------------------------------------- S011
def s011(Y, I):
    """262-297: CU from below; the energy lines slide across the lens."""
    Y.key(262, ease="io", head=(-18, 0, 0))
    Y.key(297, ease="io", head=(-22, 2, -3), hips=(0.0, 0.0, 0.43))
    c = cam("S011", lens=35)
    head = follow(Y, "head", (0.0, 0.0, -0.05), frame=262)
    c.key(262, eye=lambda f: head(f) + Vector((0.55, -1.25, -0.6)), target=head)
    c.key(297, eye=lambda f: head(f) + Vector((0.45, -1.05, -0.5)), target=head, ease="lin")
    h = head(262)
    for i, (dx, col) in enumerate(((-0.25, fx.CYAN), (0.05, fx.PINK), (0.22, fx.CYAN))):
        s = h + Vector((0.9, -0.35 + dx, -0.5))
        e = h + Vector((-0.8, -0.45 + dx, 0.2))
        fx.bolt("S011-lens-%d" % i, s, e, 262, 297, color=col, radius=0.01, amp=0.12,
                seed=30 + i, strength=1.6,
                keys=[(262, {"Start": s, "End": e}),
                      (297, {"Start": s + Vector((0, 0, 0.12)), "End": e + Vector((0, 0, 0.08))})])


# --------------------------------------------------------------------------- S012
def s012(Y, I):
    """298-305: the dash. Ishigori, braced, is hit at 303 in a blue burst."""
    target_pos = Vector((0.0, -9.6, 0.0))
    I.place(297, target_pos, ISHI_YAW)
    I.key(297, ease="step", hips=(0.0, 0.0, 0.62), body=body(8, 0, 0), chest=(6, 0, 0),
          torso=(4, 0, 0), head=(-14, 0, 0),
          arm_R=hand("R", 0.34, 0.26, 0.2, hint=(0.8, -0.3, -0.6)),
          arm_L=hand("L", 0.34, 0.32, 0.12, hint=(0.8, -0.3, -0.6)),
          leg_R=foot("R", 0.24, -0.2), leg_L=foot("L", 0.2, 0.25))
    Y.place(298, Vector((0.0, 0.8, 0.0)), YUTA_YAW)
    Y.key(298, ease="io", hips=(0.0, -0.05, 0.40), body=body(40, 0, 0), chest=(10, 0, 0),
          head=(-40, 0, 0))
    Y.key(300, ease="io", hips=(0.0, 0.0, 0.62), body=body(52, 0, -20), chest=(8, 0, -14),
          arm_R=hand("R", 0.02, -0.1, 0.05, hint=(0.8, -0.8, 0.0)),
          arm_L=hand("L", 0.15, 0.4, 0.0, hint=(0.6, -0.3, -1.0)),
          leg_R=leg_fk("R", 0.05, -0.8, 0.6, 30), leg_L=leg_fk("L", 0.05, 0.7, 0.7, 70))
    Y.place(299, Vector((0.0, 0.8, 0.0)), YUTA_YAW, ease="step")
    Y.place(303, target_pos + Vector((0.0, 1.05, 0.0)), YUTA_YAW, ease="in")
    guard_pt = I.landmarks(303)["hand_L"] + Vector((0.0, 0.06, 0.04))
    Y.key(303, ease="out3", hips=(0.0, 0.2, 0.66), body=body(14, 0, 18), chest=(6, 0, 14),
          head=(-10, 0, 0), arm_R=hand_world(guard_pt, hint=(0.0, 0.0, -1.0)),
          leg_R=foot("R", 0.22, -0.3), leg_L=foot("L", 0.14, 0.5))
    I.key(304, ease="out5", hips=(0.0, -0.12, 0.60), body=body(-4, 0, 0), head=(-4, 0, 0))
    c = cam("S012", lens=24)
    chest = I.landmarks(300)["chest"]
    c.key(298, eye=fixed(chest + Vector((0.95, 0.95, 0.35))), target=fixed(chest + Vector((0.0, 0.4, 0.3))))
    c.key(305, eye=fixed(chest + Vector((0.85, 0.6, 0.35))), target=fixed(chest), ease="in")
    fx.flash(c, [(303, 0.9), (304, 0.75), (305, 0.4)], color=(0.45, 0.85, 1.0))
    fx.impact(303, guard_pt, strength=1.8, cam=c, hitstop=0)
