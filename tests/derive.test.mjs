import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, entryValue, entryVolume, goalFor, isScheduled, completedSets } from '../js/derive.js';
import { DEFAULT_ACTIVITIES, GYM_TEMPLATES, plannedSets, templateForDay } from '../js/config.js';
import { addDays, keyToDate } from '../js/utils.js';

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
  // Muay Thai: martes y jueves, tres semanas seguidas.
  for (let semana = 0; semana < 3; semana++) {
    for (const dia of [0, 2]) {
      entries[addDays(HOY, -(semana * 7) - dia)] = { muaythai: { value: 60 } };
    }
  }
  const st = derive(build(acts(['muaythai']), entries), HOY).byActivity.get('muaythai');
  assert.equal(st.weekTarget, 2, 'dos clases por semana');
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

test('el gimnasio se mide en series y guarda el tonelaje aparte', () => {
  const ayer = addDays(HOY, -1);
  const s = derive(build(acts(['gym']), {
    [ayer]: { gym: { exercises: [{ name: 'Sentadilla', sets: [{ weight: 100, reps: 5 }] }] } },
    [HOY]: { gym: { exercises: [{ name: 'sentadilla', sets: [{ weight: 110, reps: 5 }] }] } },
  }), HOY);
  const st = s.byActivity.get('gym');
  assert.equal(st.total, 2, 'dos series completadas');
  assert.equal(st.volume, 500 + 550, 'el tonelaje se acumula por separado');
  assert.equal(st.prCount, 1, 'superar el 1RM anterior cuenta como récord');
  assert.equal(st.recordList[0].weight, 110);
  assert.equal(s.bonusXp, 25);
});

test('una serie de peso corporal cuenta aunque no lleve peso', () => {
  const ex = [{ name: 'Dominadas agarre ancho', sets: [{ weight: '', reps: 12 }, { weight: 0, reps: 10 }] }];
  assert.equal(completedSets(ex), 2);
  assert.equal(entryVolume({ exercises: ex }), 0, 'sin carga extra el tonelaje es 0');
});

test('cada rutina se mide contra SUS series planificadas', () => {
  const gym = acts(['gym'])[0];
  const pecho = GYM_TEMPLATES.find((t) => t.id === 'pecho-piernas');   // 27 series
  const hombros = GYM_TEMPLATES.find((t) => t.id === 'hombros-triceps'); // 42 series
  assert.equal(goalFor(gym, { templateId: pecho.id }), 27);
  assert.equal(goalFor(gym, { templateId: hombros.id }), 42);
  assert.equal(goalFor(gym, null), gym.goal, 'una sesión libre usa la meta genérica');

  // Completar la rutina corta y la larga valen lo mismo.
  const sesion = (template) => ({
    templateId: template.id,
    exercises: template.exercises.map((ex) => ({
      name: ex.name, sets: Array.from({ length: 3 }, () => ({ weight: 40, reps: 12 })),
    })),
  });
  const xpDe = (template) => derive(build([gym], { [HOY]: { gym: sesion(template) } }), HOY)
    .byActivity.get('gym').xp;
  assert.equal(xpDe(pecho), xpDe(hombros), 'completar la rutina del día vale igual');
  assert.equal(xpDe(pecho), 100, 'y vale exactamente la meta: 100 XP');
});

test('media rutina da media XP', () => {
  const gym = acts(['gym'])[0];
  const t = templateForDay(1);
  const mitad = Math.floor(t.exercises.length / 2);
  const entry = {
    templateId: t.id,
    exercises: t.exercises.slice(0, mitad).map((ex) => ({
      name: ex.name, sets: Array.from({ length: 3 }, () => ({ weight: 30, reps: 12 })),
    })),
  };
  const st = derive(build([gym], { [HOY]: { gym: entry } }), HOY).byActivity.get('gym');
  assert.equal(st.total, mitad * 3);
  assert.ok(st.xp > 40 && st.xp < 60, `esperaba ~50 XP, obtuve ${st.xp}`);
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
  assert.equal(entryValue(gym, { exercises: [{ name: 'x', sets: [{ weight: 50, reps: 10 }] }] }), 1);
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


// ---------------------------------------------------------------------------
// Agenda semanal: piano lunes/viernes/sábado/domingo, gym L-M-V, muay thai M-J.
// ---------------------------------------------------------------------------

const DOM = '2026-03-29'; // domingo
const LUN = '2026-03-30';
const MAR = '2026-03-31';

test('cada actividad conoce los días en que toca', () => {
  const piano = acts(['piano'])[0];
  const gym = acts(['gym'])[0];
  const mt = acts(['muaythai'])[0];
  const pasos = acts(['pasos'])[0];

  assert.equal(keyToDate(LUN).getDay(), 1, 'control: el caso base es un lunes');
  assert.ok(isScheduled(piano, LUN) && isScheduled(piano, DOM));
  assert.ok(!isScheduled(piano, MAR), 'el martes no hay piano');
  assert.ok(isScheduled(gym, LUN) && !isScheduled(gym, MAR));
  assert.ok(isScheduled(mt, MAR) && !isScheduled(mt, LUN));
  assert.ok(isScheduled(pasos, LUN) && isScheduled(pasos, MAR), 'los pasos son todos los días');
});

test('un día libre no rompe la racha', () => {
  const piano = acts(['piano'])[0];
  // Viernes, sábado, domingo y lunes con piano; martes y miércoles libres.
  const entries = {};
  for (const d of ['2026-03-27', '2026-03-28', DOM, LUN]) entries[d] = { piano: { value: 30 } };
  const st = derive(build([piano], entries), MAR).byActivity.get('piano');
  assert.equal(st.streak, 4, 'la racha sigue viva el martes, que es día libre');
});

test('faltar un día programado sí corta la racha', () => {
  const piano = acts(['piano'])[0];
  const entries = {};
  // Falta el domingo, que sí toca.
  for (const d of ['2026-03-27', '2026-03-28', LUN]) entries[d] = { piano: { value: 30 } };
  const st = derive(build([piano], entries), MAR).byActivity.get('piano');
  assert.equal(st.streak, 1, 'solo sobrevive el lunes posterior al faltazo');
});

test('tocar el piano un día libre suma igual', () => {
  const piano = acts(['piano'])[0];
  const st = derive(build([piano], { [MAR]: { piano: { value: 30 } } }), MAR).byActivity.get('piano');
  assert.ok(st.xp > 0, 'hacer de más nunca penaliza');
  assert.equal(st.streak, 1);
});

test('el día perfecto solo exige lo que ese día toca', () => {
  const todas = DEFAULT_ACTIVITIES;
  // Martes: datos, pasos, duolingo y muay thai. Sin piano ni gimnasio.
  const martes = derive(build(todas, {
    [MAR]: {
      datos: { value: 45 }, pasos: { value: 10000 },
      duolingo: { value: 30 }, muaythai: { value: 60 },
    },
  }), MAR);
  assert.equal(martes.perfectDays, 1, 'el martes no hace falta piano ni gimnasio');

  // El mismo registro un lunes NO alcanza: faltan piano y gimnasio.
  const lunes = derive(build(todas, {
    [LUN]: {
      datos: { value: 45 }, pasos: { value: 10000 },
      duolingo: { value: 30 }, muaythai: { value: 60 },
    },
  }), LUN);
  assert.equal(lunes.perfectDays, 0);
});

test('las sesiones planificadas coinciden con la rutina real', () => {
  assert.equal(plannedSets(templateForDay(1)), 30, 'lunes: 10 ejercicios × 3');
  assert.equal(plannedSets(templateForDay(3)), 42, 'miércoles: 14 ejercicios × 3');
  assert.equal(plannedSets(templateForDay(5)), 27, 'viernes: 9 ejercicios × 3');
  assert.equal(templateForDay(2), null, 'los martes no hay gimnasio');
});
