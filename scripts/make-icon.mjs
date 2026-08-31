// Generates the source app icon (1024x1024 PNG) with no external deps.
// Run: node scripts/make-icon.mjs   ->   app-icon.png
// Then: pnpm tauri icon             ->   src-tauri/icons/*
//
// The mark is what the word "folio" means: one sheet, folded once, with a
// bookmark tucked into the fold. It is drawn flat rather than in perspective —
// give the far side of the fold any real width and the shape stops reading as
// paper and starts reading as a box.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const SS = 3; // supersampling factor — antialiasing for the sloped edges

const INK = [23, 19, 15];
const INK_TOP = [42, 33, 26];
const CREAM = [248, 240, 225];
const CREAM_MID = [230, 217, 195];
const CREAM_DEEP = [199, 184, 160];
const AMBER = [226, 156, 60];
const AMBER_DEEP = [166, 99, 34];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Rounded-rectangle test, in the squircle-ish style of platform icons. */
function inRounded(x, y, x0, y0, w, h, r) {
  const dx = Math.max(x0 + r - x, x - (x0 + w - r), 0);
  const dy = Math.max(y0 + r - y, y - (y0 + h - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CREASE = 512;
const SHEET = { left: 262, right: 762, top: 196, bottom: 826 };

/**
 * The sheet's silhouette. Its top and bottom edges are pulled in towards the
 * crease, the way a folded sheet pinches at the spine — that waist is the
 * detail that reads as paper rather than as a rectangle.
 */
function inSheet(x, y) {
  if (x < SHEET.left || x > SHEET.right) return false;
  const pinch = 18 * Math.exp(-(((x - CREASE) / 88) ** 2));
  return y > SHEET.top + pinch && y < SHEET.bottom - pinch;
}

// Bookmark ribbon, notched at the bottom, tucked against the fold. Its width
// is set by the smallest size that matters: below about 90px here it thins to
// a single pixel in a 32px icon and disappears.
const RIBBON = [
  [566, 196],
  [664, 196],
  [664, 446],
  [615, 404],
  [566, 456],
];

function colorAt(x, y) {
  // Outside the icon shape entirely — transparent, so `tauri icon` can apply
  // each platform's own masking.
  if (!inRounded(x, y, 0, 0, SIZE, SIZE, 224)) return null;

  if (inPolygon(x, y, RIBBON)) {
    return mix(AMBER, AMBER_DEEP, clamp01((y - 196) / 250));
  }

  if (inSheet(x, y)) {
    const fromCrease = x - CREASE;
    // A dark hairline with a lit edge beside it is the whole illusion of a fold.
    if (fromCrease > 0 && fromCrease < 5) return mix(CREAM_DEEP, INK, 0.26);
    if (fromCrease <= 0 && fromCrease > -7) return CREAM;
    const shade = fromCrease > 0 ? 0.32 : 0.06;
    return mix(CREAM, CREAM_MID, shade + clamp01((y - SHEET.top) / 640) * 0.22);
  }

  // Warm ground with a halo behind the sheet.
  const base = mix(INK_TOP, INK, clamp01(y / SIZE));
  const halo = clamp01(1 - Math.hypot((x - 490) / 540, (y - 400) / 520));
  return mix(base, AMBER, halo * halo * 0.26);
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const sample = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (sample) {
          r += sample[0];
          g += sample[1];
          b += sample[2];
          a += 255;
        }
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 4;
    const covered = a / 255;
    pixels[i] = covered ? Math.round(r / covered) : 0;
    pixels[i + 1] = covered ? Math.round(g / covered) : 0;
    pixels[i + 2] = covered ? Math.round(b / covered) : 0;
    pixels[i + 3] = Math.round(a / n);
  }
}

// --- minimal PNG writer -----------------------------------------------------

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ~c;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon.png", import.meta.url), png);
console.log("wrote app-icon.png");
