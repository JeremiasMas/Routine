import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES, ACHIEVEMENTS, GYM_TEMPLATES, DEFAULT_SETS, templateById } from '../js/config.js';
import { addDays } from '../js/utils.js';

const HOY = '2026-03-31';   // martes
const acts = (ids) => DEFAULT_ACTIVITIES.filter((a) => ids.includes(a.id));
const build = (activities, entries, settings = {}) => ({ activities, entries, unlocked: {}, settings });

// Una sesión entera de la plantilla: todas las series planificadas hechas.
// Hace falta para los días perfectos, porque la meta del gimnasio son las
// series del día y no "haber ido".
const sesionCompleta = (templateId) => ({
  templateId,
  exercises: templateById(templateId).exercises.map((ex) => ({
    name: ex.name,
    sets: Array.from({ length: ex.sets || DEFAULT_SETS }, () => ({ weight: ex.bw ? 0 : 40, reps: 10 })),
  })),
});

// ---------------------------------------------------------------------------
// Resiliencia
// ---------------------------------------------------------------------------

test('el hueco sólo cuenta si después volviste', () => {
  const piano = acts(['piano'])[0];
  const entries = {
    [addDays(HOY, -40)]: { piano: { value: 30 } },
    [addDays(HOY, -5)]: { piano: { value: 30 } },   // volvió tras 34 días
  };
  assert.equal(derive(build([piano], entries), HOY).maxGap, 34);

  // Un parate que sigue abierto no cuenta: todavía no volviste.
  const abandonado = { [addDays(HOY, -40)]: { piano: { value: 30 } } };
  assert.equal(derive(build([piano], abandonado), HOY).maxGap, 0);
});

test('un escudo que salva una racha larga queda registrado', () => {
  const datos = acts(['datos'])[0];
  const entries = {};
  for (let i = 30; i >= 0; i--) {
    if (i === 8) continue;            // falta un día, con escudos disponibles
    entries[addDays(HOY, -i)] = { datos: { value: 45 } };
  }
  const s = derive(build([datos], entries), HOY);
  assert.ok(s.shieldSaveBest >= 20, `el escudo salvó una racha de ${s.shieldSaveBest}`);
  assert.ok(s.byActivity.get('datos').streak > 20, 'y la racha siguió viva');
});

test('la racha limpia se corta al gastar un escudo', () => {
  const datos = acts(['datos'])[0];
  const conFalta = {};
  for (let i = 40; i >= 0; i--) {
    if (i === 12) continue;
    conFalta[addDays(HOY, -i)] = { datos: { value: 45 } };
  }
  const a = derive(build([datos], conFalta), HOY);
  assert.ok(a.noShieldStreak < a.byActivity.get('datos').streak + 1,
    'la racha sin escudos es menor que la racha total');

  const impecable = {};
  for (let i = 40; i >= 0; i--) impecable[addDays(HOY, -i)] = { datos: { value: 45 } };
  assert.equal(derive(build([datos], impecable), HOY).noShieldStreak, 41);
});

test('remontar después de un mes peor', () => {
  const datos = acts(['datos'])[0];
  const entries = {};
  const cargar = (mes, dias, valor) => {
    for (let d = 1; d <= dias; d++) entries[`${mes}-${String(d).padStart(2, '0')}`] = { datos: { value: valor } };
  };
  cargar('2026-01', 20, 60);   // buen mes
  cargar('2026-02', 20, 20);   // peor
  cargar('2026-03', 20, 60);   // remontada
  assert.equal(derive(build([datos], entries), HOY).remontadas, 1);

  const siempreIgual = {};
  for (const mes of ['2026-01', '2026-02', '2026-03']) {
    for (let d = 1; d <= 20; d++) siempreIgual[`${mes}-${String(d).padStart(2, '0')}`] = { datos: { value: 45 } };
  }
  assert.equal(derive(build([datos], siempreIgual), HOY).remontadas, 0);
});

// ---------------------------------------------------------------------------
// Combinaciones del mismo día
// ---------------------------------------------------------------------------

test('gimnasio y muay thai el mismo día', () => {
  const a = acts(['gym', 'muaythai']);
  const sesion = { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 8 }] }] };
  const juntos = derive(build(a, { [HOY]: { gym: sesion, muaythai: { value: 90 } } }), HOY);
  assert.equal(juntos.combos.dobleSesion, 1);

  const separados = derive(build(a, {
    [addDays(HOY, -1)]: { gym: sesion }, [HOY]: { muaythai: { value: 90 } },
  }), HOY);
  assert.equal(separados.combos.dobleSesion, 0);
});

test('cuerpo y mente pide las tres cosas', () => {
  const a = acts(['datos', 'gym', 'pasos']);
  const sesion = { exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 8 }] }] };
  const completo = derive(build(a, {
    [HOY]: { datos: { value: 45 }, gym: sesion, pasos: { value: 11000 } },
  }), HOY);
  assert.equal(completo.combos.cuerpoYMente, 1);

  const pocosPasos = derive(build(a, {
    [HOY]: { datos: { value: 45 }, gym: sesion, pasos: { value: 6000 } },
  }), HOY);
  assert.equal(pocosPasos.combos.cuerpoYMente, 0, 'sin llegar a los 10.000 no cuenta');
});

test('el día completo es un lunes perfecto', () => {
  const LUN = '2026-03-30';
  const todas = DEFAULT_ACTIVITIES;
  const lunes = derive(build(todas, {
    [LUN]: {
      datos: { value: 45 }, piano: { value: 30 }, pasos: { value: 11000 },
      agua: { value: 2200 }, frances: { sources: { duolingo: 5 } },
      gym: sesionCompleta('espalda-biceps'),
    },
  }, { weight: 61.5 }), LUN);
  assert.equal(lunes.perfectDays, 1);
  assert.equal(lunes.combos.diaCompleto, 1);
});

test('el domingo productivo pide piano, escritura y pasos', () => {
  const DOM = '2026-03-29';
  const a = acts(['piano', 'substack', 'pasos']);
  const s = derive(build(a, {
    [DOM]: { piano: { value: 30 }, substack: { value: 1 }, pasos: { value: 10500 } },
  }), DOM);
  assert.equal(s.combos.domingoProductivo, 1);
});

// ---------------------------------------------------------------------------
// Constancia
// ---------------------------------------------------------------------------

test('el reloj suizo exige las semanas enteras', () => {
  const pasos = acts(['pasos'])[0];
  const entries = {};
  // Tres semanas completas (lunes a domingo) antes de hoy.
  for (let i = 1; i <= 21; i++) entries[addDays('2026-03-29', -i + 1)] = { pasos: { value: 11000 } };
  const s = derive(build([pasos], entries), HOY);
  assert.ok(s.relojSuizo >= 2, `semanas perfectas: ${s.relojSuizo}`);

  // Con un día flojo en el medio se corta.
  entries[addDays('2026-03-29', -10)] = { pasos: { value: 4000 } };
  assert.ok(derive(build([pasos], entries), HOY).relojSuizo < s.relojSuizo);
});

test('sin faltar cuenta días seguidos con algo registrado', () => {
  const a = acts(['datos', 'pasos']);
  const entries = {};
  for (let i = 40; i >= 1; i--) {
    entries[addDays(HOY, -i)] = i % 2 ? { datos: { value: 45 } } : { pasos: { value: 11000 } };
  }
  assert.equal(derive(build(a, entries), HOY).sinFaltar, 40);
});

test('los días desde el primer registro', () => {
  const datos = acts(['datos'])[0];
  const s = derive(build([datos], { [addDays(HOY, -400)]: { datos: { value: 45 } } }), HOY);
  assert.equal(s.diasDesdeElPrimero, 400);
});

test('la concentración mira sólo el último mes', () => {
  const a = acts(['datos', 'pasos']);
  const entries = {};
  for (let i = 20; i >= 1; i--) {
    entries[addDays(HOY, -i)] = { datos: { value: 45 }, pasos: { value: 10000 } };
  }
  const s = derive(build(a, entries), HOY);
  assert.ok(s.concentracionMes > 0.4 && s.concentracionMes < 0.6,
    `con dos actividades parejas debería rondar la mitad, dio ${s.concentracionMes.toFixed(2)}`);
});

test('los episodios del podcast se cuentan aparte de las lecciones', () => {
  const fr = acts(['frances'])[0];
  const s = derive(build([fr], {
    [addDays(HOY, -1)]: { frances: { sources: { duolingo: 5, cbf: 1 } } },
    [HOY]: { frances: { sources: { cbf: 2 } } },
  }), HOY);
  assert.equal(s.sourceTotals.frances.cbf, 3);
  assert.equal(s.sourceTotals.frances.duolingo, 5);
});

// ---------------------------------------------------------------------------
// Robustez del catálogo
// ---------------------------------------------------------------------------

test('ningún logro se rompe con el estado vacío', () => {
  const vacio = derive(build(DEFAULT_ACTIVITIES, {}), HOY);
  for (const def of ACHIEVEMENTS) {
    const p = def.progress(vacio);
    assert.equal(typeof p, 'number', `${def.id} no devolvió un número`);
    assert.ok(Number.isFinite(p), `${def.id} devolvió ${p}`);
    assert.ok(p >= 0, `${def.id} devolvió un progreso negativo`);
  }
});

test('el catálogo está bien formado', () => {
  const ids = new Set();
  const nombres = new Set();
  for (const def of ACHIEVEMENTS) {
    assert.ok(!ids.has(def.id), `id repetido: ${def.id}`);
    assert.ok(!nombres.has(def.name), `nombre repetido: ${def.name}`);
    ids.add(def.id);
    nombres.add(def.name);
    assert.ok(def.target > 0, `${def.id} sin objetivo`);
    assert.ok(def.xp > 0, `${def.id} sin XP`);
    assert.ok(def.desc?.length > 10, `${def.id} sin descripción`);
    assert.ok(def.icon?.length > 0, `${def.id} sin ícono`);
  }
});
