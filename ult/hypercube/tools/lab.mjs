// Pose lab: node tools/lab.mjs <actor> <t1,t2,...> <out.jpg> [--views side,front,back] [--size 400x400] [--vfx]
// Renders each time from fixed views around the actor (relative to its heading): rows = times, columns = views.
// Use it to judge stances and silhouettes (weight, feet on the ground, lean, guard) independently of the shot camera.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const a = process.argv.slice(2);
const [actor, times, out] = a;
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const views = opt('--views', 'side,front,back').split(','), size = opt('--size', '400x400');
const [w, h] = size.split('x').map(Number);
const ts = times.split(',').map(Number);
const tmp = mkdtempSync(join(tmpdir(), 'lab-'));
for (const v of views) execFileSync('node', [join(HERE, 'render.mjs'), '--times', ts.join(','), '--size', size, '--out', join(tmp, v), '--lab', `${actor}:${v}`, ...(a.includes('--vfx') ? [] : ['--novfx'])], { stdio: ['ignore', 'ignore', 'inherit'] });
const files = []; for (const t of ts) for (const v of views) files.push([join(tmp, v, `t_${t.toFixed(3)}.png`), `${t.toFixed(2)} ${v}`]);
const inputs = files.flatMap(([f]) => ['-i', f]);
const labels = files.map(([, l], i) => `[${i}:v]drawtext=text='${l}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`);
const layout = files.map((_, i) => `${(i % views.length) * w}_${Math.floor(i / views.length) * h}`).join('|');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', labels.join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${layout}:fill=black`, '-frames:v', '1', '-q:v', '3', out]);
rmSync(tmp, { recursive: true, force: true });
console.log(out, `${ts.length} poses × ${views.length} views`);
