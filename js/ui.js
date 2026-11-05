// Small helpers shared by the pages.

import { devToday } from "./dates.js";

/** Make text safe to drop into an HTML template string. */
export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** While a ?today= test date is active, show it in a corner. Tapping it switches back. */
export function showDevBadge() {
  const date = devToday();
  if (!date) return;
  const badge = document.createElement("a");
  badge.className = "dev-badge";
  badge.href = "?today=";
  badge.textContent = `Test date ${date} ×`;
  document.body.append(badge);
}

/** A short message that pops up at the top of the screen for a moment. */
export function toast(message) {
  let element = document.querySelector(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast pixel-box";
    element.setAttribute("role", "status");
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.remove("toast--show");
  void element.offsetWidth; // Restart the animation if it's already showing.
  element.classList.add("toast--show");
}

/**
 * A pixel-styled "Are you sure?" box. Resolves to true if the player confirms, false if
 * they cancel, press Escape, or tap outside it.
 */
export function confirmDialog({ title, text, confirm = "OK", cancel = "Cancel" }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog pixel-box";
    dialog.tabIndex = -1;
    dialog.innerHTML = `
      <div class="dialog__body">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
      <form class="dialog__actions dialog__actions--pair" method="dialog">
        <button class="pixel-btn pixel-btn--plain" value="cancel">${escapeHtml(cancel)}</button>
        <button class="pixel-btn" value="confirm">${escapeHtml(confirm)}</button>
      </form>`;
    const finish = (confirmed) => {
      dialog.close();
      dialog.remove();
      resolve(confirmed);
    };
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      finish(event.submitter?.value === "confirm");
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault(); // Escape key
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.focus();
  });
}

/**
 * Share a game result. Phones get the share sheet; everywhere else (or if sharing
 * fails) the text is copied to the clipboard.
 */
export async function shareText(text) {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === "AbortError") return; // The player closed the share sheet.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    toast("Couldn't copy, sorry");
  }
}
