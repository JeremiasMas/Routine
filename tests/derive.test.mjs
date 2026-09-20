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
  // En marzo de 2026 el objetivo vigente todavía era una clase por semana.
  assert.equal(st.weekTarget, 1, 'el objetivo es el que regía en esa fecha');
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
  for (const st of s.byActivity.values()) {
    if (st.activity.rankBy === 'bodyfat') {
      // Sin mediciones no hay banda de grasa, y el rango genérico no aplica.
      assert.equal(st.level.level, 0);
      assert.equal(st.tier.name, 'Sin medir');
    } else {
      assert.equal(st.level.level, 1, `${st.id} debería arrancar en nivel 1`);
    }
  }
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
      datos: { value: 45 }, pasos: { value: 10000 }, agua: { value: 2150 },
      frances: { sources: { duolingo: 5 } }, muaythai: { value: 90 },
    },
  }), MAR);
  assert.equal(martes.perfectDays, 1, 'el martes no hace falta piano ni gimnasio');

  // El mismo registro un lunes NO alcanza: faltan piano y gimnasio.
  const lunes = derive(build(todas, {
    [LUN]: {
      datos: { value: 45 }, pasos: { value: 10000 }, agua: { value: 2150 },
      frances: { sources: { duolingo: 5 } }, muaythai: { value: 90 },
    },
  }), LUN);
  assert.equal(lunes.perfectDays, 0, 'el lunes faltarían piano y gimnasio');
});

test('las sesiones planificadas coinciden con la rutina real', () => {
  assert.equal(plannedSets(templateForDay(1)), 30, 'lunes: 10 ejercicios × 3');
  assert.equal(plannedSets(templateForDay(3)), 42, 'miércoles: 14 ejercicios × 3');
  assert.equal(plannedSets(templateForDay(5)), 27, 'viernes: 9 ejercicios × 3');
  assert.equal(templateForDay(2), null, 'los martes no hay gimnasio');
});


// ---------------------------------------------------------------------------
// Agua y composición corporal
// ---------------------------------------------------------------------------

test('el agua cuenta los días que cumpliste la meta', () => {
  const agua = acts(['agua'])[0];
  const entries = {};
  for (const [i, valor] of [2200, 1000, 2150, 2500].entries()) {
    entries[addDays(HOY, -3 + i)] = { agua: { value: valor } };
  }
  const s = derive(build([agua], entries), HOY);
  assert.equal(s.goalDays.agua, 3, 'tres de los cuatro días llegaron a la meta');
  assert.equal(s.byActivity.get('agua').total, 7850);
});

test('una medición corporal cuenta como registro hecho', () => {
  const cuerpo = acts(['cuerpo'])[0];
  const s = derive(build([cuerpo], {
    [HOY]: { cuerpo: { weight: 61.5, waist: 85, neck: 38 } },
  }), HOY);
  const st = s.byActivity.get('cuerpo');
  assert.equal(st.total, 1);
  assert.ok(st.xp >= 100, `medirte una vez por semana vale la meta completa (${st.xp} XP con el bonus de racha)`);
});

test('una medición vacía no cuenta', () => {
  const cuerpo = acts(['cuerpo'])[0];
  const s = derive(build([cuerpo], { [HOY]: { cuerpo: { note: 'me olvidé la cinta' } } }), HOY);
  assert.equal(s.byActivity.get('cuerpo').xp, 0);
});

test('el muay thai pide 1:30 por sesión', () => {
  const mt = acts(['muaythai'])[0];
  assert.equal(mt.goal, 90);
  const s = derive(build([mt], { [HOY]: { muaythai: { value: 90 } } }), HOY);
  // 100 XP por cumplir la meta, más el bonus de racha semanal.
  assert.ok(s.byActivity.get('muaythai').xp >= 100);
  assert.equal(s.byActivity.get('muaythai').total, 90);
  // Media clase, media XP.
  const media = derive(build([mt], { [HOY]: { muaythai: { value: 45 } } }), HOY);
  assert.ok(media.byActivity.get('muaythai').xp < 60);
});

test('ya no existe el día 4 del gimnasio', () => {
  assert.equal(GYM_TEMPLATES.length, 3);
  assert.ok(!GYM_TEMPLATES.some((t) => t.id === 'dia-4'));
});

// ---------------------------------------------------------------------------
// Fuerza: récords que entienden el peso corporal
// ---------------------------------------------------------------------------

test('las dominadas registran récord aunque no lleven lastre', () => {
  const gym = acts(['gym'])[0];
  const data = build([gym], {
    [HOY]: { gym: { exercises: [{ name: 'Dominadas agarre ancho', bw: true, sets: [{ weight: 0, reps: 10 }] }] } },
  });
  data.settings = { weight: 61.5 };
  const rec = derive(data, HOY).byActivity.get('gym').records.get('dominadas agarre ancho');
  assert.equal(rec.load, 61.5, 'la carga es tu propio peso');
  assert.ok(rec.e1rm > 61.5, `1RM estimado: ${rec.e1rm}`);
  assert.equal(rec.weight, 0, 'y el lastre queda registrado aparte');
});

test('subir de peso no regala un récord en dominadas', () => {
  const gym = acts(['gym', 'cuerpo']);
  const dominadas = (reps) => ({ exercises: [{ name: 'Dominadas agarre ancho', bw: true, sets: [{ weight: 0, reps }] }] });
  const data = build(gym, {
    [addDays(HOY, -14)]: { gym: dominadas(10), cuerpo: { weight: 61.5 } },
    [addDays(HOY, -7)]: { gym: dominadas(10), cuerpo: { weight: 65 } },  // +3,5 kg, mismas reps
  });
  data.settings = { weight: 61.5 };
  const st = derive(data, HOY).byActivity.get('gym');
  assert.equal(st.prCount, 0, 'mismas repeticiones no son un récord, pese a los kilos de más');

  // Una repetición más sí lo es.
  data.entries[HOY] = { gym: dominadas(11) };
  assert.equal(derive(data, HOY).byActivity.get('gym').prCount, 1);
});

test('en los ejercicios con barra el récord sigue siendo en kilos', () => {
  const gym = acts(['gym'])[0];
  const data = build([gym], {
    [addDays(HOY, -2)]: { gym: { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 70, reps: 10 }] }] } },
    [HOY]: { gym: { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 75, reps: 10 }] }] } },
  });
  data.settings = { weight: 61.5 };
  const st = derive(data, HOY).byActivity.get('gym');
  assert.equal(st.prCount, 1);
  assert.equal(st.records.get('sentadilla con barra').weight, 75);
});

// ---------------------------------------------------------------------------
// Hábitos sin nivel, fuentes múltiples y acumulado previo
// ---------------------------------------------------------------------------

test('el agua cuenta racha y día perfecto pero no acumula XP', () => {
  const agua = acts(['agua'])[0];
  assert.equal(agua.leveled, false);
  const st = derive(build([agua], { [HOY]: { agua: { value: 2200 } } }), HOY).byActivity.get('agua');
  assert.equal(st.xp, 0, 'un hábito no suma XP propia');
  assert.equal(st.total, 2200, 'pero sí se registra lo que tomaste');
  assert.equal(st.streak, 1);
  assert.equal(st.leveled, false);
});

test('el francés suma minutos de sus dos fuentes', () => {
  const fr = acts(['frances'])[0];
  const duo = fr.sources.find((f) => f.id === 'duolingo');
  const cbf = fr.sources.find((f) => f.id === 'cbf');
  assert.equal(entryValue(fr, { sources: { duolingo: 4 } }), 4 * duo.minutes);
  assert.equal(entryValue(fr, { sources: { cbf: 1 } }), cbf.minutes);
  assert.equal(entryValue(fr, { sources: { duolingo: 2, cbf: 1 } }), 2 * duo.minutes + cbf.minutes);
  assert.equal(entryValue(fr, { sources: {} }), 0);
  assert.equal(entryValue(fr, {}), 0);
});

test('un episodio del podcast equivale a once lecciones', () => {
  const fr = acts(['frances'])[0];
  const duo = fr.sources.find((f) => f.id === 'duolingo');
  const cbf = fr.sources.find((f) => f.id === 'cbf');
  assert.equal(duo.minutes, 2, 'una lección son 2 minutos');
  assert.equal(cbf.minutes, 22, 'un episodio son 22');
  assert.equal(cbf.minutes / duo.minutes, 11);

  const unEpisodio = derive(build([fr], { [HOY]: { frances: { sources: { cbf: 1 } } } }), HOY);
  const onceLecciones = derive(build([fr], { [HOY]: { frances: { sources: { duolingo: 11 } } } }), HOY);
  assert.equal(unEpisodio.byActivity.get('frances').xp, onceLecciones.byActivity.get('frances').xp);
});

test('la meta diaria de francés es alcanzable por cualquiera de las dos vías', () => {
  const fr = acts(['frances'])[0];
  const meta = (fuentes) => derive(build([fr], { [HOY]: { frances: { sources: fuentes } } }), HOY)
    .byActivity.get('frances').byDate.get(HOY).met;
  assert.equal(meta({ duolingo: 5 }), true, 'cinco lecciones cumplen el día');
  assert.equal(meta({ cbf: 1 }), true, 'un episodio también');
  assert.equal(meta({ duolingo: 2, cbf: 0 }), false, 'dos lecciones sueltas no');
  assert.equal(meta({ duolingo: 3, cbf: 0 }), false);
  assert.equal(meta({ duolingo: 2 }), false);
});

test('el acumulado previo cuenta para el total y la XP, no para la racha', () => {
  const datos = acts(['datos'])[0];
  const data = build([datos], {});
  data.carryOver = { datos: { total: 613 } };
  const st = derive(data, HOY).byActivity.get('datos');
  assert.equal(st.carryOver, 613);
  assert.equal(st.total, 613);
  assert.equal(st.streak, 0, 'no inventa una racha que no ocurrió');
  // 613 minutos con meta de 45 son 13,6 metas cumplidas.
  assert.equal(st.xp, Math.round((613 / 45) * 100));
  assert.ok(st.level.level >= 4, `esperaba buen nivel, dio ${st.level.level}`);
});

test('el rango del cuerpo sale de la grasa medida, no de la XP', () => {
  const cuerpo = acts(['cuerpo'])[0];
  const data = build([cuerpo], { [HOY]: { cuerpo: { weight: 61.5, waist: 78, neck: 35 } } });
  data.settings = { height: 160, bodyFormula: '3' };
  const s = derive(data, HOY);
  const st = s.byActivity.get('cuerpo');
  assert.equal(s.bodyFat, 16.3);
  assert.equal(st.tier.name, 'Atlético');
  assert.equal(st.nextTier.name, 'Definido');
  assert.equal(st.level.level, 4, 'el nivel es la banda de grasa');
});

test('el nivel del gimnasio lo da la fuerza, no la cantidad de sesiones', () => {
  const gym = acts(['gym'])[0];
  assert.equal(gym.rankBy, 'strength');

  const sesion = (peso) => ({ gym: { exercises: [
    { name: 'Sentadilla con barra', sets: [{ weight: peso, reps: 5 }] },
    { name: 'Pecho plano', sets: [{ weight: peso * 0.7, reps: 5 }] },
  ] } });

  // Muchas sesiones flojas.
  const constante = build([gym], {});
  for (let i = 1; i <= 30; i++) constante.entries[addDays(HOY, -i)] = sesion(40);
  constante.settings = { weight: 61.5 };

  // Pocas sesiones, pero fuerte.
  const fuerte = build([gym], {
    [addDays(HOY, -2)]: sesion(110),
    [HOY]: sesion(115),
  });
  fuerte.settings = { weight: 61.5 };

  const a = derive(constante, HOY).byActivity.get('gym');
  const b = derive(fuerte, HOY).byActivity.get('gym');

  assert.ok(a.activeDays > b.activeDays, 'el primero fue muchas más veces');
  assert.ok(b.level.level > a.level.level,
    `pero el fuerte tiene más nivel (${b.level.level} vs ${a.level.level})`);
  assert.ok(b.tier.name !== a.tier.name, 'y distinto rango');
});

test('sin sesiones cargadas el gimnasio no inventa un nivel de fuerza', () => {
  const gym = acts(['gym'])[0];
  const data = build([gym], {});
  data.settings = { weight: 61.5 };
  const st = derive(data, HOY).byActivity.get('gym');
  assert.ok(!st.strengthOverall, 'sin ejercicios con estándar no hay nivel de fuerza');
  assert.equal(st.level.level, 1);
});

// ---------------------------------------------------------------------------
// Fiabilidad del 1RM y día casi perfecto
// ---------------------------------------------------------------------------

test('una serie de 15 repeticiones no fija récord: no sirve para medir', () => {
  const gym = acts(['gym'])[0];
  const data = build([gym], {
    [HOY]: { gym: { exercises: [
      { name: 'Sentadilla con barra', sets: [{ weight: 200, reps: 15 }] },
    ] } },
  });
  data.settings = { weight: 61.5 };
  const st = derive(data, HOY).byActivity.get('gym');
  assert.equal(st.records.size, 0, 'por pesada que sea, 15 reps no miden fuerza');
  assert.equal(st.total, 1, 'pero la serie cuenta igual para la rutina');
});

test('una serie de 10 repeticiones sí cuenta', () => {
  const gym = acts(['gym'])[0];
  const data = build([gym], {
    [HOY]: { gym: { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 10 }] }] } },
  });
  data.settings = { weight: 61.5 };
  assert.equal(derive(data, HOY).byActivity.get('gym').records.size, 1);
});

test('avisa cuando hace falta calibrar la fuerza', () => {
  const gym = acts(['gym'])[0];
  const pesada = { gym: { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 100, reps: 5 }] }] } };

  const reciente = build([gym], { [addDays(HOY, -7)]: pesada });
  reciente.settings = { weight: 61.5 };
  assert.equal(derive(reciente, HOY).calibracionVencida.length, 0, 'hace una semana, está fresca');

  const vieja = build([gym], { [addDays(HOY, -60)]: pesada });
  vieja.settings = { weight: 61.5 };
  const s = derive(vieja, HOY);
  assert.equal(s.calibracionVencida.length, 1, 'a los dos meses hay que recalibrar');
  assert.equal(s.calibracionVencida[0].liftKey ?? s.calibracionVencida[0].lift, 'Sentadilla');

  // Series de 10-12 mantienen el récord pero no calibran.
  const soloLargas = build([gym], {
    [addDays(HOY, -2)]: { gym: { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 12 }] }] } },
  });
  soloLargas.settings = { weight: 61.5 };
  assert.equal(derive(soloLargas, HOY).calibracionVencida.length, 1,
    '12 reps sirven para el récord pero no para calibrar');
});

test('fallar una misión no vale lo mismo que fallar todas', () => {
  const diarias = acts(['datos', 'pasos', 'agua', 'frances', 'piano']);
  const dia = (extras) => derive(build(diarias, {
    [LUN]: { datos: { value: 45 }, pasos: { value: 10000 }, agua: { value: 2150 }, ...extras },
  }), LUN);

  // 3 de 5: sin bonus.
  assert.equal(dia({}).bonusXp, 0);
  // 4 de 5 (80%): bonus parcial, pero no es día perfecto.
  const casi = dia({ frances: { sources: { duolingo: 5 } } });
  assert.equal(casi.perfectDays, 0);
  assert.equal(casi.bonusXp, 20);
  assert.equal(casi.daily.get(LUN).almost, true);
  // 5 de 5: bonus completo y estrella.
  const perfecto = dia({ frances: { sources: { duolingo: 5 } }, piano: { value: 30 } });
  assert.equal(perfecto.perfectDays, 1);
  assert.equal(perfecto.bonusXp, 50);
  assert.equal(perfecto.daily.get(LUN).almost, false);
});

test('el récord de un ejercicio de mancuerna queda marcado como tal', () => {
  // Se guarda el peso de una, igual que se anota: mezclarlo con el total
  // haría que un récord de 10 kg pareciera de 20 sin que nada lo aclare.
  const gym = DEFAULT_ACTIVITIES.filter((a) => a.id === 'gym');
  const entries = {
    '2026-09-18': { gym: { exercises: [
      { name: 'Vuelo lateral con mancuerna vertical', db: true, sets: [{ weight: 10, reps: 8 }] },
      { name: 'Press militar', sets: [{ weight: 40, reps: 8 }] },
    ] } },
  };
  const st = derive({ activities: gym, entries, unlocked: {}, settings: { weight: 61.5 } }, '2026-09-20')
    .byActivity.get('gym');
  const porNombre = Object.fromEntries(st.recordList.map((r) => [r.name, r]));
  assert.equal(porNombre['Vuelo lateral con mancuerna vertical'].db, true);
  assert.equal(porNombre['Vuelo lateral con mancuerna vertical'].weight, 10, 'el peso anotado, no el doble');
  assert.equal(porNombre['Press militar'].db, false);
});
