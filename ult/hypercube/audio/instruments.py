"""Music voices, all synthesised: phonk drums (kick, clap, snare, hats, cowbell), distorted 808 with glides, braam stacks,
formant choir, crash, taiko, sub drops, risers, reverse swells, FM bells. Each returns mono (n,) or stereo (2, n) float."""
import numpy as np

from dsp import (SR, TWO_PI, bp, convolve, crush, cycles, drive, fades, formant, hp, lp, mtof, noise, ns, pan, peq,
                 rng, saw, smooth_noise, square, tvec, tvf)


# ----------------------------------------------------------------------------------------------------------- drums
def kick(vel=1.0, key='kick', f0=230.0, f1=47.0, tau_p=0.028, decay=0.16, drv=2.6, click=0.55, length=None):
    n = ns(length or min(decay * 5 + 0.03, 1.6))
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / tau_p)
    body = np.sin(TWO_PI * cycles(f))
    amp = np.exp(-t / decay) * (0.75 + 0.25 * np.exp(-t / 0.03))
    c = hp(noise(n, key), 1800) * np.exp(-t / 0.0022) * click
    c += np.sin(TWO_PI * 3100 * t) * np.exp(-t / 0.0018) * 0.6 * click
    y = drive(body * amp * 1.25 + c, drv)
    y = lp(y, 9000)
    return fades(y, 0, 0.012) * vel


def kick_big(vel=1.0, key='kickbig', decay=0.42, drv=4.0):
    """Hardstyle-flavoured accent kick: longer, dirtier tail, tuned near D."""
    k = kick(1.0, key, f0=320, f1=44.0, tau_p=0.035, decay=decay, drv=drv, click=0.8)
    return k * vel


def clap(vel=1.0, key='clap', tail=0.16):
    n = ns(0.5)
    t = tvec(n)
    w = noise(n, key)
    env = np.zeros(n)
    offs = [0.0, 0.0095, 0.0185, 0.027]
    for i, d in enumerate(offs):
        m = t >= d
        env[m] += np.exp(-(t[m] - d) / (0.0032 if i < 3 else tail)) * (1.0 if i < 3 else 0.75)
    y = bp(w, 850, 3600, 2) * env
    y = peq(y, 1500, 1.2, 4)
    return fades(lp(drive(y * 1.6, 1.5), 11000), 0, 0.05) * vel


def snare(vel=1.0, key='snare', tone=195.0, decay=0.12, crack=0.5):
    n = ns(0.45)
    t = tvec(n)
    f = tone * (1 + 0.35 * np.exp(-t / 0.008))
    body = (np.sin(TWO_PI * cycles(f)) + 0.45 * np.sin(TWO_PI * cycles(f * 1.63))) * np.exp(-t / 0.05)
    nz = hp(noise(n, key), 1400) * np.exp(-t / decay)
    cr = bp(noise(n, key + 'c'), 2500, 7500) * np.exp(-t / 0.008) * crack
    y = drive(body * 0.85 + nz * 0.75 + cr, 1.8)
    return fades(lp(y, 11000), 0, 0.05) * vel


HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def hat(vel=1.0, key='hat', open_=False, decay=None, tone=1.0):
    n = ns(0.6 if open_ else 0.14)
    t = tvec(n)
    r = rng(key)
    m = sum(square(f * tone * 1.6, n, r.random()) for f in HAT_F) / 6
    nz = noise(n, key)
    y = bp(m * 0.7 + nz * 0.5, 6800, 12000, 2)
    d = decay or (0.26 if open_ else 0.028)
    env = np.exp(-t / d)
    y = lp(y * env, 12000, 4)
    return fades(y, 0, 0.01) * vel * 1.8


def cowbell(midi, vel=1.0, key='cb', dur=0.32, bright=1.0):
    n = ns(dur + 0.05)
    t = tvec(n)
    f1 = mtof(midi) * (1 + 0.035 * np.exp(-t / 0.008))
    f2 = f1 * 1.4815
    x = square(f1, n, 0.0) + 0.85 * square(f2, n, 0.37)
    x = bp(x, mtof(midi) * 0.85, min(mtof(midi) * 7 * bright, 9000), 2)
    env = 0.62 * np.exp(-t / 0.011) + 0.38 * np.exp(-t / (dur * 0.42))
    a = ns(0.0006)
    env[:a] *= np.linspace(0, 1, a)
    y = drive(x * env * 1.3, 1.7)
    y = peq(y, mtof(midi) * 2.9, 1.0, 5)
    return fades(lp(y, 8500), 0, 0.03) * vel


def taiko(vel=1.0, key='taiko', f0=120.0, f1=56.0, decay=0.5):
    n = ns(decay * 4 + 0.05)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    body = np.sin(TWO_PI * cycles(f)) * np.exp(-t / decay)
    body += 0.35 * np.sin(TWO_PI * cycles(f * 1.52)) * np.exp(-t / (decay * 0.4))
    thump = lp(noise(n, key), 700, 2) * np.exp(-t / 0.035) * 1.2
    slap = bp(noise(n, key + 's'), 900, 3200) * np.exp(-t / 0.006) * 0.6
    y = drive(body + thump + slap, 1.7)
    return fades(y, 0, 0.05) * vel


def crash(dur=2.2, key='crash', vel=1.0, bright=1.0):
    n = ns(dur)
    t = tvec(n)
    r = rng(key)
    out = np.zeros((2, n))
    for ch in range(2):
        x = hp(noise(n, f'{key}{ch}'), 2600, 2) * 0.8
        part = np.zeros(n)
        for _ in range(48):
            f = r.uniform(2400, 10500) * bright
            part += r.uniform(0.2, 1.0) * np.sin(TWO_PI * f * t + r.uniform(0, 6.3)) * np.exp(-t / r.uniform(0.15, dur * 0.45))
        x = x + part * 0.09
        env = np.exp(-t / (dur * 0.33)) + 1.4 * np.exp(-t / 0.018)
        env[:ns(0.0008)] *= np.linspace(0, 1, ns(0.0008))
        out[ch] = x * env
    out = lp(out, 11500 * min(bright, 1.0), 4)
    return fades(out, 0, dur * 0.2) * vel * 0.5


def subdrop(dur=1.0, f0=74.0, f1=26.0, key='sub', vel=1.0):
    n = ns(dur)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / (dur * 0.28))
    y = np.sin(TWO_PI * cycles(f)) * np.exp(-t / (dur * 0.42))
    y[:ns(0.002)] *= np.linspace(0, 1, ns(0.002))
    return fades(drive(y * 1.3, 1.6), 0, dur * 0.25) * vel


# ------------------------------------------------------------------------------------------------------------ bass
def bass808(notes, t0, t1, key='808', drv=4.5, cutoff=2600.0):
    """notes: dicts {t, dur, m, slide_from=None, slide=0.08, vel=1, punch=7}. One continuous oscillator, so glides
    are phase-continuous; amplitude re-articulates per note. Returns mono segment starting at t0."""
    n = ns(t1 - t0)
    t = tvec(n)
    f = np.zeros(n)
    amp = np.zeros(n)
    for nt in notes:
        a = max(ns(nt['t'] - t0), 0)
        b = min(ns(nt['t'] + nt['dur'] - t0), n)
        if b <= a:
            continue
        st = t[a:b] - (nt['t'] - t0)
        ft = float(mtof(nt['m']))
        if nt.get('slide_from') is not None:
            fs = float(mtof(nt['slide_from']))
            k = np.clip(st / nt.get('slide', 0.08), 0, 1)
            k = 1 - (1 - k) ** 2
            seg = fs * (ft / fs) ** k
        else:
            seg = np.full(b - a, ft)
        seg = seg * 2 ** ((nt.get('punch', 7) / 12) * np.exp(-st / 0.011))
        f[a:b] = seg
        e = (0.78 + 0.22 * np.exp(-st / 0.18)) * nt.get('vel', 1.0)
        at = ns(0.003)
        e[:at] *= np.linspace(0, 1, at)
        rl = min(ns(0.018), b - a)
        e[-rl:] *= np.linspace(1, 0, rl) ** 1.5
        amp[a:b] = e
    # hold frequency through gaps (phase continuity)
    idx = np.where(f > 0, np.arange(n), 0)
    np.maximum.accumulate(idx, out=idx)
    f = f[idx]
    f[f <= 0] = 40.0
    ph = cycles(f)
    osc = np.sin(TWO_PI * ph) + 0.22 * np.sin(2 * TWO_PI * ph + 0.4)
    y = drive(osc * amp, drv) * np.minimum(amp * 4, 1.0)
    y = lp(y, cutoff, 2)
    y = hp(y, 34, 2)
    return y


# ----------------------------------------------------------------------------------------------- brass / pads / choir
def braam(midis, dur, key='braam', bright=1.0, drv=3.0, voices=5, det=13.0, attack=0.012, decay=0.55, sustain=0.45,
          release=0.35, sub=0.6, fall=0.0):
    n = ns(dur + release)
    t = tvec(n)
    r = rng(key)
    out = np.zeros((2, n))
    scoop = 2 ** ((-0.7 / 12) * np.exp(-t / 0.045))
    bend = 2 ** ((fall / 12) * np.clip((t - dur * 0.6) / (dur * 0.4 + 1e-9), 0, 1) ** 2) if fall else 1.0
    for m in midis:
        for v in range(voices):
            c = ((v - (voices - 1) / 2) / max((voices - 1) / 2, 1)) * det + r.uniform(-2.5, 2.5)
            f = float(mtof(m)) * 2 ** (c / 1200) * scoop * bend
            s = saw(f, n, r.random())
            p = ((v - (voices - 1) / 2) / max((voices - 1) / 2, 1)) * 0.85
            out += pan(s, p)
    out /= np.sqrt(len(midis) * voices) * 2.2
    fc = 90 + (2800 * bright - 90) * (1 - np.exp(-t / 0.028)) * (0.22 + 0.78 * np.exp(-t / 0.33))
    out = tvf(out, 'lp', fc, 1.15, 64)
    env = np.where(t < attack, t / attack, sustain + (1 - sustain) * np.exp(-(t - attack) / decay))
    g = ns(dur)
    env[g:] = env[g - 1] * np.exp(-(t[g:] - dur) / (release / 3))
    out = lp(drive(out * env * 2.0, drv, os=2), 11000, 2)
    if sub:
        sb = np.sin(TWO_PI * cycles(np.full(n, float(mtof(min(midis)))) * scoop * bend)) * env * sub
        out += np.vstack([sb, sb]) * 0.45
    return fades(out, 0, 0.02)


def supersaw_pad(midis, dur, key='pad', voices=7, det=18.0, cutoff=1400.0, attack=0.4, release=0.8, tremolo=0.0):
    n = ns(dur + release)
    t = tvec(n)
    r = rng(key)
    out = np.zeros((2, n))
    for m in midis:
        for v in range(voices):
            c = ((v - (voices - 1) / 2) / ((voices - 1) / 2)) * det + r.uniform(-3, 3)
            drift = 1 + smooth_noise(n, 0.7, f'{key}{m}{v}', 0.002)
            s = saw(float(mtof(m)) * 2 ** (c / 1200) * drift, n, r.random())
            out += pan(s, r.uniform(-0.95, 0.95))
    out = lp(out, cutoff, 2) / np.sqrt(len(midis) * voices)
    env = np.minimum(t / attack, 1.0)
    g = ns(dur)
    env[g:] = env[g - 1] * np.exp(-(t[g:] - dur) / (release / 3))
    env = np.sin(np.minimum(env, 1) * np.pi / 2) ** 2
    if tremolo:
        env = env * (1 - tremolo * 0.5 * (1 + np.sin(TWO_PI * 0.9 * t)))
    return fades(out * env, 0, min(release * 0.5, 0.15))


VOWELS = {
    'a': [(730, 1.0, 90), (1090, 0.6, 110), (2440, 0.22, 160), (3400, 0.08, 230)],
    'o': [(500, 1.0, 80), (840, 0.45, 100), (2500, 0.07, 150), (3300, 0.03, 200)],
    'u': [(320, 1.0, 60), (720, 0.22, 90), (2400, 0.035, 140)],
    'e': [(530, 1.0, 80), (1840, 0.4, 120), (2480, 0.2, 160), (3400, 0.06, 220)],
}


def choir(midis, dur, key='choir', vowel='a', voices=6, det=9.0, attack=0.35, release=0.7, vib=5.3, vib_c=22.0,
          breath=0.06, glide=None, vowel2=None, morph=None, spread=0.9):
    """Formant choir. glide: per-sample semitone offset array (len >= n) shared by all voices (rising choir).
    vowel2 + morph (0..1 per-sample array) crossfades the formant set."""
    n = ns(dur + release)
    t = tvec(n)
    r = rng(key)
    out = np.zeros((2, n))
    vib_fade = np.minimum(t / 0.35, 1.0)
    for m in midis:
        part = np.zeros((2, n))
        for v in range(voices):
            c = ((v - (voices - 1) / 2) / max((voices - 1) / 2, 1)) * det + r.uniform(-3, 3)
            vb = vib_c * vib_fade * np.sin(TWO_PI * (vib + r.uniform(-0.5, 0.5)) * t + r.uniform(0, 6.3))
            jit = smooth_noise(n, 2.5, f'{key}{m}{v}', 6.0)
            semis = (c + vb + jit) / 100.0
            if glide is not None:
                semis = semis + glide[:n]
            f = float(mtof(m)) * 2 ** (semis / 12)
            s = saw(f, n, r.random())
            part += pan(s, r.uniform(-spread, spread))
        part = lp(part, 4200, 1)
        part += hp(np.vstack([noise(n, f'{key}b{m}0'), noise(n, f'{key}b{m}1')]), 900) * breath
        scale = 1.12 if m >= 64 else (0.92 if m < 50 else 1.0)
        y = formant(part, VOWELS[vowel], scale)
        if vowel2 is not None:
            y2 = formant(part, VOWELS[vowel2], scale)
            y = y * (1 - morph[:n]) + y2 * morph[:n]
        out += y
    out /= np.sqrt(len(midis) * voices)
    env = np.minimum(t / attack, 1.0)
    env = np.sin(env * np.pi / 2) ** 2
    g = ns(dur)
    env[g:] = env[g - 1] * np.exp(-(t[g:] - dur) / (release / 3))
    return fades(lp(out, 9000, 2) * env * 2.5, 0, min(release * 0.5, 0.15))


def choir_stab(midis, key='stab', dur=0.55, vowel='a'):
    y = choir(midis, dur, key, vowel, voices=5, attack=0.006, release=0.5, vib_c=8, breath=0.25)
    n = y.shape[-1]
    t = tvec(n)
    return y * (0.55 + 0.45 * np.exp(-t / 0.12))


def drone(midis, dur, key='drone', cutoff=(120.0, 600.0), q=1.6, voices=3, det=7.0):
    n = ns(dur)
    t = tvec(n)
    r = rng(key)
    out = np.zeros((2, n))
    for m in midis:
        for v in range(voices):
            c = (v - (voices - 1) / 2) * det + r.uniform(-2, 2)
            s = saw(float(mtof(m)) * 2 ** (c / 1200), n, r.random())
            out += pan(s, r.uniform(-0.7, 0.7))
    out /= np.sqrt(len(midis) * voices)
    fc = cutoff[0] * (cutoff[1] / cutoff[0]) ** (t / dur)
    fc = fc * (1 + 0.15 * np.sin(TWO_PI * 0.6 * t))
    return fades(tvf(out, 'lp', fc, q, 64), 0.01, 0.03)


def bell(midi, dur=1.6, key='bell', ratio=3.51, index=3.2, vel=1.0):
    n = ns(dur)
    t = tvec(n)
    f = float(mtof(midi))
    I = index * np.exp(-t / (dur * 0.18))
    y = np.sin(TWO_PI * f * t + I * np.sin(TWO_PI * f * ratio * t))
    y += 0.3 * np.sin(TWO_PI * f * 2.0 * t) * np.exp(-t / (dur * 0.12))
    env = np.exp(-t / (dur * 0.3))
    env[:ns(0.002)] *= np.linspace(0, 1, ns(0.002))
    return fades(y * env, 0, dur * 0.2) * vel


def reese(midis, dur, key='reese', cutoff=1100.0, drv=2.5):
    n = ns(dur)
    r = rng(key)
    y = np.zeros(n)
    for m in midis:
        for c in (-11, 11):
            y += saw(float(mtof(m)) * 2 ** (c / 1200), n, r.random())
    y = lp(y, cutoff, 2)
    return fades(drive(y * 0.6, drv), 0.004, 0.03)


# ------------------------------------------------------------------------------------------------------- risers etc.
def noise_riser(dur, f0, f1, key='riser', q=1.6, shape=2.2, stereo=True):
    n = ns(dur)
    t = tvec(n)
    u = t / dur
    fc = f0 * (f1 / f0) ** (u ** 1.25)
    x = np.vstack([noise(n, key + 'L'), noise(n, key + 'R')]) if stereo else noise(n, key)
    y = tvf(x, 'bp', fc, q, 64)
    return y * (0.04 + 0.96 * u ** shape)


def tone_riser(dur, m0, m1, key='triser', voices=5, cutoff=(400.0, 6000.0)):
    n = ns(dur)
    t = tvec(n)
    u = t / dur
    r = rng(key)
    semis = m0 + (m1 - m0) * u ** 1.6
    out = np.zeros((2, n))
    for v in range(voices):
        f = mtof(semis + (v - voices // 2) * 0.12 + r.uniform(-0.05, 0.05))
        out += pan(saw(f, n, r.random()), (v - voices // 2) / voices * 1.6)
    fc = cutoff[0] * (cutoff[1] / cutoff[0]) ** u
    out = tvf(out / voices, 'lp', fc, 1.4, 64)
    return out * u ** 2


def reverse_swell(src, ir, length):
    """Reversed reverb of src: the wet tail played backwards so it swells INTO the moment src would hit."""
    src = src if src.ndim == 2 else np.vstack([src, src])
    pad = np.hstack([src, np.zeros((2, ir.shape[-1]))])
    wet = convolve(pad, ir)
    m = ns(length)
    w = wet[:, :m][:, ::-1]
    w = w / (np.max(np.abs(w)) + 1e-9)
    t = tvec(m)
    return w * np.minimum(t / (length * 0.5), 1.0) ** 1.5


def tape_stop(x, stop_len, power=1.7):
    """x: stereo segment starting where the stop starts. Speed falls 1 -> 0 over stop_len; then silence."""
    n = x.shape[-1]
    t = tvec(n)
    speed = np.clip(1 - t / stop_len, 0, 1) ** power
    pos = np.cumsum(speed) - speed[0]
    y = np.vstack([np.interp(pos, np.arange(n), c) for c in x])
    fade = np.clip(speed * 3, 0, 1)
    return y * fade


def glitch_stutter(x, slices, key='glitch'):
    """Re-trigger the head of x at offsets with sample-and-hold crushing (title glitch)."""
    r = rng(key)
    n = x.shape[-1]
    total = int(max(o for o, _ in slices) * SR) + n
    out = np.zeros(x.shape[:-1] + (total,))
    for off, ln in slices:
        a = ns(off)
        m = min(ns(ln), n)
        seg = crush(x[..., :m], int(r.integers(2, 7)), int(r.integers(5, 9)))
        seg = fades(seg, 0, 0.004)
        out[..., a:a + m] += seg
    return out
