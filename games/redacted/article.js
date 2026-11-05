// Reads a week's article file and works out which words to blank out.
//
// File format (articles/weekN.txt): one block per article, with a blank line between
// blocks.
//
//   Pelican
//   Pelicans (genus Pelecanus) are a genus of large water birds ...
//   A second paragraph, if you like, on its own line.
//
// The first line is the title. More answers to accept can follow it after "|", for
// example "United States | USA | America".
//
// In the text:
//   - The title, or its plural or possessive, becomes [Article Title].
//   - Words that look a lot like the title (Pelecanus for Pelican) become [Omitted].
//   - So do words built from part of a compound title, when the article also uses that
//     part on its own: "wiki" and MediaWiki for Wikipedia, blackboards for Whiteboard.
//   - Anything in {braces} becomes [Omitted] too, for words the automatic check misses.
//   - Wikipedia's footnote markers, like [2] or [citation needed], are removed.

const LETTER = "\\p{L}\\p{N}";
const WORD = new RegExp(`[${LETTER}]+(?:['’.\\-][${LETTER}]+)*`, "gu");
const FOOTNOTE = /\[(?:\d+|[a-z]|note \d+|nb \d+|citation needed)\]/gi;
const BRACES = /()\{([^}]*)\}/g;

export function parseWeek(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length >= 2)
    .map(([titleLine, ...paragraphs]) => parseArticle(titleLine, paragraphs));
}

// An article is a list of paragraphs, and each paragraph a list of pieces:
//   { kind: "text",  text }     spaces and punctuation, always shown
//   { kind: "word",  text, n }  a word
//   { kind: "title", text, n }  shown as [Article Title]
//   { kind: "omit",  text, n }  shown as [Omitted]
// n numbers the words and placeholders together, from 0, across the whole article.
function parseArticle(titleLine, paragraphs) {
  const answers = titleLine.split("|").map((answer) => answer.trim()).filter(Boolean);
  const title = answers[0];
  const name = withoutQualifier(title); // "Gemini (astrology)" → "Gemini"
  const lookalikeTargets = normalize(name).split(" ").filter((word) => word.length >= 5);

  const split = paragraphs.map((paragraph) => {
    let pieces = [{ kind: "text", text: paragraph.replace(FOOTNOTE, "") }];
    pieces = splitOut(pieces, BRACES, "omit");
    pieces = splitOut(pieces, titlePattern(name), "title");
    return pieces.flatMap((piece) => (piece.kind === "text" ? splitWords(piece.text) : [piece]));
  });
  // Every word the article uses, apart from the title, split at hyphens: pen-board →
  // pen, board.
  const vocabulary = new Set(split.flat()
    .filter((piece) => piece.kind === "word")
    .flatMap((piece) => normalize(piece.text).split(" ")));
  const parts = compoundParts(name, vocabulary);

  const hide = (word) => normalize(word).split(" ").some((w) =>
    lookalikeTargets.some((target) => looksLike(w, target)) ||
    parts.some((part) => isBuiltFrom(w, part)));

  let count = 0;
  const parsed = split.map((pieces) => pieces.map((piece) => {
    if (piece.kind === "text") return piece;
    if (piece.kind === "word" && hide(piece.text)) return { kind: "omit", text: piece.text, n: count++ };
    return { ...piece, n: count++ };
  }));
  return { title, answers, paragraphs: parsed };
}

// Short words a compound title can contain that are too common to hide: "here" in
// Nowhere, "over" in Hangover.
const COMMON = new Set(["also", "been", "come", "down", "even", "ever", "from", "have", "here",
  "into", "like", "made", "make", "many", "more", "most", "much", "only", "over", "same", "some",
  "such", "than", "that", "them", "then", "there", "they", "this", "time", "under", "upon", "very",
  "were", "what", "when", "where", "which", "while", "with", "your"]);

// The halves of a compound title that the article also uses as words of their own:
// "bird" and "watching" for Birdwatching, "wiki" for Wikipedia ("the wiki software"),
// "hounds" and "tooth" for Houndstooth. Splitting only where the article backs it up
// keeps Vancouver from turning into "van" and "couver".
function compoundParts(name, vocabulary) {
  const parts = new Set();
  for (const word of normalize(name).split(" ")) {
    for (let i = 3; i <= word.length - 3; i++) {
      for (const half of [word.slice(0, i), word.slice(i)]) {
        if (half.length >= 4 && !COMMON.has(half) && (vocabulary.has(half) || vocabulary.has(`${half}s`))) {
          parts.add(half);
        }
      }
    }
  }
  return [...parts];
}

const ENDINGS = ["", "s", "es", "ed", "er", "ers", "ing", "y", "ly", "ness"];

// Is the word the part, or a compound that starts or ends with it? "board" builds
// boards, blackboards and boardroom; "wiki" builds MediaWiki. The rest must be a
// common ending or a word-sized piece, so "star" doesn't hide "start".
function isBuiltFrom(word, part) {
  if (word.startsWith(part)) {
    const rest = word.slice(part.length);
    return ENDINGS.includes(rest) || rest.length >= 3;
  }
  const end = ["", "s", "es"].find((ending) => word.endsWith(part + ending));
  return end !== undefined && word.length - part.length - end.length >= 3;
}

// Matches the title as whole words, in any case, with an optional plural or possessive:
// Pelican, pelicans, Pelican's, anniversaries. Group 2 is the mention itself.
function titlePattern(name) {
  const words = name.split(/\s+/).map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]"));
  const last = words.length - 1;
  words[last] = words[last].replace(/y$/i, "(?:y|ies)");
  return new RegExp(
    `(^|[^${LETTER}])(${words.join("\\s+")}(?:['’]s|s['’]|es|s|['’])?)(?=$|[^${LETTER}])`,
    "giu",
  );
}

// Pulls regex matches out of the text pieces as pieces of their own kind. In the
// regex, group 1 is a leading character to leave alone (a word boundary) and group 2
// is the new piece's text. The rest of the match is replaced by the piece.
function splitOut(pieces, regex, kind) {
  return pieces.flatMap((piece) => {
    if (piece.kind !== "text") return [piece];
    const out = [];
    let last = 0;
    for (const match of piece.text.matchAll(regex)) {
      const start = match.index + match[1].length;
      out.push({ kind: "text", text: piece.text.slice(last, start) });
      out.push({ kind, text: match[2] });
      last = match.index + match[0].length;
    }
    out.push({ kind: "text", text: piece.text.slice(last) });
    return out.filter((p) => p.kind !== "text" || p.text);
  });
}

function splitWords(text) {
  const out = [];
  let last = 0;
  for (const match of text.matchAll(WORD)) {
    if (match.index > last) out.push({ kind: "text", text: text.slice(last, match.index) });
    out.push({ kind: "word", text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

// A word looks like the title if its start is within a letter or so of it:
// Pelecanus/Pelecanidae for Pelican, beautiful for Beauty.
function looksLike(word, target) {
  if (word.length < target.length - 1) return false;
  const allowed = target.length >= 10 ? 2 : 1;
  return levenshtein(word.slice(0, target.length), target) <= allowed;
}

/** Is this guess the article? Ignores capitals, punctuation, plurals and one typo. */
export function isCorrectGuess(guess, article) {
  const g = normalize(withoutQualifier(guess));
  if (!g) return false;
  return article.answers.some((answer) => {
    const a = normalize(withoutQualifier(answer));
    return (
      plurals(a).includes(g) ||
      plurals(g).includes(a) ||
      (a.length >= 6 && levenshtein(g, a) <= 1)
    );
  });
}

const plurals = (word) => [word, `${word}s`, `${word}es`, word.replace(/y$/, "ies")];

// "Gemini (astrology)" → "Gemini"
const withoutQualifier = (title) => title.replace(/\s*\([^)]*\)\s*$/, "");

/**
 * Lowercase letters and digits only, single spaces between words: "Widow's Bay" →
 * "widows bay", "Pokémon" → "pokemon". tools/build_redacted_titles.py has a copy of this
 * that has to match it exactly.
 */
export function normalize(text) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How many single-letter edits turn a into b. */
export function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
