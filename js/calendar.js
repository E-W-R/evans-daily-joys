// The month calendar on the home page. Every column is a weekday, so every column
// is one game. Tapping an open day (launch up to today, plus anything opened early)
// moves the highlight box to it, and the Play button opens the highlighted day.
// Later days are shown but locked (unless LOCK_FUTURE_DAYS is off in config.js).
// Days before launch are greyed out.

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

/**
 * selected: the day to highlight first, if it's open.
 * onSelect(key): called with the highlighted day whenever it changes, and once at the start.
 */
export function createCalendar(root, { selected: wanted = null, onSelect = () => {} } = {}) {
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

  // A day can be highlighted if it has a game and isn't locked.
  const isOpen = (key) => {
    const status = dateStatus(key, today);
    if (status === "before-launch") return false;
    if (LOCK_FUTURE_DAYS && status === "future") return false;
    return gameForDate(key).ready;
  };
  // Before launch the first open day is launch day, so start there instead of today.
  const startingDay = () => (today < LAUNCH_DATE && isOpen(LAUNCH_DATE) ? LAUNCH_DATE : today);

  let selected = wanted && isOpen(wanted) ? wanted : startingDay();
  let shown = monthNumber(selected);

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
    let classes = "day";
    if (key === today) classes += " day--today";
    if (key === selected) classes += " day--selected";
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
        <button type="button" data-day="${key}" aria-label="${escapeHtml(label)}"
          aria-pressed="${key === selected}" ${key === today ? 'aria-current="date"' : ""}>
          ${number}${icon}
          ${done ? `<img class="day__check" src="${CHECK}" alt="">` : ""}
        </button>
      </li>`;
  }

  function select(key) {
    if (key === selected) return;
    selected = key;
    render();
    onSelect(selected);
  }

  grid.addEventListener("click", (event) => {
    const day = event.target.closest("[data-day]");
    if (day) select(day.dataset.day);
  });
  prev.addEventListener("click", () => { shown--; render(); });
  next.addEventListener("click", () => { shown++; render(); });
  render();
  onSelect(selected);

  return {
    /** Re-check the date and saved progress, e.g. when the player comes back to the page. */
    refresh() {
      const now = todayKey();
      // If the day rolled over while the highlight was on today, follow it.
      const follow = now !== today && selected === startingDay();
      today = now;
      if (follow || !isOpen(selected)) {
        selected = startingDay();
        shown = monthNumber(selected);
        onSelect(selected);
      }
      render();
    },
  };
}
