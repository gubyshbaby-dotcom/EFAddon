"""Reference|render pairs every `step` frames, 4 pairs per row.

    python3 scripts/pairsheet.py RENDER_DIR OUT.png START END STEP
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ult import paths  # noqa: E402

rdir, out, a, b, step = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
cap = cv2.VideoCapture(paths.REF_VIDEO)
W, H = 196, 110
cells = []
cap.set(cv2.CAP_PROP_POS_FRAMES, a)
f = a
refs = {}
while f <= b:
    ok, img = cap.read()
    if not ok:
        break
    refs[f] = cv2.resize(img, (W, H))
    f += 1
for f in range(a, b + 1, step):
    ref = refs.get(f, np.zeros((H, W, 3), np.uint8))
    p = os.path.join(rdir, "f%05d.png" % f)
    ren = cv2.imread(p)
    ren = cv2.resize(ren, (W, H)) if ren is not None else np.zeros((H, W, 3), np.uint8)
    pair = np.hstack([ref, np.full((H, 2, 3), 255, np.uint8), ren])
    cv2.putText(pair, str(f), (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3)
    cv2.putText(pair, str(f), (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
    cells.append(pair)
cols = 4
rows = []
for i in range(0, len(cells), cols):
    chunk = cells[i:i + cols]
    while len(chunk) < cols:
        chunk.append(np.zeros_like(cells[0]))
    rows.append(np.hstack([np.hstack([c, np.zeros((H, 8, 3), np.uint8)]) for c in chunk]))
cv2.imwrite(out, np.vstack([np.vstack([r, np.zeros((4, r.shape[1], 3), np.uint8)]) for r in rows]))
