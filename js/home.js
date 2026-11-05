import { createCalendar } from "./calendar.js";
import { LOCK_FUTURE_DAYS } from "./config.js";
import { clearAll } from "./storage.js";
import { confirmDialog, showDevBadge, toast } from "./ui.js";

// The Play button opens whichever day is highlighted. The highlighted day also goes in
// this page's address, so coming Back from a game lands on the same day.
const play = document.querySelector("[data-play]");
const calendar = createCalendar(document.querySelector("[data-calendar]"), {
  selected: new URLSearchParams(location.search).get("date"),
  onSelect(key) {
    play.href = `play.html?date=${key}`;
    try {
      history.replaceState(null, "", `?date=${key}`);
    } catch {
      // Some sandboxed previews refuse; the highlight just won't survive a reload.
    }
  },
});

// When the player comes back to this page (back button, switching apps, or the tab
// left open overnight), refresh today's highlight and the finished check marks.
addEventListener("pageshow", (event) => {
  if (event.persisted) calendar.refresh();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) calendar.refresh();
});

// While testing, a button to wipe all saved progress so games can be replayed fresh.
if (!LOCK_FUTURE_DAYS) {
  const reset = document.querySelector("[data-reset]");
  reset.hidden = false;
  reset.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Reset progress?",
      text: "This erases every saved game and setting on this device.",
      confirm: "Reset",
    });
    if (!confirmed) return;
    clearAll();
    document.querySelector(".dev-badge")?.remove();
    calendar.refresh();
    toast("Progress reset");
  });
}

showDevBadge();
