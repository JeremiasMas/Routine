import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraerTabla, entradasDesdeJson, entradasDesdeHtml, detectarEdicion } from '../src/extraer.mjs';
import { cosecharJson, jsonBalanceado, payloadsDeFlight } from '../src/json-embebido.mjs';
import { scripts } from '../src/html.mjs';

const fixture = (nombre) => readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8');

test('lee la tabla desde el JSON que embebe el sitio', () => {
  const tabla = extraerTabla(fixture('tabla-next.html'), 'https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1');
  assert.equal(tabla.fuente, 'json');
  assert.equal(tabla.clave, '9:6:19:1');
  assert.equal(tabla.area, 'Banking & Finance');
  assert.equal(tabla.ubicacion, 'Argentina');
  assert.equal(tabla.guia, 'Latin America');
  assert.equal(tabla.edicion, 2026);
  assert.equal(tabla.entradas.length, 5);

  const ana = tabla.entradas.find((e) => e.nombre === 'Ana Rossi');
  assert.equal(ana.tipo, 'persona');
  assert.equal(ana.banda.etiqueta, 'Star Individuals');
  assert.equal(ana.seccion, 'Ranked Lawyers');
  assert.match(ana.url, /\/lawyer\/ana-rossi-9:19:2001$/);

  const alfa = tabla.entradas.find((e) => e.nombre === 'Estudio Alfa');
  assert.equal(alfa.tipo, 'organizacion');
  assert.equal(alfa.banda.numero, 1);
  assert.equal(alfa.seccion, 'Ranked Firms');
});

test('si no hay JSON, lee el HTML atando cada perfil a su encabezado de banda', () => {
  const tabla = extraerTabla(fixture('tabla-html.html'), 'https://chambers.com/legal-rankings/tax-chile-9:49:37:1');
  assert.equal(tabla.fuente, 'html');
  assert.equal(tabla.ubicacion, 'Chile');
  assert.equal(tabla.edicion, 2026);
  assert.deepEqual(
    tabla.entradas.map((e) => [e.nombre, e.banda.etiqueta]),
    [['Gamma Legal', 'Band 1'], ['Diego Soto', 'Band 1'], ['Elena Vega', 'Band 2'], ['Fabio Luna', 'Associates to Watch']]
  );
  // Un enlace de pie de página no es una fila de ranking.
  assert.ok(!tabla.entradas.some((e) => /methodology/i.test(e.nombre)));
});

test('una página sin filas se declara vacía en vez de inventar', () => {
  const tabla = extraerTabla('<html><head><title>Nada</title></head><body><p>Hola</p></body></html>', 'https://chambers.com/legal-rankings/x-1:2:3:4');
  assert.equal(tabla.fuente, 'vacio');
  assert.equal(tabla.entradas.length, 0);
});

test('el JSON de hidratación de Next también se lee', () => {
  const carga = JSON.stringify('3:' + JSON.stringify({
    sectionName: 'Ranked Lawyers',
    individuals: [{ name: 'Ana Rossi', band: 2, url: '/lawyer/ana-rossi-9:19:2001' }],
  }));
  const html = `<html><body><script>self.__next_f.push([1,${carga}])</script></body></html>`;
  assert.equal(payloadsDeFlight(`self.__next_f.push([1,${carga}])`).length, 1);
  const entradas = entradasDesdeJson(cosecharJson(html, { scripts }));
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].banda.numero, 2);
  assert.equal(entradas[0].seccion, 'Ranked Lawyers');
});

test('el recorte de JSON respeta llaves dentro de comillas', () => {
  const trozos = jsonBalanceado('ruido {"a":{"b":"}"},"c":1} cola [1,2]');
  assert.deepEqual(trozos[0], { a: { b: '}' }, c: 1 });
  assert.deepEqual(trozos[1], [1, 2]);
});

test('una entrada sin banda ni perfil no entra', () => {
  const entradas = entradasDesdeJson([{ menu: [{ name: 'Contacto' }, { name: 'Metodología' }] }]);
  assert.deepEqual(entradas, []);
});

test('la edición sale del título, del JSON o del cuerpo', () => {
  assert.equal(detectarEdicion('<title>Tax, Chile, Latin America 2026</title>'), 2026);
  assert.equal(detectarEdicion('<title>Tax</title>', [{ publicationYear: 2025 }]), 2025);
  assert.equal(detectarEdicion('<html><body><p>Guide 2024</p></body></html>'), 2024);
  assert.equal(detectarEdicion('<html><body>sin nada</body></html>'), null);
});

test('la lectura por HTML no duplica a quien aparece dos veces', () => {
  const html = `<h3>Band 1</h3>
    <a href="/lawyer/ana-rossi-9:19:2001">Ana Rossi</a>
    <a href="/lawyer/ana-rossi-9:19:2001">Ana Rossi</a>`;
  assert.equal(entradasDesdeHtml(html).length, 1);
});
