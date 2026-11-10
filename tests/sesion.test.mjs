import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mezclarSesion } from '../js/sesion.js';
import { GYM_TEMPLATES, DEFAULT_SETS, templateById, DEFAULT_ACTIVITIES } from '../js/config.js';
import { esSerieFiable } from '../js/xp.js';
import { derive } from '../js/derive.js';
import { liftDeEjercicio } from '../js/strength.js';

// Una sesión de gimnasio dura tres cuartos de hora con el teléfono en el
// bolsillo. Si la app se recarga en el medio, lo que vuelve del disco es sólo
// lo que ya anotaste: del registro se guardan nada más que las series con
// repeticiones.

/** Una fila de plantilla: n series vacías con el peso precargado. */
const fila = (name, n = 3, peso = 50) => ({
  id: `t-${name}`, name, db: false,
  sets: Array.from({ length: n }, () => ({ weight: peso, reps: '', target: 10 })),
});
const hecho = (name, series) => ({ name, sets: series.map(([weight, reps]) => ({ weight, reps })) });

test('los ejercicios que faltan vuelven a aparecer', () => {
  // El caso de verdad: registraste el primero y la app se recargó.
  const plantilla = [fila('Pecho plano'), fila('Pecho inclinado'), fila('Pec deck')];
  const r = mezclarSesion(plantilla, [hecho('Pecho plano', [[65, 10], [65, 10], [65, 10]])]);
  assert.deepEqual(r.map((e) => e.name), ['Pecho plano', 'Pecho inclinado', 'Pec deck'],
    'los ejercicios sin registrar se perdieron');
  assert.equal(r[1].sets.length, 3, 'el que falta volvió sin sus series');
  assert.equal(r[1].sets[0].weight, 50, 'el que falta volvió sin el peso precargado');
});

test('las series que faltan de un ejercicio a medio hacer también', () => {
  // Dos de cuatro: las otras dos tienen que estar, vacías y con el peso.
  const r = mezclarSesion([fila('Sillón de cuádriceps', 4, 62.5)],
    [hecho('Sillón de cuádriceps', [[62.5, 12], [62.5, 12]])]);
  assert.equal(r[0].sets.length, 4, 'no completó las series que faltaban');
  assert.deepEqual(r[0].sets.map((s) => s.reps), [12, 12, '', ''],
    'las hechas van primero y las que faltan vacías detrás');
  assert.equal(r[0].sets[3].weight, 62.5, 'la serie que falta vino sin peso precargado');
});

test('lo hecho manda sobre la precarga', () => {
  // Si anotaste 70 donde la plantilla precargaba 50, vale 70.
  const r = mezclarSesion([fila('Remo bajo cerrado', 3, 50)],
    [hecho('Remo bajo cerrado', [[70, 8]])]);
  assert.equal(r[0].sets[0].weight, 70);
  assert.equal(r[0].sets[0].reps, 8);
});

test('lo que agregaste fuera de la rutina se conserva, al final', () => {
  const r = mezclarSesion([fila('Pecho plano'), fila('Pec deck')],
    [hecho('Pecho plano', [[65, 10]]), hecho('Bicicleta', [[0, 20]])]);
  assert.deepEqual(r.map((e) => e.name), ['Pecho plano', 'Pec deck', 'Bicicleta']);
  assert.equal(r[2].sets[0].reps, 20);
});

test('el nombre se compara sin mayúsculas ni espacios de más', () => {
  const r = mezclarSesion([fila('Pec deck')], [hecho('  pec DECK ', [[50, 12]])]);
  assert.equal(r.length, 1, 'duplicó el ejercicio por una mayúscula');
  assert.equal(r[0].sets[0].reps, 12);
});

test('cómo se anotó el número manda sobre lo que diga la plantilla', () => {
  // Un registro viejo puede traer el total donde hoy se anota una mancuerna.
  const base = { ...fila('Aperturas inclinadas'), db: true };
  const r = mezclarSesion([base], [{ name: 'Aperturas inclinadas', db: false, sets: [{ weight: 40, reps: 12 }] }]);
  assert.equal(r[0].db, false, 'pisó cómo estaba anotado el registro guardado');
});

test('sin nada guardado devuelve la plantilla tal cual', () => {
  const plantilla = [fila('Pecho plano'), fila('Pec deck')];
  assert.deepEqual(mezclarSesion(plantilla, []), plantilla);
  assert.deepEqual(mezclarSesion(plantilla), plantilla);
});

test('no rompe con entradas vacías o sucias', () => {
  assert.deepEqual(mezclarSesion([], []), []);
  assert.deepEqual(mezclarSesion(), []);
  assert.deepEqual(mezclarSesion([fila('A')], [{ name: '', sets: [] }, null]).map((e) => e.name), ['A'],
    'un registro sin nombre se coló como ejercicio');
});

test('no comparte objetos con lo guardado', () => {
  // Editar una serie en el formulario no puede tocar el registro de disco.
  const guardado = [hecho('Pecho plano', [[65, 10]])];
  const r = mezclarSesion([fila('Pecho plano')], guardado);
  r[0].sets[0].reps = 99;
  assert.equal(guardado[0].sets[0].reps, 10, 'mutó el registro guardado');
});

/* ---------------------------------------------------------------------------
   Las series que planea la rutina
   --------------------------------------------------------------------------- */

test('hay ejercicios que planean más de tres series', () => {
  // Si esto deja de ser cierto, el test de abajo no prueba nada.
  const conCuatro = GYM_TEMPLATES
    .flatMap((t) => t.exercises)
    .filter((ex) => Number(ex.sets) > DEFAULT_SETS);
  assert.ok(conCuatro.length >= 2, 'ninguna plantilla pide más de tres series');
  assert.ok(conCuatro.some((ex) => ex.name === 'Sillón de cuádriceps'));
  assert.ok(conCuatro.some((ex) => ex.name === 'Camilla de isquiotibiales'));
});

test('el registro abre las series que la rutina planea, no siempre tres', () => {
  // Abría tres y las otras había que agregarlas a mano con el +.
  const logger = readFileSync('js/ui/logger.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(logger, /const seriesDe = \(ex\) => Number\(ex\?\.sets\) \|\| DEFAULT_SETS;/,
    'el registro dejó de leer cuántas series pide la plantilla');
  assert.match(logger, /sets: seedSets\(ex\.name, n\), objetivo: objetivoDe\(ex\.name, n\)/,
    'la precarga volvió a ignorar el número de series del ejercicio');
  assert.ok(!/sets: seedSets\(ex\.name\),/.test(logger),
    'volvió la precarga con el número de series fijo');
});

test('el registro reconstruye la rutina con lo guardado adentro', () => {
  const logger = readFileSync('js/ui/logger.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(logger, /mezclarSesion\(base\.map\(filaDePlantilla\), existing\.exercises\)/,
    'el registro volvió a cargar sólo lo guardado y a descartar la rutina');
  assert.ok(!/exercises = structuredClone\(existing\.exercises\)/.test(logger),
    'volvió el reemplazo de la rutina por lo guardado');
  // Y que la plantilla de verdad tenga más ejercicios que una sesión a medias.
  assert.ok(templateById('pecho-piernas').exercises.length > 3);
});

/* ---------------------------------------------------------------------------
   Las series de más de 12 repeticiones
   --------------------------------------------------------------------------- */

test('un ejercicio que pide 12 a 20 reps puede fijar un récord', () => {
  // La contradicción: la app le prescribe 12-20 a once ejercicios y después
  // no contaba nada arriba de 12. Hacías lo que te pidió y no quedaba nada.
  const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
  const sesion = (date, reps) => ({
    [date]: { gym: { templateId: 'pecho-piernas', meta: 35, exercises: [
      { name: 'Elevaciones de talón', sets: [{ weight: 60, reps }, { weight: 60, reps }] },
      { name: 'Pecho plano', sets: [{ weight: 65, reps: 10 }, { weight: 65, reps: 10 }] },
    ] } },
  });
  const entries = { ...sesion('2026-10-16', 15), ...sesion('2026-10-23', 18), ...sesion('2026-10-30', 20) };
  const st = derive({ activities: [gym], entries, unlocked: {}, descargas: [], pausas: [], settings: { weight: 61.2 } },
    '2026-11-10').byActivity.get('gym');
  const talon = st.records.get('elevaciones de talón');
  assert.ok(talon, 'un ejercicio de rango liviano seguía sin poder tener récord');
  assert.equal(talon.reps, 20);
  assert.equal(talon.weight, 60);
  // Y el de rango medio no se aflojó: 10 reps sigue siendo su récord.
  assert.equal(st.records.get('pecho plano')?.reps, 10);
});

test('el tope ensancha, nunca achica', () => {
  // Los de rango pesado llegan hasta 8. Si el tope pasara a ser el del rango,
  // una serie de 10 dejaría de contar y se perderían récords ya conseguidos.
  assert.equal(esSerieFiable(12), true, 'el tope general bajó de 12');
  assert.equal(esSerieFiable(10, 8), true, 'un rango corto achicó el tope general');
  assert.equal(esSerieFiable(12, 8), true);
  assert.equal(esSerieFiable(20, 20), true, 'el rango no ensanchó el tope');
  assert.equal(esSerieFiable(21, 20), false, 'pasado el rango ya no mide');
  assert.equal(esSerieFiable(13), false, 'sin rango, 13 no puede fijar récord');
  assert.equal(esSerieFiable(0, 20), false);
  assert.equal(esSerieFiable(-3, 20), false);
});

test('aflojar el tope no toca los estándares de fuerza', () => {
  // Es lo que hace seguro el cambio: ningún ejercicio de rango liviano
  // alimenta las escaleras de sentadilla, banca, remo ni dominadas.
  const livianos = GYM_TEMPLATES.flatMap((t) => t.exercises)
    .filter((ex) => ex.rango === 'liviano');
  assert.ok(livianos.length >= 5, 'el test no prueba nada si no hay ejercicios livianos');
  for (const ex of livianos) {
    assert.equal(liftDeEjercicio(ex.name), null,
      `${ex.name} es de rango liviano y alimenta un estándar: aflojar el tope lo ensucia`);
  }
});
