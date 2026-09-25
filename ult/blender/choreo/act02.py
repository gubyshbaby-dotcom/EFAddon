"""Act 2 (frames 306-489): blown across the city, the Granite Blast, the crash through the
glass roof.

Sets (see ult.domain): the turf roof is z = 0; the pink block's east face is the plane
x = -29; the glass office roof is walked at z = 13 with its west edge at x = 14; the
atrium roof to its north is walked at z = -5.

Yuta's flight in S013-S016 is one ballistic arc: up off the turf roof past the high
camera, over the street and into the pink block's upper floors at frame 370.
"""

import math

from mathutils import Vector

from .. import fx
from ..camera import ShotCam, fixed, follow
from ..poses import (arm_fk, body, flying_back, foot, guard, hand, hand_world, leg_fk,
                     run_cycle)
from . import cam

GLASS_ROOF_Z = 13.0
EDGE_X = 15.3
PINK_FACE_X = -29.0
IMPACT = Vector((-29.25, -6.0, 4.0))


def yaw_to(src, dst):
    """Yaw (deg) that faces from src toward dst; 0 = +Y, CCW positive."""
    d = Vector(dst) - Vector(src)
    return math.degrees(math.atan2(-d.x, d.y))


def stage(cast):
    Y, I = cast["yuta"], cast["ishigori"]
    s013(Y, I)
    s014(Y, I)
    s016(Y, I)
    s017(Y, I)
    s018(Y, I)
    s019(Y, I)
    s020(Y, I)
    s022(Y, I)
    s023(Y, I)


# --------------------------------------------------------------------------- S013
FLIGHT = [
    (327, Vector((0.0, -8.55, 0.1))),
    (330, Vector((-3.6, -9.3, 2.8))),
    (333, Vector((-9.9, -10.1, 7.1))),
    (336, Vector((-13.0, -10.2, 8.4))),
    (342, Vector((-15.5, -9.6, 8.6))),
    (352, Vector((-19.8, -8.0, 7.1))),
    (361, Vector((-24.6, -7.0, 5.9))),
    (365, Vector((-26.9, -6.5, 5.0))),
    (370, IMPACT),
]


def s013(Y, I):
    """306-341: the strike is caught in a shock ring; the hook blows Yuta at the lens."""
    ip = Vector((0.0, -9.6, 0.0))
    # Yuta presses into the guard, feet skating
    Y.place(306, Vector((0.0, -8.55, 0.0)), 180.0)
    Y.key(306, ease="io", hips=(0.0, 0.18, 0.62), body=body(18, 0, 16), chest=(8, 0, 12),
          head=(-14, 0, 0), leg_R=foot("R", 0.22, -0.42), leg_L=foot("L", 0.14, 0.42))
    Y.shake(306, 324, amp=2.5, hz=14, decay=False)
    I.shake(306, 320, amp=1.5, hz=14, decay=False)
    # Ishigori opens the guard and throws the right hook at 326
    I.key(318, ease="io", hips=(0.0, -0.1, 0.62), body=body(2, 0, -30), chest=(2, 0, -12),
          arm_R=hand("R", 0.04, -0.04, 0.1, hint=(0.9, -0.6, 0.2)),
          arm_L=hand("L", 0.2, 0.3, 0.1, hint=(0.8, -0.3, -0.6)))
    Y.key(322, ease="io", arm_R=hand("R", 0.1, 0.45, 0.1, hint=(0.5, -0.3, -1.0)))
    hit = 326
    temple = Y.face_point(hit, right=-0.2, up=0.26, fwd=0.05)
    I.key(hit, ease="out3", hips=(0.0, 0.16, 0.64), body=body(10, 0, 30), chest=(8, 0, 18),
          head=(-10, 0, -4), arm_R=hand_world(temple, hint=(0.2, 0.0, -1.0)))
    I.key(hit + 6, ease="io", arm_R=hand("R", -0.3, 0.45, 0.05, hint=(0.6, -0.3, -1.0)),
          body=body(8, 0, 40), chest=(6, 0, 20))
    I.key(341, ease="io", **guard(turn=-10))
    # launched: yaw swings so he flies back-first to the west
    Y.place(hit, FLIGHT[0][1], 180.0, ease="step")
    Y.place(hit + 1, FLIGHT[0][1], -90.0, ease="step")
    for f, p in FLIGHT[1:]:
        Y.place(f, p, -90.0, ease="lin" if f > 330 else "out")
    Y.key(hit + 1, ease="out5", **flying_back(tumble=20))
    Y.key(hit + 1, head=(40, 10, 20))
    c = cam("S013", lens=24)
    tgt = fixed(Vector((-0.6, -9.4, 0.8)))
    c.key(306, eye=fixed((-12.4, -10.6, 9.3)), target=tgt)
    c.key(341, eye=fixed((-12.2, -10.5, 9.2)), target=fixed(Vector((-1.2, -9.4, 1.0))), ease="lin")
    strike = ip + Vector((0.0, 0.45, 1.25))
    fx.burst("S013-burst", strike, 311, 318, radius=1.1, color=(0.35, 0.9, 1.0), strength=2.5)
    fx.ring("S013-ring", ip + Vector((0.0, 0.0, 1.0)), (0, 0, 1), 312, 340, r0=0.2, r1=1.6,
            thick=0.08, color=(0.55, 1.0, 0.85), strength=5.0)
    fx.impact(312, strike, strength=1.2, cam=c)
    fx.impact(hit, temple, strength=1.6, cam=c, hitstop=0)
    fx.dust("S013-kick", ip + Vector((0.0, 0.5, 0.05)), hit, count=8, spread=1.4, size=0.5,
            direction=(-1, 0, 0.4), life=20, color=(0.3, 0.5, 0.28), seed=13)


# --------------------------------------------------------------------------- S014/S015
def s014(Y, I):
    """342-365: close on Yuta in flight; blood whips off his face; then a speck in the sky."""
    # arms thrown wide so the face reads, jaw clenched against the wind
    Y.key(342, ease="io", **flying_back(tumble=10))
    Y.key(342, arm_R=arm_fk("R", 1.0, 0.25, -0.35, 25), arm_L=arm_fk("L", 1.0, 0.1, -0.2, 40),
          head=(34, 10, 22))
    Y.key(352, ease="io", arm_R=arm_fk("R", 1.0, 0.35, -0.45, 35), arm_L=arm_fk("L", 1.0, 0.2, -0.3, 55))
    Y.key(361, ease="lin", body=body(-100, 8, 0), head=(46, 8, 20))
    c = cam("S014", lens=34)
    head = follow(Y, "head")
    c.key(342, eye=lambda f: head(f) + Vector((1.1, -0.55, 0.45)), target=head, roll=-12)
    c.key(361, eye=lambda f: head(f) + Vector((1.0, -0.5, 0.42)), target=head, roll=-6, ease="lin")
    c.shake(342, 361, amp=0.5, hz=7, decay=False, pos=0.01)
    fx.speedlines(c, 342, 361, depth=5.0, density=55, alpha=0.4)
    fx.blood("S014-nose", lambda f: Y.face_point(f, right=0.0, up=0.12, fwd=0.26), 350,
             count=9, direction=(1.0, 0.3, 0.6), speed=0.09, life=16, seed=14)
    w = cam("S015", lens=60)
    w.key(362, eye=fixed((-17.5, -33.0, 9.5)), target=fixed((-26.0, -6.6, 5.4)))
    w.key(365, eye=fixed((-17.5, -33.0, 9.5)), target=fixed((-26.8, -6.4, 5.1)), ease="lin")


# --------------------------------------------------------------------------- S016
def s016(Y, I):
    """366-385: up the pink facade; he hits at 370 and the wall blows out."""
    Y.key(369, ease="io", body=body(-88, 0, 0))
    Y.key(371, ease="out5", body=body(-80, 0, 0), head=(20, 0, 0),
          arm_R=arm_fk("R", 1.0, 0.2, -0.2, 20), arm_L=arm_fk("L", 1.0, 0.25, -0.1, 25),
          leg_R=leg_fk("R", 0.3, 0.5, 0.7, 30), leg_L=leg_fk("L", 0.25, 0.4, 0.85, 20))
    Y.place(372, IMPACT + Vector((-0.35, 0.0, 0.0)), -90.0, ease="out")
    Y.place(385, IMPACT + Vector((-0.4, 0.0, -0.15)), -90.0, ease="io")
    c = cam("S016", lens=24)
    c.key(366, eye=fixed((-19.0, -13.5, -22.6)), target=fixed(IMPACT + Vector((0.5, 0.0, -1.5))),
          roll=-9)
    c.key(385, eye=fixed((-19.2, -13.3, -22.6)), target=fixed(IMPACT + Vector((0.6, 0.0, -1.0))),
          roll=-9, ease="lin")
    fx.impact(370, IMPACT, strength=1.5, cam=c, hitstop=2)
    fx.dust("S016-dust", IMPACT + Vector((0.4, 0.0, 0.2)), 370, count=20, spread=5.0,
            size=2.4, direction=(1, 0.1, 0.5), life=34, color=(0.78, 0.7, 0.66), seed=16)
    fx.debris("S016-chunks", IMPACT + Vector((0.3, 0.0, 0.0)), 370, count=18, speed=0.3,
              direction=(1, 0, 0.35), cone=0.7, size=0.4, life=36,
              color=(0.86, 0.56, 0.6), seed=17)


# --------------------------------------------------------------------------- S017/S018
def s017(Y, I):
    """386-403: tilted wide, running the glass roof edge."""
    Y.place(386, Vector((EDGE_X, -10.2, GLASS_ROOF_Z)), 0.0)
    Y.place(403, Vector((EDGE_X, -3.2, GLASS_ROOF_Z)), 0.0, ease="lin")
    Y.key(386, ease="step", torso=(6, 0, 0), chest=(4, 0, 0), head=(-10, 0, 0), tool_R=(0, 0, 0))
    run_cycle(Y, 386, 404, stride_frames=10, lean=20, arms="pump")
    c = cam("S017", lens=30)
    c.key(386, eye=fixed((7.4, -17.5, 17.8)), target=fixed((EDGE_X, -7.2, GLASS_ROOF_Z + 0.9)), roll=18)
    c.key(403, eye=fixed((7.6, -16.8, 17.8)), target=fixed((EDGE_X, -4.5, GLASS_ROOF_Z + 0.9)), roll=18,
          ease="lin")
    # Ishigori has come round to the atrium roof to the north, and loads the blast
    I.place(386, BEAM_FROM_FEET, -90.0)
    I.key(386, ease="step", hips=(0.0, 0.0, 0.66), body=body(4, 0, 0), chest=(0, 0, 0),
          head=(-18, 0, 0), leg_R=foot("R", 0.28, -0.2), leg_L=foot("L", 0.22, 0.3),
          arm_R=hand("R", 0.2, 0.1, -0.1, hint=(0.8, -0.4, -0.3)),
          arm_L=hand("L", 0.2, 0.1, -0.1, hint=(0.8, -0.4, -0.3)))


BEAM_FROM_FEET = Vector((-31.5, -7.5, 9.0))
BEAM_FROM = BEAM_FROM_FEET + Vector((0.55, 0.0, 1.2))
BEAM_PASS = Vector((16.3, -6.2, 14.6))


def s018(Y, I):
    """404-425: arms out on the edge; the Granite Blast tears past just behind him."""
    Y.place(404, Vector((EDGE_X, -3.2, GLASS_ROOF_Z)), 0.0)
    Y.place(425, Vector((EDGE_X, 2.4, GLASS_ROOF_Z)), 0.0, ease="out")
    run_cycle(Y, 404, 425, stride_frames=12, lean=10, arms="spread", phase=1)
    # the blast goes past at 406: he ducks away from it and staggers
    Y.key(407, ease="out3", chest=(10, 14, -8), head=(-6, 10, -25))
    Y.key(416, ease="io", chest=(4, 6, -4), head=(-8, 4, -12))
    # Ishigori fires both hands forward
    I.key(403, ease="io", arm_R=hand("R", 0.12, 0.5, 0.05, hint=(0.8, -0.3, -0.6)),
          arm_L=hand("L", 0.12, 0.5, 0.05, hint=(0.8, -0.3, -0.6)), body=body(10, 0, 0),
          head=(-24, 0, 0))
    I.key(406, ease="out5", hips=(0.0, -0.18, 0.6), body=body(-4, 0, 0))
    far = BEAM_FROM + (BEAM_PASS - BEAM_FROM) * 3.0
    fx.beam("S018-blast", BEAM_FROM, far, 404, 407, 440, width=1.0, f_fade=430)
    c = cam("S018", lens=30)
    chest = follow(Y, "chest")
    c.key(404, eye=lambda f: chest(f) + Vector((-0.95, 2.55, 0.15)), target=chest)
    c.key(425, eye=lambda f: chest(f) + Vector((-0.8, 2.2, 0.12)), target=chest, ease="lin")
    fx.impact(406, BEAM_PASS, strength=1.0, cam=c)
    fx.flash(c, [(406, 0.75), (407, 0.45), (408, 0.2), (409, 0.0)], color=(0.8, 0.95, 1.0))


# --------------------------------------------------------------------------- S019-S021
def s019(Y, I):
    """426-437: behind his head; he snaps round toward the blast's source."""
    Y.key(426, ease="io", hips=(0.0, 0.0, 0.7), body=body(6, 0, 0), chest=(4, 4, 0),
          head=(-4, 0, -10), leg_R=foot("R", 0.2, -0.15), leg_L=foot("L", 0.18, 0.25),
          arm_R=hand("R", -0.2, 0.1, -0.45, hint=(0.8, -0.4, 0.0)),
          arm_L=hand("L", -0.2, 0.1, -0.45, hint=(0.8, -0.4, 0.0)))
    Y.key(431, ease="io", head=(-6, 0, -16))
    Y.key(435, ease="out3", head=(-12, 0, 58), chest=(4, 0, 18))
    c = cam("S019", lens=40)
    head = follow(Y, "head", frame=426)
    c.key(426, eye=lambda f: head(f) + Vector((0.35, -1.5, 0.05)), target=lambda f: head(f) + Vector((0.0, 0.8, 0.1)))
    c.key(437, eye=lambda f: head(f) + Vector((0.3, -1.25, 0.05)), target=lambda f: head(f) + Vector((0.1, 0.8, 0.1)),
          ease="lin")


LEAP = [(438, Vector((7.0, -1.5, 18.0))), (446, Vector((10.6, 0.4, 16.8))),
        (453, Vector((13.2, 1.6, 15.6))), (459, Vector((14.5, 2.2, 14.5))),
        (461, Vector((14.9, 2.4, 14.0)))]


def s020(Y, I):
    """438-459: Ishigori in the air coming at him, fist cocked; the fist into the lens."""
    ypos = Vector((EDGE_X, 2.4, GLASS_ROOF_Z))
    for f, p in LEAP:
        I.place(f, p, yaw_to(p, ypos), ease="step" if f == 438 else "lin")
    I.key(438, ease="step", hips=(0.0, 0.0, 0.8), body=body(-8, 0, 12), chest=(-6, 0, -10),
          torso=(-4, 0, 0), head=(-8, 0, 6),
          arm_R=arm_fk("R", 0.55, -0.35, -0.75, 110, elbow=(0.3, -1.0, 0.4)),
          arm_L=arm_fk("L", 0.75, 0.6, 0.1, 30),
          leg_R=leg_fk("R", 0.15, 0.5, 0.8, 95), leg_L=leg_fk("L", 0.12, -0.1, 1.0, 60))
    I.key(452, ease="io", body=body(4, 0, 24), chest=(4, 0, -16),
          arm_R=arm_fk("R", 0.6, -0.55, -0.55, 120, elbow=(0.3, -1.0, 0.5)))
    # the punch at the lens: straight down the line to Yuta's face
    face = Y.face_point(459, right=0.0, up=0.2, fwd=0.3)
    I.key(458, ease="out5", body=body(24, 0, -20), chest=(10, 0, 18), head=(-18, 0, -6),
          arm_R=hand_world(face, hint=(0.3, 0.0, -1.0)),
          arm_L=arm_fk("L", 0.8, -0.3, 0.2, 40))
    Y.key(438, ease="io", head=(-14, 0, -46), chest=(2, 0, -14), hips=(0.0, -0.05, 0.66))
    Y.key(456, ease="io", arm_R=hand("R", 0.3, 0.3, 0.25, hint=(0.6, -0.3, -1.0)),
          arm_L=hand("L", 0.3, 0.3, 0.3, hint=(0.6, -0.3, -1.0)), head=(-20, 0, -40))
    c = cam("S020", lens=30)
    eye0 = Y.landmarks(438)["head"] + Vector((-0.35, -0.55, 0.25))
    tgt = follow(I, "chest")
    c.key(438, eye=fixed(eye0), target=tgt)
    c.key(453, eye=fixed(eye0 + Vector((0.1, 0.25, 0.0))), target=tgt, lens=40, ease="in")
    fx.speedlines(c, 438, 453, radial=True, depth=9.0, density=70, alpha=0.35)
    # S021: tight on his face, then the fist fills the frame
    e = cam("S021", lens=35)
    ihead = follow(I, "head")
    e.key(454, eye=lambda f: ihead(f) + (Y.landmarks(454)["head"] - ihead(f)).normalized() * 1.2,
          target=ihead)
    e.key(459, eye=fixed(face + Vector((0.0, 0.0, 0.05))), target=follow(I, "hand_R"), ease="in")
    e.shake(456, 459, amp=1.5, hz=12, decay=False)


# --------------------------------------------------------------------------- S022/S023
def s022(Y, I):
    """460-471: from the side, he's driven into the roof and it erupts."""
    roof = Vector((EDGE_X + 0.3, 2.9, GLASS_ROOF_Z))
    Y.key(460, ease="out5", hips=(0.0, -0.1, 0.62), body=body(-34, 0, 0), chest=(-16, 0, 0),
          head=(26, 0, 0), arm_R=arm_fk("R", 0.8, 0.2, -0.7, 30), arm_L=arm_fk("L", 0.8, 0.3, -0.6, 40),
          leg_R=foot("R", 0.2, 0.2), leg_L=foot("L", 0.2, 0.35))
    Y.key(464, ease="io", hips=(0.0, -0.25, 0.4), body=body(-60, 0, 0))
    Y.place(460, Vector((EDGE_X, 2.4, GLASS_ROOF_Z)), 0.0)
    Y.place(465, Vector((EDGE_X, 2.6, GLASS_ROOF_Z - 0.4)), 0.0, ease="in")
    Y.place(471, Vector((EDGE_X, 2.7, GLASS_ROOF_Z - 3.5)), 0.0, ease="in")
    I.place(461, LEAP[-1][1], -90.0, ease="step")
    I.place(465, roof + Vector((0.2, 0.6, 1.0)), -90.0, ease="in")
    I.place(471, roof + Vector((0.2, 0.7, -2.2)), -90.0, ease="in")
    I.key(462, ease="io", body=body(60, 0, 0), chest=(12, 0, 0), head=(-40, 0, 0),
          arm_R=arm_fk("R", 0.15, 0.7, 0.75, 5), arm_L=arm_fk("L", 0.9, -0.1, 0.1, 30),
          leg_R=leg_fk("R", 0.1, -0.6, 0.8, 40), leg_L=leg_fk("L", 0.15, -0.3, 0.9, 70))
    c = cam("S022", lens=28)
    c.key(460, eye=fixed((6.0, 14.0, 16.5)), target=fixed(roof + Vector((0.0, 0.0, 0.8))))
    c.key(471, eye=fixed((6.2, 14.1, 16.3)), target=fixed(roof + Vector((0.0, 0.0, 0.2))), ease="lin")
    fx.impact(465, roof, strength=2.0, cam=c, hitstop=0)
    fx.flash(c, [(465, 0.7), (466, 0.35), (467, 0.0)])
    fx.debris("S022-roof", roof + Vector((0.0, 0.0, 0.1)), 465, count=30, speed=0.32,
              direction=(0, 0, 1), cone=0.9, size=0.45, life=30, color=(0.08, 0.09, 0.12), seed=22)
    fx.debris("S022-glass", roof + Vector((0.0, 0.0, 0.1)), 465, count=16, speed=0.25,
              direction=(-0.4, 0, 1), cone=1.0, size=0.25, life=26, color=(0.6, 0.75, 0.9), seed=23)
    fx.dust("S022-dust", roof, 466, count=12, spread=3.0, size=1.4, direction=(0, 0, 1),
            life=30, color=(0.35, 0.36, 0.4), seed=24)


def s023(Y, I):
    """472-489: the west facade; cracks race down floor after floor."""
    Y.place(472, Vector((EDGE_X + 1.0, 2.6, -3.9)), 0.0)
    I.place(472, Vector((EDGE_X + 1.3, 3.2, -2.5)), -90.0)
    c = cam("S023", lens=32)
    c.key(472, eye=fixed((-5.5, 1.0, 5.2)), target=fixed((14.0, 0.5, 4.2)))
    c.key(489, eye=fixed((-5.5, 1.0, 5.1)), target=fixed((14.0, 0.5, 4.0)), ease="lin")
    fx.cracks("S023-cracks", Vector((13.97, 1.0, 12.4)), (0, -1, 0), (0, 0, 1), 472, 489,
              width=11.0, height=16.0)
    for i, f in enumerate((474, 479, 484)):
        fx.impact(f, Vector((14.5, 2.0, 12.0 - 4.0 * (i + 1))), strength=0.6, cam=c)
