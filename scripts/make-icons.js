// Generate PNG icons for the extension at 16, 48, and 128 px.
// Pure Node, no dependencies. Salesforce-blue tile, white cloud, blue "fx".

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "addon", "icons");
mkdirSync(outDir, { recursive: true });

const SF_BLUE = [0x00, 0x70, 0xd2];
const WHITE = [0xff, 0xff, 0xff];
const ALPHA = 0xff;

const GLYPHS = {
  f: [
    "01110",
    "10000",
    "10000",
    "11100",
    "10000",
    "10000",
    "10000",
  ],
  x: [
    "00000",
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
    "00000",
  ],
};

// Soft cloud blob from overlapping circles (normalized coords, center 0,0).
const CLOUD_CIRCLES = [
  { x: -0.34, y: 0.1, r: 0.3 },
  { x: 0, y: -0.14, r: 0.34 },
  { x: 0.34, y: 0.1, r: 0.3 },
  { x: -0.14, y: 0.26, r: 0.24 },
  { x: 0.18, y: 0.26, r: 0.24 },
];

function inCloud(nx, ny) {
  for (const c of CLOUD_CIRCLES) {
    const dx = nx - c.x;
    const dy = ny - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

function inRoundedTile(px, py, size, radius) {
  const r = Math.min(radius, size / 2);
  if (px < r && py < r) {
    return (px - r) ** 2 + (py - r) ** 2 <= r * r;
  }
  if (px >= size - r && py < r) {
    return (px - (size - r)) ** 2 + (py - r) ** 2 <= r * r;
  }
  if (px < r && py >= size - r) {
    return (px - r) ** 2 + (py - (size - r)) ** 2 <= r * r;
  }
  if (px >= size - r && py >= size - r) {
    return (px - (size - r)) ** 2 + (py - (size - r)) ** 2 <= r * r;
  }
  return true;
}

function inFxGlyph(px, py, size) {
  const scale = Math.max(1, Math.floor(size / 14));
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const gap = Math.max(1, scale - 1);
  const totalW = glyphW * 2 + gap;
  const offsetX = Math.floor((size - totalW) / 2);
  const offsetY = Math.floor((size - glyphH) / 2) + Math.floor(scale * 0.35);

  const checkGlyph = (rows, gx) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] !== "1") continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = offsetX + gx + c * scale + dx;
            const y = offsetY + r * scale + dy;
            if (x === px && y === py) return true;
          }
        }
      }
    }
    return false;
  };

  return checkGlyph(GLYPHS.f, 0) || checkGlyph(GLYPHS.x, glyphW + gap);
}

function setPixel(pixels, size, x, y, rgb) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (y * size + x) * 4;
  pixels[idx] = rgb[0];
  pixels[idx + 1] = rgb[1];
  pixels[idx + 2] = rgb[2];
  pixels[idx + 3] = ALPHA;
}

function makePng(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const radius = Math.max(2, Math.floor(size * 0.18));
  const cloudSpan = size * 0.78;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundedTile(x, y, size, radius)) continue;

      const nx = (x - cx) / cloudSpan;
      const ny = (y - cy) / cloudSpan;
      const cloud = inCloud(nx, ny);
      const fx = cloud && inFxGlyph(x, y, size);

      if (fx) {
        setPixel(pixels, size, x, y, SF_BLUE);
      } else if (cloud) {
        setPixel(pixels, size, x, y, WHITE);
      } else {
        setPixel(pixels, size, x, y, SF_BLUE);
      }
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = deflateSync(raw);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const png = makePng(size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
