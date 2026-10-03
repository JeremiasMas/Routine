import test from 'node:test';
import assert from 'node:assert/strict';
import { colorDe, colorDeRango, esCalido, TEMAS, TEMA_POR_DEFECTO } from '../js/theme.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

const deFabrica = (id) => DEFAULT_ACTIVITIES.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// El color de una disciplina
//
// Lo mira la app entera y ahora también los anillos del widget, que es donde
// se notó: un color que no es el que elegiste no da un error, da una pantalla
// que no se parece a la configuración.
// ---------------------------------------------------------------------------

test('en un tema frío manda el color de la actividad', () => {
  const pasos = deFabrica('pasos');
  assert.equal(colorDe(pasos, 'consola'), pasos.color);
  assert.equal(colorDe({ ...pasos, color: '#00ff95' }, 'consola'), '#00ff95');
});

test('en un tema cálido, los colores de fábrica usan la paleta del tema', () => {
  // Están pensados para el tema azul: tal cual desentonarían en uno rojo.
  const pasos = deFabrica('pasos');
  const enBrasa = colorDe(pasos, 'brasa');
  assert.notEqual(enBrasa, pasos.color);
  assert.match(enBrasa, /^#[0-9a-f]{6}$/i);
});

test('pero un color elegido a mano gana en cualquier tema', () => {
  // La paleta del tema está para que lo de fábrica no desentone, no para
  // pisar una decisión. Si elegiste un color, es el que tiene que salir.
  const mio = { ...deFabrica('pasos'), color: '#00ff95' };
  for (const { id } of TEMAS) {
    assert.equal(colorDe(mio, id), '#00ff95', `el tema ${id} pisó el color elegido`);
  }
});

test('una actividad que agregaste vos siempre usa su color', () => {
  // No tiene color de fábrica contra el cual comparar, así que el suyo manda.
  const propia = { id: 'ajedrez', color: '#8b5cf6' };
  assert.equal(colorDe(propia, 'brasa'), '#8b5cf6');
  assert.equal(colorDe(propia, 'consola'), '#8b5cf6');
});

test('todas las de fábrica tienen color en los temas cálidos', () => {
  // Una que se olvide queda con su color frío en un tema rojo: no falla,
  // desentona.
  const calido = TEMAS.map((t) => t.id).find((id) => esCalido(id));
  assert.ok(calido, 'no hay ningún tema cálido');
  for (const a of DEFAULT_ACTIVITIES) {
    assert.notEqual(colorDe(a, calido), a.color,
      `${a.id} no tiene color propio en el tema ${calido}`);
  }
});

test('la basura no revienta', () => {
  assert.equal(colorDe(null, 'brasa'), undefined);
  assert.equal(colorDe({}, 'brasa'), undefined);
  assert.equal(colorDe({ id: 'pasos' }, 'brasa'), colorDe(deFabrica('pasos'), 'brasa'));
  assert.equal(colorDe(deFabrica('pasos'), 'tema-que-no-existe'), deFabrica('pasos').color);
});

test('el tema por defecto es uno de los que existen, y es frío', () => {
  assert.ok(TEMAS.some((t) => t.id === TEMA_POR_DEFECTO));
  assert.equal(esCalido(TEMA_POR_DEFECTO), false);
});

test('el color de un rango no se cae con un índice cualquiera', () => {
  const tier = { color: '#abcdef' };
  assert.equal(colorDeRango(tier, 0, 'consola'), '#abcdef');
  assert.match(colorDeRango(tier, 0, 'brasa'), /^#/);
  assert.match(colorDeRango(tier, 99, 'brasa'), /^#/, 'un índice de más se acota');
  assert.equal(colorDeRango(tier, NaN, 'brasa'), '#abcdef');
});
