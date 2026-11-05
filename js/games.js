// The seven games, one per day of the week. The list is in weekday order and
// starts on Sunday, no matter which day the calendar starts on.
//
// Each game:
//   id     folder name under games/ (lowercase letters, numbers and dashes)
//   name   shown on the game page
//   color  accent color
//   icon   image path, e.g. "assets/icons/cryptic.png", or pixelArt(...) from
//          icons.js. Draw small; the site scales pixel art up with crisp edges.
//   ready  false leaves that weekday's calendar squares empty (no icon, no link)
//
// To add a game: copy games/template/ to games/<id>/, build it there, then fill in
// that day's entry below and set ready: true.

import { weekdayOf } from "./dates.js";

export const GAMES = [
  { id: "minute-cryptevan", name: "Minute CryptEvan", color: "#e4572e",
    icon: "assets/icons/minute-cryptevan.png", ready: true },
  { id: "redacted", name: "Redacted", color: "#f2a541",
    icon: "assets/icons/redacted.png", ready: true },
  { id: "coot-the-wire", name: "Coot the Wire", color: "#7fa34a",
    icon: "assets/icons/coot-the-wire.png", ready: true },
  { id: "odd-one-out", name: "Odd One Out", color: "#3a9e8f",
    icon: "assets/icons/odd-one-out.png", ready: true },
  { id: "true-colours", name: "True Colours", color: "#4f86c6",
    icon: "assets/icons/true-colours.png", ready: true },
  { id: "date-guessr", name: "Date Guessr", color: "#8e5ba8",
    icon: "assets/icons/date-guessr.png", ready: true },
  { id: "saturday", name: "Saturday", ready: false },
];

export const gameForDate = (key) => GAMES[weekdayOf(key)];

