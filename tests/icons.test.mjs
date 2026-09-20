import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Decodifica un PNG RGB/RGBA de 8 bits sin entrelazar. */
function leerPng(ruta) {
  const buf = readFileSync(ruta);
  assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${ruta} no es un PNG`);

  let pos = 8;
  let ancho = 0, alto = 0, canales = 4;
  const trozos = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.toString('ascii', pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      assert.equal(datos[8], 8, 'se esperaban 8 bits por canal');
      assert.equal(datos[12], 0, 'no se soporta entrelazado');
      canales = datos[9] === 6 ? 4 : datos[9] === 2 ? 3 : 0;
      assert.ok(canales, `tipo de color no soportado: ${datos[9]}`);
    } else if (tipo === 'IDAT') trozos.push(datos);
    else if (tipo === 'IEND') break;
    pos += 12 + largo;
  }

  const crudo = inflateSync(Buffer.concat(trozos));
  const bpp = canales;
  const pixeles = Buffer.alloc(ancho * alto * canales);
  let off = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[off++];
    const linea = crudo.subarray(off, off + ancho * bpp);
    off += ancho * bpp;
    const destino = y * ancho * bpp;
    for (let x = 0; x < ancho * bpp; x++) {
      const a = x >= bpp ? pixeles[destino + x - bpp] : 0;
      const b = y > 0 ? pixeles[destino - ancho * bpp + x] : 0;
      const c = x >= bpp && y > 0 ? pixeles[destino - ancho * bpp + x - bpp] : 0;
      let v = linea[x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixeles[destino + x] = v & 0xff;
    }
  }
  const en = (x, y) => {
    const i = (y * ancho + x) * canales;
    return { r: pixeles[i], g: pixeles[i + 1], b: pixeles[i + 2], a: canales === 4 ? pixeles[i + 3] : 255 };
  };
  return { ancho, alto, canales, en, pixeles };
}

const luz = (p) => (p.r + p.g + p.b) / 3;

for (const tamano of [192, 512]) {
  const ruta = join(RAIZ, `icons/icon-${tamano}.png`);

  test(`icon-${tamano}.png tiene el tamaño declarado en el manifest`, () => {
    const img = leerPng(ruta);
    assert.equal(img.ancho, tamano);
    assert.equal(img.alto, tamano);
  });

  // Este es el que importa: una vez el rasterizador perdió el rectángulo de
  // fondo y el ícono salió casi blanco. El archivo seguía siendo un PNG
  // válido del tamaño correcto, así que sólo mirar los metadatos no alcanza.
  test(`icon-${tamano}.png tiene fondo oscuro, no blanco`, () => {
    const img = leerPng(ruta);
    const medio = Math.floor(tamano / 2);
    const arriba = img.en(medio, Math.floor(tamano * 0.08));
    const abajo = img.en(medio, Math.floor(tamano * 0.92));
    assert.ok(luz(arriba) < 80, `el borde superior salió claro (luz ${Math.round(luz(arriba))})`);
    assert.ok(luz(abajo) < 80, `el borde inferior salió claro (luz ${Math.round(luz(abajo))})`);
    assert.ok(arriba.a > 200, 'el fondo no puede ser transparente');
  });

  test(`icon-${tamano}.png conserva la diana y la flecha`, () => {
    const img = leerPng(ruta);
    let claros = 0;
    let rojos = 0;
    let oscuros = 0;
    for (let y = 0; y < tamano; y += 2) {
      for (let x = 0; x < tamano; x += 2) {
        const p = img.en(x, y);
        if (luz(p) > 200) claros++;
        else if (p.r > 150 && p.g < 90 && p.b < 90) rojos++;
        else if (luz(p) < 80) oscuros++;
      }
    }
    const total = claros + rojos + oscuros;
    assert.ok(claros / total > 0.05, `los anillos claros casi no aparecen (${Math.round(claros / total * 100)}%)`);
    assert.ok(rojos / total > 0.02, `la flecha roja casi no aparece (${Math.round(rojos / total * 100)}%)`);
    assert.ok(oscuros / total > 0.4, `el fondo oscuro ocupa muy poco (${Math.round(oscuros / total * 100)}%)`);
  });
}

test('el manifest declara los íconos que existen', () => {
  const manifest = JSON.parse(readFileSync(join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  for (const icono of manifest.icons) {
    assert.doesNotThrow(() => readFileSync(join(RAIZ, icono.src)), `falta ${icono.src}`);
    if (icono.src.endsWith('.png')) {
      const img = leerPng(join(RAIZ, icono.src));
      const [w] = icono.sizes.split('x').map(Number);
      assert.equal(img.ancho, w, `${icono.src} dice ${icono.sizes} pero mide ${img.ancho}`);
    }
  }
});
