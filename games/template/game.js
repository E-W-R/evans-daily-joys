// Template game: copy this folder to games/<your-game-id>/ to start a new game.
// Preview it any time at play.html?game=<your-game-id>&date=2026-11-08
//
// play.html imports this file and calls mount(root, ctx):
//
//   root  An empty element to draw the game into. It has the class "game-<id>",
//         so scope this game's CSS under that class (see game.css).
//
//   ctx.game          This game's entry from js/games.js (id, name, color, ...).
//   ctx.date          "YYYY-MM-DD" of the puzzle being played.
//   ctx.puzzleNumber  1 in the launch week, 2 the week after, ... Use it to pick the puzzle.
//   ctx.isToday       false when replaying an older puzzle from the calendar.
//   ctx.saved         Whatever ctx.save() stored last time for this date, or null.
//   ctx.save(record)  Remember progress for this date. Include done: true once the
//                     player finishes, and the calendar shows a check mark.
//
// Optional: export const howToPlay = `<h2>How to play</h2><p>…</p>`; adds a "?" button to
// the top bar that opens it, and shows it automatically on a player's first visit.
//
// Handy shared pieces: createKeyboard() in js/keyboard.js for typing letters, and
// shareText() / toast() in js/ui.js. games/minute-cryptevan/ is a full example.

export async function mount(root, ctx) {
  const response = await fetch(new URL("./puzzles.json", import.meta.url));
  const puzzles = await response.json();
  const puzzle = puzzles[`week${ctx.puzzleNumber}`];

  if (!puzzle) {
    root.innerHTML = `<p class="note">No puzzle written for week ${ctx.puzzleNumber} yet.</p>`;
    return;
  }

  root.innerHTML = `
    <div class="card pixel-box">
      <p class="prompt"></p>
      <button class="pixel-btn" type="button">Solve</button>
    </div>`;
  root.querySelector(".prompt").textContent = puzzle.prompt;

  const button = root.querySelector("button");
  const showSolved = () => {
    button.textContent = "Solved!";
    button.disabled = true;
  };

  if (ctx.saved?.done) showSolved();
  button.addEventListener("click", () => {
    ctx.save({ done: true });
    showSolved();
  });
}
