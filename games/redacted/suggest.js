// Wikipedia title suggestions, most-viewed first, from the files in titles/. Those are
// made by tools/build_redacted_titles.py, which explains how they fit together.

import { normalize } from "./article.js";

const MIN_LETTERS = 3;
const LIMIT = 20; // must match SUGGESTIONS in tools/build_redacted_titles.py
const files = new Map(); // file name → promise of its contents, fetched once

function load(name) {
  if (!files.has(name)) {
    const url = new URL(`./titles/${name}.json`, import.meta.url);
    const promise = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => {
        files.delete(name); // Try again next time, e.g. after a dropped connection.
        return null;
      });
    files.set(name, promise);
  }
  return files.get(name);
}

/** Up to 20 titles starting with what's been typed, once there are 3 letters. */
export async function suggestTitles(typed) {
  let query = normalize(typed);
  if (query && /\s$/.test(typed)) query += " "; // "the " shouldn't match "Theatre"
  if (query.length < MIN_LETTERS) {
    if (query) find(query); // Fetch the first few files ahead of time.
    return [];
  }
  return find(query);
}

async function find(query) {
  let prefix = "";
  let node = await load("root");
  while (node) {
    if (node.t) return node.t.filter((title) => normalize(title).startsWith(query)).slice(0, LIMIT);
    if (query.length === prefix.length) return node.top ?? [];
    const letter = query[prefix.length];
    const part = node.parts.findLast(([first]) => first <= letter);
    if (!part) return [];
    const file = part[1];
    // A part named after the next letter is a whole prefix of its own; others are bundles.
    if (file === `p-${prefix}${letter}`.replaceAll(" ", "_")) prefix += letter;
    node = await load(file);
  }
  return [];
}
