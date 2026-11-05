// Date Guessr — Friday. Two of our photos, and for each one: what day was this,
// and where were we?
//
// A guess is a day off the calendar and a spot off the map. Submit, and each half
// is scored out of 100: a point off for every day out, a point off for every ten
// metres out. Two photos, so 400 is a perfect Friday.
//
// The photos are personal and this site is public, so everything in locked/ is
// encrypted and she types a keyphrase once to open it. locked.js handles the key,
// tools/build_date_guessr.py makes the files, and the day and the spot come from
// each photo's own metadata.

import { shareText } from "../../js/ui.js";
import {
  WEEKDAYS, weekdayOf, daysBetween, isValidKey, todayKey, formatShort, formatLong,
} from "../../js/dates.js";
import { canUnlock, lockInfo, openJson, openPhoto, rememberedKey, unlock } from "./locked.js";
import { pickDay } from "./daypicker.js";
import { distance, howFar, pickSpot, showGuess } from "./map.js";

const DAY_POINTS = 100; // one off for every day out
const SPOT_POINTS = 100; // one off for every METRES_PER_POINT out
const METRES_PER_POINT = 10;
const MOST = DAY_POINTS + SPOT_POINTS; // the most one photo can be worth

// What the lock screen says under the box. Enough of a nudge for her, nothing for
// anyone else -- so it says how the phrase is shaped, never what it is.
const HINT = "Four words, spaces between them.";

const EMOJI = (points) =>
  points >= 90 ? "🟩" : points >= 70 ? "🟨" : points >= 40 ? "🟧" : "🟥";

export const howToPlay = `
  <h2>How to play</h2>
  <p>Two photos of us every Friday. For each one, guess <b>the day it was taken</b>
     and <b>the spot it was taken at</b>.</p>
  <ul>
    <li><b>Day</b> opens a calendar. <b>Place</b> opens a map: tap where you think we
      were, and pinch to get closer.</li>
    <li><b>Submit</b> when you've set both.</li>
  </ul>
  <h3>Scoring</h3>
  <ul>
    <li>The day is worth <b>100</b>, less a point for every day you're out.</li>
    <li>The spot is worth <b>100</b>, less a point for every <b>10 metres</b> you're
      out. So within 10 m is full marks, and a kilometre off is none.</li>
  </ul>
  <p>Two photos at 200 each, so a Friday is out of <b>400</b>.</p>
  <p>The photos are locked, and the phrase you type opens them. This phone remembers
     it after the first time.</p>`;

export async function mount(root, ctx) {
  const note = (text) => { root.innerHTML = `<p class="dg-note">${text}</p>`; };

  if (!canUnlock()) {
    return note("These photos only open on a secure connection. Try the https address.");
  }

  let lock;
  try {
    lock = await lockInfo();
  } catch {
    return note("The photos didn't load. Check your connection and try again.");
  }

  const key = await rememberedKey(lock) ?? await askForPhrase(root, lock);

  let photos;
  try {
    photos = (await openJson(key, "rounds.bin"))[`week${ctx.puzzleNumber}`];
  } catch {
    return note("The photos didn't load. Check your connection and try again.");
  }
  if (!photos?.length) return note(`No photos for week ${ctx.puzzleNumber} yet.`);

  play(root, ctx, key, photos.filter(isUsable));
}

/** A photo we can score a guess against. */
const isUsable = (photo) =>
  isValidKey(photo?.date) && Number.isFinite(photo.lat) && Number.isFinite(photo.lon);

// ---------- The lock screen ----------

function askForPhrase(root, lock) {
  return new Promise((resolve) => {
    root.innerHTML = `
      <form class="dg-lock pixel-box">
        <h2 class="dg-lock__title">Locked</h2>
        <p class="dg-lock__text">These photos are ours, so they only sit on here locked
          up. Type the phrase and they'll open on this phone.</p>
        <input class="dg-lock__input" type="text" name="phrase" autocomplete="off"
          autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"
          aria-label="The phrase">
        <p class="dg-lock__hint" aria-live="polite">${HINT}</p>
        <button class="pixel-btn" type="submit">Unlock</button>
      </form>`;

    const form = root.querySelector(".dg-lock");
    const input = form.querySelector(".dg-lock__input");
    const hint = form.querySelector(".dg-lock__hint");
    const button = form.querySelector("button");
    input.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      button.disabled = input.disabled = true;
      button.textContent = "Opening…";
      hint.textContent = HINT;

      // Stretching the phrase into a key takes a moment on purpose.
      let key = null;
      let trouble = false;
      try {
        key = await unlock(lock, input.value);
      } catch {
        trouble = true; // storage blocked, or the browser gave up on the key
      }
      if (key) return resolve(key);

      button.disabled = input.disabled = false;
      button.textContent = "Unlock";
      hint.textContent = trouble
        ? "Something went wrong opening them. Try again?"
        : "That's not it. Try again?";
      form.classList.remove("is-wrong");
      void form.offsetWidth; // restart the shake
      form.classList.add("is-wrong");
      input.select();
    });
  });
}

// ---------- Playing ----------

function play(root, ctx, key, photos) {
  const guesses = readGuesses(ctx.saved?.guesses, photos.length);
  const guessed = (index) => guesses[index] !== null;
  const nextPhoto = () => guesses.indexOf(null);
  const finished = () => nextPhoto() < 0;
  const total = () => photos.reduce(
    (sum, photo, index) => sum + (guessed(index) ? points(guesses[index], photo).all : 0), 0,
  );
  const outOf = photos.length * MOST;

  // Both photos start downloading now, so the second one is ready when she gets to it.
  const pictures = photos.map(
    (_, index) => openPhoto(key, `w${ctx.puzzleNumber}-${index + 1}.bin`).catch(() => null),
  );

  let current = Math.max(0, nextPhoto());
  let picked = { day: null, spot: null }; // this photo's guess, before it's submitted
  let reviewing = false; // looking back at a photo from the score card
  let shownMap = null; // the result map on screen, to let go of when the card changes

  root.innerHTML = `
    <div class="dg">
      <section class="dg-play">
        <p class="dg-which"></p>
        <div class="dg-shot">
          <div class="dg-frame pixel-box"><img alt=""></div>
        </div>
        <div class="dg-picks">
          <button type="button" class="dg-pick pixel-box" data-pick="day">
            <span class="dg-pick__label">Day</span>
            <span class="dg-pick__value"></span>
          </button>
          <button type="button" class="dg-pick pixel-box" data-pick="spot">
            <span class="dg-pick__label">Place</span>
            <span class="dg-pick__value"></span>
          </button>
        </div>
        <button type="button" class="pixel-btn dg-submit">Submit</button>
      </section>
      <section class="dg-after" hidden></section>
    </div>`;

  const parts = {
    play: root.querySelector(".dg-play"),
    which: root.querySelector(".dg-which"),
    photo: root.querySelector(".dg-frame img"),
    frame: root.querySelector(".dg-frame"),
    picks: root.querySelector(".dg-picks"),
    submit: root.querySelector(".dg-submit"),
    after: root.querySelector(".dg-after"),
  };

  parts.picks.addEventListener("click", async (event) => {
    const which = event.target.closest("[data-pick]")?.dataset.pick;
    if (!which) return;
    if (which === "day") {
      picked.day = await pickDay({ selected: picked.day, today: todayKey() }) ?? picked.day;
    } else {
      picked.spot = await pickSpot({ selected: picked.spot }) ?? picked.spot;
    }
    dressPicks();
  });

  parts.submit.addEventListener("click", () => {
    if (!picked.day || !picked.spot) return;
    guesses[current] = { date: picked.day, lat: picked.spot.lat, lon: picked.spot.lon };
    ctx.save({ guesses, score: total(), done: finished() });
    showResult();
  });

  if (finished()) showScore();
  else showPhoto();

  // ---------- Guessing ----------

  async function showPhoto() {
    reviewing = false;
    clearAfter();
    picked = { day: null, spot: null };
    parts.play.hidden = false;
    parts.after.hidden = true;
    parts.which.textContent = `Photo ${current + 1} of ${photos.length}`;
    dressPicks();
    await showPicture(parts.photo, pictures[current], `Photo ${current + 1}`);
  }

  function dressPicks() {
    const day = parts.picks.querySelector('[data-pick="day"] .dg-pick__value');
    const spot = parts.picks.querySelector('[data-pick="spot"] .dg-pick__value');
    day.textContent = picked.day ? formatShort(picked.day) : "Pick a day";
    spot.textContent = picked.spot ? "Pin dropped" : "Pick a spot";
    for (const [element, chosen] of [[day, picked.day], [spot, picked.spot]]) {
      element.closest(".dg-pick").classList.toggle("is-set", Boolean(chosen));
    }
    parts.submit.disabled = !picked.day || !picked.spot;
  }

  // ---------- One photo's result ----------

  async function showResult() {
    clearAfter();
    const photo = photos[current];
    const guess = guesses[current];
    const score = points(guess, photo);
    const last = reviewing || finished();

    parts.play.hidden = true;
    parts.after.hidden = false;
    parts.after.innerHTML = `
      <div class="dg-result pixel-box">
        <div class="dg-result__top">
          <div class="dg-result__thumb pixel-box"><img alt="Photo ${current + 1}"></div>
          <p class="dg-result__points">${score.all}<span>/${MOST}</span></p>
        </div>
        <ul class="dg-result__rows">
          <li>
            <span class="dg-row__label">Day</span>
            <span class="dg-row__main">${formatLong(photo.date)}</span>
            <span class="dg-row__points">${score.day}</span>
            <span class="dg-row__sub">${
              score.days === 0
                ? "You had it to the day."
                : `You said ${formatShort(guess.date)} — ${Math.abs(score.days)} day${
                  Math.abs(score.days) === 1 ? "" : "s"} ${score.days > 0 ? "late" : "early"}`
            }</span>
          </li>
          <li>
            <span class="dg-row__label">Place</span>
            <span class="dg-row__main">${howFar(score.metres)} away</span>
            <span class="dg-row__points">${score.spot}</span>
            <span class="dg-row__sub">${
              score.metres < METRES_PER_POINT ? "Right on the spot." : "Green pin is where we were."
            }</span>
          </li>
        </ul>
        <div class="dg-map dg-map--result"></div>
        <button type="button" class="pixel-btn dg-next">${
          last ? "See your score" : "Next photo"
        }</button>
      </div>`;

    showPicture(parts.after.querySelector(".dg-result__thumb img"), pictures[current]);
    parts.after.querySelector(".dg-next").addEventListener("click", () => {
      if (last) return showScore();
      current = nextPhoto();
      showPhoto();
    });

    try {
      shownMap = await showGuess(parts.after.querySelector(".dg-map"), guess, photo);
    } catch {
      parts.after.querySelector(".dg-map").classList.add("is-missing");
    }
  }

  // ---------- The score card ----------

  function showScore() {
    reviewing = false;
    clearAfter();
    parts.play.hidden = true;
    parts.after.hidden = false;
    parts.after.innerHTML = `
      <div class="dg-score pixel-box">
        <p class="dg-score__number">${total()}<span>/${outOf}</span></p>
        <p class="dg-score__unit">points</p>
        <ol class="dg-score__rows">${photos.map((photo, index) => {
          const score = points(guesses[index], photo);
          return `
            <li>
              <button type="button" class="dg-look" data-photo="${index}">
                <span class="dg-look__thumb pixel-box"><img alt=""></span>
                <span class="dg-look__detail">
                  <b>${score.all}</b>
                  <span>${Math.abs(score.days)} day${
                    Math.abs(score.days) === 1 ? "" : "s"} and ${howFar(score.metres)} out</span>
                </span>
              </button>
            </li>`;
        }).join("")}</ol>
        <p class="dg-score__hint">Tap a photo to see it again.</p>
        ${total() === outOf ? `<p class="dg-score__note">Every day and every spot. How?</p>` : ""}
        ${ctx.isToday
          ? `<p class="dg-score__next">New photos next ${WEEKDAYS[weekdayOf(ctx.date)]}.</p>`
          : ""}
        <button type="button" class="pixel-btn dg-share">Share</button>
      </div>`;

    parts.after.querySelectorAll(".dg-look").forEach((button, index) => {
      showPicture(button.querySelector("img"), pictures[index]);
      button.addEventListener("click", () => {
        current = Number(button.dataset.photo);
        reviewing = true;
        showResult();
      });
    });

    parts.after.querySelector(".dg-share").addEventListener("click", () => {
      shareText([
        `${ctx.game.name} #${ctx.puzzleNumber}`,
        ...photos.map((photo, index) => {
          const score = points(guesses[index], photo);
          return `${EMOJI(score.day)}${EMOJI(score.spot)}`;
        }),
        `${total()}/${outOf}`,
        new URL("./", location.href).href,
      ].join("\n"));
    });
  }

  /** Empties the card below the photo, and shuts down any map that was in it. */
  function clearAfter() {
    shownMap?.remove();
    shownMap = null;
    parts.after.replaceChildren();
  }

  /** Waits for a locked photo to come down and open, then shows it. */
  async function showPicture(image, picture, label = "") {
    image.closest(".pixel-box")?.classList.add("is-waiting");
    const url = await picture;
    if (!url) return;
    image.alt = label;
    image.src = url;
    image.closest(".pixel-box")?.classList.remove("is-waiting");
  }
}

// ---------- Scoring ----------

/** How a guess did: days out, metres out, and the points for each half. */
function points(guess, photo) {
  const days = daysBetween(photo.date, guess.date); // + if the guess was late
  const metres = distance(guess, photo);
  const day = Math.max(0, DAY_POINTS - Math.abs(days));
  const spot = Math.max(0, SPOT_POINTS - Math.floor(metres / METRES_PER_POINT));
  return { days, metres, day, spot, all: day + spot };
}

/** The saved guesses, if they still fit this week; otherwise a fresh start. */
function readGuesses(saved, count) {
  const fits = Array.isArray(saved) && saved.length === count
    && saved.every((guess) => guess === null
      || (isValidKey(guess?.date) && Number.isFinite(guess.lat) && Number.isFinite(guess.lon)));
  return fits ? [...saved] : Array.from({ length: count }, () => null);
}
