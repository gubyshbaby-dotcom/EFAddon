// VICTIM (Alex). Owned by the animation engineer — blocking placeholder.
import { INSIDE as I } from '../timeline.js';
export default {
  id: 'victim', skin: 'slim_alex', slim: true,
  tracks: {
    'root.pos': [[0, [0, 0, -4]], [2.6, [0, 0, -4]], [2.8, [0, 0.4, -6.6], 'expoOut'], [3.4, [0, 0.4, -6.6], 'step'],
      [3.41, [I[0], I[1], I[2]], 'step'], [9.64, [I[0], I[1] + 0.5, I[2]]], [9.65, [0, 3, -6.6], 'step'], [9.85, [0, -0.3, -6.6], 'expoIn']],
    'root.rot': [[0, [0, 180, 0]]],
    armR: [[0, [5, 0, 6]]], armL: [[0, [5, 0, 6]]],
  },
};
