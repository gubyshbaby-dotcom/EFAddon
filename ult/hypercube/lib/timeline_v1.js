// «Гиперкуб» — the ultimate's beat sheet. THE single source of timing for animation, camera, VFX and audio.
// Music: 150 BPM → 1 beat = 0.4 s, 1 bar (4/4) = 1.6 s, 8th = 0.2 s, 16th = 0.1 s. 9 bars = 14.4 s + 0.6 s tail.
// Units: seconds, blocks. World: grass field, ground y = 0. User starts at (0,0,0) facing -Z, victim at (0,0,-4) facing +Z.
// "Inside" = the hyperspace inside the tesseract, a separate set centred at INSIDE (characters are re-placed on the cut).

export const BPM = 150;
export const BEAT = 60 / BPM;          // 0.4
export const BAR = BEAT * 4;           // 1.6
export const LENGTH = 15.0;            // video length (music tail to 15.0, picture fades to black at 14.4)
export const FPS = 60;

export const WORLD = { user: [0, 0, 0], victim: [0, 0, -4], cube: [0, 1.9, -7.2], crater: [0, 0, -6.6], landing: [1.7, 0, -4.4] };
export const INSIDE = [0, 60, 0];      // centre of the hyperspace set (far above the field)

/** Sections (bars). */
export const SECTIONS = [
  { t0: 0.0, t1: 1.6, id: 'awaken', name: 'Пробуждение' },
  { t0: 1.6, t1: 3.2, id: 'hypercube', name: 'Гиперкуб' },
  { t0: 3.2, t1: 4.8, id: 'inside', name: 'Внутри' },
  { t0: 4.8, t1: 6.4, id: 'barrage', name: 'Шквал (восьмые)' },
  { t0: 6.4, t1: 8.0, id: 'frenzy', name: 'Вакханалия (шестнадцатые, клоны)' },
  { t0: 8.0, t1: 9.6, id: 'climax', name: 'Кульминация' },
  { t0: 9.6, t1: 11.2, id: 'final', name: 'Финал' },
  { t0: 11.2, t1: 14.4, id: 'after', name: 'После' },
];

/** Where the action happens over time: 'world' or 'inside' (environment switch on cuts). */
export const SPACE = [
  { t0: 0.0, t1: 3.4, space: 'world' },
  { t0: 3.4, t1: 9.65, space: 'inside' },
  { t0: 9.65, t1: 15.0, space: 'world' },
];
export function spaceAt(t) { return (SPACE.find(s => t >= s.t0 && t < s.t1) || SPACE[SPACE.length - 1]).space; }

/**
 * Hits. Every strike lands EXACTLY at t (animation contact frame = VFX burst = SFX = camera kick).
 * kind: light | medium | heavy | mega; dir = direction the victim is pushed (world, rough); by = who strikes.
 * stop = hit-stop seconds (characters and hit VFX hold; camera keeps drifting).
 */
export const HITS = [
  // world
  { t: 2.60, kind: 'heavy', by: 'user', move: 'front kick into the cube', stop: 0.05 },
  // inside — bar 3: three big hits on the beat
  { t: 3.60, kind: 'medium', by: 'user', move: 'elbow to the back (appears behind)', stop: 0.04 },
  { t: 4.00, kind: 'medium', by: 'user', move: 'straight punch to the face (appears in front)', stop: 0.04 },
  { t: 4.40, kind: 'heavy', by: 'user', move: 'spinning roundhouse kick', stop: 0.06 },
  // bar 4: eighth-note barrage, user blinks to a new side before each hit
  ...[4.8, 5.0, 5.2, 5.4, 5.6, 5.8, 6.0, 6.2].map((t, i) => ({ t, kind: i % 4 === 3 ? 'medium' : 'light', by: 'user', move: 'barrage ' + (i + 1), stop: i % 4 === 3 ? 0.03 : 0 })),
  // bar 5: sixteenth-note frenzy, user + clones from all sides
  ...Array.from({ length: 16 }, (_, i) => ({ t: +(6.4 + i * 0.1).toFixed(2), kind: i % 4 === 0 ? 'medium' : 'light', by: i % 2 ? 'clone' : 'user', move: 'frenzy ' + (i + 1), stop: 0 })),
  // bar 6: climax
  { t: 8.40, kind: 'mega', by: 'all', move: 'all clones strike at once', stop: 0.20 },
  { t: 8.80, kind: 'heavy', by: 'user', move: 'launching kick upward', stop: 0.05 },
  // bar 7: final
  { t: 9.60, kind: 'mega', by: 'user', move: 'double-fist hammer down', stop: 0.05 },
];

/** Story events (non-hit) for animation, VFX, audio. */
export const EVENTS = [
  { t: 0.00, id: 'fade_in', d: 'black → picture over 0.15 s; drone and riser start' },
  { t: 0.40, id: 'charge', d: 'user sinks into stance (anticipation); aura motes rise, ground cracks glow violet' },
  { t: 1.00, id: 'palm_open', d: 'user opens the right palm, palm up, at chest height' },
  { t: 1.20, id: 'seed', d: 'a tiny glowing tesseract (0.15 bl) forms in the palm, 4D-rotating; small arcs' },
  { t: 1.60, id: 'throw', d: 'DROP. palm thrust forward: the seed shoots past the victim (1.60–1.80)' },
  { t: 1.80, id: 'unfold', d: 'seed unfolds behind the victim into the huge tesseract (scale 0.15→3.6 bl by 2.20, overshoot), ground shockwave ring' },
  { t: 1.90, id: 'victim_look', d: 'victim flinches and looks back at the cube' },
  { t: 2.20, id: 'dash', d: 'user dashes at the victim (afterimages), 2.35 grabs the victim by the head/collar, 2.45 plants' },
  { t: 2.60, id: 'kick_in', d: 'HIT: front kick → victim flies back into the cube face' },
  { t: 2.80, id: 'swallow', d: 'the cube face ripples like liquid and swallows the victim' },
  { t: 3.00, id: 'close', d: 'cube faces snap shut, 4D spin spikes, flash' },
  { t: 3.20, id: 'dive', d: 'camera dives into the cube face (3.20–3.40): zoom blur, warp, world dissolves into hyperspace' },
  { t: 3.40, id: 'inside', d: 'hyperspace: violet-black void, nested 4D cube lattices rotating, light motes; victim tumbles in zero-g at INSIDE' },
  { t: 3.55, id: 'blink_in', d: 'user blinks in behind the victim (flash from a cube face)' },
  { t: 4.70, id: 'barrage_start', d: 'user starts blinking around the victim between hits (trails of light along the jump paths)' },
  { t: 6.40, id: 'clones', d: 'clones split off the user (up to 6 spectral copies), strike from all sides in a rotating pattern' },
  { t: 7.20, id: 'cracks', d: 'the hyperspace lattice starts cracking; chromatic aberration ramps' },
  { t: 8.00, id: 'ring', d: 'clones pull back into a ring around the victim, fists charging (8.00–8.30)' },
  { t: 8.30, id: 'gap', d: 'SILENCE GAP 8.30–8.40: everything holds its breath (music cut, slight zoom-in)' },
  { t: 8.40, id: 'mega1', d: 'ALL STRIKE: impact frames (inverted, 4 frames), time freeze 8.40–8.60, then sphere shockwave bursts' },
  { t: 8.60, id: 'clones_vanish', d: 'clones shatter into light; the real user remains' },
  { t: 8.80, id: 'launch', d: 'HIT: kick launches the victim upward' },
  { t: 9.20, id: 'above', d: 'user blinks above the victim, raises both fists; slow motion 9.20–9.60; energy gathers; lattice collapses inward' },
  { t: 9.60, id: 'hammer', d: 'HIT MEGA: hammer fist down. White flash 9.60–9.65' },
  { t: 9.65, id: 'exit', d: 'cut to the world: the tesseract above the field implodes and shatters into shards and light beams' },
  { t: 9.80, id: 'meteor', d: 'victim shoots out of the cube down into the ground like a meteor' },
  { t: 9.85, id: 'crater', d: 'impact on the ground: crater, dust ring, debris, shockwave, heavy shake' },
  { t: 10.40, id: 'land', d: 'user lands nearby in a superhero landing, dust ring' },
  { t: 11.40, id: 'rise', d: 'user slowly rises (11.40–12.20), shards fall and dissolve, wind and dust' },
  { t: 12.00, id: 'title', d: 'title «ГИПЕРКУБ» appears (glitch-in), holds to 13.6' },
  { t: 14.40, id: 'fade_out', d: 'fade to black 13.9–14.4; music tail to 15.0' },
];

/** Camera shots (director's plan; camera.js implements them). */
export const SHOTS = [
  { t0: 0.00, t1: 0.80, id: 'S1', d: 'extreme low angle behind the user, victim far and soft; slow push-in' },
  { t0: 0.80, t1: 1.60, id: 'S2', d: 'close-up on the right hand opening, seed forms; crash zoom starting at 1.40' },
  { t0: 1.60, t1: 2.20, id: 'S3', d: 'wide 3/4 from the user\'s right: throw, the tesseract unfolds behind the victim' },
  { t0: 2.20, t1: 2.60, id: 'S4', d: 'side tracking shot of the dash and grab, low' },
  { t0: 2.60, t1: 3.20, id: 'S5', d: 'from behind/beside the cube: the victim flies toward the face and is swallowed' },
  { t0: 3.20, t1: 3.40, id: 'S6', d: 'dive into the cube face (transition)' },
  { t0: 3.40, t1: 4.80, id: 'S7', d: 'inside: orbiting medium shot, whip on each hit' },
  { t0: 4.80, t1: 5.60, id: 'S8', d: 'close orbit, whip-pans between hit pairs' },
  { t0: 5.60, t1: 6.40, id: 'S9', d: 'top-down rotating' },
  { t0: 6.40, t1: 7.20, id: 'S10', d: 'accelerating 360° orbit around the victim' },
  { t0: 7.20, t1: 8.00, id: 'S11', d: 'extreme close-up on the victim\'s face, hits flash, aberration' },
  { t0: 8.00, t1: 8.80, id: 'S12', d: 'wide: the ring of clones, slow push-in, freeze drift at 8.40' },
  { t0: 8.80, t1: 9.20, id: 'S13', d: 'low angle: launch kick' },
  { t0: 9.20, t1: 9.65, id: 'S14', d: 'below the victim looking up at the user raising the fists (slow motion)' },
  { t0: 9.65, t1: 10.20, id: 'S15', d: 'world, wide low: tesseract explodes, meteor, crater impact' },
  { t0: 10.20, t1: 11.20, id: 'S16', d: 'medium: superhero landing in the dust' },
  { t0: 11.20, t1: 13.40, id: 'S17', d: 'slow low orbit: user rises, shards falling, title' },
  { t0: 13.40, t1: 15.00, id: 'S18', d: 'close on the user\'s face, fade out' },
];

/** Hit-stop: true while time is frozen for characters and hit VFX. */
export function frozenAt(t) {
  for (const h of HITS) if (h.stop && t >= h.t && t < h.t + h.stop) return h;
  return null;
}
