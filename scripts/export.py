"""Export the built .blend: EF animations, entity paths, VIX shot, events.

    python3 scripts/export.py
    blender out/ult_sendai.blend --background --python scripts/export.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from ult import paths  # noqa: E402

if not bpy.data.filepath:
    bpy.ops.wm.open_mainfile(filepath=paths.BLEND)
from ult.blender import build, export  # noqa: E402

report = export.export_all(*build.SLICE)
print(json.dumps(report, indent=2))
