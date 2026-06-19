// מחולל אייקוני PNG ללא תלויות חיצוניות (משתמש ב-zlib המובנה של Node).
// מצייר אייקון פשוט: רקע כהה מעוגל, "שמש" בוקר, ושלוש שורות טקסט (מסמך בריפינג).
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
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // rows with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha blend over existing
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
        let inside = true;
        // round corners
        const cx = x < rad ? rad : x > w - rad ? w - rad : x;
        const cy = y < rad ? rad : y > h - rad ? h - rad : y;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > rad * rad) inside = false;
        if (inside) set(x0 + x, y0 + y, color[0], color[1], color[2], color[3] ?? 255);
      }
    }
  };
  const fillCircle = (cx, cy, r, color) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r)
          set(cx + x, cy + y, color[0], color[1], color[2], color[3] ?? 255);
  };

  // background: teal gradient (rounded; full bleed for maskable)
  const margin = maskable ? 0 : Math.round(size * 0.04);
  const bgRad = maskable ? 0 : Math.round(size * 0.22);
  const top = [45, 212, 191];   // #2dd4bf
  const bot = [13, 148, 136];   // #0d9488
  const innerX = margin, innerY = margin, innerW = size - margin * 2, innerH = size - margin * 2;
  for (let y = 0; y < innerH; y++) {
    const f = y / innerH;
    const r = Math.round(top[0] + (bot[0] - top[0]) * f);
    const g = Math.round(top[1] + (bot[1] - top[1]) * f);
    const b = Math.round(top[2] + (bot[2] - top[2]) * f);
    for (let x = 0; x < innerW; x++) {
      // rounded corners mask
      const cx = x < bgRad ? bgRad : x > innerW - bgRad ? innerW - bgRad : x;
      const cy = y < bgRad ? bgRad : y > innerH - bgRad ? innerH - bgRad : y;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= bgRad * bgRad) set(innerX + x, innerY + y, r, g, b, 255);
    }
  }

  // white dumbbell (משקולת) — horizontal bar + plates
  const W = [255, 255, 255, 255];
  const cy = Math.round(size * 0.58);
  const barH = Math.round(size * 0.07);
  // center bar
  fillRoundRect(Math.round(size * 0.34), cy - Math.round(barH / 2), Math.round(size * 0.32), barH, Math.round(barH / 2), W);
  // inner plates
  const pW = Math.round(size * 0.065);
  const ipH = Math.round(size * 0.2);
  fillRoundRect(Math.round(size * 0.29), cy - Math.round(ipH / 2), pW, ipH, Math.round(pW / 3), W);
  fillRoundRect(Math.round(size * 0.645), cy - Math.round(ipH / 2), pW, ipH, Math.round(pW / 3), W);
  // outer plates
  const opH = Math.round(size * 0.3);
  fillRoundRect(Math.round(size * 0.2), cy - Math.round(opH / 2), pW, opH, Math.round(pW / 3), W);
  fillRoundRect(Math.round(size * 0.735), cy - Math.round(opH / 2), pW, opH, Math.round(pW / 3), W);

  // leaf (תזונה) — rotated ellipse + stem, growing above the dumbbell
  const fillEllipseRot = (cx, cyy, rx, ry, ang, color) => {
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const R = Math.ceil(Math.max(rx, ry));
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const rxr = x * cos + y * sin, ryr = -x * sin + y * cos;
        if ((rxr / rx) ** 2 + (ryr / ry) ** 2 <= 1) set(Math.round(cx + x), Math.round(cyy + y), color[0], color[1], color[2], 255);
      }
  };
  const leafCx = Math.round(size * 0.5), leafCy = Math.round(size * 0.32);
  // stem
  fillRoundRect(leafCx - Math.round(size * 0.008), leafCy, Math.round(size * 0.016), Math.round(size * 0.12), Math.round(size * 0.008), W);
  // two leaves forming a sprout
  fillEllipseRot(leafCx - Math.round(size * 0.055), leafCy - Math.round(size * 0.01), Math.round(size * 0.085), Math.round(size * 0.04), -Math.PI / 4, W);
  fillEllipseRot(leafCx + Math.round(size * 0.055), leafCy - Math.round(size * 0.01), Math.round(size * 0.085), Math.round(size * 0.04), Math.PI / 4, W);

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
