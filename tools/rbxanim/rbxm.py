#!/usr/bin/env python3
"""Minimal reader for Roblox binary model files (.rbxm, «<roblox!» format) and KeyframeSequence export.

Reads the INST / PROP / PRNT chunks (LZ4 or ZSTD compressed or raw), decodes the property types an
animation needs (strings, bools, ints, floats, enums, refs, CFrames, vectors, ...), rebuilds the tree and
turns every KeyframeSequence into plain JSON:

  {"name", "loop", "priority", "length", "keyframes": [{"t", "name", "poses": {"<Part>": {"parent", "cf": [x,y,z, r00..r22],
   "style", "dir", "weight"}}, "markers": [{"name", "value"}]}], "parts": [...], "rig": "R6"|"R15"|"other"}

usage: rbxm.py <file.rbxm> [--tree]      print the JSON (or the instance tree)
       rbxm.py --batch <dir> <out_dir>    convert every .rbxm in dir, write <out_dir>/<name>.json + index.json
"""
import json
import os
import struct
import sys

import lz4.block

try:
    import zstandard
except ImportError:  # optional
    zstandard = None

MAGIC = b'<roblox!'


class Inst:
    __slots__ = ('ref', 'cls', 'props', 'children', 'parent')

    def __init__(self, ref, cls):
        self.ref, self.cls, self.props, self.children, self.parent = ref, cls, {}, [], None

    @property
    def name(self):
        return self.props.get('Name', '')


def _deinterleave(data, n, width):
    out = bytearray(n * width)
    for b in range(width):
        out[b::width] = data[b * n:(b + 1) * n]
    return bytes(out)


def _ints(data, n):
    raw = _deinterleave(data, n, 4)
    vals = struct.unpack('>%dI' % n, raw)
    return [(v >> 1) ^ -(v & 1) for v in vals]


def _uints(data, n):
    return list(struct.unpack('>%dI' % n, _deinterleave(data, n, 4)))


def _floats(data, n):
    vals = struct.unpack('>%dI' % n, _deinterleave(data, n, 4))
    out = []
    for v in vals:
        v = (v >> 1) | ((v & 1) << 31)
        out.append(struct.unpack('<f', struct.pack('<I', v))[0])
    return out


def _refs(data, n):
    vals = _ints(data, n)
    acc, out = 0, []
    for v in vals:
        acc += v
        out.append(acc)
    return out


_NORMALS = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (-1, 0, 0), (0, -1, 0), (0, 0, -1)]


def _basic_rotation(rid):
    """24 axis-aligned rotations: id-1 = 6*right + up (normal ids +X,+Y,+Z,-X,-Y,-Z); columns = right, up, back."""
    i = rid - 1
    x, y = _NORMALS[i // 6], _NORMALS[i % 6]
    z = (x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0])
    # row-major r00 r01 r02 / r10 ... with columns x, y, z
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]


class Reader:
    def __init__(self, buf):
        self.b, self.p = buf, 0

    def take(self, n):
        v = self.b[self.p:self.p + n]
        self.p += n
        return v

    def u8(self):
        return self.take(1)[0]

    def u32(self):
        return struct.unpack('<I', self.take(4))[0]

    def string(self):
        n = self.u32()
        return self.take(n)

    def rest(self):
        return self.b[self.p:]


def _decompress(comp, ulen):
    if comp[:4] == b'\x28\xb5\x2f\xfd':
        if zstandard is None:
            raise RuntimeError('zstd chunk but zstandard is not installed')
        return zstandard.ZstdDecompressor().decompress(comp, max_output_size=ulen)
    return lz4.block.decompress(comp, uncompressed_size=ulen)


def _decode_prop(r, typ, n):
    """Return a list of n values, or None for types we skip."""
    if typ in (0x01, 0x1D):  # String, ProtectedString
        out = []
        for _ in range(n):
            s = r.string()
            try:
                out.append(s.decode('utf-8'))
            except UnicodeDecodeError:
                out.append(s.hex())
        return out
    if typ == 0x02:
        return [bool(x) for x in r.take(n)]
    if typ == 0x03:
        return _ints(r.take(4 * n), n)
    if typ == 0x04:
        return _floats(r.take(4 * n), n)
    if typ == 0x05:
        return list(struct.unpack('<%dd' % n, r.take(8 * n)))
    if typ == 0x0C:  # Color3
        a, b, c = _floats(r.take(4 * n), n), _floats(r.take(4 * n), n), _floats(r.take(4 * n), n)
        return list(zip(a, b, c))
    if typ == 0x0D:
        a, b = _floats(r.take(4 * n), n), _floats(r.take(4 * n), n)
        return list(zip(a, b))
    if typ == 0x0E:
        a, b, c = _floats(r.take(4 * n), n), _floats(r.take(4 * n), n), _floats(r.take(4 * n), n)
        return list(zip(a, b, c))
    if typ in (0x10, 0x11):  # CFrame (0x11 quaternion variant: not used by animations; decoded as raw 9 if id 0)
        rots = []
        for _ in range(n):
            rid = r.u8()
            if rid == 0:
                rots.append(list(struct.unpack('<9f', r.take(36))))
            else:
                rots.append(_basic_rotation(rid))
        xs, ys, zs = _floats(r.take(4 * n), n), _floats(r.take(4 * n), n), _floats(r.take(4 * n), n)
        return [[xs[i], ys[i], zs[i]] + rots[i] for i in range(n)]
    if typ == 0x12:
        return _uints(r.take(4 * n), n)
    if typ == 0x13:
        return _refs(r.take(4 * n), n)
    if typ == 0x1B:  # Int64
        raw = _deinterleave(r.take(8 * n), n, 8)
        vals = struct.unpack('>%dQ' % n, raw)
        return [(v >> 1) ^ -(v & 1) for v in vals]
    return None


def read(path):
    buf = open(path, 'rb').read()
    if not buf.startswith(MAGIC):
        raise ValueError('not a binary rbxm: %s' % path)
    p = 32
    classes = {}   # class id -> (name, [refs])
    insts = {}
    parents = []
    meta = {}
    while p < len(buf):
        name = buf[p:p + 4]
        clen, ulen, _ = struct.unpack('<III', buf[p + 4:p + 16])
        p += 16
        if clen == 0:
            data = buf[p:p + ulen]
            p += ulen
        else:
            data = _decompress(buf[p:p + clen], ulen)
            p += clen
        r = Reader(data)
        if name == b'META':
            for _ in range(r.u32()):
                k, v = r.string(), r.string()
                meta[k.decode()] = v.decode(errors='replace')
        elif name == b'INST':
            cid = r.u32()
            cname = r.string().decode()
            r.u8()
            n = r.u32()
            refs = _refs(r.take(4 * n), n)
            classes[cid] = (cname, refs)
            for ref in refs:
                insts[ref] = Inst(ref, cname)
        elif name == b'PROP':
            cid = r.u32()
            pname = r.string().decode()
            typ = r.u8()
            cname, refs = classes[cid]
            try:
                vals = _decode_prop(r, typ, len(refs))
            except Exception:
                vals = None
            if vals is not None:
                for ref, v in zip(refs, vals):
                    insts[ref].props[pname] = v
        elif name == b'PRNT':
            r.u8()
            n = r.u32()
            kids = _refs(r.take(4 * n), n)
            pars = _refs(r.take(4 * n), n)
            parents = list(zip(kids, pars))
        elif name.startswith(b'END'):
            break
    roots = []
    for k, par in parents:
        c = insts.get(k)
        if c is None:
            continue
        if par in insts:
            c.parent = insts[par]
            insts[par].children.append(c)
        else:
            roots.append(c)
    return roots, insts, meta


R6 = {'HumanoidRootPart', 'Torso', 'Head', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg'}
R15_HINT = {'UpperTorso', 'LowerTorso', 'LeftUpperArm', 'RightUpperArm', 'LeftUpperLeg'}

POSE_STYLE = {0: 'Linear', 1: 'Constant', 2: 'Elastic', 3: 'Cubic', 4: 'Bounce', 5: 'CubicV2'}
POSE_DIR = {0: 'In', 1: 'Out', 2: 'InOut'}


def sequence_json(ks):
    kfs = []
    parts = set()
    for kf in ks.children:
        if kf.cls != 'Keyframe':
            continue
        poses = {}
        markers = []

        def walk(node, parent):
            for c in node.children:
                if c.cls == 'Pose':
                    parts.add(c.name)
                    poses[c.name] = {
                        'parent': parent,
                        'cf': [round(x, 6) for x in c.props.get('CFrame', [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])],
                        'style': POSE_STYLE.get(c.props.get('EasingStyle', 0), str(c.props.get('EasingStyle'))),
                        'dir': POSE_DIR.get(c.props.get('EasingDirection', 0), str(c.props.get('EasingDirection'))),
                        'weight': round(c.props.get('Weight', 1.0), 4),
                    }
                    walk(c, c.name)
                elif c.cls == 'NumberPose':
                    poses[c.name] = {'parent': parent, 'number': c.props.get('Value', 0.0),
                                     'style': POSE_STYLE.get(c.props.get('EasingStyle', 0), '?'),
                                     'dir': POSE_DIR.get(c.props.get('EasingDirection', 0), '?')}
                elif c.cls == 'KeyframeMarker':
                    markers.append({'name': c.name, 'value': c.props.get('Value', '')})
                else:
                    walk(c, parent)

        walk(kf, None)
        kfs.append({'t': round(kf.props.get('Time', 0.0), 6), 'name': kf.name, 'poses': poses, 'markers': markers})
    kfs.sort(key=lambda k: k['t'])
    rig = 'R6' if parts & {'Torso', 'Left Arm', 'Right Arm'} else ('R15' if parts & R15_HINT else 'other')
    return {
        'name': ks.name,
        'loop': bool(ks.props.get('Loop', False)),
        'priority': ks.props.get('Priority'),
        'length': kfs[-1]['t'] if kfs else 0.0,
        'rig': rig,
        'parts': sorted(parts),
        'keyframes': kfs,
    }


def sequences(path):
    roots, insts, _ = read(path)
    return [sequence_json(i) for i in insts.values() if i.cls == 'KeyframeSequence']


def print_tree(node, depth=0, limit=[400]):
    if limit[0] <= 0:
        return
    limit[0] -= 1
    extra = {k: v for k, v in node.props.items() if k in ('Time', 'Value', 'Weight', 'EasingStyle', 'EasingDirection', 'Loop')}
    print('  ' * depth + f'{node.cls} "{node.name}" {extra if extra else ""}')
    for c in node.children:
        print_tree(c, depth + 1, limit)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--batch':
        src, out = a[1], a[2]
        os.makedirs(out, exist_ok=True)
        index = []
        for f in sorted(os.listdir(src)):
            if not f.endswith('.rbxm'):
                continue
            base = f[:-5]
            try:
                seqs = sequences(os.path.join(src, f))
            except Exception as e:
                index.append({'file': f, 'error': repr(e)})
                continue
            if not seqs:
                index.append({'file': f, 'error': 'no KeyframeSequence'})
                continue
            s = seqs[0]
            json.dump(s, open(os.path.join(out, base + '.json'), 'w'))
            index.append({'file': f, 'id': base, 'name': s['name'], 'rig': s['rig'], 'length': s['length'],
                          'keyframes': len(s['keyframes']), 'loop': s['loop'], 'parts': s['parts'],
                          'sequences': len(seqs),
                          'markers': sorted({m['name'] for k in s['keyframes'] for m in k['markers']}),
                          'kfnames': sorted({k['name'] for k in s['keyframes'] if k['name'] not in ('Keyframe', '')})[:12]})
        json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)
        ok = [i for i in index if 'error' not in i]
        print(f'{len(ok)} ok, {len(index) - len(ok)} failed')
    elif a and a[-1] == '--tree':
        roots, _, meta = read(a[0])
        print('META', meta)
        for r in roots:
            print_tree(r)
    else:
        print(json.dumps(sequences(a[0]), indent=1)[:20000])
