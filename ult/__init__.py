"""Okkotsu / Sendai ultimate for Epic Fight, authored in Blender.

The reference is `ref(480p).mp4` in the repo root: 5254 frames at 30 fps. Every frame
number in this package is a frame of that video, so the Blender timeline, the shot table
and the exported timelines all line up with it one to one.

  ult.paths       where things live
  ult.shots       the shot table: every cut of the reference, what happens, how hard it hits
  ult.analysis    measures the reference (cuts, flashes, pans, shake, audio hits)
  ult.voxel       block grid and Minecraft structure (.nbt) writer
  ult.domain      the domain sphere and the city packed inside it
  ult.blender     everything that needs bpy: scene, rigs, choreography, cameras, VFX
"""

FPS = 30
FRAMES = 5254
