// Dependency-free PNG icon generator (uses Node's built-in zlib).
// Draws the HVAC Takeoff Pro mark: a dark slate rounded tile with a stylized
// wall-mounted indoor AC unit and airflow lines beneath it (brand sky-blue).
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const ba = buf[i + 3] / 255;
    const na = a / 255;
    const oa = na + ba * (1 - na);
    if (oa === 0) return;
    buf[i] = Math.round((r * na + buf[i] * ba * (1 - na)) / oa);
    buf[i + 1] = Math.round((g * na + buf[i + 1] * ba * (1 - na)) / oa);
    buf[i + 2] = Math.round((b * na + buf[i + 2] * ba * (1 - na)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };
  const fillRoundRect = (x0, y0, w, h, rad, color) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = x < rad ? rad : x > w - rad ? w - rad : x;
        const cy = y < rad ? rad : y > h - rad ? h - rad : y;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) set(x0 + x, y0 + y, color[0], color[1], color[2], color[3] ?? 255);
      }
    }
  };
  // stroked arc (airflow), angle range in radians, drawn as thick points
  const strokeArc = (cx, cy, rad, a0, a1, thick, color) => {
    const steps = Math.ceil(rad * (a1 - a0));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (a1 - a0) * (s / steps);
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      fillRoundRect(px - thick / 2, py - thick / 2, thick, thick, thick / 2, color);
    }
  };

  // background: slate gradient (full bleed for maskable, rounded otherwise)
  const margin = maskable ? 0 : Math.round(size * 0.04);
  const bgRad = maskable ? 0 : Math.round(size * 0.22);
  const top = [30, 41, 59]; // slate-800
  const bot = [11, 15, 23]; // app backdrop
  const innerW = size - margin * 2, innerH = size - margin * 2;
  for (let y = 0; y < innerH; y++) {
    const f = y / innerH;
    const r = Math.round(top[0] + (bot[0] - top[0]) * f);
    const g = Math.round(top[1] + (bot[1] - top[1]) * f);
    const b = Math.round(top[2] + (bot[2] - top[2]) * f);
    for (let x = 0; x < innerW; x++) {
      const cx = x < bgRad ? bgRad : x > innerW - bgRad ? innerW - bgRad : x;
      const cy = y < bgRad ? bgRad : y > innerH - bgRad ? innerH - bgRad : y;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= bgRad * bgRad) set(margin + x, margin + y, r, g, b, 255);
    }
  }

  const WHITE = [241, 245, 249, 255]; // slate-100
  const SKY = [56, 189, 248, 255]; // brand-400

  // indoor AC unit body (rounded horizontal bar, upper-center)
  const unitW = Math.round(size * 0.56);
  const unitH = Math.round(size * 0.16);
  const unitX = Math.round((size - unitW) / 2);
  const unitY = Math.round(size * 0.27);
  fillRoundRect(unitX, unitY, unitW, unitH, Math.round(unitH * 0.45), WHITE);
  // louver slot (sky) along the bottom of the unit
  const slotH = Math.round(unitH * 0.16);
  fillRoundRect(
    unitX + Math.round(unitW * 0.1),
    unitY + unitH - slotH - Math.round(unitH * 0.18),
    Math.round(unitW * 0.8),
    slotH,
    Math.round(slotH / 2),
    SKY
  );

  // three airflow arcs blowing downward from the unit's center
  const acx = Math.round(size / 2);
  const acy = unitY + unitH + Math.round(size * 0.02);
  const thick = Math.max(2, Math.round(size * 0.022));
  const baseR = Math.round(size * 0.12);
  const a0 = Math.PI * 0.18, a1 = Math.PI * 0.82; // lower arc spanning downward
  for (let i = 0; i < 3; i++) {
    strokeArc(acx, acy, baseR + i * Math.round(size * 0.075), a0, a1, thick, SKY);
  }

  return encodePNG(size, size, buf);
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: true },
  { name: "icon-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
];
for (const t of targets) {
  const png = draw(t.size, { maskable: t.maskable });
  writeFileSync(join(outDir, t.name), png);
  console.log("wrote", t.name, png.length, "bytes");
}
