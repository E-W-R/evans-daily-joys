// Odd One Out — Wednesday. Three Vancouver chains, and one branch of each that
// was never there.
//
// A round is a chain and its branches, pinned on a square of map cropped to fit
// them. All but one of those pins is a real shop; the odd one out is made up.
// Tap a pin, press GUESS, and if it was a real branch the pin goes grey and you
// try again. Your score is how many guesses the three rounds take between them,
// so three is as good as it gets.
//
// A week is three rounds in odd_one_out.json, and every branch is the spot it
// sits on, written [latitude, longitude]:
//
//   "week1": { "round1": { "name": "Ramen DANBO", "decoy": [49.2371, -123.0483],
//                          "real": [[49.2659, -123.2425], ...] }, "round2": ... }
//
// The map they're pinned on lives in map/ and is drawn by map.js.

import { pixelArt, INK } from "../../js/icons.js";
import { shareText } from "../../js/ui.js";
import { WEEKDAYS, weekdayOf } from "../../js/dates.js";
import { loadBasemap, createMap } from "./map.js";

// A pin is drawn this many screen pixels per pixel of art, so it stays as chunky
// as the map under it.
const PIN_SCALE = 2;

// The smallest and largest a pin's tap target gets, as a radius in screen pixels.
// Pins that land close together on the map share out the room between them, so
// two branches a block apart can still be told apart by thumb.
const TOUCH_MIN = 12;
const TOUCH_MAX = 22;

const PIN = [
  "...#####...",
  "..#xxxxx#..",
  ".#xx###xx#.",
  "#xx#...#xx#",
  "#x#.....#x#",
  "#x#.....#x#",
  "#xx#...#xx#",
  ".#xx###xx#.",
  ".#xxxxxxx#.",
  "..#xxxxx#..",
  "..#xxxxx#..",
  "...#xxx#...",
  "....#x#....",
  ".....#.....",
];

const pin = (colour) => pixelArt(PIN, { "#": INK, x: colour });

const PINS = {
  waiting: pin("#e4572e"), // still in the running
  picked: pin("#f2a541"), // the one you're about to guess
  gone: pin("#b6a892"), // guessed, and it turned out to be a real shop
  found: pin("#7fa34a"), // the made-up one
};

export const howToPlay = `
  <h2>How to play</h2>
  <p>Three Vancouver chains, one at a time. Every branch is pinned on the map —
     except one of those pins is a shop that doesn't exist.</p>
  <ul>
    <li><b>Tap a pin</b> to pick it out.</li>
    <li><b>Guess</b> to say that's the made-up one.</li>
  </ul>
  <p>Guess a real branch and its pin goes grey; keep guessing until you find the
     odd one out. Your score is how many guesses the three rounds take you
     altogether, so <b>3</b> is a clean sweep.</p>
  <p>Three new chains every Wednesday.</p>`;

export async function mount(root, ctx) {
  const nothing = (message) => {
    root.innerHTML = `<p class="ooo-note">${message}</p>`;
  };

  let rounds;
  let basemap;
  try {
    const [weeks, loaded] = await Promise.all([
      fetch(new URL("./odd_one_out.json", import.meta.url)).then((r) => r.json()),
      loadBasemap(),
    ]);
    basemap = loaded;
    rounds = readWeek(weeks[`week${ctx.puzzleNumber}`]);
  } catch {
    return nothing("The map didn't load. Check your connection and try again.");
  }
  if (!rounds?.length) return nothing(`No chains picked for week ${ctx.puzzleNumber} yet.`);

  // What's been guessed so far, one list of pins per round. A round is over once
  // the pin at the end of its list is the made-up one.
  const known = pinsIn(rounds);
  const guesses = ctx.saved?.guesses?.length === rounds.length
    ? ctx.saved.guesses.map((list) => list.filter((pin) => known.has(pin)))
    : rounds.map(() => []);

  const solved = (index) => guesses[index].at(-1) === rounds[index].decoy;
  const tries = () => guesses.reduce((total, list) => total + list.length, 0);
  const finished = () => rounds.every((_, index) => solved(index));

  let current = rounds.findIndex((_, index) => !solved(index));
  if (current < 0) current = rounds.length - 1;
  let showingScore = finished();
  let picked = null;

  root.innerHTML = `
    <div class="ooo">
      <div class="ooo-head">
        <p class="ooo-chain"></p>
        <div class="ooo-pips"></div>
      </div>
      <div class="ooo-stage"><div class="ooo-map"></div></div>
      <p class="ooo-status"></p>
      <button class="pixel-btn ooo-go" type="button"></button>
      <p class="ooo-credit">Map data © OpenStreetMap contributors</p>
    </div>`;

  const parts = {
    chain: root.querySelector(".ooo-chain"),
    pips: root.querySelector(".ooo-pips"),
    stage: root.querySelector(".ooo-stage"),
    holder: root.querySelector(".ooo-map"),
    status: root.querySelector(".ooo-status"),
    go: root.querySelector(".ooo-go"),
  };

  const map = createMap(parts.holder, basemap);
  const pins = new Map(); // pin key -> the button on the map

  parts.go.addEventListener("click", () => {
    if (showingScore) return;
    if (solved(current)) return nextRound();
    if (picked) makeGuess(picked);
  });

  // The square is drawn to whatever room the page has left, so it fits a short
  // phone in landscape as happily as a tall one standing up.
  new ResizeObserver(() => drawMap()).observe(parts.stage);

  drawRound();

  // ---------- Playing ----------

  function makeGuess(key) {
    guesses[current].push(key);
    picked = null;
    save();
    if (solved(current)) {
      dressPins();
      parts.status.textContent = `That's the one. ${countOf(guesses[current].length)} this round.`;
      parts.go.textContent = current === rounds.length - 1 ? "See your score" : "Next chain";
      return;
    }
    dressPins();
    parts.status.textContent = "That one's real. Try another.";
    parts.status.classList.remove("is-wrong");
    void parts.status.offsetWidth; // let the shake run again on a second wrong guess
    parts.status.classList.add("is-wrong");
    setGo();
  }

  function nextRound() {
    if (current === rounds.length - 1) {
      showingScore = true;
      return drawScore();
    }
    current += 1;
    picked = null;
    drawRound();
  }

  function save() {
    ctx.save({ guesses, tries: tries(), done: finished() });
  }

  // ---------- Drawing ----------

  function drawRound() {
    if (showingScore) return drawScore();
    parts.chain.textContent = rounds[current].name;
    drawPips();
    buildPins();
    drawMap();
    if (solved(current)) {
      parts.status.textContent = `Already found, in ${countOf(guesses[current].length)}.`;
      parts.go.textContent = current === rounds.length - 1 ? "See your score" : "Next chain";
    } else {
      parts.status.textContent = "One of these was never here.";
      setGo();
    }
  }

  function drawPips() {
    parts.pips.replaceChildren();
    rounds.forEach((_, index) => {
      const pip = document.createElement("span");
      pip.className = "ooo-pip";
      if (solved(index)) pip.classList.add("is-done");
      if (index === current) pip.classList.add("is-now");
      pip.textContent = index + 1;
      parts.pips.append(pip);
    });
  }

  function setGo() {
    parts.go.textContent = "Guess";
    parts.go.disabled = !picked;
  }

  function buildPins() {
    for (const button of pins.values()) button.remove();
    pins.clear();
    for (const place of rounds[current].places) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ooo-pin";
      button.innerHTML = `<img alt="">`;
      button.addEventListener("click", () => {
        if (solved(current) || guesses[current].includes(place.key)) return;
        picked = picked === place.key ? null : place.key;
        dressPins();
        setGo();
      });
      pins.set(place.key, button);
      parts.holder.append(button);
    }
    dressPins();
  }

  /** Puts every pin in the state it's in: waiting, picked, ruled out, or found. */
  function dressPins() {
    const done = solved(current);
    for (const [key, button] of pins) {
      const ruledOut = guesses[current].includes(key);
      const isDecoy = key === rounds[current].decoy;
      const state = done && isDecoy ? "found"
        : ruledOut ? "gone"
        : key === picked ? "picked"
        : "waiting";
      button.querySelector("img").src = PINS[state];
      button.className = `ooo-pin is-${state}`;
      button.disabled = done || ruledOut;
      button.setAttribute("aria-pressed", String(state === "picked"));
      button.setAttribute("aria-label", labelFor(state));
    }
  }

  function drawMap() {
    if (showingScore) return;
    const room = parts.stage.getBoundingClientRect();
    if (room.width < 40 || room.height < 40) return;
    const places = rounds[current].places;

    // Where the pins land is worked out first, so the map can be drawn with the
    // street names kept clear of them.
    const side = map.layout(places, room);
    const spots = new Map(places.map((place) => [place.key, map.at(place.lat, place.lon)]));
    const wide = PIN[0].length * PIN_SCALE;
    const tall = PIN.length * PIN_SCALE;
    map.paint(places.map((place) => {
      const { x, y } = spots.get(place.key);
      return [x * side - wide / 2, y * side - tall, x * side + wide / 2, y * side];
    }));

    for (const place of places) {
      const button = pins.get(place.key);
      const spot = spots.get(place.key);
      button.style.left = `${spot.x * 100}%`;
      button.style.top = `${spot.y * 100}%`;
      // Pins further down the map stand in front, so where two overlap the one
      // in front is the nearer one and both their heads stay in view.
      button.style.setProperty("--depth", String(Math.round(spot.y * 100)));
      button.style.setProperty("--reach", `${reachFor(place, places, spots, side)}px`);
    }
  }

  function drawScore() {
    for (const button of pins.values()) button.remove();
    pins.clear();
    map.destroy();
    const count = tries();
    root.querySelector(".ooo").innerHTML = `
      <div class="ooo-score pixel-box">
        <p class="ooo-score__number">${count}</p>
        <p class="ooo-score__unit">${count === 1 ? "try" : "tries"}</p>
        <div class="ooo-score__rows">${scoreRows()}</div>
        ${count === rounds.length ? `<p class="ooo-score__note">Not one wasted guess.</p>` : ""}
        ${ctx.isToday ? `<p class="ooo-score__next">New chains next ${WEEKDAYS[weekdayOf(ctx.date)]}.</p>` : ""}
        <button class="pixel-btn" type="button">Share</button>
      </div>`;
    root.querySelector(".ooo-score button").addEventListener("click", () => {
      shareText([
        `${ctx.game.name} #${ctx.puzzleNumber}`,
        ...guesses.map((list) => "🟥".repeat(list.length - 1) + "🟩"),
        countOf(count),
        new URL("./", location.href).href,
      ].join("\n"));
    });
  }

  /** One row of squares per round: a red one per real shop guessed, then green. */
  function scoreRows() {
    return rounds.map((round, index) => {
      const squares = guesses[index].map((pin) => {
        const kind = pin === round.decoy ? "found" : "gone";
        return `<span class="ooo-square is-${kind}"></span>`;
      }).join("");
      return `<p class="ooo-score__row">${squares}</p>`;
    }).join("");
  }
}

// ---------- Odds and ends ----------

const countOf = (n) => `${n} ${n === 1 ? "try" : "tries"}`;

const labelFor = (state) => ({
  waiting: "A branch on the map",
  picked: "Picked",
  gone: "A real branch, ruled out",
  found: "The one that doesn't exist",
}[state]);

/** Every pin the week puts on the map, for throwing out saved guesses that moved. */
const pinsIn = (rounds) =>
  new Set(rounds.flatMap((round) => round.places.map((place) => place.key)));

/**
 * How far around a pin counts as tapping it.
 *
 * A pin gets half the distance to its closest neighbour, so pins a block apart on
 * a map of the whole city keep tap targets that don't swallow each other, and a
 * pin out on its own gets a comfortable one.
 */
function reachFor(place, places, spots, side) {
  const here = spots.get(place.key);
  let closest = Infinity;
  for (const other of places) {
    if (other.key === place.key) continue;
    const there = spots.get(other.key);
    const away = Math.hypot((here.x - there.x) * side, (here.y - there.y) * side);
    if (away < closest) closest = away;
  }
  return Math.min(TOUCH_MAX, Math.max(TOUCH_MIN, closest / 2));
}

/** What one branch is called from here on: the spot it sits on, as one string. */
const keyOf = (spot) => `${spot[0]},${spot[1]}`;

const isSpot = (spot) => Array.isArray(spot) && spot.length === 2
  && spot.every((number) => Number.isFinite(number));

/**
 * Reads one week into rounds of pins.
 *
 * The made-up branch is shuffled in among the real ones -- by the puzzle's own
 * name, so it lands in the same place for everybody -- because a decoy always
 * drawn first would be a decoy always found first. A round missing its decoy, or
 * with fewer than two branches to choose between, is dropped rather than played.
 */
function readWeek(week) {
  if (!week) return null;
  return Object.keys(week)
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
    .map((name) => {
      const round = week[name];
      const spots = [round.decoy, ...(round.real ?? [])].filter(isSpot);
      const places = shuffle(spots, `${name}:${round.name}`)
        .map((spot) => ({ key: keyOf(spot), lat: spot[0], lon: spot[1] }));
      return {
        name: round.name,
        decoy: isSpot(round.decoy) ? keyOf(round.decoy) : null,
        places,
      };
    })
    .filter((round) => round.decoy && round.places.length > 1);
}

/** Always the same shuffle for the same seed, so everyone sees the same map. */
function shuffle(list, seed) {
  let number = 0;
  for (const letter of seed) number = (number * 31 + letter.charCodeAt(0)) >>> 0;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    number = (number * 1664525 + 1013904223) >>> 0;
    const j = number % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
