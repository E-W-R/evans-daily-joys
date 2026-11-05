// Pixel-exact hit testing for Coot the Wire.
//
// Don't rename this file hitbox.js: Safari's privacy blocklist blocks scripts with
// that name (an old analytics product was called HitBox), and the game won't load.
//
// A hitbox is a PNG the same size as the picture it belongs to: an opaque pixel is
// part of the hitbox, a see-through one isn't. So Bomb-2.png is the bomb-sized
// picture with only the second wire painted in, and Pidge-2.png is the pigeon-sized
// picture with only the beak painted in.
//
// loadMask() reads one of those PNGs. overlaps() asks whether two of them touch once
// they're on screen, each at its own spot and its own size.
//
// Reading pixels out of a PNG needs the page to be served over http, so use
// `python3 -m http.server` rather than opening the files directly.

// Anything fainter than this counts as empty, so a stray soft edge isn't a hitbox.
const SOLID_ALPHA = 8;

/**
 * Load a hitbox PNG.
 * Resolves to { width, height, box, at(x, y) }, all in the PNG's own pixels:
 *   width, height  the whole picture
 *   box            the smallest { x, y, width, height } holding every solid pixel
 *   at(x, y)       true if that pixel is part of the hitbox
 */
export async function loadMask(url) {
  const image = await loadImage(url);
  const { naturalWidth: width, naturalHeight: height } = image;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);

  const solid = new Uint8Array(width * height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < SOLID_ALPHA) continue;
      solid[y * width + x] = 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  const box =
    right < 0
      ? { x: 0, y: 0, width: 0, height: 0 } // Nothing painted in at all.
      : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };

  return {
    url,
    width,
    height,
    box,
    at: (x, y) => x >= 0 && y >= 0 && x < width && y < height && solid[y * width + x] === 1,
  };
}

/**
 * Where a mask's solid pixels sit on screen. The placement is
 * { mask, x, y, scale }: the top-left corner of the whole picture in screen pixels,
 * and how many screen pixels one picture pixel covers.
 */
export function screenBox({ mask, x, y, scale }) {
  return {
    left: x + mask.box.x * scale,
    top: y + mask.box.y * scale,
    width: mask.box.width * scale,
    height: mask.box.height * scale,
  };
}

/**
 * Do two placed masks touch? Walks the screen pixels the two could share and looks
 * for one that is solid in both, so the answer matches what the player can see.
 * Overlaps thinner than a screen pixel don't count.
 */
export function overlaps(a, b) {
  const boxA = screenBox(a);
  const boxB = screenBox(b);
  const left = Math.max(boxA.left, boxB.left);
  const right = Math.min(boxA.left + boxA.width, boxB.left + boxB.width);
  const top = Math.max(boxA.top, boxB.top);
  const bottom = Math.min(boxA.top + boxA.height, boxB.top + boxB.height);
  if (left >= right || top >= bottom) return false;

  for (let y = Math.floor(top) + 0.5; y < bottom; y++) {
    for (let x = Math.floor(left) + 0.5; x < right; x++) {
      if (solidAt(a, x, y) && solidAt(b, x, y)) return true;
    }
  }
  return false;
}

/** Is the screen point (x, y) on a solid pixel of this placed mask? */
function solidAt({ mask, x: originX, y: originY, scale }, x, y) {
  return mask.at(Math.floor((x - originX) / scale), Math.floor((y - originY) / scale));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Couldn't load ${url}`));
    image.src = url;
  });
}
