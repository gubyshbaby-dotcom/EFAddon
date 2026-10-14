// USER (attacker, Steve). Demo of pack clips on the ult rig (lib/r6lib.js): M1 set A 1 → 2 → 3 → 4, then Fdash.
import { r6Keys, splice } from '../lib/r6lib.js';
import M1 from '../lib/clips/m1a_1.js';
import M4 from '../lib/clips/m1a_4.js';
import FDASH from '../lib/clips/fdash.js';
const tracks = { 'root.pos': [[0, [0, 0, 0]]], 'root.rot': [[0, [0, 0, 0]]], plant: [[0, 1]] };
splice(tracks, r6Keys(M1, { at: 0, fps: 30 }));
splice(tracks, r6Keys(M4, { at: 0.5, fps: 30 }));
splice(tracks, r6Keys(FDASH, { at: 0.5 + M4.length + 0.05, fps: 30 }));
export default { id: 'user', skin: 'wide_steve', slim: false, tracks };
