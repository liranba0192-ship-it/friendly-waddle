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

  // background: rounded square (full bleed for maskable)
  const margin = maskable ? 0 : Math.round(size * 0.04);
  const bgRad = maskable ? Math.round(size * 0.0) : Math.round(size * 0.22);
  fillRoundRect(margin, margin, size - margin * 2, size - margin * 2, bgRad, [15, 23, 42, 255]); // slate-900

  // sun
  const sunCx = Math.round(size * 0.34);
  const sunCy = Math.round(size * 0.34);
  const sunR = Math.round(size * 0.11);
  fillCircle(sunCx, sunCy, sunR, [251, 191, 36, 255]); // amber-400
  // rays
  const rayLen = Math.round(size * 0.06);
  const rayW = Math.max(2, Math.round(size * 0.018));
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    for (let t = sunR + rayW; t < sunR + rayW + rayLen; t++) {
      for (let w = -rayW; w <= rayW; w++) {
        const x = Math.round(sunCx + Math.cos(ang) * t - Math.sin(ang) * w * 0.0 + Math.cos(ang + Math.PI / 2) * w);
        const y = Math.round(sunCy + Math.sin(ang) * t + Math.sin(ang + Math.PI / 2) * w);
        set(x, y, 251, 191, 36, 255);
      }
    }
  }

  // document lines (the "briefing")
  const lineColor = [226, 232, 240, 255]; // slate-200
  const accent = [56, 189, 248, 255];     // sky-400
  const lx = Math.round(size * 0.26);
  const lw = Math.round(size * 0.48);
  let ly = Math.round(size * 0.56);
  const lh = Math.max(3, Math.round(size * 0.045));
  const gap = Math.round(size * 0.075);
  fillRoundRect(lx, ly, Math.round(lw * 0.6), lh, lh / 2, accent); ly += gap;
  fillRoundRect(lx, ly, lw, lh, lh / 2, lineColor); ly += gap;
  fillRoundRect(lx, ly, lw, lh, lh / 2, lineColor); ly += gap;
  fillRoundRect(lx, ly, Math.round(lw * 0.75), lh, lh / 2, lineColor);

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
