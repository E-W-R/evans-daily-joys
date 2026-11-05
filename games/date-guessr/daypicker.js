// The day half of a guess: a month calendar in a pop-up.
//
//   const day = await pickDay({ selected, today });  // "2026-03-14", or null if closed
//
// It's its own calendar rather than js/calendar.js's, which is the home page's and
// links each day to a puzzle. This one only picks a day, and only between the first
// month there are photos from and today.

import { WEEK_START } from "../../js/config.js";
import {
  MONTHS, WEEKDAYS, toKey, parseKey, daysInMonth, weekdayOf, formatLong,
} from "../../js/dates.js";
import { ARROW_LEFT, ARROW_RIGHT } from "../../js/icons.js";

/** The earliest month a photo could be from, so the calendar opens here. */
export const FIRST_MONTH = "2025-11-01";

const monthNumber = (key) => {
  const { year, month } = parseKey(key);
  return year * 12 + month - 1;
};

export function pickDay({ selected, today }) {
  return new Promise((resolve) => {
    const first = monthNumber(FIRST_MONTH);
    const last = Math.max(first, monthNumber(today));
    let shown = Math.min(Math.max(monthNumber(selected ?? FIRST_MONTH), first), last);
    let picked = selected ?? null;

    const dialog = document.createElement("dialog");
    dialog.className = "dialog pixel-box game-date-guessr dg-sheet";
    dialog.setAttribute("aria-label", "Pick the day");
    dialog.tabIndex = -1;
    dialog.innerHTML = `
      <div class="dialog__body dg-cal">
        <div class="dg-cal__top">
          <button class="icon-btn" type="button" data-prev>
            <img src="${ARROW_LEFT}" alt="Earlier month">
          </button>
          <h2 class="dg-cal__title" aria-live="polite"></h2>
          <button class="icon-btn" type="button" data-next>
            <img src="${ARROW_RIGHT}" alt="Later month">
          </button>
        </div>
        <div class="dg-cal__weekdays" aria-hidden="true">${
          WEEKDAYS.map((_, i) => `<span>${WEEKDAYS[(WEEK_START + i) % 7][0]}</span>`).join("")
        }</div>
        <ol class="dg-cal__grid"></ol>
      </div>
      <form class="dialog__actions dialog__actions--pair" method="dialog">
        <button class="pixel-btn pixel-btn--plain" value="cancel">Cancel</button>
        <button class="pixel-btn" value="use">Set day</button>
      </form>`;

    const parts = {
      title: dialog.querySelector(".dg-cal__title"),
      grid: dialog.querySelector(".dg-cal__grid"),
      prev: dialog.querySelector("[data-prev]"),
      next: dialog.querySelector("[data-next]"),
      use: dialog.querySelector('[value="use"]'),
    };

    function render() {
      parts.prev.disabled = shown <= first;
      parts.next.disabled = shown >= last;
      parts.use.disabled = picked === null;

      const year = Math.floor(shown / 12);
      const month = (shown % 12) + 1;
      parts.title.textContent = `${MONTHS[month - 1]} ${year}`;

      const blanks = (weekdayOf(toKey(year, month, 1)) - WEEK_START + 7) % 7;
      const cells = Array.from({ length: blanks }, () => `<li class="dg-day dg-day--blank"></li>`);
      for (let day = 1; day <= daysInMonth(year, month); day++) {
        const key = toKey(year, month, day);
        const chosen = key === picked;
        cells.push(`
          <li class="dg-day">
            <button type="button" class="dg-day__btn${chosen ? " is-picked" : ""}"
                    data-day="${key}" aria-pressed="${chosen}"
                    aria-label="${formatLong(key)}">${day}</button>
          </li>`);
      }
      parts.grid.innerHTML = cells.join("");
    }

    const finish = (day) => {
      dialog.close();
      dialog.remove();
      resolve(day);
    };

    parts.prev.addEventListener("click", () => { shown--; render(); });
    parts.next.addEventListener("click", () => { shown++; render(); });
    parts.grid.addEventListener("click", (event) => {
      const day = event.target.closest("[data-day]")?.dataset.day;
      if (!day) return;
      picked = day;
      render();
    });
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      finish(event.submitter?.value === "use" ? picked : null);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault(); // Escape
      finish(null);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(null);
    });

    render();
    document.body.append(dialog);
    dialog.showModal();
    dialog.focus();
  });
}
