"""Measure the reference clip: cuts, flash frames, camera pans/shake and audio hits.

    python3 -m ult.analysis        writes data/ref_analysis.json

Per frame (30 fps):
  cut       colour-histogram distance to the previous frame (0..1); > 0.35 is a cut
  bright    mean luma 0..255; >= 235 is a white impact frame, <= 12 a black one
  pan       global image translation vs the previous frame, pixels at 854x480
            (phase correlation), which is what the shot cameras' pans and shakes follow
  hit       audio onset strength (spectral flux), normalised to its 99th percentile

The shot table in ult.shots was built from these numbers plus contact sheets.
"""

from __future__ import annotations

import json
import subprocess

import numpy as np

from ult import FPS, paths


def _frames(small=(160, 90)):
    import cv2
    cap = cv2.VideoCapture(paths.REF_VIDEO)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(cv2.resize(f, small, interpolation=cv2.INTER_AREA))
    return np.stack(out)


def video_stats():
    import cv2
    frames = _frames()
    gray = np.stack([cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]).astype(np.float32)
    bright = gray.mean(axis=(1, 2))
    hists = []
    for f in frames:
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        h = cv2.calcHist([hsv], [0, 1, 2], None, [16, 8, 8], [0, 180, 0, 256, 0, 256]).flatten()
        hists.append(h / max(h.sum(), 1.0))
    hists = np.array(hists)
    cut = np.r_[0.0, 0.5 * np.abs(np.diff(hists, axis=0)).sum(1)]
    win = cv2.createHanningWindow((gray.shape[2], gray.shape[1]), cv2.CV_32F)
    pan = [(0.0, 0.0)]
    scale = 854.0 / gray.shape[2]
    for i in range(1, len(gray)):
        (dx, dy), _ = cv2.phaseCorrelate(gray[i - 1], gray[i], win)
        pan.append((dx * scale, dy * scale))
    return cut, bright, np.array(pan)


def audio_hits(n_frames):
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        exe = "ffmpeg"
    sr = 22050
    raw = subprocess.run([exe, "-v", "error", "-i", paths.REF_VIDEO, "-ac", "1", "-ar", str(sr),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    hop = sr // FPS
    n = min(n_frames, len(a) // hop)
    win = np.hanning(1024)
    spec = []
    for i in range(n):
        seg = a[i * hop:i * hop + 1024]
        if len(seg) < 1024:
            seg = np.pad(seg, (0, 1024 - len(seg)))
        spec.append(np.abs(np.fft.rfft(seg * win)))
    spec = np.log1p(np.array(spec) * 10)
    flux = np.r_[0.0, np.maximum(0, np.diff(spec, axis=0)).sum(1)]
    flux /= max(np.percentile(flux, 99), 1e-6)
    return np.pad(flux, (0, n_frames - n))


def analyse():
    cut, bright, pan = video_stats()
    hit = audio_hits(len(cut))
    cuts = [int(i) for i in np.nonzero(cut > 0.35)[0]]
    white = [int(i) for i in np.nonzero(bright >= 235)[0]]
    black = [int(i) for i in np.nonzero(bright <= 12)[0]]
    hits = [int(i) for i in np.nonzero(hit > 0.9)[0]]
    data = {
        "fps": FPS, "frames": len(cut),
        "cuts": cuts, "white_frames": white, "black_frames": black, "audio_hits": hits,
        "per_frame": {"cut": np.round(cut, 3).tolist(), "bright": np.round(bright, 1).tolist(),
                      "pan_x": np.round(pan[:, 0], 2).tolist(),
                      "pan_y": np.round(pan[:, 1], 2).tolist(),
                      "hit": np.round(hit, 3).tolist()},
    }
    import os
    os.makedirs(paths.DATA, exist_ok=True)
    with open(paths.REF_ANALYSIS, "w") as fh:
        json.dump(data, fh)
    return data


if __name__ == "__main__":
    d = analyse()
    print("%d frames, %d cuts, %d white, %d black, %d audio hits"
          % (d["frames"], len(d["cuts"]), len(d["white_frames"]), len(d["black_frames"]),
             len(d["audio_hits"])))
