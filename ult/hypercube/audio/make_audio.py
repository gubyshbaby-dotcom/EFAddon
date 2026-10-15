#!/usr/bin/env python3
"""«Гиперкуб» audio: music + SFX synthesised from scratch, synced to ../timeline.js, mixed and mastered.

    python3 audio/make_audio.py

Outputs audio/out/mix.wav (48 kHz stereo 16-bit, exactly LENGTH s), music.wav and sfx.wav (pre-master stems, same
scale, so music + sfx = the master input), check.png, report.json."""
import json
import os
import sys
import time

T_START = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np                                    # noqa: E402
from scipy.io import wavfile                          # noqa: E402

import check                                          # noqa: E402
from dsp import SR, db, hp, lp, ns, shelf, tvec, undb  # noqa: E402
from mix import (CLIP_STATS, duck_curve, gap_gate, make_irs, master_to_target, mono_low,   # noqa: E402
                 render_stem, true_peak)
from music import Score                               # noqa: E402
from sfx import Sfx                                   # noqa: E402
from timeline import load                             # noqa: E402

OUT = os.path.join(HERE, 'out')
TARGET_LUFS = -10.0
MUSIC_GAIN = 1.0
SFX_GAIN = 1.0
GROUP = dict(beat=0.5, pads=0.5, acc=0.7, sfx=1.0, amb=1.0)     # pre-master balance (hits on top of the score)
FADE_IN = 0.15


def lap(msg, t0=[time.time()]):
    now = time.time()
    print(f'[{now - T_START:6.1f}s] {msg}', flush=True)
    t0[0] = now


def write_wav(path, x):
    x16 = np.clip(np.round(x * 32767.0), -32768, 32767).astype(np.int16)
    wavfile.write(path, SR, x16.T.copy())
    return x16


def main():
    os.makedirs(OUT, exist_ok=True)
    tl = load()
    n = ns(tl.LENGTH)
    g0, g1 = tl.gap()
    lap(f'timeline: {len(tl.HITS)} hits, {len(tl.EVENTS)} events, BPM {tl.BPM}, gap {g0}-{g1}')
    irs = make_irs()
    lap('reverb IRs')
    score = Score(tl, irs).render()
    lap('music rendered')
    score.fx()
    lap('music bus fx (dive sweep, underwater, aberration, tape stop)')
    sfx = Sfx(tl, irs).render()
    lap('sfx rendered')

    # ---- stems with reverb, gap gating, ducking
    beat = render_stem(score.beat, irs, g0, g1)
    pads = render_stem(score.pads, irs, g0, g1)
    acc = render_stem(score.acc, irs, g0, g1)
    duck_full, duck_db = duck_curve(n, sfx.duck_events, 1.0)
    duck_half, _ = duck_curve(n, sfx.duck_events, 0.6)
    duck_q, _ = duck_curve(n, sfx.duck_events, 0.3)
    music = beat * duck_half * GROUP['beat'] + pads * duck_full * GROUP['pads'] + acc * duck_q * GROUP['acc']
    t = tvec(n)
    tail = np.clip((tl.LENGTH - t) / 0.35, 0, 1) ** 2            # music tail rings out and lands on silence at LENGTH
    music *= tail
    fcurve = sfx.fade_curve()
    fx = render_stem(sfx.mx, irs, g0, g1, extra_gate=fcurve)
    amb = render_stem(sfx.amb, irs, g0, g1, extra_gate=fcurve)
    sfx_stem = fx * GROUP['sfx'] + amb * GROUP['amb']
    lap('reverbs, gap gating, sidechain')

    # ---- master
    pre = music * MUSIC_GAIN + sfx_stem * SFX_GAIN
    pre = hp(pre, 30, 2)
    pre = mono_low(pre, 120.0)
    pre = shelf(shelf(pre, 'lowshelf', 110, -1.5), 'highshelf', 3500, 2.0)      # gentle tilt toward presence
    pre = lp(pre, 17000, 2)                                                     # no fizz on top
    y, gdb, gl, gr, lufs = master_to_target(pre, TARGET_LUFS, log=lambda s: print(s, flush=True))
    fin = np.clip(t / FADE_IN, 0, 1) ** 2
    y = y * fin * gap_gate(n, g0, g1, 0.004) * np.clip((tl.LENGTH - t) / 0.05, 0, 1)
    tp, _ = true_peak(y)
    if tp > -1.0:
        y *= undb(-1.05 - tp)
    lap('master')

    y16 = write_wav(os.path.join(OUT, 'mix.wav'), y)
    # stems at the master input scale (music + sfx = pre-master mix), scaled together to peak at -1 dBFS max
    sm, ss = music * MUSIC_GAIN * undb(gdb), sfx_stem * SFX_GAIN * undb(gdb)
    k = min(1.0, undb(-1.0) / max(np.abs(sm).max(), np.abs(ss).max()))
    write_wav(os.path.join(OUT, 'music.wav'), sm * k)
    write_wav(os.path.join(OUT, 'sfx.wav'), ss * k)
    lap(f'wrote mix.wav / music.wav / sfx.wav (stem scale {db(k):+.1f} dB vs master input)')

    gen_time = time.time() - T_START
    print(f'soft clipper: active on {CLIP_STATS["active_pct"]:.2f}% of samples, max shave '
          f'{CLIP_STATS["max_shave_db"]:.2f} dB, removed energy {CLIP_STATS["removed_db"]:.1f} dB below the signal')
    res = check.report(y16, sm, ss, tl, gl, gr, gen_time)
    res['clipper'] = dict(CLIP_STATS)
    check.plot(y16, sm, ss, tl, res, duck_db, os.path.join(OUT, 'check.png'))
    res.pop('_curves')
    res['hit_layers'] = sfx.hit_log
    res['skipped_music_transients'] = score.skipped
    res['blinks'] = tl.blinks()
    res['footsteps'] = sfx.step_times
    with open(os.path.join(OUT, 'report.json'), 'w') as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
    lap(f'check.png + report.json; total {time.time() - T_START:.1f} s')


if __name__ == '__main__':
    main()
