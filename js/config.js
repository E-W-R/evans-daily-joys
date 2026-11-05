// Site-wide settings.

/**
 * The first day that has puzzles (YYYY-MM-DD). The week containing this date is
 * puzzle #1 for every game, the week after is #2, and so on.
 */
export const LAUNCH_DATE = "2026-11-08";

/** Day the week (and the calendar) starts on. 0 = Sunday, 1 = Monday. */
export const WEEK_START = 0;

/**
 * Days before LAUNCH_DATE are always locked.
 * true: days after today are locked too, and the calendar stops at the current month.
 * false: future days can be opened and future months browsed, for building and testing.
 */
export const LOCK_FUTURE_DAYS = true;

/**
 * Days up to and including this date are open even if they're still in the future,
 * so the launch week can be played before it starts. Once today passes this date it
 * has no effect.
 */
export const OPEN_EARLY_THROUGH = "2026-11-14";
