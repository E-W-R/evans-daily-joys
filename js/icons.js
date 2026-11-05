// Pixel art written as text. Each string is one row and each character is one
// pixel, colored by looking it up in a palette. "." is always transparent.
//
//   pixelArt([".##.", "#..#"], { "#": INK })  →  an image URL to use as <img src>
//
// The result is an SVG, so it stays perfectly sharp at any size.

export const INK = "#2b2118";
export const PAPER = "#fff8e7";

export function pixelArt(rows, palette) {
  const width = Math.max(...rows.map((row) => row.length));
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      // Merge runs of the same color into one rectangle to keep the SVG small.
      const char = row[x];
      let run = 1;
      while (row[x + run] === char) run++;
      if (char !== ".") {
        if (!palette[char]) console.warn(`pixelArt: no color for "${char}"`);
        else rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[char]}"/>`;
      }
      x += run;
    }
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" ` +
    `shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ARROW_LEFT = pixelArt(
  ["...#", "..##", ".###", "####", ".###", "..##", "...#"],
  { "#": INK },
);

export const ARROW_RIGHT = pixelArt(
  ["#...", "##..", "###.", "####", "###.", "##..", "#..."],
  { "#": INK },
);

export const HELP = pixelArt(
  [".####.", "##..##", "....##", "...##.", "..##..", "......", "..##.."],
  { "#": INK },
);

export const CLOSE = pixelArt(
  ["##...##", "###.###", ".#####.", "..###..", ".#####.", "###.###", "##...##"],
  { "#": INK },
);

export const BACKSPACE = pixelArt(
  [
    "...######",
    "..#.....#",
    ".#..#.#.#",
    "#....#..#",
    ".#..#.#.#",
    "..#.....#",
    "...######",
  ],
  { "#": INK },
);

export const CHECK = pixelArt(
  [
    "......##",
    ".....##.",
    "##..##..",
    ".####...",
    "..##....",
  ],
  { "#": INK },
);
