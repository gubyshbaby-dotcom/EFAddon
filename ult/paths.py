"""Repository paths. Everything is relative to the repo root so the .blend and the
exports can move together."""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REF_VIDEO = os.path.join(ROOT, "ref(480p).mp4")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "out")
VENDOR_ADDON = os.path.join(ROOT, "vendor", "ef_blender-0.24.0.zip")

REF_ANALYSIS = os.path.join(DATA, "ref_analysis.json")
BLEND = os.path.join(OUT, "ult_sendai.blend")


def out(*parts):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path
