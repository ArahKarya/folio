// Generates the source app icon (1024x1024 PNG) with no external deps.
// Run: node scripts/make-icon.mjs   ->   app-icon.png
// Then: pnpm tauri icon             ->   src-tauri/icons/*
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const SS = 2; // supersampling factor — cheap antialiasing for the curves

const INK = [23, 19, 15];
const INK_LIGHT = [38, 31, 25];
const GLOW = [193, 133, 62];
const PAGE = [244, 233, 214];
const PAGE_SHADE = [219, 202, 175];
const RULE = [188, 170, 143];
const AMBER = [225, 162, 74];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Rounded-rectangle coverage test in the squircle-ish style of platform icons. */
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

// An open book seen slightly from above: the two page blocks fan out from a
// centre spine, so the silhouette reads as "book" even at 32px.
const LEFT_PAGE = [
  [212, 372],
  [502, 322],
  [502, 726],
  [212, 686],
];
const RIGHT_PAGE = [
  [522, 322],
  [812, 372],
  [812, 686],
  [522, 726],
];
const LEFT_EDGE = [
  [212, 686],
  [502, 726],
  [502, 756],
  [212, 716],
];
const RIGHT_EDGE = [
  [522, 726],
  [812, 686],
  [812, 716],
  [522, 756],
];

/** Text rules: shorter towards the outer edge so the pages look typeset. */
const RULES = [];
for (let i = 0; i < 7; i++) {
  const t = i / 6;
  const y = 400 + i * 44;
  const inset = 30 + t * 18;
  RULES.push({ side: -1, y: y - t * 8, x0: 250 + inset * 0.4, x1: 470 });
  RULES.push({ side: 1, y: y - t * 8, x0: 554, x1: 774 - inset * 0.4 });
}

function colorAt(x, y) {
  // Outside the icon shape entirely — fully transparent so `tauri icon` can
  // apply each platform's own masking.
  if (!inRounded(x, y, 0, 0, SIZE, SIZE, 224)) return null;

  const vertical = clamp01(y / SIZE);
  let color = mix(INK_LIGHT, INK, vertical);

  // Warm halo behind the book, strongest just above the spine.
  const dx = (x - 512) / 470;
  const dy = (y - 500) / 430;
  const halo = clamp01(1 - Math.sqrt(dx * dx + dy * dy));
  color = mix(color, GLOW, halo * halo * 0.34);

  if (inPolygon(x, y, LEFT_EDGE) || inPolygon(x, y, RIGHT_EDGE)) return PAGE_SHADE;

  const onLeft = inPolygon(x, y, LEFT_PAGE);
  const onRight = inPolygon(x, y, RIGHT_PAGE);
  if (onLeft || onRight) {
    // Pages darken towards the spine, which is what sells the fold.
    const toSpine = clamp01(1 - Math.abs(x - 512) / 300);
    let page = mix(PAGE, PAGE_SHADE, toSpine * 0.55);
    for (const rule of RULES) {
      const side = onLeft ? -1 : 1;
      if (rule.side !== side) continue;
      if (x >= rule.x0 && x <= rule.x1 && Math.abs(y - rule.y) <= 7) {
        page = mix(page, RULE, 0.85);
      }
    }
    return page;
  }

  // The spine itself: a warm amber wedge in the gap between the page blocks.
  if (x > 494 && x < 530 && y > 322 && y < 792) {
    const t = clamp01((y - 322) / 470);
    return mix(AMBER, mix(AMBER, INK, 0.45), t);
  }

  return color;
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
