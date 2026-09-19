import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(RAIZ, 'sw.js'), 'utf8');

function modulos(dir = 'js', acumulado = []) {
  for (const nombre of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${nombre}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) modulos(rel, acumulado);
    else if (nombre.endsWith('.js')) acumulado.push(rel);
  }
  return acumulado;
}

// Olvidarse de agregar un módulo nuevo acá rompe el modo offline en silencio:
// la app sigue andando con conexión y falla justo cuando no la hay.
test('el service worker cachea todos los módulos de la app', () => {
  const faltantes = modulos().filter((m) => !sw.includes(`'./${m}'`));
  assert.deepEqual(faltantes, [], `sin cachear en sw.js: ${faltantes.join(', ')}`);
});

test('el service worker no lista archivos que ya no existen', () => {
  const listados = [...sw.matchAll(/'\.\/(js\/[^']+\.js)'/g)].map((m) => m[1]);
  const reales = new Set(modulos());
  const sobrantes = listados.filter((m) => !reales.has(m));
  assert.deepEqual(sobrantes, [], `listados pero inexistentes: ${sobrantes.join(', ')}`);
});

test('los archivos base de la app están en la caché', () => {
  for (const archivo of ['./index.html', './css/styles.css', './manifest.webmanifest', './']) {
    assert.ok(sw.includes(`'${archivo}'`), `falta ${archivo} en sw.js`);
  }
});
