"""Verification (we can't listen, so we measure): onset sync per HIT, loudness, true peak, gap silence, DC, clipping,
RMS + band energy per section, HF fizz, and the check plot (waveform + spectrogram + loudness with every HIT/EVENT)."""
import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d

from dsp import SR, db, hp, ns
from mix import loudness, true_peak

KIND_COL = {'light': '#2a78d6', 'medium': '#eb6834', 'heavy': '#1baf7a', 'mega': '#e34948'}
KIND_W = {'light': 0.8, 'medium': 1.1, 'heavy': 1.6, 'mega': 2.4}
BANDS = [('sub<60', 0, 60), ('low60-250', 60, 250), ('mid250-2k', 250, 2000), ('hmid2-8k', 2000, 8000),
         ('high8-14k', 8000, 14000), ('air>14k', 14000, 24000)]


def onset_function(y):
    """Onset strength at sample n (dB): power of the high-passed mono mix in the next 1.5 ms over the mean power of
    the 10 ms before n. Linear averaging, so random nulls of noisy material (whooshes) don't register as onsets."""
    m = hp(y.mean(axis=0), 300, 2)
    p = m ** 2
    cs = np.concatenate([[0.0], np.cumsum(p)])
    n = len(p)
    A, Bk = ns(0.0015), ns(0.010)
    idx = np.arange(n)
    after = (cs[np.minimum(idx + A, n)] - cs[idx]) / A
    before = (cs[idx] - cs[np.maximum(idx - Bk, 0)]) / Bk
    return 10 * np.log10((after + 1e-12) / (before + 1e-12))


def onset_sync(y, hits, win=0.025, gr=None):
    rise = onset_function(y)
    mono = y.mean(axis=0, keepdims=True)
    rows = []
    for h in hits:
        a, b = ns(h['t'] - win), ns(h['t'] + win)
        seg = rise[a:b]
        k = int(np.argmax(seg))
        pk = seg[k]
        t_on = (a + k) / SR
        i = ns(h['t'])
        after = np.sqrt(np.mean(mono[:, i:i + ns(0.03)] ** 2))
        before = np.sqrt(np.mean(mono[:, i - ns(0.045):i - ns(0.005)] ** 2))
        rows.append(dict(t=h['t'], kind=h['kind'], by=h['by'], onset=t_on, off_ms=(t_on - h['t']) * 1000, rise_db=pk,
                         pop_db=float(db(after) - db(before)),
                         gr_db=float(-db(gr[i:i + ns(0.01)].min())) if gr is not None else 0.0))
    return rows, rise


def section_stats(y, tl):
    out = []
    for s in tl.SECTIONS + [dict(id='tail', t0=tl.SECTIONS[-1]['t1'], t1=tl.LENGTH)]:
        seg = y[:, ns(s['t0']):ns(s['t1'])]
        rms = float(db(np.sqrt(np.mean(seg ** 2)) + 1e-12))
        spec = np.abs(np.fft.rfft(seg.mean(axis=0))) ** 2
        f = np.fft.rfftfreq(seg.shape[-1], 1 / SR)
        tot = spec.sum() + 1e-20
        bands = {name: 100 * spec[(f >= lo) & (f < hi)].sum() / tot for name, lo, hi in BANDS}
        L, R = seg[0] - seg[0].mean(), seg[1] - seg[1].mean()
        corr = float(np.sum(L * R) / (np.sqrt(np.sum(L ** 2) * np.sum(R ** 2)) + 1e-20))
        out.append(dict(id=s['id'], t0=s['t0'], t1=s['t1'], rms=rms, bands=bands, corr=corr))
    return out


def hf_fizz(y):
    """Max short-term (50 ms) level of content above 14 kHz, in dBFS and relative to the full band at that moment."""
    m = y.mean(axis=0)
    hi = hp(m, 14000, 4)
    L = ns(0.05)
    eh = np.maximum(uniform_filter1d(hi ** 2, L), 0)
    ef = np.maximum(uniform_filter1d(m ** 2, L), 0)
    k = int(np.argmax(eh))
    act = ef > 10 ** (-40 / 10)
    rel = 10 * np.log10((eh[act] + 1e-20) / (ef[act] + 1e-20))
    return (float(10 * np.log10(eh[k] + 1e-20)), float(10 * np.log10((eh[k] + 1e-20) / (ef[k] + 1e-20))), k / SR,
            float(np.percentile(rel, 90)), float(np.percentile(10 * np.log10(eh + 1e-20), 90)))


def report(y16, music, sfx, tl, gl_db, gr, gen_time, log=print):
    y = y16.astype(np.float64) / 32768.0
    res = {}
    I, mt, ml = loudness(y)
    tp, sp = true_peak(y)
    res.update(lufs=I, true_peak=tp, sample_peak=sp)
    g0, g1 = tl.gap()
    gap = y[:, ns(g0):ns(g1)]
    gap_after10 = y[:, ns(g0 + 0.01):ns(g1)]
    res['gap_rms'] = float(db(np.sqrt(np.mean(gap ** 2)) + 1e-15))
    res['gap_rms_after10ms'] = float(db(np.sqrt(np.mean(gap_after10 ** 2)) + 1e-15))
    res['gap_peak_after10ms'] = float(db(np.abs(gap_after10).max() + 1e-15))
    res['dc'] = [float(c) for c in y.mean(axis=1)]
    res['clipped'] = int(np.sum(np.abs(y16.astype(np.int32)) >= 32767))
    rows, rise = onset_sync(y, tl.HITS, gr=gr)
    res['onsets'] = rows
    offs = np.array([r['off_ms'] for r in rows])
    res['onset_max_abs_ms'] = float(np.abs(offs).max())
    res['sections'] = section_stats(y, tl)
    res['fizz'] = hf_fizz(y)
    res['limiter_gr_max_db'] = float(-db(gr.min()))
    res['limiter_gr_mean_db'] = float(-np.mean(db(gr)))
    res['glue_gr_max_db'] = float(-gl_db.min())
    lo = y.mean(axis=0)
    res['crest_db'] = float(db(np.abs(lo).max()) - db(np.sqrt(np.mean(lo ** 2))))
    res['gen_time'] = gen_time
    res['_curves'] = dict(mt=mt, ml=ml, rise=rise)

    log('')
    log('=== ONSET SYNC (strongest onset within +/-25 ms of every HIT) ===')
    log(f'{"t":>6} {"kind":>7} {"by":>6} {"onset":>8} {"off ms":>7} {"rise dB":>8} {"pop dB":>7} {"lim GR":>7}')
    for r in rows:
        log(f'{r["t"]:6.2f} {r["kind"]:>7} {r["by"]:>6} {r["onset"]:8.4f} {r["off_ms"]:7.2f} {r["rise_db"]:8.1f} '
            f'{r["pop_db"]:7.1f} {r["gr_db"]:7.1f}')
    log(f'hits: {len(rows)}   max |offset| = {res["onset_max_abs_ms"]:.2f} ms   mean = {offs.mean():.2f} ms   '
        f'min rise = {min(r["rise_db"] for r in rows):.1f} dB   median pop (30 ms after vs 40 ms before) = '
        f'{np.median([r["pop_db"] for r in rows]):.1f} dB   -> {"PASS" if res["onset_max_abs_ms"] <= 10 else "FAIL"}')
    log('')
    log('=== LEVELS ===')
    log(f'integrated loudness  {I:6.2f} LUFS (BS.1770 K-weighted, gated)')
    log(f'true peak            {tp:6.2f} dBTP (4x oversampled)   sample peak {sp:6.2f} dBFS   clipped samples {res["clipped"]}')
    log(f'crest factor         {res["crest_db"]:6.2f} dB   limiter GR max {res["limiter_gr_max_db"]:.2f} dB / mean '
        f'{res["limiter_gr_mean_db"]:.2f} dB   glue GR max {res["glue_gr_max_db"]:.2f} dB')
    log(f'silence gap {g0:.2f}-{g1:.2f}: RMS {res["gap_rms"]:.1f} dBFS; after first 10 ms: RMS '
        f'{res["gap_rms_after10ms"]:.1f} dBFS, peak {res["gap_peak_after10ms"]:.1f} dBFS')
    log(f'DC offset L/R        {res["dc"][0]:+.2e} {res["dc"][1]:+.2e}')
    log(f'>14 kHz max (50 ms)  {res["fizz"][0]:.1f} dBFS, {res["fizz"][1]:.1f} dB rel. full band, at {res["fizz"][2]:.2f} s;'
        f' sustained (90th pct) {res["fizz"][4]:.1f} dBFS, {res["fizz"][3]:.1f} dB rel. full band')
    log('')
    log('=== SECTIONS: RMS and energy split per band (% of power) ===')
    hdr = ' '.join(f'{b[0]:>10}' for b in BANDS)
    log(f'{"section":>10} {"t0-t1":>11} {"RMS dBFS":>9} {"maxLUFSm":>9} {"L/R corr":>8} {hdr}')
    for s in res['sections']:
        bs = ' '.join(f'{s["bands"][b[0]]:10.1f}' for b in BANDS)
        sel = (mt >= s['t0']) & (mt < s['t1'])
        s['max_momentary'] = float(ml[sel].max()) if sel.any() else float('nan')
        log(f'{s["id"]:>10} {s["t0"]:5.2f}-{s["t1"]:5.2f} {s["rms"]:9.1f} {s["max_momentary"]:9.1f} {s["corr"]:8.2f} {bs}')
    log('')
    log(f'generation time {gen_time:.1f} s')
    return res


def plot(y16, music, sfx, tl, res, duck_db, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D

    y = y16.astype(np.float64) / 32768.0
    n = y.shape[-1]
    t = np.arange(n) / SR
    mono = y.mean(axis=0)
    fig = plt.figure(figsize=(22, 16), dpi=80)
    gs = fig.add_gridspec(5, 4, height_ratios=[1.3, 1.7, 1.0, 0.9, 1.0], hspace=0.42, wspace=0.18)
    shade = ['#f2f1ee', '#e4e3df']
    ink, muted = '#0b0b0b', '#52514e'

    def decorate(ax, lo, hi, events=True, labels=False, sections=True):
        if sections:
            for k, s in enumerate(tl.SECTIONS):
                ax.axvspan(s['t0'], s['t1'], color=shade[k % 2], zorder=0, lw=0)
                if labels:
                    ax.text((s['t0'] + s['t1']) / 2, 1.02, s['id'], transform=ax.get_xaxis_transform(), ha='center',
                            va='bottom', fontsize=9, color=muted)
        g0, g1 = tl.gap()
        ax.axvspan(g0, g1, color='#000000', alpha=0.10, zorder=0, lw=0)
        for h in tl.HITS:
            if lo <= h['t'] <= hi:
                ax.axvline(h['t'], color=KIND_COL[h['kind']], lw=KIND_W[h['kind']], alpha=0.9, zorder=3)
        if events:
            for e in tl.EVENTS:
                if lo <= e['t'] <= hi:
                    ax.axvline(e['t'], color=muted, lw=0.7, ls=(0, (3, 3)), alpha=0.8, zorder=2)
        ax.set_xlim(lo, hi)

    # 1. waveform (min/max per pixel column) with section names and events
    ax = fig.add_subplot(gs[0, :])
    cols = 3000
    k = n // cols
    mm = mono[:k * cols].reshape(cols, k)
    tc = t[:k * cols].reshape(cols, k)[:, 0]
    ax.fill_between(tc, mm.min(1), mm.max(1), color='#3a3a38', lw=0, zorder=4)
    decorate(ax, 0, tl.LENGTH, labels=True)
    for e in tl.EVENTS:
        ax.text(e['t'], -1.12, e['id'], rotation=90, fontsize=6.5, color=muted, ha='right', va='bottom', zorder=5)
    ax.set_ylim(-1.15, 1.05)
    ax.set_ylabel('mix (mono)', color=ink)
    ax.set_title(f'«Гиперкуб» audio check — {res["lufs"]:.1f} LUFS, {res["true_peak"]:.2f} dBTP, gap RMS after 10 ms '
                 f'{res["gap_rms_after10ms"]:.0f} dBFS, onset max |offset| {res["onset_max_abs_ms"]:.1f} ms over '
                 f'{len(tl.HITS)} hits', fontsize=13, color=ink, loc='left', pad=22)
    leg = [Line2D([0], [0], color=KIND_COL[k_], lw=KIND_W[k_] + 1, label=f'HIT {k_}') for k_ in KIND_COL]
    leg += [Line2D([0], [0], color=muted, lw=1, ls=(0, (3, 3)), label='EVENT'),
            Patch(color='#000000', alpha=0.1, label='silence gap')]
    ax.legend(handles=leg, loc='upper left', ncol=6, fontsize=9, frameon=True, framealpha=0.85, edgecolor='none',
              bbox_to_anchor=(0.0, 1.0))

    # 2. spectrogram (log frequency)
    ax = fig.add_subplot(gs[1, :])
    f, ts, S = signal.spectrogram(mono, SR, nperseg=2048, noverlap=2048 - 256, scaling='spectrum')
    Sdb = 10 * np.log10(S + 1e-14)
    ax.pcolormesh(ts, f, Sdb, shading='auto', cmap='magma', vmin=-110, vmax=-20, rasterized=True)
    ax.set_yscale('log')
    ax.set_ylim(25, 24000)
    ax.axhline(14000, color='#ffffff', lw=0.6, ls=':', alpha=0.7)
    for h in tl.HITS:
        ax.axvline(h['t'], color=KIND_COL[h['kind']], lw=0.6, alpha=0.6, ymin=0.93, ymax=1.0)
    g0, g1 = tl.gap()
    ax.axvline(g0, color='w', lw=0.6, ls='--')
    ax.axvline(g1, color='w', lw=0.6, ls='--')
    ax.set_xlim(0, tl.LENGTH)
    ax.set_ylabel('Hz (log)')

    # 3. loudness curve + stem levels
    ax = fig.add_subplot(gs[2, :])
    mt, ml = res['_curves']['mt'], res['_curves']['ml']
    decorate(ax, 0, tl.LENGTH, events=False)

    def env_db(x, win=0.05):
        e = uniform_filter1d((x ** 2).mean(axis=0), ns(win))
        return 10 * np.log10(e + 1e-12)
    step = ns(0.01)
    ax.plot(t[::step], env_db(music)[::step], color='#6250d6', lw=1.0, label='music stem (50 ms RMS, dBFS)', zorder=4)
    ax.plot(t[::step], env_db(sfx)[::step], color='#eb6834', lw=1.0, label='SFX stem (50 ms RMS, dBFS)', zorder=4)
    ax.plot(mt, ml, color=ink, lw=1.8, label='mix momentary loudness (LUFS, 400 ms)', zorder=5)
    ax.plot(t[::step], duck_db[::step] - 50, color='#1baf7a', lw=0.9, label='music duck (dB, offset -50)', zorder=4)
    ax.axhline(res['lufs'], color=ink, lw=0.7, ls=':')
    ax.set_ylim(-75, 2)
    ax.set_ylabel('dB')
    ax.legend(loc='lower left', ncol=4, fontsize=9, frameon=False)

    # 4. onset offsets per hit
    ax = fig.add_subplot(gs[3, :])
    decorate(ax, 0, tl.LENGTH, events=False)
    for r in res['onsets']:
        ax.plot([r['t'], r['t']], [0, r['off_ms']], color=KIND_COL[r['kind']], lw=2)
        ax.plot(r['t'], r['off_ms'], 'o', color=KIND_COL[r['kind']], ms=5, mec='white', mew=1)
    ax.axhspan(-10, 10, color='#1baf7a', alpha=0.08, lw=0)
    ax.axhline(0, color=muted, lw=0.6)
    ax.set_ylim(-12, 12)
    ax.set_ylabel('onset offset (ms)')
    ax.text(0.01, 0.85, 'detected onset − hit.t per HIT (band = ±10 ms tolerance)', transform=ax.transAxes,
            fontsize=9, color=muted)

    # 5. zooms
    h1 = next(h for h in tl.HITS if h['kind'] in ('heavy', 'mega'))
    f0 = tl.sec('frenzy')[0]
    g0, g1 = tl.gap()
    hm, cr = tl.ev('hammer'), tl.ev('crater')
    zooms = [(h1['t'] - 0.15, h1['t'] + 0.2, f'first {h1["kind"]} {h1["t"]:.2f}'), (f0 - 0.05, f0 + 0.55, 'frenzy 16ths'),
             (g0 - 0.1, g1 + 0.3, f'gap → MEGA {g1:.2f}'), (hm - 0.1, cr + 0.4, f'hammer {hm:.2f} / exit / crater')]
    for j, (lo, hi, name) in enumerate(zooms):
        ax = fig.add_subplot(gs[4, j])
        a, b = ns(lo), ns(hi)
        env = 10 * np.log10(uniform_filter1d(mono[a:b] ** 2, ns(0.004)) + 1e-12)
        ax.plot(t[a:b], env.clip(-90, 0), color='#3a3a38', lw=0.7, zorder=4)
        decorate(ax, lo, hi, sections=False)
        for r in res['onsets']:
            if lo <= r['onset'] <= hi:
                ax.plot(r['onset'], -3, 'v', color=KIND_COL[r['kind']], ms=6, zorder=6)
        ax.set_ylim(-90, 2)
        ax.set_title(name, fontsize=10, color=ink, loc='left')
        if j == 0:
            ax.set_ylabel('4 ms RMS dBFS')
    for a_ in fig.axes:
        a_.tick_params(labelsize=8, colors=muted)
        for sp in a_.spines.values():
            sp.set_color('#c3c2b7')
    fig.savefig(path, dpi=80, bbox_inches='tight', facecolor='white')
    plt.close(fig)
