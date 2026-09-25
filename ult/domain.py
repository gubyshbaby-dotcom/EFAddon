"""The domain: a closed sphere of blocks with a small Sendai block packed inside.

Blender axes and units as in ult.voxel: X east, Y north, Z up, one unit per block, and a
block at integer (x, y, z) fills [x, x+1) x [y, y+1) x [z, z+1). The sphere is centred
on the world origin, which is also where the caster stands on the turf roof of A.

Every box here is an inclusive block range (x0, y0, z0, x1, y1, z1), the convention of
Grid.box. Heights the choreography is staged against (a floor of blocks at z is walked
at z + 1):

    z = -25   ground surface layer (asphalt, sidewalk, paving, grass); walked at -24
    z =  -1   turf roof of A; walked at 0, the origin
    z =  12   roof of the glass office C; walked at 13, behind a two-high glass parapet
    z =  -5   the dark office floor inside C; walked at -4
    z = -37   subway track bed; the tunnel is walked at -36, its platform at -35

Letters follow the layout sheet: A turf building, B pink apartments, C glass office,
D atrium, E orange apartments, F dome, G sloped-roof building, H plaza, I parking lot,
K subway. `BOXES` has their extents, `SETS` the points the animation is staged against,
and `zone_map` splits the grid into the objects ult.blender.env builds.

Palette keys are the block names without "minecraft:" (plus a suffix for block states),
so one key is one block state and one Blender material.

    python3 scripts/export_domain.py     writes out/domain/domain.nbt
"""

from __future__ import annotations

import math
import zlib

import numpy as np

from ult import voxel

R = 72.0          # outer radius of the sky shell
R_IN = 70.5       # cells whose centre is R_IN..R from the origin are shell
GROUND = -25      # z of the ground surface layer
STREET = -24      # walking surface of streets, plazas and ground floors
LO = (-72, -72, -72)
HI = (71, 71, 71)
SEED = 7

# ------------------------------------------------------------------------ palette

# key, block id, display rgb (in-game average colour of the texture), kind, properties
_BLOCKS = [
    ("stone", "stone", (125, 125, 125)),
    ("grass_block", "grass_block", (96, 146, 58), "solid", {"snowy": "false"}),
    ("gravel", "gravel", (131, 127, 126)),
    ("smooth_stone", "smooth_stone", (158, 158, 158)),
    ("stone_bricks", "stone_bricks", (122, 121, 122)),
    ("polished_andesite", "polished_andesite", (132, 134, 133)),
    ("smooth_quartz", "smooth_quartz", (235, 229, 222)),
    ("white_concrete", "white_concrete", (207, 213, 214)),
    ("light_gray_concrete", "light_gray_concrete", (125, 125, 115)),
    ("gray_concrete", "gray_concrete", (54, 57, 61)),
    ("black_concrete", "black_concrete", (8, 10, 15)),
    ("red_concrete", "red_concrete", (142, 32, 32)),
    ("yellow_concrete", "yellow_concrete", (240, 175, 21)),
    ("lime_concrete", "lime_concrete", (94, 168, 24)),
    ("green_concrete", "green_concrete", (73, 91, 36)),
    ("cyan_concrete", "cyan_concrete", (21, 119, 136)),
    ("light_blue_concrete", "light_blue_concrete", (35, 137, 198)),
    ("blue_concrete", "blue_concrete", (44, 46, 143)),
    ("terracotta", "terracotta", (152, 94, 67)),
    ("white_terracotta", "white_terracotta", (209, 178, 161)),
    ("light_gray_terracotta", "light_gray_terracotta", (135, 106, 97)),
    ("gray_terracotta", "gray_terracotta", (57, 42, 35)),
    ("orange_terracotta", "orange_terracotta", (161, 83, 37)),
    ("pink_terracotta", "pink_terracotta", (161, 78, 78)),
    ("purple_terracotta", "purple_terracotta", (118, 70, 86)),
    ("light_blue_terracotta", "light_blue_terracotta", (113, 108, 137)),
    ("cyan_terracotta", "cyan_terracotta", (86, 91, 91)),
    ("blue_terracotta", "blue_terracotta", (74, 59, 91)),
    ("pink_wool", "pink_wool", (237, 141, 172)),
    ("smooth_sandstone", "smooth_sandstone", (223, 214, 170)),
    ("spruce_planks", "spruce_planks", (114, 84, 48)),
    ("dark_oak_planks", "dark_oak_planks", (66, 43, 20)),
    ("bricks", "bricks", (150, 97, 83)),
    ("red_nether_bricks", "red_nether_bricks", (69, 7, 9)),
    ("oak_log", "oak_log", (109, 85, 50), "solid", {"axis": "y"}),
    ("oak_leaves", "oak_leaves", (64, 110, 38), "solid", {"persistent": "true"}),
    ("sea_lantern", "sea_lantern", (172, 199, 190)),
    # sky shell, horizon to zenith
    ("purpur_block", "purpur_block", (169, 125, 169)),
    ("packed_ice", "packed_ice", (141, 180, 250)),
    ("blue_ice", "blue_ice", (116, 167, 253)),
    ("lapis_block", "lapis_block", (31, 67, 140)),
    # see-through
    ("glass", "glass", (175, 213, 219), "glass"),
    ("light_blue_stained_glass", "light_blue_stained_glass", (102, 153, 216), "glass"),
    ("blue_stained_glass", "blue_stained_glass", (51, 76, 178), "glass"),
    ("light_gray_stained_glass", "light_gray_stained_glass", (153, 153, 153), "glass"),
    ("gray_stained_glass", "gray_stained_glass", (76, 76, 76), "glass"),
    ("black_stained_glass", "black_stained_glass", (25, 25, 25), "glass"),
    # rails lie flat: "glass" so they hide nothing below (env.SHAPES flattens the mesh)
    ("rail_ew", "rail", (125, 111, 88), "glass", {"shape": "east_west"}),
    # the invisible light block: exported, never meshed
    ("light", "light", (255, 250, 200), "light", {"level": "15"}),
    ("light_dim", "light", (255, 250, 200), "light", {"level": "7"}),
]


def _bars(**sides):
    props = {s: "false" for s in ("north", "east", "south", "west")}
    props.update({k: "true" for k in sides})
    props["waterlogged"] = "false"
    return props


# iron bars only look like a fence when their connections are set
_BLOCKS += [
    ("iron_bars_ew", "iron_bars", (136, 139, 135), "glass", _bars(east=1, west=1)),
    ("iron_bars_ns", "iron_bars", (136, 139, 135), "glass", _bars(north=1, south=1)),
    ("iron_bars_e", "iron_bars", (136, 139, 135), "glass", _bars(east=1)),
    ("iron_bars_s", "iron_bars", (136, 139, 135), "glass", _bars(south=1)),
    ("iron_bars_nw", "iron_bars", (136, 139, 135), "glass", _bars(north=1, west=1)),
]


def palette() -> voxel.Palette:
    pal = voxel.Palette()
    for key, mc, rgb, *rest in _BLOCKS:
        kind = rest[0] if rest else "solid"
        props = rest[1] if len(rest) > 1 else None
        pal.add(key, "minecraft:" + mc, rgb, kind, props)
    return pal


# roles used by several buildings
ASPHALT = "gray_concrete"
PAINT = "white_concrete"
SIDEWALK = "smooth_stone"
PAVING = "polished_andesite"
GRASS = "grass_block"
TURF = "lime_concrete"
AIR = voxel.AIR

# ------------------------------------------------------------------------ layout

BOXES = {
    "turf": (-11, -13, GROUND + 1, 11, 13, -1),       # A, roof blocks at z = -1
    "shed": (-10, 8, 0, 4, 12, 4),                    # red rooftop structure on A
    "pink": (-50, -10, GROUND + 1, -30, 10, 8),       # B, east face x = -30
    "glass": (14, -12, GROUND + 1, 34, 6, 12),        # C
    "atrium": (14, 9, GROUND + 1, 34, 27, -6),        # D
    "orange": (-50, 16, GROUND + 1, -30, 38, 4),      # E
    "dome": (17, 31, GROUND + 1, 43, 57, -3),         # F: podium and dome
    "slope": (-10, 20, GROUND + 1, 8, 38, -2),        # G
    "plaza": (-46, -46, GROUND, -28, -28, GROUND),    # H
    "parking": (-12, -56, GROUND, 34, -28, GROUND),   # I
    "tunnel": (-58, -5, -36, 58, 5, -31),             # K, interior air
    "platform": (-30, -9, -36, -10, -5, -36),         # K, platform blocks
    "road_ew": (-72, -24, GROUND, 71, -16, GROUND),
    "road_ns": (-24, -72, GROUND, -16, 71, GROUND),
}

C_FLOORS = (-21, -17, -13, -9, -5, -1, 3, 7)          # slab z of the office floors in C
DOME_C = (30.5, 44.5, -14.0)                          # centre of F's hemisphere
DOME_R = 12.0
TRAIN = ((8, 20), (22, 35), (37, 50))                 # x ranges of the three cars


class Anchor(tuple):
    """A world point (x, y, z) with the unit `normal` of the surface it lies on, an
    optional horizontal `facing` (what the point looks at, or which way an edge runs)
    and a `doc` line. It is a plain 3-tuple to anything that takes a point:
    Vector(anchor), x, y, z = anchor.
    """

    def __new__(cls, pos, normal=(0, 0, 1), doc="", facing=None):
        self = super().__new__(cls, tuple(float(v) for v in pos))
        self.normal = tuple(float(v) for v in normal)
        self.facing = None if facing is None else tuple(float(v) for v in facing)
        self.doc = doc
        return self

    @property
    def pos(self):
        return tuple(self)


UP = (0, 0, 1)
SETS = {
    "turf_center": Anchor((0, 0, 0), UP,
        "Caster's start on A's turf roof, the world origin: between the court's halfway "
        "line (north) and the start mark (south).", facing=(0, 1, 0)),
    "turf_shed_front": Anchor((-3.0, 7.0, 0), UP,
        "Turf roof right in front of the red shed's south face (door at x -7..-6).",
        facing=(0, 1, 0)),
    "turf_south_edge": Anchor((0.0, -12.0, 0), (0, 1, 0),
        "Foot of the south parapet's inner face, under the fence; the street is below.",
        facing=(0, -1, 0)),
    "turf_east_edge": Anchor((11.0, 0.0, 0), (-1, 0, 0),
        "Foot of the east parapet's inner face, under the fence; C is across the gap.",
        facing=(1, 0, 0)),
    "pink_wall": Anchor((-29.0, 0.0, -7.5), (1, 0, 0),
        "B's east face at mid height, between two balcony slabs; normal points east."),
    "pink_roof": Anchor((-39.5, 0.5, 9.0), UP,
        "Centre of B's roof walking surface."),
    "glass_roof": Anchor((24.5, -2.5, 13.0), UP,
        "Centre of C's roof walking surface."),
    "glass_roof_edge": Anchor((15.5, -2.5, 13.0), UP,
        "C's roof along its west glass parapet (x 14, 2 high); the run goes y -11..5.",
        facing=(0, 1, 0)),
    "office_floor": Anchor((24.5, -2.5, -4.0), UP,
        "Centre of the dark office floor inside C (open 9 x 7 blocks, ceiling at -1)."),
    "atrium_floor": Anchor((24.5, 18.5, STREET), UP,
        "Centre of D's white floor, under the red-beamed glass roof at z -6."),
    "orange_balcony": Anchor((-41.5, 15.5, -9.0), UP,
        "On a south balcony of E (slab z -10), behind its white rail.", facing=(0, -1, 0)),
    "slope_roof": Anchor((-0.5, 29.5, -5.0), (0, -0.4, 0.92),
        "Middle of G's stepped blue roof; normal is the mean slope.", facing=(0, 1, 0)),
    "dome_top": Anchor((30.5, 44.5, -2.0), UP,
        "Top of F's dome."),
    "dome_podium": Anchor((30.5, 31.8, -13.0), UP,
        "F's podium rim, south side, at the foot of the dome.", facing=(0, 1, 0)),
    "street_crossing": Anchor((-19.5, -19.5, STREET), UP,
        "Centre of the junction of the two roads."),
    "street_ew": Anchor((0.5, -19.5, STREET), UP,
        "E-W road in front of A's lobby (lobby door at y -13, x -3..3).", facing=(0, 1, 0)),
    "parking_center": Anchor((11.5, -35.0, STREET), UP,
        "Middle of the parking lot's northern aisle (clear of cars, 6 wide).",
        facing=(1, 0, 0)),
    "plaza_center": Anchor((-36.5, -36.5, STREET), UP,
        "Centre of the pink plaza (open, planters 6 blocks off)."),
    "tunnel_center": Anchor((2.0, -1.5, -36.0), UP,
        "Southern track bed of the subway under A, between the rail (y -3) and the "
        "pillars (y 0).", facing=(1, 0, 0)),
    "tunnel_platform": Anchor((-19.5, -7.0, -35.0), UP,
        "Middle of the subway platform (edge at y -5).", facing=(0, 1, 0)),
    "train_nose": Anchor((51.0, 3.5, -33.5), (1, 0, 0),
        "East end of the train on the northern track (cars span x 8..50)."),
    "sky_zenith": Anchor((0, 0, R_IN), (0, 0, -1),
        "Inside of the shell straight above the origin."),
}

# Zones: which Blender object a block's faces go to. First box that contains it wins;
# then the shell (by radius), the ground (z <= -25), and "city" for everything else.
ZONES = [
    ("tunnel", (-72, -11, -38, 71, 7, -30)),
    ("turf", (-11, -15, GROUND + 1, 11, 13, 4)),
    ("pink", (-50, -10, GROUND + 1, -29, 10, 9)),
    ("glass", (14, -12, GROUND + 1, 34, 6, 14)),
    ("atrium", (14, 9, GROUND + 1, 34, 27, -6)),
    ("orange", (-50, 14, GROUND + 1, -30, 38, 5)),
    ("slope", (-11, 20, GROUND + 1, 9, 38, -2)),
    ("dome", (17, 31, GROUND + 1, 44, 58, -2)),
    ("parking", (-12, -56, GROUND + 1, 34, -28, -20)),
]


def zone_map(grid: voxel.Grid):
    """(names, uint8 array shaped like grid.a) giving each cell's zone index."""
    names = ["shell", "ground", "city"] + [n for n, _ in ZONES]
    X, Y, Z = grid.coords()
    zmap = np.full(grid.a.shape, 2, dtype=np.uint8)
    zmap[np.broadcast_to(Z <= GROUND, zmap.shape)] = 1
    for i, (_, (x0, y0, z0, x1, y1, z1)) in reversed(list(enumerate(ZONES))):
        sl = grid._sl(x0, y0, z0, x1, y1, z1)
        if sl is not None:
            zmap[sl] = 3 + i
    zmap[_dist(grid) >= R_IN] = 0
    return names, zmap


def _dist(grid):
    X, Y, Z = grid.coords()
    return np.sqrt((X + 0.5) ** 2 + (Y + 0.5) ** 2 + (Z + 0.5) ** 2, dtype=np.float32)


def _smooth_noise(rng, sx, sy, cell):
    """Value noise in [0, 1) over an sx x sy plan: a random lattice every `cell` blocks,
    bilinearly interpolated."""
    c = rng.random((sx // cell + 2, sy // cell + 2))
    u, v = np.arange(sx) / cell, np.arange(sy) / cell
    i, j = u.astype(int), v.astype(int)
    fu, fv = (u - i)[:, None], (v - j)[None, :]
    near = c[i][:, j] * (1 - fv) + c[i][:, j + 1] * fv
    far = c[i + 1][:, j] * (1 - fv) + c[i + 1][:, j + 1] * fv
    return near * (1 - fu) + far * fu


def _hash(X, Y, Z):
    """Deterministic per-cell noise in [0, 1)."""
    h = (X * 73856093) ^ (Y * 19349663) ^ (Z * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h >> 8) & 0xFFFF) / 65536.0


# ------------------------------------------------------------------------ build


def build_grid() -> voxel.Grid:
    """The whole domain as a block grid."""
    return _Builder().build()


class _Builder:
    def __init__(self):
        self.g = voxel.Grid(LO, HI, palette())
        self.X, self.Y, self.Z = self.g.coords()
        self.d = _dist(self.g)
        # plan view of what the city ring must keep off; box interiors kept free of lights
        self.taken = np.zeros(self.g.a.shape[:2], dtype=bool)
        self.interiors = []

    def id(self, key):
        return self.g.pal[key]

    @staticmethod
    def rng(tag):
        """A random stream per feature, so editing one does not reshuffle the others."""
        return np.random.default_rng([SEED, zlib.crc32(tag.encode())])

    def build(self):
        self.ground()
        self.streets()
        self.parking()
        self.plaza()
        self.subway()
        self.turf()
        self.pink()
        self.glass_office()
        self.atrium()
        self.orange()
        self.slope()
        self.dome()
        self.city_ring()
        self.trees()
        self.close_sphere()
        self.lights()
        return self.g

    # -------------------------------------------------------------- helpers

    def take(self, x0, y0, x1, y1, margin=0):
        """Mark a plan rectangle (plus margin) as off limits to the city ring."""
        sl = self.g._sl(x0 - margin, y0 - margin, 0, x1 + margin, y1 + margin, 0)
        if sl is not None:
            self.taken[sl[:2]] = True

    def paint(self, x0, y0, x1, y1, block):
        """The ground surface layer over a plan rectangle."""
        self.g.box(x0, y0, GROUND, x1, y1, GROUND, block)

    def view(self, x0, y0, z0, x1, y1, z1):
        return self.g.a[self.g._sl(x0, y0, z0, x1, y1, z1)]

    def facade(self, box, rule):
        """Paint the four outer walls of `box` (which must lie inside the grid).

        rule(U, Z, edge, face) -> block ids (0 keeps the wall) where U is the horizontal
        coordinate along the wall (x on the south/north faces, y on west/east), Z the
        height and edge marks the two corner columns. face is one of "snwe".
        """
        x0, y0, z0, x1, y1, z1 = box
        lo = self.g.lo
        xs = slice(x0 - lo[0], x1 - lo[0] + 1)
        ys = slice(y0 - lo[1], y1 - lo[1] + 1)
        zs = slice(z0 - lo[2], z1 - lo[2] + 1)
        z = np.arange(z0, z1 + 1)[None, :]
        for face, u, idx in (("s", np.arange(x0, x1 + 1), (xs, y0 - lo[1], zs)),
                             ("n", np.arange(x0, x1 + 1), (xs, y1 - lo[1], zs)),
                             ("w", np.arange(y0, y1 + 1), (x0 - lo[0], ys, zs)),
                             ("e", np.arange(y0, y1 + 1), (x1 - lo[0], ys, zs))):
            U = u[:, None]
            edge = (U == u[0]) | (U == u[-1])
            ids = np.broadcast_to(np.asarray(rule(U, z, edge, face), dtype=np.uint16),
                                  (len(u), z.shape[1]))
            wall = self.g.a[idx]
            wall[...] = np.where(ids > 0, ids, wall)

    def building(self, name, block, top):
        """Hollow walls of BOXES[name] from the street up to z = top, plan reserved."""
        x0, y0, z0, x1, y1, _ = BOXES[name]
        self.g.shell(x0, y0, z0, x1, y1, top, block, floor=False, roof=False)
        self.take(x0, y0, x1, y1, margin=2)
        self.interiors.append((x0, y0, z0, x1, y1, top))
        self.paint(x0 - 2, y0 - 2, x1 + 2, y1 + 2, SIDEWALK)

    # -------------------------------------------------------------- ground and streets

    def ground(self):
        """Stone below; the surface is paving with patches of grass. Streets, lots and
        building plots paint over it."""
        g, iz = self.g, GROUND - self.g.lo[2]
        inside = self.d < R_IN
        g.a[inside & (self.Z < GROUND)] = self.id("stone")
        noise = _smooth_noise(self.rng("ground"), *g.a.shape[:2], cell=12)
        surface = np.where(noise < 0.4, self.id(GRASS), self.id(PAVING))
        top = inside[:, :, iz]
        g.a[:, :, iz][top] = surface[top]

    def streets(self):
        g = self.g
        # sidewalks first, then the roads over them so the crossings stay asphalt
        for v in (-26, -15):
            self.paint(-72, v, 71, v + 1, SIDEWALK)
            self.paint(v, -72, v + 1, 71, SIDEWALK)
        for name in ("road_ew", "road_ns"):
            g.box(*BOXES[name], ASPHALT)
        self.take(-72, -26, 71, -14)
        self.take(-26, -72, -14, 71)
        # dashed centre lines, broken around the junction
        for t in range(-72, 72):
            if t % 6 < 3 and not -29 <= t <= -11:
                g.set(t, -20, GROUND, PAINT)
                g.set(-20, t, GROUND, PAINT)
        # zebra crossings on the four arms
        for s in range(-24, -15, 2):
            self.paint(-14, s, -12, s, PAINT)
            self.paint(-28, s, -26, s, PAINT)
            self.paint(s, -14, s, -12, PAINT)
            self.paint(s, -28, s, -26, PAINT)

    def parking(self):
        g, rng = self.g, self.rng("parking")
        x0, y0, _, x1, y1, _ = BOXES["parking"]
        self.paint(x0, y0, x1, y1, ASPHALT)
        self.take(x0, y0, x1, y1, margin=2)
        # rows of 4-long bays, 3 wide; aisles at y -38..-33 and -52..-47
        rows = ((-32, -29), (-42, -39), (-46, -43), (-56, -53))
        lines = range(x0, x1 + 1, 3)
        for ra, rb in rows:
            for x in lines:
                self.paint(x, ra, x, rb, "yellow_concrete")
        self.paint(x0, -42, x1, -42, "yellow_concrete")  # backs of the back-to-back rows
        colours = ["white_concrete", "white_concrete", "light_gray_concrete", "black_concrete",
                   "red_concrete", "blue_concrete", "gray_concrete", "light_blue_concrete",
                   "cyan_concrete", "white_concrete"]
        bays = [(x + 1, ra) for ra, rb in rows for x in list(lines)[:-1]
                if rng.random() < 0.55 and self._fits(x + 1, ra, STREET, x + 2, rb, STREET + 2)]
        vans = set(rng.choice(len(bays), size=3, replace=False).tolist())
        for n, (x, y) in enumerate(bays):
            if n in vans:
                self.van(x, y)
            else:
                self.car(x, y, colours[rng.integers(len(colours))])
        self.bus(18, -51)

    def _fits(self, x0, y0, z0, x1, y1, z1):
        for x in (x0, x1 + 1):
            for y in (y0, y1 + 1):
                if math.sqrt(x * x + y * y + (z1 + 1) ** 2) >= R_IN - 0.5:
                    return False
        return True

    def car(self, x, y, body):
        """2 wide (x), 4 long (y), 2 high, on the street."""
        g = self.g
        g.box(x, y, STREET, x + 1, y + 3, STREET + 1, body)
        for yy in (y, y + 3):
            g.box(x, yy, STREET, x + 1, yy, STREET, "black_concrete")     # wheels
        g.box(x, y + 1, STREET + 1, x + 1, y + 2, STREET + 1, "gray_stained_glass")

    def van(self, x, y):
        g = self.g
        g.box(x, y, STREET, x + 1, y + 3, STREET + 2, "white_concrete")
        for yy in (y, y + 3):
            g.box(x, yy, STREET, x + 1, yy, STREET, "black_concrete")
        g.box(x, y, STREET + 1, x + 1, y + 3, STREET + 1, "gray_stained_glass")
        g.box(x, y + 1, STREET + 1, x + 1, y + 2, STREET + 1, "white_concrete")

    def bus(self, x, y):
        """12 long along x, 3 wide, 3 high."""
        g = self.g
        g.box(x, y, STREET, x + 11, y + 2, STREET + 2, "white_concrete")
        g.box(x, y, STREET, x + 11, y + 2, STREET, "green_concrete")
        g.box(x, y, STREET + 1, x + 11, y + 2, STREET + 1, "black_stained_glass")
        for xx in (x + 1, x + 2, x + 9, x + 10):
            g.box(xx, y, STREET, xx, y, STREET, "black_concrete")
            g.box(xx, y + 2, STREET, xx, y + 2, STREET, "black_concrete")

    def plaza(self):
        g = self.g
        x0, y0, _, x1, y1, _ = BOXES["plaza"]
        self.take(x0, y0, x1, y1, margin=2)
        self.paint(x0, y0, x1, y1, "pink_terracotta")
        for v in range(x0 + 3, x1, 6):                       # paving joints
            self.paint(v, y0, v, y1, "white_terracotta")
            self.paint(x0, v, x1, v, "white_terracotta")
        self.paint(x0, -30, x1, -30, "yellow_concrete")      # tactile guide strips
        self.paint(-30, y0, -30, -30, "yellow_concrete")
        for cx, cy in ((-42, -42), (-42, -32), (-32, -42)):  # planters with a small tree
            g.box(cx - 1, cy - 1, STREET, cx + 1, cy + 1, STREET, "bricks")
            g.set(cx, cy, STREET, GRASS)
            self.tree(cx, cy, trunk=3, radius=1.8, base=STREET + 1)
        for bx, by, horiz in ((-40, -45, True), (-34, -45, True), (-45, -38, False),
                              (-45, -35, False)):
            if horiz:
                g.box(bx, by, STREET, bx + 2, by, STREET, "spruce_planks")
            else:
                g.box(bx, by, STREET, bx, by + 2, STREET, "spruce_planks")

    def subway(self):
        g = self.g
        _, _, _, _, _, top = BOXES["tunnel"]
        # lining, then the bore
        g.box(-72, -6, -38, 71, 6, -30, "polished_andesite")
        g.box(-72, -6, -30, 71, 6, -30, "gray_concrete")
        g.box(*BOXES["tunnel"], AIR)
        g.box(-72, -5, -37, 71, 5, -37, "gravel")
        g.box(-72, 0, -37, 71, 0, -37, "smooth_stone")
        for x in (-59, 59):                                  # dark ends: the bore runs on
            g.box(x, -5, -36, x, 5, -31, "black_concrete")
        for y in (-3, 3):
            g.box(-58, y, -36, 58, y, -36, "rail_ew")
        for x in range(-56, 57, 4):
            g.box(x, 0, -36, x, 0, top, "light_gray_concrete")
        for x in range(-54, 55, 12):
            for y in (-3, 3):
                g.set(x, y, -30, "sea_lantern")
        # platform on the south side, raised one block, with a tactile edge
        g.box(-31, -10, -37, -9, -6, -30, "polished_andesite")
        g.box(-31, -10, -30, -9, -6, -30, "gray_concrete")
        g.box(-30, -9, -35, -10, -6, -31, AIR)
        g.box(*BOXES["platform"], "smooth_stone")
        g.box(-30, -5, -36, -10, -5, -36, "yellow_concrete")
        for x in range(-28, -10, 6):
            g.box(x, -9, -35, x + 1, -9, -35, "spruce_planks")   # benches
            g.set(x + 3, -6, -30, "sea_lantern")
        # three-car train on the north track
        for xa, xb in TRAIN:
            g.box(xa, 2, -35, xb, 4, -32, "white_concrete")
            g.box(xa, 2, -34, xb, 4, -34, "red_concrete")
            g.box(xa + 1, 3, -34, xb - 1, 3, -33, AIR)
            for x in range(xa + 1, xb):
                if (x - xa) % 4 != 0:
                    g.set(x, 2, -33, "black_stained_glass")
                    g.set(x, 4, -33, "black_stained_glass")
            g.box(xa, 2, -32, xb, 4, -32, "light_gray_concrete")
            for x in (xa + 1, xa + 2, xb - 2, xb - 1):
                g.set(x, 2, -36, "black_concrete")
                g.set(x, 4, -36, "black_concrete")
        for xa, xb in ((TRAIN[0][1] + 1, TRAIN[1][0] - 1), (TRAIN[1][1] + 1, TRAIN[2][0] - 1)):
            g.box(xa, 3, -35, xb, 3, -34, "black_concrete")
        for x in (TRAIN[0][0], TRAIN[-1][1]):
            g.box(x, 2, -33, x, 4, -33, "black_stained_glass")

    # -------------------------------------------------------------- named buildings

    def turf(self):
        """A: beige block with window bands, a turf roof, the red shed and a fence."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["turf"]
        self.building("turf", "smooth_sandstone", z1)
        for z in range(-21, -1, 3):
            g.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z, "light_gray_concrete")
        glass, frame = self.id("blue_stained_glass"), self.id("smooth_quartz")
        plinth = self.id("terracotta")

        def rule(U, Z, edge, face):
            win = ((Z + 24) % 3 == 1) & ~edge & (Z < z1)
            ids = np.where(win, np.where(U % 4 == 0, frame, glass), 0)
            return np.where(Z == z0, plinth, ids)
        self.facade((x0, y0, z0, x1, y1, z1), rule)
        # lobby on the south side
        g.box(-4, y0, z0, 4, y0, z0 + 3, "smooth_quartz")
        g.box(-3, y0, z0, 3, y0, z0 + 2, "light_blue_stained_glass")
        g.box(-5, y0 - 2, z0 + 3, 5, y0 - 1, z0 + 3, "smooth_quartz")
        # roof: turf with a court marked on it, parapet, fence on south and east
        g.box(x0 + 1, y0 + 1, z1, x1 - 1, y1 - 1, z1, TURF)
        g.shell(-9, -11, z1, 9, 11, z1, PAINT, floor=False, roof=False)
        g.box(-9, 0, z1, 9, 0, z1, PAINT)
        g.box(-1, -1, z1, 0, -1, z1, PAINT)                    # start mark under the origin
        g.shell(x0, y0, 0, x1, y1, 0, "light_gray_concrete", floor=False, roof=False)
        g.box(x0 + 1, y0, 1, x1 - 1, y0, 2, "iron_bars_ew")
        g.box(x0, y0, 1, x0, y0, 2, "iron_bars_e")
        g.box(x1, y0 + 1, 1, x1, y1 - 1, 2, "iron_bars_ns")
        g.box(x1, y1, 1, x1, y1, 2, "iron_bars_s")
        g.box(x1, y0, 1, x1, y0, 2, "iron_bars_nw")
        # the red shed: hollow, dark red roof trim, a door and two windows facing south
        sx0, sy0, sz0, sx1, sy1, sz1 = BOXES["shed"]
        g.box(sx0, sy0, sz0, sx1, sy1, sz1, "red_concrete")
        g.box(sx0 + 1, sy0 + 1, sz0, sx1 - 1, sy1 - 1, sz1 - 1, AIR)
        g.shell(sx0, sy0, sz1, sx1, sy1, sz1, "red_nether_bricks", floor=False, roof=False)
        g.box(-7, sy0, 0, -6, sy0, 1, AIR)
        g.box(-3, sy0, 2, -2, sy0, 2, "black_stained_glass")
        g.box(0, sy0, 2, 1, sy0, 2, "black_stained_glass")

    def pink(self):
        """B: pastel pink apartments, white balcony slabs on the east face every floor."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["pink"]
        self.building("pink", "pink_wool", z1 - 1)
        floors = range(-22, z1, 3)
        for z in floors:
            g.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z, "light_gray_concrete")
        band, glass = self.id("smooth_quartz"), self.id("light_blue_stained_glass")

        def rule(U, Z, edge, face):
            k = (Z + 22) % 3
            win = (k != 0) & np.isin(U % 4, (1, 2)) & ~edge & (Z > -22)
            return np.where((k == 0) & (Z >= -22), band, np.where(win, glass, 0))
        self.facade((x0, y0, z0, x1, y1, z1 - 1), rule)
        g.box(x0, y0, z1, x1, y1, z1, "light_gray_concrete")
        g.shell(x0, y0, z1 + 1, x1, y1, z1 + 1, "white_concrete", floor=False, roof=False)
        for z in floors:
            g.box(x1 + 1, y0 + 1, z, x1 + 1, y1 - 1, z, "smooth_quartz")
        g.box(x1, -1, z0, x1, 1, z0 + 1, "light_blue_stained_glass")    # entrance

    def glass_office(self):
        """C: ribbon-glass office, hollow with real floors, a glass parapet on the roof."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["glass"]
        self.building("glass", "white_concrete", z1 - 1)
        glass = self.id("light_blue_stained_glass")
        self.facade((x0, y0, z0, x1, y1, z1 - 1),
                    lambda U, Z, edge, face: np.where((Z % 3 != 2) & ~edge, glass, 0))
        for z in C_FLOORS:
            g.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z, "gray_concrete")
        for x in (19, 30):
            for y in (-7, 2):
                g.box(x, y, z0, x, y, z1 - 1, "light_gray_concrete")
        g.box(x0, y0, z1, x1, y1, z1, "light_gray_concrete")
        g.shell(x0, y0, z1 + 1, x1, y1, z1 + 2, "glass", floor=False, roof=False)
        for x in range(x0, x1 + 1, 5):
            g.box(x, y0, z1 + 1, x, y0, z1 + 2, "white_concrete")
            g.box(x, y1, z1 + 1, x, y1, z1 + 2, "white_concrete")
        for y in range(y0, y1 + 1, 6):
            g.box(x0, y, z1 + 1, x0, y, z1 + 2, "white_concrete")
            g.box(x1, y, z1 + 1, x1, y, z1 + 2, "white_concrete")
        g.box(26, 0, z1 + 1, 29, 3, z1 + 2, "light_gray_concrete")      # plant boxes
        g.box(29, -10, z1 + 1, 31, -7, z1 + 1, "light_gray_concrete")
        # the dark office floor (slab -5, walked at -4): desks, cabinets, partitions
        f = -4
        for dx, dy in ((16, -10), (16, 0), (31, -10), (31, 0)):
            g.box(dx, dy, f, dx + 1, dy + 3, f, "dark_oak_planks")
            for yy in (dy, dy + 2):
                g.set(dx, yy, f + 1, "black_concrete")
                g.set(dx + 1, yy + 1, f + 1, "black_concrete")
        g.box(21, y1 - 1, f, 27, y1 - 1, f + 1, "light_gray_concrete")
        g.box(22, y0 + 1, f, 22, y0 + 3, f + 2, "white_concrete")
        g.box(27, y0 + 1, f, 27, y0 + 3, f + 2, "white_concrete")
        g.box(23, y0 + 3, f, 26, y0 + 3, f + 2, "light_gray_stained_glass")
        g.box(24, y0 + 3, f, 25, y0 + 3, f + 1, AIR)                 # meeting room door
        for x, y in ((18, -3), (31, -3), (24, 3)):
            g.set(x, y, f + 2, "light_dim")

    def atrium(self):
        """D: glass-roofed hall on a red steel grid, open down to a white floor."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["atrium"]
        self.building("atrium", "white_concrete", z1 - 1)
        glass = self.id("light_blue_stained_glass")
        self.facade((x0, y0, z0, x1, y1, z1 - 1),
                    lambda U, Z, edge, face: np.where(np.isin((Z + 24) % 4, (1, 2)) & (U % 4 != 0)
                                                      & ~edge & (Z < z1 - 1), glass, 0))
        u, v = np.arange(x0, x1 + 1)[:, None], np.arange(y0, y1 + 1)[None, :]
        roof = np.where(((u - x0) % 3 == 0) | ((v - y0) % 3 == 0),
                        self.id("red_concrete"), self.id("light_blue_stained_glass"))
        self.view(x0, y0, z1, x1, y1, z1)[:, :, 0] = roof
        g.shell(x0, y0, z1, x1, y1, z1, "red_concrete", floor=False, roof=False)
        self.paint(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "smooth_quartz")

    def orange(self):
        """E: orange apartments, hollow floors every 3, balconies with white rails south."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["orange"]
        self.building("orange", "orange_terracotta", z1 - 1)
        floors = range(-22, 0, 3)
        for z in floors:
            g.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z, "light_gray_concrete")
        band, glass = self.id("terracotta"), self.id("light_blue_stained_glass")

        def rule(U, Z, edge, face):
            k = (Z + 22) % 3
            win = (k != 0) & np.isin(U % 4, (1, 2)) & ~edge & (Z > -22)
            return np.where((k == 0) & (Z >= -22), band, np.where(win, glass, 0))
        self.facade((x0, y0, z0, x1, y1, z1 - 1), rule)
        g.box(x0, y0, z1, x1, y1, z1, "light_gray_concrete")
        g.shell(x0, y0, z1 + 1, x1, y1, z1 + 1, "terracotta", floor=False, roof=False)
        for z in floors:
            g.box(x0 + 1, y0 - 2, z, x1 - 1, y0 - 1, z, "smooth_quartz")
            g.box(x0 + 1, y0 - 2, z + 1, x1 - 1, y0 - 2, z + 1, "white_concrete")
            for x in range(x0 + 1, x1, 5):
                g.box(x, y0 - 2, z + 1, x, y0 - 1, z + 1, "white_concrete")
            g.box(x1 - 1, y0 - 2, z + 1, x1 - 1, y0 - 1, z + 1, "white_concrete")

    def slope(self):
        """G: low block under a light blue roof stepping up from z -10 (south) to -2."""
        g = self.g
        x0, y0, z0, x1, y1, z1 = BOXES["slope"]
        wall_top = -11
        self.building("slope", "light_gray_concrete", wall_top)
        for z in range(-21, wall_top, 3):
            g.box(x0 + 1, y0 + 1, z, x1 - 1, y1 - 1, z, "light_gray_concrete")
        glass = self.id("light_blue_stained_glass")
        self.facade((x0, y0, z0, x1, y1, wall_top),
                    lambda U, Z, edge, face: np.where(((Z + 24) % 3 == 1) & (U % 3 != 0) & ~edge,
                                                      glass, 0))
        for y in range(y0, y1 + 1):
            zr = -10 + int(math.floor((y - y0) * 8 / (y1 - y0) + 0.5))
            if zr - 2 >= wall_top:
                g.box(x0, y, wall_top, x0, y, zr - 2, "light_gray_concrete")   # gables
                g.box(x1, y, wall_top, x1, y, zr - 2, "light_gray_concrete")
            if y == y1:
                g.box(x0, y, wall_top, x1, y, zr - 2, "light_gray_concrete")
            g.box(x0 - 1, y, zr - 1, x1 + 1, y, zr, "light_blue_terracotta")

    def dome(self):
        """F: round podium with a geodesic-looking hemisphere on it."""
        g = self.g
        x0, y0, z0, x1, y1, _ = BOXES["dome"]
        cx, cy, cz = DOME_C
        self.take(x0, y0, x1, y1, margin=3)
        self.interiors.append(BOXES["dome"])
        sl = g._sl(x0, y0, GROUND + 1, x1, y1, -2)
        X, Y, Z = (A[sl] for A in (self.X, self.Y, self.Z))
        a = g.a[sl]
        rp = np.hypot(X + 0.5 - cx, Y + 0.5 - cy)
        podium = rp <= 13.0
        a[podium & (Z <= -16)] = self.id("smooth_stone")
        a[podium & (Z == -15)] = self.id("polished_andesite")
        a[podium & (rp > 12.0) & (Z == -14)] = self.id("light_gray_concrete")      # rim
        dz = Z + 0.5 - cz
        d = np.sqrt(rp ** 2 + dz ** 2)
        shell = (d <= DOME_R) & (d > DOME_R - 1.2) & (dz > 0)
        # geodesic look: a triangle lattice in plan (three families of lines at 120
        # degrees, `step` apart) dropped vertically onto the dome, plus one ring
        px, py = X + 0.5 - cx, Y + 0.5 - cy
        step = 7.0
        lines = Z == int(cz) + 4
        for ang in (90, 210, 330):
            u = (px * math.cos(math.radians(ang)) + py * math.sin(math.radians(ang))) / step
            lines |= np.abs(u - np.round(u)) * step < 0.5
        a[shell] = self.id("white_concrete")
        a[shell & lines] = self.id("light_gray_concrete")
        self.paint(x0, y0, x1, y1, SIDEWALK)

    # -------------------------------------------------------------- background

    def city_ring(self):
        """Background blocks: a ring of towers (8..40 high) between radius ~52 and the
        shell, then low-rise infill (4..14 high) in the plots still free further in."""
        schemes = [("light_gray_concrete", "gray_concrete"),
                   ("white_terracotta", "light_gray_terracotta"),
                   ("light_blue_terracotta", "blue_terracotta"),
                   ("cyan_terracotta", "gray_concrete"),
                   ("smooth_stone", "cyan_terracotta"),
                   ("white_concrete", "light_blue_terracotta"),
                   ("stone_bricks", "gray_concrete"),
                   ("light_gray_terracotta", "gray_terracotta"),
                   ("blue_terracotta", "gray_concrete"),
                   ("purple_terracotta", "gray_terracotta")]
        rng = self.rng("city")
        self._scatter(rng, schemes, 4000, radius=(52, 64), size=(5, 14), height=(8, 40), far=67.0)
        self._scatter(rng, schemes, 4000, radius=(24, 62), size=(5, 11), height=(4, 14), far=65.5)

    def _scatter(self, rng, schemes, tries, radius, size, height, far):
        g = self.g
        for _ in range(tries):
            ang = rng.uniform(0, 2 * math.pi)
            rad = rng.uniform(*radius)
            w, l = (int(v) for v in rng.integers(size[0], size[1] + 1, size=2))
            x0 = int(round(rad * math.cos(ang) - w / 2))
            y0 = int(round(rad * math.sin(ang) - l / 2))
            x1, y1 = x0 + w - 1, y0 + l - 1
            r_max = max(math.hypot(x, y) for x in (x0, x1 + 1) for y in (y0, y1 + 1))
            if r_max > far:
                continue
            if self.taken[g._sl(x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 0)[:2]].any():
                continue
            ztop = int(math.floor(math.sqrt(R_IN ** 2 - r_max ** 2))) - 2   # roof inside
            top = min(STREET + int(rng.integers(height[0], height[1] + 1)) - 1, ztop)
            if top < STREET + height[0] - 1:
                continue
            wall, win = schemes[rng.integers(len(schemes))]
            g.shell(x0, y0, STREET, x1, y1, top, wall, floor=False)
            win_id = self.id(win)
            self.facade((x0, y0, STREET, x1, y1, top - 1),
                        lambda U, Z, edge, face: np.where(((Z - STREET) % 3 == 1) & ~edge
                                                          & (U % 3 != 0), win_id, 0))
            if rng.random() < 0.35 and w > 6 and l > 6:
                g.box(x0 + 2, y0 + 2, top + 1, x0 + 4, y0 + 3, top + 2, "light_gray_concrete")
            self.paint(x0 - 1, y0 - 1, x1 + 1, y1 + 1, SIDEWALK)
            self.take(x0, y0, x1, y1, margin=int(rng.integers(1, 4)))
            self.interiors.append((x0, y0, STREET, x1, y1, top))

    def tree(self, x, y, trunk=4, radius=2.2, base=STREET):
        g = self.g
        top = base + trunk - 1
        cz = top + 1.5
        n = int(math.ceil(radius))
        sl = g._sl(x - n, y - n, top - n + 1, x + n, y + n, top + n + 1)
        if sl is None:
            return
        X, Y, Z = (A[sl] for A in (self.X, self.Y, self.Z))
        blob = (X - x) ** 2 + (Y - y) ** 2 + (Z + 0.5 - cz) ** 2 <= radius ** 2
        a = g.a[sl]
        a[blob & (a == AIR)] = self.id("oak_leaves")
        g.box(x, y, base, x, y, top, "oak_log")

    def trees(self):
        g = self.g
        spots = []
        for t in range(-68, 69, 7):
            spots += [(t, -26), (t, -14), (-26, t), (-14, t)]
        spots += [(40, 30), (46, 36), (14, 58), (20, 34), (-2, 44), (-8, 50), (40, -20)]
        for x, y in spots:
            if -28 <= x <= -12 and -28 <= y <= -12:
                continue                                   # keep the junction clear
            if math.hypot(x, y) > 62:
                continue
            region = g._sl(x - 2, y - 2, STREET, x + 2, y + 2, STREET + 6)
            if g.a[region].any():
                continue
            if g.get(x, y, GROUND) == self.id(ASPHALT):
                continue
            self.tree(x, y)

    def close_sphere(self):
        """Clear everything outside the shell's inner radius, then lay the sky shell."""
        g, d, Z = self.g, self.d, self.Z
        g.a[d >= R_IN] = AIR
        shell = (d >= R_IN) & (d <= R)
        # height bands, dithered so the steps between them read as a gradient
        t = (np.broadcast_to(Z, g.a.shape)[shell]
             + (_hash(self.X, self.Y, self.Z)[shell] - 0.5) * 5.0)
        bands = [self.id(k) for k in ("white_terracotta", "purpur_block", "packed_ice",
                                      "blue_ice", "lapis_block", "blue_concrete")]
        g.a[shell] = np.array(bands, dtype=np.uint16)[np.digitize(t, (-12, 0, 14, 30, 48))]

    def lights(self):
        """Invisible light blocks on an 8-block lattice in open air, and in the tunnel."""
        g, X, Y, Z = self.g, self.X, self.Y, self.Z
        lattice = (X % 8 == 0) & (Y % 8 == 0) & (Z % 8 == 2) & (Z >= STREET + 2)
        lattice = lattice & (self.d < R_IN - 2) & (g.a == AIR)
        for x0, y0, z0, x1, y1, z1 in self.interiors:
            sl = g._sl(x0, y0, z0, x1, y1, z1)
            if sl is not None:
                lattice[sl] = False
        g.a[lattice] = self.id("light")
        for x in range(-56, 57, 8):
            for y in (-3, 3):
                if g.get(x, y, -31) == AIR:
                    g.set(x, y, -31, "light")
        for x in range(-28, -10, 8):
            g.set(x, -8, -32, "light")
