// Contact sheet of exact frames: node tools/sheet.mjs <from> <to> <fps> <out.jpg> [--size 640x360] [--cols 6] [--debug]
// Renders frames t = from, from+1/fps, ... ≤ to and tiles them with time labels. For frame-by-frame review.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const a = process.argv.slice(2);
const [from, to, fps, out] = [+a[0], +a[1], +a[2], a[3]];
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const size = opt('--size', '640x360'), cols = +opt('--cols', 6);
const times = []; for (let t = from; t <= to + 1e-6; t += 1 / fps) times.push(+t.toFixed(4));
const tmp = mkdtempSync(join(tmpdir(), 'sheet-'));
execFileSync('node', [join(HERE, 'render.mjs'), '--times', times.join(','), '--size', size, '--out', tmp, ...(a.includes('--debug') ? ['--debug'] : [])], { stdio: 'inherit' });
const files = readdirSync(tmp).filter(f => f.endsWith('.png')).sort((x, y) => parseFloat(x.slice(2)) - parseFloat(y.slice(2)));
const rows = Math.ceil(files.length / cols);
const inputs = files.flatMap(f => ['-i', join(tmp, f)]);
const labels = files.map((f, i) => `[${i}:v]drawtext=text='${f.slice(2, -4)}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`);
const layout = files.map((_, i) => `${(i % cols) * +size.split('x')[0]}_${Math.floor(i / cols) * +size.split('x')[1]}`).join('|');
const filter = labels.join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${layout}:fill=black`;
if (files.length === 1) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, files[0]), out]);
else execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', out]);
rmSync(tmp, { recursive: true, force: true });
console.log(out, `${files.length} frames, ${cols}x${rows}`);
