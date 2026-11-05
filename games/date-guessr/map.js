// The place half of a guess: a real map you can pan and zoom, in a pop-up.
//
//   const spot = await pickSpot({ selected });   // {lat, lon}, or null if closed
//   await showGuess(element, guess, truth);      // where you said, where it was
//
// This is the one part of the site that isn't pixel art: Odd One Out's map is drawn
// block by block because its puzzle is about shapes of streets, but here you need to
// find a real spot within a few metres, so it's a proper slippy map.
//
// Leaflet is kept in assets/leaflet/ (BSD licence, see the file next to it) and
// loaded the first time a map is opened, so the rest of the site doesn't pay for it.
// The map tiles come from OpenStreetMap, which asks for the credit line Leaflet
// draws in the corner.

import { pixelArt, INK } from "../../js/icons.js";

const VANCOUVER = [49.2827, -123.1207];
const CITY_ZOOM = 12; // the whole city, the first time it opens
const SPOT_ZOOM = 16; // close in, when there's already a spot to look at
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CREDIT =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">' +
  "OpenStreetMap</a> contributors";

// The same pin as Odd One Out's, so the two maps feel like one site.
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

const PINS = {
  guess: pixelArt(PIN, { "#": INK, x: "#e4572e" }), // where she said
  truth: pixelArt(PIN, { "#": INK, x: "#7fa34a" }), // where it really was
};

let leaflet; // the one load, shared by every map

/** Loads Leaflet, once. Resolves to L. */
export function loadLeaflet() {
  leaflet ??= new Promise((resolve, reject) => {
    if (globalThis.L) return resolve(globalThis.L);
    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = new URL("../../assets/leaflet/leaflet.css", import.meta.url);
    document.head.append(styles);
    const script = document.createElement("script");
    script.src = new URL("../../assets/leaflet/leaflet.js", import.meta.url);
    script.onload = () => resolve(globalThis.L);
    script.onerror = () => reject(new Error("Leaflet didn't load"));
    document.head.append(script);
  });
  return leaflet;
}

/** Metres between two {lat, lon} spots, around the curve of the earth. */
export function distance(from, to) {
  const RADIUS = 6_371_008.8; // metres
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLon = radians(to.lon - from.lon);
  const half = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIUS * Math.asin(Math.min(1, Math.sqrt(half)));
}

/** "40 m" or "1.2 km": how far off a guess was, in words. */
export const howFar = (metres) =>
  metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;

const marker = (L, spot, which) => L.marker([spot.lat, spot.lon], {
  icon: L.divIcon({
    className: `dg-pin dg-pin--${which}`,
    html: `<img src="${PINS[which]}" alt="">`,
    iconSize: [22, 28],
    iconAnchor: [11, 28],
  }),
  keyboard: false,
  interactive: false,
});

const tiles = (L, map) => L.tileLayer(TILES, { maxZoom: 19, attribution: CREDIT }).addTo(map);

/**
 * Pick a spot on the map. Opens on Vancouver, or close in on the spot already
 * picked. Tap to drop the pin, drag and pinch to get closer.
 */
export async function pickSpot({ selected }) {
  const L = await loadLeaflet();
  return new Promise((resolve) => {
    let picked = selected ?? null;
    let pin = null;
    let map = null;

    const dialog = document.createElement("dialog");
    dialog.className = "dialog pixel-box game-date-guessr dg-sheet";
    dialog.setAttribute("aria-label", "Pick the spot");
    dialog.tabIndex = -1;
    dialog.innerHTML = `
      <div class="dialog__body dg-sheet__body">
        <p class="dg-sheet__hint">Tap the map where you think it was taken.</p>
        <div class="dg-map dg-map--pick"></div>
      </div>
      <form class="dialog__actions dialog__actions--pair" method="dialog">
        <button class="pixel-btn pixel-btn--plain" value="cancel">Cancel</button>
        <button class="pixel-btn" value="use">Set spot</button>
      </form>`;

    const use = dialog.querySelector('[value="use"]');
    use.disabled = picked === null;

    const finish = (spot) => {
      map?.remove();
      dialog.close();
      dialog.remove();
      resolve(spot);
    };

    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      finish(event.submitter?.value === "use" ? picked : null);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault(); // Escape
      finish(null);
    });

    // The map has to be built after the dialog is open, or Leaflet measures it at
    // nothing and loads a single tile.
    document.body.append(dialog);
    dialog.showModal();
    dialog.focus();

    map = L.map(dialog.querySelector(".dg-map"), {
      center: picked ? [picked.lat, picked.lon] : VANCOUVER,
      zoom: picked ? SPOT_ZOOM : CITY_ZOOM,
      zoomSnap: 0.5,
    });
    tiles(L, map);
    if (picked) pin = marker(L, picked, "guess").addTo(map);

    map.on("click", (event) => {
      picked = { lat: event.latlng.lat, lon: event.latlng.lng };
      if (pin) map.removeLayer(pin);
      pin = marker(L, picked, "guess").addTo(map);
      use.disabled = false;
    });
  });
}

/**
 * Both pins and the gap between them, filling the element. Zoomed to hold the two,
 * or close in on the spot if the guess was near enough that they'd sit on top of
 * each other.
 */
export async function showGuess(element, guess, truth) {
  const L = await loadLeaflet();
  const map = L.map(element, { center: [truth.lat, truth.lon], zoom: SPOT_ZOOM });
  tiles(L, map);
  marker(L, truth, "truth").addTo(map);
  marker(L, guess, "guess").addTo(map);
  L.polyline([[guess.lat, guess.lon], [truth.lat, truth.lon]], {
    color: INK,
    weight: 3,
    dashArray: "6 6",
  }).addTo(map);
  if (distance(guess, truth) > 40) {
    map.fitBounds([[guess.lat, guess.lon], [truth.lat, truth.lon]], { padding: [40, 40] });
  }
  // The card it sits in may still be settling into place, so measure again next frame.
  requestAnimationFrame(() => map.invalidateSize());
  return map;
}
