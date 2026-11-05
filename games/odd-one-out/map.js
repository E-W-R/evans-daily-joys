// The pixel map Odd One Out plays on.
//
// map/ holds one map of the whole of Metro Vancouver, built by
// tools/build_odd_one_out.py and shared by every round:
//
//   land.png    the shape of the land, white where the ground is and see-through
//               where the sea, the river and the lakes are
//   roads.json  every main street as a line of points, with its name and how big
//               a road it is (1 highway ... 4 neighbourhood street)
//
// A round hands this its pins and gets back a square of map cropped to fit them.
// Nothing is downloaded while you play: the crop is drawn here, on a canvas about
// 170 blocks across that the browser blows up to the size of the square, so the
// coastline and the streets come out as chunky pixels like everything else on the
// site. Street names go on top as ordinary text, because a name drawn in blocks
// that small is unreadable.

const MAP = new URL("./map/", import.meta.url);

// How many screen pixels one map pixel is drawn as. Two keeps a phone-sized
// square at about 170 blocks: coarse enough to read as pixel art, fine enough
// that the streets still look like streets.
const BLOCK = 2;

// Empty space kept around the outermost pins, as a share of the map's width, so
// no pin ever sits on the very edge.
const PADDING = 0.14;

// The closest the map will ever crop in, in kilometres across. Without this, a
// round whose branches are all downtown would zoom until the map was three
// streets and no shape to recognise.
const MIN_SPAN_KM = 4;

// Neighbourhood streets are only drawn once the map is cropped in this close, in
// kilometres across. Any wider and they turn the map into porridge.
const SMALL_STREET_SPAN_KM = 14;

// A degree of longitude at Vancouver's latitude, in kilometres.
const KM_PER_DEGREE = 73;

// Anything this much of the way to solid, once the streets are drawn, becomes a
// whole pixel; anything less disappears. This is what keeps the map free of the
// half-shaded edges a browser would otherwise smooth every diagonal with.
const SOLID_AT = 0.42;

// The most street names on a map at once. Enough to find your bearings anywhere
// on the square; past this they start reading as clutter rather than help.
const MAX_LABELS = 10;

// Clear space kept around a street name, in screen pixels. Without it the names
// all bunch into whichever corner has the longest straight roads.
const LABEL_GAP = 10;

// How much a street's size counts next to how much of it is on screen, when the
// map picks which few to name. A highway is worth naming even where only a
// stretch of it shows; a side street has to earn it.
const RANK_WEIGHT = { 1: 2.5, 2: 1.8, 3: 1, 4: 0.6 };
const LABEL_FONT = '700 11px "Atkinson Hyperlegible Next", system-ui, sans-serif';

let loading = null;

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`can't load ${src}`));
  image.src = src;
});

/** Latitude as Web Mercator degrees, so that north-south and east-west match. */
const mercator = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;

/** Loads map/ once, however many rounds ask for it. */
export function loadBasemap() {
  loading ??= (async () => {
    const [roads, land] = await Promise.all([
      fetch(new URL("roads.json", MAP)).then((response) => response.json()),
      loadImage(new URL("land.png", MAP).href),
    ]);
    const [south, west, north, east] = roads.bbox;
    // Each street gets the box it lives in, worked out once, so drawing a crop
    // can skip the thousands of streets nowhere near it.
    for (const way of roads.ways) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < way.p.length; i += 2) {
        const x = way.p[i];
        const y = mercator(way.p[i + 1]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      way.box = [minX, minY, maxX, maxY];
    }
    return {
      ways: roads.ways,
      land,
      west,
      east,
      top: mercator(north),
      bottom: mercator(south),
    };
  })();
  return loading;
}

/** The square of the world that shows every one of these points, with room to spare. */
function frameFor(points) {
  const xs = points.map((p) => p.lon);
  const ys = points.map((p) => mercator(p.lat));
  const middleX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const middleY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const widest = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const span = Math.max(widest * (1 + 2 * PADDING), MIN_SPAN_KM / KM_PER_DEGREE);
  return { left: middleX - span / 2, top: middleY + span / 2, span };
}

const readColors = (element) => {
  const style = getComputedStyle(element);
  const of = (name) => style.getPropertyValue(name).trim();
  return {
    water: of("--ooo-water"),
    land: of("--ooo-land"),
    roads: [of("--ooo-road-1"), of("--ooo-road-2"), of("--ooo-road-3"), of("--ooo-road-4")],
  };
};

const rgbOf = (color) => {
  const probe = document.createElement("canvas").getContext("2d");
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  return [...probe.getImageData(0, 0, 1, 1).data].slice(0, 3);
};

/**
 * Makes the streets pixel-sharp.
 *
 * A browser draws a slanted line by shading the pixels along its edge part way,
 * which on a map blown up eight times over reads as blur. Every pixel here is
 * pushed to one side or the other: solid enough, and it takes the colour of the
 * nearest kind of street; otherwise it goes away entirely.
 */
function harden(context, size, palette) {
  const picture = context.getImageData(0, 0, size, size);
  const pixels = picture.data;
  const cutoff = SOLID_AT * 255;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < cutoff) {
      pixels[i + 3] = 0;
      continue;
    }
    let best = palette[0];
    let nearest = Infinity;
    for (const colour of palette) {
      const away = (pixels[i] - colour[0]) ** 2
        + (pixels[i + 1] - colour[1]) ** 2
        + (pixels[i + 2] - colour[2]) ** 2;
      if (away < nearest) {
        nearest = away;
        best = colour;
      }
    }
    [pixels[i], pixels[i + 1], pixels[i + 2]] = best;
    pixels[i + 3] = 255;
  }
  context.putImageData(picture, 0, 0);
}

/** How thick each kind of street is drawn, in map pixels. */
const thickness = (rank) => (rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1.4 : 1);

/**
 * Puts a square of map into `holder` and keeps it there.
 *
 * holder needs a canvas and an empty layer for the street names; both are made
 * here. Call layout(points, room) to frame those points, at(lat, lon) to find
 * where something sits on the square, paint() to draw it, and destroy() when the
 * round is over.
 */
export function createMap(holder, basemap) {
  const canvas = document.createElement("canvas");
  canvas.className = "ooo-canvas";
  const labels = document.createElement("div");
  labels.className = "ooo-labels";
  holder.append(canvas, labels);

  const context = canvas.getContext("2d", { alpha: false });
  const layer = document.createElement("canvas");
  const layerContext = layer.getContext("2d");
  const ruler = document.createElement("canvas").getContext("2d");

  let frame = null;
  let size = 0; // the square's side in screen pixels
  let blocks = 0; // ... and in map pixels

  const at = (lat, lon) => ({
    x: (lon - frame.left) / frame.span,
    y: (frame.top - mercator(lat)) / frame.span,
  });

  const drawLand = (colours) => {
    const { land, west, east, top, bottom } = basemap;
    const perDegree = land.width / (east - west);
    const perMercator = land.height / (top - bottom);
    layer.width = layer.height = blocks;
    layerContext.imageSmoothingEnabled = false;
    layerContext.clearRect(0, 0, blocks, blocks);
    layerContext.fillStyle = colours.land;
    layerContext.fillRect(0, 0, blocks, blocks);
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(
      land,
      (frame.left - west) * perDegree, (top - frame.top) * perMercator,
      frame.span * perDegree, frame.span * perMercator,
      0, 0, blocks, blocks,
    );
    layerContext.globalCompositeOperation = "source-over";
    context.drawImage(layer, 0, 0);
  };

  const drawRoads = (colours, smallest) => {
    layer.width = layer.height = blocks;
    layerContext.clearRect(0, 0, blocks, blocks);
    layerContext.lineCap = "round";
    layerContext.lineJoin = "round";
    const edge = frame.left + frame.span;
    const foot = frame.top - frame.span;
    // Biggest roads last, so a highway is never broken by the street under it.
    for (let rank = smallest; rank >= 1; rank -= 1) {
      layerContext.strokeStyle = colours.roads[rank - 1];
      layerContext.lineWidth = thickness(rank);
      layerContext.beginPath();
      for (const way of basemap.ways) {
        if (way.r !== rank) continue;
        const [minX, minY, maxX, maxY] = way.box;
        if (maxX < frame.left || minX > edge || maxY < foot || minY > frame.top) continue;
        for (let i = 0; i < way.p.length; i += 2) {
          const x = ((way.p[i] - frame.left) / frame.span) * blocks;
          const y = ((frame.top - mercator(way.p[i + 1])) / frame.span) * blocks;
          if (i === 0) layerContext.moveTo(x, y);
          else layerContext.lineTo(x, y);
        }
      }
      layerContext.stroke();
    }
    harden(layerContext, blocks, colours.roads.map(rgbOf));
    context.drawImage(layer, 0, 0);
  };

  /**
   * Names for the few biggest streets on screen.
   *
   * Each street offers its longest straight stretch in view. The biggest roads
   * get first pick, and a name is dropped if its box would land on a pin or on a
   * name already placed -- a crowded map helps nobody.
   */
  const drawLabels = (taken, smallest) => {
    labels.replaceChildren();
    ruler.font = LABEL_FONT;
    const best = new Map();
    const edge = frame.left + frame.span;
    const foot = frame.top - frame.span;
    for (const way of basemap.ways) {
      if (!way.n || way.r > smallest) continue;
      const [minX, minY, maxX, maxY] = way.box;
      if (maxX < frame.left || minX > edge || maxY < foot || minY > frame.top) continue;
      for (let i = 0; i < way.p.length - 2; i += 2) {
        const a = { x: way.p[i], y: mercator(way.p[i + 1]) };
        const b = { x: way.p[i + 2], y: mercator(way.p[i + 3]) };
        const middleX = (a.x + b.x) / 2;
        const middleY = (a.y + b.y) / 2;
        const inside = middleX > frame.left + frame.span * 0.08
          && middleX < edge - frame.span * 0.08
          && middleY > foot + frame.span * 0.08
          && middleY < frame.top - frame.span * 0.08;
        if (!inside) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        // A street is worth naming for how much of it is on screen; the name
        // itself goes on its longest straight stretch, where it fits best.
        const standing = best.get(way.n) ?? { seen: 0, longest: 0, rank: way.r };
        standing.seen += length;
        standing.rank = Math.min(standing.rank, way.r);
        if (length > standing.longest) {
          Object.assign(standing, { longest: length, a, b, middleX, middleY });
        }
        best.set(way.n, standing);
      }
    }

    const wanted = [...best.entries()]
      .filter(([, pick]) => pick.longest > 0)
      .map(([name, pick]) => ({ name, ...pick, worth: pick.seen * RANK_WEIGHT[pick.rank] }))
      .sort((one, two) => two.worth - one.worth);

    const boxes = [...taken];
    for (const pick of wanted) {
      if (labels.childElementCount >= MAX_LABELS) break;
      const x = ((pick.middleX - frame.left) / frame.span) * size;
      const y = ((frame.top - pick.middleY) / frame.span) * size;
      let turn = Math.atan2(-(pick.b.y - pick.a.y), pick.b.x - pick.a.x);
      if (turn > Math.PI / 2) turn -= Math.PI;
      if (turn < -Math.PI / 2) turn += Math.PI;
      // The room a slanted word takes up, measured straight across and down.
      const across = ruler.measureText(pick.name).width + 8;
      const down = 16;
      const wide = Math.abs(across * Math.cos(turn)) + Math.abs(down * Math.sin(turn));
      const tall = Math.abs(across * Math.sin(turn)) + Math.abs(down * Math.cos(turn));
      const box = [x - wide / 2, y - tall / 2, x + wide / 2, y + tall / 2];
      if (box[0] < 2 || box[1] < 2 || box[2] > size - 2 || box[3] > size - 2) continue;
      const room = [box[0] - LABEL_GAP, box[1] - LABEL_GAP,
                    box[2] + LABEL_GAP, box[3] + LABEL_GAP];
      if (boxes.some((other) => room[0] < other[2] && room[2] > other[0]
        && room[1] < other[3] && room[3] > other[1])) continue;
      boxes.push(box);
      const label = document.createElement("span");
      label.className = "ooo-label";
      label.textContent = pick.name;
      label.style.left = `${(x / size) * 100}%`;
      label.style.top = `${(y / size) * 100}%`;
      label.style.transform = `translate(-50%, -50%) rotate(${-turn}rad)`;
      labels.append(label);
    }
  };

  return {
    at,
    /** The side of the drawn square, in screen pixels. */
    get size() { return size; },
    /**
     * Settles where the square sits and how big it is: as big as `room` allows,
     * cropped to hold every point. Call this first, so at() can be asked where
     * the pins land, then paint() with the boxes those pins take up.
     */
    layout(points, room) {
      frame = frameFor(points);
      blocks = Math.max(48, Math.floor(Math.min(room.width, room.height) / BLOCK));
      size = blocks * BLOCK; // a whole number of screen pixels per map pixel
      canvas.width = canvas.height = blocks;
      canvas.style.width = canvas.style.height = `${size}px`;
      holder.style.width = holder.style.height = `${size}px`;
      return size;
    },
    /** Draws it. `taken` is boxes the street names must keep off, in screen pixels. */
    paint(taken = []) {
      const colours = readColors(holder);
      context.imageSmoothingEnabled = false;
      context.fillStyle = colours.water;
      context.fillRect(0, 0, blocks, blocks);
      drawLand(colours);
      // On a map of the whole city the neighbourhood streets would be porridge;
      // cropped in close they're most of what there is, and worth naming.
      const smallest = frame.span * KM_PER_DEGREE <= SMALL_STREET_SPAN_KM ? 4 : 3;
      drawRoads(colours, smallest);
      drawLabels(taken, smallest);
    },
    destroy() {
      canvas.remove();
      labels.remove();
    },
  };
}
