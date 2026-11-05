#!/usr/bin/env python3
"""Lock Date Guessr's photos so they can sit in a public repo.

Drop photos into games/date-guessr/images/ (that folder is git-ignored, and the
originals must never be committed) and run:

    python3 tools/build_date_guessr.py

It asks for the keyphrase, then writes games/date-guessr/locked/:

    lock.json          salt, round count, and a test blob for checking a keyphrase
    rounds.bin         every week's answers: the day and the spot each photo was taken
    w<week>-<n>.bin    the photo itself, cropped square and shrunk

Each .bin is 12 bytes of nonce followed by AES-256-GCM ciphertext. The key comes
from the keyphrase through PBKDF2-SHA256, and only the salt and the iteration count
are written down -- never the keyphrase, which this script reads from the terminal
and keeps in memory. Without it the locked folder is noise: file names and sizes
give away nothing beyond how many photos there are.

The nonces are derived from the key and the file's contents instead of being random,
so a rebuild that changes nothing writes byte-identical files and git sees no churn.

Two photos make one week, in the order rounds.bin already has them: photos that are
already in there keep their week, and new ones are shuffled and dealt onto the end.
So adding photos later never moves a week she has already played. A photo needs both
a date and a location in its metadata; the ones without a location are listed and
left out.

Needs Pillow and cryptography:

    python3 -m pip install Pillow cryptography
"""

import argparse
import base64
import getpass
import hashlib
import hmac
import io
import json
import random
import re
import secrets
import sys
from pathlib import Path

try:
    from PIL import Image, ExifTags
except ImportError:
    sys.exit("This needs Pillow: python3 -m pip install Pillow")

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("This needs cryptography: python3 -m pip install cryptography")

GAME = Path(__file__).resolve().parent.parent / "games" / "date-guessr"
PHOTOS = GAME / "images"
OUT = GAME / "locked"

PER_WEEK = 2  # photos a week, which is one game day
SIZE = 1000  # the square's side in pixels: plenty for a phone, kind to the repo
QUALITY = 82
ITERATIONS = 400_000  # PBKDF2 rounds: about half a second on a phone
CHECK = b"date-guessr"  # encrypted into lock.json, so a keyphrase can be checked
SEED = 20261108  # fixed, so dealing out the same photos gives the same weeks


# ---------- The keyphrase ----------

def tidy(phrase):
    """A keyphrase as it's compared: lowercase words, nothing else.

    The same function lives in games/date-guessr/locked.js. Keep the two identical,
    or a phrase that unlocks here won't unlock in the game.
    """
    return " ".join(re.findall(r"[a-z0-9]+", phrase.lower()))


def derive(phrase, salt, iterations=ITERATIONS):
    return hashlib.pbkdf2_hmac("sha256", tidy(phrase).encode(), salt, iterations, 32)


def ask_for_key(lock):
    """The key, from a keyphrase typed in at the terminal. Never echoed, never saved."""
    if lock:
        salt = base64.b64decode(lock["salt"])
        for attempt in range(3):
            key = derive(getpass.getpass("Keyphrase: "), salt, lock["iterations"])
            if open_bytes(key, base64.b64decode(lock["check"])) == CHECK:
                return key, salt, lock["iterations"]
            print("That's not the keyphrase this folder was locked with.")
        sys.exit("Giving up after three tries.")

    print("Nothing locked yet, so this keyphrase becomes the one she types in.")
    phrase = getpass.getpass("New keyphrase: ")
    if not tidy(phrase):
        sys.exit("A keyphrase needs at least one letter or number.")
    if tidy(phrase) != tidy(getpass.getpass("Type it again: ")):
        sys.exit("Those don't match.")
    salt = secrets.token_bytes(16)  # kept in lock.json, so rebuilds reuse it
    return derive(phrase, salt), salt, ITERATIONS


# ---------- Locking and unlocking ----------

def seal(key, name, plaintext):
    """nonce + ciphertext, with the nonce fixed by the key, the name and the bytes."""
    digest = hashlib.sha256(plaintext).digest()
    nonce = hmac.new(key, b"nonce:" + name.encode() + digest, hashlib.sha256).digest()[:12]
    return nonce + AESGCM(key).encrypt(nonce, plaintext, None)


def open_bytes(key, blob):
    """The plaintext inside a sealed blob, or None if the key is wrong."""
    try:
        return AESGCM(key).decrypt(blob[:12], blob[12:], None)
    except (InvalidTag, ValueError):
        return None


# ---------- Reading the photos ----------

def taken_on(exif):
    """The day the photo was taken, "YYYY-MM-DD", or None."""
    stamp = exif["exif"].get("DateTimeOriginal") or exif["base"].get("DateTime")
    match = re.match(r"(\d{4}):(\d{2}):(\d{2})", str(stamp or ""))
    return "-".join(match.groups()) if match else None


def taken_at(exif):
    """Where the photo was taken, (lat, lon) in degrees, or None."""
    gps = exif["gps"]
    if "GPSLatitude" not in gps or "GPSLongitude" not in gps:
        return None

    def degrees(parts, ref, negative):
        d, m, s = (float(part) for part in parts)
        value = d + m / 60 + s / 3600
        return -value if str(ref).upper().startswith(negative) else value

    try:
        return (
            round(degrees(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"), "S"), 6),
            round(degrees(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"), "W"), 6),
        )
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def read_exif(image):
    exif = image.getexif()
    named = lambda tags, table: {table.get(tag, tag): value for tag, value in tags.items()}
    return {
        "base": named(exif, ExifTags.TAGS),
        "exif": named(exif.get_ifd(0x8769), ExifTags.TAGS),
        "gps": named(exif.get_ifd(0x8825), ExifTags.GPSTAGS),
    }


def square(image):
    """The middle square of the photo, SIZE across, as JPEG bytes with no metadata."""
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    crop = image.crop((left, top, left + side, top + side))
    if side > SIZE:
        crop = crop.resize((SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    # A fresh image, saved without exif: no date, no location, no camera, no thumbnail.
    crop.convert("RGB").save(out, "JPEG", quality=QUALITY, optimize=True)
    return out.getvalue()


def gather():
    """Every usable photo as {src, date, lat, lon}, plus the ones to tell Evan about."""
    found, skipped = [], []
    for path in sorted(PHOTOS.iterdir()):
        if path.name.startswith(".") or not path.is_file():
            continue
        try:
            with Image.open(path) as image:
                exif = read_exif(image)
        except Exception as error:  # not an image, or one Pillow can't read
            skipped.append((path.name, f"couldn't be read ({error})"))
            continue
        date, spot = taken_on(exif), taken_at(exif)
        if not date:
            skipped.append((path.name, "no date in its metadata"))
        elif not spot:
            skipped.append((path.name, "no location in its metadata"))
        else:
            found.append({"src": path.name, "date": date, "lat": spot[0], "lon": spot[1]})
    return found, skipped


# ---------- Dealing photos out into weeks ----------

def deal(found, old):
    """Photos in play order: the ones rounds.bin already placed, then the new ones shuffled."""
    by_name = {photo["src"]: photo for photo in found}
    order, placed = [], set()
    for photo in old:  # keeps the weeks she may already have played
        name = photo.get("src")
        if name in by_name and name not in placed:
            order.append(by_name[name])
            placed.add(name)
        else:
            order.append(photo)  # its original is gone; the locked copy still plays
            placed.add(name)
    fresh = [photo for name, photo in by_name.items() if name not in placed]
    random.Random(SEED).shuffle(fresh)
    return order + fresh


def old_rounds(key):
    """What rounds.bin already says, as a flat list of photos, or [] if there's none."""
    path = OUT / "rounds.bin"
    if not path.exists():
        return []
    inside = open_bytes(key, path.read_bytes())
    if inside is None:
        sys.exit(f"{path.name} is damaged: delete the locked folder to start over.")
    weeks = json.loads(inside)
    return [photo for number in sorted(weeks, key=week_number) for photo in weeks[number]]


def week_number(name):
    return int(re.sub(r"\D", "", name) or 0)


# ---------- Writing ----------

def write(path, data, wrote):
    """Writes only when the bytes change, so untouched photos stay untouched in git."""
    wrote.add(path.name)
    if path.exists() and path.read_bytes() == data:
        return False
    path.write_bytes(data)
    return True


def main():
    parser = argparse.ArgumentParser(description="Lock Date Guessr's photos.")
    parser.parse_args()

    if not PHOTOS.is_dir():
        sys.exit(f"No photos folder: {PHOTOS}")
    OUT.mkdir(exist_ok=True)
    lock_path = OUT / "lock.json"
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else None
    key, salt, iterations = ask_for_key(lock)

    found, skipped = gather()
    if not found:
        sys.exit(f"No photos with both a date and a location in {PHOTOS}")
    order = deal(found, old_rounds(key))
    weeks = {
        f"week{index // PER_WEEK + 1}": order[index:index + PER_WEEK]
        for index in range(0, len(order) - len(order) % PER_WEEK, PER_WEEK)
    }

    wrote, changed = set(), 0
    for number, photos in weeks.items():
        for spot, photo in enumerate(photos, start=1):
            name = f"w{week_number(number)}-{spot}.bin"
            source = PHOTOS / photo["src"]
            if not source.exists():
                wrote.add(name)  # locked earlier, original since moved away
                continue
            with Image.open(source) as image:
                changed += write(OUT / name, seal(key, name, square(image)), wrote)

    changed += write(
        OUT / "rounds.bin",
        seal(key, "rounds.bin", json.dumps(weeks, separators=(",", ":")).encode()),
        wrote,
    )
    lock_path.write_text(json.dumps({
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "iterations": iterations,
        "salt": base64.b64encode(salt).decode(),
        "check": base64.b64encode(seal(key, "check", CHECK)).decode(),
        "weeks": len(weeks),
    }, indent=2) + "\n")
    wrote.add(lock_path.name)

    for stale in sorted(OUT.iterdir()):  # anything a previous run left behind
        if stale.name not in wrote:
            stale.unlink()
            print(f"removed {stale.name}")

    leftover = len(order) % PER_WEEK
    print(f"\n{len(weeks)} weeks from {len(weeks) * PER_WEEK} photos, "
          f"{changed} file{'' if changed == 1 else 's'} rewritten.")
    if leftover:
        print(f"{leftover} photo held back: a week needs {PER_WEEK}.")
    if skipped:
        print("\nLeft out:")
        for name, why in skipped:
            print(f"  {name}: {why}")
    print(f"\nLocked into {OUT.relative_to(GAME.parent.parent)}/ "
          f"({sum(f.stat().st_size for f in OUT.iterdir()) / 1e6:.1f} MB).")


if __name__ == "__main__":
    main()
