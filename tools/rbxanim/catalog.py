#!/usr/bin/env python3
"""Group converted R6 animations into combat categories by name (for rendering and the quality report).

usage: catalog.py <json dir> [--all]   -> prints  category|id  lines (combat categories only unless --all)
"""
import json
import os
import re
import sys

CATS = [  # first match wins
    ('pair', r'victim|_v$|grabv$|endv$|attacker|_user|user_|^player_|_player|_plyr|^player$|^player[12]$'),
    ('m1', r'^[1-4](new|rev|bluefl\w*)?$|^3rd_?(hit|m1)|^4thm1|^m1_|^hit_[1-4]|^m1_hit|^punch1$|^combo2$|^combo_player$|^attack$|barage|^air_punch|^air_attack|^m1_1_air'),
    ('dash', r'dash|^flight_dash|^set_dash|^slayer_dash|^roll$|backjump|^stain_roll|^stain_backjump|turbinedrivestrafe'),
    ('slam', r'slam|uppercut|downpunch|^doiwslam'),
    ('block', r'block'),
    ('hitreact', r'(^|_)hit\d*$|^front_hit|^back_hit|knockback|gotthrown|^fall|^falling|stomach|^endhit|ragdoll|blockhit'),
    ('move', r'^run|running|^walk|walking|^jump|^jump_fall|^idle|_idle|idle_|^hbidle|^stainidle|^unarmed_run|^katana_run|zombie_walk'),
    ('skill', r'move|finisher|finsiher|fini|grab|ult|startup|start_up|impact|burst|shot|strike|smash|punch|kick|slash|combo|aegir|flare|grenade|epicenter|spawn|domain|tempo|howitzer|scorch|ricochet|inferno|explosive|detroit|piercing|chronoshift|eviscerate|ibuki|naoya|choso|shigi|baku|dabi|deku|todo|stain|vergil|gojo|sukuna|mahoraga|panzer|mjolnir|arrow|conjure|seventh|warp|tempobreaker|tunder|transmission|searing|nichijou|goku|gogeta|atomic|cutscene|ctuscene|hakari|recipro|scatter|thanos|anger|rage|godly'),
    ('emote', r'.*'),
]


def base(i):
    return re.sub(r'__\d+kf__[0-9a-f]+$', '', i['id'])


def categorize(i):
    b = base(i).lower()
    for cat, rx in CATS:
        if re.search(rx, b):
            return cat
    return 'emote'


if __name__ == '__main__':
    d = sys.argv[1]
    idx = [i for i in json.load(open(os.path.join(d, 'index.json'))) if 'error' not in i and i['rig'] == 'R6']
    want = None if '--all' in sys.argv else {'m1', 'dash', 'slam', 'block', 'hitreact', 'move'}
    from collections import Counter
    c = Counter(categorize(i) for i in idx)
    print('#', dict(c), file=sys.stderr)
    for i in sorted(idx, key=lambda i: (categorize(i), base(i).lower())):
        cat = categorize(i)
        if want is None or cat in want:
            print(f'{cat}|{i["id"]}')
