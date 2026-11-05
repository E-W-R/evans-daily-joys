// Coot the Wire — Tuesday. You're a pigeon. There's a bomb.
//
// A week is a run of rounds. Each round shows one picture of the bomb and has one
// hitbox: the thing on it you're meant to peck. Drag anywhere to walk the bird
// around, then PECK — if the beak's hitbox touches the round's hitbox by even a
// pixel, that wire is cut and the bomb changes to the picture with it cut. A miss
// costs a heart, and there are three for the whole week however many rounds it has.
//
// Each week is a folder, assets/week<N>/. You draw one sprite sheet, bomb.png, and
// `python3 tools/build_coot_the_wire.py <N>` cuts it into what the game loads:
//
//   bomb.json          {"rounds": 4} — how many rounds the sheet makes
//   bomb-1.gif …       one per round, plus one more for the defused bomb at the end
//   hitbox-1.png …     one per round, bomb-sized, target painted in, rest see-through
//   rec1.mp3 …         one per round: the recording the LISTEN button plays
//   transcript.txt     optional, what those recordings say, one line per round
//
// The pigeon never changes: assets/Pidge.png is what you see and
// assets/Pidge-Hitbox.png is its beak, painted the same way. While a rec<N>.mp3 is
// missing, LISTEN shows that round's transcript line on screen instead, so a week
// can be played before it's been recorded.
//
// The buzz, ping, bang and fanfare are assets/buzz.mp3, cut.mp3, boom.mp3 and
// defused.mp3, played by sfx.js.

import { pixelArt, INK } from "../../js/icons.js";
import { escapeHtml, shareText } from "../../js/ui.js";
import { loadMask, overlaps, screenBox } from "./hitbox.js";
import { createSfx } from "./sfx.js";

const HEARTS = 3; // Missed pecks allowed per week, however many rounds it has.

// How big the pigeon is next to the bomb. Both pictures are drawn at a whole number of
// screen pixels per picture pixel, so the pixel art always lands on exact squares.
const PIGEON_VS_BOMB = 0.5;

// A strip along the bottom of the arena is kept clear for the caption, so a line of
// transcript can never cover the very hitbox it's talking about. It gets the roomier
// figure where there's height to spare and gives ground down to the smaller one where
// that's what buys the bomb another size. layout() passes the number it settled on to
// game.css as --caption-room.
const CAPTION_ROOM_MIN = 72;
const CAPTION_ROOM_MAX = 104;

const FLASH_MS = 360; // One on-and-off of the white hitbox flash; matches game.css.
const GLOW_MS = 720; // How long the green or red halo lasts; matches game.css.

const HEART_ART = [
  ".##...##.",
  "#xx#.#xx#",
  "#xxxxxxx#",
  "#xxxxxxx#",
  ".#xxxxx#.",
  "..#xxx#..",
  "...#x#...",
  "....#....",
];
const FULL_HEART = pixelArt(HEART_ART, { "#": INK, x: "#d9534f" });
const SPENT_HEART = pixelArt(HEART_ART, { "#": INK, x: "#ecdcbc" });

export const howToPlay = `
  <h2>How to play</h2>
  <p>You're a pigeon. There's a bomb. Somebody left you instructions.</p>
  <ul>
    <li><b>Listen</b> plays the recording. Play it as often as you like.</li>
    <li><b>Drag anywhere</b> on the screen to walk the pigeon around.</li>
    <li><b>Peck</b> once your beak is on the wire they told you to cut.</li>
  </ul>
  <p>Cut one and the bomb lights up green and the next wire is yours. Miss and it
     flashes red and costs a heart. Lose all three and you can start the wire again
     or be shown where it is.</p>
  <p>Cut every wire to defuse it. New bomb every Tuesday.</p>`;

export async function mount(root, ctx) {
  const week = new URL(`./assets/week${ctx.puzzleNumber}/`, import.meta.url);
  const pigeonArt = new URL("./assets/Pidge.png", import.meta.url).href;
  const noBomb = () => {
    root.innerHTML = `<p class="ctw-note">No bomb built for week ${ctx.puzzleNumber} yet.</p>`;
  };

  // bomb.json says how many rounds the week's sheet came out as, so the game works
  // for a bomb with two wires or with ten.
  let rounds;
  try {
    const response = await fetch(new URL("bomb.json", week));
    rounds = (await response.json()).rounds;
    if (!Number.isInteger(rounds) || rounds < 1) throw new Error("no rounds");
  } catch {
    return noBomb();
  }

  // pigeonMask is the pigeon-sized picture with only the beak painted in, and each
  // target is the bomb-sized picture with only that round's hitbox painted in. Both
  // double as the measurements for the artwork they belong to.
  let pigeonMask;
  let targets;
  try {
    [pigeonMask, ...targets] = await Promise.all([
      loadMask(new URL("../Pidge-Hitbox.png", week).href),
      ...Array.from({ length: rounds }, (_, i) => loadMask(new URL(`hitbox-${i + 1}.png`, week).href)),
    ]);
  } catch {
    return noBomb();
  }
  const allTargets = { box: unionBox(targets.map((target) => target.box)) }; // Where the beak must reach.
  const transcript = await loadTranscript(week);
  const bombArt = (number) => new URL(`bomb-${number}.gif`, week).href;

  // ---------- What the player has done so far ----------
  const state = {
    wire: 0, // Which round they're on, 0 to rounds - 1.
    hearts: HEARTS,
    misses: 0, // Missed pecks all week, for the score.
    shown: Array(rounds).fill(false), // Rounds they asked to be shown.
    done: false,
    ...(ctx.saved ?? {}),
  };
  // Saved progress comes out of the player's own browser, and the sheet may have been
  // redrawn with a different number of rounds since, so don't trust its shape.
  state.wire = clamp(Math.trunc(state.wire) || 0, 0, rounds - 1);
  state.hearts = clamp(Math.trunc(state.hearts) || 0, 0, HEARTS);
  // Closing the tab on the out-of-hearts box counts as another go, not a dead end.
  if (state.hearts === 0) state.hearts = HEARTS;
  state.misses = Math.max(0, Math.trunc(state.misses) || 0);
  state.shown = Array.from({ length: rounds }, (_, i) => state.shown?.[i] === true);

  const save = () => ctx.save({ ...state });

  // ---------- The screen ----------
  root.innerHTML = `
    <div class="ctw">
      <div class="ctw-hud">
        <div class="ctw-hearts" data-hearts role="img"></div>
      </div>
      <div class="ctw-arena" data-arena>
        <p class="sr-only">Drag anywhere to move the pigeon, then press Peck.</p>
        <div class="ctw-bomb" data-bomb>
          <img class="ctw-bomb__glow" data-glow alt="">
          <img class="ctw-bomb__art" data-art alt="A bomb with coloured wires and a timer">
          <img class="ctw-bomb__flash" data-flash alt="">
        </div>
        <img class="ctw-pigeon" data-pigeon src="${escapeHtml(pigeonArt)}" alt="A pigeon">
        <p class="ctw-caption" data-caption hidden></p>
      </div>
      <div class="ctw-buttons" data-buttons>
        <button class="pixel-btn pixel-btn--plain" type="button" data-listen>Listen</button>
        <button class="pixel-btn" type="button" data-peck>Peck</button>
      </div>
    </div>`;

  const arena = root.querySelector("[data-arena]");
  const bombBox = root.querySelector("[data-bomb]");
  const art = root.querySelector("[data-art]");
  const glow = root.querySelector("[data-glow]");
  const flash = root.querySelector("[data-flash]");
  const pigeon = root.querySelector("[data-pigeon]");
  const caption = root.querySelector("[data-caption]");
  const buttons = root.querySelector("[data-buttons]");
  const sfx = createSfx(new URL("./assets/", import.meta.url));

  // ---------- Laying the two pictures out ----------
  // The bomb is pinned to the middle of the arena and never moves, so a hitbox is
  // always in the same place. The pigeon is the only thing that travels.
  let bombScale = 1;
  let pigeonScale = 1;
  let bombX = 0;
  let bombY = 0;
  let bombWidth = 0;
  let bombHeight = 0;
  let pigeonX = null; // null until the first layout picks a starting spot.
  let pigeonY = null;

  function layout() {
    const { width, height } = arena.getBoundingClientRect();
    if (!width || !height) return;

    // Every hitbox PNG is the size of the bomb picture, and Pidge-Hitbox.png the size
    // of the pigeon, so the masks double as the measurements for the artwork.
    const bomb = targets[0];
    // Draw the bomb the first whole size that covers the column the buttons sit in, so
    // it spans the page and then some. The arena is wider than that column — it reaches
    // the edges of the screen — which is the room that overhang needs.
    const column = root.getBoundingClientRect().width;
    const tallest = Math.max(height * 0.5, height - CAPTION_ROOM_MIN);
    bombScale = Math.max(
      1,
      Math.min(
        Math.ceil(column / bomb.width), // Past the buttons rather than short of them.
        Math.floor(width / bomb.width), // But never off the side of the screen,
        Math.floor(tallest / bomb.height), // nor over the caption's smallest strip.
      ),
    );
    pigeonScale = Math.max(2, Math.round(bombScale * PIGEON_VS_BOMB));

    bombWidth = bomb.width * bombScale;
    bombHeight = bomb.height * bombScale;
    // Whatever height the bomb didn't want goes to the caption, up to its full size.
    const captionRoom = clamp(height - bombHeight, CAPTION_ROOM_MIN, CAPTION_ROOM_MAX);
    arena.style.setProperty("--caption-room", `${Math.round(captionRoom)}px`);

    bombX = Math.round((width - bombWidth) / 2);
    bombY = Math.round((height - captionRoom - bombHeight) / 2);
    bombBox.style.width = `${bombWidth}px`;
    bombBox.style.height = `${bombHeight}px`;
    bombBox.style.left = `${bombX}px`;
    bombBox.style.top = `${bombY}px`;

    pigeon.style.width = `${pigeonMask.width * pigeonScale}px`;
    pigeon.style.height = `${pigeonMask.height * pigeonScale}px`;

    if (state.done) return perch();
    if (pigeonX === null) {
      // Start the bird below the bomb and off to the left, out of the way.
      pigeonX = Math.round(width * 0.1);
      pigeonY = Math.round(bombY + bombHeight + bombScale * 2);
    }
    movePigeon(pigeonX, pigeonY);
  }

  // Once the bomb is safe the bird stands on top of it: somewhere tidy to sit while
  // the result card takes up the bottom of the screen.
  function perch() {
    movePigeon(
      bombX + (bombWidth - pigeonMask.width * pigeonScale) / 2,
      bombY - pigeonMask.height * pigeonScale + bombScale * 3,
    );
  }

  // Where the bird is allowed to stand. Normally it stays wholly on screen, but the
  // beak is at the very front of a wide bird, so reaching a hitbox near an edge means
  // letting the body hang off — by as little as that hitbox needs, and no more.
  function movePigeon(x, y) {
    const { width, height } = arena.getBoundingClientRect();
    const beak = pigeonMask.box;
    const body = { width: pigeonMask.width * pigeonScale, height: pigeonMask.height * pigeonScale };
    const reach = screenBox({ mask: allTargets, x: bombX, y: bombY, scale: bombScale });

    pigeonX = clamp(
      Math.round(x),
      Math.min(0, reach.left - (beak.x + beak.width) * pigeonScale),
      Math.max(width - body.width, reach.left + reach.width - beak.x * pigeonScale),
    );
    pigeonY = clamp(
      Math.round(y),
      Math.min(0, reach.top - (beak.y + beak.height) * pigeonScale),
      Math.max(height - body.height, reach.top + reach.height - beak.y * pigeonScale),
    );
    pigeon.style.left = `${pigeonX}px`;
    pigeon.style.top = `${pigeonY}px`;
  }

  // ---------- Dragging ----------
  // The finger moves the bird by however far it travels, from wherever it started, so
  // it never has to sit on top of the pigeon and hide the beak. Only the arena starts
  // a drag, but the window finishes it, so sliding a finger over a button or off the
  // edge of the screen doesn't drop the bird mid-step.
  let dragging = null;

  arena.addEventListener("pointerdown", (event) => {
    if (state.done) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, fromX: pigeonX, fromY: pigeonY };
  });

  window.addEventListener("pointermove", (event) => {
    if (dragging?.id !== event.pointerId) return;
    movePigeon(dragging.fromX + event.clientX - dragging.x, dragging.fromY + event.clientY - dragging.y);
  });

  const stopDrag = (event) => {
    if (dragging?.id === event.pointerId) dragging = null;
  };
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  // Arrow keys nudge the bird, which is handy on a computer and for anyone who can't
  // drag. Shift moves a whole pixel-art square at a time.
  document.addEventListener("keydown", (event) => {
    if (state.done || document.querySelector("dialog[open]")) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const distance = event.shiftKey ? pigeonScale : 1;
    movePigeon(pigeonX + step[0] * distance, pigeonY + step[1] * distance);
  });

  // ---------- Hearts, the round counter and which bomb is showing ----------
  function drawHud() {
    // Round 1 shows bomb-1.gif; cutting its wire moves to bomb-2.gif, and the last
    // picture on the sheet is the defused one. Only assign when it actually changes,
    // or the two frames would restart every time anything else is redrawn.
    const showing = bombArt(state.done ? rounds + 1 : state.wire + 1);
    if (art.src !== showing) art.src = showing;
    if (glow.src !== showing) glow.src = showing;
    flash.src = targets[state.wire].url; // Ready for the next flash.

    const hearts = root.querySelector("[data-hearts]");
    hearts.innerHTML = Array.from(
      { length: HEARTS },
      (_, i) => `<img src="${i < state.hearts ? FULL_HEART : SPENT_HEART}" alt="">`,
    ).join("");
    hearts.setAttribute("aria-label", `${state.hearts} of ${HEARTS} hearts left`);
  }

  // ---------- The recording ----------
  function showCaption(text) {
    caption.textContent = text;
    caption.hidden = !text;
  }

  const recordingUrl = (round) => new URL(`rec${round}.mp3`, week).href;
  const elements = new Map();

  function element(round) {
    const url = recordingUrl(round);
    if (!elements.has(url)) {
      const sound = new Audio(url);
      sound.preload = "auto"; // On its way before it's asked for.
      elements.set(url, sound);
    }
    return elements.get(url);
  }

  const prefetch = () => {
    if (!state.done) element(state.wire + 1);
  };

  /** Stop the recording, whichever of the two ways is playing it. */
  function hush() {
    for (const sound of elements.values()) sound.pause();
    sfx.hush();
  }

  function listen() {
    showCaption("");
    const round = state.wire + 1;
    speak(round).catch(() => explain(round));
  }

  /**
   * A browser only hands a tap's permission to make a sound to whoever asks first, and
   * the sound effects hold an audio context of their own. So try the plain <audio>
   * element — it streams, so it starts sooner and doesn't sit in memory — and if the
   * browser won't let it play, ask the effects' context to say it instead.
   */
  async function speak(round) {
    const url = recordingUrl(round);
    hush();
    try {
      const sound = element(round);
      try {
        sound.currentTime = 0;
      } catch {
        // Nothing loaded yet, so there's no position to rewind to. Fine.
      }
      await sound.play();
    } catch {
      elements.delete(url); // It failed once; it would fail the same way again.
      await sfx.speak(url);
    }
  }

  /** Say why nothing played, and tell the player what to peck if we know. */
  async function explain(round) {
    const written = transcript[round - 1];
    if (written) return showCaption(written);
    let there = false;
    try {
      there = (await fetch(recordingUrl(round), { method: "HEAD" })).ok;
    } catch {
      // Offline, or the file isn't there. Either way it counts as missing.
    }
    showCaption(
      there
        ? `That recording wouldn't play. Tap Listen to try it again.`
        : `No recording for wire ${round} yet.`,
    );
  }

  // ---------- Pecking ----------
  let busy = false;

  // A halo around the bomb: green when a wire is cut, red when the peck missed.
  function haloFor(outcome) {
    bombBox.classList.remove("is-cut", "is-missed");
    void bombBox.offsetWidth; // Start the animation over if it's already running.
    bombBox.classList.add(outcome);
    setTimeout(() => bombBox.classList.remove(outcome), GLOW_MS);
  }

  // Light the round's hitbox up in white. The flash picture is the hitbox PNG itself,
  // laid over the bomb, so the lit pixels are exactly the ones that count.
  function flashTarget(times) {
    flash.classList.remove("is-flashing");
    void flash.offsetWidth;
    flash.style.animationIterationCount = String(times);
    flash.classList.add("is-flashing");
    return new Promise((resolve) => {
      setTimeout(() => {
        flash.classList.remove("is-flashing");
        resolve();
      }, times * FLASH_MS);
    });
  }

  async function peck() {
    if (busy || state.done) return;
    busy = true;
    sfx.warm(); // While the player's finger is definitely on the screen.
    hush(); // Don't let the last instruction talk over the peck.
    showCaption("");

    pigeon.classList.add("is-pecking");
    setTimeout(() => pigeon.classList.remove("is-pecking"), 220);
    await wait(150); // Land the peck partway through the swing.

    const hit = overlaps(
      { mask: pigeonMask, x: pigeonX, y: pigeonY, scale: pigeonScale },
      { mask: targets[state.wire], x: bombX, y: bombY, scale: bombScale },
    );

    if (hit) await cut();
    else await miss();
    busy = false;
  }

  async function cut() {
    const wasLast = state.wire === rounds - 1;
    if (wasLast) state.done = true;
    else state.wire += 1;
    save();
    drawHud(); // Swaps in the picture of the bomb with that wire cut.
    prefetch();

    sfx.play("cut");
    haloFor("is-cut");
    await wait(GLOW_MS);
    if (wasLast) finish();
  }

  async function miss() {
    state.hearts -= 1;
    state.misses += 1;
    save();
    drawHud();
    root.querySelector("[data-hearts] img:nth-child(" + (state.hearts + 1) + ")")?.classList.add("is-lost");
    bombBox.classList.add("is-near");
    setTimeout(() => bombBox.classList.remove("is-near"), 260);
    haloFor("is-missed");
    sfx.play("buzz");
    if (state.hearts > 0) return;

    await wait(360); // Let the buzz finish before the bang.
    sfx.play("boom");
    await wait(GLOW_MS);
    const choice = await outOfHearts();
    state.hearts = HEARTS;
    if (choice === "show") {
      state.shown[state.wire] = true;
      showCaption(transcript[state.wire] ?? "");
      await flashTarget(3);
    }
    save();
    drawHud();
  }

  // ---------- Out of hearts ----------
  // Escape and tapping outside both mean "keep trying", so nobody is handed the
  // answer by closing the box.
  function outOfHearts() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = `dialog pixel-box game-${ctx.game.id}`;
      dialog.tabIndex = -1;
      dialog.innerHTML = `
        <div class="dialog__body">
          <h2>Boom.</h2>
          <p>That's all three hearts. Another go, or shall we show you the wire?</p>
        </div>
        <form class="dialog__actions dialog__actions--pair" method="dialog">
          <button class="pixel-btn pixel-btn--plain" value="show">Show answer</button>
          <button class="pixel-btn" value="keep">Keep trying</button>
        </form>`;
      const finishDialog = (choice) => {
        dialog.close();
        dialog.remove();
        resolve(choice);
      };
      dialog.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        finishDialog(event.submitter?.value === "show" ? "show" : "keep");
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finishDialog("keep");
      });
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) finishDialog("keep");
      });
      document.body.append(dialog);
      dialog.showModal();
      dialog.focus();
    });
  }

  // ---------- The end ----------
  function finish() {
    showCaption("");
    perch();
    sfx.play("defused");
    const peeked = state.shown.filter(Boolean).length;
    buttons.outerHTML = `
      <div class="ctw-result pixel-box">
        <h2 class="ctw-result__heading">Defused!</h2>
        <p class="ctw-result__line">${escapeHtml(scoreLine(state.misses, peeked))}</p>
        <p class="ctw-result__wires">${state.shown.map((s) => (s ? "👀" : "✂️")).join("")}</p>
        <button class="pixel-btn" type="button">Share</button>
      </div>`;
    root.querySelector(".ctw-result button").addEventListener("click", () => {
      shareText(
        [
          `${ctx.game.name} #${ctx.puzzleNumber}`,
          state.shown.map((s) => (s ? "👀" : "✂️")).join(""),
          `${state.misses} missed peck${state.misses === 1 ? "" : "s"}`,
          new URL("./", location.href).href,
        ].join("\n"),
      );
    });
  }

  const scoreLine = (misses, peeked) => {
    const pecks = misses === 0 ? "Not one missed peck." : `${misses} missed peck${misses === 1 ? "" : "s"}.`;
    const wires = `${rounds} wire${rounds === 1 ? "" : "s"} cut`;
    return peeked ? `${wires}, ${peeked} shown to you. ${pecks}` : `All ${wires}. ${pecks}`;
  };

  // ---------- Wiring it up ----------
  root.querySelector("[data-listen]").addEventListener("click", listen);
  root.querySelector("[data-peck]").addEventListener("click", peck);

  drawHud();
  prefetch();
  layout();
  new ResizeObserver(() => layout()).observe(arena); // Rotating the phone, and the like.

  if (state.done) finish();
}

// ---------- Odds and ends ----------

/** The lines of assets/week<N>/transcript.txt, one per round. Optional. */
async function loadTranscript(week) {
  try {
    const response = await fetch(new URL("transcript.txt", week));
    if (!response.ok) return [];
    const text = await response.text();
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/^\d+[.)]\s*/, ""));
  } catch {
    return []; // No transcript is fine; the recordings are the real thing.
  }
}

/** The smallest box holding all of them. */
function unionBox(boxes) {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
