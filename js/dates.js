// Dates are passed around as "date keys": calendar dates written "YYYY-MM-DD".
// Keys sort correctly as plain strings. All arithmetic goes through Date.UTC so
// daylight-saving changes and time zones can't shift a day.
//
// Never use new Date("YYYY-MM-DD") directly: it parses as UTC midnight, which is
// the previous evening anywhere west of London.

import { LAUNCH_DATE, OPEN_EARLY_THROUGH, WEEK_START } from "./config.js";

const DAY_MS = 86_400_000;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const pad = (n) => String(n).padStart(2, "0");

/** month is 1–12. */
export const toKey = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/** Returns { year, month, day } for a valid key, otherwise null. */
export function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export const isValidKey = (key) => parseKey(key) !== null;

/** month is 1–12. */
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function toDayNumber(key) {
  const { year, month, day } = parseKey(key);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function fromDayNumber(dayNumber) {
  const d = new Date(dayNumber * DAY_MS);
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (key) => new Date(toDayNumber(key) * DAY_MS).getUTCDay();
export const addDays = (key, days) => fromDayNumber(toDayNumber(key) + days);
export const daysBetween = (from, to) => toDayNumber(to) - toDayNumber(from);
export const startOfWeek = (key) => addDays(key, -((weekdayOf(key) - WEEK_START + 7) % 7));

/** Today's date in the player's own time zone, so each player's puzzles flip at their midnight. */
export function todayKey() {
  const now = new Date();
  return devToday() ?? toKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 1 during the launch week, 2 the week after, and so on. */
export const puzzleNumber = (key) =>
  Math.floor(daysBetween(startOfWeek(LAUNCH_DATE), key) / 7) + 1;

/** "before-launch" | "past" | "today" | "early" | "future". Only "future" is locked. */
export function dateStatus(key, today = todayKey()) {
  if (key < LAUNCH_DATE) return "before-launch";
  if (key < today) return "past";
  if (key === today) return "today";
  if (key <= OPEN_EARLY_THROUGH) return "early"; // Open ahead of time, see config.js.
  return "future";
}

/** "Thu, Sep 17" */
export function formatShort(key) {
  const { month, day } = parseKey(key);
  return `${WEEKDAYS[weekdayOf(key)].slice(0, 3)}, ${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

/** "Thursday, September 17, 2026" */
export function formatLong(key) {
  const { year, month, day } = parseKey(key);
  return `${WEEKDAYS[weekdayOf(key)]}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

// Testing helper: open any page with ?today=YYYY-MM-DD to pretend it's that day.
// It sticks for the rest of the browser tab; ?today= with no date turns it off.
const DEV_TODAY_KEY = "edj:dev-today";

export function devToday() {
  try {
    const param = new URLSearchParams(location.search).get("today");
    if (param !== null) {
      if (isValidKey(param)) sessionStorage.setItem(DEV_TODAY_KEY, param);
      else sessionStorage.removeItem(DEV_TODAY_KEY);
    }
    const saved = sessionStorage.getItem(DEV_TODAY_KEY);
    return isValidKey(saved) ? saved : null;
  } catch {
    return null;
  }
}
