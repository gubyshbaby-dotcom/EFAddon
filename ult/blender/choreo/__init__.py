"""Shot-by-shot staging. Each act module has stage(cast) that keys the actors, builds its
shot cameras and its effects. Frame numbers are reference-video frames."""

from ult.shots import SHOTS

from ..camera import ShotCam

_ORDER = [s[0] for s in SHOTS]
_RANGE = {s[0]: (s[1], s[2]) for s in SHOTS}


def span(sid):
    return _RANGE[sid]


def cam(sid, lens=35.0):
    """The shot's camera. Its VIX range runs up to the next shot's first frame, so
    back-to-back shots share a boundary and the manifest has no gaps."""
    a, b = _RANGE[sid]
    i = _ORDER.index(sid)
    if i + 1 < len(_ORDER) and _RANGE[_ORDER[i + 1]][0] == b + 1:
        b = b + 1
    return ShotCam(sid, a, b, lens)


def acts():
    import importlib
    out = []
    for name in ("act01", "act02"):
        try:
            out.append(importlib.import_module(__name__ + "." + name))
        except ModuleNotFoundError as exc:
            if exc.name != __name__ + "." + name:
                raise
    return out
