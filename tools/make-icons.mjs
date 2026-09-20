// Genera los PNG del manifest a partir de una figura vectorial, sin dependencias.
// Los PNG no se versionan: se generan al arrancar (`npm start`) y en el deploy.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/**
 * El logo: una diana con una flecha clavada en el centro. Es el mismo dibujo
 * que icons/icon.svg, resuelto con geometría para poder rasterizarlo sin
 * depender de un motor de SVG.
 */

/** Pasa un punto de la pantalla al eje de la flecha (rotado 45° hacia arriba). */
function aEjeFlecha(x, y, cx, cy) {
  const dx = x - cx;
  const dy = y - cy;
  const k = Math.SQRT1_2;
  return { x: k * dx - k * dy, y: k * dx + k * dy };
}

function enTriangulo(p, a, b, c) {
  const signo = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = signo(p, a, b);
  const d2 = signo(p, b, c);
  const d3 = signo(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function enPoligono(p, puntos) {
  let dentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [xi, yi] = puntos[i];
    const [xj, yj] = puntos[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/**
 * ¿Este punto cae sobre la flecha? `margen` la engorda, que es como se
 * consigue el corte de los anillos por donde la flecha entra.
 */
function enFlecha(p, margen = 0) {
  const m = margen;
  const punta = enTriangulo(p, { x: -m, y: 0 }, { x: 88 + m, y: 42 + m }, { x: 88 + m, y: -42 - m });
  const astil = p.x >= 74 - m && p.x <= 200 + m && Math.abs(p.y) <= 16 + m;
  const cola = enPoligono(p, [
    [188 - m, -36 - m], [262 + m, -36 - m], [224 + m, 0], [262 + m, 36 + m], [188 - m, 36 + m],
  ]);
  return punta || astil || cola;
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
  const SS = 2;                 // supermuestreo para bordes suaves
  const k = size / 512;         // el diseño está pensado sobre 512
  const cx = 240 * k;
  const cy = 280 * k;
  const radio = size * 0.22;    // esquinas redondeadas
  const ROJO = [251, 77, 84];
  const BLANCO = [241, 245, 255];

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0;                 // filtro "none"
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;

          const ox = fx < radio ? radio : fx > size - radio ? size - radio : fx;
          const oy = fy < radio ? radio : fy > size - radio ? size - radio : fy;
          if (Math.hypot(fx - ox, fy - oy) > radio) continue;

          const gradiente = fy / size;
          let color = [
            27 + (1 - gradiente) * 10,
            36 + (1 - gradiente) * 14,
            80 - gradiente * 30,
          ];

          const dist = Math.hypot(fx - cx, fy - cy) / k;   // en unidades del diseño
          const local = aEjeFlecha(fx / k, fy / k, 240, 280);

          // Anillos claros, recortados por donde pasa la flecha.
          const enAnillo = Math.abs(dist - 158) <= 20 || Math.abs(dist - 96) <= 20;
          if (enAnillo && !enFlecha(local, 17)) color = BLANCO;

          if (dist <= 50) color = ROJO;                     // centro
          if (enFlecha(local)) color = ROJO;                // flecha

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
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
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
