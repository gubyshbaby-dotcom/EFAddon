"""DSP building blocks: oscillators, envelopes, filters (static and time-varying), distortion, panning, buses, reverb IRs.
Everything is vectorised numpy/scipy; every random source is seeded from a string key (crc32), so output is deterministic."""
import zlib

import numpy as np
from scipy import signal

SR = 48000
TWO_PI = 2 * np.pi


# ---------------------------------------------------------------------------------------------------------- basics
def rng(key):
    return np.random.default_rng(zlib.crc32(str(key).encode()) & 0xFFFFFFFF)


def ns(sec):
    return int(round(sec * SR))


def tvec(n):
    return np.arange(n) / SR


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10.0 ** (np.asarray(d, dtype=float) / 20.0)


def as_arr(f, n):
    if np.isscalar(f):
        return np.full(n, float(f))
    return np.asarray(f, dtype=float)


def cycles(f, phase0=0.0):
    """Phase in cycles for a frequency curve (first sample at phase0)."""
    c = np.cumsum(f) / SR
    return c - c[0] + phase0


# ----------------------------------------------------------------------------------------------------- oscillators
def sine(f, n=None, phase0=0.0):
    f = as_arr(f, n)
    return np.sin(TWO_PI * cycles(f, phase0))


def _blep(t, dt):
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    out[m] = x * x + x + x + 1.0
    return out


def saw(f, n=None, phase0=0.0):
    """Band-limited (polyBLEP) sawtooth, -1..1."""
    f = as_arr(f, n)
    dt = np.clip(np.abs(f) / SR, 1e-9, 0.5)
    ph = cycles(f, phase0) % 1.0
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def square(f, n=None, phase0=0.0, duty=0.5):
    f = as_arr(f, n)
    dt = np.clip(np.abs(f) / SR, 1e-9, 0.5)
    ph = cycles(f, phase0) % 1.0
    s = np.where(ph < duty, 1.0, -1.0)
    return s + _blep(ph, dt) - _blep((ph + 1.0 - duty) % 1.0, dt)


def noise(n, key, colour='white'):
    r = rng(key)
    x = r.standard_normal(n)
    if colour == 'pink':
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        x = signal.lfilter(b, a, x) * 4.0
    elif colour == 'brown':
        x = signal.lfilter([1.0], [1.0, -0.995], x) * 0.08
    return x


def smooth_noise(n, rate, key, depth=1.0):
    """Slow random wobble (rate Hz), unit-ish amplitude: for vibrato jitter, wind gusts, drift."""
    k = max(2, int(n * rate / SR) + 3)
    pts = rng(key).standard_normal(k)
    x = np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)
    return signal.sosfilt(signal.butter(1, max(rate, 0.05), 'low', fs=SR, output='sos'), x) * depth


# ------------------------------------------------------------------------------------------------------- envelopes
def env_exp(n, tau, attack=0.001, curve='lin'):
    t = tvec(n)
    e = np.exp(-t / max(tau, 1e-5))
    a = ns(attack)
    if a > 1:
        r = np.linspace(0, 1, a)
        e[:a] *= (np.sin(r * np.pi / 2) ** 2) if curve == 'sin' else r
    return e


def env_adsr(n, a, d, s, r, gate):
    """Linear-attack, exp-decay ADSR with release starting at gate seconds."""
    t = tvec(n)
    e = np.where(t < a, t / max(a, 1e-5), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-5)))
    g = ns(gate)
    if g < n:
        lvl = e[min(g, n - 1)]
        tr = t[g:] - gate
        e[g:] = lvl * np.exp(-tr / max(r, 1e-5))
    return e


def fades(x, fin=0.0, fout=0.0):
    x = np.array(x, dtype=float, copy=True)
    n = x.shape[-1]
    a, b = min(ns(fin), n), min(ns(fout), n)
    if a > 1:
        x[..., :a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b > 1:
        x[..., n - b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def ramp(n, t_pts, v_pts, log=False):
    """Piecewise-linear (or log-linear) curve sampled per sample from breakpoints in seconds."""
    t = tvec(n)
    if log:
        return np.exp(np.interp(t, t_pts, np.log(np.maximum(v_pts, 1e-9))))
    return np.interp(t, t_pts, v_pts)


# --------------------------------------------------------------------------------------------------------- filters
def _sos(kind, f, order=2):
    nyq = SR / 2
    if kind in ('low', 'high'):
        return signal.butter(order, min(f, nyq * 0.98), kind, fs=SR, output='sos')
    lo, hi = f
    return signal.butter(order, [max(lo, 5), min(hi, nyq * 0.98)], 'band', fs=SR, output='sos')


def lp(x, f, order=2):
    return signal.sosfilt(_sos('low', f, order), x, axis=-1)


def hp(x, f, order=2):
    return signal.sosfilt(_sos('high', f, order), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos('band', (lo, hi), order), x, axis=-1)


def rbj(kind, f, q, gain_db=0.0):
    w0 = TWO_PI * np.clip(f, 5.0, SR * 0.49) / SR
    c, s = np.cos(w0), np.sin(w0)
    al = s / (2 * q)
    if kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == 'bp':          # 0 dB peak gain
        b = [al, 0.0, -al]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind in ('lowshelf', 'highshelf'):
        A = 10 ** (gain_db / 40)
        sq = 2 * np.sqrt(A) * al
        if kind == 'lowshelf':
            b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
            a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
        else:
            b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
            a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def reson(x, f, q, gain=1.0):
    b, a = rbj('bp', f, q)
    return signal.lfilter(b * gain, a, x, axis=-1)


def peq(x, f, q, gain_db):
    b, a = rbj('peak', f, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def shelf(x, kind, f, gain_db, q=0.707):
    b, a = rbj(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def tvf(x, kind, f, q=0.707, block=32):
    """Time-varying biquad (RBJ), coefficients updated every `block` samples; x mono or (2, n); f per-sample array or scalar."""
    x = np.asarray(x, dtype=float)
    n = x.shape[-1]
    f = as_arr(f, n)
    q = as_arr(q, n)
    y = np.empty_like(x)
    zi = np.zeros(x.shape[:-1] + (2,))
    for i in range(0, n, block):
        j = min(i + block, n)
        m = (i + j) // 2
        b, a = rbj(kind, f[m], q[m])
        y[..., i:j], zi = signal.lfilter(b, a, x[..., i:j], axis=-1, zi=zi)
    return y


def formant(x, formants, scale=1.0):
    """Parallel resonator bank [(freq, gain, bandwidth), ...]."""
    y = np.zeros_like(x)
    for f, g, bw in formants:
        fc = f * scale
        y += reson(x, fc, fc / bw, g)
    return y


# ------------------------------------------------------------------------------------------------------ distortion
def drive(x, k, os=1, asym=0.0):
    """tanh saturation normalised to unity small-signal gain-ish; os = oversampling factor."""
    if os > 1:
        y = signal.resample_poly(x, os, 1, axis=-1)
    else:
        y = x
    y = np.tanh(k * (y + asym)) - np.tanh(k * asym)
    y = y / np.tanh(k)
    if os > 1:
        y = signal.resample_poly(y, 1, os, axis=-1)[..., :x.shape[-1]]
    return y


def crush(x, hold, bits):
    """Sample-and-hold decimation plus bit reduction (glitch)."""
    n = x.shape[-1]
    idx = (np.arange(n) // hold) * hold
    y = x[..., idx]
    q = 2 ** (bits - 1)
    return np.round(y * q) / q


# --------------------------------------------------------------------------------------------------------- spatial
def pan(mono, p):
    p = np.clip(p, -1, 1)
    a = (p + 1) * np.pi / 4
    return np.vstack([mono * np.cos(a), mono * np.sin(a)])


def stereo(x):
    x = np.asarray(x, dtype=float)
    return x if x.ndim == 2 else np.vstack([x, x]) * np.sqrt(0.5)


def width(st, w):
    """Mid/side width: 0 = mono, 1 = unchanged, >1 wider."""
    m = (st[0] + st[1]) / 2
    s = (st[0] - st[1]) / 2 * w
    return np.vstack([m + s, m - s])


def mod_delay(x, base_ms, depth_ms, rate, phase=0.0):
    """Modulated delay line (vibrato / chorus / detune), linear interpolation."""
    n = x.shape[-1]
    t = tvec(n)
    d = (base_ms + depth_ms * np.sin(TWO_PI * rate * t + phase)) * SR / 1000.0
    pos = np.arange(n) - d
    return np.interp(pos, np.arange(n), x, left=0.0)


def time_warp(x, pos):
    """Read x (mono or stereo) at fractional sample positions pos (tape effects)."""
    idx = np.arange(x.shape[-1])
    if x.ndim == 1:
        return np.interp(pos, idx, x, left=0.0, right=0.0)
    return np.vstack([np.interp(pos, idx, c, left=0.0, right=0.0) for c in x])


# ----------------------------------------------------------------------------------------------------------- buses
class Mixer:
    """A stem: dry stereo bus plus reverb send buses (room / hall / void)."""
    SENDS = ('room', 'hall', 'void')

    def __init__(self, n):
        self.n = n
        self.dry = np.zeros((2, n))
        self.send = {k: np.zeros((2, n)) for k in self.SENDS}

    def add(self, sig, t, gain=1.0, p=0.0, room=0.0, hall=0.0, void=0.0, dry=1.0):
        sig = np.asarray(sig, dtype=float)
        st = pan(sig, p) if sig.ndim == 1 else sig
        st = st * gain
        i0 = ns(t)
        _add_into(self.dry, st * dry, i0)
        for k, v in (('room', room), ('hall', hall), ('void', void)):
            if v:
                _add_into(self.send[k], st * v, i0)

    def add_end(self, sig, t_end, gain=1.0, p=0.0, **kw):
        n = np.asarray(sig).shape[-1]
        self.add(sig, t_end - n / SR, gain, p, **kw)


def _add_into(buf, st, i0):
    n = buf.shape[-1]
    m = st.shape[-1]
    a, b = max(i0, 0), min(i0 + m, n)
    if b <= a:
        return
    buf[:, a:b] += st[:, a - i0:b - i0]


# ----------------------------------------------------------------------------------------------------- reverb IRs
def make_ir(rt60, length, key, predelay=0.0, bands=None, early=0, er_span=0.05, tone=None, metal=None):
    """Synthetic stereo IR: exponentially decaying noise split into bands with their own RT60 (highs die first),
    optional early reflections and metallic ringing partials (for the alien hyperspace). Unit energy per channel."""
    n = ns(length)
    t = tvec(n)
    r = rng(key)
    if bands is None:
        bands = [((20, 250), 1.15), ((250, 1200), 1.0), ((1200, 4000), 0.75), ((4000, 12000), 0.45)]
    ir = np.zeros((2, n))
    for ch in range(2):
        w = r.standard_normal(n)
        for (lo, hi), mult in bands:
            band = bp(w, lo, hi, 2)
            ir[ch] += band * np.exp(-6.91 * t / (rt60 * mult))
    a = ns(0.004)
    ir[:, :a] *= np.linspace(0, 1, a) ** 2
    if early:
        for _ in range(early):
            d = ns(r.uniform(0.003, er_span))
            g = r.uniform(0.3, 1.0) * np.exp(-d / SR / er_span)
            ch = r.integers(0, 2)
            ir[ch, d] += g * 6.0 * r.choice([-1, 1])
            ir[1 - ch, min(d + ns(r.uniform(0.0005, 0.003)), n - 1)] += g * 3.0 * r.choice([-1, 1])
    if tone:
        ir = lp(ir, tone, 2)
        tone = None
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    if metal:
        # alien ringing: decaying partials, each carrying `frac` of the IR energy
        for f, dec, frac in metal:
            for ch in range(2):
                s = np.sin(TWO_PI * f * (1 + 0.003 * ch) * t + r.uniform(0, 6.3)) * np.exp(-t / dec) * \
                    (1 - np.exp(-t / 0.05))
                ir[ch] += s * np.sqrt(frac / np.sum(s ** 2))
    if tone:
        ir = lp(ir, tone, 2)
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    if predelay:
        ir = np.hstack([np.zeros((2, ns(predelay))), ir])
    return ir


def convolve(x, ir):
    """Stereo x (2, n) with stereo IR (2, m); output trimmed to n."""
    from scipy.signal import fftconvolve
    n = x.shape[-1]
    return np.vstack([fftconvolve(x[c], ir[c])[:n] for c in range(2)])
