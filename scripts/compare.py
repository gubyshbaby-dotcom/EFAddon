"""Side-by-side sheet: reference frame | our render, one row per frame.

    python3 scripts/compare.py RENDER_DIR OUT.png f1 f2 ...
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ult import paths  # noqa: E402

rdir, out = sys.argv[1], sys.argv[2]
frames = [int(a) for a in sys.argv[3:]]
cap = cv2.VideoCapture(paths.REF_VIDEO)
W = 400
H = W * 9 // 16
rows = []
for f in frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, f)
    ok, ref = cap.read()
    ref = cv2.resize(ref, (W, H)) if ok else np.zeros((H, W, 3), np.uint8)
    p = os.path.join(rdir, "f%05d.png" % f)
    ren = cv2.imread(p)
    ren = cv2.resize(ren, (W, H)) if ren is not None else np.zeros((H, W, 3), np.uint8)
    row = np.hstack([ref, np.full((H, 4, 3), 40, np.uint8), ren])
    cv2.putText(row, str(f), (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3)
    cv2.putText(row, str(f), (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
    rows.append(row)
cols = 2
grid = []
for i in range(0, len(rows), cols):
    chunk = rows[i:i + cols]
    while len(chunk) < cols:
        chunk.append(np.zeros_like(rows[0]))
    grid.append(np.hstack([chunk[0], np.full((H, 10, 3), 0, np.uint8)] + chunk[1:]))
cv2.imwrite(out, np.vstack(grid))
