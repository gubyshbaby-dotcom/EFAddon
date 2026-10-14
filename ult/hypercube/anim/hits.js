// Who strikes with what at every HITS entry (owned by the animation engineer; read by VFX for contact points).
// Key = hit time as in timeline.js HITS (toFixed(2)); value: { id: actor id ('user' | clone id), limb: BONE_POINTS name
// (fistR fistL footR footL elbowR elbowL kneeR kneeL), at: victim bone that is hit (chest head face back pelvis),
// dir: [x,y,z] world direction the victim is knocked (unit-ish) }. Several strikers (the mega hit) → value is an array.
export default {
  '2.60': { id: 'user', limb: 'footR', at: 'chest', dir: [0, 0.2, -1] },
};
