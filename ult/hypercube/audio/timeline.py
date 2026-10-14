"""Loads ../timeline.js (the single timing source) through node, so the audio follows any change automatically."""
import json
import os
import subprocess

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_JS = ("import('./timeline.js').then(m=>console.log(JSON.stringify({HITS:m.HITS,EVENTS:m.EVENTS,"
       "SECTIONS:m.SECTIONS,SPACE:m.SPACE,SHOTS:m.SHOTS,BPM:m.BPM,BEAT:m.BEAT,BAR:m.BAR,LENGTH:m.LENGTH,FPS:m.FPS})))")


class Timeline:
    def __init__(self, d):
        self.raw = d
        self.HITS = sorted(d['HITS'], key=lambda h: h['t'])
        self.EVENTS = sorted(d['EVENTS'], key=lambda e: e['t'])
        self.SECTIONS = d['SECTIONS']
        self.SPACE = d['SPACE']
        self.SHOTS = d['SHOTS']
        self.BPM = d['BPM']
        self.BEAT = d['BEAT']
        self.BAR = d['BAR']
        self.STEP = self.BEAT / 4          # 16th note
        self.LENGTH = d['LENGTH']
        self.FPS = d['FPS']
        for i, h in enumerate(self.HITS):
            h['i'] = i
            h.setdefault('stop', 0)

    # --- lookups -------------------------------------------------------------------------------------------------
    def ev(self, eid, default=None):
        for e in self.EVENTS:
            if e['id'] == eid:
                return e['t']
        if default is None:
            raise KeyError(eid)
        return default

    def sec(self, sid):
        for s in self.SECTIONS:
            if s['id'] == sid:
                return s['t0'], s['t1']
        raise KeyError(sid)

    def space_ranges(self, name):
        return [(s['t0'], s['t1']) for s in self.SPACE if s['space'] == name]

    def hits(self, kind=None, prefix=None):
        out = self.HITS
        if kind:
            out = [h for h in out if h['kind'] == kind]
        if prefix:
            out = [h for h in out if h.get('move', '').startswith(prefix)]
        return out

    def in_stop(self, t, eps=1e-6):
        """True if t falls strictly inside a hit-stop window (the next transient must wait)."""
        for h in self.HITS:
            if h['stop'] and h['t'] + eps < t < h['t'] + h['stop'] - eps:
                return True
        return False

    def gap(self):
        t0 = self.ev('gap')
        t1 = self.ev('mega1')
        return t0, t1

    def blinks(self):
        """Teleport moments. Derived from the beat sheet: blink_in, a blink just before every hit whose move says the user
        'appears', barrage_start, a blink between every two barrage hits, and the blink above the victim (event 'above')."""
        out = [self.ev('blink_in')]
        for h in self.HITS:
            if 'appears' in h.get('move', '') and abs(h['t'] - 0.05 - out[0]) > 0.02:
                out.append(round(h['t'] - 0.05, 3))
        out.append(self.ev('barrage_start'))
        bar = self.hits(prefix='barrage')
        for a, b in zip(bar[:-1], bar[1:]):
            out.append(round((a['t'] + b['t']) / 2, 3))
        out.append(self.ev('above'))
        return sorted(set(out))


def load():
    out = subprocess.run(['node', '-e', _JS], cwd=PROJECT, capture_output=True, text=True, check=True)
    return Timeline(json.loads(out.stdout))
