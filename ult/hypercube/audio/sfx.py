"""SFX for «Гиперкуб»: a layered impact for every HIT (starting exactly at hit.t) plus every story event.
All anchors come from timeline.js; every hit is varied (pitch, filter, layer mix, pan) from its own seed."""
import numpy as np

import instruments as I
from dsp import (SR, TWO_PI, Mixer, bp, cycles, drive, fades, formant, hp, lp, mod_delay, noise, ns, pan, reson, rng,
                 saw, smooth_noise, tvec, tvf)

#        pre-whoosh   click  thump: f0  f1   tau   gain  crunch: tau  gain   boom  sub   debris  room  hall
KIND = {
    'light': dict(pre=0.06, wh=0.30, click=0.75, f0=200, f1=82, tau=0.05, th=0.75, ctau=0.022, cr=0.40, boom=0.0,
                  sub=0.0, deb=0.0, room=0.18, hall=0.03),
    'medium': dict(pre=0.09, wh=0.40, click=0.95, f0=165, f1=62, tau=0.085, th=0.95, ctau=0.04, cr=0.55, boom=0.25,
                   sub=0.0, deb=0.15, room=0.22, hall=0.08),
    'heavy': dict(pre=0.13, wh=0.55, click=1.1, f0=145, f1=46, tau=0.16, th=1.15, ctau=0.075, cr=0.75, boom=0.7,
                  sub=0.6, deb=0.45, room=0.25, hall=0.22),
    'mega': dict(pre=0.15, wh=0.70, click=1.3, f0=128, f1=34, tau=0.32, th=1.4, ctau=0.13, cr=1.0, boom=1.3,
                 sub=1.0, deb=1.0, room=0.25, hall=0.42),
}


# ------------------------------------------------------------------------------------------------- sound layers
def whoosh(dur, key, f0=380.0, f1=3200.0, q=1.2, shape=2.4, stereo_from=0.0, stereo_to=0.0):
    n = max(ns(dur), 16)
    t = tvec(n)
    u = t / dur
    fc = f0 * (f1 / f0) ** (u ** 1.4)
    x = noise(n, key)
    y = tvf(x, 'bp', fc, q, 32) + 0.35 * tvf(x, 'lp', fc * 0.5, 0.7, 32)
    dip = np.clip((dur - t) / 0.009, 0, 1)
    y *= u ** shape * (0.3 + 0.7 * dip ** 1.5)
    y = fades(y, 0, 0.0015)
    return pan(y, stereo_from + (stereo_to - stereo_from) * u)


def click(key, bright=1.0, amp=1.0):
    r = rng(key)
    n = ns(0.014)
    t = tvec(n)
    x = hp(noise(n, key), 2200 * bright, 2) * np.exp(-t / 0.0011)
    x += np.sin(TWO_PI * r.uniform(1700, 4300) * bright * t) * np.exp(-t / 0.0017) * 0.8
    x[0] += 0.6 * r.choice([-1, 1])
    x = lp(x, 13000, 2)
    return x / (np.max(np.abs(x)) + 1e-9) * amp


def thump(f0, f1, tau, key, drv=1.8):
    n = ns(min(tau * 5 + 0.02, 2.5))
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.022)
    ph = cycles(f)
    y = np.sin(TWO_PI * ph) * np.exp(-t / tau) + 0.3 * np.sin(2 * TWO_PI * ph) * np.exp(-t / (tau * 0.45))
    y[:ns(0.0004)] *= np.linspace(0.3, 1, ns(0.0004))
    return fades(drive(y * 1.2, drv), 0, 0.01)


def crunch(tau, key, fc, grit=0.025):
    r = rng(key)
    n = ns(tau * 5 + 0.01)
    t = tvec(n)
    sp = (r.random(n) < grit) * r.standard_normal(n) * 3
    y = bp(noise(n, key) + sp, fc / 2.2, min(fc * 2.4, 11000)) * np.exp(-t / tau)
    y = lp(drive(y * 2.2, 2.6), 12000, 2)
    return fades(y, 0, 0.005)


def boom(dur, key, f=46.0, width=1.0):
    """Low boom; width <= 1 (the two noise channels are independent, so width > 1 would anti-correlate L/R)."""
    width = min(width, 1.0)
    n = ns(dur)
    t = tvec(n)
    out = np.zeros((2, n))
    for ch in range(2):
        nz = hp(lp(noise(n, f'{key}{ch}'), 220, 4), 38, 2) * 9.0
        out[ch] = nz * np.exp(-t / (dur * 0.3))
    s = 0.6 * np.sin(TWO_PI * cycles(f * (1 + 0.5 * np.exp(-t / 0.04)))) * np.exp(-t / (dur * 0.25))
    m = (out[0] + out[1]) / 2
    out = np.vstack([m + (out[0] - m) * width + s, m + (out[1] - m) * width + s])
    out[:, :ns(0.002)] *= np.linspace(0, 1, ns(0.002))
    return fades(drive(out, 1.6), 0, dur * 0.3)


def debris(dur, key, count=40, f_lo=1200.0, f_hi=6500.0, tau=0.35, hiss=0.25, n_res=8):
    """Rattles / pebbles: impulses with exponentially thinning density through a bank of resonators, plus dirt hiss."""
    r = rng(key)
    n = ns(dur)
    t = tvec(n)
    out = np.zeros((2, n))
    for ch in range(2):
        imp = np.zeros((n_res, n))
        times = np.clip(r.exponential(tau, count), 0, dur * 0.97)
        idx = (times * SR).astype(int)
        amps = r.uniform(0.25, 1.0, count) * np.exp(-times / (tau * 1.5)) * r.choice([-1, 1], count)
        which = r.integers(0, n_res, count)
        np.add.at(imp, (which, idx), amps)
        for j in range(n_res):
            f = r.uniform(f_lo, f_hi)
            out[ch] += reson(imp[j], f, r.uniform(5, 14), 6.0)
        out[ch] += bp(noise(n, f'{key}h{ch}'), 900, 5000) * np.exp(-t / tau) * hiss
    return fades(out, 0, 0.05)


def pings(times, key, f_lo=2400.0, f_hi=10500.0, dec=(0.04, 0.3), amp_tau=None, pans=None, length=None):
    """Glass: additive inharmonic pings (3 partials each) at the given times (seconds, relative)."""
    r = rng(key)
    times = np.asarray(times, dtype=float)
    end = (length or (times.max() + dec[1] * 5)) if len(times) else 0.1
    n = ns(end)
    out = np.zeros((2, n))
    for k, t0 in enumerate(times):
        f = r.uniform(f_lo, f_hi)
        d = r.uniform(*dec)
        m = ns(min(d * 5, end - t0))
        if m < 32:
            continue
        tt = tvec(m)
        y = np.zeros(m)
        for ratio, g in ((1.0, 1.0), (r.uniform(2.3, 2.9), 0.5), (r.uniform(4.6, 5.6), 0.25)):
            ff = f * ratio
            if ff < SR * 0.45:
                y += g * np.sin(TWO_PI * ff * tt + r.uniform(0, 6.3)) * np.exp(-tt / (d / ratio ** 0.5))
        y[:ns(0.0005)] *= np.linspace(0, 1, ns(0.0005))
        a = r.uniform(0.4, 1.0) * (np.exp(-t0 / amp_tau) if amp_tau else 1.0)
        p = pans[k] if pans is not None else r.uniform(-0.9, 0.9)
        i0 = ns(t0)
        out[:, i0:i0 + m] += pan(y * a, p)
    return lp(out, 12500, 2)


def fm_zap(key, dur=0.085, f0=3300.0, f1=320.0):
    r = rng(key)
    n = ns(dur + 0.02)
    t = tvec(n)
    f = f0 * r.uniform(0.85, 1.15) * (f1 / f0) ** np.clip(t / dur, 0, 1)
    idx = 3.0 * np.exp(-t / 0.03)
    y = np.sin(TWO_PI * cycles(f) + idx * np.sin(TWO_PI * cycles(f * 1.5)))
    y *= np.exp(-t / (dur * 0.45))
    y += hp(noise(n, key), 3000) * np.exp(-t / 0.012) * 0.35
    c = np.zeros(n)
    c[:ns(0.004)] = click(key + 'c', 1.2)[:ns(0.004)] * 0.8
    return fades(y * 0.8 + c, 0, 0.01)


def freeze(src, hold, key, tail=0.12):
    """'Time-stop' sustain: the impact head smeared into a held, slightly darkened texture (no new transients)."""
    r = rng(key)
    head = src[:, :ns(0.06)]
    m = ns(hold + tail)
    t = tvec(m)
    ker = r.standard_normal((2, m)) * np.exp(-t / (hold * 0.9))
    from scipy.signal import fftconvolve
    y = np.vstack([fftconvolve(head[c], ker[c])[:m] for c in range(2)])
    y = lp(y, 5000, 2)
    env = np.minimum(t / 0.03, 1.0) * np.where(t < hold, 1.0, np.exp(-(t - hold) / (tail / 3)))
    y = y * env
    return y / (np.max(np.abs(y)) + 1e-9)


# ------------------------------------------------------------------------------------------------------- the SFX
class Sfx:
    def __init__(self, tl, irs):
        self.tl = tl
        self.irs = irs
        self.n = ns(tl.LENGTH)
        self.mx = Mixer(self.n)
        self.amb = Mixer(self.n)      # ambience (cut by the silence gap like the music)
        self.duck_events = []         # (t, depth_db, release_s, hold_s) for the music sidechain
        self.hit_log = []
        self.step_times = []

    def add(self, sig, t, gain=1.0, p=0.0, **kw):
        self.mx.add(sig, t, gain, p, **kw)

    # ------------------------------------------------------------------------------------------------ hits
    def hits(self):
        tl = self.tl
        g0, g1 = tl.gap()
        clone_k = 0
        bar_hits = tl.hits(prefix='barrage')
        fr = tl.hits(prefix='frenzy')
        for h in tl.HITS:
            t, kind, i = h['t'], h['kind'], h['i']
            P = KIND[kind]
            r = rng(f"hit{i}:{t}")
            vel = r.uniform(0.9, 1.08)
            if h['by'] == 'clone':
                clone_k += 1
                vel *= 1.15                    # spectral copies: a touch brighter so they read inside the 16th roll
                p = 0.78 * np.sin(clone_k * TWO_PI / 6 * 2.2 + 0.5) + r.uniform(-0.08, 0.08)
            elif h in bar_hits:
                p = (0.4 if bar_hits.index(h) % 2 else -0.4) + r.uniform(-0.12, 0.12)
            else:
                p = r.uniform(-0.18, 0.18)
            if h in fr:
                u = fr.index(h) / max(len(fr) - 1, 1)
                vel *= 0.86 + 0.24 * u
            pm = r.uniform(0.87, 1.15)
            key = f'h{i}'
            # 1. pre-whoosh ending at the contact (not inside the silence gap, not across a previous hit-stop)
            pre = P['pre'] * r.uniform(0.85, 1.15)
            prev = [x for x in tl.HITS if x['t'] < t]
            if prev:
                pre = min(pre, t - (prev[-1]['t'] + prev[-1]['stop']) - 0.015)
            if g0 < t - pre < g1 or (g0 - 1e-6 <= t <= g1 + 1e-6):
                pre = 0
            if pre > 0.02:
                wh = whoosh(pre, key + 'w', 350 * pm, r.uniform(2400, 4200) * pm, q=r.uniform(0.9, 1.6),
                            stereo_from=-p * 0.8, stereo_to=p)
                self.mx.add_end(wh, t, P['wh'] * vel, room=0.1)
            # 2. transient click / crack
            nclk = 6 if h['by'] == 'all' else (2 if kind in ('heavy', 'mega') else 1)
            for c in range(nclk):
                off = 0 if c == 0 else r.uniform(0.0004, 0.0015)
                pc = p if c == 0 else r.uniform(-0.9, 0.9)
                self.add(click(f'{key}c{c}', r.uniform(0.8, 1.3)), t + off, 1.25 * P['click'] * vel / np.sqrt(max(nclk / 2, 1)),
                         pc, room=P['room'] * 0.5)
            # 3. body thump
            tau = P['tau'] * r.uniform(0.85, 1.15) * ((0.55 if kind == 'medium' else 0.75) if h in fr else 1.0)
            th = thump(P['f0'] * pm, P['f1'] * pm, tau, key + 't', r.uniform(1.6, 2.4))
            self.add(th, t, 1.2 * P['th'] * vel * r.uniform(0.85, 1.12), p * 0.5, room=P['room'])
            # 4. crunch / noise burst
            cr = crunch(P['ctau'] * r.uniform(0.8, 1.2), key + 'k', r.uniform(1100, 3400) * pm, r.uniform(0.01, 0.05))
            self.add(cr, t, 1.4 * P['cr'] * vel * r.uniform(0.8, 1.15), p, room=P['room'], hall=P['hall'] * 0.5)
            # slap layer for medium+: mid punch
            if kind != 'light':
                sl = bp(noise(ns(0.08), key + 's'), 250 * pm, 1400 * pm) * np.exp(-tvec(ns(0.08)) / 0.018) * 2.0
                self.add(sl, t, 0.5 * vel, p, room=P['room'])
            # 5. heavy / mega: boom with a tail, sub drop, debris, hit-stop ring
            stop = h['stop']
            if P['boom'] and h not in fr:     # the 16th roll keeps its low end tight
                bd = {'medium': 0.45, 'heavy': 0.9, 'mega': 1.8}[kind]
                self.add(boom(bd, key + 'b', 44 * pm), t, P['boom'] * 0.55 * vel,
                         hall=P['hall'], room=0.1)
            if P['sub']:
                self.add(I.subdrop(0.7 if kind == 'heavy' else 1.3, 72 * pm, 32, key + 'sd'), t, P['sub'] * 0.4)
            if P['deb'] and h not in fr:      # no rattles inside the 16th roll: the next hit is 0.1 s away
                d0 = max(stop, 0.06)
                self.add(debris(0.9 if kind != 'mega' else 1.4, key + 'd', int(25 + 50 * P['deb']), tau=0.25 + 0.2 * P['deb']),
                         t + d0, 0.22 * P['deb'], p * 0.6, room=0.3, hall=0.2)
            if stop >= 0.03 and kind != 'light':
                rg = pings([0.0, 0.0, 0.0], key + 'rg', 1100, 4200, (stop * 0.8, stop * 1.6), length=stop * 6)
                self.add(rg, t, 0.12 if kind == 'medium' else 0.2, p, hall=0.2)
            if kind == 'mega':
                self.mega_layers(h, key, p, r)
            if h in fr and t >= tl.ev('cracks') and r.random() < 0.6:
                self.add(pings([0.0], key + 'gl', 3000, 9000, (0.03, 0.09)), t, 0.18, p * 1.2)
            self.hit_log.append(dict(t=t, kind=kind, pan=round(float(p), 2), pitch=round(float(pm), 3),
                                     pre=round(float(max(pre, 0)), 3)))
            depth = {'light': 4.5, 'medium': 6.5, 'heavy': 10.0, 'mega': 16.0}[kind]
            rel = {'light': 0.09, 'medium': 0.12, 'heavy': 0.2, 'mega': 0.35}[kind]
            self.duck_events.append((t, depth, rel, stop, 0.03 if kind == 'mega' else 0.002))

    def mega_layers(self, h, key, p, r):
        t = h['t']
        stop = h['stop']
        big = h['by'] == 'all'
        th = thump(110, 36, 0.32, key + 'T', 3.0)
        self.add(th, t, 0.75, 0.0, hall=0.15)
        env = np.exp(-tvec(ns(0.5)) / 0.08) * 3
        dist = np.vstack([drive(lp(noise(ns(0.5), key + f'D{c}'), 900, 2) * env, 4.0) for c in range(2)])
        self.add(dist, t, 0.45, hall=0.35)
        if stop >= 0.1:
            # time freeze: the impact smeared and held through the hit-stop, then released (shockwave at stop end)
            cz = crunch(0.05, key + 'fzc', 1800)
            src = boom(0.3, key + 'fz', 50)
            src[:, :min(len(cz), src.shape[-1])] += cz[:src.shape[-1]]
            fz = freeze(src, stop, key + 'F')
            self.add(fz, t + 0.004, 0.32, hall=0.4)
            hum = np.sin(TWO_PI * 55 * tvec(ns(stop + 0.1))) * np.minimum(tvec(ns(stop + 0.1)) / 0.02, 1)
            self.add(fades(hum, 0, 0.1), t, 0.25)
        if big:
            self.add(debris(1.6, key + 'D2', 90, 900, 5000, 0.5), t + max(stop, 0.06), 0.25, room=0.3, hall=0.3)

    # ------------------------------------------------------------------------------------------------ events
    def events(self):
        tl = self.tl
        E = tl.ev
        drop = E('throw')
        g0, g1 = tl.gap()
        # --- 0.4 charge hum: FM, phasing, rising into the throw
        t0, t1 = E('charge'), drop
        n = ns(t1 - t0)
        t = tvec(n)
        u = t / (t1 - t0)
        f = 73.4 * 2 ** (u ** 1.3 * 1.5)
        y = np.sin(TWO_PI * cycles(f) + (1.2 + 4 * u) * np.sin(TWO_PI * cycles(f * 2.01)))
        y += 0.7 * np.sin(TWO_PI * cycles(f * 1.006) + (1 + 3 * u) * np.sin(TWO_PI * cycles(f * 3.0)))
        L = y + 0.8 * mod_delay(y, 3.0, 2.0, 0.5 + 3 * u.mean(), 0.0)
        R = y + 0.8 * mod_delay(y, 3.0, 2.0, 0.5 + 3 * u.mean(), 1.7)
        siz = bp(noise(n, 'siz'), 3000, 7000) * (0.5 + 0.5 * np.sin(TWO_PI * 23 * t)) * 0.5
        hum = np.vstack([L, R]) * 0.3 + np.vstack([siz, siz * 0.9])
        hum *= (0.08 + 0.92 * u ** 1.6)
        self.add(fades(lp(hum, 9000), 0.05, 0.015), t0, 0.32, hall=0.15)
        self.duck_events.append((drop, 0, 0.1, 0))
        # --- 1.0 palm opens, 1.2 seed forms: crystalline shimmer + 4D warble
        p0, s0 = E('palm_open'), E('seed')
        r = rng('seed')
        tt = np.sort(np.concatenate([r.uniform(0, drop - p0, 26) ** 1.0, [s0 - p0] * 3]))
        sh = pings(tt, 'seedp', 3500, 11000, (0.05, 0.25), pans=r.uniform(-0.4, 0.4, len(tt)))
        self.add(sh, p0, 0.22, hall=0.35)
        n = ns(drop - s0 + 0.1)
        t = tvec(n)
        wf = 1760 * 2 ** ((60 / 1200) * np.sin(TWO_PI * 7 * t))
        wb = np.sin(TWO_PI * cycles(wf)) * np.sin(TWO_PI * 4.3 * t) + 0.5 * np.sin(TWO_PI * cycles(wf * 1.5))
        wb *= np.minimum(t / 0.05, 1) * (0.6 + 0.4 * np.sin(TWO_PI * 2.0 * t))
        self.add(fades(wb, 0.02, 0.06), s0, 0.10, 0.1, hall=0.3)
        # --- 1.6 throw whoosh + projectile
        self.mx.add_end(whoosh(0.06, 'throw_in', 600, 2600, 1.2), drop, 0.4)
        n = ns(0.32)
        t = tvec(n)
        fc = 2600 * (500 / 2600) ** (t / 0.32)
        wo = tvf(noise(n, 'throw'), 'bp', fc, 1.3) * np.exp(-t / 0.09)
        pew = np.sin(TWO_PI * cycles(1300 * (450 / 1300) ** (t / 0.25))) * np.exp(-t / 0.07) * 0.35
        self.add(pan(wo + pew, np.linspace(0.0, 0.7, n)), drop, 0.55, hall=0.15)
        # --- 1.8 unfold: giant glassy WHOOM + sub + shimmer + ground ring
        tu = E('unfold')
        n = ns(1.4)
        t = tvec(n)
        sub = np.sin(TWO_PI * cycles(34 + 18 * np.exp(-t / 0.3))) * np.minimum(t / 0.03, 1) * np.exp(-t / 0.55)
        self.add(sub, tu, 0.7)
        wm = I.braam([38, 45, 50, 57], 0.6, 'whoom', bright=1.3, drv=2.0, attack=0.04, decay=0.25, sustain=0.2,
                     release=0.6, sub=0.0)
        self.add(wm, tu, 0.4, hall=0.45)
        rr = rng('unf')
        self.add(pings(np.sort(rr.exponential(0.18, 46)), 'unfp', 1800, 9500, (0.1, 0.5),
                       pans=rr.uniform(-1, 1, 46)), tu, 0.28, hall=0.5)
        ringn = np.vstack([lp(noise(n, 'ur0'), 900), lp(noise(n, 'ur1'), 900)]) * np.exp(-t / 0.35) * 1.6
        ringn[:, :ns(0.02)] *= np.linspace(0, 1, ns(0.02))
        self.add(ringn, tu, 0.5, hall=0.3)
        self.duck_events.append((tu, 5.0, 0.3, 0))
        # --- 2.2 dash whoosh + ground scrape, 2.35 grab
        td = E('dash')
        tg = td + 0.15
        self.add(whoosh(tg - td, 'dash', 300, 2600, 1.0, 1.4, -0.6, 0.2), td, 0.5, room=0.1)
        n = ns(0.3)
        t = tvec(n)
        grain = np.abs(smooth_noise(n, 60, 'scr', 1.0)) ** 1.5
        sc = bp(noise(n, 'scrape'), 260, 1900) * grain * np.interp(t, [0, 0.04, 0.1, 0.19], [0, 1, 0.5, 0]) * 3
        self.add(sc, tg + 0.02, 0.45, 0.1, room=0.25)
        n = ns(0.14)
        t = tvec(n)
        cloth = bp(noise(n, 'cloth'), 900, 5000) * (0.5 + 0.5 * np.sign(np.sin(TWO_PI * 38 * t))) * np.exp(-t / 0.04)
        self.add(cloth, tg, 0.4, 0.1, room=0.2)
        self.add(thump(150, 85, 0.04, 'grab'), tg, 0.45, room=0.2)
        # --- 2.8 swallow: liquid portal gulp + low warped vowel
        tw = E('swallow')
        for k, (a, b, dt) in enumerate(((170, 560, 0.0), (260, 820, 0.07), (140, 420, 0.15))):
            n = ns(0.12)
            t = tvec(n)
            bl = np.sin(TWO_PI * cycles(a * (b / a) ** (t / 0.06))) * np.exp(-t / 0.035)
            self.add(bl, tw + dt, 0.22, -0.2 + 0.2 * k, hall=0.3)
        n = ns(0.42)
        t = tvec(n)
        vf = 72 * 2 ** (-(t / 0.42) * 0.8 + 0.08 * np.sin(TWO_PI * 6 * t))
        src = saw(vf, n)
        mo = np.clip(t / 0.35, 0, 1)
        vo = formant(src, I.VOWELS['o'], 0.8) * (1 - mo) + formant(src, I.VOWELS['u'], 0.8) * mo
        vo *= np.minimum(t / 0.04, 1) * np.exp(-t / 0.2)
        self.add(fades(vo, 0, 0.05), tw, 0.55, hall=0.4)
        gl = tvf(noise(n, 'gurgle'), 'bp', 1500 * (280 / 1500) ** (t / 0.42), 6.0) * (0.6 + 0.4 * np.sin(TWO_PI * 17 * t))
        self.add(fades(gl * np.exp(-t / 0.18), 0.01, 0.05), tw, 0.6, hall=0.3)
        # --- 3.0 close: reverse metallic swell + hard slam
        tc = E('close')
        metal = self.metal_hit('close', 175)
        self.mx.add_end(fades(metal[:, :ns(0.5)][:, ::-1], 0.1, 0) * 0.6, tc, 0.5, hall=0.2)
        self.add(metal, tc, 0.6, hall=0.35)
        self.add(thump(110, 44, 0.12, 'closeth', 2.5), tc, 0.8)
        self.add(click('closec', 1.2), tc, 0.9)
        self.duck_events.append((tc, 6.0, 0.2, 0))
        # --- 3.2 - 3.4 dive: rushing tunnel wind rising, pitch up
        tv, ti = E('dive'), E('inside')
        n = ns(ti - tv + 0.12)
        t = tvec(n)
        u = np.clip(t / (ti - tv), 0, 1)
        nz = np.vstack([noise(n, 'dive0'), noise(n, 'dive1')])
        y = tvf(nz, 'bp', 300 * (5500 / 300) ** u, 1.6, 32)
        fl = np.vstack([np.interp(np.arange(n) - (6.0 - 5.4 * u) * SR / 1000, np.arange(n), c) for c in y])
        y = (y + 0.8 * fl) * (0.25 + 0.75 * u ** 1.5) * np.where(t > ti - tv, np.exp(-(t - (ti - tv)) / 0.03), 1)
        wh = np.sin(TWO_PI * cycles(380 * (2200 / 380) ** u)) * u ** 2 * 0.25
        self.add(y + np.vstack([wh, wh]), tv, 0.55, hall=0.1)
        # --- 3.4 arrival in hyperspace: soft airy bloom
        n = ns(0.9)
        t = tvec(n)
        bl = np.vstack([lp(noise(n, 'arr0'), 400), lp(noise(n, 'arr1'), 400)]) * np.minimum(t / 0.05, 1) * np.exp(-t / 0.3) * 3
        self.add(bl, ti, 0.4, void=0.6)
        # --- blinks: zaps (FM down-sweep + click)
        for k, tb in enumerate(tl.blinks()):
            if tl.in_stop(tb) or g0 <= tb < g1:
                continue
            self.add(fm_zap(f'zap{k}'), tb, 0.30, rng(f'zp{k}').uniform(-0.7, 0.7), void=0.25, room=0.1)
        # --- 6.4 clone split: six detuned shimmer layers, staggered, around the circle
        tcl = E('clones')
        for k in range(6):
            n = ns(0.6)
            t = tvec(n)
            f = 1174.7 * 2 ** ((k * 6 - 15) / 1200) * 2 ** ((2 / 12) * np.minimum(t / 0.4, 1))
            y = saw(f, n, k * 0.13) * 0.4 + np.sin(TWO_PI * cycles(f * 2.0)) * 0.5
            y = bp(y, 1500, 9000) * (0.6 + 0.4 * np.sin(TWO_PI * 17 * t + k)) * np.minimum(t / 0.02, 1) * np.exp(-t / 0.2)
            self.add(fades(y, 0, 0.1), tcl + k * 0.012 + 0.003, 0.12, np.sin(k * TWO_PI / 6), void=0.4)
        # --- 7.2 cracks: glass creaks (stick-slip impulse trains)
        tk = E('cracks')
        for k, dt in enumerate((0.0, 0.25, 0.45, 0.65)):
            self.add(self.creak(f'creak{k}', 0.16 + 0.04 * k), tk + dt, 0.35 + 0.08 * k, rng(f'cp{k}').uniform(-0.8, 0.8),
                     void=0.3)
        # --- 8.0 charge whine rising, cut by the gap
        tr = E('ring')
        n = ns(g0 - tr)
        t = tvec(n)
        u = t / (g0 - tr)
        f = 900 * (3800 / 900) ** (u ** 1.3)
        y = sum(np.sin(TWO_PI * cycles(f * (1 + 0.004 * k)) + (0.5 + 2 * u) * np.sin(TWO_PI * cycles(f * 0.5))) for k in range(3))
        y = y / 3 * (0.1 + 0.9 * u ** 2) + bp(noise(n, 'whn'), 2000, 8000) * u ** 3 * 0.4
        self.add(fades(y, 0.02, 0.002), tr, 0.22, void=0.2)
        # --- 8.6 clones shatter into light + sphere shockwave
        tv2 = E('clones_vanish')
        for k in range(6):
            pk = np.sin(k * TWO_PI / 6 + 0.3) * 0.85
            burst = hp(noise(ns(0.12), f'cs{k}'), 2500) * np.exp(-tvec(ns(0.12)) / 0.025)
            self.add(burst, tv2 + k * 0.028, 0.25, pk, hall=0.2)
            rr = rng(f'csp{k}')
            self.add(pings(np.sort(rr.exponential(0.05, 9)), f'csp{k}', 2500, 10000, (0.05, 0.25),
                           pans=np.full(9, pk)), tv2 + k * 0.028, 0.2, hall=0.3)
        n = ns(0.7)
        t = tvec(n)
        sw = np.vstack([lp(noise(n, 'sw0'), 2200), lp(noise(n, 'sw1'), 2200)]) * np.minimum(t / 0.015, 1) * np.exp(-t / 0.16) * 1.6
        self.add(sw, tv2, 0.45, hall=0.4)
        self.add(boom(0.8, 'swboom', 52), tv2, 0.35, hall=0.3)
        # --- 9.2 energy gather: sucking reverse + rising whine
        ta, th = E('above'), E('hammer')
        suck = I.reverse_swell(boom(0.4, 'sucksrc', 60) + np.vstack([crunch(0.1, 'suckc', 1500)] * 2)[:, :ns(0.4)],
                               self.irs['hall'], th - ta)
        self.mx.add_end(fades(suck, 0, 0.01), th - 0.02, 0.45)
        n = ns(th - ta)
        t = tvec(n)
        u = t / (th - ta)
        y = np.sin(TWO_PI * cycles(500 * (2600 / 500) ** (u ** 1.2))) + 0.4 * np.sin(TWO_PI * cycles(750 * (3900 / 750) ** (u ** 1.2)))
        self.add(fades(y * u ** 2, 0.03, 0.01)[:ns(th - ta - 0.015)], ta, 0.18, hall=0.2)
        # --- 9.65 the tesseract shatters: glass explosion, many pings, shards falling to 11
        tx = E('exit')
        n = ns(0.8)
        t = tvec(n)
        gb = np.vstack([hp(noise(n, 'gx0'), 1600), hp(noise(n, 'gx1'), 1600)]) * np.exp(-t / 0.12) * np.minimum(t / 0.001, 1)
        self.add(lp(gb, 12000), tx, 0.5, hall=0.35)
        self.add(boom(1.0, 'implode', 40), tx, 0.4, hall=0.3)
        rr = rng('shatter')
        nt = 150
        self.add(pings(np.sort(rr.exponential(0.14, nt)), 'shp', 2000, 11000, (0.06, 0.4), amp_tau=0.4,
                       pans=rr.uniform(-1, 1, nt)), tx, 0.30, hall=0.4)
        fall_end = tx + 1.35
        ntk = 80
        tt = np.sort(0.05 + (fall_end - tx - 0.05) * rr.random(ntk) ** 1.6)
        self.add(pings(tt, 'tinkle', 2500, 9000, (0.04, 0.2), amp_tau=0.9, pans=rr.uniform(-1, 1, ntk)), tx, 0.16,
                 hall=0.45)
        self.duck_events.append((tx, 6.0, 0.3, 0))
        # --- 9.8 meteor roar (rising noise + doppler whistle) into 9.85 crater
        tm, tcr = E('meteor'), E('crater')
        ms = tx + 0.02
        n = ns(tcr - ms)
        t = tvec(n)
        u = t / (tcr - ms)
        roar = tvf(np.vstack([noise(n, 'mr0'), noise(n, 'mr1')]), 'lp', 300 * (4500 / 300) ** u, 1.2, 32) * u ** 1.8 * 1.5
        wh = np.sin(TWO_PI * cycles(650 * (1150 / 650) ** u)) * u ** 2 * 0.25
        self.add(fades(roar + np.vstack([wh, wh]), 0.01, 0.002), ms, 0.6)
        # --- 9.85 crater: second-biggest boom, wide, debris raining to 11
        self.add(thump(115, 36, 0.34, 'crth', 3.2), tcr, 0.85)
        self.add(click('crc', 0.9, 1.0), tcr, 1.0)
        self.add(np.vstack([click('crcL', 1.1), click('crcR', 0.9)]), tcr + 0.001, 0.6)
        self.add(boom(2.0, 'crboom', 38, width=1.0), tcr, 0.9, hall=0.45)
        self.add(I.subdrop(1.4, 76, 31, 'crsub'), tcr, 0.45)
        env = np.exp(-tvec(ns(0.5)) / 0.09) * 3
        gc = np.vstack([drive(bp(noise(ns(0.5), f'crg{c}'), 200, 2600) * env, 3.0) for c in range(2)])
        self.add(gc, tcr, 0.5, room=0.3, hall=0.3)
        self.add(debris(1.25, 'crdeb', 160, 700, 5500, 0.45, hiss=0.5), tcr + 0.05, 0.3, room=0.25, hall=0.25)
        self.duck_events.append((tcr, 12.0, 0.6, 0.05))
        # --- 10.4 landing: heavy thud + dust
        tl_ = E('land')
        self.add(thump(98, 38, 0.2, 'landth', 2.6), tl_, 0.85, room=0.3)
        self.add(click('landc', 0.8), tl_, 0.6)
        self.add(crunch(0.06, 'landk', 900), tl_, 0.5, room=0.3)
        n = ns(0.9)
        t = tvec(n)
        dust = np.vstack([lp(noise(n, 'du0'), 1500), lp(noise(n, 'du1'), 1500)]) * np.interp(t, [0, 0.06, 0.9], [0, 1, 0]) ** 1.5
        self.add(dust, tl_, 0.35, hall=0.2)
        self.add(debris(0.6, 'landdeb', 30, 900, 4500, 0.2), tl_ + 0.06, 0.15)
        self.duck_events.append((tl_, 5.0, 0.3, 0))
        # --- 11.4 rise: wind + cloth
        tri = E('rise')
        n = ns(1.5)
        t = tvec(n)
        wind = tvf(np.vstack([noise(n, 'wr0'), noise(n, 'wr1')]), 'bp', 450 * (1300 / 450) ** np.sin(np.pi * t / 1.5), 2.0, 64)
        wind *= np.sin(np.pi * np.clip(t / 1.5, 0, 1)) ** 2
        self.add(wind, tri - 0.1, 0.35, hall=0.2)
        n = ns(0.85)
        t = tvec(n)
        fl = 0.5 + 0.5 * np.sin(TWO_PI * cycles(11 + 3 * smooth_noise(n, 3, 'fl')))
        cl = bp(noise(n, 'cloth2'), 1200, 4200) * fl ** 3 * np.sin(np.pi * t / 0.85) ** 2
        self.add(cl, tri, 0.3, -0.2, room=0.2)
        # --- 12.0 title: metallic glitch stab
        tt_ = E('title')
        st = self.metal_hit('title', 330, ratio=1.414)[:, :ns(0.6)]
        n = ns(0.4)
        t = tvec(n)
        rm = np.sin(TWO_PI * 1720 * t) * np.exp(-t / 0.06)
        st[:, :n] += np.vstack([rm, rm]) * 0.4
        gl = I.glitch_stutter(st, [(0.0, 0.05), (0.05, 0.035), (0.09, 0.05), (0.15, 0.04), (0.2, 0.45)], 'tglitch')
        self.add(gl, tt_, 0.5, hall=0.3)
        self.add(click('titc', 1.3), tt_, 0.6)

    def intro_events(self):
        """v2 world intro: the charge snap, palm flick, coil, the kick wind-up and the walk to the cube."""
        tl = self.tl
        E = tl.ev
        drop = E('throw')
        # --- charge snap: impact into the stance, ground cracks, aura burst (the hum starts here too)
        tc = E('charge')
        self.add(click('chc', 0.9), tc, 0.7)
        self.add(thump(135, 48, 0.12, 'chth', 2.2), tc, 0.8, room=0.2)
        self.add(crunch(0.06, 'chk', 1300), tc, 0.6, room=0.2, hall=0.1)
        self.add(debris(0.7, 'chdeb', 45, 900, 4500, 0.25, hiss=0.3), tc + 0.04, 0.18, room=0.2)
        n = ns(0.6)
        t = tvec(n)
        fc = 600 * (4000 / 600) ** np.clip(t / 0.25, 0, 1)
        aura = tvf(np.vstack([noise(n, 'aur0'), noise(n, 'aur1')]), 'bp', fc, 1.0, 32) * np.minimum(t / 0.01, 1) * \
            np.exp(-t / 0.18)
        self.add(aura, tc, 0.35, hall=0.3)
        self.duck_events.append((tc, 4.0, 0.25, 0))
        # --- palm snaps open: a flick and a little crackle
        tp = E('palm_open')
        self.mx.add_end(whoosh(0.07, 'flick', 900, 4200, 1.2), tp, 0.25)
        n = ns(0.25)
        t = tvec(n)
        r = rng('crk')
        imp = (r.random(n) < 0.004) * r.uniform(-1, 1, n) * np.exp(-t / 0.08)
        self.add(reson(imp, 5200, 3, 6.0) + reson(imp, 2900, 4, 4.0), tp, 0.3, 0.15, hall=0.2)
        # --- coil: cloth stretch + an energy suck into the throw
        tk = E('coil')
        n = ns(drop - tk)
        t = tvec(n)
        cs = bp(noise(n, 'coilc'), 700, 3200) * (0.5 + 0.5 * np.abs(smooth_noise(n, 25, 'coilg', 2.0))) * \
            np.sin(np.pi * np.clip(t / (drop - tk), 0, 1)) ** 2
        self.add(cs, tk, 0.2, -0.2, room=0.2)
        src = boom(0.3, 'coilsrc', 70) + np.vstack([hp(noise(ns(0.3), 'coiln'), 2000) * np.exp(-tvec(ns(0.3)) / 0.05)] * 2)
        self.mx.add_end(fades(I.reverse_swell(src, self.irs['hall'], drop - tk), 0, 0.01), drop - 0.02, 0.3)
        # --- kick wind-up: the leg chambers (slow, then the hit's own pre-whoosh snaps in)
        tw = E('kick_windup')
        n = ns(0.16)
        t = tvec(n)
        sw = tvf(noise(n, 'chamber'), 'bp', 400 * (1500 / 400) ** (t / 0.16), 1.0, 32) * np.sin(np.pi * t / 0.16) ** 2
        self.add(sw, tw, 0.25, 0.2, room=0.2)
        # --- the walk to the cube: three calm footsteps in the grass
        ta, tv = E('approach'), E('dive')
        steps = [round(ta + 0.05 + k * (tv - 0.15 - ta - 0.05) / 2, 3) for k in range(3)]
        self.step_times = steps
        for k, ts in enumerate(steps):
            r = rng(f'step{k}')
            self.add(thump(115 * r.uniform(0.9, 1.1), 62, 0.035, f'stp{k}', 1.6), ts, 0.45, room=0.2)
            m = ns(0.12)
            gr = bp(noise(m, f'grass{k}'), 1200, 6000) * np.exp(-tvec(m) / 0.03) * \
                (0.6 + 0.4 * (r.random(m) < 0.3))
            self.add(gr, ts + 0.004, 0.3, -0.25 + 0.5 * (k % 2), room=0.2)

    def metal_hit(self, key, f0, ratio=None):
        r = rng(key)
        n = ns(1.6)
        t = tvec(n)
        modes = [1.0, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50, 4.1, 4.9, 5.6]
        out = np.zeros((2, n))
        for k, m in enumerate(modes):
            f = f0 * m * r.uniform(0.98, 1.02)
            d = r.uniform(0.15, 0.8) / (1 + 0.2 * k)
            for ch in range(2):
                out[ch] += r.uniform(0.3, 1.0) * np.sin(TWO_PI * f * (1 + 0.002 * ch) * t + r.uniform(0, 6.3)) * np.exp(-t / d)
        if ratio:
            I_ = 6 * np.exp(-t / 0.25)
            fm = np.sin(TWO_PI * f0 * t + I_ * np.sin(TWO_PI * f0 * ratio * t)) * np.exp(-t / 0.5)
            out += np.vstack([fm, fm]) * 1.5
        out /= np.max(np.abs(out)) + 1e-9
        out[:, :ns(0.001)] *= np.linspace(0, 1, ns(0.001))
        hit = hp(noise(n, key + 'n'), 1500) * np.exp(-t / 0.01)
        return drive(out + np.vstack([hit, hit]) * 0.6, 1.5)

    def creak(self, key, dur):
        r = rng(key)
        n = ns(dur + 0.25)
        t = tvec(n)
        rate = 40 * (450 / 40) ** np.clip(t / dur, 0, 1)
        ph = np.cumsum(rate) / SR
        imp = np.diff(np.floor(ph), prepend=0) * (t < dur) * r.uniform(0.3, 1.0, n)
        y = sum(reson(imp, r.uniform(1800, 6500), r.uniform(8, 20), 8.0) for _ in range(4))
        y += reson(imp, r.uniform(280, 600), 6, 4.0)
        y = fades(y * (0.4 + 0.6 * np.clip(t / dur, 0, 1)), 0.01, 0.1)
        tail = pings([dur * 0.95], key + 't', 3000, 8000, (0.08, 0.2), pans=[0.0], length=dur + 0.25)
        return y / (np.max(np.abs(y)) + 1e-9) + tail.sum(0)[:n] * 0.7

    # ------------------------------------------------------------------------------------------------ ambience
    def ambience(self):
        tl = self.tl
        n_all = self.n
        # hyperspace: alien FM drone + resonant air + metallic groans
        for a, b in tl.space_ranges('inside'):
            n = ns(b - a)
            t = tvec(n)
            y1 = np.sin(TWO_PI * 73.4 * t + 1.4 * np.sin(TWO_PI * 147.5 * t)) * (0.6 + 0.4 * np.sin(TWO_PI * 0.37 * t))
            y2 = np.sin(TWO_PI * 51.9 * t + 0.8 * np.sin(TWO_PI * 104.1 * t)) * (0.6 + 0.4 * np.sin(TWO_PI * 0.23 * t + 1))
            dr = np.vstack([y1 + 0.6 * y2, 0.6 * y1 + y2]) * 0.5
            air = tvf(np.vstack([noise(n, 'air0'), noise(n, 'air1')]), 'bp',
                      900 * 2 ** (1.3 * np.sin(TWO_PI * 0.21 * t)), 4.0, 64) * 0.5
            amb = (dr + air) * np.minimum(t / 0.3, 1)
            self.amb.add(fades(amb, 0, 0.01), a, 0.16, void=0.5)
            for k, tg in enumerate(np.arange(a + 1.2, b - 0.8, 1.6)):
                m = ns(1.0)
                tt = tvec(m)
                g = tvf(saw(58 * 2 ** (smooth_noise(m, 2, f'gr{k}', 0.4) / 12) * (1 + 0.3 * tt), m), 'bp',
                        300 * (1400 / 300) ** (tt / 1.0), 8.0, 64)
                self.amb.add(fades(g * np.sin(np.pi * tt / 1.0) ** 2, 0.05, 0.05), tg, 0.10,
                             rng(f'grp{k}').uniform(-0.8, 0.8), void=0.7)
        # world: wind over the field
        for a, b in tl.space_ranges('world'):
            b = min(b, tl.ev('fade_out'))
            n = ns(b - a)
            t = tvec(n)
            w = tvf(np.vstack([noise(n, f'wind0{a}', 'pink'), noise(n, f'wind1{a}', 'pink')]), 'bp',
                    500 * 2 ** smooth_noise(n, 0.4, f'wf{a}', 1.2), 1.0, 64)
            w *= 0.6 + 0.4 * (smooth_noise(n, 0.7, f'wg{a}', 1.5) + 1) / 2
            self.amb.add(fades(w, 0.3, 0.05), a, 0.05)

    def render(self):
        self.ambience()
        self.events()
        self.intro_events()
        self.hits()
        return self

    def fade_curve(self):
        """SFX fade with the picture: 13.9 -> 14.4 (fade_out)."""
        t1 = self.tl.ev('fade_out')
        t0 = t1 - 0.5
        t = tvec(self.n)
        return np.clip((t1 - t) / (t1 - t0), 0, 1) ** 1.5
