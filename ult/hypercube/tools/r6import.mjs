// Import pack clips FOR STUDY (not for use in the ult): node tools/r6import.mjs <alias>=<json file name or unique substring> [...]
// Writes $CLIPS_OUT/<alias>.js (default lib/clips/, keep study copies in your scratch dir instead) (export default <clip JSON>) from the parsed pack (anim_json, see tools/rbxanim/rbxm.py).
// Example: node tools/r6import.mjs m1a_1=22a621ff m1a_4=5dafa5af fdash=d593e0c0 front_hit=b63f986a
//          node tools/r6import.mjs --list kick       (list clip files whose name contains "kick")
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTDIR = process.env.CLIPS_OUT || join(HERE, 'lib', 'clips');
const SRC = process.env.ANIM_JSON || '/tmp/claude-0/-home-user/6d915445-2714-55c1-930a-b1f8c2db9c9c/scratchpad/anim_json';
const files = readdirSync(SRC).filter(f => f.endsWith('.json'));
const a = process.argv.slice(2);
if (a[0] === '--list') {
  const q = (a[1] || '').toLowerCase();
  for (const f of files.filter(f => f.toLowerCase().includes(q))) {
    const j = JSON.parse(readFileSync(join(SRC, f), 'utf8'));
    console.log(f.padEnd(90), `${j.length.toFixed(2)}s`, j.rig, (j.keyframes.flatMap(k => [k.name !== 'Keyframe' ? k.name : null, ...(k.markers || []).map(m => m.name)]).filter(Boolean).join(',')).slice(0, 80));
  }
  process.exit(0);
}
mkdirSync(OUTDIR, { recursive: true });
for (const arg of a) {
  const [alias, q] = arg.split('=');
  const hit = files.filter(f => f.includes(q));
  if (hit.length !== 1) { console.error(`${alias}: ${hit.length} matches for "${q}"`, hit.slice(0, 5)); process.exitCode = 1; continue; }
  const j = JSON.parse(readFileSync(join(SRC, hit[0]), 'utf8'));
  writeFileSync(join(OUTDIR, alias + '.js'), `// ${hit[0]} (pack clip, ${j.length.toFixed(2)} s)\nexport default ${JSON.stringify(j)};\n`);
  console.log(alias, '←', hit[0]);
}
