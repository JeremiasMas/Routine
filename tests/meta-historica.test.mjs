import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, goalFor } from '../js/derive.js';
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
