import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearTabla, urlTabla, claveTabla, cosecharTablas, cosecharGuias,
  cosecharPerfiles, slugEsDelPais, absoluta,
} from '../src/urls.mjs';
import { normalizarBanda, parsearTitulo, aSlug, parsearEdicion, limpiarNombre } from '../src/normalizar.mjs';

test('una URL de tabla se lee con sus cuatro ids', () => {
  const tabla = parsearTabla('https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1?l=en-GB');
  assert.equal(tabla.guiaId, 9);
  assert.equal(tabla.areaId, 6);
  assert.equal(tabla.ubicacionId, 19);
  assert.equal(tabla.subseccionId, 1);
  assert.equal(tabla.clave, '9:6:19:1');
  assert.equal(tabla.slug, 'banking-finance-argentina');
  // La URL canónica se arma de vuelta sin el querystring de idioma.
  assert.equal(tabla.url, 'https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1');
  assert.equal(urlTabla(tabla), tabla.url);
  assert.equal(claveTabla(tabla), '9:6:19:1');
});

test('la misma área en dos guías son dos tablas distintas', () => {
  const global = parsearTabla('/legal-rankings/banking-finance-argentina-2:6:19:1');
  const latam = parsearTabla('/legal-rankings/banking-finance-argentina-9:6:19:1');
  assert.notEqual(global.clave, latam.clave);
});

test('lo que no es una tabla no se confunde con una', () => {
  assert.equal(parsearTabla('https://chambers.com/legal-guide/latin-america-9'), null);
  assert.equal(parsearTabla('https://chambers.com/about-us/methodology'), null);
});

test('las tablas se cosechan de cualquier texto y sin repetir', () => {
  const html = `
    <a href="/legal-rankings/tax-argentina-2:49:19:1">Tax</a>
    <a href="/legal-rankings/tax-argentina-2:49:19:1?l=en-GB">Tax otra vez</a>
    <a href="/legal-rankings/tax-brazil-9:49:22:1">Tax Brasil</a>`;
  const tablas = cosecharTablas(html);
  assert.equal(tablas.length, 2);
  assert.deepEqual(tablas.map((t) => t.clave).sort(), ['2:49:19:1', '9:49:22:1']);
});

test('el filtro por país mira el final del slug', () => {
  assert.ok(slugEsDelPais('banking-finance-argentina', 'argentina'));
  assert.ok(slugEsDelPais('litigation-trial-lawyers-usa-nationwide', 'usa-nationwide'));
  assert.ok(!slugEsDelPais('tax-brazil', 'argentina'));
  // "argentina" no debe colar "argentina-foreign" al revés ni cosas parecidas
  assert.ok(!slugEsDelPais('tax-argentinax', 'argentina'));
});

test('las guías y los perfiles también se cosechan', () => {
  assert.deepEqual(cosecharGuias('<a href="/legal-guide/latin-america-9">x</a>'), [{ slug: 'latin-america', id: 9 }]);
  const perfiles = cosecharPerfiles('<a href="/lawyer/ana-rossi-9:19:2001">a</a><a href="/department/alfa-9:19:1001">b</a>');
  assert.deepEqual(perfiles.map((p) => p.tipo), ['persona', 'organizacion']);
  assert.equal(perfiles[0].perfilId, '9:19:2001');
});

test('los enlaces a otros dominios no se siguen', () => {
  assert.equal(absoluta('https://ejemplo.com/legal-rankings/x-1:2:3:4'), null);
  assert.equal(absoluta('/legal-guide/global-2'), 'https://chambers.com/legal-guide/global-2');
});

test('las bandas se ordenan aunque no sean números', () => {
  assert.equal(normalizarBanda('Band 2').numero, 2);
  assert.ok(normalizarBanda('Star Individuals').orden < normalizarBanda('Band 1').orden);
  assert.ok(normalizarBanda('Band 1').orden < normalizarBanda('Band 3').orden);
  assert.ok(normalizarBanda('Up and Coming').orden > normalizarBanda('Band 6').orden);
  assert.equal(normalizarBanda('Up-and-Coming').etiqueta, 'Up and Coming');
  assert.equal(normalizarBanda('cualquier cosa'), null);
  assert.equal(normalizarBanda('Band 99'), null);
});

test('el título de la página da área, país y guía', () => {
  assert.deepEqual(parsearTitulo('Banking &amp; Finance, Argentina, Latin America | Chambers Rankings'),
    { area: 'Banking & Finance', ubicacion: 'Argentina', guia: 'Latin America' });
  assert.deepEqual(parsearTitulo('Litigation: Trial Lawyers, USA - Nationwide, USA | Chambers Rankings'),
    { area: 'Litigation: Trial Lawyers', ubicacion: 'USA - Nationwide', guia: 'USA' });
  assert.equal(parsearTitulo('Chambers'), null);
});

test('slugs, ediciones y nombres se normalizan', () => {
  assert.equal(aSlug('Banking & Finance'), 'banking-and-finance');
  assert.equal(aSlug('  Córdoba  '), 'cordoba');
  assert.equal(parsearEdicion('Chambers Latin America 2026'), 2026);
  assert.equal(parsearEdicion('sin año'), null);
  assert.equal(limpiarNombre('  Ana&nbsp;Rossi '), 'Ana Rossi');
});
