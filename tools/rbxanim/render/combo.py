#!/usr/bin/env python3
"""Build render.mjs arguments for an M1 combo demo: the user plays hits 1..4 back to back (cross-faded), the victim
stands in front, reacts on every Dmg marker (light reactions on 1-3, knock-back + flight on 4).

usage: combo.py <json dir> <title> <hit1> <hit2> <hit3> <hit4> [--idle <id>] [--gap 0.0]
ids may be prefixes (e.g. 1__29kf__22a6). Prints a shell-quoted argument list for render.mjs."""
import json, os, shlex, sys

a = sys.argv[1:]
def opt(k, d=None):
    if k in a:
        i = a.index(k); v = a[i + 1]; del a[i:i + 2]; return v
    return d
idle = opt('--idle'); gap = float(opt('--gap', '0.0')); base = opt('--base'); dist = opt('--dist', '1.9')
D, title, *hits = a
files = sorted(f[:-5] for f in os.listdir(D) if f.endswith('.json') and f != 'index.json')
def full(p):
    m = [f for f in files if f.startswith(p)]
    if not m: sys.exit(f'no animation {p}')
    return m[0]
def load(i): return json.load(open(os.path.join(D, i + '.json')))
def dmg(seq):
    for k in seq['keyframes']:
        if k['name'].lower() in ('dmg', 'hit'): return k['t']
        for m in k['markers']:
            if m['name'].lower() in ('dmg', 'hit'): return k['t']
    return None

LIGHT = [full('3__23kf__0951'), full('3rd_hit__20kf'), full('3__23kf__0951')]
KNOCK = full('knockback__46kf')
VIDLE = full('Idle__789kf__9ebc')
t = 0.0; user = []; vic = [f'{VIDLE}@0']
if idle:
    user.append(f'{full(idle)}@0'); t = 0.6
hit_times = []
for n, h in enumerate(hits):
    hid = full(h); seq = load(hid)
    user.append(f'{hid}@{t:.3f}/0.06')
    d = dmg(seq)
    if d is None:  # no marker: fastest limb moment ≈ 55 % of the clip
        d = seq['length'] * 0.55
    ht = t + d; hit_times.append(ht)
    vic.append(f'{(LIGHT[n] if n < 3 else KNOCK)}@{ht:.3f}/0.03')
    t += seq['length'] + gap
end = t + 0.8
args = ['--label', title, '--actor', ','.join(user), '--actor', ','.join(vic), '--place', f'1:0:-{dist}:180',
        '--knock', f'1:{hit_times[-1]:.3f}:4.5:1.3:0.75', '--t1', f'{end:.2f}']
if base: args += ['--base', f'0:{full(base)}']
print(' '.join(shlex.quote(x) for x in args))
print('# hits at', ', '.join(f'{x:.2f}' for x in hit_times), file=sys.stderr)
