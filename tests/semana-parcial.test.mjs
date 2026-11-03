import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diasDeLaVentana, resumenSemanal } from '../js/analisis.js';
import { derive, isScheduled } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

const vista = readFileSync('js/views/stats.js', 'utf8');

/* ---------------------------------------------------------------------------
   Cuántos días mide cada lado
   --------------------------------------------------------------------------- */

test('la ventana crece con la semana', () => {
  assert.equal(diasDeLaVentana('2026-11-02', '2026-11-02'), 1, 'el lunes se mide contra el lunes');
  assert.equal(diasDeLaVentana('2026-11-02', '2026-11-03'), 2);
  assert.equal(diasDeLaVentana('2026-11-02', '2026-11-07'), 6);
  assert.equal(diasDeLaVentana('2026-11-02', '2026-11-08'), 7, 'el domingo ya es la semana entera');
});

test('una semana que ya cerró se mide entera', () => {
  assert.equal(diasDeLaVentana('2026-10-26', '2026-11-03'), 7);
  assert.equal(diasDeLaVentana('2026-11-02', null), 7, 'sin fecha, la semana entera');
  // Una semana que todavía no empezó tampoco se recorta a cero.
  assert.equal(diasDeLaVentana('2026-11-09', '2026-11-03'), 7);
});

/* ---------------------------------------------------------------------------
   El caso que lo destapó: martes a la mañana
   --------------------------------------------------------------------------- */

function conPiano(entries, hoy) {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'piano');
  return derive({ activities: acts, entries, unlocked: {}, settings: {} }, hoy);
}

test('un martes no compara día y medio contra una semana entera', () => {
  // Treinta minutos por día, todos los días, las dos semanas: el martes a la
  // mañana vas exactamente igual que la semana pasada. Con siete contra siete
  // la tarjeta anunciaba un derrumbe de cinco días que no ocurrió.
  const entries = {};
  for (let d = 26; d <= 31; d++) entries[`2026-10-${d}`] = { piano: { value: 30 } };
  entries['2026-11-01'] = { piano: { value: 30 } };
  for (const d of ['2026-11-02', '2026-11-03']) entries[d] = { piano: { value: 30 } };

  const state = conPiano(entries, '2026-11-03');
  const r = resumenSemanal(state, '2026-11-02', { tocaba: isScheduled, hoy: '2026-11-03' });

  assert.equal(r.diasComparados, 2);
  assert.equal(r.parcial, true);
  const piano = r.porActividad.find((x) => x.id === 'piano');
  assert.equal(piano.total, 60, 'lunes y martes de esta semana');
  assert.equal(piano.totalAnterior, 60, 'lunes y martes de la anterior, no los siete días');
  assert.equal(piano.delta, 0, 'ir igual tiene que dar cero');
  assert.equal(r.peor, null, 'anunció una caída donde no hubo ninguna');
});

test('la caída de verdad sigue apareciendo', () => {
  // Misma semana, pero esta vez el lunes y el martes rindieron la mitad.
  const entries = {};
  for (let d = 26; d <= 31; d++) entries[`2026-10-${d}`] = { piano: { value: 30 } };
  entries['2026-11-01'] = { piano: { value: 30 } };
  for (const d of ['2026-11-02', '2026-11-03']) entries[d] = { piano: { value: 15 } };

  const r = resumenSemanal(conPiano(entries, '2026-11-03'), '2026-11-02',
    { tocaba: isScheduled, hoy: '2026-11-03' });
  assert.equal(r.peor?.id, 'piano');
  assert.equal(r.peor.total, 30);
  assert.equal(r.peor.totalAnterior, 60);
});

test('lo que todavía no pasó no cuenta de ningún lado', () => {
  // Un miércoles enorme de la semana pasada no puede hundir un martes.
  const entries = {
    '2026-10-26': { piano: { value: 30 } },
    '2026-10-27': { piano: { value: 30 } },
    '2026-10-28': { piano: { value: 600 } },
    '2026-11-02': { piano: { value: 30 } },
    '2026-11-03': { piano: { value: 30 } },
  };
  const r = resumenSemanal(conPiano(entries, '2026-11-03'), '2026-11-02',
    { tocaba: isScheduled, hoy: '2026-11-03' });
  const piano = r.porActividad.find((x) => x.id === 'piano');
  assert.equal(piano.totalAnterior, 60, 'se coló un día que todavía no tiene par');
  assert.equal(r.peor, null);
});

test('la XP se compara con la misma ventana', () => {
  const entries = {};
  for (let d = 26; d <= 31; d++) entries[`2026-10-${d}`] = { piano: { value: 30 } };
  entries['2026-11-01'] = { piano: { value: 30 } };
  for (const d of ['2026-11-02', '2026-11-03']) entries[d] = { piano: { value: 30 } };
  const state = conPiano(entries, '2026-11-03');

  const r = resumenSemanal(state, '2026-11-02', { tocaba: isScheduled, hoy: '2026-11-03' });
  const delLunes = state.daily.get('2026-10-26')?.xp || 0;
  const delMartes = state.daily.get('2026-10-27')?.xp || 0;
  assert.equal(r.xpAnterior, delLunes + delMartes,
    'el lado viejo todavía suma días que no tienen par de este lado');

  // Lo mismo sin decirle qué día es: vuelve a los siete días, que es lo que
  // hacía antes y es el bug. Sirve de testigo de que el arreglo mueve algo.
  const aCiegas = resumenSemanal(state, '2026-11-02', { tocaba: isScheduled });
  assert.ok(aCiegas.xpAnterior > r.xpAnterior * 2,
    'comparar a ciegas tendría que traer una semana entera de XP vieja');

  // Yendo al mismo ritmo, la diferencia queda chica. No da cero exacto porque
  // la racha es más larga y el mismo rato paga un poco más de bonus.
  assert.ok(r.deltaXp >= 0 && r.deltaXp < delLunes,
    `yendo igual, la diferencia no puede valer un día entero (dio ${r.deltaXp})`);
});

test('lo agendado cuenta lo que ya venció, no lo que falta', () => {
  // El piano toca lunes, viernes, sábado y domingo. Un martes van vencidos
  // el lunes y nada más: decir que tenías cuatro sesiones agendadas es
  // reprocharte tres que todavía no llegaron.
  const entries = { '2026-11-02': { piano: { value: 30 } } };
  const r = resumenSemanal(conPiano(entries, '2026-11-03'), '2026-11-02',
    { tocaba: isScheduled, hoy: '2026-11-03' });
  const piano = r.porActividad.find((x) => x.id === 'piano');
  assert.equal(piano.agendados, 1, 'cuenta días que todavía no llegaron');
  assert.equal(piano.cumplidos, 1);
});

test('un día libre que todavía no llegó no se cuenta como gastado', () => {
  // Declarás libre el viernes. Un martes todavía no lo usaste.
  const entries = { '2026-11-02': { piano: { value: 30 } } };
  const state = conPiano(entries, '2026-11-03');
  const libre = (f) => f === '2026-11-06';
  const r = resumenSemanal(state, '2026-11-02', { libre, tocaba: isScheduled, hoy: '2026-11-03' });
  assert.equal(r.diasLibres, 0, 'contó un día libre del futuro');

  // El domingo, con la semana entera a la vista, sí está gastado.
  const cerrada = resumenSemanal(conPiano(entries, '2026-11-08'), '2026-11-02',
    { libre, tocaba: isScheduled, hoy: '2026-11-08' });
  assert.equal(cerrada.diasLibres, 1);
});

test('la semana cerrada se sigue midiendo entera', () => {
  const entries = {};
  for (let d = 26; d <= 31; d++) entries[`2026-10-${d}`] = { piano: { value: 30 } };
  entries['2026-11-01'] = { piano: { value: 30 } };

  // Un lunes, mirando la semana que cerró: siete días de los dos lados.
  const r = resumenSemanal(conPiano(entries, '2026-11-02'), '2026-10-26',
    { tocaba: isScheduled, hoy: '2026-11-02' });
  assert.equal(r.diasComparados, 7);
  assert.equal(r.parcial, false);
  assert.equal(r.porActividad.find((x) => x.id === 'piano').total, 210, 'siete días de 30');
});

/* ---------------------------------------------------------------------------
   Que la pantalla no vuelva a comparar a ciegas
   --------------------------------------------------------------------------- */

test('la tarjeta le dice a resumenSemanal qué día es hoy', () => {
  assert.match(vista, /resumenSemanal\(state, lunes, \{[^}]*hoy: state\.today/,
    'la tarjeta volvió a pedir el resumen sin la fecha: compararía siete contra siete');
});

test('la tarjeta dice contra qué ventana compara', () => {
  // Un "-3.272" sin decir que son dos días contra dos no se puede creer.
  assert.ok(vista.includes('r.parcial'), 'la etiqueta no distingue la semana en curso');
  assert.match(vista, /vs\. el mismo día/, 'falta el caso de un solo día');
  assert.match(vista, /vs\. mismos \$\{r\.diasComparados\} días/, 'falta la ventana en la etiqueta');
});
