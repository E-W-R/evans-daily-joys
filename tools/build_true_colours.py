#!/usr/bin/env python3
"""Builds True Colours' weeks (games/true-colours/true_colours.json).

    python3 tools/build_true_colours.py              # 52 weeks
    python3 tools/build_true_colours.py --weeks 104  # two years

Every round is one of the 348 palettes from Sanzo Wada's A Dictionary of Colour
Combinations, shown with two made-up ones: the same number of colours each, picked
at random from the book's 159. The book's data comes from Matt DesLauriers's
dictionary-of-colour-combinations (MIT licence), downloaded once into tools/.cache/.

The palettes are dealt out like cards: shuffle all 348, deal them seven a week, and
when the deck runs out shuffle it again. The first half of each new deck comes from
the first half of the last one (and the second from the second), so a palette never
comes back sooner than 25 weeks after it last showed up. 52 weeks is 364 rounds, so
16 palettes get a second go in the last few weeks.

Everything is seeded, so a rebuild writes the same file. Asking for more weeks adds
them to the end and leaves the weeks before them alone.

The file keeps each colour's hex once, under "colours", and names them everywhere
else. Each week is a list of seven rounds, in play order:
  {"book": 176, "real": 1, "palettes": [[...], ["Hermosa Pink", ...], [...]]}
"book" is the palette's number in the book, "real" is which of the three it is
(counting from 0), and every palette's colours are in the order they're shown.
"""

import argparse
import json
import pathlib
import random
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "games" / "true-colours" / "true_colours.json"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache"

# A fixed version of the data, so a rebuild never picks up a change to it.
SOURCE = (
    "https://raw.githubusercontent.com/mattdesl/dictionary-of-colour-combinations/"
    "c142bd0bc8049ea48db4da5eb397981f047e8ef4/colors.json"
)

SEED = "true-colours"
ROUNDS = 7  # a week
CHOICES = 3  # the real palette and two made-up ones


def load_colours():
    CACHE.mkdir(exist_ok=True)
    path = CACHE / "dictionary-of-colour-combinations.json"
    if not path.exists():
        print(f"Downloading {SOURCE}")
        urllib.request.urlretrieve(SOURCE, path)
    colours = json.loads(path.read_text())
    # Two colours come in two shades, written "Eugenia Red | A" and "Grayish Lavender - B".
    for colour in colours:
        colour["name"] = re.sub(r"\s*[|-]\s*([AB])$", r" \1", colour["name"])
    return colours


def book_palettes(colours):
    """{palette number: [colour index, ...]} for all 348 of the book's palettes."""
    palettes = {}
    for index, colour in enumerate(colours):
        for number in colour["combinations"]:
            palettes.setdefault(number, []).append(index)
    return dict(sorted(palettes.items()))


def deal(numbers, rounds, rng):
    """The palette for each round: the whole deck, shuffled, over and over."""
    deck = list(numbers)
    rng.shuffle(deck)
    order = list(deck)
    half = len(deck) // 2
    while len(order) < rounds:
        first, second = deck[:half], deck[half:]
        rng.shuffle(first)
        rng.shuffle(second)
        deck = first + second
        order += deck
    return order[:rounds]


def make_round(number, palettes, colour_count, rng):
    """One round: the book's palette and two made up, in the order they're shown."""
    real = palettes[number]
    # A made-up palette that's secretly in the book would be a second right answer.
    taken = {frozenset(palette) for palette in palettes.values()}
    fakes = []
    while len(fakes) < CHOICES - 1:
        fake = rng.sample(range(colour_count), len(real))
        if frozenset(fake) not in taken:
            taken.add(frozenset(fake))
            fakes.append(fake)
    # The data lists a palette's colours in the book's colour order, not the order
    # the palette is printed in. Made-up palettes come out in any order, so shuffle
    # the real one too, or the tidy one would always be the answer.
    shown = [(True, rng.sample(real, len(real)))] + [(False, fake) for fake in fakes]
    rng.shuffle(shown)
    return {
        "book": number,
        "real": [is_real for is_real, _ in shown].index(True),
        "palettes": [palette for _, palette in shown],
    }


def write(colours, weeks):
    """The file, laid out by hand so a round sits on one line."""
    lines = ["{", '  "colours": {']
    lines += [
        f'    {json.dumps(colour["name"])}: {json.dumps(colour["hex"])}'
        + ("," if i < len(colours) - 1 else "")
        for i, colour in enumerate(colours)
    ]
    lines.append("  },")
    for week_index, week in enumerate(weeks, start=1):
        lines.append(f'  "week{week_index}": [')
        for round_index, round_ in enumerate(week):
            named = {**round_, "palettes": [[colours[i]["name"] for i in palette]
                                            for palette in round_["palettes"]]}
            comma = "," if round_index < len(week) - 1 else ""
            lines.append(f"    {json.dumps(named, ensure_ascii=False)}{comma}")
        lines.append("  ]" + ("," if week_index < len(weeks) else ""))
    lines.append("}")
    OUT.write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--weeks", type=int, default=52, help="how many weeks to write")
    args = parser.parse_args()

    colours = load_colours()
    palettes = book_palettes(colours)
    order = deal(list(palettes), args.weeks * ROUNDS, random.Random(f"{SEED}:deal"))

    weeks = []
    for week in range(args.weeks):
        rounds = []
        for slot in range(ROUNDS):
            number = order[week * ROUNDS + slot]
            # Each round has its own seed, so adding weeks doesn't change old ones.
            rng = random.Random(f"{SEED}:week{week + 1}:round{slot + 1}")
            rounds.append(make_round(number, palettes, len(colours), rng))
        weeks.append(rounds)

    write(colours, weeks)
    repeats = len(order) - len(set(order))
    print(f"{args.weeks} weeks, {len(order)} rounds from {len(palettes)} palettes "
          f"({repeats} repeats) -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
