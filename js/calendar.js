// The month calendar on the home page. Every column is a weekday, so every column
// is one game. Days from launch up to today link to their puzzle; later days are
// shown but locked (unless LOCK_FUTURE_DAYS is off in config.js). Days before launch
// are greyed out.

import { LAUNCH_DATE, LOCK_FUTURE_DAYS, WEEK_START } from "./config.js";
import {
  MONTHS, WEEKDAYS, toKey, parseKey, daysInMonth, weekdayOf, dateStatus, formatLong, todayKey,
} from "./dates.js";
import { gameForDate } from "./games.js";
import { ARROW_LEFT, ARROW_RIGHT, CHECK } from "./icons.js";
import { isDone } from "./storage.js";
import { escapeHtml } from "./ui.js";

// Months are numbered year * 12 + (month - 1) so stepping between them is plain math.
function monthNumber(key) {
  const { year, month } = parseKey(key);
  return year * 12 + month - 1;
}

export function createCalendar(root) {
  const title = root.querySelector("[data-calendar-title]");
  const grid = root.querySelector("[data-calendar-grid]");
  const prev = root.querySelector("[data-calendar-prev]");
  const next = root.querySelector("[data-calendar-next]");

  prev.querySelector("img").src = ARROW_LEFT;
  next.querySelector("img").src = ARROW_RIGHT;
  root.querySelector("[data-calendar-weekdays]").innerHTML = WEEKDAYS
    .map((_, i) => `<span>${WEEKDAYS[(WEEK_START + i) % 7][0]}</span>`)
    .join("");

  let today = todayKey();
  let shown = monthNumber(today);

  function render() {
    // Browse from the launch month up to the current month (or on into the future while
    // LOCK_FUTURE_DAYS is off).
    const first = Math.min(monthNumber(LAUNCH_DATE), monthNumber(today));
    const last = LOCK_FUTURE_DAYS
      ? Math.max(monthNumber(LAUNCH_DATE), monthNumber(today))
      : Infinity;
    shown = Math.min(Math.max(shown, first), last);
    prev.disabled = shown <= first;
    next.disabled = shown >= last;

    const year = Math.floor(shown / 12);
    const month = (shown % 12) + 1;
    title.textContent = `${MONTHS[month - 1]} ${year}`;

    const blanks = (weekdayOf(toKey(year, month, 1)) - WEEK_START + 7) % 7;
    const cells = Array.from({ length: blanks }, () => `<li class="day day--blank"></li>`);
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      cells.push(dayCell(toKey(year, month, day)));
    }
    grid.innerHTML = cells.join("");
  }

  function dayCell(key) {
    const status = dateStatus(key, today);
    // Today is highlighted even before launch, when it has no puzzle.
    const classes = key === today ? "day day--today" : "day";
    const number = `<span class="day__num">${parseKey(key).day}</span>`;
    if (status === "before-launch") return `<li class="${classes} day--locked">${number}</li>`;

    const game = gameForDate(key);
    // A weekday without a game is just an empty square.
    if (!game.ready) return `<li class="${classes}">${number}</li>`;

    const icon = `<img class="day__icon" src="${escapeHtml(game.icon)}" alt="">`;
    if (LOCK_FUTURE_DAYS && status === "future") {
      return `<li class="${classes} day--future">${number}${icon}</li>`;
    }

    const done = isDone(game.id, key);
    const label = `${formatLong(key)}: ${game.name}${done ? ", finished" : ""}`;
    return `
      <li class="${classes} day--open${done ? " day--done" : ""}">
        <a href="play.html?date=${key}" aria-label="${escapeHtml(label)}"
          ${key === today ? 'aria-current="date"' : ""}>
          ${number}${icon}
          ${done ? `<img class="day__check" src="${CHECK}" alt="">` : ""}
        </a>
      </li>`;
  }

  prev.addEventListener("click", () => { shown--; render(); });
  next.addEventListener("click", () => { shown++; render(); });
  render();

  return {
    /** Re-check the date and saved progress, e.g. when the player comes back to the page. */
    refresh() {
      const now = todayKey();
      // If the day rolled over while the current month was showing, follow it.
      if (now !== today && shown === monthNumber(today)) shown = monthNumber(now);
      today = now;
      render();
    },
  };
}
