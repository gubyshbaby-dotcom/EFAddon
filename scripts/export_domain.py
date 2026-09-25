"""Build the domain and write it as a Minecraft structure template.

    python3 scripts/export_domain.py

writes out/domain/domain.nbt, the writer's domain.json (size, palette and block counts,
where the Blender origin lands) and domain_sets.json (the staging anchors of
ult.domain.SETS in Blender coordinates and in template coordinates), then reads the .nbt
back to check it. Plain python3: no bpy needed.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ult import domain, paths, voxel  # noqa: E402


def template_point(grid, p):
    """A Blender world point in the template's continuous coordinates (x, y up, z south).

    Block (i, j, k) of the grid is template block (i, k, sy - 1 - j); a point keeps its
    offset inside the block, so Blender y maps to sy - (y - lo_y).
    """
    sy = grid.a.shape[1]
    lo = grid.lo
    return [p[0] - lo[0], p[2] - lo[2], sy - (p[1] - lo[1])]


def main():
    t0 = time.time()
    grid = domain.build_grid()
    t1 = time.time()
    path = paths.out("domain", "domain.nbt")
    info = voxel.save_structure(path, grid)
    t2 = time.time()

    sets = {}
    for name, a in domain.SETS.items():
        n = a.normal
        sets[name] = {
            "blender": list(a),
            "normal_blender": n and list(n),
            "template": template_point(grid, a),
            "normal_template": n and [n[0], n[2], 0.0 - n[1]],
            "doc": a.doc,
        }
    with open(paths.out("domain", "domain_sets.json"), "w") as fh:
        json.dump(sets, fh, indent=2)

    with open(path, "rb") as fh:
        data = fh.read()
    root = voxel.read_structure(data)
    size, pal, blocks = root["size"], root["palette"], root["blocks"]
    assert size == info["size_mc"], (size, info["size_mc"])
    assert len(pal) == info["palette"], (len(pal), info["palette"])
    assert len(blocks) == info["blocks"] == grid.count(), (len(blocks), info["blocks"])
    lights = sum(1 for b in blocks if pal[b["state"]]["Name"] == "minecraft:light")

    print(f"built grid {grid.a.shape} in {t1 - t0:.1f} s, wrote {path} in {t2 - t1:.1f} s "
          f"({len(data) / 1e6:.2f} MB)")
    print(f"read back: size {size}, {len(pal)} palette states, {len(blocks)} blocks "
          f"({lights} light), origin in template {info['origin_in_template']}")


if __name__ == "__main__":
    main()
