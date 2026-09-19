import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSchedule, buildSeedEntries, seedSummary, HISTORIAL_PREVIO } from '../js/seed.js';
import { weeklyTargetFor, derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';
import { keyToDate } from '../js/utils.js';

test('expande un tramo a los días de la semana indicados', () => {
  // Martes y jueves de una sola semana.
  const dias = expandSchedule({ from: '2026-09-07', to: '2026-09-13', weekdays: [2, 4] });
  assert.deepEqual(dias, ['2026-09-08', '2026-09-10']);
});

test('un tramo vacío o mal formado no genera nada', () => {
  assert.deepEqual(expandSchedule({ from: '2026-09-07', to: '2026-09-01', weekdays: [2] }), []);
  assert.deepEqual(expandSchedule({ from: '', to: '', weekdays: [2] }), []);
  assert.deepEqual(expandSchedule({ from: '2026-09-07', to: '2026-09-13', weekdays: [] }), []);
});

test('el historial previo de muay thai cubre desde agosto de 2025', () => {
  const resumen = seedSummary().get('muaythai');
  assert.equal(resumen.desde, '2025-08-05');
  assert.equal(resumen.hasta, '2026-09-18');
  assert.ok(resumen.sesiones > 55, `esperaba más de 55 sesiones, obtuve ${resumen.sesiones}`);
});

test('todas las sesiones sembradas caen en días de clase', () => {
  const entries = buildSeedEntries();
  const muaythai = DEFAULT_ACTIVITIES.find((a) => a.id === 'muaythai');
  for (const [fecha, dia] of Object.entries(entries)) {
    if (!dia.muaythai) continue;
    assert.ok(muaythai.days.includes(keyToDate(fecha).getDay()),
      `${fecha} no es un día de muay thai`);
    assert.equal(dia.muaythai.value, 90, 'cada clase dura 1h 30');
    assert.equal(dia.muaythai.seeded, true, 'queda marcada como historial previo');
  }
});

test('el objetivo semanal se juzga con el que regía en cada momento', () => {
  const mt = DEFAULT_ACTIVITIES.find((a) => a.id === 'muaythai');
  assert.equal(weeklyTargetFor(mt, '2025-09-01'), 1, 'en 2025 era una clase por semana');
  assert.equal(weeklyTargetFor(mt, '2026-08-31'), 1, 'la semana anterior al cambio, todavía una');
  assert.equal(weeklyTargetFor(mt, '2026-09-07'), 2, 'desde septiembre de 2026, dos');
  assert.equal(weeklyTargetFor(mt, '2026-09-14'), 2);
});

test('una actividad sin historial de objetivos usa el actual', () => {
  const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
  assert.equal(weeklyTargetFor(gym, '2025-01-06'), gym.weeklyTarget);
});

test('el año de una clase por semana cuenta como racha, no como incumplimiento', () => {
  const mt = DEFAULT_ACTIVITIES.find((a) => a.id === 'muaythai');
  const data = { activities: [mt], entries: buildSeedEntries(HISTORIAL_PREVIO), unlocked: {}, settings: {} };
  const st = derive(data, '2026-09-18').byActivity.get('muaythai');

  assert.ok(st.streak > 50, `esperaba una racha larga, obtuve ${st.streak} semanas`);
  assert.equal(st.weekTarget, 2, 'hoy la meta son dos clases');
  assert.ok(st.activeDays > 55, `sesiones registradas: ${st.activeDays}`);
  assert.equal(st.total, st.activeDays * 90, 'cada clase suma 1h 30');
  assert.ok(st.level.level >= 8, `un año de constancia debería dar buen nivel, dio ${st.level.level}`);
});

test('sin el historial de objetivos, ese mismo año se vería como racha rota', () => {
  const mt = { ...DEFAULT_ACTIVITIES.find((a) => a.id === 'muaythai') };
  delete mt.weeklyTargetHistory; // meta fija de 2 por semana
  const data = { activities: [mt], entries: buildSeedEntries(HISTORIAL_PREVIO), unlocked: {}, settings: {} };
  const st = derive(data, '2026-09-18').byActivity.get('muaythai');
  assert.ok(st.streak <= 2, `sin vigencia la racha se cae a ${st.streak}`);
});
