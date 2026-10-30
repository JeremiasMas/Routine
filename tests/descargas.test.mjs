import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanas, esDescarga, metaDeDescarga, tocaDescarga, queTocaHoy, estancados,
  ESTADOS, CADA_CUANTAS_SEMANAS,
} from '../js/descargas.js';
import { derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES, templateForDay, plannedSets } from '../js/config.js';

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const LUNES = '2026-11-23';
const MIERCOLES = '2026-11-25';

// ---------------------------------------------------------------------------
// La semana
// ---------------------------------------------------------------------------

test('una descarga declarada cualquier día cubre la semana entera', () => {
  // Se guarda el lunes, no el día: declararla un miércoles tiene que cubrir
  // el lunes que ya entrenaste.
  assert.deepEqual(semanas([MIERCOLES]), [LUNES]);
  assert.equal(esDescarga([MIERCOLES], LUNES), true, 'el lunes anterior');
  assert.equal(esDescarga([MIERCOLES], '2026-11-27'), true, 'y el viernes');
  assert.equal(esDescarga([MIERCOLES], '2026-11-30'), false, 'pero no la siguiente');
});

test('declarar dos veces la misma semana no la duplica', () => {
  assert.deepEqual(semanas([LUNES, MIERCOLES, '2026-11-27']), [LUNES]);
});

test('una fecha inválida se ignora en vez de romper', () => {
  assert.deepEqual(semanas(['no es fecha', null, undefined, '']), []);
  assert.deepEqual(semanas(null), []);
  assert.equal(esDescarga([LUNES], 'cualquier cosa'), false);
});

test('la meta de descarga es la mitad, redondeada para arriba', () => {
  // Para arriba porque la mitad de 35 es 17,5: pedir 17 sería pedir menos de
  // la mitad, y una serie de más no arruina una descarga.
  assert.equal(metaDeDescarga(39), 20);
  assert.equal(metaDeDescarga(45), 23);
  assert.equal(metaDeDescarga(35), 18);
});

test('una meta rota no devuelve una meta negativa ni cero exigible', () => {
  assert.equal(metaDeDescarga(0), 0);
  assert.equal(metaDeDescarga(-5), 0);
  assert.equal(metaDeDescarga(1), 1, 'nunca pide menos de una serie');
});

// ---------------------------------------------------------------------------
// Lo que hace que valga la pena: el día cuenta como cumplido
// ---------------------------------------------------------------------------

const sesionParcial = (parte) => {
  const t = templateForDay(1);
  return {
    templateId: t.id,
    meta: plannedSets(t),
    exercises: t.exercises.slice(0, Math.ceil(t.exercises.length * parte)).map((ex) => ({
      name: ex.name,
      sets: [{ weight: 40, reps: 10 }, { weight: 40, reps: 10 }, { weight: 40, reps: 10 }],
    })),
  };
};
const estado = (descargas) => derive({
  activities: [gym], entries: { [LUNES]: { gym: sesionParcial(0.5) } }, unlocked: {}, descargas,
}, LUNES).byActivity.get('gym').byDate.get(LUNES);

test('media sesión en semana de descarga es un día cumplido', () => {
  // Es la razón de ser de todo esto: sin esta parte, una descarga bien hecha
  // aparecía como tres días incompletos y la app empujaba a hacer series de
  // más, que es exactamente lo contrario de descargar.
  const dia = estado([LUNES]);
  assert.equal(dia.goal, metaDeDescarga(plannedSets(templateForDay(1))));
  assert.equal(dia.met, true);
  assert.ok(dia.xp >= 100, `esperaba la XP entera, obtuve ${dia.xp}`);
});

test('la misma media sesión sin declarar la descarga queda incompleta', () => {
  // El control del test anterior: si esto también diera cumplido, la descarga
  // no estaría haciendo nada.
  const dia = estado([]);
  assert.equal(dia.met, false);
  assert.ok(dia.xp < 100);
});

test('la descarga sólo le baja la meta al gimnasio', () => {
  // Es una decisión de entrenamiento con fierros: el agua, los pasos y el
  // francés no tienen por qué bajar porque descargues en el gimnasio.
  const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
  const d = derive({
    activities: [agua], entries: { [LUNES]: { agua: { value: 1100 } } },
    unlocked: {}, descargas: [LUNES], settings: { weight: 62 },
  }, LUNES).byActivity.get('agua').byDate.get(LUNES);
  assert.equal(d.met, false, 'media meta de agua sigue siendo media meta');
});

// ---------------------------------------------------------------------------
// Cuándo conviene
// ---------------------------------------------------------------------------

const semanasSeguidas = (n, desde = '2026-09-07') => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${desde}T00:00:00`);
  d.setDate(d.getDate() + i * 7);
  return d.toISOString().slice(0, 10);
});

test('no se recomienda nada antes de tiempo', () => {
  const pocas = semanasSeguidas(CADA_CUANTAS_SEMANAS - 1);
  assert.equal(tocaDescarga(pocas, [], pocas[pocas.length - 1]), null);
});

test('se recomienda por calendario después de varias semanas seguidas', () => {
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 1);
  const r = tocaDescarga(muchas, [], muchas[muchas.length - 1]);
  assert.equal(r.motivo, 'calendario');
  assert.ok(r.semanas >= CADA_CUANTAS_SEMANAS);
});

test('la cuenta arranca de nuevo después de una descarga', () => {
  // Si no, una vez cumplidas las semanas la recomendación no se iría nunca.
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 2);
  const haceUna = muchas[muchas.length - 2];
  assert.equal(tocaDescarga(muchas, [haceUna], muchas[muchas.length - 1]), null);
});

test('en una semana que ya es de descarga no se recomienda descargar', () => {
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 1);
  const hoy = muchas[muchas.length - 1];
  assert.equal(tocaDescarga(muchas, [hoy], hoy), null);
});

test('el estancamiento se recomienda aunque el calendario no lo pida', () => {
  // Es la señal de verdad: querer sumar una repetición y no poder, dos veces
  // seguidas, es fatiga y no el techo.
  const pocas = semanasSeguidas(2);
  const r = tocaDescarga(pocas, [], pocas[1], { estancados: ['Pecho plano', 'Sentadilla con barra'] });
  assert.equal(r.motivo, 'estancamiento');
  assert.deepEqual(r.ejercicios, ['Pecho plano', 'Sentadilla con barra']);
});

test('un solo ejercicio estancado no pide descargar todo', () => {
  // Ese se baja solo, un 10 %, sin tocar el resto del programa.
  const pocas = semanasSeguidas(2);
  assert.equal(tocaDescarga(pocas, [], pocas[1], { estancados: ['Pecho plano'] }), null);
});

test('sin historial no se recomienda nada', () => {
  assert.equal(tocaDescarga([], [], LUNES), null);
  assert.equal(tocaDescarga(null, [], LUNES), null);
  assert.equal(tocaDescarga(['2026-11-23'], [], 'no es fecha'), null);
});

// ---------------------------------------------------------------------------
// El estancamiento
// ---------------------------------------------------------------------------

const sesionDe = (kg, reps) => ({
  entry: { exercises: [{ name: 'Pecho plano', sets: [{ weight: kg, reps }] }] },
});

test('un ejercicio que progresa no figura como estancado', () => {
  assert.deepEqual(estancados([sesionDe(60, 8), sesionDe(60, 9), sesionDe(60, 10)]), []);
});

test('sumar repeticiones cuenta como progreso, no sólo subir el peso', () => {
  // Tres series de 60×10 progresaron respecto de 60×9 aunque el peso no se
  // haya movido: por eso se mira carga por repeticiones y no el peso solo.
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10), sesionDe(60, 11)]), []);
});

test('dos sesiones sin mejorar sí es un estancamiento', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10), sesionDe(60, 10)]), ['Pecho plano']);
});

test('con menos de tres sesiones no se puede hablar de estancamiento', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10)]), []);
});

test('un ejercicio que bajó también está estancado', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 9), sesionDe(60, 8)]), ['Pecho plano']);
});

test('las series sin repeticiones no cuentan como sesión del ejercicio', () => {
  const vacia = { entry: { exercises: [{ name: 'Pecho plano', sets: [{ weight: 60, reps: 0 }] }] } };
  assert.deepEqual(estancados([sesionDe(60, 10), vacia, sesionDe(60, 10)]), [],
    'son dos sesiones reales, no tres');
});

// ---------------------------------------------------------------------------
// Los colores
// ---------------------------------------------------------------------------

test('cada estado tiene nombre y color propios', () => {
  const vistos = new Set();
  for (const [id, e] of Object.entries(ESTADOS)) {
    assert.ok(e.nombre?.length > 2, `${id} sin nombre`);
    assert.match(e.color, /^#[0-9a-f]{6}$/i, `${id} sin color`);
    assert.ok(!vistos.has(e.color), `${e.color} repetido: dos estados del mismo color no se distinguen`);
    vistos.add(e.color);
  }
});

test('la descarga manda sobre lo que diga la progresión', () => {
  // En una semana de descarga no importa que el ejercicio se haya ganado el
  // salto de peso: el salto espera a la semana que viene.
  assert.equal(queTocaHoy({ sube: true }, { descarga: true }), 'descarga');
});

test('fuera de la descarga, el color sale del objetivo', () => {
  assert.equal(queTocaHoy({ sube: true }), 'peso');
  assert.equal(queTocaHoy({ sube: false }), 'reps');
  assert.equal(queTocaHoy(null), 'mantener', 'sin sesión previa no hay qué subir');
});

test('todo estado que devuelve queTocaHoy tiene su entrada en ESTADOS', () => {
  // Si faltara una, la pantalla intentaría leer el color de undefined.
  for (const caso of [[{ sube: true }, {}], [{ sube: false }, {}], [null, {}], [null, { descarga: true }]]) {
    assert.ok(ESTADOS[queTocaHoy(...caso)], `sin entrada para ${JSON.stringify(caso)}`);
  }
});
