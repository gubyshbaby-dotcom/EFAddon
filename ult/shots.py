"""The shot table of the reference, frame for frame (30 fps, frames of ref(480p).mp4).

Each row: (id, first frame, last frame, act, location, description). Cuts were found
with a colour-histogram detector (ult.analysis) and checked by eye on contact sheets;
white/black impact frames are folded into the shot they punctuate and listed as FX.

Acts 1-2 (frames 0-489) are staged in Blender; the rest is the plan for later acts.
"""

ACTS = {
    1: ("Turf roof: the fist fight", 0, 305),
    2: ("Knocked across the city, Granite Blast, crash through the glass roof", 306, 489),
    3: ("Dark office and apartments: close quarters, the eye flare, through the walls", 490, 899),
    4: ("Balconies, sloped roof, katana block, dome slide", 900, 1283),
    5: ("Subway tunnel: beams in the dark, the blade that eats a blast", 1284, 1799),
    6: ("Atrium dive, the eruption, Uro in the sky", 1800, 2126),
    7: ("Uro turns the blast back; the hand", 2127, 2333),
    8: ("Rika", 2334, 2687),
    9: ("Cursed speech, the sky battle", 2688, 3071),
    10: ("Black flash dive into the parking lot", 3072, 3266),
    11: ("Parking lot: asphalt peeled like cloth, Rika vs Uro", 3267, 3875),
    12: ("Street beams, the glowing floor brawl", 3876, 4454),
    13: ("The fall, Thin Ice Breaker, Rika vs Ishigori", 4455, 4814),
    14: ("Finale: the stomp, the X, the arm through the sky", 4815, 5253),
}

SHOTS = [
    # ---- act 1 -----------------------------------------------------------------
    ("S001", 0, 32, 1, "turf", "CU Yuta 3/4, rear fist at the chin, holding; winds up at the end"),
    ("S003", 33, 53, 1, "turf", "white flash 33-37; tracking the right straight in flight (slow)"),
    ("S004", 54, 57, 1, "turf", "WS: the straight lands on Ishigori's cheek"),
    ("S005", 58, 79, 1, "turf", "CU Ishigori grins through it, push in to the eye"),
    ("S006", 80, 103, 1, "turf", "counter to Yuta's face; strobe W/B/W/B/W/B impact frames"),
    ("S007", 104, 129, 1, "turf", "MS exchange: I->Y 106, Y->I 114, I->Y 122; speed lines"),
    ("S008", 130, 149, 1, "turf", "ground level: Yuta's shoe skids back, Ishigori stomps in"),
    ("S009", 150, 193, 1, "turf", "top-down: Yuta on one knee bleeding, Ishigori crouched; he springs"),
    ("S010", 194, 261, 1, "turf", "flash; WS Yuta in a horse stance, pink/cyan lightning coiling"),
    ("S011", 262, 297, 1, "turf", "CU Yuta low angle, energy across the frame"),
    ("S012", 298, 305, 1, "turf", "Yuta's dash: Ishigori's collar smears past, blue burst 304"),
    # ---- act 2 -----------------------------------------------------------------
    ("S013", 306, 341, 2, "turf", "EWS high: strike and shock ring on Ishigori; Yuta blown at camera"),
    ("S014", 342, 361, 2, "air", "CU Yuta flying backwards, blood off the nose 350"),
    ("S015", 362, 365, 2, "air", "WS sky: Yuta a speck past the rooftops"),
    ("S016", 366, 385, 2, "pink", "low angle up the pink block; he smashes in at 370, dust bursts"),
    ("S017", 386, 403, 2, "glass_roof", "Dutch WS: Yuta runs the glass roof edge"),
    ("S018", 404, 425, 2, "glass_roof", "MS Yuta arms out; Granite Blast screams past behind him"),
    ("S019", 426, 437, 2, "glass_roof", "back of his head; snaps round toward the blast"),
    ("S020", 438, 453, 2, "glass_roof", "Ishigori in the air coming at him, fist cocked"),
    ("S021", 454, 459, 2, "glass_roof", "ECU Ishigori; the fist into camera"),
    ("S022", 460, 471, 2, "glass_roof", "WS: slammed into the roof, black debris erupts"),
    ("S023", 472, 489, 2, "glass_facade", "the facade: cracks racing down the floors"),
]
