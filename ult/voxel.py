"""A block grid in Blender axes, and the Minecraft structure file it becomes.

Blender X = east, Y = north, Z = up; one unit is one block and a block at integer
(x, y, z) fills [x, x+1) x [y, y+1) x [z, z+1). Minecraft is Y-up with north at -Z, so

    mc = (x, z, -y)

The structure is written as a vanilla structure template (.nbt, gzip): the size, a block
palette and one entry per non-air block. It loads with StructureTemplateManager /
StructureTemplate.placeInWorld at any size (only the structure *block* caps at 48).
"""

from __future__ import annotations

import gzip
import io
import json
import struct

import numpy as np

AIR = 0


class Palette:
    """Block states by id. Each entry: (mc name, properties dict, display rgb, kind).

    kind: "solid", "glass" (see-through, culls only against itself), "light" (the
    invisible minecraft:light block: exported, never meshed) or "air".
    """

    def __init__(self):
        self.entries = [("minecraft:air", {}, (0, 0, 0), "air")]
        self.index = {"air": 0}
        self.names = ["air"]

    def add(self, key, mc, rgb, kind="solid", props=None):
        if key in self.index:
            return self.index[key]
        self.index[key] = len(self.entries)
        self.entries.append((mc, dict(props or {}), tuple(rgb), kind))
        self.names.append(key)
        return self.index[key]

    def __getitem__(self, key):
        return self.index[key]

    def kind(self, i):
        return self.entries[i][3]

    def rgb(self, i):
        return self.entries[i][2]


class Grid:
    """Dense uint16 block ids over an axis-aligned box, Blender coordinates."""

    def __init__(self, lo, hi, palette: Palette):
        self.lo = np.array(lo, dtype=np.int64)
        self.hi = np.array(hi, dtype=np.int64)
        shape = tuple(int(v) for v in (self.hi - self.lo + 1))
        self.a = np.zeros(shape, dtype=np.uint16)
        self.pal = palette

    # coordinates -> slices, clipped to the grid
    def _sl(self, x0, y0, z0, x1, y1, z1):
        lo, hi = self.lo, self.hi
        a0 = [max(int(min(p, q)), l) - l for p, q, l in zip((x0, y0, z0), (x1, y1, z1), lo)]
        a1 = [min(int(max(p, q)), h) - l + 1 for p, q, l, h in zip((x0, y0, z0), (x1, y1, z1), lo, hi)]
        if any(b <= a for a, b in zip(a0, a1)):
            return None
        return tuple(slice(a, b) for a, b in zip(a0, a1))

    def box(self, x0, y0, z0, x1, y1, z1, block):
        """Fill the inclusive box with `block` (a palette key or id)."""
        sl = self._sl(x0, y0, z0, x1, y1, z1)
        if sl is not None:
            self.a[sl] = self._id(block)

    def shell(self, x0, y0, z0, x1, y1, z1, block, floor=True, roof=True):
        """Four walls (and optionally floor/roof) of an inclusive box."""
        self.box(x0, y0, z0, x0, y1, z1, block)
        self.box(x1, y0, z0, x1, y1, z1, block)
        self.box(x0, y0, z0, x1, y0, z1, block)
        self.box(x0, y1, z0, x1, y1, z1, block)
        if floor:
            self.box(x0, y0, z0, x1, y1, z0, block)
        if roof:
            self.box(x0, y0, z1, x1, y1, z1, block)

    def set(self, x, y, z, block):
        i = np.array((x, y, z)) - self.lo
        if np.all(i >= 0) and np.all(i < self.a.shape):
            self.a[tuple(i)] = self._id(block)

    def get(self, x, y, z):
        i = np.array((x, y, z)) - self.lo
        if np.all(i >= 0) and np.all(i < self.a.shape):
            return int(self.a[tuple(i)])
        return AIR

    def where(self, mask_fn, block):
        """Set every cell where mask_fn(X, Y, Z) (arrays of world coords) is true."""
        X, Y, Z = self.coords()
        self.a[mask_fn(X, Y, Z)] = self._id(block)

    def coords(self):
        sx, sy, sz = self.a.shape
        x = np.arange(sx)[:, None, None] + self.lo[0]
        y = np.arange(sy)[None, :, None] + self.lo[1]
        z = np.arange(sz)[None, None, :] + self.lo[2]
        return np.broadcast_arrays(x, y, z)

    def _id(self, block):
        return self.pal[block] if isinstance(block, str) else int(block)

    def count(self):
        return int(np.count_nonzero(self.a))


# ------------------------------------------------------------------------ NBT writer

_TAG_END, _TAG_BYTE, _TAG_INT, _TAG_STRING, _TAG_LIST, _TAG_COMPOUND = 0, 1, 3, 8, 9, 10


class _W:
    def __init__(self):
        self.b = io.BytesIO()

    def byte(self, v):
        self.b.write(struct.pack(">b", v))

    def int(self, v):
        self.b.write(struct.pack(">i", v))

    def short(self, v):
        self.b.write(struct.pack(">h", v))

    def string(self, s):
        data = s.encode("utf-8")
        self.b.write(struct.pack(">H", len(data)))
        self.b.write(data)

    def named(self, tag, name):
        self.byte(tag)
        self.string(name)


def _write_compound_body(w, items):
    """items: list of (name, tag, value)."""
    for name, tag, value in items:
        w.named(tag, name)
        _write_payload(w, tag, value)
    w.byte(_TAG_END)


class _RawList:
    """A list payload whose elements are already encoded (see _block_records)."""

    def __init__(self, elem_tag, count, data: bytes):
        self.elem_tag, self.count, self.data = elem_tag, count, data


def _write_payload(w, tag, value):
    if tag == _TAG_LIST and isinstance(value, _RawList):
        w.byte(value.elem_tag if value.count else _TAG_END)
        w.int(value.count)
        w.b.write(value.data)
    elif tag == _TAG_INT:
        w.int(value)
    elif tag == _TAG_STRING:
        w.string(value)
    elif tag == _TAG_COMPOUND:
        _write_compound_body(w, value)
    elif tag == _TAG_LIST:
        elem_tag, elems = value
        w.byte(elem_tag if elems else _TAG_END)
        w.int(len(elems))
        for e in elems:
            _write_payload(w, elem_tag, e)
    else:
        raise ValueError(tag)


DATA_VERSION = 3465   # 1.20.1, the Epic Fight 20.x line

# One entry of the "blocks" list is always the same 36 bytes:
#   {state: TAG_Int, pos: TAG_List of 3 TAG_Int} then TAG_End
# so the whole list is encoded at once as a numpy record array.
_BLOCK_RECORD = np.dtype([
    ("state_tag", "S8"), ("state", ">i4"),
    ("pos_tag", "S11"), ("pos", ">i4", (3,)),
    ("end", "u1"),
])
_STATE_TAG = bytes([_TAG_INT]) + struct.pack(">H", 5) + b"state"
_POS_TAG = bytes([_TAG_LIST]) + struct.pack(">H", 3) + b"pos" + bytes([_TAG_INT]) + struct.pack(">i", 3)


def _block_records(states, pos):
    rec = np.zeros(len(states), dtype=_BLOCK_RECORD)
    rec["state_tag"] = _STATE_TAG
    rec["state"] = states
    rec["pos_tag"] = _POS_TAG
    rec["pos"] = pos
    rec["end"] = _TAG_END
    return rec.tobytes()


def structure_nbt(grid: Grid, include_light=True, data_version=DATA_VERSION):
    """(gzipped bytes, info dict) for the grid as a structure template."""
    a = grid.a
    ids = np.unique(a)
    used = [int(i) for i in ids if i != AIR and (include_light or grid.pal.kind(int(i)) != "light")]
    palette = []
    for old in used:
        mc, props, _, _ = grid.pal.entries[old]
        entry = [("Name", _TAG_STRING, mc)]
        if props:
            entry.append(("Properties", _TAG_COMPOUND,
                          [(k, _TAG_STRING, str(v)) for k, v in sorted(props.items())]))
        palette.append(entry)
    xs, ys, zs = np.nonzero(a)
    lut = np.full(int(a.max()) + 1, -1, dtype=np.int64)
    lut[used] = np.arange(len(used))
    states = lut[a[xs, ys, zs]]
    keep = states >= 0
    xs, ys, zs, states = xs[keep], ys[keep], zs[keep], states[keep]
    sx, sy, sz = a.shape
    # Blender (i, j, k) index -> Minecraft (x, y, z) inside the template: x = i,
    # y = k (up), z = (sy - 1 - j) so north (+Blender Y) is -Minecraft Z.
    pos = np.stack([xs, zs, sy - 1 - ys], axis=1)
    blocks = _RawList(_TAG_COMPOUND, len(states), _block_records(states, pos))
    root = [
        ("DataVersion", _TAG_INT, data_version),
        ("size", _TAG_LIST, (_TAG_INT, [sx, sz, sy])),
        ("palette", _TAG_LIST, (_TAG_COMPOUND, palette)),
        ("blocks", _TAG_LIST, blocks),
        ("entities", _TAG_LIST, (_TAG_COMPOUND, [])),
    ]
    w = _W()
    w.named(_TAG_COMPOUND, "")
    _write_compound_body(w, root)
    raw = w.b.getvalue()
    info = {
        "size_mc": [sx, sz, sy],
        "blocks": blocks.count,
        "palette": len(palette),
        "blender_min": [int(v) for v in grid.lo],
        # where Blender's world origin (the caster's feet) lands inside the template
        "origin_in_template": [int(-grid.lo[0]), int(-grid.lo[2]), int(sy - 1 + grid.lo[1])],
    }
    return gzip.compress(raw, compresslevel=6), info


def read_structure(data: bytes):
    """Tiny reader for tests: returns (size, palette names, block count)."""
    raw = gzip.decompress(data)
    r = io.BytesIO(raw)

    def rd(fmt):
        return struct.unpack(fmt, r.read(struct.calcsize(fmt)))[0]

    def rstr():
        n = rd(">H")
        return r.read(n).decode("utf-8")

    def payload(tag):
        if tag == _TAG_BYTE:
            return rd(">b")
        if tag == _TAG_INT:
            return rd(">i")
        if tag == _TAG_STRING:
            return rstr()
        if tag == _TAG_LIST:
            et = rd(">b")
            n = rd(">i")
            return [payload(et) for _ in range(n)]
        if tag == _TAG_COMPOUND:
            out = {}
            while True:
                t = rd(">b")
                if t == _TAG_END:
                    return out
                name = rstr()
                out[name] = payload(t)
        raise ValueError(tag)

    tag = rd(">b")
    rstr()
    root = payload(tag)
    return root


def save_structure(path, grid: Grid, **kw):
    data, info = structure_nbt(grid, **kw)
    with open(path, "wb") as fh:
        fh.write(data)
    with open(path[:-4] + ".json", "w") as fh:
        json.dump(info, fh, indent=2)
    return info
