import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ventanaCerrada, resumenDeVentana, VENTANA_CORTA } from '../js/analisis.js';
import { derive, isScheduled } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';
import { addDays, weekStart } from '../js/utils.js';

// Sin comentarios: una guarda que se conforma con encontrar el texto en una
// explicación pasa aunque la pantalla no diga nada. Ya nos pasó.
const vista = readFileSync('js/views/stats.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/* ---------------------------------------------------------------------------
   La ventana
   --------------------------------------------------------------------------- */

test('la ventana son los siete días cerrados que terminan ayer', () => {
  const v = ventanaCerrada('2026-11-03');
  assert.equal(v.length, VENTANA_CORTA);
  assert.equal(v[0], '2026-10-27');
  assert.equal(v[6], '2026-11-02');
  assert.ok(!v.includes('2026-11-03'), 'hoy está a medias: no puede entrar');
});

test('la ventana mide igual cualquier día de la semana', () => {
  for (let i = 0; i < 14; i++) {
    const hoy = addDays('2026-11-01', i);
    assert.equal(ventanaCerrada(hoy).length, 7, `el ${hoy} midió distinto`);
  }
});

test('un lunes la ventana es la semana que acaba de cerrar', () => {
  // Por eso el caso especial del lunes en la vista ya no hace falta: sale solo.
  const lunes = '2026-11-02';
  assert.equal(new Date(`${lunes}T00:00:00Z`).getUTCDay(), 1);
  const v = ventanaCerrada(lunes);
  assert.equal(v[0], weekStart(addDays(lunes, -7)));
  assert.equal(v[6], addDays(lunes, -1));
});

test('lleva un día de cada clase, así que lo agendado queda parejo', () => {
  // El gimnasio toca lunes, miércoles y viernes. Las tres sesiones están de
  // los dos lados, se mire el día que se mire.
  const esGym = (f) => [1, 3, 5].includes(new Date(`${f}T00:00:00Z`).getUTCDay());
  for (let i = 0; i < 7; i++) {
    const hoy = addDays('2026-11-02', i);
    const v = ventanaCerrada(hoy);
    const previa = v.map((d) => addDays(d, -7));
    assert.equal(v.filter(esGym).length, 3, `el ${hoy} la ventana no trae tres días de gimnasio`);
    assert.equal(previa.filter(esGym).length, 3);
  }
});

/* ---------------------------------------------------------------------------
   Lo que destapó el modelo anterior
   --------------------------------------------------------------------------- */

function conPiano(entries, hoy) {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'piano');
  return derive({ activities: acts, entries, unlocked: {}, settings: {} }, hoy);
}

/** Diez semanas parejas, y hoy a media mañana. */
function parejo(hoy, valorDeHoy = 15) {
  const entries = {};
  for (let i = 1; i <= 70; i++) entries[addDays(hoy, -i)] = { piano: { value: 30 } };
  entries[hoy] = { piano: { value: valorDeHoy } };
  return entries;
}

test('yendo igual, la diferencia es cero cualquier día de la semana', () => {
  // Esto es lo que el modelo anterior no podía: con la semana en curso daba
  // -55% un lunes y -8% un domingo, yendo exactamente igual. Nunca cero.
  for (let i = 0; i < 7; i++) {
    const hoy = addDays('2026-11-02', i);
    const r = resumenDeVentana(conPiano(parejo(hoy), hoy), hoy, { tocaba: isScheduled });
    const piano = r.porActividad.find((x) => x.id === 'piano');
    assert.equal(piano.delta, 0, `el ${hoy} marcó una diferencia que no existe`);
    assert.equal(r.peor, null, `el ${hoy} anunció una caída inventada`);
    assert.equal(r.mejor, null);
  }
});

test('el día de hoy no empuja para ningún lado', () => {
  // Media mañana o medianoche de un día enorme: la ventana no se mueve.
  const hoy = '2026-11-03';
  const flojo = resumenDeVentana(conPiano(parejo(hoy, 0), hoy), hoy, { tocaba: isScheduled });
  const enorme = resumenDeVentana(conPiano(parejo(hoy, 600), hoy), hoy, { tocaba: isScheduled });
  assert.equal(flojo.porActividad.find((x) => x.id === 'piano').total,
    enorme.porActividad.find((x) => x.id === 'piano').total,
    'hoy se coló en la cuenta');
  assert.equal(flojo.deltaXp, enorme.deltaXp);
});

test('la ventana previa arranca donde termina la de ahora', () => {
  // Con todos los días iguales, correr la ventana previa un día no cambia
  // nada y el error pasa desapercibido. Un día distinto la delata: el 26 de
  // octubre es el último de la previa, y tiene que estar adentro.
  const hoy = '2026-11-03';
  const entries = parejo(hoy);
  entries['2026-10-26'] = { piano: { value: 300 } };
  const r = resumenDeVentana(conPiano(entries, hoy), hoy, { tocaba: isScheduled });
  const piano = r.porActividad.find((x) => x.id === 'piano');
  assert.equal(piano.totalAnterior, 6 * 30 + 300,
    'la ventana previa no termina pegada a la de ahora');
  assert.equal(piano.total, 7 * 30, 'y la de ahora no tiene por qué haberse movido');
});

test('la caída de verdad sigue apareciendo', () => {
  const hoy = '2026-11-03';
  const entries = parejo(hoy);
  // Los últimos siete días cerrados, a la mitad.
  for (const d of ventanaCerrada(hoy)) entries[d] = { piano: { value: 15 } };
  const r = resumenDeVentana(conPiano(entries, hoy), hoy, { tocaba: isScheduled });
  assert.equal(r.peor?.id, 'piano');
  assert.equal(r.peor.total, 105);
  assert.equal(r.peor.totalAnterior, 210);
});

test('y la subida también', () => {
  const hoy = '2026-11-03';
  const entries = parejo(hoy);
  for (const d of ventanaCerrada(hoy)) entries[d] = { piano: { value: 60 } };
  const r = resumenDeVentana(conPiano(entries, hoy), hoy, { tocaba: isScheduled });
  assert.equal(r.mejor?.id, 'piano');
  assert.equal(r.mejor.total, 420);
  assert.equal(r.peor, null);
});

test('lo agendado y los días libres salen de la ventana, no del calendario', () => {
  const hoy = '2026-11-03';
  const entries = parejo(hoy);
  // El piano toca lunes, viernes, sábado y domingo: cuatro por ventana.
  const r = resumenDeVentana(conPiano(entries, hoy), hoy, { tocaba: isScheduled });
  assert.equal(r.porActividad.find((x) => x.id === 'piano').agendados, 4);

  // Un día libre dentro de la ventana cuenta; hoy, aunque esté declarado, no.
  const dentro = resumenDeVentana(conPiano(entries, hoy), hoy,
    { libre: (f) => f === '2026-10-30', tocaba: isScheduled });
  assert.equal(dentro.diasLibres, 1);
  const esHoy = resumenDeVentana(conPiano(entries, hoy), hoy,
    { libre: (f) => f === hoy, tocaba: isScheduled });
  assert.equal(esHoy.diasLibres, 0, 'contó un día libre de hoy, que no está en la ventana');
});

test('una ventana sin nada no finge que pasó algo', () => {
  const state = conPiano({}, '2026-11-03');
  assert.equal(resumenDeVentana(state, '2026-11-03', { tocaba: isScheduled }).vacia, true);
});

/* ---------------------------------------------------------------------------
   La pantalla
   --------------------------------------------------------------------------- */

test('la tarjeta ya no trata al lunes como un caso especial', () => {
  // Era un parche sobre la cuenta; la ventana móvil lo vuelve innecesario.
  assert.ok(!/dow === 1/.test(vista), 'volvió el caso especial del lunes');
  assert.ok(!vista.includes('resumenSemanal'), 'volvió el resumen por semana calendaria');
});

test('la tarjeta dice las dos ventanas y que hoy no cuenta', () => {
  // Un número comparado sin decir contra qué no se puede creer, y sin avisar
  // que hoy no entra, a las once de la noche parece que el día no contó.
  assert.match(vista, /vs\. \$\{rango\(r\.desdeAnterior, r\.hastaAnterior\)\}/,
    'el encabezado dejó de nombrar la ventana con la que compara');
  assert.match(vista, /rango\(r\.desde, r\.hasta\)/, 'el encabezado no dice qué días mide');
  assert.match(vista, /sin contar hoy/, 'no avisa que el día en curso queda afuera');
});
