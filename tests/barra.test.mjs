import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  candidatosDeBarra, previaDeBarra, corregirBarra, quitarBarra, barrasDe, barraDe, barraValida,
  alinearBarras, aLado, deLado, porLado, resumenDeCarga, llevaBarra, BARRA_MIN, BARRA_MAX,
} from '../js/barra.js';
import { derive } from '../js/derive.js';
import { fusionar } from '../js/merge.js';
import { DEFAULT_ACTIVITIES, GYM_TEMPLATES, perfilDeEjercicio } from '../js/config.js';
import { objetivoDeHoy, textoDeObjetivo, superarRecord, textoDeRecord } from '../js/progresion.js';
import { objetivoDeDescarga, textoDeDescarga } from '../js/descargas.js';

// En el gimnasio se cargan discos de a pares y se piensa en "20 por lado". El
// total con la barra adentro había que sumarlo de cabeza en cada serie. Acá
// se dice una vez con qué barra se hace cada ejercicio, y el registrador pide
// el peso por lado y suma solo.
//
// Marcar una barra NO toca lo ya anotado: esos totales ya se sumaron con esa
// barra. Sólo se corrigen si se dice, explícitamente, que se venían sumando
// con otra. Y aun ahí cambia nada más que el peso: un día cumplido sigue
// cumplido.

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const piano = DEFAULT_ACTIVITIES.find((a) => a.id === 'piano');
const HORA = '2026-10-02T19:30:00.000Z';

const sets = (peso, reps = [8, 8, 8]) => reps.map((r) => ({ weight: peso, reps: r }));

/** Tres sesiones con barra, mancuernas, polea y peso corporal mezclados. */
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

// ── La cuenta: del lado al total y vuelta ─────────────────────────────────

test('20 por lado con barra de 20 son 60, y al revés', () => {
  assert.equal(deLado(20, 20), 60);
  assert.equal(aLado(60, 20), 20);
  // Lo que escribe un casillero es texto.
  assert.equal(deLado('20', '15'), 55);
  assert.equal(aLado('55', '15'), 20);
});

test('los discos de 1,25 no se redondean', () => {
  assert.equal(deLado(21.25, 20), 62.5);
  assert.equal(aLado(62.5, 20), 21.25);
  assert.equal(aLado(61.25, 20), 20.625);
  // Ni arrastran basura de coma flotante: 2 × 2,7 + 17,3 da 22,700000000000003.
  assert.equal(deLado(2.7, 17.3), 22.7);
});

test('la barra sola es cero por lado, que no es lo mismo que nada', () => {
  assert.equal(aLado(20, 20), 0);
  assert.equal(deLado(0, 20), 20);
  assert.equal(deLado('0', 20), 20);
});

test('un casillero vacío es un casillero vacío, no la barra sola', () => {
  for (const nada of ['', null, undefined]) {
    assert.equal(deLado(nada, 20), '', `deLado(${nada})`);
    assert.equal(aLado(nada, 20), null, `aLado(${nada})`);
  }
  assert.equal(deLado('abc', 20), '');
  assert.equal(deLado(-5, 20), '');
  assert.equal(aLado('abc', 20), null);
});

test('un total más liviano que la barra no tiene lado', () => {
  // 10 kg "con barra de 20" no existe: mostrar −5 por lado sería inventar.
  assert.equal(aLado(10, 20), null);
  assert.equal(aLado(19.99, 20), null);
});

test('sin una barra creíble no hay cuenta', () => {
  for (const barra of [0, null, undefined, 'x', 900]) {
    assert.equal(aLado(60, barra), null, `aLado con ${barra}`);
    assert.equal(deLado(20, barra), '', `deLado con ${barra}`);
  }
});

test('ida y vuelta devuelve el mismo total para cualquier disco razonable', () => {
  for (const barra of [5, 8.5, 10, 15, 17.5, 20]) {
    for (let lado = 0; lado <= 60; lado += 1.25) {
      assert.equal(aLado(deLado(lado, barra), barra), lado, `barra ${barra}, lado ${lado}`);
    }
  }
});

test('con barra el peso se dice por lado; sin barra, no se dice nada', () => {
  assert.equal(porLado(62.5, { barra: 20 }), '21,25 kg por lado');
  assert.equal(porLado(60, { barra: 15 }), '22,5 kg por lado');
  assert.equal(porLado(20, { barra: 20 }), '0 kg por lado');
  assert.equal(porLado(60, { barra: null }), null);
  assert.equal(porLado(60, {}), null);
  assert.equal(porLado(60, undefined), null);
  // Más liviano que la barra: que quien llama diga el total.
  assert.equal(porLado(10, { barra: 20 }), null);
});

test('un ejercicio terminado se resume como se cargó', () => {
  assert.equal(resumenDeCarga([62.5], 20), '21,25 por lado (62,5 kg)');
  assert.equal(resumenDeCarga([60, 65, 62.5], 20), '20–22,5 por lado');
  // Sin barra, o con un peso que no tiene lado, que se diga el total de siempre.
  assert.equal(resumenDeCarga([60], null), null);
  assert.equal(resumenDeCarga([60], undefined), null);
  assert.equal(resumenDeCarga([], 20), null);
  assert.equal(resumenDeCarga([60, 10], 20), null);
  assert.equal(resumenDeCarga([0], 20), null);
});

// ── Qué ejercicios pueden llevar barra ────────────────────────────────────

// Los que se hacen con barra, dicho por quien los hace. Ni uno más: el curl
// en polea tiene "barra" en el nombre y no lleva la barra.
const DE_BARRA = [
  'Remo bajo cerrado', 'Remo con barra al pecho', 'Encogimientos de trapecio',
  'Pecho plano', 'Pecho inclinado', 'Sentadilla con barra', 'Peso muerto rumano',
  'Elevaciones de talón',
];

test('la rutina sabe cuáles ejercicios se hacen con barra', () => {
  const todos = GYM_TEMPLATES.flatMap((t) => t.exercises);
  assert.deepEqual([...new Set(todos.filter((e) => e.conBarra).map((e) => e.name))], DE_BARRA);
  // Ninguno puede ser a la vez de mancuerna o de peso corporal.
  for (const e of todos.filter((x) => x.conBarra)) assert.ok(!e.db && !e.bw, e.name);
  assert.equal(perfilDeEjercicio('pecho plano ').conBarra, true);
  assert.equal(perfilDeEjercicio('Curl en polea baja con barra').conBarra, false);
  assert.equal(perfilDeEjercicio('Elevación de talón sentado').conBarra, false);
  assert.equal(perfilDeEjercicio('Algo inventado').conBarra, false);
});

test('los candidatos son los de barra de la rutina, más lo que tiene peso sin ser de mancuerna ni de cuerpo', () => {
  const c = candidatosDeBarra(datos());
  assert.deepEqual(c.map((f) => f.nombre), [
    // En el orden de la rutina: lunes, miércoles, viernes.
    'Remo bajo cerrado', 'Remo con barra al pecho', 'Curl en polea baja con barra',
    'Encogimientos de trapecio', 'Pecho plano', 'Pecho inclinado', 'Pec deck',
    'Sentadilla con barra', 'Peso muerto rumano', 'Elevaciones de talón',
  ]);
  // Los de barra se distinguen del resto, que es lo que el panel pliega.
  assert.deepEqual(c.filter((f) => f.deBarra).map((f) => f.nombre), DE_BARRA);
});

test('un ejercicio de barra figura aunque todavía no tenga registros', () => {
  const vacio = candidatosDeBarra({ activities: [gym], settings: {}, entries: {} });
  assert.deepEqual(vacio.map((f) => f.nombre), DE_BARRA);
  assert.deepEqual(vacio[0], {
    clave: 'remo bajo cerrado', nombre: 'Remo bajo cerrado', deBarra: true,
    sesiones: 0, series: 0, maximo: 0, ultimo: 0, barra: null,
  });
  // Y ya se le puede marcar la barra.
  const d = { activities: [gym], settings: { barra: { 'pecho plano': { kg: 20, antes: 20 } } }, entries: {} };
  assert.equal(candidatosDeBarra(d).find((f) => f.clave === 'pecho plano').barra, 20);
  // Sin datos, lo mismo: no rompe.
  assert.equal(candidatosDeBarra(undefined).length, DE_BARRA.length);
});

test('cada candidato dice sesiones, series, máximo, lo último que levantó y su barra', () => {
  const sentadilla = candidatosDeBarra(datos()).find((f) => f.clave === 'sentadilla con barra');
  // El nombre con otra caja y un espacio de más es el mismo ejercicio.
  assert.deepEqual(sentadilla, {
    clave: 'sentadilla con barra', nombre: 'Sentadilla con barra', deBarra: true,
    sesiones: 2, series: 6, maximo: 62.5, ultimo: 62.5, barra: null,
  });
  // Uno que no es de barra pero tiene peso: candidato, sin la marca.
  assert.equal(candidatosDeBarra(datos()).find((f) => f.clave === 'pec deck').deBarra, false);
});

test('lo último es lo más reciente, no lo más pesado', () => {
  const d = datos();
  d.entries['2026-10-16'] = { gym: { templateId: 'pecho-piernas', meta: 3, exercises: [{ name: 'Sentadilla con barra', sets: [{ weight: 50, reps: 8 }, { weight: 45, reps: 8 }, { weight: 0, reps: 8 }] }] } };
  const f = candidatosDeBarra(d).find((x) => x.clave === 'sentadilla con barra');
  assert.equal(f.ultimo, 45);
  assert.equal(f.maximo, 62.5);
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
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Flexiones lastradas', bw: true, sets: sets(10) });
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Fondo de tríceps', sets: sets(10) });
  const claves = candidatosDeBarra(d).map((f) => f.clave);
  assert.equal(claves.includes('flexiones lastradas'), false);
  assert.equal(claves.includes('fondo de tríceps'), false);
  assert.equal(llevaBarra({ name: 'Sentadilla con barra' }), true);
  assert.equal(llevaBarra({ name: 'Sentadilla con barra', db: true }), false);
  assert.equal(llevaBarra({ name: '' }), false);
  assert.equal(llevaBarra(null), false);
});

test('las series sin peso no hacen candidato a un ejercicio', () => {
  const d = datos();
  d.entries['2026-10-02'].gym.exercises.push({ name: 'Plancha', sets: sets(0) });
  assert.equal(candidatosDeBarra(d).some((f) => f.clave === 'plancha'), false);
});

// ── Marcar una barra no toca lo anotado ───────────────────────────────────

test('decir con qué barra hacés un ejercicio no altera ningún registro', () => {
  // Es el caso de todos los días, y la queja que originó esto: el total de
  // 60 lo sumaste vos con esa barra. Si la barra pesa 5 o pesa 20, el 60
  // sigue siendo 60.
  for (const kg of [5, 15, 20]) {
    const d = datos();
    const registros = JSON.stringify(d.entries);
    const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Remo con barra al pecho'], kg });
    assert.equal(JSON.stringify(d.entries), registros, `con barra de ${kg} tocó los registros`);
    assert.equal(r.series, 0);
    assert.deepEqual(r.filas, []);
    assert.equal(r.marcados, 2);
  }
});

test('queda guardado con qué barra se hace, y con cuál estaba anotado', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra '], kg: 15 });
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': { kg: 15, antes: 15 } });
  assert.equal(barraDe(d.settings, 'SENTADILLA CON BARRA'), 15);
  // Lo no marcado no tiene barra: se sigue anotando por total.
  assert.equal(barraDe(d.settings, 'Peso muerto rumano'), null);
  assert.equal(barraDe({}, 'Sentadilla con barra'), null);
  assert.equal(candidatosDeBarra(d).find((f) => f.clave === 'sentadilla con barra').barra, 15);
});

test('una barra de 20 también se guarda: marcar es lo que activa el peso por lado', () => {
  const d = datos();
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 20 });
  assert.equal(r.marcados, 1);
  assert.equal(barraDe(d.settings, 'Sentadilla con barra'), 20);
});

test('volver a marcar lo mismo no cuenta como cambio', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const una = JSON.stringify(d);
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  assert.equal(r.marcados, 0);
  assert.equal(r.series, 0);
  assert.equal(JSON.stringify(d), una);
  assert.equal(previaDeBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 }).marcados, 0);
});

test('la previa cuenta lo que pasaría y no toca nada', () => {
  const d = datos();
  const antes = JSON.stringify(d);
  const p = previaDeBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15, antes: 20 });
  assert.equal(JSON.stringify(d), antes, 'la previa modificó los datos');
  assert.equal(p.series, 12);
  assert.equal(p.sesiones, 2);
  assert.equal(p.marcados, 2);
  assert.deepEqual(p.filas.find((f) => f.clave === 'sentadilla con barra'), {
    clave: 'sentadilla con barra', nombre: 'Sentadilla con barra',
    de: 20, a: 15, delta: -5, series: 6, sesiones: 2, maximoAntes: 62.5, maximoDespues: 57.5,
  });
});

// ── "La contaba como 20 y pesa 15": lo único que corrige registros ────────

const CORREGIR = { ejercicios: ['Sentadilla con barra'], kg: 15, antes: 20 };

test('si venías sumando con otra barra, los totales se corrigen: los discos no cambian', () => {
  const d = datos();
  const r = corregirBarra(d, CORREGIR);
  assert.equal(r.series, 6);
  // Un ejercicio en dos viernes son dos sesiones, no una.
  assert.equal(r.sesiones, 2);
  // 60 eran 20 por lado + 20 de barra; con la de 15 son 55. El lado no cambió.
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.equal(aLado(55, 15), aLado(60, 20));
  assert.deepEqual(pesos(d, '2026-10-09', 'Sentadilla con barra'), [57.5, 57.5, 57.5]);
  // Lo no elegido queda igual: ni el otro de barra, ni la máquina.
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [70, 70, 70]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Pec deck'), [45, 45, 45]);
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [40, 40, 40]);
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': { kg: 15, antes: 20 } });
});

test('una barra más pesada que la que contabas suma en vez de restar', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 22.5, antes: 20 });
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [42.5, 42.5, 42.5]);
});

test('si la contabas con el mismo peso que tiene, no hay nada que corregir', () => {
  const d = datos();
  const registros = JSON.stringify(d.entries);
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15, antes: 15 });
  assert.equal(r.series, 0);
  assert.equal(JSON.stringify(d.entries), registros);
});

test('un "antes" que no es una barra se ignora: no corrige nada', () => {
  for (const antes of [0, -3, 'veinte', 900, null]) {
    const d = datos();
    const registros = JSON.stringify(d.entries);
    corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15, antes });
    assert.equal(JSON.stringify(d.entries), registros, `corrigió con antes = ${antes}`);
    assert.deepEqual(d.settings.barra, { 'sentadilla con barra': { kg: 15, antes: 15 } });
  }
});

test('los decimales no arrastran basura de coma flotante', () => {
  const d = datos();
  // 57,4 − 2,7 da 54,699999999999996 si nadie redondea, y 17,3 − 20 da
  // −2,6999999999999993.
  d.entries['2026-10-02'].gym.exercises[0].sets = sets(57.4);
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 17.3, antes: 20 });
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
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano', 'Remo con barra al pecho'], kg: 15, antes: 20 });
  assert.equal(forma(d), antes);
  assert.equal(d.entries['2026-10-02'].gym.updatedAt, HORA);
});

test('un día cumplido sigue cumplido, y con la misma meta', () => {
  const d = datos();
  const dias = (data) => {
    const st = derive(data, '2026-10-16').byActivity.get('gym');
    return [...st.byDate.entries()].map(([f, x]) => [f, x.value, x.goal, x.met]);
  };
  const antes = dias(d);
  assert.ok(antes.some(([, , , met]) => met), 'el fixture no tiene ningún día cumplido: no prueba nada');
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano', 'Remo con barra al pecho'], kg: 15, antes: 20 });
  assert.deepEqual(dias(d), antes);
});

test('los récords se recalculan con el peso real', () => {
  const d = datos();
  const record = (data) => derive(data, '2026-10-16').byActivity.get('gym').records.get('sentadilla con barra');
  assert.equal(record(d).weight, 62.5);
  corregirBarra(d, CORREGIR);
  assert.equal(record(d).weight, 57.5);
});

test('corregir dos veces lo mismo no vuelve a restar', () => {
  const d = datos();
  corregirBarra(d, CORREGIR);
  const una = JSON.stringify(d);
  // Ya está marcado: se sabe con qué barra está, y el "antes" no cuenta más.
  const otra = corregirBarra(d, CORREGIR);
  assert.equal(otra.series, 0);
  assert.deepEqual(otra.filas, []);
  assert.equal(JSON.stringify(d), una);
  assert.equal(previaDeBarra(d, CORREGIR).series, 0);
});

test('cambiarle el peso a una barra ya marcada mueve los totales: los discos no cambian', () => {
  // La marcaste como 15, cargaste por lado, y resultó que pesa 17,5.
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 17.5 });
  assert.equal(r.filas[0].de, 15);
  assert.equal(r.filas[0].delta, 2.5);
  assert.equal(r.marcados, 1);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [62.5, 62.5, 62.5]);
  assert.equal(aLado(62.5, 17.5), aLado(60, 15));
  // El "antes" es el de cuando se marcó: no se pisa.
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': { kg: 17.5, antes: 15 } });
  // Y un "antes" escrito ahora no manda sobre lo que ya se sabe.
  const otro = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 20, antes: 5 });
  assert.equal(otro.filas[0].de, 17.5);
});

test('cada barra con su peso: marcar una no toca lo que se hace con otra', () => {
  // La del rack pesa 15 (y la contaba como 20) y la corta del remo, 10.
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15, antes: 20 });
  const r = corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 10 });
  assert.equal(r.series, 0);
  assert.equal(r.marcados, 1);
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [40, 40, 40]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [65, 65, 65]);
  assert.deepEqual([...barrasDe(d.settings)], [
    ['sentadilla con barra', 15], ['peso muerto rumano', 15], ['remo con barra al pecho', 10],
  ]);
});

test('en una misma pasada, lo ya marcado y lo nuevo se tratan cada uno como corresponde', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15, antes: 20 });
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15, antes: 20 });
  assert.deepEqual(r.filas.map((f) => f.clave), ['peso muerto rumano']);
  assert.equal(r.marcados, 1);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [65, 65, 65]);
});

// ── Quitar una barra ──────────────────────────────────────────────────────

test('quitar una barra sin corrección sólo la desmarca', () => {
  const d = datos();
  const original = JSON.stringify(d);
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const r = quitarBarra(d, ['Sentadilla con barra']);
  assert.equal(r.quitados, 1);
  assert.equal(r.series, 0);
  assert.equal(JSON.stringify(d), original);
});

test('quitar una barra deshace exacto lo que se había corregido', () => {
  const d = datos();
  const original = JSON.stringify(d);
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15, antes: 20 });
  // …incluso después de haberle cambiado el peso.
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 17.5 });
  const r = quitarBarra(d, ['SENTADILLA CON BARRA ', 'Peso muerto rumano']);
  assert.equal(r.quitados, 2);
  assert.equal(r.series, 12);
  assert.equal(JSON.stringify(d), original);
});

test('quitar una sola deja las otras como están', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 15, antes: 20 });
  quitarBarra(d, ['Peso muerto rumano']);
  assert.deepEqual(d.settings.barra, { 'sentadilla con barra': { kg: 15, antes: 20 } });
  assert.deepEqual(pesos(d, '2026-10-02', 'Peso muerto rumano'), [70, 70, 70]);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
});

test('quitar lo que no estaba marcado no hace nada', () => {
  const d = datos();
  corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const una = JSON.stringify(d);
  assert.equal(quitarBarra(d, ['Pec deck', '', null]).quitados, 0);
  assert.equal(quitarBarra(d, undefined).quitados, 0);
  assert.equal(JSON.stringify(d), una);
  // Ni reescribe lo guardado, aunque esté en el formato viejo.
  const viejo = datos();
  viejo.settings.barra = { 'sentadilla con barra': 15 };
  quitarBarra(viejo, ['Pec deck']);
  assert.deepEqual(viejo.settings.barra, { 'sentadilla con barra': 15 });
});

// ── Bordes ────────────────────────────────────────────────────────────────

test('una serie que no pudo incluir la barra se deja como está, y se cuenta', () => {
  const d = datos();
  // 4 kg "con barra de 20" no existe: restarle 5 daría −1. Y la de 5 daría 0.
  d.entries['2026-10-02'].gym.exercises[0].sets = [
    { weight: 60, reps: 8 }, { weight: 4, reps: 8 }, { weight: 5, reps: 8 }, { weight: 0, reps: 8 },
  ];
  const r = corregirBarra(d, CORREGIR);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 4, 5, 0]);
  assert.equal(r.sinTocar, 3);
  assert.equal(r.series, 1 + 3);
});

test('una serie sin peso no se convierte en la diferencia cuando la barra pesa más', () => {
  const d = datos();
  d.entries['2026-10-12'].gym.exercises[0].sets = [{ weight: 40, reps: 8 }, { weight: 0, reps: 8 }];
  const r = corregirBarra(d, { ejercicios: ['Remo con barra al pecho'], kg: 22.5, antes: 20 });
  assert.deepEqual(pesos(d, '2026-10-12', 'Remo con barra al pecho'), [42.5, 0]);
  assert.equal(r.sinTocar, 1);
});

test('una sesión donde no se tocó ninguna serie no cuenta', () => {
  const d = datos();
  d.entries['2026-10-09'].gym.exercises[0].sets = sets(0);
  const r = corregirBarra(d, CORREGIR);
  assert.equal(r.sesiones, 1);
  assert.equal(r.filas[0].sesiones, 1);
  // Y un ejercicio elegido sin nada que tocar no aparece como cambio.
  const otro = datos();
  otro.entries['2026-10-12'].gym.exercises[0].sets = sets(0);
  assert.deepEqual(corregirBarra(otro, { ejercicios: ['Remo con barra al pecho'], kg: 15, antes: 20 }).filas, []);
});

test('una sesión hecha con mancuernas no se toca aunque el ejercicio esté marcado', () => {
  const d = datos();
  d.entries['2026-10-09'].gym.exercises[0].db = true;
  const r = corregirBarra(d, CORREGIR);
  assert.deepEqual(pesos(d, '2026-10-09', 'Sentadilla con barra'), [62.5, 62.5, 62.5]);
  assert.equal(r.sesiones, 1);
});

test('sólo se tocan los registros de gimnasio', () => {
  const d = datos();
  d.entries['2026-10-02'].piano.exercises = [{ name: 'Sentadilla con barra', sets: sets(60) }];
  corregirBarra(d, CORREGIR);
  assert.equal(d.entries['2026-10-02'].piano.exercises[0].sets[0].weight, 60);
});

test('un peso de barra que no es una barra no hace nada', () => {
  for (const kg of [0, -5, 'quince', null, undefined, NaN, '', BARRA_MAX + 0.5, BARRA_MIN - 0.5]) {
    const d = datos();
    const antes = JSON.stringify(d);
    const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra'], kg, antes: 20 });
    assert.equal(r.series, 0, `aceptó ${kg}`);
    assert.equal(r.marcados, 0, `marcó con ${kg}`);
    assert.equal(JSON.stringify(d), antes, `tocó los datos con ${kg}`);
  }
  assert.equal(barraValida(BARRA_MIN), true);
  assert.equal(barraValida(BARRA_MAX), true);
  assert.equal(barraValida('15'), true);
});

test('sin ejercicios elegidos no hace nada', () => {
  const d = datos();
  const antes = JSON.stringify(d);
  assert.equal(corregirBarra(d, { ejercicios: [], kg: 15 }).marcados, 0);
  assert.equal(corregirBarra(d, { ejercicios: ['', '  '], kg: 15 }).marcados, 0);
  assert.equal(corregirBarra(d, { kg: 15 }).marcados, 0);
  assert.equal(JSON.stringify(d), antes);
  // Ni siquiera reescribe lo guardado.
  const sucio = datos();
  sucio.settings.barra = { 'sentadilla con barra': 15, 'pec deck': 'mucho' };
  corregirBarra(sucio, { ejercicios: [], kg: 15 });
  assert.deepEqual(sucio.settings.barra, { 'sentadilla con barra': 15, 'pec deck': 'mucho' });
});

test('un mismo ejercicio escrito dos veces cuenta una', () => {
  const d = datos();
  const r = corregirBarra(d, { ejercicios: ['Sentadilla con barra', 'sentadilla con barra '], kg: 15, antes: 20 });
  assert.equal(r.marcados, 1);
  assert.deepEqual(pesos(d, '2026-10-02', 'Sentadilla con barra'), [55, 55, 55]);
});

test('lo guardado con basura se ignora', () => {
  const sucio = { barra: {
    'sentadilla con barra': { kg: 15, antes: 20 }, 'pec deck': { kg: 'mucho' }, '': { kg: 10 },
    remo: { kg: 900 }, 'peso muerto rumano': { kg: 10, antes: 'x' }, nada: null,
  } };
  assert.deepEqual([...barrasDe(sucio)], [['sentadilla con barra', 15], ['peso muerto rumano', 10]]);
  assert.equal(barrasDe({ barra: [15] }).size, 0);
  assert.equal(barrasDe({ barra: 'quince' }).size, 0);
  assert.equal(barrasDe(undefined).size, 0);
  // Un "antes" roto vale como "con la misma": quitarla no mueve nada.
  const d = datos();
  d.settings = sucio;
  const registros = JSON.stringify(d.entries);
  quitarBarra(d, ['Peso muerto rumano']);
  assert.equal(JSON.stringify(d.entries), registros);
});

test('lo que guardó la primera versión se lee como lo que era: corregido desde 20', () => {
  // Guardaba sólo el número, y sólo después de restarle a registros que
  // suponían una barra de 20.
  const d = datos();
  corregirBarra(d, CORREGIR);
  const original = datos();
  d.settings.barra = { 'sentadilla con barra': 15 };
  assert.equal(barraDe(d.settings, 'Sentadilla con barra'), 15);
  quitarBarra(d, ['Sentadilla con barra']);
  assert.equal(JSON.stringify(d.entries), JSON.stringify(original.entries));
});

// ── Fusionar dos copias ───────────────────────────────────────────────────
//
// Cada copia es coherente con su propia anotación. Lo que no se puede hacer
// es unirlas serie por serie cuando una tiene los totales corregidos y la
// otra no.

const sentadilla = (entries, fecha) => entries[fecha].gym.exercises[0].sets[0].weight;
const viernes16 = (peso) => ({ gym: { templateId: 'pecho-piernas', meta: 3, updatedAt: '2026-10-16T19:00:00.000Z', exercises: [{ name: 'Sentadilla con barra', sets: sets(peso) }] } });

test('sin ninguna barra marcada, alinear no toca ni copia nada', () => {
  const a = datos();
  const b = datos();
  const r = alinearBarras(a, b);
  assert.equal(r.local, a);
  assert.equal(r.entrante, b);
  assert.equal(r.barra, null);
  assert.equal(r.ajustadas, 0);
  assert.equal(fusionar(a, b).barra, null);
});

test('una barra marcada sin corregir nada no cambia ningún peso al fusionar', () => {
  // El caso normal: marcaste acá, y el archivo es la misma historia sin marcar.
  const marcada = datos();
  corregirBarra(marcada, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const vieja = datos();
  for (const [aca, alla] of [[marcada, vieja], [vieja, marcada]]) {
    const r = fusionar(aca, alla);
    assert.equal(sentadilla(r.entries, '2026-10-02'), 60);
    assert.equal(r.resumen.sinCambios, 4);
    assert.equal(r.resumen.barraAjustadas, 0);
    // Y la marca viaja: en el otro teléfono también se carga por lado.
    assert.deepEqual(r.barra, { 'sentadilla con barra': { kg: 15, antes: 15 } });
  }
});

test('importar una copia vieja sobre lo corregido no deshace la corrección', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const r = fusionar(corregida, datos());
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  assert.equal(sentadilla(r.entries, '2026-10-09'), 57.5);
  // Llevada a la misma barra, la copia vieja dice lo mismo que la de acá.
  assert.equal(r.resumen.sinCambios, 4);
  assert.equal(r.resumen.reemplazados, 0);
  assert.equal(r.resumen.barraAjustadas, 0);
  assert.deepEqual(r.barra, { 'sentadilla con barra': { kg: 15, antes: 20 } });
});

test('una sesión que sólo estaba en la copia vieja entra ya convertida', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const vieja = datos();
  vieja.entries['2026-10-16'] = viernes16(65);
  const r = fusionar(corregida, vieja);
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60, 'entró con los kilos de la barra de 20');
});

test('traer la copia corregida a un teléfono sin corregir lo corrige entero', () => {
  const aca = datos();
  // Una sesión que sólo existe acá, sumada también con barra de 20.
  aca.entries['2026-10-16'] = viernes16(65);
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  const r = fusionar(aca, corregida);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60);
  assert.deepEqual(r.barra, { 'sentadilla con barra': { kg: 15, antes: 20 } });
  // 6 series compartidas + 3 de la sesión que sólo estaba acá.
  assert.equal(r.resumen.barraAjustadas, 9);
  // No son registros nuevos: el total que anuncia la previa no las cuenta.
  assert.equal(r.resumen.total, 0);
});

test('una corrección seguida de un cambio de peso también se alinea', () => {
  // La contaba como 20, la marqué como 15 y después supe que pesa 17,5.
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  corregirBarra(corregida, { ejercicios: ['Sentadilla con barra'], kg: 17.5 });
  assert.equal(sentadilla(corregida.entries, '2026-10-02'), 57.5);
  // La copia vieja está con 20: le faltan −2,5, no −5 ni 0.
  const r = fusionar(datos(), corregida);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 57.5);
  assert.equal(r.resumen.sinCambios, 4);
});

test('si las dos copias dicen barras distintas, manda la de acá', () => {
  const aca = datos();
  corregirBarra(aca, CORREGIR);
  const alla = datos();
  corregirBarra(alla, { ejercicios: ['Sentadilla con barra', 'Peso muerto rumano'], kg: 17.5, antes: 20 });
  alla.entries['2026-10-16'] = viernes16(62.5);
  const r = fusionar(aca, alla);
  // 62,5 con barra de 17,5 son 45 de discos: con la de 15, 60.
  assert.equal(sentadilla(r.entries, '2026-10-16'), 60);
  assert.equal(sentadilla(r.entries, '2026-10-02'), 55);
  // Lo que acá no estaba marcado se toma del archivo, y lo de acá se ajusta.
  assert.deepEqual(r.barra, {
    'sentadilla con barra': { kg: 15, antes: 20 }, 'peso muerto rumano': { kg: 17.5, antes: 20 },
  });
  assert.equal(r.entries['2026-10-02'].gym.exercises[1].sets[0].weight, 67.5);
  assert.equal(r.resumen.barraAjustadas, 6);
});

test('con varias barras, fusionar lleva cada ejercicio a la suya', () => {
  const corregida = datos();
  corregirBarra(corregida, CORREGIR);
  corregirBarra(corregida, { ejercicios: ['Remo con barra al pecho'], kg: 10, antes: 20 });
  const r = fusionar(datos(), corregida);
  assert.equal(r.entries['2026-10-02'].gym.exercises[0].sets[0].weight, 55);
  assert.equal(r.entries['2026-10-12'].gym.exercises[0].sets[0].weight, 30);
  assert.equal(r.resumen.barraAjustadas, 9);
});

test('lo que se guarda al fusionar es la anotación de acá, ya limpia', () => {
  // Las dos copias marcaron la misma barra, pero sólo la de allá corrigió.
  // No hay forma de saber cuál tiene razón: manda la de acá, entera.
  const aca = datos();
  corregirBarra(aca, { ejercicios: ['Sentadilla con barra'], kg: 15 });
  const alla = datos();
  corregirBarra(alla, CORREGIR);
  assert.deepEqual(fusionar(aca, alla).barra, { 'sentadilla con barra': { kg: 15, antes: 15 } });
  assert.deepEqual(fusionar(alla, aca).barra, { 'sentadilla con barra': { kg: 15, antes: 20 } });
  // Un "antes" roto se guarda arreglado, no como vino.
  const roto = datos();
  roto.settings.barra = { 'sentadilla con barra': { kg: 10, antes: 'x' } };
  assert.deepEqual(fusionar(roto, datos()).barra, { 'sentadilla con barra': { kg: 10, antes: 10 } });
});

test('una edición posterior sigue ganando, ya en la barra de acá', () => {
  const aca = datos();
  corregirBarra(aca, CORREGIR);
  const editada = datos();
  editada.entries['2026-10-02'].gym.updatedAt = '2026-11-16T10:00:00.000Z';
  editada.entries['2026-10-02'].gym.exercises[0].sets[0].weight = 63;
  const r = fusionar(aca, editada);
  // 63 sumado con barra de 20 son 58 con la de 15.
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
  assert.equal(fusionar(corregida, vieja).resumen.sinCambios, 4);
});

// ── Los textos del registrador ────────────────────────────────────────────

test('con barra, el récord y cómo superarlo se dicen por lado', () => {
  const perfil = { ...perfilDeEjercicio('Sentadilla con barra'), barra: 20 };
  const d = datos();
  const record = derive(d, '2026-10-16').byActivity.get('gym').records.get('sentadilla con barra');
  const texto = textoDeRecord(record, superarRecord(record, perfil), perfil);
  assert.match(texto, /^Récord: 21,25 kg por lado × \d+\./);
  assert.doesNotMatch(texto, /62,5 kg/, 'sigue diciendo el total, que es lo que había que dejar de sumar');
  assert.doesNotMatch(texto, /\d kg ×/, `quedó algún peso sin decir por lado: ${texto}`);
  // Sin barra marcada, todo como antes.
  const sin = perfilDeEjercicio('Sentadilla con barra');
  assert.match(textoDeRecord(record, superarRecord(record, sin), sin), /^Récord: 62,5 kg × /);
});

test('con barra, el plan de hoy y el de descarga se dicen por lado', () => {
  const base = perfilDeEjercicio('Sentadilla con barra');
  const perfil = { ...base, barra: 20 };
  const previas = sets(60, [6, 6, 5]);
  const hoy = textoDeObjetivo(objetivoDeHoy(previas, base), perfil);
  assert.match(hoy, /^Hoy 20 kg por lado × /);
  assert.doesNotMatch(hoy, /\d kg [×c]/, `quedó algún total: ${hoy}`);
  assert.match(textoDeObjetivo(objetivoDeHoy(previas, base), base), /^Hoy 60 kg × /);

  const descarga = textoDeDescarga(objetivoDeDescarga(previas, base), perfil);
  assert.match(descarga, /^Descarga: 20 kg por lado × /);
  assert.match(textoDeDescarga(objetivoDeDescarga(previas, base), base), /^Descarga: 60 kg × /);
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

test('el registrador pide el lado, guarda el total y muestra la suma', () => {
  const registrador = fuente('js/ui/logger.js');
  const form = funcion(registrador, 'function gymForm(');
  // Una sesión con mancuernas no usa la barra aunque el ejercicio esté marcado.
  assert.match(form, /const barraHoy = \(ex\) => \(llevaBarra\(ex\) \? barraDe\(barras, ex\.name\) : null\);/);
  // El casillero muestra el lado…
  assert.match(form, /const lado = conBarra \? aLado\(set\.weight, barra\) : null;/);
  assert.match(form, /value: conBarra \? \(lado \?\? ''\) : \(set\.weight \?\? ''\),/);
  // …y lo que se escribe vuelve a ser el total, que es lo que se guarda.
  assert.match(form, /set\.weight = conBarra \? deLado\(weight\.value, barra\) : weight\.value;/);
  // El total queda a la vista y se actualiza al escribir.
  assert.match(form, /weight\.addEventListener\('input', \(\) => \{[^}]*decirTotal\(\);/);
  // Los textos de arriba hablan por lado.
  assert.match(form, /const perfil = \{ \.\.\.perfilDeEjercicio\(ex\.name\), barra: barraHoy\(ex\) \};/);
  // Y el ejercicio plegado también.
  assert.match(form, /const carga = resumenDeCarga\(pesos, barra\)\s*\?\? /);
  // La etiqueta de la columna lo dice.
  assert.match(form, /etiquetaDePeso\(ex, refresh, barraHoy\(ex\)\)/);
  assert.match(funcion(registrador, 'function etiquetaDePeso('), /if \(barra !== null\) \{/);
});

test('el estado marca y desmarca dentro de mutate, y prevé sobre una copia', () => {
  const estado = fuente('js/state.js');
  assert.match(funcion(estado, 'export function marcarBarra('),
    /mutate\(\(d\) => \{\s*resumen = corregirBarra\(d, \{ ejercicios, kg, antes \}\);/);
  assert.match(funcion(estado, 'export function desmarcarBarra('),
    /mutate\(\(d\) => \{\s*resumen = quitarBarra\(d, ejercicios\);/);
  const previa = funcion(estado, 'export function previaDeMarcarBarra(');
  assert.match(previa, /const copia = structuredClone\(getData\(\)\);/);
  assert.match(previa, /corregirBarra\(copia, \{ ejercicios, kg, antes \}\)/);
  assert.doesNotMatch(previa, /mutate\(/);
});

test('al fusionar se guarda la anotación junto con los registros', () => {
  const estado = fuente('js/state.js');
  const unir = funcion(estado, 'export function mergeData(');
  assert.match(unir, /const \{ entries, unlocked, actividadesNuevas, pausas, barra, resumen \} = fusionar\(getData\(\), entrante\);/);
  assert.match(unir, /if \(barra\) data\.settings\.barra = barra;/);
  // Y la previa avisa que hay pesos de acá que cambian.
  const previa = funcion(fuente('js/views/settings.js'), 'function mostrarPreviaDeImportacion(');
  assert.match(previa, /r\.barraAjustadas > 0/);
});

test('Ajustes deja marcar barras, y no decide nada por su cuenta', () => {
  const ajustes = fuente('js/views/settings.js');
  // Ajustes pasó a ser un índice plegado: la tarjeta vive en su sección.
  assert.match(funcion(ajustes, 'export function render('), /gimnasio: \(\) => tarjetaDeBarra\(navigate, data\),/);
  const hoja = funcion(ajustes, 'function misBarras(');
  assert.match(hoja, /marcarBarra\(\[\.\.\.elegidos\], Number\(peso\.value\), valorDeAntes\(\)\)/);
  assert.match(hoja, /previaDeMarcarBarra\(\[\.\.\.elegidos\], kg, valorDeAntes\(\)\)/);
  assert.match(hoja, /desmarcarBarra\(\[c\.clave\]\)/);
  // Nada arranca tildado. Ni por el nombre —"Curl en polea baja con barra"
  // tiene la palabra y no tiene la barra— ni por estar ya marcado: hay
  // varias barras, y al cargar la segunda lo de la primera no puede venir
  // tildado, o se lo lleva puesto.
  assert.match(hoja, /const elegidos = new Set\(\);/);
  assert.doesNotMatch(hoja, /checked: true/);
  assert.doesNotMatch(hoja, /\/barra\/i?\.test|includes\('barra'\)/);
  // El "antes", que es lo único que toca registros viejos, arranca vacío: si
  // nadie lo escribe, no se corrige nada.
  assert.match(hoja, /const antes = el\('input', \{[^}]*value: '',/);
  assert.match(hoja, /const valorDeAntes = \(\) => \(barraValida\(antes\.value\) \? Number\(antes\.value\) : undefined\);/);
  // Guardar se habilita también cuando sólo se marca, sin corregir nada.
  assert.match(hoja, /aplicar\.disabled = !\(p && \(p\.series > 0 \|\| p\.marcados > 0\)\);/);
  // Arriba van los de barra de la rutina y lo ya marcado; el resto, plegado.
  assert.match(hoja, /const deBarra = filas\.filter\(\(f\) => f\.c\.deBarra \|\| f\.c\.barra !== null\);/);
  assert.match(hoja, /el\('div', \{ class: 'list' \}, deBarra\.map\(\(f\) => f\.nodo\)\)/);
  assert.match(hoja, /otros\.map\(\(f\) => f\.nodo\)/);
  // Y después de guardar una, el panel se vuelve a abrir para la siguiente.
  assert.match(hoja, /const reabrir = \(\) => \{ navigate\?\.\(\); misBarras\(navigate\); \};/);
});
