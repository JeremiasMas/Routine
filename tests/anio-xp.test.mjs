import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { semanasDeXp } from '../js/analisis.js';
import { addDays, weekStart } from '../js/utils.js';

// El mapa de calor y las barras de XP por semana eran dos figuras separadas,
// cada una con su eje de tiempo. Ahora es una sola, y las decisiones que no
// son de dibujo viven en semanasDeXp.

const MIERCOLES = '2026-11-04';
const DOMINGO = '2026-11-08';

/** Un estado con el XP que le pongas por fecha. */
const estado = (porFecha = {}) => ({
  daily: new Map(Object.entries(porFecha).map(([f, v]) => [f, typeof v === 'number' ? { xp: v } : v])),
});

test('cubre las semanas pedidas y ninguna más', () => {
  const { semanas } = semanasDeXp(estado(), MIERCOLES, 4);
  assert.equal(semanas.length, 5, 'cuatro semanas atrás más la de hoy');
  assert.equal(semanas[0].lunes, weekStart(addDays(MIERCOLES, -28)));
  assert.equal(semanas.at(-1).lunes, weekStart(MIERCOLES));
  for (const s of semanas) assert.equal(s.dias.length, 7, 'toda columna tiene siete días');
});

test('un día que todavía no llegó no es un día de cero', () => {
  // El miércoles faltan jueves, viernes, sábado y domingo. Si vinieran como
  // ceros, la semana en curso aparecería con cuatro días fallados.
  const { semanas } = semanasDeXp(estado(), MIERCOLES, 2);
  const actual = semanas.at(-1);
  assert.deepEqual(actual.dias.map((d) => d === null), [false, false, false, true, true, true, true]);
  assert.equal(actual.enCurso, true);
});

test('la semana cerrada no queda marcada como en curso', () => {
  // Un domingo la semana está completa: ya se puede comparar con las demás.
  const { semanas } = semanasDeXp(estado(), DOMINGO, 2);
  assert.equal(semanas.at(-1).enCurso, false);
  assert.ok(semanas.at(-1).dias.every((d) => d !== null));
  assert.ok(semanas.every((s) => !s.enCurso), 'ninguna semana quedó abierta');
});

test('el total de la semana es la suma de sus días', () => {
  const lunes = weekStart(MIERCOLES);
  const { semanas } = semanasDeXp(estado({
    [lunes]: 100, [addDays(lunes, 1)]: 50, [addDays(lunes, 2)]: 7,
  }), MIERCOLES, 2);
  assert.equal(semanas.at(-1).total, 157);
  assert.equal(semanas[0].total, 0);
});

test('la semana en curso no fija la escala de las barras', () => {
  // Es el error que hacía inservible la figura: un lunes a la mañana la
  // semana en curso vale casi nada, y si entrara en el máximo todas las
  // anteriores se irían al techo.
  const lunes = weekStart(MIERCOLES);
  const anterior = addDays(lunes, -7);
  const conPico = semanasDeXp(estado({ [anterior]: 900, [lunes]: 10 }), MIERCOLES, 3);
  assert.equal(conPico.maxSemana, 900);

  // Y al revés: una semana en curso enorme tampoco achica a las cerradas.
  const grande = semanasDeXp(estado({ [anterior]: 300, [lunes]: 5000 }), MIERCOLES, 3);
  assert.equal(grande.maxSemana, 300, 'la semana a medio terminar fijó la escala');
});

test('el día se escala contra tu mejor día de siempre, no contra la ventana', () => {
  // Si la escala fuera la ventana, una mala racha repintaría de colores
  // vivos los días flojos y el celeste dejaría de querer decir algo.
  const lunes = weekStart(MIERCOLES);
  const viejo = addDays(lunes, -200);
  const { maxDia } = semanasDeXp(estado({ [viejo]: 4000, [lunes]: 120 }), MIERCOLES, 3);
  assert.equal(maxDia, 4000, 'el récord quedó fuera de la escala por estar fuera de la ventana');
});

test('una cuenta nueva no pinta su primer día del color más fuerte', () => {
  const { maxDia } = semanasDeXp(estado({ [weekStart(MIERCOLES)]: 30 }), MIERCOLES, 3);
  assert.ok(maxDia >= 60, `30 XP se pintarían a tope: maxDia fue ${maxDia}`);
});

test('sin historial no rompe ni devuelve escalas de cero', () => {
  const r = semanasDeXp({}, MIERCOLES, 2);
  assert.equal(r.semanas.length, 3);
  assert.ok(r.maxSemana >= 1, 'una escala en cero dividiría por cero al dibujar');
  assert.ok(r.maxDia >= 60);
});

/* ---------------------------------------------------------------------------
   Que no vuelvan a ser dos figuras
   --------------------------------------------------------------------------- */

test('Progreso dibuja el año en una sola figura', () => {
  const stats = readFileSync('js/views/stats.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.ok(!/XP por semana/.test(stats), 'volvió la sección aparte de XP por semana');
  assert.ok(!/barChart/.test(stats), 'volvieron las barras con su propio eje de tiempo');
  assert.match(stats, /semanasDeXp\(/, 'la figura dejó de usar la lógica compartida');
  // Días y barras tienen que salir del mismo recorrido, o se desalinean.
  const fig = stats.slice(stats.indexOf('function anioEnXp'));
  assert.match(fig, /for \(const sem of semanas\)[\s\S]*anio__dia[\s\S]*anio__barra/,
    'la barra de la semana dejó de colgar de la misma columna que sus días');
});
