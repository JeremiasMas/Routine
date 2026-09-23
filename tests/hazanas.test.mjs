import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../js/derive.js';
import {
  DEFAULT_ACTIVITIES, ACHIEVEMENTS, GYM_TEMPLATES, DEFAULT_SETS, templateById,
} from '../js/config.js';
import { addDays } from '../js/utils.js';

const HOY = '2026-03-31';   // martes
const acts = (ids) => DEFAULT_ACTIVITIES.filter((a) => ids.includes(a.id));
const build = (activities, entries, settings = {}) => ({ activities, entries, unlocked: {}, settings });
const logro = (s, id) => s.achievements.find((a) => a.id === id);

const sesionCompleta = (templateId, peso = 40) => ({
  templateId,
  exercises: templateById(templateId).exercises.map((ex) => ({
    name: ex.name,
    sets: Array.from({ length: ex.sets || DEFAULT_SETS }, () => ({ weight: ex.bw ? 0 : peso, reps: 10 })),
  })),
});

// ---------------------------------------------------------------------------
// Salud del catálogo entero
//
// Con cien logros, el error que no se ve es el peor: un campo mal escrito da
// cero para siempre y nadie se entera hasta que alguien nota que un logro
// nunca avanza.
// ---------------------------------------------------------------------------

/** El resumen que reciben los progress(), tal como lo arma derive. */
function resumenReal() {
  let capturado = null;
  const espia = { ...ACHIEVEMENTS[0], id: '__espia', progress: (s) => { capturado = s; return 0; } };
  ACHIEVEMENTS.push(espia);
  try {
    derive(build(DEFAULT_ACTIVITIES, { [HOY]: { datos: { value: 60 } } }), HOY);
  } finally {
    ACHIEVEMENTS.pop();
  }
  return capturado;
}

test('cada logro lee campos que el resumen de verdad trae', () => {
  const resumen = resumenReal();
  assert.ok(resumen, 'no pude capturar el resumen');
  // Los dos que cuentan logros se evalúan en una segunda pasada, así que sus
  // campos no existen todavía cuando se arma el resumen.
  const SEGUNDA_PASADA = new Set(['logrosDesbloqueados', 'logrosTotales']);
  const faltan = [];
  for (const def of ACHIEVEMENTS) {
    for (const m of def.progress.toString().matchAll(/\bs\.(\w+)/g)) {
      if (SEGUNDA_PASADA.has(m[1])) continue;
      if (!(m[1] in resumen)) faltan.push(`${def.id} lee s.${m[1]}`);
    }
  }
  assert.deepEqual(faltan, [], `campos inexistentes:\n  ${faltan.join('\n  ')}`);
});

test('ningún logro tiene el id, el nombre o el icono repetido', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length,
    `ids repetidos: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')}`);
  const nombres = ACHIEVEMENTS.map((a) => a.name);
  assert.equal(new Set(nombres).size, nombres.length,
    `nombres repetidos: ${nombres.filter((x, i) => nombres.indexOf(x) !== i).join(', ')}`);
});

test('todos declaran lo mínimo para poder mostrarse', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name?.length > 2, `${a.id} sin nombre`);
    assert.ok(a.icon?.length >= 1, `${a.id} sin icono`);
    assert.ok(a.desc?.length > 10, `${a.id} sin descripción`);
    assert.ok(a.xp > 0, `${a.id} no da XP`);
    assert.ok(a.target > 0, `${a.id} no tiene meta`);
    assert.equal(typeof a.progress, 'function', `${a.id} sin progress`);
  }
});

test('con la app recién instalada no se desbloquea ninguno', () => {
  // Un logro que arranca desbloqueado no es un logro: es un cartel.
  const s = derive(build(DEFAULT_ACTIVITIES, {}), HOY);
  const regalados = s.achievements.filter((a) => a.unlocked).map((a) => a.id);
  assert.deepEqual(regalados, [], `se regalan solos: ${regalados.join(', ')}`);
});

test('con un solo registro tampoco se cuela ninguno de más', () => {
  const s = derive(build(DEFAULT_ACTIVITIES, { [HOY]: { datos: { value: 45 } } }), HOY);
  const abiertos = s.achievements.filter((a) => a.unlocked).map((a) => a.id);
  assert.deepEqual(abiertos, ['first-blood'], `de más: ${abiertos.join(', ')}`);
});

test('ningún progreso da NaN ni infinito', () => {
  // Un NaN en la barra de progreso se ve como una barra vacía para siempre.
  for (const vacio of [{}, { [HOY]: { datos: { value: 45 } } }]) {
    const s = derive(build(DEFAULT_ACTIVITIES, vacio), HOY);
    for (const a of s.achievements) {
      assert.ok(Number.isFinite(a.progress), `${a.id} da ${a.progress}`);
      assert.ok(Number.isFinite(a.pct), `${a.id} tiene pct ${a.pct}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Fuerza
// ---------------------------------------------------------------------------

const PESO = 61.5;
const perfilCon = (ejercicios) => build(acts(['gym']), {
  [addDays(HOY, -1)]: { gym: { templateId: 'pecho-piernas', exercises: ejercicios } },
}, { weight: PESO, height: 160 });

test('la sentadilla de 100 kg se mide en 1RM estimado, no en la barra', () => {
  // 90 × 5 estima ~101 kg: el logro habla de 1RM y así hay que leerlo.
  const s = derive(perfilCon([{ name: 'Sentadilla con barra', sets: [{ weight: 90, reps: 5 }] }]), HOY);
  assert.ok(logro(s, 'squat-100').unlocked, `dio ${logro(s, 'squat-100').progress}`);

  const flojo = derive(perfilCon([{ name: 'Sentadilla con barra', sets: [{ weight: 70, reps: 5 }] }]), HOY);
  assert.equal(logro(flojo, 'squat-100').unlocked, false);
});

test('"avanzado en todo" pide los siete movimientos, no uno solo', () => {
  // Con un único ejercicio brutal no alcanza: contarlo sería premiar
  // justamente al que sólo entrena una cosa.
  const s = derive(perfilCon([{ name: 'Sentadilla con barra', sets: [{ weight: 160, reps: 3 }] }]), HOY);
  assert.ok((logro(s, 'squat-avanzado')).unlocked, 'la sentadilla sí llega a Avanzado');
  assert.equal(logro(s, 'avanzado-todo').progress, 0, 'pero el de los siete no avanza');
});

test('el lastre de las dominadas es el peso extra, no el total', () => {
  const s = derive(perfilCon([
    { name: 'Dominadas agarre ancho', bw: true, sets: [{ weight: 12, reps: 5 }] },
  ]), HOY);
  assert.ok(logro(s, 'pullup-10').unlocked, 'con 12 kg de lastre sí');
  assert.equal(logro(s, 'pullup-30').unlocked, false, 'con 12 no llega a 30');
});

test('los tres grandes suman sólo si están los tres medidos', () => {
  const dos = derive(perfilCon([
    { name: 'Sentadilla con barra', sets: [{ weight: 120, reps: 3 }] },
    { name: 'Pecho plano', sets: [{ weight: 90, reps: 3 }] },
  ]), HOY);
  assert.equal(dos.ratioTresGrandes, 0, 'sin press militar no hay suma');

  const tres = derive(perfilCon([
    { name: 'Sentadilla con barra', sets: [{ weight: 120, reps: 3 }] },
    { name: 'Pecho plano', sets: [{ weight: 90, reps: 3 }] },
    { name: 'Press militar', sets: [{ weight: 60, reps: 3 }] },
  ]), HOY);
  assert.ok(tres.ratioTresGrandes > 4, `dio ${tres.ratioTresGrandes}`);
  assert.ok(logro(tres, 'tres-grandes').unlocked);
});

test('la simetría no se regala por no tener nada medido', () => {
  // No saber no es estar equilibrado.
  const s = derive(build(DEFAULT_ACTIVITIES, {}), HOY);
  assert.equal(logro(s, 'simetria').unlocked, false);
});

test('el tonelaje de una sesión cuenta las dos manos en mancuerna', () => {
  const s = derive(build(acts(['gym']), {
    [addDays(HOY, -1)]: { gym: { templateId: 'hombros-triceps', exercises: [
      { name: 'Vuelo lateral con mancuerna vertical', db: true, sets: [{ weight: 10, reps: 10 }] },
    ] } },
  }, { weight: PESO }), HOY);
  assert.equal(s.tonelajeMaxSesion, 200, '10 kg × 10 reps × 2 manos');
});

test('la progresión limpia se corta cuando el 1RM baja', () => {
  const dia = (n, peso) => [addDays(HOY, -n), { gym: { templateId: 'pecho-piernas', exercises: [
    { name: 'Pecho plano', sets: [{ weight: peso, reps: 5 }] }] } }];
  const s = derive(build(acts(['gym']), Object.fromEntries([
    dia(30, 50), dia(25, 52.5), dia(20, 55), dia(15, 45), dia(10, 47.5), dia(5, 50),
  ]), { weight: PESO }), HOY);
  assert.equal(s.progresionLimpia, 3, 'las tres últimas, después de la caída');
});

// ---------------------------------------------------------------------------
// Rachas
// ---------------------------------------------------------------------------

/** Un día en que se cumple todo lo que toca. */
const diaPerfecto = (fecha) => {
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  const plantilla = GYM_TEMPLATES.find((t) => t.day === dow);
  return {
    datos: { value: 60 }, pasos: { value: 12000 }, agua: { value: 3000 },
    frances: { sources: { duolingo: 10 } },
    ...(plantilla ? { gym: sesionCompleta(plantilla.id) } : {}),
    ...([1, 5, 6, 0].includes(dow) ? { piano: { value: 40 } } : {}),
    ...([2, 4].includes(dow) ? { muaythai: { value: 90 } } : {}),
  };
};

test('la racha de días perfectos cuenta seguidos, no acumulados', () => {
  const entries = {};
  for (let i = 9; i >= 3; i--) entries[addDays(HOY, -i)] = diaPerfecto(addDays(HOY, -i));
  // Un hueco, y después dos más: son 7 seguidos, no 9.
  entries[addDays(HOY, -1)] = diaPerfecto(addDays(HOY, -1));
  const s = derive(build(DEFAULT_ACTIVITIES, entries, { weight: PESO, height: 160 }), HOY);
  assert.equal(s.perfectStreak, 7);
  assert.ok(logro(s, 'perfectos-7').unlocked);
  assert.equal(logro(s, 'perfectos-30').unlocked, false);
});

test('el trimestre invicto pide las tres metas semanales a la vez', () => {
  const entries = {};
  // Catorce semanas de gimnasio y muay thai, pero sin escribir nunca.
  for (let i = 100; i >= 0; i--) {
    const f = addDays(HOY, -i);
    const dow = new Date(`${f}T00:00:00Z`).getUTCDay();
    if ([1, 3, 5].includes(dow)) entries[f] = { gym: sesionCompleta('espalda-biceps') };
    if ([2, 4].includes(dow)) entries[f] = { muaythai: { value: 90 } };
  }
  const sinEscribir = derive(build(acts(['gym', 'muaythai', 'substack']), entries, { weight: PESO }), HOY);
  assert.equal(sinEscribir.trimestreInvicto, 0, 'falta Substack');

  for (let i = 100; i >= 0; i--) {
    const f = addDays(HOY, -i);
    if (new Date(`${f}T00:00:00Z`).getUTCDay() === 0) entries[f] = { ...entries[f], substack: { value: 1 } };
  }
  const completo = derive(build(acts(['gym', 'muaythai', 'substack']), entries, { weight: PESO }), HOY);
  assert.ok(completo.trimestreInvicto >= 13, `dio ${completo.trimestreInvicto}`);
  assert.ok(logro(completo, 'invicto').unlocked);
});

// ---------------------------------------------------------------------------
// Rareza
// ---------------------------------------------------------------------------

test('el logro nocturno no se gana editando un registro viejo', () => {
  // Corregir el lunes a las tres de la mañana del jueves no es entrenar de
  // noche: la marca de tiempo tiene que caer en el mismo día del registro.
  const lunes = addDays(HOY, -8);
  const editadoTarde = derive(build(acts(['datos']), {
    [lunes]: { datos: { value: 60, updatedAt: new Date(`${addDays(HOY, -1)}T02:30:00`).toISOString() } },
  }), HOY);
  assert.equal(editadoTarde.nocturno, 0, 'editado otro día: no cuenta');

  const deVerdad = derive(build(acts(['datos']), {
    [lunes]: { datos: { value: 60, updatedAt: new Date(`${lunes}T02:30:00`).toISOString() } },
  }), HOY);
  assert.equal(deVerdad.nocturno, 1);
});

test('cinco registros de la misma madrugada son una sola noche', () => {
  const dia = addDays(HOY, -2);
  const marca = new Date(`${dia}T05:30:00`).toISOString();
  const s = derive(build(acts(['datos', 'pasos', 'agua']), {
    [dia]: {
      datos: { value: 60, updatedAt: marca },
      pasos: { value: 12000, updatedAt: marca },
      agua: { value: 3000, updatedAt: marca },
    },
  }), HOY);
  assert.equal(s.madrugador, 1);
});

test('un registro sin marca de tiempo no cuenta como madrugada', () => {
  // Los pasos los escribe Health Connect y una copia importada llega sin
  // hora: sin esto, restaurar un respaldo regalaría los logros de horario.
  const s = derive(build(acts(['datos', 'pasos']), {
    [addDays(HOY, -2)]: { datos: { value: 60 }, pasos: { value: 12000 } },
  }), HOY);
  assert.equal(s.madrugador, 0);
  assert.equal(s.nocturno, 0);
});

test('las fechas señaladas salen del calendario, no de la posición', () => {
  const s = derive(build(acts(['datos']), {
    '2026-12-25': { datos: { value: 60 } },
    '2026-01-01': { datos: { value: 60 } },
  }), '2026-12-31');
  assert.equal(s.navidad, 1);
  assert.equal(s.anoNuevo, 1);
});

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

test('los logros que cuentan logros no se cuentan a sí mismos', () => {
  // Si se contaran, "Completista" sería imposible por construcción.
  const s = derive(build(DEFAULT_ACTIVITIES, { [HOY]: { datos: { value: 60 } } }), HOY);
  assert.equal(s.logrosTotales, ACHIEVEMENTS.filter((a) => !a.meta).length);
  assert.ok(s.logrosTotales < ACHIEVEMENTS.length, 'hay logros meta');
});

test('el coleccionista se desbloquea a la mitad', () => {
  const s = derive(build(DEFAULT_ACTIVITIES, { [HOY]: { datos: { value: 60 } } }), HOY);
  const def = ACHIEVEMENTS.find((a) => a.id === 'coleccionista');
  const mitad = Math.ceil(s.logrosTotales / 2);
  assert.equal(def.progress({ logrosDesbloqueados: mitad - 1, logrosTotales: s.logrosTotales }), 0);
  assert.equal(def.progress({ logrosDesbloqueados: mitad, logrosTotales: s.logrosTotales }), 1);
});

test('el completista pide todos los demás', () => {
  const def = ACHIEVEMENTS.find((a) => a.id === 'completista');
  assert.equal(def.progress({ logrosDesbloqueados: 96, logrosTotales: 97 }), 0);
  assert.equal(def.progress({ logrosDesbloqueados: 97, logrosTotales: 97 }), 1);
  assert.equal(def.progress({ logrosDesbloqueados: 0, logrosTotales: 0 }), 0, 'cero de cero no cuenta');
});
