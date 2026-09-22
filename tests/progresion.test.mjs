import test from 'node:test';
import assert from 'node:assert/strict';
import { objetivoDeHoy, objetivoPorNombre, textoDeObjetivo } from '../js/progresion.js';
import { perfilDeEjercicio, RANGOS_REPS, GRUPOS, GYM_TEMPLATES } from '../js/config.js';

const serie = (weight, reps) => ({ weight, reps });

// ---------------------------------------------------------------------------
// El perfil de cada ejercicio
// ---------------------------------------------------------------------------

test('todos los ejercicios de las plantillas tienen grupo y rango', () => {
  for (const t of GYM_TEMPLATES) {
    for (const ex of t.exercises) {
      assert.ok(ex.grupo, `${ex.name} no tiene grupo`);
      assert.ok(GRUPOS[ex.grupo], `${ex.name} apunta al grupo inexistente ${ex.grupo}`);
      assert.ok(RANGOS_REPS[ex.rango], `${ex.name} no tiene rango de repeticiones`);
      for (const g of ex.tambien || []) {
        assert.ok(GRUPOS[g], `${ex.name} ayuda a un grupo inexistente: ${g}`);
        assert.notEqual(g, ex.grupo, `${ex.name} se cuenta dos veces en ${g}`);
      }
    }
  }
});

test('los movimientos grandes viven en el rango pesado', () => {
  // Es el rango donde el 1RM estimado todavía significa algo.
  for (const nombre of ['Sentadilla con barra', 'Press militar', 'Pecho plano',
    'Peso muerto rumano', 'Dominadas agarre ancho', 'Remo con barra al pecho']) {
    assert.equal(perfilDeEjercicio(nombre).rango, 'pesado', nombre);
  }
  // Y los aislamientos chicos, arriba: nadie mide un 1RM de vuelos laterales.
  for (const nombre of ['Vuelo lateral con mancuerna vertical', 'Elevaciones de talón']) {
    assert.equal(perfilDeEjercicio(nombre).rango, 'liviano', nombre);
  }
});

test('el salto de carga es el escalón real del equipo', () => {
  assert.equal(perfilDeEjercicio('Sentadilla con barra').salto, 2.5, 'barra');
  assert.equal(perfilDeEjercicio('Vuelo posterior').salto, 2, 'mancuerna');
  assert.equal(perfilDeEjercicio('Dumbbell standing wrist curl').salto, 1, 'muñeca');
});

test('un ejercicio que no está en ninguna plantilla no inventa grupo', () => {
  const p = perfilDeEjercicio('Algo que me acabo de inventar');
  assert.equal(p.grupo, null);
  assert.equal(p.rango, 'medio');
});

// ---------------------------------------------------------------------------
// Progresión doble
// ---------------------------------------------------------------------------

const PESADO = perfilDeEjercicio('Sentadilla con barra');   // 5-8, +2,5

test('sin sesión anterior no hay objetivo', () => {
  assert.equal(objetivoDeHoy([], PESADO), null);
  assert.equal(objetivoDeHoy(null, PESADO), null);
  // Series cargadas sin repeticiones tampoco son una sesión.
  assert.equal(objetivoDeHoy([serie(60, 0)], PESADO), null);
});

test('cerrar el rango en todas las series sube la carga y vuelve al piso', () => {
  const o = objetivoDeHoy([serie(70, 8), serie(70, 8), serie(70, 8)], PESADO);
  assert.equal(o.sube, true);
  assert.equal(o.peso, 72.5);
  assert.deepEqual(o.reps, [5, 5, 5]);
});

test('si falta una repetición no sube: pide esa repetición', () => {
  const o = objetivoDeHoy([serie(70, 8), serie(70, 8), serie(70, 7)], PESADO);
  assert.equal(o.sube, false);
  assert.equal(o.peso, 70);
  assert.deepEqual(o.reps, [8, 8, 8]);
  assert.equal(o.faltan, 1);
  assert.equal(o.proximoPeso, 72.5);
});

test('el objetivo es una repetición más por serie, sin pasarse del tope', () => {
  const o = objetivoDeHoy([serie(70, 5), serie(70, 6), serie(70, 8)], PESADO);
  assert.deepEqual(o.reps, [6, 7, 8]);
  // Lo que falta para cerrar el rango entero: 3 + 2 + 0.
  assert.equal(o.faltan, 5);
});

test('con menos series que las planeadas no sube aunque estén al tope', () => {
  // Dos series a 8 no son la sesión completa: subir ahí es subir de mentira.
  const o = objetivoDeHoy([serie(70, 8), serie(70, 8)], PESADO, 3);
  assert.equal(o.sube, false);
  assert.deepEqual(o.reps, [8, 8, 5], 'la serie que faltó arranca en el piso');
});

test('con cargas distintas entre series no se promete un salto', () => {
  const o = objetivoDeHoy([serie(60, 8), serie(70, 8), serie(70, 8)], PESADO);
  assert.equal(o.sube, false);
  assert.equal(o.faltan, null, 'no hay un peso de trabajo único del que hablar');
});

test('cada rango tiene su propio tope', () => {
  const liviano = perfilDeEjercicio('Vuelo lateral con mancuerna vertical'); // 12-20, +2
  const aTope = objetivoDeHoy([serie(10, 20), serie(10, 20), serie(10, 20)], liviano);
  assert.equal(aTope.peso, 12, 'la mancuerna sube de a 2');
  assert.deepEqual(aTope.reps, [12, 12, 12]);
  // Las mismas 8 repeticiones que cierran una sentadilla no cierran un vuelo.
  const corto = objetivoDeHoy([serie(10, 8), serie(10, 8), serie(10, 8)], liviano);
  assert.equal(corto.sube, false);
});

test('en peso corporal lo que sube es el lastre, y arranca desde cero', () => {
  const dominadas = perfilDeEjercicio('Dominadas agarre ancho');   // bw, 5-8
  const o = objetivoDeHoy([serie(0, 8), serie(0, 8), serie(0, 8)], dominadas);
  assert.equal(o.sube, true);
  assert.equal(o.peso, 2.5);
});

test('busca el perfil por nombre', () => {
  const o = objetivoPorNombre('Sentadilla con barra', [serie(70, 8), serie(70, 8), serie(70, 8)]);
  assert.equal(o.peso, 72.5);
});

// ---------------------------------------------------------------------------
// Cómo se dice
// ---------------------------------------------------------------------------

test('el texto dice el peso, las repeticiones y qué falta', () => {
  const sube = textoDeObjetivo(objetivoDeHoy([serie(70, 8), serie(70, 8), serie(70, 8)], PESADO), PESADO);
  assert.match(sube, /72,5 kg × 5/);

  const falta = textoDeObjetivo(objetivoDeHoy([serie(70, 8), serie(70, 8), serie(70, 7)], PESADO), PESADO);
  assert.match(falta, /70 kg × 8-8-8/);
  assert.match(falta, /A 1 repetición de subir a 72,5 kg/);
});

test('no promete un salto que el plan de hoy no alcanza a cerrar', () => {
  // 10-10-9 en un rango 8-12: hoy toca 11-11-10, que todavía no cierra nada.
  // Decir "a 7 repeticiones de subir" sería cierto y confuso al mismo tiempo.
  const medio = perfilDeEjercicio('Curl en polea baja con barra');
  const t = textoDeObjetivo(objetivoDeHoy([serie(25, 10), serie(25, 10), serie(25, 9)], medio), medio);
  assert.match(t, /Hoy 25 kg × 11-11-10/);
  assert.match(t, /cuando cierres las 3 series en 12/);
  assert.doesNotMatch(t, /A \d+ repeticiones de subir/);
});

test('en mancuerna el texto aclara que es por mancuerna', () => {
  const p = perfilDeEjercicio('Vuelo posterior');
  const t = textoDeObjetivo(objetivoDeHoy([serie(8, 14), serie(8, 13), serie(8, 12)], p), p);
  assert.match(t, /c\/u/);
});

test('sin objetivo no hay texto que inventar', () => {
  assert.equal(textoDeObjetivo(null, PESADO), null);
});
