import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Un módulo que no parsea deja la app en blanco sin decir por qué: el error
// sale en la consola del navegador y en ningún otro lado. Los tests no lo
// veían porque sólo importaban los módulos que usaban.

function modulos(dir = 'js') {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...modulos(ruta));
    else if (nombre.endsWith('.js')) out.push(ruta);
  }
  return out;
}

const archivos = modulos();
// app.js arranca la aplicación al importarse: toca el DOM, que en Node no
// existe. De ese sólo se comprueba que parsee.
const ENTRADAS = new Set(['js/app.js']);

test('hay módulos para revisar', () => {
  assert.ok(archivos.length >= 15, `encontré ${archivos.length}`);
});

for (const ruta of archivos) {
  test(`${ruta} parsea`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' }),
      `${ruta} tiene un error de sintaxis`);
  });

  if (ENTRADAS.has(ruta)) continue;
  test(`${ruta} se puede importar`, async () => {
    // Importar de verdad detecta lo que parsear no ve: un import a un archivo
    // que no existe, o a un nombre que el otro módulo no exporta.
    await assert.doesNotReject(import(resolve(ruta)), `${ruta} no se pudo cargar`);
  });
}
