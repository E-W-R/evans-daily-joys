#!/usr/bin/env python3
"""Build a week of Coot the Wire: cut the bomb sheet, and radio up the recordings.

Drop the week's bomb.png in its folder and your clean takes in its voice/ folder, and
run this. It writes the files the game actually plays and leaves your originals alone,
so you can re-run it with different settings as often as you want.

    games/coot-the-wire/assets/week1/
        bomb.png              <- your sprite sheet: 3n + 2 sprites for n rounds
        voice/                <- your clean takes. Nothing here is ever written to.
            rec1.mp3              mp3, m4a, wav, aiff, caf — whatever you have, and
            rec2.mp3              a folder can mix them. Name them for the round.
        bomb-1.gif ...        <- cut from bomb.png
        hitbox-1.png ...
        bomb.json
        rec1.mp3              <- what this writes, and what the game plays
        rec2.mp3

    python3 tools/build_coot_the_wire.py 1      # just week 1
    python3 tools/build_coot_the_wire.py        # every week with a bomb.png or a voice/ folder

The bomb is cut first, so the check for missing recordings goes by this sheet's
rounds.

The bomb sheet is one column of sprites, all the same size (55px tall; pass
--sprite-height for another), stacked top to bottom in threes: two frames of the
bomb, then the hitbox for the wire to cut on it.

    bomb 1 frame a
    bomb 1 frame b
    hitbox 1          <- peck here while bomb 1 is showing
    bomb 2 frame a
    bomb 2 frame b
    hitbox 2
    ...
    last bomb frame a <- the last bomb has no hitbox: it's the defused one
    last bomb frame b

So n rounds is 3n + 2 sprites. A hitbox sprite is the same size as the bomb with the
pecking target painted in -- any solid colour -- and every other pixel left
see-through. Each bomb becomes bomb-<N>.gif, its two frames a second each on a loop;
each hitbox becomes hitbox-<N>.png; and bomb.json says how many rounds there are.
Old bomb-*.gif and hitbox-*.png from a previous run are cleared out.

What it does to a recording, in order:

    trims the silence off both ends, and evens out the loud and quiet parts
    throws away everything below 300Hz and above 3000Hz, which is most of what
        makes a voice sound like it's in the room with you
    pushes it into a gentle overdrive, so it sounds like a small speaker
        working harder than it wants to
    lays hiss underneath the whole thing
    keys the handset on and off around it: a burst of static at the top, a click
        and a tail of hiss at the end

Needs `lame` to write the mp3 (`brew install lame`). Everything else is already on
your Mac: afconvert reads the recording, numpy and scipy do the work. Without lame it
writes a .wav next to where the mp3 would go, so you can still hear it.

The knobs are at the top of this file, and each one has a --flag. Defaults are a
two-way radio in decent signal; --drive and --hiss are the two worth playing with.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

try:
    import numpy as np
    from scipy import signal
except ImportError:
    sys.exit("This needs numpy and scipy: python3 -m pip install numpy scipy")
try:
    from PIL import Image
except ImportError:
    sys.exit("This needs Pillow: python3 -m pip install Pillow")

WEEKS = Path(__file__).resolve().parent.parent / "games" / "coot-the-wire" / "assets"
READABLE = {".mp3", ".m4a", ".wav", ".aiff", ".aif", ".caf", ".mp4", ".aac"}

RATE = 48000  # Everything is worked out at this rate, then handed to lame.
BITRATE = 64  # kbps, mono. Plenty for a voice that stops at 3kHz.

LOW, HIGH = 300, 3000  # The slot a two-way radio leaves you, in Hz.
DRIVE = 4.0  # How hard the voice is pushed into the overdrive. 1 is clean.
HISS = 0.012  # How loud the background static is, 0 to 1.
SQUELCH = 1.0  # Size of the key-on burst and key-off click. 0 turns them off.
TRIM_HEADROOM = 12  # dB above the room's own hum before it counts as talking.

SPRITE_HEIGHT = 55  # Height of one bomb sprite; --sprite-height for another size.
FRAME_MS = 1000  # How long each of a bomb's two frames shows.
CLEAR_ALPHA = 8  # Anything fainter counts as see-through, same as the game's masks.js.


# ---------- Cutting the bomb ----------

def split(sheet, sprite_height):
    """The sheet's sprites, top to bottom. Raises ValueError if it doesn't add up."""
    if sheet.height % sprite_height:
        raise ValueError(
            f"{sheet.height}px tall isn't a whole number of {sprite_height}px sprites "
            f"(off by {sheet.height % sprite_height}px)"
        )
    count = sheet.height // sprite_height
    if count < 5 or (count + 1) % 3:
        raise ValueError(
            f"{count} sprites doesn't make sets of bomb, bomb, hitbox with two bomb "
            f"sprites left over at the end. Expected 5, 8, 11, 14, ... for 1, 2, 3, 4 rounds"
        )
    return [
        sheet.crop((0, i * sprite_height, sheet.width, (i + 1) * sprite_height))
        for i in range(count)
    ]


def gif_frames(first, second):
    """The two bomb sprites as GIF frames sharing one palette, with transparency."""
    # Quantise both at once so the palette can't shift between frames and flicker.
    together = Image.new("RGB", (first.width, first.height * 2))
    together.paste(first.convert("RGB"), (0, 0))
    together.paste(second.convert("RGB"), (0, first.height))
    palette = together.quantize(colors=255, method=Image.MEDIANCUT)  # Leaves 255 free.

    frames = []
    for sprite in (first, second):
        frame = sprite.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
        see_through = sprite.getchannel("A").point(lambda a: 255 if a < CLEAR_ALPHA else 0)
        frame.paste(255, see_through)
        frames.append(frame)
    return frames


def cut_bomb(folder, sprite_height, frame_ms):
    """Cut bomb.png into bomb-N.gif, hitbox-N.png and bomb.json."""
    sheet = Image.open(folder / "bomb.png").convert("RGBA")
    sprites = split(sheet, sprite_height)
    bombs = [(sprites[i], sprites[i + 1]) for i in range(0, len(sprites), 3)]
    hitboxes = sprites[2::3]

    for stale in list(folder.glob("bomb-*.gif")) + list(folder.glob("hitbox-*.png")):
        stale.unlink()

    for number, (first, second) in enumerate(bombs, start=1):
        frames = gif_frames(first, second)
        frames[0].save(
            folder / f"bomb-{number}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=frame_ms,
            loop=0,
            transparency=255,
            disposal=2,
        )

    for number, hitbox in enumerate(hitboxes, start=1):
        hitbox.save(folder / f"hitbox-{number}.png")
        if not hitbox.getchannel("A").getbbox():
            print(f"  ! hitbox-{number}.png is blank — nothing to peck on that round")

    (folder / "bomb.json").write_text(json.dumps({"rounds": len(hitboxes)}) + "\n")

    print(
        f"{folder.name}: {sheet.width}x{sprite_height} sprites, "
        f"{len(bombs)} bombs and {len(hitboxes)} hitboxes → {len(hitboxes)} rounds"
    )


# ---------- Reading and writing audio ----------

def read_audio(path, folder):
    """Decode any format the Mac knows into mono samples between -1 and 1."""
    wav = folder / "in.wav"
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(path), str(wav)],
        check=True,
        capture_output=True,
    )
    with wave.open(str(wav), "rb") as handle:
        frames = handle.readframes(handle.getnframes())
        channels = handle.getnchannels()
    samples = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    if channels > 1:  # Shouldn't happen — afconvert was asked for one — but just in case.
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples


def write_mp3(samples, path, folder):
    """Write the samples out as an mp3, or as a .wav if lame isn't installed."""
    wav = folder / "out.wav"
    clipped = np.clip(samples, -1.0, 1.0)
    with wave.open(str(wav), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((clipped * 32767).astype("<i2").tobytes())

    if not shutil.which("lame"):
        beside = path.with_suffix(".wav")
        shutil.copy(wav, beside)
        return beside, False

    subprocess.run(
        ["lame", "--quiet", "-m", "m", "-b", str(BITRATE), "-q", "2", str(wav), str(path)],
        check=True,
    )
    return path, True


# ---------- The parts of the sound ----------

def band(samples, low=LOW, high=HIGH, order=4):
    """Keep only what's between two pitches. This is most of the radio sound."""
    sos = signal.butter(order, [low, high], btype="band", fs=RATE, output="sos")
    return signal.sosfilt(sos, samples)


def envelope(samples, attack=0.004, release=0.12, block=64):
    """
    How loud the recording is at each moment: rises quickly, falls away slowly.
    Worked out on one value per `block` samples, which is far faster and sounds the
    same, then stretched back to full length.
    """
    loud = np.abs(samples)
    usable = (len(loud) // block) * block
    peaks = loud[:usable].reshape(-1, block).max(axis=1) if usable else np.array([0.0])
    if usable < len(loud):
        peaks = np.append(peaks, loud[usable:].max())

    rate = RATE / block
    rising = np.exp(-1.0 / (rate * attack))
    falling = np.exp(-1.0 / (rate * release))
    level = 0.0
    smoothed = np.empty_like(peaks)
    for i, peak in enumerate(peaks):
        keep = rising if peak > level else falling
        level = keep * level + (1 - keep) * peak
        smoothed[i] = level

    stretched = np.interp(
        np.arange(len(samples)), np.arange(len(smoothed)) * block + block / 2, smoothed
    )
    return np.maximum(stretched, 1e-6)


def even_out(samples, threshold_db=-26, ratio=6.0):
    """Pull the loud parts down towards the quiet ones, so nothing gets lost."""
    level_db = 20 * np.log10(envelope(samples))
    over = np.maximum(0.0, level_db - threshold_db)
    return samples * 10 ** (-over * (1 - 1 / ratio) / 20)


def trim(samples, headroom_db=TRIM_HEADROOM):
    """
    Cut the dead air off both ends, so the squelch lands right on the words rather
    than leaving a hole. Every room has its own hum, and how loud you recorded varies
    take to take, so the line between quiet and talking is worked out per recording:
    take the room's own level and come up from there.
    """
    loud = 20 * np.log10(envelope(samples, attack=0.001, release=0.05))
    room = np.percentile(loud, 20)
    loudest = loud.max()
    # Well clear of the room, but never so high it starts eating quiet words.
    line = min(max(room + headroom_db, loudest - 50), loudest - 15)

    speaking = np.flatnonzero(loud > line)
    if len(speaking) == 0:
        return samples
    pad = int(RATE * 0.03)
    return samples[max(0, speaking[0] - pad) : min(len(samples), speaking[-1] + pad)]


def hiss(count, rng, gain):
    """Band-limited static: the sound of an open channel."""
    if count <= 0:
        return np.zeros(0)
    return band(rng.standard_normal(count)) * gain


def fade(count, shape=1.0, rising=False):
    """A curve from 0 to 1 (or 1 to 0) to shape a burst with."""
    ramp = np.linspace(0.0, 1.0, max(count, 1)) ** shape
    return ramp if rising else ramp[::-1]


def key_on(rng, strength):
    """The handset opening: a spit of static that settles into an open channel."""
    burst = int(RATE * 0.13)
    gap = int(RATE * 0.05)
    noise = hiss(burst, rng, 0.16 * strength) * fade(burst, shape=1.6)
    thump = np.sin(2 * np.pi * 115 * np.arange(burst) / RATE) * fade(burst, shape=3.0)
    return np.concatenate([noise + thump * 0.1 * strength, np.zeros(gap)])


def key_off(rng, strength):
    """The handset letting go: a click, then static falling away to nothing."""
    gap = int(RATE * 0.04)
    click = int(RATE * 0.006)
    tail = int(RATE * 0.17)
    snap = hiss(click, rng, 0.5 * strength) * fade(click, shape=0.5)
    settle = hiss(tail, rng, 0.13 * strength) * fade(tail, shape=2.2)
    return np.concatenate([np.zeros(gap), snap, settle])


# ---------- Putting one recording through it ----------

def radio(samples, args, rng):
    voice = trim(samples, args.trim)
    if len(voice) == 0:
        return voice

    peak = np.max(np.abs(voice))
    if peak > 0:
        voice = voice / peak
    voice = even_out(voice)

    # Narrow it down, drive it, then narrow it again: the overdrive makes new high
    # harmonics and a radio this small would never let them out.
    voice = band(voice, args.low, args.high)
    voice = np.tanh(voice * args.drive) / np.tanh(args.drive)
    voice = band(voice, args.low, args.high)

    # A lift around 1.8kHz for the honk of a small speaker.
    honk = signal.butter(2, [1400, 2400], btype="band", fs=RATE, output="sos")
    voice = voice + signal.sosfilt(honk, voice) * 0.5

    if args.squelch > 0:
        voice = np.concatenate([key_on(rng, args.squelch), voice, key_off(rng, args.squelch)])

    out = voice + hiss(len(voice), rng, args.hiss)
    peak = np.max(np.abs(out))
    return out / peak * 0.89 if peak > 0 else out  # Just shy of the ceiling.


# ---------- Walking the folders ----------

def takes(voice_folder):
    """The clean recordings in a voice/ folder, in round order."""
    found = {}
    for path in sorted(voice_folder.iterdir()):
        if path.suffix.lower() not in READABLE or not path.stem.lower().startswith("rec"):
            continue
        digits = path.stem[3:]
        if digits.isdigit():
            found.setdefault(int(digits), path)
    return [found[n] for n in sorted(found)]


def warn_about_gaps(week_folder, done):
    """Point out recordings the week wants but hasn't got, and ones left over."""
    sys.stdout.flush()  # Keep these under the lines they're about.
    bomb = week_folder / "bomb.json"
    if bomb.is_file():
        try:
            rounds = json.loads(bomb.read_text())["rounds"]
        except (ValueError, KeyError):
            rounds = None
        if rounds:
            missing = [f"rec{n}" for n in range(1, rounds + 1) if f"rec{n}" not in done]
            if missing:
                print(
                    f"  ! this bomb has {rounds} rounds and there's no take for "
                    f"{', '.join(missing)} — the game will show the transcript instead",
                    file=sys.stderr,
                )

    # An mp3 with no take behind it is left from an earlier run. Say so rather than
    # deleting it: it might be one you haven't moved into voice/ yet.
    stale = sorted(
        path.name
        for path in week_folder.glob("rec*.mp3")
        if path.stem not in done
    )
    if stale:
        is_are = "has" if len(stale) == 1 else "have"
        print(
            f"  ! {', '.join(stale)} {is_are} no take in voice/, so whatever was there "
            f"before is still what plays. Delete it, or add the take.",
            file=sys.stderr,
        )


def build(week_folder, args):
    """Cut the bomb, then do the recordings. False if either went wrong."""
    cut = True
    if (week_folder / "bomb.png").is_file():
        try:
            cut_bomb(week_folder, args.sprite_height, args.frame_ms)
        except ValueError as error:
            print(f"{week_folder.name}: bomb.png: {error}", file=sys.stderr)
            cut = False
    else:
        print(f"{week_folder.name}: no bomb.png yet, so no bomb to cut", file=sys.stderr)
    return build_voice(week_folder, args) and cut


def build_voice(week_folder, args):
    voice_folder = week_folder / "voice"
    if not voice_folder.is_dir():
        print(
            f"{week_folder.name}: no voice/ folder. Make one and put your clean takes in "
            f"it as rec1, rec2, … then run this again:\n  {voice_folder}",
            file=sys.stderr,
        )
        return False

    recordings = takes(voice_folder)
    if not recordings:
        print(f"{week_folder.name}: voice/ has no rec1, rec2, … in it", file=sys.stderr)
        return False

    rng = np.random.default_rng(args.seed)
    encoded = True
    done = []
    for source in recordings:
        target = week_folder / f"{source.stem}.mp3"
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            samples = read_audio(source, scratch)
            if np.max(np.abs(samples)) < 1e-3:  # -60dB: there's nothing on this one.
                print(f"  ! {source.name} has nothing on it — skipped", file=sys.stderr)
                continue
            treated = radio(samples, args, rng)
            written, as_mp3 = write_mp3(treated, target, scratch)
        encoded = encoded and as_mp3
        done.append(source.stem)
        print(
            f"{week_folder.name}: {source.name} → {written.name}  "
            f"{len(samples) / RATE:.1f}s in, {len(treated) / RATE:.1f}s out"
        )

    warn_about_gaps(week_folder, done)
    if not encoded:
        print(
            "  ! lame isn't installed, so those are .wav files the game won't load.\n"
            "    Install it and run this again:  brew install lame",
            file=sys.stderr,
        )
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("week", nargs="?", type=int, help="week number; omit for every week")
    parser.add_argument("--drive", type=float, default=DRIVE,
                        help=f"how hard the overdrive is pushed, 1 is clean (default {DRIVE})")
    parser.add_argument("--hiss", type=float, default=HISS,
                        help=f"how loud the background static is (default {HISS})")
    parser.add_argument("--squelch", type=float, default=SQUELCH,
                        help=f"size of the key-on burst and key-off click, 0 for none (default {SQUELCH})")
    parser.add_argument("--low", type=float, default=LOW,
                        help=f"bottom of the radio's range in Hz (default {LOW})")
    parser.add_argument("--high", type=float, default=HIGH,
                        help=f"top of the radio's range in Hz (default {HIGH})")
    parser.add_argument("--trim", type=float, default=TRIM_HEADROOM,
                        help=f"dB above the room's hum that counts as talking (default {TRIM_HEADROOM})")
    parser.add_argument("--seed", type=int, default=7,
                        help="which static you get; same seed, same noise (default 7)")
    parser.add_argument("--sprite-height", type=int, default=SPRITE_HEIGHT,
                        help=f"height of one bomb sprite in pixels (default {SPRITE_HEIGHT})")
    parser.add_argument("--frame-ms", type=int, default=FRAME_MS,
                        help=f"how long each bomb frame shows (default {FRAME_MS})")
    args = parser.parse_args()

    if args.week:
        folders = [WEEKS / f"week{args.week}"]
        if not folders[0].is_dir():
            sys.exit(f"No such week: {folders[0]}")
    else:
        folders = sorted(
            (f for f in WEEKS.glob("week*") if (f / "voice").is_dir() or (f / "bomb.png").is_file()),
            key=lambda f: int(re.sub(r"\D", "", f.name) or 0),
        )
        if not folders:
            sys.exit(
                f"No week has a bomb.png or a voice/ folder yet. Start one, e.g.\n"
                f"  {WEEKS / 'week1' / 'bomb.png'}\n  {WEEKS / 'week1' / 'voice'}"
            )

    if not all([build(folder, args) for folder in folders]):  # A list, so every week runs.
        sys.exit(1)


if __name__ == "__main__":
    main()
