"""Render chosen frames of the built .blend next to the reference frames.

    python3 scripts/render_frames.py OUT_DIR f1 f2 ... [--engine WORKBENCH|EEVEE] [--res 480]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from ult import paths  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
out = args[0]
engine = "CYCLES"
hide_fx = False
res = 480
frames = []
i = 1
while i < len(args):
    if args[i] == "--engine":
        engine = args[i + 1]
        i += 2
    elif args[i] == "--no-fx":
        hide_fx = True
        i += 1
    elif args[i] == "--res":
        res = int(args[i + 1])
        i += 2
    else:
        frames.append(int(args[i]))
        i += 1
bpy.ops.wm.open_mainfile(filepath=paths.BLEND)
from ult.blender import addon  # noqa: E402
addon.ensure()
sc = bpy.context.scene
sc.render.resolution_x = res
sc.render.resolution_y = res * 9 // 16
if engine == "CYCLES":
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 8
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 2
elif engine == "WORKBENCH":
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.show_shadows = True
os.makedirs(out, exist_ok=True)
if hide_fx and "FX" in bpy.data.collections:
    bpy.data.collections["FX"].hide_render = True
markers = sorted([m for m in sc.timeline_markers if m.camera], key=lambda m: m.frame)
for f in frames:
    cam = None
    for m in markers:
        if m.frame <= f:
            cam = m.camera
    if cam is not None:
        sc.camera = cam
    sc.frame_set(f)
    sc.render.filepath = os.path.join(out, "f%05d.png" % f)
    bpy.ops.render.render(write_still=True)
