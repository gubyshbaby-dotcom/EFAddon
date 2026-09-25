"""Side-by-side preview video: the reference on the left, our render on the right, with
the reference audio.

    python3 scripts/preview.py [--engine CYCLES|WORKBENCH] [--res 640] [--start 0] [--end 489]

Frames go to out/_frames/ (not committed); the video to out/preview/.
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ult import FPS, paths  # noqa: E402


def arg(name, default):
    if name in sys.argv:
        return type(default)(sys.argv[sys.argv.index(name) + 1])
    return default


engine = arg("--engine", "CYCLES")
res = arg("--res", 640)
start = arg("--start", 0)
end = arg("--end", 489)
frames_dir = os.path.join(paths.OUT, "_frames")
here = os.path.dirname(os.path.abspath(__file__))

todo = [f for f in range(start, end + 1)
        if not os.path.exists(os.path.join(frames_dir, "f%05d.png" % f))]
chunk = 60
for i in range(0, len(todo), chunk):
    part = [str(f) for f in todo[i:i + chunk]]
    subprocess.run([sys.executable, os.path.join(here, "render_frames.py"), frames_dir]
                   + part + ["--engine", engine, "--res", str(res)], check=True,
                   stdout=subprocess.DEVNULL, env=dict(os.environ, EGL_PLATFORM="surfaceless"))
    print("rendered", part[-1], flush=True)

import imageio_ffmpeg  # noqa: E402

ff = imageio_ffmpeg.get_ffmpeg_exe()
h = res * 9 // 16
os.makedirs(os.path.join(paths.OUT, "preview"), exist_ok=True)
out = os.path.join(paths.OUT, "preview", "acts01-02_%05d-%05d.mp4" % (start, end))
t0 = start / FPS
dur = (end - start + 1) / FPS
cmd = [ff, "-y", "-v", "error",
       "-ss", "%.4f" % t0, "-t", "%.4f" % dur, "-i", paths.REF_VIDEO,
       "-framerate", str(FPS), "-start_number", str(start),
       "-i", os.path.join(frames_dir, "f%05d.png"),
       "-filter_complex",
       "[0:v]scale=%d:%d,setsar=1[a];[1:v]scale=%d:%d,setsar=1[b];[a][b]hstack=inputs=2[v]"
       % (res, h, res, h),
       "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "23", "-preset", "medium",
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", out]
subprocess.run(cmd, check=True)
# ours alone, full width, with the reference audio
solo = out.replace(".mp4", "_render.mp4")
subprocess.run([ff, "-y", "-v", "error", "-framerate", str(FPS), "-start_number", str(start),
                "-i", os.path.join(frames_dir, "f%05d.png"),
                "-ss", "%.4f" % t0, "-t", "%.4f" % dur, "-i", paths.REF_VIDEO,
                "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", solo],
               check=True)
print(out)
print(solo)
