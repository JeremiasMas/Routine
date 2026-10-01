import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objetivoDeHoy, objetivoPorNombre, textoDeObjetivo, superarRecord, textoDeRecord,
} from '../js/progresion.js';
import { estimatedOneRepMax } from '../js/xp.js';
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
  assert.equal(perfilDeEjercicio('Vuelo posterior').salto, 2.5, 'mancuerna');
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
  const liviano = perfilDeEjercicio('Vuelo lateral con mancuerna vertical'); // 12-20, +2,5
  const aTope = objetivoDeHoy([serie(10, 20), serie(10, 20), serie(10, 20)], liviano);
  assert.equal(aTope.peso, 12.5, 'el rack sube de a 2,5, también en mancuerna');
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

// ---------------------------------------------------------------------------
// Superar el récord
//
// Es lo que se lee en el gimnasio con el peso ya puesto en la barra, así que
// tiene que ser alcanzable y cierto: una cifra que no supere el récord, o que
// no exista en el rack, no sirve para nada.
// ---------------------------------------------------------------------------

/** Un récord con el 1RM calculado de verdad, no escrito a mano. */
const recordDe = (nombre, weight, reps, extra = {}) => {
  const perfil = perfilDeEjercicio(nombre);
  const carga = extra.bw ? 61.5 + weight : weight * (perfil.db ? 2 : 1);
  return {
    name: nombre, weight, reps, bw: Boolean(extra.bw), db: perfil.db,
    e1rm: estimatedOneRepMax(carga, reps),
  };
};
const superarDe = (nombre, weight, reps, extra = {}) => {
  const perfil = perfilDeEjercicio(nombre);
  const r = recordDe(nombre, weight, reps, extra);
  return { r, perfil, s: superarRecord(r, perfil, { pesoCorporal: 61.5 }) };
};

test('con rango por arriba, superarlo es una repetición más', () => {
  const { s } = superarDe('Pecho plano', 70, 6);   // rango 5-8
  assert.equal(s.conReps, 7);
});

test('nunca propone las mismas repeticiones que ya hiciste', () => {
  // El redondeo del 1RM alcanzaba para decir "superalo con las seis que ya
  // hiciste". Un consejo que no se puede cumplir es peor que ninguno.
  for (let reps = 1; reps <= 11; reps += 1) {
    for (const nombre of ['Pecho plano', 'Curl en polea baja con barra', 'Face pulls']) {
      const { r, s } = superarDe(nombre, 40, reps);
      if (s?.conReps != null) {
        assert.ok(s.conReps > r.reps, `${nombre} con ${reps} reps propone ${s.conReps}`);
      }
    }
  }
});

test('si engordaste, el récord de dominadas no se supera con las mismas reps', () => {
  // El récord guarda el 1RM con el cuerpo que tenías ese día. Si hoy pesás
  // más, las mismas repeticiones mueven más carga y la cuenta diría que ya lo
  // superaste sin haber hecho nada. Ahí es donde hace falta exigir que la
  // propuesta sea estrictamente mayor.
  const perfil = perfilDeEjercicio('Dominadas agarre ancho');
  const flaco = 61.5;
  // Seis repeticiones, con rango de sobra por arriba (5-8): así la rama de
  // "una repetición más" se evalúa de verdad en vez de descartarse por tope.
  const record = {
    name: 'Dominadas agarre ancho', weight: 0, reps: 6, bw: true,
    e1rm: estimatedOneRepMax(flaco, 6),
  };
  const s = superarRecord(record, perfil, { pesoCorporal: flaco + 5 });
  assert.ok(s.conReps == null || s.conReps > record.reps,
    `pesando 4 kg más propone ${s.conReps} repeticiones contra las ${record.reps} del récord`);
});

test('con el rango cerrado, la única forma es más peso', () => {
  const { s } = superarDe('Pecho plano', 70, 8);   // 8 es el tope de 5-8
  assert.equal(s.conReps, null, 'no tiene sentido pedir 9 en un rango que termina en 8');
  assert.equal(s.conPeso.peso, 72.5);
});

test('las repeticiones del salto se calculan, no se asumen', () => {
  // Con 2,5 kg más y el piso del rango uno se queda corto: 52,5 × 8 NO supera
  // un récord de 50 × 12. Hay que resolver cuántas hacen falta de verdad.
  const { r, perfil, s } = superarDe('Curl en polea baja con barra', 50, 12);
  const conElSalto = estimatedOneRepMax(s.conPeso.peso, s.conPeso.reps);
  assert.ok(conElSalto > r.e1rm, 'la propuesta tiene que superar el récord');
  const unaMenos = estimatedOneRepMax(s.conPeso.peso, s.conPeso.reps - 1);
  assert.ok(unaMenos <= r.e1rm, 'y tiene que ser la mínima que lo logra');
  assert.ok(perfil.salto === 2.5);
});

test('en peso corporal el récord cuenta el cuerpo', () => {
  const { s } = superarDe('Dominadas agarre ancho', 0, 8, { bw: true });
  assert.ok(s.conPeso.peso > 0, 'lo que sube es el lastre');
  assert.ok(s.conPeso.reps < 8, 'con lastre hacen falta menos repeticiones');
});

test('en mancuerna habla por mancuerna, no del total', () => {
  const { r, perfil, s } = superarDe('Press militar', 17.5, 11);
  const texto = textoDeRecord(r, s, perfil);
  assert.match(texto, /17,5 kg c\/u × 11/);
  assert.match(texto, /c\/u/, 'la propuesta también tiene que ser por mancuerna');
  assert.ok(s.conPeso.peso === 20, `el rack sube a 20, no a ${s.conPeso.peso}`);
});

test('sin récord no hay nada que superar', () => {
  const perfil = perfilDeEjercicio('Pecho plano');
  assert.equal(superarRecord(null, perfil), null);
  assert.equal(superarRecord({ e1rm: 0 }, perfil), null);
  assert.equal(textoDeRecord(null, null, perfil), null);
});
