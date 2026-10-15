"""Mix: synthetic convolution reverbs (room / hall / void), silence-gap gating, sidechain ducking, mono low end,
master bus (glue compressor + true-peak lookahead limiter), BS.1770-style loudness, true peak."""
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

from dsp import SR, convolve, db, make_ir, ns, tvec, undb


def make_irs():
    return {
        'room': make_ir(0.42, 0.6, 'ir_room', early=18, er_span=0.03, tone=9000),
        'hall': make_ir(3.0, 3.8, 'ir_hall', predelay=0.028, early=10, er_span=0.08, tone=7500),
        'void': make_ir(4.8, 5.4, 'ir_void', predelay=0.045, tone=5200,
                        bands=[((20, 250), 1.25), ((250, 1200), 1.1), ((1200, 4000), 0.8), ((4000, 12000), 0.5)],
                        metal=[(97.0, 2.2, 0.05), (151.3, 1.8, 0.04), (233.1, 1.4, 0.03), (389.0, 1.1, 0.02),
                               (622.0, 0.8, 0.015)]),
    }


def gap_gate(n, g0, g1, fade=0.004):
    """1 outside the silence gap, 0 inside; a short fade ending exactly at g0, a hard start at g1."""
    t = tvec(n)
    g = np.ones(n)
    i0, i1 = ns(g0), ns(g1)
    f = ns(fade)
    g[i0 - f:i0] = np.cos(np.linspace(0, np.pi / 2, f)) ** 2
    g[i0:i1] = 0.0
    return g


def render_stem(mixer, irs, g0, g1, extra_gate=None):
    """dry + reverb returns. Reverb tails of material before the gap are cut at the gap and never come back."""
    n = mixer.n
    i0, i1 = ns(g0), ns(g1)
    gate = gap_gate(n, g0, g1)
    out = mixer.dry * gate
    for k, ir in irs.items():
        s = mixer.send[k]
        if not np.any(s):
            continue
        pre = convolve(s[:, :i0], ir)
        post = convolve(s[:, i1:], ir)
        out[:, :i0] += pre * gate[:i0]
        out[:, i1:] += post
    if extra_gate is not None:
        out *= extra_gate
    return out


def duck_curve(n, events, factor=1.0, attack=0.008, lead_default=0.002):
    """Sidechain gain (linear) from (t, depth_db, release_s, hold_s) events: fast lookahead attack (fully down `lead`
    before the hit, so the transient rises out of a dip; megas get a longer 30 ms breath), hold through the hit-stop,
    exponential release. Events: (t, depth_db, release_s, hold_s[, lead_s])."""
    gdb = np.zeros(n)
    for ev in events:
        t, depth, rel, hold = ev[:4]
        lead = ev[4] if len(ev) > 4 else lead_default
        if depth <= 0:
            continue
        a = ns(t - attack - lead)
        m = ns(attack + lead + hold + rel * 6)
        tt = np.arange(m) / SR - attack - lead
        shape = np.where(tt < -lead, 1 + (tt + lead) / attack, np.where(tt < hold, 1.0, np.exp(-(tt - hold) / rel)))
        seg = -depth * factor * np.clip(shape, 0, 1)
        lo, hi = max(a, 0), min(a + m, n)
        gdb[lo:hi] = np.minimum(gdb[lo:hi], seg[lo - a:hi - a])
    return undb(gdb), gdb


def mono_low(x, fc=120.0):
    """Collapse the side signal below fc to mono. The low band is zero-phase (forward-backward Butterworth, 4th order
    effective), so x - low is its exact complement: mid content passes untouched, only low side content is removed."""
    sos = signal.butter(2, fc, 'low', fs=SR, output='sos')
    low = signal.sosfiltfilt(sos, x, axis=-1)
    high = x - low
    m = low.mean(axis=0, keepdims=True)
    return high + np.vstack([m, m])


def glue(x, thr_db=-9.0, ratio=1.8, knee=6.0, att=0.02, rel=0.18, block=16):
    n = x.shape[-1]
    pw = uniform_filter1d((x ** 2).mean(axis=0), ns(0.008))
    nb = n // block
    lvl = 10 * np.log10(pw[:nb * block].reshape(nb, block).max(axis=1) + 1e-12)
    over = lvl - thr_db
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * (1 - 1 / ratio),
                                                   (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    aa = np.exp(-block / (att * SR))
    ar = np.exp(-block / (rel * SR))
    s = 0.0
    out = []
    for v in gr.tolist():
        s = aa * s + (1 - aa) * v if v > s else ar * s + (1 - ar) * v
        out.append(s)
    g_db = -np.array(out)
    centers = np.arange(nb) * block + block / 2
    g = undb(np.interp(np.arange(n), centers, g_db))
    return x * g, g_db


CLIP_STATS = {}


def softclip(x, ceiling_db=-1.25, knee_db=-1.5, top_db=3.0, os=4):
    """4x-oversampled soft clipper ahead of the limiter: linear below ceiling+knee_db, tanh-rounded above, asymptote at
    ceiling+top_db. It shaves the 1-2 ms click peaks so the limiter doesn't pump the body of every hit."""
    c = undb(ceiling_db)
    T, C = c * undb(knee_db), c * undb(top_db)
    up = signal.resample_poly(x, os, 1, axis=-1)
    a = np.abs(up)
    y = np.where(a <= T, up, np.sign(up) * (T + (C - T) * np.tanh((a - T) / (C - T))))
    d = y - up
    CLIP_STATS.update(removed_db=float(10 * np.log10(np.sum(d ** 2) / (np.sum(up ** 2) + 1e-20) + 1e-20)),
                      max_shave_db=float(db(a.max()) - db(np.abs(y).max())),
                      active_pct=float(100 * np.mean((a > T).any(axis=0))))
    return signal.resample_poly(y, 1, os, axis=-1)[..., :x.shape[-1]]


def _release(g, coef):
    s = 1.0
    out = []
    for v in g.tolist():
        if v < s:
            s = v
        else:
            s = v + (s - v) * coef
        out.append(s)
    return np.array(out)


def limiter(x, ceiling_db=-1.25, look=0.0015, release=0.06, os=4):
    """Lookahead brickwall on the 4x-oversampled (true-peak) level: the gain ramps down over the lookahead window
    and reaches the required value exactly at the peak; exponential release."""
    n = x.shape[-1]
    c = undb(ceiling_db)
    up = signal.resample_poly(x, os, 1, axis=-1)
    pk = np.abs(up).max(axis=0)[:n * os].reshape(n, os).max(axis=1)
    pk = np.maximum(pk, np.abs(x).max(axis=0))
    g_req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = max(ns(look), 2)
    g_la = minimum_filter1d(g_req, L, origin=-(L // 2))
    g_s = _release(g_la, np.exp(-1.0 / (release * SR)))
    g = uniform_filter1d(g_s, L, origin=(L - 1) // 2)
    g = np.minimum(g, 1.0)
    return x * g, g


# ------------------------------------------------------------------------------------------------- measurement
def k_weight(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def loudness(x):
    """Integrated loudness (BS.1770-4 gating) + momentary curve (400 ms blocks, 100 ms hop)."""
    y = k_weight(x)
    blk, hop = ns(0.4), ns(0.1)
    n = y.shape[-1]
    starts = np.arange(0, n - blk + 1, hop)
    cs = np.cumsum(np.concatenate([np.zeros((2, 1)), y ** 2], axis=1), axis=1)
    z = (cs[:, starts + blk] - cs[:, starts]) / blk
    zs = z.sum(axis=0)
    lk = -0.691 + 10 * np.log10(zs + 1e-20)
    m = lk > -70
    if not m.any():
        return -120.0, starts / SR + 0.2, lk
    rel = -0.691 + 10 * np.log10(zs[m].mean()) - 10
    m2 = m & (lk > rel)
    I = -0.691 + 10 * np.log10(zs[m2].mean())
    return float(I), (starts + blk / 2) / SR, lk


def true_peak(x, os=4):
    up = signal.resample_poly(x, os, 1, axis=-1)
    return float(db(np.abs(up).max())), float(db(np.abs(x).max()))


def master(x, pre_db):
    y = x * undb(pre_db)
    y, gl = glue(y)
    y = softclip(y)
    y, gr = limiter(y)
    return y, gl, gr


def master_to_target(x, target=-10.0, iters=5, log=print):
    """Find the pre-gain that lands the mastered integrated loudness on the target (secant on dB)."""
    I0, _, _ = loudness(x)
    g = target - I0
    tried = []
    for _ in range(iters):
        y, gl, gr = master(x, g)
        I, _, _ = loudness(y)
        tried.append((g, I))
        log(f'    master pass: pre-gain {g:+.2f} dB -> {I:.2f} LUFS')
        if abs(I - target) < 0.1:
            break
        if len(tried) >= 2:
            (ga, Ia), (gb, Ib) = tried[-2], tried[-1]
            slope = (Ib - Ia) / (gb - ga) if abs(gb - ga) > 1e-6 else 1.0
            slope = min(max(slope, 0.25), 1.0)
        else:
            slope = 0.8
        g = g + (target - I) / slope
    return y, g, gl, gr, I
