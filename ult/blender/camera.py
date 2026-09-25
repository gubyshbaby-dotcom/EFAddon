"""One Blender camera per shot, in the form the addon's VIX exporter reads.

Each camera carries ef_start / ef_end (inclusive frame range it owns) and ef_name, so
File > Export > VIX Camera Shot writes one VIX json per shot plus the manifest that
switches between them. A timeline marker bound to each camera makes the Blender
viewport cut the same way when played.

Eye, target, lens and roll are keyed like actor channels (motion.Track) and may follow
an actor: pass a callable f -> Vector (see `follow`). Shake is smooth noise on pitch/yaw
(and optionally position), with an envelope, added at bake time. Everything is baked
per frame and reduced, so the VIX file carries exactly what Blender shows.
"""

from __future__ import annotations

import math
import random

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from .motion import EASE, _dp, _ensure_action, _write_curve

CAMERAS = []


def follow(actor, landmark="head", offset=(0.0, 0.0, 0.0), frame=None):
    """A target that tracks an actor landmark. `frame` pins it to one frame."""
    off = Vector(offset)

    def fn(f):
        lm = actor.landmarks(frame if frame is not None else f)
        return lm[landmark] + off
    return fn


def fixed(v):
    v = Vector(v)
    return lambda f: v


def around(center, heading_deg, az, el, dist):
    """Eye position on a sphere around `center` (Vector or callable). az is measured
    from `heading_deg` (the subject's facing yaw; 0 = in front of it), el up from
    horizontal."""
    def fn(f):
        c = center(f) if callable(center) else Vector(center)
        a = math.radians(heading_deg + az)
        e = math.radians(el)
        # facing yaw 0 = +Y; "in front of" a subject facing +Y is +Y
        d = Vector((-math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        return c + d * dist
    return fn


class _Chan:
    """Track of callables f -> value."""

    def __init__(self):
        self.frames, self.values, self.eases = [], [], []

    def add(self, f, v, ease):
        fn = v if callable(v) else (lambda f, v=v: v)
        i = 0
        while i < len(self.frames) and self.frames[i] < f:
            i += 1
        if i < len(self.frames) and self.frames[i] == f:
            self.values[i], self.eases[i] = fn, ease
        else:
            self.frames.insert(i, f)
            self.values.insert(i, fn)
            self.eases.insert(i, ease)

    def at(self, f, lerp):
        n = len(self.frames)
        if n == 0:
            return None
        if f <= self.frames[0]:
            return self.values[0](f)
        if f >= self.frames[-1]:
            return self.values[-1](f)
        i = 1
        while self.frames[i] < f:
            i += 1
        f0, f1 = self.frames[i - 1], self.frames[i]
        u = EASE[self.eases[i]]((f - f0) / (f1 - f0))
        return lerp(self.values[i - 1](f), self.values[i](f), u)


def _vlerp(a, b, u):
    return Vector(a).lerp(Vector(b), u)


def _flerp(a, b, u):
    return a + (b - a) * u


class ShotCam:
    def __init__(self, name, f0, f1, lens=35.0, collection="Cameras"):
        self.name, self.f0, self.f1 = name, int(f0), int(f1)
        data = bpy.data.cameras.new("CAM_" + name)
        data.lens = lens
        data.sensor_width = 36.0
        data.clip_start = 0.05
        data.clip_end = 600.0
        obj = bpy.data.objects.new("CAM_" + name, data)
        col = bpy.data.collections.get(collection)
        if col is None:
            col = bpy.data.collections.new(collection)
            bpy.context.scene.collection.children.link(col)
        col.objects.link(obj)
        obj["ef_start"] = self.f0
        obj["ef_end"] = self.f1
        obj["ef_name"] = name
        obj.rotation_mode = "QUATERNION"
        self.obj = obj
        self.eye, self.tgt, self.roll, self.lens = _Chan(), _Chan(), _Chan(), _Chan()
        self.lens.add(self.f0, float(lens), "lin")
        self.roll.add(self.f0, 0.0, "lin")
        self.shakes = []
        self.dolly_zoom = None
        CAMERAS.append(self)

    def key(self, f, eye=None, target=None, lens=None, roll=None, ease="io"):
        if eye is not None:
            self.eye.add(f, eye, ease)
        if target is not None:
            self.tgt.add(f, target, ease)
        if lens is not None:
            self.lens.add(f, float(lens), ease)
        if roll is not None:
            self.roll.add(f, float(roll), ease)
        return self

    def shake(self, f0, f1, amp=1.5, hz=9.0, decay=True, pos=0.0, seed=None):
        """Rotational shake in degrees (and positional in blocks) over [f0, f1]."""
        self.shakes.append((f0, f1, amp, hz, decay, pos,
                            seed if seed is not None else len(self.shakes) * 13 + self.f0))
        return self

    def matrix(self, f):
        eye = self.eye.at(f, _vlerp)
        tgt = self.tgt.at(f, _vlerp)
        roll = self.roll.at(f, _flerp) or 0.0
        d = tgt - eye
        if d.length < 1e-6:
            d = Vector((0.0, 1.0, 0.0))
        q = d.to_track_quat("-Z", "Y")
        q = q @ Quaternion((0.0, 0.0, 1.0), math.radians(roll))
        rot = q.to_matrix()
        pitch = yaw = 0.0
        dpos = Vector()
        for f0, f1, amp, hz, decay, pos, seed in self.shakes:
            if f0 <= f <= f1:
                t = (f - f0) / 30.0
                env = (1.0 - (f - f0) / max(1.0, f1 - f0 + 1)) ** 1.5 if decay else 1.0
                rnd = random.Random(seed)
                ph = [rnd.uniform(0, 6.283) for _ in range(6)]
                w = 2 * math.pi * hz
                pitch += amp * env * (0.6 * math.sin(w * t + ph[0]) + 0.4 * math.sin(2.3 * w * t + ph[1]))
                yaw += amp * env * (0.6 * math.sin(1.1 * w * t + ph[2]) + 0.4 * math.sin(2.7 * w * t + ph[3]))
                if pos:
                    dpos += Vector((math.sin(w * t + ph[4]), 0.0, math.sin(1.3 * w * t + ph[5]))) * pos * env
        if pitch or yaw:
            rot = rot @ Euler((math.radians(pitch), math.radians(yaw), 0.0)).to_matrix()
        m = rot.to_4x4()
        m.translation = eye + rot @ dpos
        return m

    def bake(self):
        obj = self.obj
        frames = list(range(self.f0, self.f1 + 1))
        locs, quats, lenses = [], [], []
        for f in frames:
            m = self.matrix(f)
            q = m.to_quaternion()
            if quats and Quaternion(quats[-1]).dot(q) < 0:
                q = -q
            locs.append(tuple(m.translation))
            quats.append(tuple(q))
            lenses.append((self.lens.at(f, _flerp),))
        act = _ensure_action(obj, "CAM-" + self.name)
        for path, rows, tol in (("location", locs, 0.001), ("rotation_quaternion", quats, 0.0004)):
            idx = _dp(rows, tol)
            for i in range(len(rows[0])):
                _write_curve(act, path, i, "Camera", [frames[j] for j in idx],
                             [rows[j][i] for j in idx])
        # lens lives on the camera data
        dact = _ensure_action(obj.data, "CAMDATA-" + self.name)
        idx = _dp(lenses, 0.05)
        _write_curve(dact, "lens", 0, "Lens", [frames[j] for j in idx], [lenses[j][0] for j in idx])
        # park the camera on its first frame for anyone looking at it in the viewport
        m = self.matrix(self.f0)
        obj.location = m.translation
        obj.rotation_quaternion = m.to_quaternion()


def bake_all(scene=None):
    scene = scene or bpy.context.scene
    for m in list(scene.timeline_markers):
        if m.name.startswith("SHOT "):
            scene.timeline_markers.remove(m)
    for c in CAMERAS:
        c.bake()
        mk = scene.timeline_markers.new("SHOT " + c.name, frame=c.f0)
        mk.camera = c.obj
    if CAMERAS:
        scene.camera = CAMERAS[0].obj


def camera_at(f):
    """The shot camera that owns frame f (last declared wins ties)."""
    got = None
    for c in CAMERAS:
        if c.f0 <= f <= c.f1:
            got = c
    return got
