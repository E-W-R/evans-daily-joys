#!/usr/bin/env python3
"""Build the map Odd One Out is played on.

    python3 tools/build_odd_one_out.py

writes games/odd-one-out/map/ from OpenStreetMap: land.png (the shape of the land
and water across Metro Vancouver) and roads.json (every main street, with its
name). The two of them are about 450 KB and cover the whole region, so every week
and every round shares them, and nothing is downloaded while anyone plays.

This takes a few minutes and pulls down about 30 MB, so it only wants running when
the streets look out of date -- once a year is plenty. Downloads are kept in
tools/.cache/, so a second run costs nothing. Neither file it writes is meant to
be edited by hand.

The pins themselves aren't built by anything: they're written straight into
games/odd-one-out/odd_one_out.json as [latitude, longitude]. Keep them inside the
box below, or widen it and rebuild.

Map data is (c) OpenStreetMap contributors, ODbL -- games/odd-one-out/game.js
credits it on screen.
"""

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "games" / "odd-one-out"
CACHE = ROOT / "tools" / ".cache"

AGENT = "EvansDailyJoys/1.0 (https://github.com/EvanRossiter)"
OVERPASS = "https://overpass-api.de/api/interpreter"

# The patch of the world the map covers: Metro Vancouver, from the Strait of
# Georgia out to Coquitlam, and from the U.S. border area up past North Vancouver.
# Every pin has to land inside it. Widen it and rebuild if a week ever reaches
# further out.
SOUTH, WEST, NORTH, EAST = 49.00, -123.40, 49.45, -122.65

# land.png is this many pixels wide, and as many tall as keeps its pixels square.
# At this size one pixel is about 27 m, finer than the game ever draws, so the
# coastline stays crisp however close a round's map is cropped.
MASK_WIDTH = 2048

# Somewhere in open water inside the box, used to work out which side of the
# coastline the sea is on. The Strait of Georgia, well off Tsawwassen.
SEA_SEED = (49.02, -123.39)

# Points the finished mask is checked against, because a coastline that fails to
# close would flood the land instead of the sea and the map would come out inside
# out. If one of these is wrong the build stops rather than writing a broken map.
MASK_CHECKS = [
    (49.2827, -123.1207, "land", "downtown Vancouver"),
    (49.2496, -123.1008, "land", "Main Street at King Edward"),
    (49.1666, -123.1336, "land", "Richmond city centre"),
    (49.3040, -123.1300, "water", "Burrard Inlet"),
    (49.2760, -123.1600, "water", "English Bay"),
    (49.1990, -123.1300, "water", "the north arm of the Fraser"),
    (49.1190, -123.0800, "water", "the main arm of the Fraser"),
]

# Ponds smaller than this, in square metres, are left off: at the size the game
# draws the map they'd be a speck of noise. Trout Lake, the smallest lake anyone
# would recognise, is about twenty times this.
MIN_WATER_M2 = 15000

# Streets worth drawing, grouped into four weights. 1 is a highway and 4 is a
# neighbourhood through-street; game.js draws the low numbers thicker and labels
# them first, and leaves 4 out until a round's map is cropped in close.
ROAD_RANKS = {
    "motorway": 1, "motorway_link": 1, "trunk": 1, "trunk_link": 1,
    "primary": 2, "primary_link": 2,
    "secondary": 3, "secondary_link": 3,
    "tertiary": 4,
}

# How far a street is allowed to drift from its true line when its shape is
# thinned out, in metres. Well under one pixel of the drawn map.
SIMPLIFY_M = 25


# ---------- Small helpers ----------

def merc(lat):
    """Latitude in Web Mercator degrees, so north-south and east-west match up."""
    return math.degrees(math.log(math.tan(math.radians(45 + lat / 2))))


def fetch(url, data=None, timeout=300):
    request = urllib.request.Request(url, data=data, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def cached(name, build):
    """Run build() once and keep what it returned in tools/.cache/<name>."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if path.exists():
        return json.loads(path.read_text())
    value = build()
    path.write_text(json.dumps(value))
    return value


# ---------- The map ----------

def overpass(name, query):
    def download():
        print(f"  downloading {name}...")
        body = urllib.parse.urlencode({"data": query}).encode()
        for attempt in range(1, 6):
            raw = fetch(OVERPASS, data=body)
            if raw.lstrip()[:1] == b"{":
                return json.loads(raw)["elements"]
            print(f"  server busy, waiting (try {attempt} of 5)")
            time.sleep(20)
        sys.exit("Overpass kept turning the query away. Try again later.")

    elements = cached(f"odd-one-out-osm-{name}.json", download)
    print(f"  {name}: {len(elements)} pieces")
    return elements


def water_rings(element):
    """The outlines of one lake or river, as outer edges and islands inside them.

    A small lake is one closed way. A big one is a relation: a bag of separate
    edges that have to be joined end to end before they make a shape at all.
    """
    found = {"outer": [], "inner": []}
    if element["type"] == "way" and element.get("geometry"):
        found["outer"].append([(p["lon"], p["lat"]) for p in element["geometry"]])
        return found
    pieces = {}
    for member in element.get("members", []):
        role = member.get("role") or "outer"
        if member.get("type") != "way" or not member.get("geometry") or role not in found:
            continue
        pieces.setdefault(role, []).append(
            [(p["lon"], p["lat"]) for p in member["geometry"]])
    for role, lines in pieces.items():
        found[role] = stitch(lines)
    return found


def ring_area(ring):
    """Roughly how big a ring is on the ground, in square metres."""
    twice = sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
                for i in range(len(ring) - 1))
    square_degree = 111320 * 111320 * math.cos(math.radians((NORTH + SOUTH) / 2))
    return abs(twice) / 2 * square_degree


def build_mask():
    """Paint the land white and leave the sea, the river and the lakes clear."""
    box = f"{SOUTH},{WEST},{NORTH},{EAST}"
    shore = overpass("shore", f"""[out:json][timeout:600];
        (way["natural"="coastline"]({box});
         way["natural"="water"]({box});
         rel["natural"="water"]({box});
         way["waterway"="riverbank"]({box});
        );
        out geom;""")

    span_x = EAST - WEST
    span_y = merc(NORTH) - merc(SOUTH)
    width = MASK_WIDTH
    height = round(width * span_y / span_x)

    def point(lat, lon):
        return ((lon - WEST) / span_x * width, (merc(NORTH) - merc(lat)) / span_y * height)

    land = Image.new("L", (width, height), 255)
    pen = ImageDraw.Draw(land)

    # The coastline is a line, not a shape: draw it, then flood the sea in from a
    # point that is definitely open water and let it run wherever it can reach.
    for element in shore:
        if element.get("tags", {}).get("natural") == "coastline" and element.get("geometry"):
            line = [point(p["lat"], p["lon"]) for p in element["geometry"]]
            if len(line) > 1:
                pen.line(line, fill=0, width=2)
    ImageDraw.floodfill(land, tuple(round(v) for v in point(*SEA_SEED)), 0)

    # Lakes and the river upstream are drawn as shapes already, and they don't
    # touch the sea, so they're filled in after the flood rather than found by it.
    # Outer rings first, then the islands inside them back to land.
    for fill, role in ((0, "outer"), (255, "inner")):
        for element in shore:
            if element.get("tags", {}).get("natural") == "coastline":
                continue
            for ring in water_rings(element)[role]:
                if len(ring) < 4 or (role == "outer" and ring_area(ring) < MIN_WATER_M2):
                    continue
                pen.polygon([point(lat, lon) for lon, lat in ring], fill=fill)

    for lat, lon, expected, where in MASK_CHECKS:
        x, y = (round(v) for v in point(lat, lon))
        got = "land" if land.getpixel((x, y)) else "water"
        if got != expected:
            sys.exit(f"The map came out wrong: {where} is {got}, not {expected}. "
                     "The coastline download is probably incomplete -- clear "
                     "tools/.cache/odd-one-out-osm-shore.json and try again.")

    # White where the land is, see-through everywhere else, so the game can paint
    # the sea in whatever colour the site's palette says and drop this on top.
    white = Image.new("L", (width, height), 255)
    out = Image.merge("RGBA", (white, white, white, land))

    (GAME / "map").mkdir(parents=True, exist_ok=True)
    out.save(GAME / "map" / "land.png", optimize=True)
    size = (GAME / "map" / "land.png").stat().st_size
    print(f"  land.png: {width}x{height}, {size // 1024} KB")


def simplify(line, tolerance):
    """Douglas-Peucker: drop the points that don't change the shape."""
    if len(line) < 3:
        return line
    (x0, y0), (x1, y1) = line[0], line[-1]
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    worst, at = -1.0, 0
    for i in range(1, len(line) - 1):
        x, y = line[i]
        away = (abs(dy * x - dx * y + x1 * y0 - y1 * x0) / length if length
                else math.hypot(x - x0, y - y0))
        if away > worst:
            worst, at = away, i
    if worst > tolerance:
        return simplify(line[:at + 1], tolerance)[:-1] + simplify(line[at:], tolerance)
    return [line[0], line[-1]]


def stitch(lines):
    """Join pieces that share an end into one long street."""
    at_end = {}
    for i, line in enumerate(lines):
        at_end.setdefault(line[0], []).append(i)
        at_end.setdefault(line[-1], []).append(i)
    used = [False] * len(lines)
    joined = []
    for i, line in enumerate(lines):
        if used[i]:
            continue
        used[i] = True
        chain = list(line)
        growing = True
        while growing:
            growing = False
            for end, backwards in ((chain[-1], False), (chain[0], True)):
                for j in at_end.get(end, []):
                    if used[j]:
                        continue
                    piece = lines[j]
                    if piece[0] == end:
                        pass
                    elif piece[-1] == end:
                        piece = piece[::-1]
                    else:
                        continue
                    used[j] = True
                    growing = True
                    chain = piece[::-1][:-1] + chain if backwards else chain + piece[1:]
                    break
                if growing:
                    break
        joined.append(chain)
    return joined


def build_roads():
    box = f"{SOUTH},{WEST},{NORTH},{EAST}"
    kinds = "|".join(ROAD_RANKS)
    ways = overpass("roads", f"""[out:json][timeout:600];
        (way["highway"~"^({kinds})$"]({box}););
        out geom;""")

    # OpenStreetMap chops a street into a piece per block. Gathering them by name
    # first turns thousands of stubs into a few hundred streets, which is smaller
    # to ship and lets the game label a street once along its whole length.
    by_street = {}
    for way in ways:
        shape = way.get("geometry")
        tags = way.get("tags", {})
        rank = ROAD_RANKS.get(tags.get("highway"))
        if not shape or len(shape) < 2 or not rank:
            continue
        name = tags.get("name", "")
        key = (rank, name)
        line = [(round(p["lon"], 6), round(p["lat"], 6)) for p in shape]
        by_street.setdefault(key, []).append(line)

    tolerance = SIMPLIFY_M / 111320.0
    out, points = [], 0
    for (rank, name), lines in sorted(by_street.items()):
        for chain in stitch(lines):
            thinned = simplify(chain, tolerance)
            points += len(thinned)
            flat = [round(v, 5) for point in thinned for v in point]
            street = {"r": rank, "p": flat}
            if name:
                street["n"] = name
            out.append(street)

    roads = {"bbox": [SOUTH, WEST, NORTH, EAST], "ways": out}
    path = GAME / "map" / "roads.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(roads, separators=(",", ":")))
    print(f"  roads.json: {len(out)} streets, {points} points, "
          f"{path.stat().st_size // 1024} KB")


def main():
    argparse.ArgumentParser(description=__doc__.split("\n")[0]).parse_args()
    sys.setrecursionlimit(20000)
    print("Building the map from OpenStreetMap (downloads are cached in tools/.cache/)")
    build_mask()
    build_roads()
    print("Done. games/odd-one-out/map/ is rebuilt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
