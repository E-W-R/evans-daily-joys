// True Colours — Thursday. Seven palettes from Sanzo Wada's A Dictionary of Colour
// Combinations, each one hidden among two that were made up from the book's colours.
//
// A round is three palettes stacked one above the other. Tap the one you think is
// in the book and press GUESS: the real one gets a tick and its colours are named,
// whether you found it or not. One guess a round, so the score is out of seven.
//
// The weeks are written by tools/build_true_colours.py into true_colours.json (the
// top of that script describes the file). Don't edit it by hand.

import { pixelArt, INK, PAPER } from "../../js/icons.js";
import { shareText } from "../../js/ui.js";
import { WEEKDAYS, weekdayOf } from "../../js/dates.js";

const TICK = pixelArt(
  ["......##", ".....##.", "##..##..", ".####...", "..##...."],
  { "#": PAPER },
);

const CROSS = pixelArt(
  ["##...##", "###.###", ".#####.", "..###..", ".#####.", "###.###", "##...##"],
  { "#": PAPER },
);

export const howToPlay = `
  <h2>How to play</h2>
  <p>Every round, one of the three palettes comes from Sanzo Wada's
     <i>A Dictionary of Colour Combinations</i>. The other two are colours from the
     same book, thrown together at random.</p>
  <ul>
    <li><b>Tap the palette</b> you think is the real one.</li>
    <li><b>Guess</b> to lock it in.</li>
  </ul>
  <p>You get one guess a round. Right or wrong, the real palette gets a tick and its
     colours are named.</p>
  <p>Seven new palettes every Thursday.</p>
  <p class="tc-credit">Colour data from Matt DesLauriers's
     dictionary-of-colour-combinations (MIT licence).</p>`;

export async function mount(root, ctx) {
  const nothing = (message) => {
    root.innerHTML = `<p class="tc-note">${message}</p>`;
  };

  let rounds;
  try {
    const response = await fetch(new URL("./true_colours.json", import.meta.url));
    rounds = readWeek(await response.json(), ctx.puzzleNumber);
  } catch {
    return nothing("The palettes didn't load. Check your connection and try again.");
  }
  if (!rounds?.length) return nothing(`No palettes for week ${ctx.puzzleNumber} yet.`);

  // Which palette the player guessed in each round, or null for rounds still to come.
  const picks = readPicks(ctx.saved?.picks, rounds);
  const guessed = (index) => picks[index] !== null;
  const gotRight = (index) => picks[index] === rounds[index].real;
  const score = () => rounds.filter((_, index) => gotRight(index)).length;
  const nextRound = () => picks.indexOf(null);

  let current = Math.max(0, nextRound());
  let picked = null; // tapped this round, not guessed yet
  let reviewing = false; // looking back at a round from the score card

  root.innerHTML = `
    <div class="tc">
      <div class="tc-play">
        <ol class="tc-pips" aria-label="Rounds"></ol>
        <div class="tc-stage"></div>
        <p class="tc-status" aria-live="polite"></p>
        <button class="pixel-btn tc-go" type="button"></button>
      </div>
      <div class="tc-score pixel-box" hidden></div>
    </div>`;

  const parts = {
    play: root.querySelector(".tc-play"),
    pips: root.querySelector(".tc-pips"),
    stage: root.querySelector(".tc-stage"),
    status: root.querySelector(".tc-status"),
    go: root.querySelector(".tc-go"),
    score: root.querySelector(".tc-score"),
  };

  parts.go.addEventListener("click", () => {
    if (!guessed(current)) {
      if (picked !== null) guess();
    } else if (reviewing || nextRound() < 0) {
      drawScore();
    } else {
      current = nextRound();
      drawRound();
    }
  });

  if (nextRound() < 0) drawScore();
  else drawRound();

  // ---------- Playing ----------

  function guess() {
    picks[current] = picked;
    picked = null;
    ctx.save({ picks, score: score(), done: nextRound() < 0 });
    drawPips();
    dress();
    if (!gotRight(current)) {
      parts.status.classList.remove("is-wrong");
      void parts.status.offsetWidth; // restart the shake
      parts.status.classList.add("is-wrong");
    }
  }

  // ---------- Drawing ----------

  function drawRound() {
    parts.play.hidden = false;
    parts.score.hidden = true;
    parts.status.classList.remove("is-wrong");
    drawPips();
    parts.stage.replaceChildren(...rounds[current].palettes.map((palette, index) => {
      // The slot deals the palette in; the button inside does the hopping, so the
      // two animations never undo each other.
      const slot = document.createElement("div");
      slot.className = "tc-slot";
      slot.style.setProperty("--order", String(index));
      const button = document.createElement("button");
      button.type = "button";
      button.style.setProperty("--count", String(palette.length));
      button.innerHTML = `<span class="tc-swatches">${palette.map((colour) => `
        <span class="tc-swatch is-on-${textOn(colour.hex)}" style="background:${colour.hex}"></span>`)
        .join("")}</span><span class="tc-badge" hidden><img alt=""></span>`;
      button.addEventListener("click", () => {
        if (guessed(current) || picked === index) return;
        picked = index;
        dress();
      });
      slot.append(button);
      return slot;
    }));
    dress();
  }

  function drawPips() {
    parts.pips.replaceChildren(...rounds.map((_, index) => {
      const pip = document.createElement("li");
      pip.className = "tc-pip";
      if (guessed(index)) pip.classList.add(gotRight(index) ? "is-right" : "is-wrong");
      if (index === current) pip.classList.add("is-now");
      pip.textContent = index + 1;
      pip.setAttribute("aria-label", `Round ${index + 1}${
        guessed(index) ? (gotRight(index) ? ", right" : ", wrong") : ""}`);
      return pip;
    }));
  }

  /** Puts each palette in the state it's in: waiting, picked, or shown for what it is. */
  function dress() {
    const round = rounds[current];
    const done = guessed(current);
    const pick = done ? picks[current] : picked;
    parts.stage.querySelectorAll(".tc-slot > button").forEach((button, index) => {
      const isReal = index === round.real;
      const state = !done ? (index === pick ? "picked" : "waiting")
        : isReal ? "real"
        : index === pick ? "wrong"
        : "fake";
      button.className = `tc-palette is-${state}`;
      button.disabled = done;
      button.setAttribute("aria-pressed", String(index === pick));
      button.setAttribute("aria-label", labelFor(state, index, round.palettes[index]));

      const badge = button.querySelector(".tc-badge");
      badge.hidden = state !== "real" && state !== "wrong";
      badge.querySelector("img").src = state === "real" ? TICK : CROSS;
      if (isReal && done) nameSwatches(button, round.palettes[index]);
    });

    if (!done) {
      parts.status.textContent = "One of these is from the book.";
      parts.go.textContent = "Guess";
      parts.go.disabled = picked === null;
    } else {
      parts.status.textContent = gotRight(current)
        ? "Right! That one's from the book."
        : "Fooled! The ticked one's from the book.";
      parts.go.textContent = reviewing || nextRound() < 0 ? "See your score" : "Next palette";
      parts.go.disabled = false;
    }
  }

  function nameSwatches(button, palette) {
    if (button.querySelector(".tc-name")) return;
    button.querySelectorAll(".tc-swatch").forEach((swatch, index) => {
      const name = document.createElement("span");
      name.className = "tc-name";
      name.textContent = palette[index].name;
      swatch.append(name);
    });
  }

  function drawScore() {
    reviewing = false;
    parts.play.hidden = true;
    parts.score.hidden = false;
    const count = score();
    parts.score.innerHTML = `
      <p class="tc-score__number">${count}<span>/${rounds.length}</span></p>
      <p class="tc-score__unit">real palettes spotted</p>
      <ol class="tc-score__rows">${rounds.map((round, index) => `
        <li>
          <button class="tc-review" type="button" data-round="${index}"
                  aria-label="Round ${index + 1}, ${gotRight(index) ? "right" : "wrong"}. Look again">
            <span class="tc-mark is-${gotRight(index) ? "right" : "wrong"}"></span>
            <span class="tc-mini">${round.palettes[round.real].map((colour) =>
              `<span style="background:${colour.hex}"></span>`).join("")}</span>
          </button>
        </li>`).join("")}
      </ol>
      <p class="tc-score__hint">Tap a palette to see its colours again.</p>
      ${count === rounds.length ? `<p class="tc-score__note">Not fooled once.</p>` : ""}
      ${count <= 2 ? `<p class="tc-score__note">“I have an above average understanding of colours”</p>` : ""}
      ${ctx.isToday ? `<p class="tc-score__next">New palettes next ${WEEKDAYS[weekdayOf(ctx.date)]}.</p>` : ""}
      <button class="pixel-btn tc-share" type="button">Share</button>`;

    parts.score.querySelectorAll(".tc-review").forEach((button) => {
      button.addEventListener("click", () => {
        current = Number(button.dataset.round);
        reviewing = true;
        drawRound();
      });
    });
    parts.score.querySelector(".tc-share").addEventListener("click", () => {
      shareText([
        `${ctx.game.name} #${ctx.puzzleNumber}`,
        rounds.map((_, index) => (gotRight(index) ? "🟩" : "🟥")).join(""),
        `${count}/${rounds.length}`,
        new URL("./", location.href).href,
      ].join("\n"));
    });
  }
}

// ---------- Odds and ends ----------

function labelFor(state, index, palette) {
  const names = palette.map((colour) => colour.name).join(", ");
  const which = `Palette ${index + 1}`;
  return {
    waiting: `${which}, ${palette.length} colours`,
    picked: `${which}, ${palette.length} colours, picked`,
    real: `${which}, from the book: ${names}`,
    wrong: `${which}, your guess, made up: ${names}`,
    fake: `${which}, made up: ${names}`,
  }[state];
}

/** The saved guesses, if they still fit this week; otherwise a fresh start. */
function readPicks(saved, rounds) {
  const fits = Array.isArray(saved) && saved.length === rounds.length
    && saved.every((pick, index) =>
      pick === null || (Number.isInteger(pick) && pick >= 0 && pick < rounds[index].palettes.length));
  return fits ? [...saved] : rounds.map(() => null);
}

/**
 * One week's rounds, each colour turned from its name into {name, hex}. A round
 * that doesn't make sense (a colour missing from the list, no real palette) is
 * dropped rather than played.
 */
function readWeek(data, number) {
  const week = data?.[`week${number}`];
  const hexes = data?.colours ?? {};
  if (!Array.isArray(week)) return null;
  const isHex = (hex) => /^#[0-9a-f]{6}$/i.test(hex);
  return week
    .filter((round) => Array.isArray(round?.palettes)
      && round.palettes[round.real]
      && round.palettes.every((palette) => Array.isArray(palette) && palette.length
        && palette.every((name) => isHex(hexes[name]))))
    .map((round) => ({
      real: round.real,
      palettes: round.palettes.map((palette) =>
        palette.map((name) => ({ name, hex: hexes[name] }))),
    }));
}

/** "dark" or "light": which of the site's ink and paper reads better on a colour. */
function textOn(hex) {
  const ink = luminance(INK);
  const paper = luminance(PAPER);
  const here = luminance(hex);
  return (here + 0.05) / (ink + 0.05) >= (paper + 0.05) / (here + 0.05) ? "light" : "dark";
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
