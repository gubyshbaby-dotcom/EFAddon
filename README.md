# EF Ultimate — Yuta vs Ishigori (Sendai)

A finisher for Epic Fight, adapted shot for shot from `ref(480p).mp4` and authored in
Blender with the **Epic Fight / VIX addon** (`vendor/ef_blender-0.24.0.zip`, v0.24.0).
Because Minecraft cannot move a whole city, the fight plays inside a domain sphere
(radius 72 blocks) that carries its own city: the turf roof, the pink block, the glass
office, the atrium, the tunnel, the parking lot and a skyline ring.

**Status:** acts 1–2 (reference frames 0–489, 16.3 s) are staged: two characters with
the addon's default skins (Yuta = Steve build, Ishigori = Alex/slim build), 24 shot
cameras, impact flashes, strobes, speed lines, lightning, the Granite Blast, dust,
debris, blood and glass cracks. The remaining acts are broken down in
[`docs/SHOTLIST.md`](docs/SHOTLIST.md).

## What is in `out/`

| Path | What |
|---|---|
| `out/ult_sendai.blend` | the scene: domain, both rigs, every shot camera (bound to timeline markers so the viewport cuts like the reference), FX, the reference audio on the sequencer |
| `out/preview/*.mp4` | reference and our render, side by side |
| `out/anim/<role>.json` | Epic Fight animation (addon exporter, baked, all 20 joints), body only |
| `out/anim_rootmotion/<role>.json` | the same with the entity path folded into the root, for an entity parked at the caster's feet |
| `out/paths/<role>.json` | the entity path per frame: time, x/y/z, yaw in the caster's frame |
| `out/vix/ult_sendai.json` + `out/vix/ult_sendai/*.json` | VIX shot manifest and one camera file per shot (addon exporter) |
| `out/events/ult_sendai.json` | what the mod spawns and when: screen flashes, camera shakes, hit-stops, particles, beams, lightning, rings |
| `out/domain/domain.nbt` | the domain as a structure template (1.20.1), with `domain.json` giving where the caster's feet go inside it |

All game-side positions use the VIX rig frame: x forward, y up, z right of the caster at
t = 0, in blocks.

## Rebuilding

Everything is generated from code; the .blend is a pure function of `ult/`.

```
pip install bpy==5.0.1 "numpy<2" opencv-python-headless==4.10.0.84 imageio-ffmpeg
python3 scripts/build.py          # -> out/ult_sendai.blend   (a few seconds + the domain)
python3 scripts/export.py         # -> out/anim, out/anim_rootmotion, out/paths, out/vix, out/events
python3 scripts/export_domain.py  # -> out/domain/domain.nbt
python3 -m ult.analysis           # -> data/ref_analysis.json (cuts, flashes, pans, audio hits)
```

Inside Blender (4.2+ with the addon installed), `scripts/build.py` can be run from the
Text editor or with `blender --background --python scripts/build.py`; it uses the
installed addon when there is one and the vendored zip otherwise.

Previews: `scripts/render_frames.py` renders chosen frames (Cycles by default,
`--engine WORKBENCH` for speed), `scripts/compare.py` / `scripts/pairsheet.py` put them
next to the reference frames.

## How it is built

- `ult/blender/rigkit.py` poses the addon's control rig from body-level descriptions
  (hips, spine bends, hand/foot targets) with a two-bone solve on the rig's own hinge
  axes. Only FK controls are keyed (every `ik_*` blend at 0), so what Blender shows is
  exactly what the exporter samples. Hands can be aimed at a point on the other
  fighter's face at the contact frame, so every blow lands where it should.
- `ult/blender/motion.py` keeps sparse per-channel keys with easing (`out5` for smear-fast
  strikes, `step` for cuts), bakes them per frame and writes reduced LINEAR curves.
- `ult/blender/camera.py` builds one camera per shot (`ef_start`/`ef_end` for the VIX
  exporter), keyed eye/target/lens/roll that can follow a fighter, plus shake.
- `ult/blender/fx.py` builds the effects and logs each one as an event.
- `ult/blender/choreo/act01.py`, `act02.py` stage the shots.
- `ult/domain.py` + `ult/voxel.py` build the block world; `ult/blender/env.py` meshes it.
