import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, entryValue } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';
import { addDays } from '../js/utils.js';

const HOY = '2026-03-31';
const acts = (ids) => DEFAULT_ACTIVITIES.filter((a) => ids.includes(a.id));

/** Historial de días consecutivos terminando el día `endOffset` antes de HOY. */
function build(activities, entries) {
  return { activities, entries, unlocked: {} };
}

/** Genera N días seguidos cumpliendo la meta, terminando hoy. */
function dias(n, activityId, value, { saltar = [] } = {}) {
  const entries = {};
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(HOY, -i);
    if (saltar.includes(i)) continue;
    entries[date] = { [activityId]: { value } };
  }
  return entries;
}

test('la racha diaria cuenta días consecutivos cumpliendo la meta', () => {
  const s = derive(build(acts(['datos']), dias(5, 'datos', 45)), HOY);
  assert.equal(s.byActivity.get('datos').streak, 5);
  assert.equal(s.byActivity.get('datos').bestStreak, 5);
});

test('quedarse corto de la meta no alimenta la racha', () => {
  const s = derive(build(acts(['datos']), dias(4, 'datos', 20)), HOY);
  assert.equal(s.byActivity.get('datos').streak, 0);
  assert.ok(s.byActivity.get('datos').xp > 0, 'pero igual suma XP proporcional');
});

test('a los 7 días se gana un escudo que salva un día perdido', () => {
  // 10 días seguidos, salteando el día 2 (ya se había ganado un escudo el día 7).
  const s = derive(build(acts(['datos']), dias(10, 'datos', 45, { saltar: [2] })), HOY);
  const st = s.byActivity.get('datos');
  assert.equal(st.streak, 9, 'la racha sobrevive gracias al escudo');
  assert.equal(st.shields, 0, 'y el escudo se consumió');
});

test('sin escudos disponibles, un día perdido corta la racha', () => {
  const s = derive(build(acts(['datos']), dias(5, 'datos', 45, { saltar: [2] })), HOY);
  assert.equal(s.byActivity.get('datos').streak, 2);
});

test('el día en curso todavía no rompe la racha', () => {
  const entries = dias(4, 'datos', 45);
  delete entries[HOY]; // hoy sin registrar
  const s = derive(build(acts(['datos']), entries), HOY);
  assert.equal(s.byActivity.get('datos').streak, 3);
});

test('las actividades semanales cuentan semanas, no días', () => {
  const entries = {};
  // 3 sesiones por semana durante 3 semanas (objetivo de Muay Thai).
  for (let semana = 0; semana < 3; semana++) {
    for (const dia of [0, 2, 4]) {
      entries[addDays(HOY, -(semana * 7) - dia)] = { muaythai: { value: 60 } };
    }
  }
  const st = derive(build(acts(['muaythai']), entries), HOY).byActivity.get('muaythai');
  assert.equal(st.weekTarget, 3);
  assert.ok(st.streak >= 2, `esperaba racha semanal, obtuve ${st.streak}`);
});

test('el día perfecto exige todas las actividades diarias y da bonus', () => {
  const diarias = acts(['datos', 'pasos']);
  const completo = derive(build(diarias, {
    [HOY]: { datos: { value: 45 }, pasos: { value: 10000 } },
  }), HOY);
  assert.equal(completo.perfectDays, 1);
  assert.equal(completo.bonusXp, 50);

  const incompleto = derive(build(diarias, { [HOY]: { datos: { value: 45 } } }), HOY);
  assert.equal(incompleto.perfectDays, 0);
  assert.equal(incompleto.bonusXp, 0);
});

test('el gimnasio deriva su valor del tonelaje y detecta récords', () => {
  const ayer = addDays(HOY, -1);
  const s = derive(build(acts(['gym']), {
    [ayer]: { gym: { exercises: [{ name: 'Sentadilla', sets: [{ weight: 100, reps: 5 }] }] } },
    [HOY]: { gym: { exercises: [{ name: 'sentadilla', sets: [{ weight: 110, reps: 5 }] }] } },
  }), HOY);
  const st = s.byActivity.get('gym');
  assert.equal(st.total, 500 + 550);
  assert.equal(st.prCount, 1, 'superar el 1RM anterior cuenta como récord');
  assert.equal(st.recordList[0].weight, 110);
  assert.equal(s.bonusXp, 25);
});

test('el mismo peso repetido no inventa récords nuevos', () => {
  const s = derive(build(acts(['gym']), {
    [addDays(HOY, -1)]: { gym: { exercises: [{ name: 'Press', sets: [{ weight: 60, reps: 8 }] }] } },
    [HOY]: { gym: { exercises: [{ name: 'Press', sets: [{ weight: 60, reps: 8 }] }] } },
  }), HOY);
  assert.equal(s.byActivity.get('gym').prCount, 0);
});

test('los logros se desbloquean al alcanzar su objetivo', () => {
  const vacio = derive(build(acts(['datos']), {}), HOY);
  assert.equal(vacio.unlockedIds.length, 0);

  const conDatos = derive(build(acts(['datos']), dias(8, 'datos', 45)), HOY);
  assert.ok(conDatos.unlockedIds.includes('first-blood'));
  assert.ok(conDatos.unlockedIds.includes('week-1'), '7 días de racha desbloquean "Semana viva"');
  assert.ok(conDatos.achievementXp > 0);
});

test('un historial vacío no rompe nada', () => {
  const s = derive(build(DEFAULT_ACTIVITIES, {}), HOY);
  assert.equal(s.player.level, 1);
  assert.equal(s.player.xp, 0);
  assert.equal(s.globalStreak, 0);
  assert.equal(s.perfectDays, 0);
  for (const st of s.byActivity.values()) assert.equal(st.level.level, 1);
});

test('la XP del jugador es la suma de actividades, bonus y logros', () => {
  const s = derive(build(DEFAULT_ACTIVITIES, dias(9, 'datos', 45)), HOY);
  assert.equal(s.player.xp, s.activityXp + s.bonusXp + s.achievementXp);
});

test('entryValue entiende cada tipo de actividad', () => {
  const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
  const datos = DEFAULT_ACTIVITIES.find((a) => a.id === 'datos');
  assert.equal(entryValue(gym, { exercises: [{ name: 'x', sets: [{ weight: 50, reps: 10 }] }] }), 500);
  assert.equal(entryValue(datos, { value: 45 }), 45);
  assert.equal(entryValue(datos, null), 0);
  assert.equal(entryValue(datos, { value: 'raro' }), 0);
});

test('cambiar la meta recalcula la XP acumulada', () => {
  const entries = dias(3, 'pasos', 10000);
  const normal = derive(build(acts(['pasos']), entries), HOY);
  const exigente = derive(build([{ ...acts(['pasos'])[0], goal: 20000 }], entries), HOY);
  assert.ok(exigente.byActivity.get('pasos').xp < normal.byActivity.get('pasos').xp);
});
