// On-screen pixel keyboard for games where the player types letters. A computer's
// own keyboard works too. onKey gets "A"–"Z", "Backspace", "Enter", "ArrowLeft" or
// "ArrowRight".
//
//   const keyboard = createKeyboard(someElement, (key) => { ... });
//   keyboard.destroy(); // remove it and stop listening for keys

import { BACKSPACE } from "./icons.js";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const SPECIAL_KEYS = ["Backspace", "Enter", "ArrowLeft", "ArrowRight"];

export function createKeyboard(container, onKey) {
  const keyboard = document.createElement("div");
  keyboard.className = "keyboard";
  keyboard.innerHTML = ROWS.map((row, i) => {
    const keys = [...row]
      .map((letter) => `<button class="pixel-btn key" type="button" data-key="${letter}">${letter}</button>`)
      .join("");
    // The last row has backspace on the right and a same-sized gap on the left, so
    // the letters stay centered.
    return i < ROWS.length - 1
      ? `<div class="keyboard__row">${keys}</div>`
      : `<div class="keyboard__row">
          <span class="key key--wide key--spacer"></span>${keys}
          <button class="pixel-btn key key--wide" type="button" data-key="Backspace"
            aria-label="Backspace"><img src="${BACKSPACE}" alt=""></button>
        </div>`;
  }).join("");

  keyboard.addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]");
    if (key) onKey(key.dataset.key);
  });

  function onKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    // Let Enter and Space keep working on focused buttons and links.
    if (event.key === "Enter" && event.target.closest?.("button, a")) return;
    const key = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : event.key;
    if (!/^[A-Z]$/.test(key) && !SPECIAL_KEYS.includes(key)) return;
    event.preventDefault();
    onKey(key);
  }
  document.addEventListener("keydown", onKeydown);

  container.append(keyboard);
  return {
    destroy() {
      document.removeEventListener("keydown", onKeydown);
      keyboard.remove();
    },
  };
}
