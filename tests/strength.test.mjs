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
