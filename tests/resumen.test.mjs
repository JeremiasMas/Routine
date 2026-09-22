import test from 'node:test';
import assert from 'node:assert/strict';
import { resumenDelDia, pendientesAAplicar, puedeUnToque, MAX_MISIONES } from '../js/resumen.js';
import { derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

// Un martes: tocan datos, pasos, francés, agua y muay thai.
const HOY = '2026-09-22';
const acts = (ids) => DEFAULT_ACTIVITIES.filter((a) => ids.includes(a.id));
const estado = (activities, entries = {}) =>
  derive({ activities, entries, unlocked: {} }, HOY);

// ---------------------------------------------------------------------------
// Qué se puede marcar de un toque
// ---------------------------------------------------------------------------

test('sólo donde cumplir es un número sin ambigüedad', () => {
  const de = (id) => DEFAULT_ACTIVITIES.find((a) => a.id === id);
  assert.equal(puedeUnToque(de('datos')), true, 'minutos');
  assert.equal(puedeUnToque(de('agua')), true, 'mililitros');
  assert.equal(puedeUnToque(de('gym')), false, 'una sesión no tiene valor obvio');
  assert.equal(puedeUnToque(de('cuerpo')), false, 'una medición tampoco');
  assert.equal(puedeUnToque(de('frances')), false, 'con dos fuentes no hay un número único');
});

test('los pasos no se marcan a mano adentro de la app', () => {
  // Los escribe Health Connect: un valor puesto a mano se pisa en la
  // siguiente lectura y el widget habría mentido por un rato.
  const pasos = DEFAULT_ACTIVITIES.find((a) => a.id === 'pasos');
  assert.equal(puedeUnToque(pasos, { enApp: false }), true, 'en el navegador sí');
  assert.equal(puedeUnToque(pasos, { enApp: true }), false, 'adentro de la app no');
});

test('una actividad rota no rompe la regla', () => {
  assert.equal(puedeUnToque(null), false);
  assert.equal(puedeUnToque({ kind: 'number', goal: 0 }), false);
});

// ---------------------------------------------------------------------------
// El resumen que lee el widget
// ---------------------------------------------------------------------------

test('lleva sólo lo que toca hoy', () => {
  const s = estado(acts(['datos', 'gym', 'pasos']));
  const r = resumenDelDia(s);
  const ids = r.misiones.map((m) => m.id);
  assert.ok(ids.includes('datos') && ids.includes('pasos'));
  assert.ok(!ids.includes('gym'), 'el gimnasio es lunes, miércoles y viernes');
});

test('cuenta lo cumplido y marca el día perfecto', () => {
  const s = estado(acts(['datos', 'pasos']), { [HOY]: { datos: { value: 60 }, pasos: { value: 12000 } } });
  const r = resumenDelDia(s);
  assert.equal(r.hechas, 2);
  assert.equal(r.total, 2);
  assert.equal(r.perfecto, true);
  assert.ok(r.xp > 0);
});

test('un día a medias no es perfecto', () => {
  const s = estado(acts(['datos', 'pasos']), { [HOY]: { datos: { value: 60 } } });
  const r = resumenDelDia(s);
  assert.equal(r.hechas, 1);
  assert.equal(r.perfecto, false);
});

test('primero lo que falta: el widget es para lo que queda', () => {
  const s = estado(acts(['datos', 'pasos']), { [HOY]: { datos: { value: 60 } } });
  const r = resumenDelDia(s);
  assert.equal(r.misiones[0].id, 'pasos', 'lo pendiente va arriba');
  assert.equal(r.misiones[r.misiones.length - 1].hecho, true);
});

test('el texto de cada fila ya viene formateado', () => {
  // Del otro lado no hay separador de miles, ni unidades, ni horas: si no
  // viaja escrito, el widget muestra un número pelado.
  const s = estado(acts(['pasos']), { [HOY]: { pasos: { value: 4200 } } });
  const paso = resumenDelDia(s).misiones[0];
  assert.equal(paso.texto, '4.200 / 10.000 pasos');
});

test('lo cumplido muestra lo que hiciste, no la meta', () => {
  const s = estado(acts(['datos']), { [HOY]: { datos: { value: 90 } } });
  assert.equal(resumenDelDia(s).misiones[0].texto, '1h 30m');
});

test('dice con qué valor se marca de un toque, y sólo si falta', () => {
  const s = estado(acts(['datos', 'agua']), { [HOY]: { datos: { value: 60 } } });
  const r = resumenDelDia(s);
  assert.equal(r.misiones.find((m) => m.id === 'datos').unToque, 0, 'ya está hecho');
  assert.ok(r.misiones.find((m) => m.id === 'agua').unToque > 0);
});

test('el gimnasio nunca trae botón de un toque', () => {
  const lunes = '2026-09-21';
  const s = derive({ activities: acts(['gym']), entries: {}, unlocked: {} }, lunes);
  const r = resumenDelDia(s, { fecha: lunes });
  assert.equal(r.misiones[0].id, 'gym');
  assert.equal(r.misiones[0].unToque, 0);
});

test('viaja el rango y la racha, que el widget no sabe calcular', () => {
  const s = estado(acts(['datos']), { [HOY]: { datos: { value: 60 } } });
  const r = resumenDelDia(s);
  assert.ok(r.rango.length > 0, 'el nombre del general');
  assert.equal(typeof r.racha, 'number');
  assert.equal(r.fecha, HOY);
  assert.equal(r.v, 1, 'la versión del formato');
});

test('un día sin nada agendado no rompe', () => {
  const s = estado(acts(['substack']));   // semanal sin días fijos
  const r = resumenDelDia(s);
  assert.equal(r.total, 0);
  assert.equal(r.perfecto, false, 'cero de cero no es un día perfecto');
});

test('el widget muestra unas pocas misiones, no todas', () => {
  assert.ok(MAX_MISIONES >= 4 && MAX_MISIONES <= 8, `MAX_MISIONES = ${MAX_MISIONES}`);
});

// ---------------------------------------------------------------------------
// La cola del widget
// ---------------------------------------------------------------------------

test('aplica lo encolado en la fecha en que lo tocaste', () => {
  const r = pendientesAAplicar([{ actividad: 'datos', fecha: '2026-09-20', valor: 45 }], {});
  assert.deepEqual(r, [{ actividad: 'datos', fecha: '2026-09-20', valor: 45 }]);
});

test('no pisa lo que ya está cargado', () => {
  // Si entre el toque y el momento de abrir anotaste el valor real, ese manda.
  const entries = { '2026-09-20': { datos: { value: 90 } } };
  const r = pendientesAAplicar([{ actividad: 'datos', fecha: '2026-09-20', valor: 45 }], entries);
  assert.deepEqual(r, []);
});

test('dos toques del mismo día son uno solo', () => {
  const r = pendientesAAplicar([
    { actividad: 'datos', fecha: '2026-09-20', valor: 45 },
    { actividad: 'datos', fecha: '2026-09-20', valor: 45 },
  ], {});
  assert.equal(r.length, 1);
});

test('descarta lo que no tiene sentido', () => {
  const r = pendientesAAplicar([
    { actividad: '', fecha: '2026-09-20', valor: 45 },
    { actividad: 'datos', fecha: 'cuando sea', valor: 45 },
    { actividad: 'datos', fecha: '2026-13-99', valor: 45 },
    { actividad: 'datos', fecha: '2026-09-20', valor: 0 },
    { actividad: 'datos', fecha: '2026-09-20', valor: -5 },
  ], {});
  assert.deepEqual(r, []);
});

test('una cola vacía o rota no rompe', () => {
  assert.deepEqual(pendientesAAplicar(null, {}), []);
  assert.deepEqual(pendientesAAplicar([null, undefined], {}), []);
});
