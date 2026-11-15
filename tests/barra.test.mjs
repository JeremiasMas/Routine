import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  candidatosDeBarra, previaDeBarra, corregirBarra, barrasDe, barraDe, barraValida,
  alinearBarras, BARRA_ASUMIDA, BARRA_MIN, BARRA_MAX,
} from '../js/barra.js';
import { derive } from '../js/derive.js';
import { fusionar } from '../js/merge.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

// Los pesos con barra se anotan con la barra incluida, y la barra se supone
// de 20 kg. Si pesa otra cosa, todos esos registros están corridos. Esto los
// corrige de una vez sin tocar nada más que el peso: un día cumplido tiene
// que seguir cumplido.

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const piano = DEFAULT_ACTIVITIES.find((a) => a.id === 'piano');
const HORA = '2026-10-02T19:30:00.000Z';

const sets = (peso, reps = [8, 8, 8]) => reps.map((r) => ({ weight: peso, reps: r }));

/** Tres viernes con barra, mancuernas, polea y peso corporal mezclados. */
const datos = () => ({
  activities: [gym, piano],
  settings: {},
  unlocked: {},
  entries: {
    '2026-10-02': {
      gym: {
        templateId: 'pecho-piernas', meta: 12, updatedAt: HORA,
        exercises: [
          { name: 'Sentadilla con barra', sets: sets(60) },
          { name: 'Peso muerto rumano', sets: sets(70) },
          { name: 'Aperturas inclinadas', db: true, sets: sets(12) },
          { name: 'Pec deck', sets: sets(45) },
        ],
      },
      piano: { value: 30, updatedAt: HORA },
    },
    '2026-10-09': {
      gym: {
        templateId: 'pecho-piernas', meta: 12, updatedAt: '2026-10-09T19:30:00.000Z',
        exercises: [
          { name: 'sentadilla con barra ', sets: sets(62.5, [8, 7, 6]) },
          { name: 'Peso muerto rumano', sets: sets(70) },
          { name: 'Dominadas agarre ancho', bw: true, sets: sets(5) },
          { name: 'Pec deck', sets: sets(47.5) },
        ],
      },
    },
    '2026-10-12': {
      gym: {
        templateId: 'espalda-biceps', meta: 6, updatedAt: '2026-10-12T19:30:00.000Z',
        exercises: [
          { name: 'Remo con barra al pecho', sets: sets(40) },
          { name: 'Curl en polea baja con barra', sets: sets(25) },
        ],
      },
    },
  },
});

const pesos = (data, fecha, nombre) => data.entries[fecha].gym.exercises
  .find((e) => e.name.trim().toLowerCase() === nombre.toLowerCase()).sets.map((s) => s.weight);

test('los candidatos son los que tienen peso y no son de mancuerna ni de peso corporal', () => {
  const c = candidatosDeBarra(datos());
  assert.deepEqual(c.map((f) => f.nombre), [
    // En el orden de la rutina: lunes primero, viernes después.
    'Remo con barra al pecho', 'Curl en polea baja con barra',
    'Pec deck', 'Sentadilla con barra', 'Peso muerto rumano',
  ]);
});

test('cada candidato dice cuántas sesiones, cuántas series y su máximo', () => {
  const sentadilla = candidatosDeBarra(datos()).find((f) => f.clave === 'sentadilla con barra');
  // El nombre con otra caja y un espacio de más es el mismo ejercicio.
  assert.deepEqual(sentadilla, {
    clave: 'sentadilla con barra', nombre: 'Sentadilla con barra',
    sesiones: 2, series: 6, maximo: 62.5, barra: BARRA_ASUMIDA,
  });
});

test('un ejercicio de mancuerna según la rutina no es candidato aunque el registro no lo marque', () => {
  const d = datos();
  // Los registros viejos no guardaban `db`: manda la rutina.
  d.entries['2026-10-02'].gym.exercises.push({ name: 'French press', sets: sets(10) });
  assert.equal(candidatosDeBarra(d).some((f) => f.clave === 'french press'), false);
  // Pero si la sesión dice explícitamente que fue a peso total, sí.
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Press militar', db: false, sets: sets(40) });
  assert.equal(candidatosDeBarra(d).some((f) => f.clave === 'press militar'), true);
});

test('lo que se hace con el propio cuerpo no es candidato, lo diga el registro o la rutina', () => {
  const d = datos();
  // Marcado en el registro, y la rutina no lo conoce.
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Flexiones lastradas', bw: true, sets: sets(10) });
  // Sin marca en el registro, pero la rutina sabe que es de peso corporal.
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Fondo de tríceps', sets: sets(10) });
  const claves = candidatosDeBarra(d).map((f) => f.clave);
  assert.equal(claves.includes('flexiones lastradas'), false);
  assert.equal(claves.includes('fondo de tríceps'), false);
});

test('las series sin peso no hacen candidato a un ejercicio', () => {
  const d = datos();
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Plancha', sets: sets(0) });
  assert.equal(candidatosDeBarra(d).some((f) => f.clave === 'plancha'), false);
});

test('la previa cuenta lo que cambiaría y no toca nada', () => {
  const d = datos();
  const antes = JSON.stringify(d);
  const p = previaDeBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15 });
  assert.equal(JSON.stringify(d), antes, 'la previa modificó los datos');
  assert.equal(p.series, 12);
  assert.equal(p.sesiones, 2);
  assert.deepEqual(p.filas.find((f) => f.clave === 'sentadilla con barra'), {
    clave: 'sentadilla con barra', nombre: 'Sentadilla con barra',
    de: 20, a: 15, delta: -5, series: 6, sesiones: 2, maximoAntes: 62.5, maximoDespues: 57.5,
  });
});

test('corregir resta la diferencia sólo en los ejercicios elegidos', () => {
  const d = datos();
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.equal(r.series, 6);
  // Un ejercicio en dos viernes son dos sesiones, no una.
  assert.equal(r.sesiones, 2);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.deepEqual(pesos(d, '2026-10-09', 'Sentadilla con barra'), [57.5, 57.5, 57.5]);
  // Lo no elegido queda igual: ni el otro de barra, ni la máquina.
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [70, 70, 70]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Pec deck'), [45, 45, 45]);
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [40, 40, 40]);
});

test('una barra más pesada que la supuesta suma en vez de restar', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 22.5 });
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [42.5, 42.5, 42.5]);
});

test('los decimales no arrastran basura de coma flotante', () => {
  const d = datos();
  // 57,4 − 2,7 da 54,699999999999996 si nadie redondea, y 17,3 − 20 da
  // −2,6999999999999993.
  d.entries['2026-10-02'].gym.exercises[0].sets = sets(57.4);
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 17.3 });
  assert.equal(r.filas[0].delta, -2.7);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [54.7, 54.7, 54.7]);
  assert.deepEqual(pesos(d, '2026-10-09', 'Sentadilla con barra'), [59.8, 59.8, 59.8]);
});

test('no cambia series, repeticiones, meta ni rutina: sólo el peso', () => {
  const d = datos();
  // Tampoco la hora del registro: de ella salen los logros por horario, y
  // corregir un peso meses después no puede borrar una madrugada.
  const forma = (x) => JSON.stringify(x, (k, v) => (k === 'weight' || k === 'barra' ? undefined : v));
  const antes = forma(d);
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano', 'Remo con barra al pecho'], kg: 15 });
  assert.equal(forma(d), antes);
  assert.equal(d.entries['2026-10-02'].gym.updatedAt, HORA);
});

test('un día cumplido sigue cumplido, y con la misma XP base', () => {
  const d = datos();
  const dias = (data) => {
    const st = derive(data, '2026-10-16').byActivity.get('gym');
    return [...st.byDate.entries()].map(([f, x]) => [f, x.value, x.goal, x.met]);
  };
  const antes = dias(d);
  assert.ok(antes.some(([, , , met]) => met), 'el fixture no tiene ningún día cumplido: no prueba nada');
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano', 'Remo con barra al pecho'], kg: 15 });
  assert.deepEqual(dias(d), antes);
});

test('los récords se recalculan con el peso real', () => {
  const d = datos();
  const record = (data) => derive(data, '2026-10-16').byActivity.get('gym').records.get('sentadilla con barra');
  assert.equal(record(d).weight, 62.5);
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.equal(record(d).weight, 57.5);
});

test('corregir dos veces lo mismo no vuelve a restar', () => {
  const d = datos();
  const cambio = { ejercicios: ['Sentadilla con barra'], kg: 15 };
  corregirBarra(d, cambio);
  const una = JSON.stringify(d);
  const otra = corregirBarra(d, cambio);
  assert.equal(otra.series, 0);
  assert.deepEqual(otra.filas, []);
  assert.equal(JSON.stringify(d), una);
  // Y la previa ya lo avisa antes de tocar el botón.
  assert.equal(previaDeBarra(d, cambio).series, 0);
});

test('queda anotado con qué barra está cada ejercicio', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra '], kg: 15 });
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': 15 });
  assert.equal(barraDe(d.settings, 'SENTADILLA CON BARRA'), 15);
  assert.equal(barraDe(d.settings, 'Peso muerto rumano'), BARRA_ASUMIDA);
  assert.equal(candidatosDeBarra(d).find((f) => f.clave === 'sentadilla con barra').barra, 15);
});

test('un ejercicio que te olvidaste se corrige después sin volver a tocar los otros', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15 });
  assert.deepEqual(r.filas.map((f) => f.clave), ['peso muerto rumano']);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [65, 65, 65]);
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': 15, 'peso muerto rumano': 15 });
});

test('cada barra con su peso: corregir una no toca lo que se hace con otra', () => {
  // La del rack pesa 15 y la corta del remo, 10.
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15 });
  const r = corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 10 });
  assert.deepEqual(r.filas.map((f) => [f.clave, f.de, f.a, f.delta]), [['remo con barra al pecho', 20, 10, -10]]);
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [30, 30, 30]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [65, 65, 65]);
  assert.deepEqual(d.settings.barra, {
    'sentadilla con barra': 15, 'peso muerto rumano': 15, 'remo con barra al pecho': 10,
  });
  assert.equal(barraDe(d.settings, 'Remo con barra al pecho'), 10);
  assert.equal(barraDe(d.settings, 'Sentadilla con barra'), 15);
});

test('con varias barras, fusionar lleva cada ejercicio a la suya', () => {
  const corregida = datos();
  corregirBarra(corregida, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  corregirBarra(corregida, { ejercicios: ['Remo con barra al pecho'], kg: 10 });
  const r = fusionar(datos(), corregida);
  assert.equal(r.entries['2026-10-02'].gym.exercises[0].sets[0].weight, 55);
  assert.equal(r.entries['2026-10-12'].gym.exercises[0].sets[0].weight, 30);
  assert.deepEqual(r.barra, { 'sentadilla con barra': 15, 'remo con barra al pecho': 10 });
  assert.equal(r.resumen.barraAjustadas, 9);
});

test('cambiar de opinión corrige desde la barra anotada, no desde 20', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 17.5 });
  assert.equal(r.filas[0].de, 15);
  assert.equal(r.filas[0].delta, 2.5);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [57.5, 57.5, 57.5]);
});

test('volver a 20 deshace la corrección y limpia la anotación', () => {
  const d = datos();
  const original = JSON.stringify(d);
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15 });
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 20 });
  assert.equal(JSON.stringify(d), original);
});

test('deshacer uno solo deja anotado el otro', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15 });
  corregirBarra(d, { ejercicios: ['Peso muerto rumano'], kg: 20 });
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': 15 });
});

test('una serie que no pudo incluir la barra se deja como está, y se cuenta', () => {
  const d = datos();
  // 4 kg "con barra de 20" no existe: restarle 5 daría −1. Y la de 5 daría 0.
  d.entries['2026-10-02'].gym.exercises[0].sets = [
    { weight: 60, reps: 8 }, { weight: 4, reps: 8 }, { weight: 5, reps: 8 }, { weight: 0, reps: 8 },
  ];
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 4, 5, 0]);
  assert.equal(r.sinTocar, 3);
  assert.equal(r.series, 1 + 3);
});

test('una serie sin peso no se convierte en la diferencia cuando la barra pesa más', () => {
  const d = datos();
  d.entries['2026-10-12'].gym.exercises[0].sets = [{ weight: 40, reps: 8 }, { weight: 0, reps: 8 }];
  const r = corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 22.5 });
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [42.5, 0]);
  assert.equal(r.sinTocar, 1);
});

test('una sesión donde no se tocó ninguna serie no cuenta', () => {
  const d = datos();
  d.entries['2026-10-09'].gym.exercises[0].sets = sets(0);
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.equal(r.sesiones, 1);
  assert.equal(r.filas[0].sesiones, 1);
  // Y un ejercicio elegido sin nada que tocar no aparece como cambio.
  const otro = datos();
  otro.entries['2026-10-12'].gym.exercises[0].sets = sets(0);
  assert.deepEqual(corregirBarra(otro, { ejercicios: ['Remo con barra al pecho'], kg: 15 }).filas, []);
});

test('una sesión hecha con mancuernas no se toca aunque el ejercicio esté elegido', () => {
  const d = datos();
  d.entries['2026-10-09'].gym.exercises[0].db = true;
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.deepEqual(pesos(d, '2026-10-09', 'Sentadilla con barra'), [62.5, 62.5, 62.5]);
  assert.equal(r.sesiones, 1);
});

test('sólo se tocan los registros de gimnasio', () => {
  const d = datos();
  d.entries['2026-10-02'].piano.exercises = [{ name: 'Sentadilla con barra', sets: sets(60) }];
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.equal(d.entries['2026-10-02'].piano.exercises[0].sets[0].weight, 60);
});

test('un peso de barra que no es una barra no hace nada', () => {
  for (const kg of [0, -5, 'quince', null, undefined, NaN, BARRA_MAX + 0.5, BARRA_MIN - 0.5]) {
    const d = datos();
    const antes = JSON.stringify(d);
    const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg });
    assert.equal(r.series, 0, `aceptó ${kg}`);
    assert.equal(JSON.stringify(d), antes, `tocó los datos con ${kg}`);
  }
  assert.equal(barraValida(BARRA_MIN), true);
  assert.equal(barraValida(BARRA_MAX), true);
  assert.equal(barraValida('15'), true);
});

test('sin ejercicios elegidos no hace nada', () => {
  const d = datos();
  const antes = JSON.stringify(d);
  assert.equal(corregirBarra(d, { ejercicios: [], kg: 15 }).series, 0);
  assert.equal(corregirBarra(d, { ejercicios: ['', '  '], kg: 15 }).series, 0);
  assert.equal(corregirBarra(d, { kg: 15 }).series, 0);
  assert.equal(JSON.stringify(d), antes);
  // Ni siquiera reescribe la anotación guardada.
  const sucio = datos();
  sucio.settings.barra = { 'sentadilla con barra': 15, 'pec deck': 'mucho' };
  corregirBarra(sucio, { ejercicios: [], kg: 15 });
  assert.deepEqual(sucio.settings.barra, { 'sentadilla con barra': 15, 'pec deck': 'mucho' });
});

test('una anotación guardada con basura se ignora', () => {
  const sucio = { barra: { 'sentadilla con barra': 15, 'pec deck': 'mucho', '': 10, 'remo': 900 } };
  assert.deepEqual([...barrasDe(sucio)], [['sentadilla con barra', 15]]);
  assert.equal(barrasDe({ barra: [15] }).size, 0);
  assert.equal(barrasDe({ barra: 'quince' }).size, 0);
  assert.equal(barrasDe(undefined).size, 0);
});

// ── Fusionar dos copias ───────────────────────────────────────────────────
//
// Cada copia es coherente con su propia anotación. Lo que no se puede hacer
// es unirlas serie por serie cuando una está corregida y la otra no.

const sentadilla = (entries, fecha) => entries[fecha].gym.exercises[0].sets[0].weight;
const CORREGIR = { ejercicios: ['Sentadilla con barra'], kg: 15 };

test('sin ninguna corrección, alinear no toca ni copia nada', () => {
  const a = datos();
  const b = datos();
  const r = alinearBarras(a, b);
  assert.equal(r.local, a);
  assert.equal(r.entrante, b);
  assert.equal(r.barra, null);
  assert.equal(r.ajustadas, 0);
  assert.equal(fusionar(a, b).barra, null);
});

test('importar una copia vieja sobre lo corregido no deshace la corrección', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const vieja = datos();
  const r = fusionar(corregida, vieja);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  assert.equal(sentadilla(r.entries, '2026-10-09'), 57.5);
  // Llevada a la misma barra, la copia vieja dice lo mismo que la de acá.
  assert.equal(r.resumen.sinCambios, 4);
  assert.equal(r.resumen.reemplazados, 0);
  assert.equal(r.resumen.barraAjustadas, 0);
  assert.deepEqual(r.barra, { 'sentadilla con barra': 15 });
});

test('una sesión que sólo estaba en la copia vieja entra ya convertida', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const vieja = datos();
  vieja.entries['2026-10-16'] = { gym: { templateId: 'pecho-piernas', meta: 3, updatedAt: '2026-10-16T19:00:00.000Z', exercises: [{ name: 'Sentadilla con barra', sets: sets(65) }] } };
  const r = fusionar(corregida, vieja);
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60, 'entró con los kilos de la barra de 20');
});

test('traer la copia corregida a un teléfono sin corregir lo corrige entero', () => {
  const aca = datos();
  // Una sesión que sólo existe acá, anotada también con barra de 20.
  aca.entries['2026-10-16'] = { gym: { templateId: 'pecho-piernas', meta: 3, updatedAt: '2026-10-16T19:00:00.000Z', exercises: [{ name: 'Sentadilla con barra', sets: sets(65) }] } };
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const r = fusionar(aca, corregida);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60);
  assert.deepEqual(r.barra, { 'sentadilla con barra': 15 });
  // 6 series compartidas + 3 de la sesión que sólo estaba acá.
  assert.equal(r.resumen.barraAjustadas, 9);
  // No son registros nuevos: el total que anuncia la previa no las cuenta.
  assert.equal(r.resumen.total, 0);
});

test('si las dos copias dicen barras distintas, manda la de acá', () => {
  const aca = datos();
  corregirBarra(aca, CORREGIR);
  const alla = datos();
  corregirBarra(alla, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 17.5 });
  alla.entries['2026-10-16'] = { gym: { templateId: 'pecho-piernas', meta: 3, updatedAt: '2026-10-16T19:00:00.000Z', exercises: [{ name: 'Sentadilla con barra', sets: sets(62.5) }] } };
  const r = fusionar(aca, alla);
  // 62,5 con barra de 17,5 son 45 de discos: con la de 15, 60.
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  // Lo que acá no estaba anotado se toma del archivo, y lo de acá se ajusta.
  assert.deepEqual(r.barra, { 'sentadilla con barra': 15, 'peso muerto rumano': 17.5 });
  assert.equal(r.entries['2026-10-02'].gym.exercises[1].sets[0].weight, 67.5);
  assert.equal(r.resumen.barraAjustadas, 6);
});

test('una edición posterior sigue ganando, ya en la barra de acá', () => {
  const aca = datos();
  corregirBarra(aca, CORREGIR);
  const editada = datos();
  editada.entries['2026-10-02'].gym.updatedAt = '2026-11-16T10:00:00.000Z';
  editada.entries['2026-10-02'].gym.exercises[0].sets[0].weight = 63;
  const r = fusionar(aca, editada);
  // 63 anotado con barra de 20 son 58 con la de 15.
  assert.equal(sentadilla(r.entries, '2026-10-02'), 58);
  assert.equal(r.resumen.reemplazados, 1);
});

test('fusionar no modifica ninguna de las dos copias', () => {
  const aca = datos();
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const a = JSON.stringify(aca);
  const c = JSON.stringify(corregida);
  fusionar(aca, corregida);
  fusionar(corregida, aca);
  assert.equal(JSON.stringify(aca), a);
  assert.equal(JSON.stringify(corregida), c);
});

test('una copia sin lista de actividades también se convierte', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const vieja = datos();
  delete vieja.activities;
  const r = fusionar(corregida, vieja);
  assert.equal(r.resumen.sinCambios, 4);
});

// ── El cableado ───────────────────────────────────────────────────────────

const fuente = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const funcion = (texto, firma) => {
  const desde = texto.indexOf(firma);
  assert.ok(desde >= 0, `no existe ${firma}`);
  const resto = texto.slice(desde);
  const fin = resto.slice(10).search(/\n(export )?(async )?function /);
  return fin < 0 ? resto : resto.slice(0, fin + 10);
};

test('el estado corrige dentro de mutate y prevé sobre una copia', () => {
  const estado = fuente('js/state.js');
  const corregir = funcion(estado, 'export function corregirPesoDeBarra(');
  assert.match(corregir, /mutate\(\(d\) => \{\s*resumen = corregirBarra\(d, \{ ejercicios, kg \}\);/);
  const previa = funcion(estado, 'export function previaDePesoDeBarra(');
  assert.match(previa, /const copia = structuredClone\(getData\(\)\);/);
  assert.match(previa, /corregirBarra\(copia, \{ ejercicios, kg \}\)/);
  assert.doesNotMatch(previa, /mutate\(/);
});

test('al fusionar se guarda la anotación junto con los registros', () => {
  const estado = fuente('js/state.js');
  const unir = funcion(estado, 'export function mergeData(');
  assert.match(unir, /const \{ entries, unlocked, actividadesNuevas, pausas, barra, resumen \} = fusionar\(getData\(\), entrante\);/);
  assert.match(unir, /if \(barra\) data\.settings\.barra = barra;/);
  // Y la previa avisa que hay pesos de acá que cambian.
  const ajustes = fuente('js/views/settings.js');
  const previa = funcion(ajustes, 'function mostrarPreviaDeImportacion(');
  assert.match(previa, /r\.barraAjustadas > 0/);
});

test('Ajustes ofrece la corrección y no elige ejercicios por su cuenta', () => {
  const ajustes = fuente('js/views/settings.js');
  const render = funcion(ajustes, 'export function render(');
  assert.match(render, /root\.append\(tarjetaDeBarra\(navigate, data\)\);/);
  const hoja = funcion(ajustes, 'function corregirLaBarra(');
  assert.match(hoja, /corregirPesoDeBarra\(\[\.\.\.elegidos\], Number\(peso\.value\)\)/);
  assert.match(hoja, /previaDePesoDeBarra\(\[\.\.\.elegidos\], Number\(peso\.value\)\)/);
  // Nada arranca tildado. Ni por el nombre —"Curl en polea baja con barra"
  // tiene la palabra y no tiene la barra— ni por estar ya corregido: hay
  // varias barras, y al cargar la segunda lo de la primera no puede venir
  // marcado, o se lo lleva puesto.
  assert.match(hoja, /const elegidos = new Set\(\);/);
  assert.doesNotMatch(hoja, /checked: true/);
  assert.doesNotMatch(hoja, /\/barra\/i?\.test|includes\('barra'\)/);
  // Y después de corregir una, el panel se vuelve a abrir para la siguiente.
  const alCorregir = hoja.slice(hoja.indexOf('corregirPesoDeBarra(['));
  assert.match(alCorregir, /navigate\?\.\(\);[\s\S]*?corregirLaBarra\(navigate\);/);
});
