// Render Roblox R6 animations (JSON from ../rbxm.py) on Minecraft player models, frame-exact.
//
// node render.mjs --data <json dir> --out <dir> [--fps 30] [--size 960x540] [--cams side,front]
//                 --actor <id>[:skin[:slim]] [--actor <id> ...] [--label text] [--t0 0] [--t1 len] [--sheet N]
// Actors share one HumanoidRootPart origin (paired Roblox animations encode the relative placement in the
// torso track). Default skins: steve (wide) for the first actor, alex (slim) for the second.
// Needs the Minecraft skins and grass texture in ./tex (tools/rbxanim/render/fetch_tex.sh).
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const all = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const DATA = resolve(opt('--data', '.'));
const OUT = resolve(opt('--out', 'out/render'));
const FPS = +opt('--fps', 30);
const [W, H] = opt('--size', '960x540').split('x').map(Number);
const CAMS = opt('--cams', 'side,front').split(',');
const SHEET = +opt('--sheet', 0);
const LABEL = opt('--label', '');
const SKINS = ['steve:0', 'alex:1', 'kai:0', 'zuri:0'];
const ROLES = ['USER', 'VICTIM', 'C', 'D'];

const actors = all('--actor').map((spec, i) => {
  const [id, skin, slim] = spec.split(':');
  const [dskin, dslim] = SKINS[i].split(':');
  const sk = skin || dskin;
  const sl = (slim ?? dslim) === '1';
  return { id, seq: JSON.parse(readFileSync(join(DATA, id + '.json'), 'utf8')), skin: `tex/${sl ? 'slim' : 'wide'}_${sk}.png`, slim: sl, origin: [0, 0, 0], yaw: 0, role: ROLES[i] };
});
if (!actors.length) { console.error('no --actor'); process.exit(1); }

const CAMERAS = {
  side: { az: 90, el: 10, dist: 5.5, fov: 42 },       // from the user's right
  front: { az: 215, el: 14, dist: 5.5, fov: 42 },     // 3/4 from the front-left
  shoulder: { az: 30, el: 16, dist: 5.5, fov: 42 },   // behind the user's right shoulder, looking at the victim (TSB player camera)
  top: { az: 90, el: 70, dist: 9, fov: 45 },
  solo: { az: 140, el: 12, dist: 4.6, fov: 42 },      // 3/4 from the front-right, for single animations
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = join(HERE, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(HERE) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W * CAMS.length, height: H } });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/page.html`, { timeout: 180000 });
await page.waitForFunction(() => window.sceneReady === true, null, { timeout: 180000 });
page.setDefaultTimeout(180000);

const label = LABEL || actors.map(a => `${a.role}: ${a.seq.name}`).join('   ');
mkdirSync(OUT, { recursive: true });
const info = await page.evaluate(cfg => window.setupScene(cfg), { actors: actors.map(({ id, ...a }) => a), label, cam: CAMERAS[CAMS[0]] });
const t0 = +opt('--t0', 0), t1 = +opt('--t1', info.length + 0.3);
const n = Math.floor((t1 - t0) * FPS) + 1;
console.log(`${label} | length ${info.length.toFixed(2)} s | ${n} frames x ${CAMS.length} cams`);

const dir = join(OUT, 'frames');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const camList = CAMS.map(c => CAMERAS[c]);
for (let i = 0; i < n; i++) {
  const t = t0 + i / FPS;
  await page.evaluate(([tt, cs]) => window.renderAtCams(tt, cs), [t, camList]);
  await page.screenshot({ path: join(dir, `f_${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
}
await browser.close();
server.close();

// video (cameras are already side by side in each frame)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f_%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', join(OUT, 'render.mp4')]);
console.log('video', join(OUT, 'render.mp4'));
if (SHEET > 0) {
  const step = Math.max(1, Math.floor(n / SHEET));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f_%04d.jpg'),
    '-vf', `select='not(mod(n\\,${step}))',crop=iw/${CAMS.length}:ih:0:0,scale=320:-1,tile=6x${Math.ceil(SHEET / 6)}`, '-frames:v', '1', join(OUT, 'sheet.png')]);
  console.log('sheet', join(OUT, 'sheet.png'));
}
if (!args.includes('--keep')) rmSync(dir, { recursive: true, force: true });
