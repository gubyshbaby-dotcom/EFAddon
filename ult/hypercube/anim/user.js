// USER (attacker, Steve). Owned by the animation engineer — this is only a stance demo for the R6-style rig (0 / 1 / 2 s).
export default {
  id: 'user', skin: 'wide_steve', slim: false,
  tracks: {
    'root.pos': [[0, [0, 0, 0]]],
    'root.rot': [[0, [0, 0, 0]]],
    plant: [[0, 1]],
    torso: [[0, [10, -25, 0]], [1, [20, 30, -5], 'step'], [2, [28, -10, 0], 'step']],
    head: [[0, [-6, 22, 0]], [1, [-16, -26, 4], 'step'], [2, [-22, 10, 0], 'step']],
    armR: [[0, [62, 30, 6]], [1, [100, -6, 0], 'step'], [2, [35, 10, 28], 'step']],
    'armR.pos': [[0, [0, 0, 0]], [1, [0, 0, 3], 'step'], [2, [0, 0, 0], 'step']],
    armL: [[0, [78, 16, 4]], [1, [55, 38, 4], 'step'], [2, [35, 10, 28], 'step']],
    legR: [[0, [-10, 0, 8]], [1, [-8, 0, 6], 'step'], [2, [10, 0, 22], 'step']],
    legL: [[0, [32, 0, 6]], [1, [58, 0, 4], 'step'], [2, [42, 0, 20], 'step']],
  },
};
