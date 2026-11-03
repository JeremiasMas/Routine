import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { volumenPlanificado, desajustesDeLaRutina } from '../js/analisis.js';
import { GRUPOS, GYM_TEMPLATES, DEFAULT_SETS } from '../js/config.js';

const vista = readFileSync('js/views/analisis.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/* ---------------------------------------------------------------------------
   La cuenta
   --------------------------------------------------------------------------- */

const UNA = [{ exercises: [
  { name: 'Press', grupo: 'pecho', sets: 4, tambien: ['triceps'] },
  { name: 'Sentadilla', grupo: 'cuadriceps' },        // sin sets: los de por defecto
] }];

test('cuenta las series de cada día de la semana', () => {
  const v = volumenPlanificado(UNA);
  const de = (id) => v.find((f) => f.id === id).porSemana;
  assert.equal(de('pecho'), 4);
  assert.equal(de('cuadriceps'), DEFAULT_SETS, 'un ejercicio sin sets usa el valor por defecto');
});

test('el músculo que ayuda cuenta media serie', () => {
  // Lo mismo que hace volumenPorGrupo con lo registrado: si no, un ejercicio
  // que toca cuatro músculos inflaría el total por cuatro.
  assert.equal(volumenPlanificado(UNA).find((f) => f.id === 'triceps').porSemana, 2);
});

test('un grupo que la rutina no toca queda en cero, no afuera', () => {
  // Cero es el dato: "no entrenás pantorrillas" es justo lo que hay que decir.
  const v = volumenPlanificado(UNA);
  const pant = v.find((f) => f.id === 'pantorrillas');
  assert.equal(pant.porSemana, 0);
  assert.equal(pant.estado, 'bajo');
  assert.equal(v.length, Object.keys(GRUPOS).length, 'se perdió algún grupo por el camino');
});

test('un grupo de un ejercicio inventado no entra', () => {
  const v = volumenPlanificado([{ exercises: [{ name: 'X', grupo: 'branquias', sets: 99 }] }]);
  assert.ok(v.every((f) => f.porSemana === 0), 'un grupo que no existe se coló en la cuenta');
});

test('el estado sale de los rangos de la propia app', () => {
  const v = volumenPlanificado([{ exercises: [
    { name: 'A', grupo: 'pecho', sets: GRUPOS.pecho.min },
    { name: 'B', grupo: 'espalda', sets: GRUPOS.espalda.max },
  ] }]);
  assert.equal(v.find((f) => f.id === 'pecho').estado, 'ok', 'el mínimo exacto ya está dentro');
  assert.equal(v.find((f) => f.id === 'espalda').estado, 'ok', 'el máximo exacto todavía está dentro');
  const fuera = volumenPlanificado([{ exercises: [
    { name: 'A', grupo: 'pecho', sets: GRUPOS.pecho.min - 1 },
    { name: 'B', grupo: 'espalda', sets: GRUPOS.espalda.max + 1 },
  ] }]);
  assert.equal(fuera.find((f) => f.id === 'pecho').estado, 'bajo');
  assert.equal(fuera.find((f) => f.id === 'espalda').estado, 'alto');
});

test('va de más a menos, que es por donde se empieza a mirar', () => {
  const v = volumenPlanificado();
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].porSemana >= v[i].porSemana);
});

/* ---------------------------------------------------------------------------
   Lo que dice de la rutina de verdad
   --------------------------------------------------------------------------- */

test('la rutida de hoy deja pantorrillas abajo del rango', () => {
  // Es el hallazgo que motivó todo esto: la app define 8-16 y la rutina
  // planea 6. Si algún día se agregan series, esta prueba avisa.
  const d = desajustesDeLaRutina();
  const pant = d.porId.get('pantorrillas');
  assert.equal(pant.porSemana, 6);
  assert.equal(pant.min, 8);
  assert.ok(d.bajos.some((f) => f.id === 'pantorrillas'));
});

test('y espalda, hombros y tríceps arriba', () => {
  const d = desajustesDeLaRutina();
  assert.deepEqual(d.altos.map((f) => f.id).sort(), ['espalda', 'hombros', 'triceps']);
});

test('sólo se nombra lo que se sale del rango', () => {
  const d = desajustesDeLaRutina();
  const fuera = new Set([...d.bajos, ...d.altos].map((f) => f.id));
  for (const f of volumenPlanificado()) {
    assert.equal(fuera.has(f.id), f.estado !== 'ok', `${f.nombre} está mal clasificado`);
  }
});

test('la cuenta sale de las plantillas de verdad, no de una copia', () => {
  // Si alguien agrega un ejercicio a config.js, esto tiene que moverse solo.
  const series = GYM_TEMPLATES.reduce((n, t) => n
    + t.exercises.reduce((m, e) => m + (Number(e.sets) || DEFAULT_SETS), 0), 0);
  const contadas = volumenPlanificado().reduce((n, f) => n + f.porSemana, 0);
  assert.ok(contadas >= series, 'la cuenta perdió series por el camino');
});

/* ---------------------------------------------------------------------------
   La pantalla
   --------------------------------------------------------------------------- */

test('el volumen medido muestra al lado lo que la rutina planea', () => {
  assert.ok(vista.includes('desajustesDeLaRutina()'), 'la vista no audita la rutina escrita');
  assert.match(vista, /tu rutina planea/, 'la fila no dice cuánto planea la rutina');
  // Que la función exista no alcanza: lo que importa es que se la llame.
  assert.match(vista, /planDe\(plan, f\.id\)/, 'la fila dejó de pedir lo planeado');
});

test('y separa el problema de la rutina del de cómo entrenaste', () => {
  // Un grupo corto en el plan no se arregla yendo más seguido.
  assert.ok(vista.includes('function rutinaDesajustada'), 'se fue el aviso de la rutina escrita');
  assert.match(vista, /no se arregla entrenando mejor/,
    'el aviso dejó de decir que esto no se arregla entrenando');
  assert.match(vista, /^\s*rutinaDesajustada\(plan\),$/m,
    'el aviso quedó escrito pero nadie lo pone en pantalla');
});
