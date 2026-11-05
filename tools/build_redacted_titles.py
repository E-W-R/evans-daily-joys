#!/usr/bin/env python3
"""Builds Redacted's title suggestions (games/redacted/titles/).

    python3 tools/build_redacted_titles.py           # last month's data
    python3 tools/build_redacted_titles.py 2026-08   # a particular month

Downloads Wikipedia's clickstream for the month (about 500 MB, kept in tools/.cache/
so reruns don't download it again), adds up how many times each English article was
viewed, keeps the most-viewed ones, and writes them into small files so the game only
downloads a few KB per lookup.

The files form a tree over the titles' normalized letters (see normalize()):
  root.json       {"parts": [["a", "p-a"], ["b", "p-b"], ...]}
  p-pe.json       {"top": [...], "parts": [["a", "p-pe-1"], ["l", "p-pel"], ...]}
                  Titles starting with "pe", split by their next letter. "top" is the
                  SUGGESTIONS most-viewed (only kept for prefixes of 3+ letters). Each part covers
                  the letters from its own up to the next part's.
  p-pe-1.json     {"t": ["Peru", "Pearl Jam", ...]}
                  A bundle of up to FILE_LIMIT titles, most-viewed first.
A prefix with more than FILE_LIMIT titles gets its own "p-<prefix>" file and is split
again. Spaces in file names are written as "_".
"""

import argparse
import collections
import datetime
import gzip
import json
import pathlib
import re
import shutil
import unicodedata
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "games" / "redacted" / "titles"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache"

KEEP = 1_000_000  # how many of the most-viewed articles to include
FILE_LIMIT = 1_000  # most titles in one file before it's split by the next letter
SUGGESTIONS = 20  # must match LIMIT in games/redacted/suggest.js
MIN_PREFIX = 3
SKIP = {"Main Page", "Hyphen-minus"}  # not real guesses, just very busy pages


def normalize(text):
    """Must match normalize() in games/redacted/article.js exactly."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.category(c).startswith("M"))
    text = text.lower()
    text = re.sub(r"['’.]", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def download(month):
    CACHE.mkdir(exist_ok=True)
    name = f"clickstream-enwiki-{month}.tsv.gz"
    path = CACHE / name
    if not path.exists():
        url = f"https://dumps.wikimedia.org/other/clickstream/{month}/{name}"
        print(f"Downloading {url} ...")
        partial = path.with_suffix(".part")
        urllib.request.urlretrieve(url, partial)
        partial.rename(path)
    return path


def count_views(path):
    views = collections.Counter()
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as lines:
        for line in lines:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 4 and parts[3].isdigit():
                views[parts[1]] += int(parts[3])
    return views


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")


def write_node(prefix, entries, name):
    """Writes the file for every title starting with prefix, and any files below it.
    entries: (rank, key, title) for those titles, most-viewed first."""
    node = {}
    if len(prefix) >= MIN_PREFIX:
        node["top"] = [title for _, _, title in entries[:SUGGESTIONS]]

    by_letter = collections.defaultdict(list)
    for entry in entries:
        if len(entry[1]) > len(prefix):
            by_letter[entry[1][len(prefix)]].append(entry)

    parts = []
    bundle = []  # small groups of letters, collected into one file of up to FILE_LIMIT

    def write_bundle():
        if bundle:
            file = f"p-{prefix}-{len(parts) + 1}".replace(" ", "_")
            titles = [title for _, _, title in sorted(e for _, group in bundle for e in group)]
            write_json(OUT / f"{file}.json", {"t": titles})
            parts.append([bundle[0][0], file])
            bundle.clear()

    for letter in sorted(by_letter):
        group = by_letter[letter]
        if len(group) > FILE_LIMIT:
            write_bundle()
            file = f"p-{prefix}{letter}".replace(" ", "_")
            write_node(prefix + letter, group, file)
            parts.append([letter, file])
        else:
            if sum(len(g) for _, g in bundle) + len(group) > FILE_LIMIT:
                write_bundle()
            bundle.append((letter, group))
    write_bundle()

    node["parts"] = parts
    write_json(OUT / f"{name}.json", node)


def main():
    last_month = (datetime.date.today().replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("month", nargs="?", default=last_month, help="YYYY-MM (default: last month)")
    parser.add_argument("--clickstream", type=pathlib.Path, help="use this downloaded file instead")
    args = parser.parse_args()

    path = args.clickstream or download(args.month)
    print(f"Counting views in {path.name} ...")
    views = count_views(path)
    print(f"{len(views):,} articles viewed")

    entries = []
    for raw, count in views.most_common():
        title = raw.replace("_", " ")
        key = normalize(title)
        if title in SKIP or len(key) < MIN_PREFIX:
            continue
        entries.append((key, title))
        if len(entries) == KEEP:
            print(f"Keeping the top {KEEP:,} (the last one had {count:,} views)")
            break

    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    write_node("", [(rank, key, title) for rank, (key, title) in enumerate(entries)], "root")
    files = list(OUT.iterdir())
    size = sum(f.stat().st_size for f in files)
    print(f"Wrote {len(files):,} files ({size / 1e6:.1f} MB) to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
