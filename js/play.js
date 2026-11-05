// The game page, play.html?date=YYYY-MM-DD (no date means today).
// Works out which game that date belongs to, fills in the top bar, then loads
// games/<id>/game.js and calls its mount(). See games/template/game.js.

import { LAUNCH_DATE, LOCK_FUTURE_DAYS } from "./config.js";
import {
  todayKey, isValidKey, dateStatus, puzzleNumber, formatShort, formatLong,
} from "./dates.js";
import { GAMES, gameForDate } from "./games.js";
import { ARROW_LEFT, HELP, INK } from "./icons.js";
import { loadRecord, saveRecord, loadSetting, saveSetting } from "./storage.js";
import { escapeHtml, showDevBadge } from "./ui.js";

const params = new URLSearchParams(location.search);
const today = todayKey();
const date = isValidKey(params.get("date")) ? params.get("date") : today;
const previewing = gameFromUrl();
const game = previewing ?? gameForDate(date);
const root = document.querySelector("[data-game-root]");

// Testing helper: ?game=<folder> loads games/<folder>/ on any date, even a locked one,
// and even if the game isn't marked ready or in the weekly lineup yet.
// Try play.html?game=template  (add &date=YYYY-MM-DD to pick the puzzle).
function gameFromUrl() {
  const id = params.get("game");
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
  const listed = GAMES.find((g) => g.id === id) ?? { name: id, color: INK };
  return { ...listed, id, ready: true };
}

async function start() {
  const status = dateStatus(date, today);
  document.title = `${game.name} · Evan's Daily Joys`;
  document.querySelector("[data-game-name]").textContent = game.name;
  document.querySelector("[data-game-meta]").textContent =
    status === "before-launch" ? formatShort(date) : `${formatShort(date)} · #${puzzleNumber(date)}`;

  if (!previewing) {
    if (LOCK_FUTURE_DAYS && status === "future") {
      return showMessage("Not yet!", `This puzzle unlocks on ${formatLong(date)}.`);
    }
    if (status === "before-launch") {
      return today < LAUNCH_DATE
        ? showMessage("Not yet!", `Daily Joys starts on ${formatLong(LAUNCH_DATE)}.`)
        : showMessage("No puzzle", `Daily Joys started on ${formatLong(LAUNCH_DATE)}.`);
    }
    if (!game.ready) {
      return showMessage("No game today", "Come back tomorrow!");
    }
  }

  try {
    await loadStyles(`games/${game.id}/game.css`);
    const module = await import(`../games/${game.id}/game.js`);
    root.classList.add(`game-${game.id}`);
    await module.mount(root, {
      game,
      date,
      puzzleNumber: puzzleNumber(date),
      isToday: date === today,
      saved: loadRecord(game.id, date),
      save: (record) => saveRecord(game.id, date, record),
    });
    if (module.howToPlay) setUpHelp(module.howToPlay);
  } catch (error) {
    console.error(error);
    showMessage("Oops!", "This game didn't load. Try again in a moment.");
  }
}

function showMessage(heading, text) {
  root.innerHTML = `
    <div class="message pixel-box">
      ${game.icon ? `<img class="message__icon" src="${escapeHtml(game.icon)}" alt="">` : ""}
      <h2 class="message__heading">${escapeHtml(heading)}</h2>
      <p class="message__text">${escapeHtml(text)}</p>
      <a class="pixel-btn" href="./" data-back>Back</a>
    </div>`;
}

function loadStyles(href) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = link.onerror = resolve; // A game without its own styles is fine.
    document.head.append(link);
  });
}

// A game can export howToPlay (an HTML string). It opens from the "?" button in the
// top bar, and by itself the first time a player opens that game.
function setUpHelp(html) {
  const dialog = document.createElement("dialog");
  dialog.className = `dialog pixel-box game-${game.id}`;
  dialog.setAttribute("aria-label", "How to play");
  dialog.tabIndex = -1;
  dialog.innerHTML = `
    <div class="dialog__body">${html}</div>
    <form class="dialog__actions" method="dialog">
      <button class="pixel-btn" type="submit">Got it!</button>
    </form>`;
  // Tapping the dimmed area around the dialog closes it too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);

  // Focus the dialog itself, not the first thing inside it (which would draw a focus
  // ring on the scrolling text or the button).
  const open = () => {
    dialog.showModal();
    dialog.focus();
  };

  const button = document.querySelector("[data-help]");
  button.querySelector("img").src = HELP;
  button.hidden = false;
  button.addEventListener("click", open);

  const seenKey = `seen-help:${game.id}`;
  if (!loadSetting(seenKey)) {
    saveSetting(seenKey, true);
    open();
  }
}

// Back buttons go to the calendar. If the player came from the calendar, step back
// in history instead so it reopens on the month they were looking at.
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-back]");
  if (!link || !document.referrer) return;
  const home = new URL("./", location.href);
  const from = new URL(document.referrer);
  const cameFromHome =
    from.origin === home.origin && from.pathname.replace(/index\.html$/, "") === home.pathname;
  if (cameFromHome && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});

document.querySelector("[data-back] img").src = ARROW_LEFT;
showDevBadge();
start();
