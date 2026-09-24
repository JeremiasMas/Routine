import test from 'node:test';
import assert from 'node:assert/strict';
import {
  strengthProfile, nivelDeFuerza, nivelGeneral, oneRepMax,
  cargaTotal, liftDeEjercicio, usaPesoCorporal, STANDARDS, NIVELES,
} from '../js/strength.js';

const PC = 61.5; // peso corporal

test('reconoce los ejercicios de la rutina que tienen estándar', () => {
  assert.equal(liftDeEjercicio('Sentadilla con barra'), 'squat');
  assert.equal(liftDeEjercicio('pecho plano'), 'bench');
  assert.equal(liftDeEjercicio('Dominadas agarre ancho'), 'pullup');
  assert.equal(liftDeEjercicio('Vuelo lateral con mancuerna vertical'), null,
    'un aislado no tiene estándar de fuerza relativa');
  assert.equal(liftDeEjercicio(''), null);
});

test('la carga de un ejercicio de peso corporal incluye el cuerpo', () => {
  assert.equal(cargaTotal({ weight: 10, bodyweight: PC, isBodyweight: true }), 71.5);
  assert.equal(cargaTotal({ weight: 0, bodyweight: PC, isBodyweight: true }), 61.5);
  assert.equal(cargaTotal({ weight: 60, bodyweight: PC, isBodyweight: false }), 60);
  assert.ok(usaPesoCorporal('pullup') && !usaPesoCorporal('squat'));
});

test('una dominada sin lastre sí tiene 1RM', () => {
  // Antes daba 0 porque el peso cargado era 0.
  const rm = oneRepMax({ weight: 0, reps: 10, bodyweight: PC, isBodyweight: true });
  assert.ok(rm > PC, `esperaba más que el peso corporal, obtuve ${rm}`);
});

test('ubica el ratio en la escala del ejercicio', () => {
  const n = nivelDeFuerza('squat', 1.5, 'm');
  assert.equal(n.name, 'Intermedio');
  assert.equal(n.next, 'Avanzado');
  assert.equal(n.nextRatio, 2.25);
  assert.equal(nivelDeFuerza('squat', 0.4, 'm').name, 'Empezando', 'por debajo del primer umbral');
  assert.equal(nivelDeFuerza('squat', 3, 'm').name, 'Élite');
  assert.equal(nivelDeFuerza('squat', 3, 'm').next, null, 'no hay nivel después de élite');
  assert.equal(nivelDeFuerza('inexistente', 1.5), null);
  assert.equal(nivelDeFuerza('squat', 0), null);
});

test('las escalas van siempre de menor a mayor', () => {
  for (const [key, lift] of Object.entries(STANDARDS)) {
    for (const sexo of ['m', 'f']) {
      const tabla = lift[sexo];
      assert.equal(tabla.length, NIVELES.length, `${key}.${sexo} debe tener ${NIVELES.length} niveles`);
      for (let i = 1; i < tabla.length; i++) {
        assert.ok(tabla[i] > tabla[i - 1], `${key}.${sexo}: el nivel ${i} no supera al anterior`);
      }
    }
  }
});

test('el perfil traduce récords en fuerza relativa y objetivo', () => {
  const perfil = strengthProfile([
    { name: 'Sentadilla con barra', weight: 70, reps: 10, e1rm: 93.3 },
    { name: 'Press militar', weight: 30, reps: 10, e1rm: 40 },
    { name: 'Face pulls', weight: 25, reps: 15, e1rm: 37.5 },
  ], PC, 'm');

  assert.equal(perfil.length, 2, 'los aislados quedan afuera');
  const sentadilla = perfil.find((p) => p.liftKey === 'squat');
  assert.equal(sentadilla.ratio, 1.52);
  assert.equal(sentadilla.nivel.name, 'Intermedio');
  assert.equal(sentadilla.objetivo, 138.4, 'kg de 1RM para llegar a avanzado');
  assert.equal(sentadilla.falta, 45.1);
});

test('se queda con el mejor récord de cada movimiento', () => {
  const perfil = strengthProfile([
    { name: 'Pecho plano', weight: 50, reps: 8, e1rm: 63.3 },
    { name: 'pecho plano', weight: 60, reps: 6, e1rm: 72 },
  ], PC, 'm');
  assert.equal(perfil.length, 1);
  assert.equal(perfil[0].e1rm, 72);
});

test('sin peso corporal no inventa ratios', () => {
  assert.deepEqual(strengthProfile([{ name: 'Sentadilla con barra', e1rm: 100 }], 0, 'm'), []);
  assert.deepEqual(strengthProfile([], PC, 'm'), []);
});

test('la tabla de referencia cambia según la fórmula elegida', () => {
  // 1,2× el peso corporal cae en distinto nivel según la tabla.
  const records = [{ name: 'Sentadilla con barra', weight: 60, reps: 8, e1rm: 73.8 }];
  const conM = strengthProfile(records, PC, 'm')[0];
  const conF = strengthProfile(records, PC, 'f')[0];
  assert.equal(conM.ratio, conF.ratio, 'el ratio es el mismo');
  assert.ok(conF.nivel.index > conM.nivel.index, 'pero el nivel de referencia difiere');
});

test('el nivel general promedia los movimientos con estándar', () => {
  const perfil = strengthProfile([
    { name: 'Sentadilla con barra', weight: 70, reps: 10, e1rm: 93.3 },  // intermedio
    { name: 'Press militar', weight: 30, reps: 10, e1rm: 40 },           // novato
  ], PC, 'm');
  const general = nivelGeneral(perfil);
  assert.equal(general.lifts, 2);
  assert.ok(NIVELES.includes(general.name));
  assert.equal(nivelGeneral([]), null);
});

test('el nivel general promedia posiciones, no kilos', () => {
  // Misma persona: la sentadilla pesa mucho más en kilos que el press militar,
  // pero ambos deben pesar lo mismo en el promedio.
  const soloSentadilla = nivelGeneral(strengthProfile([
    { name: 'Sentadilla con barra', e1rm: 1.5 * PC },   // intermedio
  ], PC, 'm'));
  const conPressFlojo = nivelGeneral(strengthProfile([
    { name: 'Sentadilla con barra', e1rm: 1.5 * PC },   // intermedio
    { name: 'Press militar', e1rm: 0.5 * PC },          // principiante
  ], PC, 'm'));
  assert.ok(conPressFlojo.score < soloSentadilla.score,
    'un movimiento rezagado tiene que bajar el promedio aunque mueva pocos kilos');
  assert.equal(conPressFlojo.weakest.liftKey, 'ohp', 'y queda señalado como el que frena');
});

test('las bandas de fuerza van de Empezando a Élite', () => {
  const banda = (mult) => nivelGeneral(strengthProfile([
    { name: 'Sentadilla con barra', e1rm: mult * PC },
  ], PC, 'm'));
  assert.equal(banda(0.6).name, 'Empezando', 'por debajo del primer umbral');
  assert.equal(banda(1.0).name, 'Principiante');
  assert.equal(banda(1.3).name, 'Novato');
  assert.equal(banda(1.6).name, 'Intermedio');
  assert.equal(banda(2.3).name, 'Avanzado');
  assert.equal(banda(2.8).name, 'Élite');
  assert.equal(banda(2.8).next, null, 'élite no tiene siguiente');
  assert.equal(banda(2.8).pct, 1);
});

test('el nivel de fuerza va de 1 a 6 y sirve como nivel de actividad', () => {
  for (const mult of [0.6, 1.0, 1.3, 1.6, 2.3, 2.8]) {
    const g = nivelGeneral(strengthProfile([{ name: 'Sentadilla con barra', e1rm: mult * PC }], PC, 'm'));
    assert.ok(g.level >= 1 && g.level <= 6, `nivel fuera de rango: ${g.level}`);
    assert.ok(g.pct >= 0 && g.pct <= 1, `progreso fuera de rango: ${g.pct}`);
  }
  assert.equal(nivelGeneral([]), null, 'sin ejercicios con estándar no hay nivel');
});

// ---------------------------------------------------------------------------
// Mancuernas
//
// Dos preguntas que se parecen y no son la misma: cómo anotaste el número
// (una mancuerna o el total) y qué movimiento es (con mancuernas o con barra).
// La primera decide cuántas manos contar; la segunda, contra qué tabla medirte.
// ---------------------------------------------------------------------------

const recordDe = (extra) => ({
  name: 'Press militar', reps: 11, date: '2026-09-23', ...extra,
});

test('el 1RM de un ejercicio con mancuerna cuenta las dos manos', async () => {
  // El tonelaje ya las contaba; el 1RM no. Marcar un ejercicio como de
  // mancuerna le habría partido la fuerza al medio sin que nada fallara.
  const { derive } = await import('../js/derive.js');
  const { DEFAULT_ACTIVITIES } = await import('../js/config.js');
  const gym = DEFAULT_ACTIVITIES.filter((a) => a.id === 'gym');
  const sesion = (peso, db) => ({
    '2026-09-23': { gym: { templateId: 'hombros-triceps', exercises: [
      { name: 'Press militar', ...(db ? { db: true } : {}), sets: [{ weight: peso, reps: 11 }] },
    ] } },
  });
  const unaMano = derive({ activities: gym, entries: sesion(17.5, true), unlocked: {}, settings: { weight: PC } }, '2026-09-24');
  const total = derive({ activities: gym, entries: sesion(35, false), unlocked: {}, settings: { weight: PC } }, '2026-09-24');
  const de = (s) => s.byActivity.get('gym').strength.find((x) => x.liftKey === 'ohp');
  assert.equal(de(unaMano).e1rm, de(total).e1rm,
    'anotar 17,5 por mancuerna y anotar 35 en total tienen que dar lo mismo');
  assert.ok(de(unaMano).e1rm > 40, `dio ${de(unaMano).e1rm}: parece que contó una sola mano`);
});

test('la conversión toca la comparación, no el récord', async () => {
  const { strengthProfile, EQUIV_MANCUERNA } = await import('../js/strength.js');
  const [p] = strengthProfile([recordDe({ e1rm: 47.3, weight: 17.5, conMancuerna: true })], PC);
  assert.equal(p.e1rm, 47.3, 'el récord es lo que de verdad levantaste');
  assert.equal(p.comparable, Math.round(47.3 * EQUIV_MANCUERNA * 10) / 10);
  assert.ok(p.comparable > p.e1rm, 'con mancuernas el equivalente en barra es mayor');
});

test('un movimiento con barra no se convierte', () => {
  const [p] = strengthProfile([recordDe({ name: 'Sentadilla con barra', e1rm: 100, conMancuerna: false })], PC);
  assert.equal(p.conversion, 1);
  assert.equal(p.comparable, p.e1rm);
});

test('con mancuernas el nivel deja de estar subvaluado', () => {
  // 2×17,5 por 11 repeticiones: contra la tabla de barra sin convertir cae en
  // Novato, y es un press que ya vale un Intermedio.
  const sinConvertir = strengthProfile([recordDe({ e1rm: 47.3, conMancuerna: false })], PC)[0];
  const convertido = strengthProfile([recordDe({ e1rm: 47.3, conMancuerna: true })], PC)[0];
  assert.equal(sinConvertir.nivel.name, 'Novato');
  assert.equal(convertido.nivel.name, 'Intermedio');
});

test('lo que falta se dice en kilos reales, no convertidos', () => {
  // "Te faltan X kg" tiene que ser lo que le sumás a la mancuerna, no a una
  // barra que no usás: si no, el número no sirve para nada en el gimnasio.
  const [p] = strengthProfile([recordDe({ e1rm: 47.3, conMancuerna: true })], PC);
  const objetivoEnBarra = p.nivel.nextRatio * PC;
  assert.ok(p.objetivo < objetivoEnBarra,
    `el objetivo real (${p.objetivo}) tiene que ser menor que el de barra (${objetivoEnBarra})`);
  assert.equal(p.falta, Math.round((p.objetivo - p.e1rm) * 10) / 10);
});

test('un registro viejo sin la marca sigue siendo con mancuernas', async () => {
  // Los registros de antes de marcar el ejercicio traen el total y no traen
  // db. Si la conversión mirara cómo se anotó, el historial daría un salto
  // falso justo el día que se agregó la marca.
  const { derive } = await import('../js/derive.js');
  const { DEFAULT_ACTIVITIES } = await import('../js/config.js');
  const gym = DEFAULT_ACTIVITIES.filter((a) => a.id === 'gym');
  const ej = (peso, db) => ({ name: 'Press militar', ...(db ? { db: true } : {}), sets: [{ weight: peso, reps: 11 }] });
  const s = derive({
    activities: gym,
    entries: {
      '2026-09-16': { gym: { templateId: 'hombros-triceps', exercises: [ej(35, false)] } },
      '2026-09-23': { gym: { templateId: 'hombros-triceps', exercises: [ej(17.5, true)] } },
    },
    unlocked: {}, settings: { weight: PC },
  }, '2026-09-24');
  const serie = s.byActivity.get('gym').serieDeEjercicio.get('press militar');
  assert.equal(serie.length, 2);
  assert.equal(serie[0].e1rm, serie[1].e1rm, 'la curva no salta al cambiar cómo se anota');
  assert.equal(s.byActivity.get('gym').strength.find((x) => x.liftKey === 'ohp').nivel.name, 'Intermedio');
});
