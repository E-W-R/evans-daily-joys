import { createCalendar } from "./calendar.js";
import { LOCK_FUTURE_DAYS } from "./config.js";
import { clearAll } from "./storage.js";
import { confirmDialog, showDevBadge, toast } from "./ui.js";

const calendar = createCalendar(document.querySelector("[data-calendar]"));

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
