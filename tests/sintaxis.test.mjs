import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Importaciones que faltan
//
// Sin bundler ni linter, usar algo que no importaste parsea bien y falla
// recién cuando se dibuja esa pantalla. `plural` en Ajustes pasó los 521
// tests y habría reventado el pie de página en el teléfono.
// ---------------------------------------------------------------------------

/** Lo que el navegador trae puesto y no hace falta importar. */
const GLOBALES = new Set([
  'Array', 'Blob', 'Boolean', 'Date', 'Error', 'File', 'FileReader', 'Image', 'Intl',
  'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'RegExp', 'Set', 'String',
  'Symbol', 'TextDecoder', 'TextEncoder', 'URL', 'WeakMap', 'alert', 'atob', 'btoa',
  'clearInterval', 'clearTimeout', 'confirm', 'console', 'crypto', 'decodeURIComponent',
  'document', 'encodeURIComponent', 'fetch', 'getComputedStyle', 'isFinite', 'isNaN',
  'localStorage', 'matchMedia', 'navigator', 'parseFloat', 'parseInt', 'prompt',
  'queueMicrotask', 'requestAnimationFrame', 'setInterval', 'setTimeout',
  'structuredClone', 'window', 'self', 'import', 'super', 'typeof', 'void', 'return',
  'if', 'for', 'while', 'switch', 'catch', 'function', 'await', 'new', 'delete',
  'yield', 'else', 'do', 'in', 'of', 'case',
  'DataView', 'DecompressionStream', 'Response', 'Uint8Array',
  // Funciones de CSS que viven adentro de un atributo style: no son JavaScript
  // y no se importan de ningún lado.
  'calc', 'rgba', 'rgb', 'var', 'mix', 'gradient', 'clamp', 'translate', 'url',
]);

test('nada se usa sin importarlo', () => {
  for (const ruta of archivos) {
    const src = readFileSync(ruta, 'utf8');
    // Sin comentarios ni cadenas: adentro de un texto no hay llamadas. Las
    // plantillas NO se tocan: adentro de un ${} hay código de verdad, y es
    // justo donde estaba el plural() que se había colado.
    const limpio = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""');

    // Lo que se llama: un nombre con un paréntesis detrás, sin punto delante.
    // Con lookarounds y no con grupos: consumir el espacio de atrás se comía
    // el separador que el identificador siguiente necesitaba delante.
    //
    // El paréntesis tiene que estar PEGADO. Así se escribe una llamada; con
    // un espacio en el medio lo que hay es prosa adentro de una plantilla
    // ("en las mismas condiciones (a la mañana)"), y esas no son llamadas.
    const llamados = new Set(
      [...limpio.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?=\()/g)].map((m) => m[1]),
    );
    // Lo que existe: cualquier aparición que NO sea una llamada —una
    // importación, un const, un parámetro, una desestructuración— más los
    // `function nombre(`, que sólo aparecen pegados a su paréntesis.
    const declarados = new Set([
      ...[...limpio.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?![\w$])(?!\()/g)].map((m) => m[1]),
      ...[...limpio.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      ...[...limpio.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      // Métodos: `constructor(...) {`, que sólo aparecen pegados al paréntesis.
      ...[...limpio.matchAll(/^\s*(?:static\s+|async\s+|get\s+|set\s+|\*)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map((m) => m[1]),
    ]);

    for (const nombre of llamados) {
      if (GLOBALES.has(nombre) || declarados.has(nombre)) continue;
      assert.fail(`${ruta}: usa ${nombre}() y no está importado ni declarado`);
    }
  }
});
