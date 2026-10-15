"""«Гиперкуб» score: 150 BPM phonk/hardstyle-trap drive fused with cinematic braams and choir, D phrygian with tritone
(Ab) colour. Every anchor is read from timeline.js (sections, events, hits), so the score follows the beat sheet.

Groups (ducked differently in the mix):
  beat  - kick, clap/snare, hats, 808, cowbell riff: gets the bus effects (dive HP sweep, underwater LP, aberration,
          tape stop) and half-depth ducking under hits;
  pads  - drone, choir, supersaw pads, risers, swells: full ducking;
  acc   - accents that hit WITH the picture (braams, orchestral stabs, crashes, sub drops): light ducking."""
import numpy as np

import instruments as I
from dsp import SR, Mixer, drive, fades, lp, mod_delay, ns, tvec, tvf

# MIDI note names used below (D phrygian + tritone Ab)
D1, Eb1, F1, Ab1, A1, Bb1, C2, D2, Eb2, F2, A2, Bb2 = 26, 27, 29, 32, 33, 34, 36, 38, 39, 41, 45, 46
C3, D3, Eb3, F3, G3, Ab3, A3, Bb3, C4, D4, Eb4, E4, F4, G4, Ab4, A4 = 48, 50, 51, 53, 55, 56, 57, 58, 60, 62, 63, 64, \
    65, 67, 68, 69
Bb4, C5, D5, Eb5, F5, Ab5, A5 = 70, 72, 74, 75, 77, 80, 81
Ab2, E3, G2 = 44, 52, 43
BREATH = 0.020      # reverse swells that lead into a hit stop just short of it, so the transient lands in a dip


class Score:
    def __init__(self, tl, irs):
        self.tl = tl
        self.irs = irs
        self.n = ns(tl.LENGTH)
        self.beat = Mixer(self.n)
        self.pads = Mixer(self.n)
        self.acc = Mixer(self.n)
        self.inside = tl.space_ranges('inside')
        self.skipped = []

    # ------------------------------------------------------------------------------------------------- helpers
    def is_inside(self, t):
        return any(a <= t < b for a, b in self.inside)

    def drum(self, sig, t, gain=1.0, p=0.0, room=0.12, void=0.1, hall=0.0):
        """Beat-bus transient; obeys hit-stop (no new transient while a hit is frozen) and the silence gap."""
        g0, g1 = self.tl.gap()
        if self.tl.in_stop(t) or (g0 - 0.002 <= t < g1):
            self.skipped.append(round(t, 3))
            return
        ins = self.is_inside(t)
        self.beat.add(sig, t, gain, p, room=0 if ins else room, void=void if ins else 0, hall=hall)

    def bass(self, notes, t0, t1, gain=0.42, key='808'):
        y = I.bass808(notes, t0, t1, key)
        self.beat.add(y, t0, gain, 0.0)

    def riff(self, t0, steps, gain=0.42, key='cb', bright=1.0, transpose=0):
        S = self.tl.STEP
        for k, (s, m) in enumerate(steps):
            t = t0 + s * S
            p = 0.18 * np.sin(k * 1.7)
            self.drum(I.cowbell(m + transpose, 1.0, f'{key}{k}', bright=bright), t, gain * (1.0 if k % 2 == 0 else 0.86),
                      p, room=0.2, void=0.18)

    def hats(self, t0, t1, every, gain=0.16, key='hat', accent=(1.0, 0.45, 0.7, 0.5), tone=1.0):
        t = t0
        k = 0
        while t < t1 - 1e-6:
            v = accent[k % len(accent)]
            self.drum(I.hat(1.0, f'{key}{k}', tone=tone), t, gain * v, 0.25 * np.sin(k * 0.9), room=0.08, void=0.12)
            t = round(t + every, 4)
            k += 1

    def roll(self, t0, t1, every, v0, v1, key='roll', tone0=190.0, tone1=240.0, gain=0.4, clap_too=False):
        cnt = int(round((t1 - t0) / every))
        for k in range(cnt):
            u = k / max(cnt - 1, 1)
            t = round(t0 + k * every, 4)
            self.drum(I.snare(1.0, f'{key}{k}', tone=tone0 + (tone1 - tone0) * u, decay=0.07), t,
                      gain * (v0 + (v1 - v0) * u ** 1.4), 0.3 * np.sin(k * 2.1), room=0.15, void=0.15)

    def backbeat(self, t, gain=0.55, key='bb', tail=0.16, decay=0.12):
        self.drum(I.clap(1.0, key + 'c', tail), t, gain * 1.0, 0.0, room=0.25, void=0.25)
        self.drum(I.snare(1.0, key + 's', decay=decay), t, gain * 0.55, 0.0, room=0.2, void=0.2)

    def kick(self, t, vel=1.0, big=False, key='k', decay=0.16):
        k = I.kick_big(1.0, key + 'B') if big else I.kick(1.0, key, decay=decay)
        self.drum(k, t, 0.62 * vel, 0.0, room=0.05, void=0.06)

    # ---------------------------------------------------------------------------------------------------- render
    def render(self):
        tl = self.tl
        S, B, BAR = tl.STEP, tl.BEAT, tl.BAR
        a0, a1 = tl.sec('awaken')
        h0, h1 = tl.sec('hypercube')
        i0, i1 = tl.sec('inside')
        b0, b1 = tl.sec('barrage')
        f0, f1 = tl.sec('frenzy')
        c0, c1 = tl.sec('climax')
        n0, n1 = tl.sec('final')
        z0, z1 = tl.sec('after')
        drop, close, dive, inside = tl.ev('throw'), tl.ev('close'), tl.ev('dive'), tl.ev('inside')
        cracks, ring = tl.ev('cracks'), tl.ev('ring')
        gap0, gap1 = tl.gap()
        launch, above, hammer = tl.ev('launch'), tl.ev('above'), tl.ev('hammer')
        crater, land, title, fade_out = tl.ev('crater'), tl.ev('land'), tl.ev('title'), tl.ev('fade_out')
        kick_in = tl.ev('kick_in')
        hall, void = self.irs['hall'], self.irs['void']

        charge, palm, coil = tl.ev('charge'), tl.ev('palm_open'), tl.ev('coil')
        dash, windup = tl.ev('dash'), tl.ev('kick_windup')
        hold0 = dash + 0.25                     # the plant after the grab: the beat stops for the face-to-face hold
        build = dive - B                        # the build into the dive starts a beat before it

        # ============================================================ AWAKEN: idle -> charge snap -> palm/seed -> coil
        dur = drop - a0
        dr = I.drone([D2, A2, D3], dur + 0.02, 'drone0', cutoff=(140, 1100))
        t = tvec(dr.shape[-1]) + a0
        lvl = np.interp(t, [a0, charge - 0.01, charge + 0.05, coil, drop - 0.12, drop - 0.04, drop + 0.02],
                        [0.30, 0.36, 0.62, 0.85, 1.0, 0.12, 0.0])
        self.pads.add(dr * lvl, a0, 0.45, hall=0.25)
        tri = I.supersaw_pad([Ab2, Eb3], drop - charge, 'tritone0', cutoff=700, attack=(drop - charge) * 0.6,
                             release=0.1)
        self.pads.add(tri, charge, 0.10, hall=0.4)
        self.pads.add(I.choir([D2, A2], drop - palm, 'choir0', 'u', attack=(drop - palm) * 0.7, release=0.12), palm,
                      0.30, hall=0.5)
        # heartbeat sub pulse on the beats (lub on the beat, dub just after): quiet in the idle, stronger after the
        # charge, and it stops for the coil (the reverse swell takes over)
        nb = int(round((coil - a0) / B))
        for k in range(nb):
            tb = round(a0 + k * B, 4)
            v = 0.4 if tb < charge else 0.65 + 0.35 * (tb - charge) / max(coil - charge, 1e-6)
            lub = I.subdrop(0.2, 92, 52, f'lub{k}') + I.kick(0.25, f'lubk{k}', 160, 60, 0.02, 0.05, 1.5, 0.15)[:ns(0.2)]
            dub = I.subdrop(0.16, 84, 50, f'dub{k}')
            self.pads.add(lub, tb, 0.85 * v, room=0.1)
            self.pads.add(dub, tb + 0.13, 0.55 * v, room=0.1)
        # charge snap: a dark low hit, then the risers start
        self.acc.add(I.braam([D1, D2], 0.5, 'braam_charge', bright=0.45, drv=2.2, decay=0.3, sub=0.3), charge, 0.35,
                     hall=0.4)
        self.acc.add(I.taiko(1.0, 'taiko_charge', 100, 48, 0.5), charge, 0.45, hall=0.3)
        self.acc.add(I.subdrop(0.9, 70, 32, 'sub_charge'), charge, 0.35)
        self.pads.add(I.noise_riser(drop - charge - 0.06, 220, 7000, 'riser0', q=1.4, shape=2.6), charge, 0.16,
                      hall=0.15)
        self.pads.add(I.tone_riser(drop - palm - 0.06, D3, D5, 'triser0'), palm, 0.10, hall=0.3)
        src = I.braam([D2, A2, D3], 0.6, 'swellsrc0', drv=2.0)
        sw = I.reverse_swell(src, hall, drop - coil + 0.3)
        self.acc.add_end(fades(sw, 0, 0.01), drop - BREATH, 0.42)
        crs = I.crash(0.8, 'revcrash0')[:, ::-1]
        self.acc.add_end(fades(crs, 0.3, 0.01), drop - BREATH, 0.55)

        # ============================================================ DROP (bar A): braam, kick, 808, cowbell riff
        self.acc.add(I.braam([D1, D2, A2, D3, F3, A3], 1.3, 'braam_drop', bright=1.0, drv=3.2), drop, 0.62, hall=0.3)
        self.acc.add(I.crash(2.6, 'crash_drop'), drop, 0.55, hall=0.2)
        self.acc.add(I.subdrop(1.1, 82, 32, 'sub_drop'), drop, 0.5)
        self.acc.add(I.choir_stab([D3, A3, D4, F4], 'stab_drop'), drop, 0.30, hall=0.4)
        hA = drop
        for s_, v in {0: 1.0, 3: 0.8, 6: 0.9, 8: 1.0}.items():
            tk = round(hA + s_ * S, 4)
            if tk < hold0:
                self.kick(tk, v, big=(s_ == 0), key=f'k1_{s_}')
        self.backbeat(round(hA + 4 * S, 4), key='bb1_4')
        self.hats(hA + S, hold0, S, key='h1')
        self.bass([dict(t=hA, dur=0.55, m=D1, slide_from=D2, slide=0.14),
                   dict(t=hA + 6 * S, dur=0.2, m=D1),
                   dict(t=dash, dur=hold0 - dash, m=D2, slide_from=D1, slide=0.05)], hA, hold0 + 0.05, key='808_1')
        self.riff(hA, [(s_, m) for s_, m in ((0, D5), (3, D5), (6, F5), (8, Eb5), (10, D5)) if hA + s_ * S < hold0],
                  key='cbA')
        # the hold (plant -> wind-up): the beat stops, only a tense tritone pad; the wind-up sucks into the kick
        self.pads.add(I.supersaw_pad([D3, Ab3], kick_in - hold0, 'hold_pad', cutoff=900, attack=0.08, release=0.05),
                      hold0, 0.12, hall=0.4)
        self.pads.add(I.choir([D3, A3], kick_in - hold0 - 0.03, 'hold_choir', 'u', attack=0.15, release=0.03), hold0,
                      0.22, hall=0.4)
        wsrc = I.braam([D2, A2, D3, A3], 0.4, 'swellsrc_k', drv=2.5)
        self.acc.add_end(fades(I.reverse_swell(wsrc, hall, kick_in - windup + 0.15), 0, 0.01), kick_in - BREATH, 0.4)
        self.acc.add_end(fades(I.crash(0.45, 'revcr_k')[:, ::-1], 0.15, 0.01), kick_in - BREATH, 0.3)

        # ============================================================ KICK-IN (bar B): the music hits with the kick
        hB = hA + BAR
        for s_, v in {0: 1.0, 3: 0.8, 6: 0.9, 8: 1.0, 11: 0.85, 14: 0.9}.items():
            tk = round(hB + s_ * S, 4)
            self.kick(tk, v, big=abs(tk - kick_in) < 1e-6, key=f'k1b_{s_}')
        for s_ in (4, 12):
            self.backbeat(round(hB + s_ * S, 4), key=f'bb1b_{s_}')
        self.hats(hB + S, build, S, key='h1b')
        self.hats(build, dive, S / 2, gain=0.11, key='h1r', accent=(0.6, 0.35, 0.5, 0.4, 0.7, 0.45, 0.8, 0.6))
        self.bass([dict(t=hB, dur=0.55, m=D1, slide_from=D2, slide=0.12),
                   dict(t=hB + 6 * S, dur=0.2, m=D1),
                   dict(t=hB + 8 * S, dur=0.27, m=D2, slide_from=D1, slide=0.05),
                   dict(t=hB + 11 * S, dur=0.1, m=C2),
                   dict(t=hB + 12 * S, dur=0.4, m=Eb1, slide_from=D2, slide=0.1)], hB, h1 + 0.25, key='808_1b')
        riffA = [(0, D5), (3, D5), (6, F5), (8, Eb5), (10, D5), (11, C5), (12, A4), (14, Bb4)]
        self.riff(hB, riffA, key='cbA2')
        self.acc.add(I.braam([D2, A2, D3, A3], 0.42, 'braam_kickin', bright=0.9, drv=3.5, decay=0.25), kick_in, 0.5,
                     hall=0.3)
        self.acc.add(I.taiko(1.0, 'taiko_kickin', 130, 60), kick_in, 0.6, room=0.2, hall=0.2)
        self.acc.add(I.crash(1.6, 'crash_kickin', bright=0.9), kick_in, 0.4, hall=0.15)
        self.acc.add(I.crash(0.9, 'crash_close', bright=0.8), close, 0.22, hall=0.2)
        # build into the dive: snare roll, riser (the beat bus gets a high-pass sweep, see fx())
        self.roll(build, inside, S / 2, 0.25, 1.0, 'roll_close', 200, 330, gain=0.42)
        self.pads.add(I.noise_riser(inside - build, 500, 9000, 'riser_dive', q=1.2, shape=1.6), build, 0.30, hall=0.2)
        self.pads.add(I.tone_riser(inside - build, A3, D5 + 5, 'triser_dive', cutoff=(800, 7000)), build, 0.14)

        # ============================================================ INSIDE: alien pad, underwater beat
        self.pads.add(I.supersaw_pad([D3, A3, Eb4, Ab4], i1 - inside, 'alien0', cutoff=1500, attack=0.7, release=0.6,
                                     tremolo=0.3), inside, 0.24, void=0.8)
        self.pads.add(I.choir([D2, A2, D3], i1 - inside + 0.2, 'choir_in', 'u', attack=0.8, release=0.5), inside,
                      0.32, void=0.7)
        bloom = I.reverse_swell(I.choir_stab([D3, A3, Eb4], 'bloomsrc', 0.3), void, 0.45)
        self.pads.add_end(fades(bloom, 0, 0.01), inside - BREATH, 0.30)
        self.kick(round(i0, 4), 0.6, key='k2_0')
        for h in [h for h in tl.HITS if i0 <= h['t'] < i1]:
            self.kick(h['t'], 1.0, big=(h['kind'] == 'heavy'), key=f"k2_{h['t']}")
        self.kick(round(i0 + 14 * S, 4), 0.7, key='k2_14')
        for s in (4, 12):
            self.backbeat(round(i0 + s * S, 4), 0.5, key=f'bb2_{s}')
        self.hats(i0 + 10 * S, i1, S, gain=0.12, key='h2')
        self.bass([dict(t=i0 + 4 * S, dur=0.75, m=D1, slide_from=A1, slide=0.06),
                   dict(t=i0 + 12 * S, dur=0.2, m=Bb1),
                   dict(t=i0 + 14 * S, dur=0.2, m=A1, slide_from=Bb1, slide=0.08)], i0, i1 + 0.05, key='808_2')
        self.riff(i0, [(4, D5), (7, D5), (8, Eb5), (10, D5), (12, Ab5), (14, F5)], key='cbI')
        self.pads.add(fades(I.noise_riser(i1 - BREATH - (i0 + 10 * S), 400, 8000, 'riser_in', q=1.5, shape=2.0), 0, 0.01),
                      i0 + 10 * S, 0.18, void=0.3)
        self.acc.add_end(fades(I.crash(0.6, 'revcr2')[:, ::-1], 0.2, 0.01), b0 - BREATH, 0.3)

        # ============================================================ BARRAGE: drums lock to the 8th-note hits
        bar_hits = [h for h in tl.HITS if b0 <= h['t'] < b1]
        for h in bar_hits:
            on_beat = abs(((h['t'] - b0) / B) - round((h['t'] - b0) / B)) < 1e-6
            self.kick(h['t'], 1.0 if on_beat else 0.78, key=f"k3_{h['t']}", decay=0.12)
        for s in (4, 12):
            self.backbeat(round(b0 + s * S, 4), 0.58, key=f'bb3_{s}')
        self.drum(I.snare(1.0, 'ghost3', decay=0.05), round(b0 + 15 * S, 4), 0.18)
        self.hats(b0, b1, S, gain=0.14, key='h3', accent=(0.8, 0.45, 1.0, 0.5))
        self.drum(I.hat(1.0, 'oh3', open_=True), round(b0 + 6 * S, 4), 0.08)
        self.drum(I.hat(1.0, 'oh3b', open_=True), round(b0 + 14 * S, 4), 0.08)
        self.bass([dict(t=b0, dur=0.28, m=D1, slide_from=A1, slide=0.05),
                   dict(t=b0 + 3 * S, dur=0.1, m=D2),
                   dict(t=b0 + 4 * S, dur=0.38, m=D1, slide_from=D2, slide=0.08),
                   dict(t=b0 + 8 * S, dur=0.18, m=F1),
                   dict(t=b0 + 10 * S, dur=0.18, m=Eb1, slide_from=F1, slide=0.1),
                   dict(t=b0 + 12 * S, dur=0.18, m=D1),
                   dict(t=b0 + 14 * S, dur=0.2, m=A1, slide_from=D1, slide=0.12)], b0, b1 + 0.02, key='808_3')
        riffB = [(0, D5), (2, D5), (3, F5), (5, D5), (6, Eb5), (8, D5), (10, A5), (12, Ab5), (14, F5), (15, Eb5)]
        self.riff(b0, riffB, key='cbB', gain=0.45)
        self.pads.add(I.supersaw_pad([Bb2, F3, Bb3, D4], b1 - b0, 'padBb', cutoff=1900, attack=0.15, release=0.3),
                      b0, 0.26, void=0.6)
        self.pads.add(I.choir([Bb2, F3, D4], b1 - b0, 'choirB', 'o', attack=0.2, release=0.3), b0, 0.32, void=0.6)

        # ============================================================ FRENZY: 16th rolls, rising riff, aberration
        for k in range(8):
            tk = round(f0 + k * 2 * S, 4)
            self.kick(tk, 1.0 if k % 2 == 0 else 0.72, key=f'k4_{k}', decay=0.11)
        fr_hits = [h for h in tl.HITS if f0 <= h['t'] < f1]
        for k, h in enumerate(fr_hits):
            u = k / max(len(fr_hits) - 1, 1)
            self.drum(I.snare(1.0, f'sn4_{k}', tone=180 + 90 * u, decay=0.06), h['t'], 0.16 + 0.26 * u ** 1.3,
                      0.35 * np.sin(k * 2.4), room=0.15, void=0.15)
        for s in (4, 12):
            self.backbeat(round(f0 + s * S, 4), 0.6, key=f'bb4_{s}', tail=0.06, decay=0.06)   # tight: 16th hits follow
        self.hats(f0, f1, S / 2, gain=0.10, key='h4', accent=(1.0, 0.5, 0.7, 0.45))
        self.bass([dict(t=f0, dur=0.4, m=D1, slide_from=A1, slide=0.05),
                   dict(t=f0 + 4 * S, dur=0.4, m=Eb1, slide_from=D1, slide=0.1),
                   dict(t=f0 + 8 * S, dur=0.4, m=F1, slide_from=Eb1, slide=0.1),
                   dict(t=f0 + 12 * S, dur=0.4, m=Ab1, slide_from=F1, slide=0.12)], f0, f1 + 0.02, key='808_4')
        base = [D5, D5, F5, Eb5]
        lift = [0, 1, 3, 6]
        riffC = [(b * 4 + j, base[j] + lift[b]) for b in range(4) for j in range(4)]
        self.riff(f0, riffC, key='cbC', gain=0.38, bright=1.2)
        self.pads.add(I.supersaw_pad([Eb3, G3, Bb3, Eb4], cracks - f0, 'padEb', cutoff=2200, attack=0.1, release=0.2),
                      f0, 0.26, void=0.6)
        self.pads.add(I.choir([Eb3, Bb3, G4], cracks - f0, 'choirEb', 'a', attack=0.12, release=0.2), f0, 0.30,
                      void=0.6)
        self.pads.add(I.supersaw_pad([Ab2, Eb3, Ab3, C4], f1 - cracks, 'padAb', cutoff=2600, attack=0.08,
                                     release=0.2), cracks, 0.28, void=0.6)
        self.pads.add(I.choir([Ab3, C4, Eb4], f1 - cracks, 'choirAb', 'a', attack=0.1, release=0.2), cracks, 0.30,
                      void=0.6)
        self.pads.add(I.tone_riser(gap0 - cracks, D4, D5 + 3, 'siren4', cutoff=(900, 8000)), cracks, 0.12, void=0.3)
        self.pads.add(I.noise_riser(gap0 - cracks, 600, 10000, 'riser4', q=1.3, shape=2.4), cracks, 0.16, void=0.2)

        # ============================================================ CLIMAX
        self.kick(c0, 1.0, big=True, key='k5_0')
        self.acc.add(I.crash(0.6, 'crash_ring', bright=0.8), c0, 0.25)
        self.roll(c0 + S / 2, gap0, S / 2, 0.3, 1.0, 'roll_ring', 220, 380, gain=0.38)
        self.bass([dict(t=c0, dur=gap0 - c0 - 0.002, m=D2, slide_from=D1, slide=gap0 - c0)], c0, gap0, key='808_5')
        suck = I.reverse_swell(np.hstack([I.braam([D2, A2, D3, F3], 0.5, 'sucksrc', drv=2.5), np.zeros((2, 10))]),
                               hall, gap0 - c0 + 0.1)
        self.acc.add_end(suck, gap0, 0.5)
        self.pads.add(I.supersaw_pad([D3, A3, D4, F4], gap0 - c0, 'padD5', cutoff=3000, attack=0.25, release=0.01),
                      c0, 0.22)
        # MEGA (after the gap): the biggest hit
        self.mega(gap1, 'm1', huge=True)
        # pickups into the launch
        self.drum(I.snare(1.0, 'pk1', tone=230, decay=0.06), round(launch - 2 * S, 4), 0.22)
        self.drum(I.snare(1.0, 'pk2', tone=260, decay=0.06), round(launch - S, 4), 0.34)
        self.acc.add_end(fades(I.crash(0.5, 'revcr5')[:, ::-1], 0.25, 0.01), launch - BREATH, 0.35)
        # launch accent
        self.kick(launch, 1.0, big=True, key='k5_launch')
        self.backbeat(launch, 0.6, key='bb5_l')
        self.acc.add(I.braam([D2, A2, D3, A3], 0.5, 'braam_launch', bright=1.0, drv=3.5, decay=0.3), launch, 0.55,
                     hall=0.3)
        self.acc.add(I.crash(1.8, 'crash_launch'), launch, 0.45, hall=0.2)
        self.acc.add(I.taiko(1.0, 'taiko_launch', 140, 62), launch, 0.45, hall=0.2)
        self.kick(round(launch + 2 * S, 4), 0.85, key='k5_2')
        self.backbeat(round(launch + 2 * S, 4), 0.45, key='bb5_2')
        self.hats(launch + S, hammer, S, gain=0.12, key='h5')
        self.kick(above, 0.9, key='k5_above')
        self.kick(round(above + 3 * S, 4), 0.7, key='k5_ab3')
        self.bass([dict(t=launch, dur=above - launch, m=D2, slide_from=D1, slide=0.3, punch=9),
                   dict(t=above, dur=hammer - above, m=D2)], launch, hammer, key='808_6')
        self.riff(launch, [(0, D5), (1, D5), (2, F5), (3, Ab5), (4, A5), (5, Ab5), (6, F5), (7, Eb5)], key='cbL',
                  gain=0.4)
        # slow motion (above -> hammer): the beat bus is tape-stopped in fx(); a choir rises over it
        ln = hammer - above
        nn = ns(ln + 0.06)
        u = np.clip(tvec(nn) / ln, 0, 1)
        self.pads.add(I.choir([D3, A3, D4, F4, A4], ln - BREATH - 0.025, 'choir_rise', 'o', attack=ln * 0.8,
                              release=0.015, glide=5 * u ** 1.6, vowel2='a', morph=u), above, 0.55, hall=0.5)
        self.pads.add(fades(I.tone_riser(ln - BREATH - 0.01, A3, D5, 'triser_above', cutoff=(500, 6000)), 0, 0.01), above,
                      0.10, hall=0.3)
        # MEGA hammer
        self.mega(hammer, 'm2', huge=False)

        # ============================================================ FINAL / AFTER: epic resolving outro
        self.pads.add(fades(I.drone([D1, A1, D2], land - crater + 0.4, 'drone_final', cutoff=(200, 500)), 0.15, 0.3),
                      crater, 0.30,
                      hall=0.4)
        chord_bb = [Bb1, Bb2, F3, Bb3, D4, F4]
        chord_c = [C2, C3, G3, C4, E4, G4]
        half = (title - land) / 2
        self.acc.add(I.taiko(1.0, 'taiko_land', 110, 52, 0.6), land, 0.6, hall=0.35)
        for k, (ch, t0) in enumerate(((chord_bb, land), (chord_c, land + half))):
            self.pads.add(I.choir(ch[1:], half + 0.05, f'choir_out{k}', 'a', attack=0.12, release=0.3), t0, 0.7,
                          hall=0.55)
            self.pads.add(I.braam(ch, half, f'brass_out{k}', bright=0.55, drv=1.6, attack=0.06, decay=0.6, sustain=0.6,
                                  release=0.25, sub=0.4), t0, 0.32, hall=0.45)
        self.acc.add(I.taiko(1.0, 'taiko_c', 118, 55, 0.6), land + half, 0.5, hall=0.35)
        self.acc.add(I.crash(1.6, 'crash_c', bright=0.8), land + half, 0.22, hall=0.3)
        for k, (dt, f) in enumerate(((0.4, 150), (0.6, 165), (0.7, 180))):
            self.acc.add(I.taiko(1.0, f'tom_{k}', f, f * 0.55, 0.3), land + half + dt, 0.28 + 0.08 * k, hall=0.3)
        self.roll(title - 0.3, title, S / 2, 0.15, 0.7, 'roll_title', 220, 300, gain=0.3)
        # title: D minor resolution, held to the end
        hold = fade_out - title
        self.acc.add(I.braam([D1, D2, A2, D3, F3, A3, D4], 1.6, 'braam_title', bright=1.05, drv=3.0, decay=0.7,
                             sustain=0.35, release=0.8), title, 0.55, hall=0.45)
        self.acc.add(I.crash(3.5, 'crash_title'), title, 0.5, hall=0.3)
        self.acc.add(I.subdrop(1.6, 85, 31, 'sub_title'), title, 0.5)
        self.acc.add(I.kick_big(1.0, 'kick_title', decay=0.6, drv=5.0), title, 0.6, hall=0.2)
        self.acc.add(I.taiko(1.0, 'taiko_title', 100, 48, 0.8), title, 0.5, hall=0.4)
        mo = np.clip((tvec(ns(hold + 0.8)) - 0.8) / 1.2, 0, 1)
        self.pads.add(I.choir([D3, F3, A3, D4, F4, A4, D5], hold, 'choir_title', 'a', attack=0.08, release=0.8,
                              vowel2='o', morph=mo), title, 0.75, hall=0.6)
        self.pads.add(I.braam([D2, A2, D3, F3, A3], hold, 'brass_title', bright=0.5, drv=1.5, attack=0.15, decay=1.0,
                              sustain=0.55, release=0.8, sub=0.5), title, 0.30, hall=0.5)
        self.pads.add(I.supersaw_pad([D4, A4, D5], hold, 'pad_title', cutoff=2500, attack=0.6, release=0.8), title,
                      0.12, hall=0.6)
        # bell callback of the riff, half speed, ringing into the tail
        for k, (dt, m) in enumerate(((0.8, D5), (1.0, D5), (1.2, F5), (1.4, Eb5), (1.6, D5))):
            self.acc.add(I.bell(m, 1.8 if k == 4 else 1.0, f'bell{k}'), title + dt, 0.2 if k < 4 else 0.24,
                         0.3 * np.sin(k * 1.9), hall=0.7)
        # outro dynamics: after the title the held chord dies away with the picture (diminuendo to fade_out)
        tt = tvec(self.n)
        dim = np.interp(tt, [0, title + 0.25, fade_out, tl.LENGTH], [1, 1, 0.38, 0.22])
        for mx in (self.pads, self.acc):
            mx.dry *= dim
            for k in mx.SENDS:
                mx.send[k] *= dim
        return self

    def mega(self, t, key, huge=True):
        s = 1.0 if huge else 0.9
        chord = [D1, D2, A2, D3, F3, A3, D4]
        self.acc.add(I.braam(chord, 1.4 if huge else 1.0, f'braam_{key}', bright=1.2, drv=4.0, decay=0.6), t, 0.7 * s,
                     hall=0.5)
        self.acc.add(I.choir_stab([D3, F3, A3, D4, A4], f'stab_{key}', 0.8), t, 0.5 * s, hall=0.6)
        self.acc.add(I.crash(3.2, f'crash_{key}'), t, 0.6 * s, hall=0.3)
        self.acc.add(I.subdrop(1.6, 95, 31, f'sub_{key}'), t, 0.55 * s)
        self.acc.add(I.kick_big(1.0, f'boom_{key}', decay=0.9, drv=6.0), t, 0.65 * s, hall=0.3)
        self.acc.add(I.taiko(1.0, f'taiko_{key}', 95, 45, 0.9), t, 0.55 * s, hall=0.4)

    # ---------------------------------------------------------------------------------------------- bus effects
    def fx(self):
        """Beat-bus processing: HP sweep into the dive, underwater LP opening up, aberration, tape stop."""
        tl = self.tl
        dive, inside = tl.ev('dive'), tl.ev('inside')
        close = dive - tl.BEAT                                  # start of the build into the dive
        i0, i1 = tl.sec('inside')
        cracks = tl.ev('cracks')
        gap0, _ = tl.gap()
        above, hammer = tl.ev('above'), tl.ev('hammer')
        under_end = min(inside + tl.BAR / 2, i1 - 0.1)          # half a bar underwater, then open up by i1
        bufs = [self.beat.dry] + [self.beat.send[k] for k in self.beat.SENDS]
        # --- 1. high-pass sweep close -> inside, then underwater low-pass inside -> opening by i1
        a, b = ns(close - 0.05), ns(i1 + 0.06)
        t = np.arange(a, b) / SR
        hp_f = np.where(t < close, 20.0, np.where(t < inside, 20 * (2400 / 20) ** ((t - close) / (inside - close)), 20.0))
        lp_f = np.where(t < inside, 20000.0,
                        np.where(t < under_end, 380 * (1 + 0.25 * np.sin(2 * np.pi * 2.5 * (t - inside))),
                                 380 * (19000 / 380) ** np.clip((t - under_end) / (i1 - under_end), 0, 1)))
        lp_q = np.where(t < inside, 0.7, np.interp(t, [under_end, i1], [2.4, 0.7]))
        xf = np.ones(b - a)
        k = ns(0.01)
        xf[:k] = np.linspace(0, 1, k)
        xf[-k:] = np.linspace(1, 0, k)
        for buf in bufs:
            seg = buf[:, a:b]
            y = tvf(seg, 'hp', hp_f, 0.8, 32)
            y = tvf(y, 'lp', lp_f, lp_q, 32)
            buf[:, a:b] = seg * (1 - xf) + y * xf
        # --- 2. aberration + extra drive from the cracks to the gap
        a, b = ns(cracks - 0.01), ns(gap0)
        n = b - a
        w = np.clip(np.arange(n) / ns(0.05), 0, 1)
        for buf in bufs:
            seg = buf[:, a:b].copy()
            det = np.vstack([mod_delay(seg[0], 9.0, 3.5, 0.8, 0.0), mod_delay(seg[1], 9.0, 3.5, 0.8, 2.2)])
            y = lp(0.8 * drive(seg * 1.6, 2.2) / 1.25, 12000, 2) + 0.42 * det
            buf[:, a:b] = seg * (1 - w) + y * w
        # --- 3. tape stop over the slow motion
        a, b = ns(above), ns(hammer)
        for buf in bufs:
            seg = buf[:, a:].copy()
            y = I.tape_stop(seg, (hammer - above) * 0.88, 1.6)[:, :b - a]
            buf[:, a:b] = y
            buf[:, b:b + ns(0.5)] = 0.0          # tails of the stopped beat must not pop back after the stop
