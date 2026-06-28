// מייצר אייקוני PWA פשוטים (ריבוע בצבע המותג עם "מ" לבן) כ-PNG, ללא תלויות.
// הרצה: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// צבע המותג ולוגו פשוט: רקע כחול, ריבוע פנימי לבן (סמל גנרי)
const BG = [31, 111, 235]; // #1f6feb
const FG = [255, 255, 255];

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const inset = Math.floor(size * 0.28);
  const bar = Math.floor(size * 0.1);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      // צורת "קו צנרת" לבן פשוט: שני קווים מצטלבים
      const onH = y > size / 2 - bar / 2 && y < size / 2 + bar / 2 && x > inset && x < size - inset;
      const onV = x > size / 2 - bar / 2 && x < size / 2 + bar / 2 && y > inset && y < size - inset;
      const c = onH || onV ? FG : BG;
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
      raw[off + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size));
  console.log(`wrote icon-${size}.png`);
}
