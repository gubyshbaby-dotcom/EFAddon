// «Гиперкуб» — the ultimate's beat sheet (v2). THE single source of timing for animation, camera, VFX and audio.
// Music: 150 BPM → 1 beat = 0.4 s, 1 bar (4/4) = 1.6 s, 8th = 0.2 s, 16th = 0.1 s. 11 bars = 17.6 s + 0.6 s tail.
// Units: seconds, blocks. World: grass field, ground y = 0. User starts at (0,0,0) facing -Z, victim at (0,0,-4) facing +Z.
// "Inside" = the hyperspace inside the tesseract, a separate set centred at INSIDE (characters are re-placed on the cut).
//
// v2 (after the author's review "it looks sped up, not fast — everything is crammed"): the world intro got two more bars
// (0–3.2 → 0–6.4) so key poses can HOLD between explosive snaps, like the pack's ults (18–22 s long, 0.7–1.7 fast
// actions per second, holds of 0.2–0.6 s). Everything from the old 3.2 on is shifted by +3.2 s unchanged.
// lib/timeline_v1.js keeps v1; fromV1(t) maps a v1 time to v2 (intro events re-timed, the rest +3.2).

export const BPM = 150;
export const BEAT = 60 / BPM;          // 0.4
export const BAR = BEAT * 4;           // 1.6
export const LENGTH = 18.2;            // video length (music tail to 18.2, picture fades to black at 17.6)
export const FPS = 60;
export const V1_SHIFT = 3.2;           // v1 → v2 offset for everything from v1 3.2 on

export const WORLD = { user: [0, 0, 0], victim: [0, 0, -4], cube: [0, 1.9, -7.2], crater: [0, 0, -6.6], landing: [1.7, 0, -4.4] };
export const INSIDE = [0, 60, 0];      // centre of the hyperspace set (far above the field)

/** Sections (bars). */
export const SECTIONS = [
  { t0: 0.0, t1: 3.2, id: 'awaken', name: 'Пробуждение' },
  { t0: 3.2, t1: 6.4, id: 'hypercube', name: 'Гиперкуб' },
  { t0: 6.4, t1: 8.0, id: 'inside', name: 'Внутри' },
  { t0: 8.0, t1: 9.6, id: 'barrage', name: 'Шквал (восьмые)' },
  { t0: 9.6, t1: 11.2, id: 'frenzy', name: 'Вакханалия (шестнадцатые, клоны)' },
  { t0: 11.2, t1: 12.8, id: 'climax', name: 'Кульминация' },
  { t0: 12.8, t1: 14.4, id: 'final', name: 'Финал' },
  { t0: 14.4, t1: 17.6, id: 'after', name: 'После' },
];

/** Where the action happens over time: 'world' or 'inside' (environment switch on cuts). */
export const SPACE = [
  { t0: 0.0, t1: 6.6, space: 'world' },
  { t0: 6.6, t1: 12.85, space: 'inside' },
  { t0: 12.85, t1: LENGTH, space: 'world' },
];
export function spaceAt(t) { return (SPACE.find(s => t >= s.t0 && t < s.t1) || SPACE[SPACE.length - 1]).space; }

/**
 * Hits. Every strike lands EXACTLY at t (animation contact frame = VFX burst = SFX = camera kick).
 * kind: light | medium | heavy | mega; by = who strikes. stop = hit-stop seconds (characters and hit VFX hold).
 */
export const HITS = [
  // world
  { t: 4.80, kind: 'heavy', by: 'user', move: 'front kick into the cube', stop: 0.06 },
  // inside — three big hits on the beat
  { t: 6.80, kind: 'medium', by: 'user', move: 'elbow to the back (appears behind)', stop: 0.04 },
  { t: 7.20, kind: 'medium', by: 'user', move: 'straight punch to the face (appears in front)', stop: 0.04 },
  { t: 7.60, kind: 'heavy', by: 'user', move: 'spinning roundhouse kick', stop: 0.06 },
  // eighth-note barrage, user blinks to a new side before each hit
  ...[8.0, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4].map((t, i) => ({ t, kind: i % 4 === 3 ? 'medium' : 'light', by: 'user', move: 'barrage ' + (i + 1), stop: i % 4 === 3 ? 0.03 : 0 })),
  // sixteenth-note frenzy, user + clones from all sides
  ...Array.from({ length: 16 }, (_, i) => ({ t: +(9.6 + i * 0.1).toFixed(2), kind: i % 4 === 0 ? 'medium' : 'light', by: i % 2 ? 'clone' : 'user', move: 'frenzy ' + (i + 1), stop: 0 })),
  // climax
  { t: 11.60, kind: 'mega', by: 'all', move: 'all clones strike at once', stop: 0.20 },
  { t: 12.00, kind: 'heavy', by: 'user', move: 'launching kick upward', stop: 0.05 },
  // final
  { t: 12.80, kind: 'mega', by: 'user', move: 'double-fist hammer down', stop: 0.05 },
];

/** Story events (non-hit) for animation, VFX, audio. */
export const EVENTS = [
  { t: 0.00, id: 'fade_in', d: 'black → picture over 0.15 s; drone starts' },
  { t: 0.00, id: 'idle', d: 'calm, cocky fighting idle (0–1.2): breathing holds, a slow head turn to the victim at ~0.6' },
  { t: 1.20, id: 'charge', d: 'ONE snap down into a deep charge stance; aura and ground cracks burst; hold with tremble to 2.0' },
  { t: 2.00, id: 'palm_open', d: 'the right palm snaps open, palm up, at chest height; hold (2.0–2.8)' },
  { t: 2.20, id: 'seed', d: 'a tiny glowing tesseract (0.15 bl) forms in the palm, 4D-rotating, grows a little to 2.8' },
  { t: 2.80, id: 'coil', d: 'wind-up for the throw (2.8–3.2): the arm pulls back, the body coils, slow then still' },
  { t: 3.20, id: 'throw', d: 'DROP. explosive palm thrust: the seed shoots past the victim (3.20–3.40); hold the follow-through to ~3.6' },
  { t: 3.40, id: 'unfold', d: 'seed unfolds behind the victim into the huge tesseract (scale 0.15→3.6 bl by 3.8, overshoot), ground shockwave ring' },
  { t: 3.50, id: 'victim_look', d: 'victim flinches and turns to look at the cube; hold, staring (3.6–4.0)' },
  { t: 4.00, id: 'dash', d: 'user dashes at the victim (afterimages); 4.15 grabs the collar; 4.25 plants; face to face hold 4.25–4.5' },
  { t: 4.50, id: 'kick_windup', d: 'the kick chambers (4.5–4.8), slow then a snap' },
  { t: 4.80, id: 'kick_in', d: 'HIT: front kick → victim flies back into the cube face (4.8–5.2); user holds the follow-through to ~5.3' },
  { t: 5.20, id: 'swallow', d: 'the cube face ripples like liquid and swallows the victim' },
  { t: 5.60, id: 'close', d: 'cube faces snap shut, 4D spin spike, flash' },
  { t: 5.70, id: 'approach', d: 'user walks to the cube (5.7–6.3), calm, two or three steps' },
  { t: 6.40, id: 'dive', d: 'camera dives into the cube face (6.40–6.60): zoom blur, warp, world dissolves into hyperspace' },
  { t: 6.60, id: 'inside', d: 'hyperspace: violet-black void, nested 4D lattices; victim tumbles in zero-g at INSIDE' },
  { t: 6.75, id: 'blink_in', d: 'user blinks in behind the victim (flash from a cube face)' },
  { t: 7.90, id: 'barrage_start', d: 'user starts blinking around the victim between hits (trails of light along the jump paths)' },
  { t: 9.60, id: 'clones', d: 'clones split off the user (up to 6 spectral copies), strike from all sides in a rotating pattern' },
  { t: 10.40, id: 'cracks', d: 'the hyperspace lattice starts cracking; chromatic aberration ramps' },
  { t: 11.20, id: 'ring', d: 'clones pull back into a ring around the victim, fists charging (11.20–11.50)' },
  { t: 11.50, id: 'gap', d: 'SILENCE GAP 11.50–11.60: everything holds its breath (music cut)' },
  { t: 11.60, id: 'mega1', d: 'ALL STRIKE: impact frames, time freeze 11.60–11.80, then sphere shockwave bursts' },
  { t: 11.80, id: 'clones_vanish', d: 'clones shatter into light; the real user remains' },
  { t: 12.00, id: 'launch', d: 'HIT: kick launches the victim upward' },
  { t: 12.40, id: 'above', d: 'user blinks above the victim, raises both fists; slow motion 12.40–12.80; lattice collapses inward' },
  { t: 12.80, id: 'hammer', d: 'HIT MEGA: hammer fist down. White flash 12.80–12.85' },
  { t: 12.85, id: 'exit', d: 'cut to the world: the tesseract above the field implodes and shatters into shards and light beams' },
  { t: 13.00, id: 'meteor', d: 'victim shoots out of the cube down into the ground like a meteor' },
  { t: 13.05, id: 'crater', d: 'impact on the ground: crater, dust ring, debris, shockwave, heavy shake' },
  { t: 13.60, id: 'land', d: 'user lands nearby in a superhero landing, dust ring' },
  { t: 14.60, id: 'rise', d: 'user slowly rises (14.60–15.40), shards fall and dissolve, wind and dust' },
  { t: 15.20, id: 'title', d: 'title «ГИПЕРКУБ» appears (glitch-in), holds to 16.8' },
  { t: 17.60, id: 'fade_out', d: 'fade to black 17.1–17.6; music tail to 18.2' },
];

/** Camera shots (director's plan; camera.js implements them). */
export const SHOTS = [
  { t0: 0.00, t1: 1.20, id: 'S1', d: 'calm establishing: low wide, both fighters, slow drift (a held, quiet frame)' },
  { t0: 1.20, t1: 2.00, id: 'S2', d: 'low hero angle on the user: punch-in on the charge snap' },
  { t0: 2.00, t1: 3.20, id: 'S3', d: 'close-up of the palm and the seed, the face behind; crash zoom 3.0–3.2' },
  { t0: 3.20, t1: 4.00, id: 'S4', d: 'wide 3/4: throw, the tesseract unfolds behind the victim, the victim turns' },
  { t0: 4.00, t1: 4.50, id: 'S5', d: 'tracking shot of the dash and grab, ends close on both faces' },
  { t0: 4.50, t1: 4.80, id: 'S6', d: 'victim POV: the kick chambers and flies into the lens' },
  { t0: 4.80, t1: 5.70, id: 'S7', d: 'beside the cube: the victim flies in, is swallowed, the cube closes' },
  { t0: 5.70, t1: 6.40, id: 'S8', d: 'low from behind: the user walks to the cube' },
  { t0: 6.40, t1: 6.60, id: 'S9', d: 'dive into the cube face (transition)' },
  { t0: 6.60, t1: 8.00, id: 'S10', d: 'inside: orbiting medium shot, whip on each hit' },
  { t0: 8.00, t1: 8.80, id: 'S11', d: 'close orbit, whip-pans between hit pairs' },
  { t0: 8.80, t1: 9.60, id: 'S12', d: 'top-down rotating' },
  { t0: 9.60, t1: 10.40, id: 'S13', d: 'accelerating 360° orbit around the victim' },
  { t0: 10.40, t1: 11.20, id: 'S14', d: 'extreme close-up on the victim\'s face, hits flash, aberration' },
  { t0: 11.20, t1: 12.00, id: 'S15', d: 'wide: the ring of clones, slow push-in, freeze drift at 11.60' },
  { t0: 12.00, t1: 12.40, id: 'S16', d: 'low angle: launch kick' },
  { t0: 12.40, t1: 12.85, id: 'S17', d: 'below the victim looking up at the user raising the fists (slow motion)' },
  { t0: 12.85, t1: 13.40, id: 'S18', d: 'world, wide low: tesseract explodes, meteor, crater impact' },
  { t0: 13.40, t1: 14.40, id: 'S19', d: 'medium: superhero landing in the dust' },
  { t0: 14.40, t1: 16.60, id: 'S20', d: 'slow low orbit: user rises, shards falling, title' },
  { t0: 16.60, t1: 18.20, id: 'S21', d: 'close on the user\'s face, fade out' },
];

/** Hit-stop: the hit while time is frozen for characters and hit VFX. */
export function frozenAt(t) {
  for (const h of HITS) if (h.stop && t >= h.t && t < h.t + h.stop) return h;
  return null;
}

/** v1 → v2 time: intro events re-timed (anchors below, linear between), everything from v1 3.2 on shifted +3.2. */
export const V1_ANCHORS = [[0, 0], [0.4, 1.2], [1.0, 2.0], [1.2, 2.2], [1.6, 3.2], [1.8, 3.4], [1.9, 3.5], [2.2, 4.0],
  [2.35, 4.15], [2.45, 4.25], [2.6, 4.8], [2.8, 5.2], [3.0, 5.6], [3.2, 6.4]];
export function fromV1(t) {
  if (t >= 3.2) return t + V1_SHIFT;
  const A = V1_ANCHORS;
  for (let i = 1; i < A.length; i++) if (t <= A[i][0]) {
    const [a0, b0] = A[i - 1], [a1, b1] = A[i];
    return b0 + (t - a0) / (a1 - a0) * (b1 - b0);
  }
  return t + V1_SHIFT;
}
