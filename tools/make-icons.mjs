// Genera los PNG del manifest a partir de una figura vectorial, sin dependencias.
// Los PNG no se versionan: se generan al arrancar (`npm start`) y en el deploy.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

function starPoints(cx, cy, rOuter, rInner, points = 5, rot = -Math.PI / 2) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (i * Math.PI) / points;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) hit = !hit;
  }
  return hit;
}

function chunk(tag, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let table = null;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function render(size) {
  const SS = 2; // supermuestreo para bordes suaves
  const star = starPoints(size / 2, size * 0.44, size * 0.3, size * 0.135);
  const [barY0, barY1] = [size * 0.76, size * 0.84];
  const [barX0, barX1] = [size * 0.22, size * 0.78];
  const fillX1 = barX0 + (barX1 - barX0) * 0.62;
  const radius = size * 0.22;
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const ox = fx < radius ? radius : fx > size - radius ? size - radius : fx;
          const oy = fy < radius ? radius : fy > size - radius ? size - radius : fy;
          if (Math.hypot(fx - ox, fy - oy) > radius) continue; // esquina redondeada
          const t = fx / size;
          const gradient = fy / size;
          let color = [27 + (1 - gradient) * 10, 36 + (1 - gradient) * 14, 80 - gradient * 30];
          const accent = [56 + 150 * t, 189 - 40 * t, 248 - 20 * t];
          if (inside(star, fx, fy)) color = accent;
          else if (fy >= barY0 && fy <= barY1 && fx >= barX0 && fx <= barX1) {
            color = fx <= fillX1 ? accent : [12, 18, 40];
          }
          r += color[0]; g += color[1]; b += color[2]; a += 255;
        }
      }
      const n = SS * SS;
      const o = 1 + x * 4;
      row[o] = r / n; row[o + 1] = g / n; row[o + 2] = b / n; row[o + 3] = a / n;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`✔ ${file}`);
}
