// Player progress is kept in the browser's localStorage, one entry per game per day:
//
//   "edj:v1:<gameId>:<YYYY-MM-DD>"  →  whatever JSON the game wants to keep
//
// A record with done: true shows that day as finished on the calendar.
// Small site settings (like "has seen this game's how-to-play") live under
// "edj:v1:setting:<name>".
//
// Storage can be unavailable (private browsing, blocked site data), so reads fall
// back to null and failed writes are ignored. The game still works, it just won't
// remember.

const PREFIX = "edj:v1";

function read(key) {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // Storage is full or blocked.
  }
}

export const loadRecord = (gameId, date) => read(`${gameId}:${date}`);
export const saveRecord = (gameId, date, record) => write(`${gameId}:${date}`, record);
export const isDone = (gameId, date) => loadRecord(gameId, date)?.done === true;

export const loadSetting = (name) => read(`setting:${name}`);
export const saveSetting = (name, value) => write(`setting:${name}`, value);

/** Forgets everything this site has saved on this device: progress, settings, test date. */
export function clearAll() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      Object.keys(storage)
        .filter((key) => key.startsWith("edj:"))
        .forEach((key) => storage.removeItem(key));
    } catch {
      // Storage is blocked, so there's nothing saved anyway.
    }
  }
}
