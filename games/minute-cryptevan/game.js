// Minute CryptEvan: one cryptic clue a week.
//
// Clues live in minutecryptevan.json, keyed week1, week2, … (week1 is the launch week,
// see LAUNCH_DATE in js/config.js). Each clue has:
//
//   clue     the clue text
//   answer   the answer. Spaces and hyphens split words; other punctuation is ignored.
//   par      how many hints a good solve takes
//   url      optional: a YouTube video explaining the clue, embedded on the result card
//   hints    definition, indicator and fodder, each with
//              highlight  words to mark in the clue, spelled exactly as they are there
//              text       the explanation shown when the player opens that hint
//
// Opening a hint or revealing a letter fills one of the circles under the answer.
// The score is the number of hints used compared with par.

import { WEEKDAYS, weekdayOf } from "../../js/dates.js";
import { CLOSE } from "../../js/icons.js";
import { createKeyboard } from "../../js/keyboard.js";
import { escapeHtml, shareText } from "../../js/ui.js";

// Hint buttons, in order. Their colors are in game.css; the emoji are for sharing.
const HINTS = [
  { type: "definition", label: "Definition", emoji: "🟩" },
  { type: "indicator", label: "Indicator", emoji: "🟪" },
  { type: "fodder", label: "Fodder", emoji: "🟨" },
];
const LETTER = { type: "letter", label: "Letter", emoji: "🟦" };
const EMOJI = Object.fromEntries([...HINTS, LETTER].map((hint) => [hint.type, hint.emoji]));

export const howToPlay = `
  <h2>How to play</h2>
  <p>Solve a new cryptic clue each week. The numbers after the clue are the word lengths:
    (5,6) means a five-letter word, then a six-letter word.</p>

  <h3>Reading a cryptic clue</h3>
  <p>Every clue has a <mark class="hl-definition">definition</mark>: a plain meaning of the
    answer, at the very start or end of the clue. The rest is wordplay that builds the same
    answer another way:</p>
  <ul>
    <li><mark class="hl-fodder">Fodder</mark> is the raw material: words or letters to work with.</li>
    <li>An <mark class="hl-indicator">indicator</mark> says what to do with the fodder: mix it
      up, reverse it, hide it, say it out loud…</li>
  </ul>
  <p class="mc-example"><mark class="hl-fodder">Heart</mark> <mark class="hl-indicator">broken</mark>
    on <mark class="hl-definition">planet</mark> (5)</p>
  <p>Break up the letters of HEART to get EARTH, which is a planet.</p>

  <h3>Hints and par</h3>
  <p>Stuck? Open a hint to highlight part of the clue, or reveal a random letter. Each hint
    fills a circle under the answer. Solve it at or under <b>par</b> for a great score!</p>
`;

export async function mount(root, ctx) {
  const response = await fetch(new URL("./minutecryptevan.json", import.meta.url));
  if (!response.ok) throw new Error(`Couldn't load the clues (HTTP ${response.status})`);
  const puzzle = (await response.json())[`week${ctx.puzzleNumber}`];

  if (!puzzle) {
    root.innerHTML = `
      <div class="message pixel-box">
        <h2 class="message__heading">No clue yet</h2>
        <p class="message__text">This week's clue hasn't been written yet. Check back soon!</p>
      </div>`;
    return;
  }
  play(root, ctx, puzzle);
}

function play(root, ctx, puzzle) {
  const solution = puzzle.answer.toUpperCase().replace(/[^A-Z]/g, "");
  const words = puzzle.answer.trim().split(/\s+/);
  const hints = HINTS.filter((hint) => puzzle.hints?.[hint.type]);
  const highlights = Object.fromEntries(
    hints.map((hint) => [hint.type, findPhrases(puzzle.clue, puzzle.hints[hint.type].highlight)]),
  );
  const totalCircles = hints.length + solution.length;

  // Pick up where the player left off, unless the answer has changed since.
  const saved = ctx.saved?.letters?.length === solution.length ? ctx.saved : null;
  const state = {
    letters: saved?.letters ?? Array(solution.length).fill(""),
    revealed: new Set(saved?.revealed), // letter positions given away by the Letter hint
    used: saved?.used ?? [], // hints that count toward the score, in the order used
    // hint types the player has read
    opened: new Set(saved?.opened?.filter((type) => hints.some((hint) => hint.type === type))),
    done: saved?.done === true,
  };

  // The top part (clue and hint buttons) scrolls if it doesn't fit, so the answer,
  // circles and keyboard always stay on screen.
  root.innerHTML = `
    <div class="mc-top">
      <section class="mc-clue pixel-box">
        <p class="mc-clue__text"></p>
        <div class="mc-clue__hint" hidden>
          <div class="mc-clue__hint-head">
            <span class="mc-chip"></span>
            <button class="icon-btn mc-close" type="button" aria-label="Close hint">
              <img src="${CLOSE}" alt="">
            </button>
          </div>
          <p class="mc-clue__hint-text"></p>
        </div>
      </section>
      <div class="mc-hints">
        ${[...hints, LETTER].map((hint) => `
          <button class="pixel-btn mc-hint" type="button" data-hint="${hint.type}">${hint.label}</button>
        `).join("")}
      </div>
    </div>
    <div class="mc-bottom">
      <div class="mc-answer" role="group" aria-label="Answer"></div>
      <div class="mc-circles" role="img"></div>
      <div class="mc-keys"></div>
    </div>
    <p class="sr-only" aria-live="polite"></p>`;

  const clueText = root.querySelector(".mc-clue__text");
  const hintBox = root.querySelector(".mc-clue__hint");
  const answer = root.querySelector(".mc-answer");
  const circles = root.querySelector(".mc-circles");
  const hintButtons = [...root.querySelectorAll("[data-hint]")];
  const keysArea = root.querySelector(".mc-keys");
  const announcer = root.querySelector("[aria-live]");

  // One box per letter, grouped into words. The CSS sizes the boxes to fit one line.
  let position = 0;
  answer.innerHTML = words.map((word) => `<span class="mc-word">${[...word].map((char) => {
    if (char === "-") return `<span class="mc-hyphen" aria-hidden="true">-</span>`;
    if (!/[a-z]/i.test(char)) return "";
    const i = position++;
    return `<button class="mc-cell" type="button" data-i="${i}" style="--i: ${i}"></button>`;
  }).join("")}</span>`).join("");
  answer.style.setProperty("--letters", solution.length);
  answer.style.setProperty("--words", words.length);
  answer.style.setProperty("--hyphens", (puzzle.answer.match(/-/g) ?? []).length);
  circles.style.setProperty("--circles", totalCircles);
  const cells = [...answer.querySelectorAll(".mc-cell")];

  // "(5,6)", or "(4-4)" for a hyphenated answer.
  const enumeration = `(${words
    .map((word) => word.split("-").map((part) => part.replace(/[^a-z]/gi, "").length).join("-"))
    .join(",")})`;

  // ---------- Cursor ----------
  const isOpen = (i) => !state.revealed.has(i); // revealed letters can't be changed
  const isFull = () => state.letters.every(Boolean);

  function nextOpen(i) {
    for (let j = i + 1; j < solution.length; j++) if (isOpen(j)) return j;
    return null;
  }

  function prevOpen(i) {
    for (let j = i - 1; j >= 0; j--) if (isOpen(j)) return j;
    return null;
  }

  let cursor = state.letters.findIndex((letter, i) => !letter && isOpen(i));
  if (cursor === -1) cursor = nextOpen(-1) ?? 0;
  let shownHint = null; // whose explanation is on screen
  let keyboard = state.done ? null : createKeyboard(keysArea, onKey);

  // ---------- Input ----------
  function onKey(key) {
    if (state.done) return;
    answer.classList.remove("is-wrong");
    if (/^[A-Z]$/.test(key)) typeLetter(key);
    else if (key === "Backspace") eraseLetter();
    else if (key === "Enter") checkAnswer(true);
    else if (key === "ArrowLeft") cursor = prevOpen(cursor) ?? cursor;
    else if (key === "ArrowRight") cursor = nextOpen(cursor) ?? cursor;
    render();
  }

  function typeLetter(letter) {
    if (!isOpen(cursor)) cursor = nextOpen(cursor) ?? prevOpen(cursor) ?? cursor;
    state.letters[cursor] = letter;
    cursor = nextOpen(cursor) ?? cursor;
    save();
    if (isFull()) checkAnswer(true);
  }

  function eraseLetter() {
    // Clear the current box, or if it's empty, step back and clear the one before.
    if (!(isOpen(cursor) && state.letters[cursor])) cursor = prevOpen(cursor) ?? cursor;
    if (isOpen(cursor)) state.letters[cursor] = "";
    save();
  }

  answer.addEventListener("click", (event) => {
    const cell = event.target.closest(".mc-cell");
    if (!cell || state.done || !isOpen(Number(cell.dataset.i))) return;
    cursor = Number(cell.dataset.i);
    render();
  });

  // ---------- Hints ----------
  root.querySelector(".mc-hints").addEventListener("click", (event) => {
    const button = event.target.closest("[data-hint]");
    if (!button) return;
    if (button.dataset.hint === LETTER.type) {
      revealLetter();
      render();
    } else {
      openHint(button.dataset.hint);
      render();
      hintBox.scrollIntoView({ block: "nearest" });
    }
  });

  // Closing the explanation keeps the hint's highlights in the clue. Tapping the hint's
  // button again brings the explanation back for free.
  root.querySelector(".mc-close").addEventListener("click", () => {
    shownHint = null;
    render();
  });

  function openHint(type) {
    // Re-reading an opened hint is free, and so is everything after solving.
    if (!state.opened.has(type)) {
      state.opened.add(type);
      if (!state.done) state.used.push(type);
      save();
    }
    shownHint = type;
  }

  function revealLetter() {
    const hidden = Array.from(solution, (_, i) => i).filter(isOpen);
    if (state.done || hidden.length === 0) return;
    const i = hidden[Math.floor(Math.random() * hidden.length)];
    state.revealed.add(i);
    state.letters[i] = solution[i];
    state.used.push(LETTER.type);
    if (cursor === i) cursor = nextOpen(i) ?? prevOpen(i) ?? i;
    save();
    // A reveal can complete a right answer, but a wrong one only shakes when typed.
    if (isFull()) checkAnswer(false);
  }

  // ---------- Checking ----------
  function checkAnswer(byPlayer) {
    if (state.letters.join("") === solution) {
      state.done = true;
      save();
      keyboard?.destroy();
      keyboard = null;
      answer.classList.add("just-solved");
      announcer.textContent = "Solved!";
    } else if (byPlayer) {
      answer.classList.remove("is-wrong");
      void answer.offsetWidth; // Restart the shake if it's already going.
      answer.classList.add("is-wrong");
      announcer.textContent = "Not quite. Try again.";
    }
  }

  answer.addEventListener("animationend", (event) => {
    if (event.target === answer) answer.classList.remove("is-wrong");
  });

  function save() {
    ctx.save({
      letters: state.letters,
      revealed: [...state.revealed],
      used: state.used,
      opened: [...state.opened],
      done: state.done,
    });
  }

  // ---------- Drawing ----------
  function render() {
    renderClue();

    hintBox.hidden = !shownHint;
    if (shownHint) {
      const chip = hintBox.querySelector(".mc-chip");
      chip.textContent = HINTS.find((hint) => hint.type === shownHint).label;
      chip.dataset.type = shownHint;
      hintBox.querySelector(".mc-clue__hint-text").textContent = puzzle.hints[shownHint].text;
    }

    cells.forEach((cell, i) => {
      cell.textContent = state.letters[i];
      cell.classList.toggle("is-cursor", !state.done && i === cursor);
      cell.classList.toggle("is-revealed", state.revealed.has(i));
      cell.setAttribute(
        "aria-label",
        `Letter ${i + 1} of ${solution.length}: ${state.letters[i] || "blank"}` +
          (state.revealed.has(i) ? " (revealed)" : ""),
      );
    });
    answer.classList.toggle("is-solved", state.done);

    circles.innerHTML = Array.from({ length: totalCircles }, (_, i) => `
      <span class="mc-circle-slot">
        <span class="mc-circle"${state.used[i] ? ` data-type="${state.used[i]}"` : ""}></span>
        ${i + 1 === puzzle.par ? `<span class="mc-par">par</span>` : ""}
      </span>`).join("");
    const count = state.used.length;
    circles.setAttribute("aria-label", `${count} hint${count === 1 ? "" : "s"} used. Par is ${puzzle.par}.`);

    for (const button of hintButtons) {
      const type = button.dataset.hint;
      if (type === LETTER.type) {
        button.disabled = state.done || state.revealed.size === solution.length;
      } else {
        button.classList.toggle("is-open", state.opened.has(type));
      }
    }

    if (state.done && !keysArea.querySelector(".mc-result")) renderResult();
  }

  // The clue, with the words of every opened hint highlighted in that hint's color.
  function renderClue() {
    const clue = puzzle.clue;
    const opened = hints.map((hint) => hint.type).filter((type) => state.opened.has(type));
    const typesAt = (pos) =>
      opened.filter((type) => highlights[type].some(([start, end]) => pos >= start && pos < end));

    let html = "";
    let runStart = 0;
    for (let pos = 1; pos <= clue.length; pos++) {
      const types = typesAt(runStart);
      if (pos < clue.length && typesAt(pos).join() === types.join()) continue;
      const text = escapeHtml(clue.slice(runStart, pos));
      html += types.length
        ? `<mark class="${types.map((type) => `hl-${type}`).join(" ")}">${text}</mark>`
        : text;
      runStart = pos;
    }
    clueText.innerHTML = `${html} <span class="mc-enum">${enumeration}</span>`;
  }

  function renderResult() {
    const count = state.used.length;
    const overPar = count - puzzle.par;
    const score =
      overPar < 0 ? `${-overPar} under par!` : overPar === 0 ? "Right on par!" : `${overPar} over par`;
    const gaveAway = state.revealed.size === solution.length;
    const video = youTubeEmbed(puzzle.url);

    keysArea.innerHTML = `
      <div class="mc-result pixel-box">
        <h2 class="mc-result__heading">${gaveAway ? "Answer revealed" : "Solved!"}</h2>
        <p class="mc-result__score">${count} hint${count === 1 ? "" : "s"} · ${score}</p>
        ${ctx.isToday ? `<p class="mc-result__next">New clue next ${WEEKDAYS[weekdayOf(ctx.date)]}.</p>` : ""}
        ${video ? `
          <iframe class="mc-result__video" src="${escapeHtml(video)}" title="How this clue works"
            loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` : ""}
        <button class="pixel-btn" type="button">Share</button>
      </div>`;
    // The video makes the card too tall for small screens, so the card scrolls instead.
    root.querySelector(".mc-bottom").classList.add("is-done");

    keysArea.querySelector("button").addEventListener("click", () => {
      shareText([
        `${ctx.game.name} #${ctx.puzzleNumber}`,
        count ? state.used.map((type) => EMOJI[type]).join("") : "No hints!",
        gaveAway ? "Answer revealed" : score,
        new URL("./", location.href).href,
      ].join("\n"));
    });
  }

  render();
}

// The embeddable address of a YouTube link (youtu.be/ID, youtube.com/watch?v=ID or
// /shorts/ID), or null if there's no link or it isn't YouTube.
function youTubeEmbed(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  const id =
    host === "youtu.be" ? parsed.pathname.slice(1)
    : host === "youtube.com" ? parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
    : null;
  if (!id || !/^[\w-]+$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}

// Where each phrase appears in the clue, as [start, end] positions. Matches whole
// words and ignores capitals.
function findPhrases(clue, phrases = []) {
  return phrases.flatMap((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(^|[^a-z])(${escaped})(?![a-z])`, "i").exec(clue);
    if (!match) {
      console.warn(`Minute CryptEvan: "${phrase}" isn't in the clue "${clue}"`);
      return [];
    }
    const start = match.index + match[1].length;
    return [[start, start + match[2].length]];
  });
}
