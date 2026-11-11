import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, goalFor, goalEnLaFecha, metaDelDia, ANTES_DE_TODO } from '../js/derive.js';
import { DEFAULT_ACTIVITIES, GYM_TEMPLATES, plannedSets, templateById, DEFAULT_SETS } from '../js/config.js';
import { readFileSync } from 'node:fs';

// Cambiar la rutina no puede volver incompletos días que en su momento se
// cumplieron: el pasado se juzga con la meta que regía entonces.

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const viernes = templateById('pecho-piernas');

/** Una sesión como las que guardaba la app vieja: sin meta, 3 series por ejercicio. */
const sesionVieja = (template, ejercicios = template.exercises.length) => ({
  templateId: template.id,
  exercises: template.exercises.slice(0, ejercicios).map((ex) => ({
    name: ex.name,
    sets: Array.from({ length: DEFAULT_SETS }, () => ({ weight: 40, reps: 10 })),
  })),
});

test('la meta guardada en el registro le gana a la rutina de hoy', () => {
  // Es el caso central: una sesión de cuando el viernes pedía 30 series se
  // sigue midiendo contra 30, aunque hoy la rutina pida otra cosa.
  assert.equal(goalFor(gym, { templateId: viernes.id, meta: 30 }), 30);
  assert.notEqual(plannedSets(viernes), 30,
    'si la rutina de hoy pidiera 30, este test no probaría nada');
});

test('una sesión vieja sin meta se reconstruye con tres series por ejercicio', () => {
  // Hasta octubre de 2026 todo ejercicio planeaba DEFAULT_SETS series, así que
  // la meta de ese día era su cantidad de ejercicios por tres.
  const diez = sesionVieja(viernes, 10);
  assert.equal(goalFor(gym, diez), 10 * DEFAULT_SETS);
});

test('un viernes viejo completo sigue contando como completo', () => {
  // La queja concreta: subir el viernes de 30 a 35 series dejó dos sesiones
  // cumplidas marcadas como incompletas, y les bajó la XP.
  const entry = sesionVieja(viernes, 10);
  const total = entry.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const st = derive({
    activities: [gym], entries: { '2026-09-25': { gym: entry } }, unlocked: {},
  }, '2026-10-16').byActivity.get('gym');
  const dia = st.byDate.get('2026-09-25');
  assert.equal(dia.value, total, 'las series que de verdad hizo');
  assert.equal(dia.goal, total, 'medidas contra la meta de entonces');
  assert.equal(dia.met, true, 'y por lo tanto, cumplida');
  assert.equal(dia.xp, 100, 'con la XP entera, no recortada');
});

test('una sesión vieja a medias sigue estando a medias', () => {
  // La reconstrucción no es un perdón general: si ese día dejaste la mitad de
  // los ejercicios sin hacer, el día sigue incompleto.
  const entry = sesionVieja(viernes, 4);
  entry.exercises = entry.exercises.slice(0, 4);
  // El registro tiene 4 ejercicios, pero la sesión de ese día planeaba 10:
  // sólo cuenta como completa si se anotó la rutina entera.
  const conTodos = sesionVieja(viernes, 10);
  conTodos.exercises = conTodos.exercises.map((ex, i) => (i < 4 ? ex : { ...ex, sets: [] }));
  const st = derive({
    activities: [gym], entries: { '2026-09-25': { gym: conTodos } }, unlocked: {},
  }, '2026-10-16').byActivity.get('gym');
  assert.equal(st.byDate.get('2026-09-25').met, false, 'cuatro de diez no es un día cumplido');
});

test('sin registro todavía, la meta es la de la rutina de hoy', () => {
  // Es lo que preguntan la precarga y el widget antes de la primera serie:
  // ahí la rutina vigente es la correcta, no una reconstruida.
  for (const t of GYM_TEMPLATES) {
    assert.equal(goalFor(gym, { templateId: t.id }), plannedSets(t), t.name);
  }
});

test('una sesión libre, sin plantilla ni meta, usa la meta de la actividad', () => {
  assert.equal(goalFor(gym, null), gym.goal);
  assert.equal(goalFor(gym, {}), gym.goal);
});

test('la meta guardada manda incluso sin plantilla', () => {
  // Una sesión libre a la que se le fijó una meta se mide contra esa.
  assert.equal(goalFor(gym, { meta: 24 }), 24);
});

test('una meta guardada corrupta no rompe ni gana', () => {
  const diez = sesionVieja(viernes, 10);
  for (const basura of [0, -5, 'treinta', null, undefined, NaN]) {
    assert.equal(goalFor(gym, { ...diez, meta: basura }), 10 * DEFAULT_SETS,
      `meta ${String(basura)} tiene que caer en la reconstrucción`);
  }
});

test('esto es sólo del gimnasio: las demás actividades no miran la meta del registro', () => {
  const datos = DEFAULT_ACTIVITIES.find((a) => a.id === 'datos');
  assert.equal(goalFor(datos, { meta: 999 }), datos.goal);
  const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
  assert.equal(goalFor(agua, { meta: 999 }), agua.goal);
});

test('el registrador guarda la meta junto con la sesión', () => {
  // La reconstrucción de arriba salva lo ya registrado, pero lo que hace que
  // esto no vuelva a pasar es que la meta viaje en cada sesión nueva. Sin este
  // guardado, el próximo cambio de rutina vuelve a mover el pasado, y ningún
  // test de derive se da cuenta: el agujero se vio en la ronda de mutantes.
  const src = readFileSync('js/ui/logger.js', 'utf8');
  const guardado = src.match(/\(\) => \(\{\s*templateId[^}]*\}\)/);
  assert.ok(guardado, 'no se encontró el objeto que guarda la sesión de gimnasio');
  assert.match(guardado[0], /meta:\s*plannedSets\(/,
    'la sesión que se guarda tiene que llevar su meta calculada de la plantilla');
});

test('agregar un ejercicio a la rutina no vuelve incompletos los días viejos', () => {
  // La condición explícita del pedido: sumar cuádriceps al lunes e isquios al
  // miércoles no puede mover un solo día ya registrado. El día viejo se mide
  // contra SU cantidad de ejercicios, así que la plantilla puede crecer todo
  // lo que quiera sin tocarlo.
  const sesionDe = (template) => ({
    templateId: template.id,
    exercises: template.exercises.slice(0, template.exercises.length - 1).map((ex) => ({
      name: ex.name,
      sets: Array.from({ length: DEFAULT_SETS }, () => ({ weight: 40, reps: 10 })),
    })),
  });
  const entries = {};
  const dias = ['2026-09-21', '2026-09-23', '2026-09-25'];
  GYM_TEMPLATES.forEach((t, i) => { entries[dias[i]] = { gym: sesionDe(t) }; });

  const st = derive({ activities: [gym], entries, unlocked: {} }, '2026-10-19')
    .byActivity.get('gym');
  for (const d of dias) {
    const dia = st.byDate.get(d);
    assert.equal(dia.met, true, `${d} quedó incompleto al crecer la rutina`);
    assert.equal(dia.xp, 100, `${d} perdió XP`);
  }
});

test('una sesión con meta guardada tampoco se mueve al crecer la rutina', () => {
  // El otro camino: las sesiones registradas desde que la meta viaja en el
  // registro se miden contra ese número y nada más.
  const t = GYM_TEMPLATES[0];
  const entry = {
    templateId: t.id,
    meta: 36,                                  // la rutina de aquel día
    exercises: Array.from({ length: 12 }, (_, i) => ({
      name: `Ej${i}`,
      sets: Array.from({ length: DEFAULT_SETS }, () => ({ weight: 40, reps: 10 })),
    })),
  };
  const st = derive({ activities: [gym], entries: { '2026-10-05': { gym: entry } }, unlocked: {} },
    '2026-10-19').byActivity.get('gym');
  const dia = st.byDate.get('2026-10-05');
  assert.notEqual(plannedSets(t), 36, 'la rutina de hoy ya pide otra cosa');
  assert.equal(dia.goal, 36, 'pero el día se mide con la suya');
  assert.equal(dia.met, true);
});

/* ---------------------------------------------------------------------------
   La meta diaria de lo que no es gimnasio
   --------------------------------------------------------------------------- */

const piano = DEFAULT_ACTIVITIES.find((a) => a.id === 'piano');
const LUNES = '2026-10-19';
const HOY = '2026-11-20';
const FRONTERA = '2026-11-11';

/** Sesiones de 30 minutos, como las que ya estaban hechas. */
const sesiones = Object.fromEntries(
  ['2026-10-19', '2026-10-23', '2026-10-26', '2026-10-30'].map((f) => [f, { piano: { value: 30 } }]),
);
const estado = (act, entries = sesiones) => derive(
  { activities: [act], entries, unlocked: {}, descargas: [], pausas: [] }, HOY,
).byActivity.get('piano');
const cumplidos = (st) => [...st.byDate.values()].filter((d) => d.met).length;

test('subir la meta no vuelve incompletos los días que ya cumpliste', () => {
  // El caso de verdad: el piano pedía 30 minutos y pasa a pedir 45. Los meses
  // de sesiones de 30 se cumplieron, porque la meta de entonces era 30.
  const antes = estado({ ...piano, goal: 30 });
  assert.equal(cumplidos(antes), 4, 'con la meta vieja estaban los cuatro cumplidos');

  const sinHistoria = estado({ ...piano, goal: 45 });
  assert.equal(cumplidos(sinHistoria), 0, 'el test no probaría nada si subir la meta no rompiera nada');

  const conHistoria = estado({
    ...piano, goal: 45,
    goalHistory: [{ from: ANTES_DE_TODO, goal: 30 }, { from: FRONTERA, goal: 45 }],
  });
  assert.equal(cumplidos(conHistoria), 4, 'la historia no protegió los días anteriores');
  assert.equal(conHistoria.xp, antes.xp, 'la XP del pasado se movió');
});

test('de la frontera en adelante manda la meta nueva', () => {
  const conNueva = { ...sesiones, '2026-11-13': { piano: { value: 30 } } };
  const st = estado({
    ...piano, goal: 45,
    goalHistory: [{ from: ANTES_DE_TODO, goal: 30 }, { from: FRONTERA, goal: 45 }],
  }, conNueva);
  assert.equal(st.byDate.get('2026-11-13').met, false,
    '30 minutos después de subir la meta no son una sesión cumplida');
  assert.equal(st.byDate.get(LUNES).met, true, 'y los de antes siguen cumplidos');
});

test('goalEnLaFecha resuelve el tramo vigente', () => {
  const act = {
    goal: 45,
    goalHistory: [
      { from: ANTES_DE_TODO, goal: 20 },
      { from: '2026-06-01', goal: 30 },
      { from: FRONTERA, goal: 45 },
    ],
  };
  assert.equal(goalEnLaFecha(act, '2026-01-15'), 20);
  assert.equal(goalEnLaFecha(act, '2026-06-01'), 30, 'el día del cambio ya es meta nueva');
  assert.equal(goalEnLaFecha(act, '2026-10-30'), 30);
  assert.equal(goalEnLaFecha(act, FRONTERA), 45);
  assert.equal(goalEnLaFecha(act, '2027-03-01'), 45);
});

test('sin historia se comporta igual que siempre', () => {
  assert.equal(goalEnLaFecha({ goal: 30 }, LUNES), 30);
  assert.equal(goalEnLaFecha({ goal: 30, goalHistory: [] }, LUNES), 30);
  assert.equal(goalEnLaFecha({ goal: 30 }, null), 30);
  // Tramos sucios no pueden devolver cero y dejar un día sin meta: con meta
  // cero, cualquier valor la cumple y el día se da por hecho sin hacerlo.
  assert.equal(goalEnLaFecha({ goal: 30, goalHistory: [{ from: '', goal: 9 }, { goal: 0 }] }, LUNES), 30);
  assert.equal(goalEnLaFecha({ goal: 30, goalHistory: [{ from: ANTES_DE_TODO, goal: 0 }] }, LUNES), 30,
    'un tramo con fecha válida y meta cero se tomó como meta');
  assert.equal(goalEnLaFecha({ goal: 30, goalHistory: [{ from: ANTES_DE_TODO, goal: -5 }] }, LUNES), 30);
});

test('el agua sigue saliendo del peso, no de la historia', () => {
  // Su meta es automática: no la fija Ajustes y no tiene por qué tener tramos.
  const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
  const conPeso = metaDelDia({ ...agua, goal: 2100 }, LUNES, { pesoCorporal: 61.2 });
  assert.ok(conPeso > 0);
  assert.notEqual(conPeso, metaDelDia({ ...agua, goal: 2100 }, LUNES, { pesoCorporal: 90 }));
});

test('la historia se escribe sola al cambiar la meta en Ajustes', () => {
  // Nadie se acuerda de anotar cuándo cambió una meta; el único momento en
  // que se sabe la fecha es cuando se toca el número.
  const estadoJs = readFileSync('js/state.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(estadoJs, /if \(!historia\.length\) historia\.push\(\{ from: ANTES_DE_TODO, goal: vieja \}\);/,
    'el primer cambio dejó el pasado sin su tramo');
  assert.match(estadoJs, /nueva > 0 && vieja > 0 && nueva !== vieja/,
    'updateActivity dejó de detectar el cambio de meta');
  assert.match(estadoJs, /const mismoDia = historia\.findIndex\(\(t\) => t\.from === hoy\);/,
    'dos cambios el mismo día vuelven a dejar dos tramos');
});
