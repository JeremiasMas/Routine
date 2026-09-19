import test from 'node:test';
import assert from 'node:assert/strict';
import { navyBodyFat, bmi, massSplit, waterGoalMl, bodySummary, bodyDelta } from '../js/body.js';

test('la fórmula de 3 medidas da un porcentaje plausible', () => {
  // 160 cm, cintura 85, cuello 38.
  const pct = navyBodyFat({ waist: 85, neck: 38, height: 160 });
  assert.ok(pct > 18 && pct < 21, `esperaba ~19,6%, obtuve ${pct}`);
});

test('menos cintura con el mismo cuello y estatura da menos grasa', () => {
  const antes = navyBodyFat({ waist: 90, neck: 38, height: 160 });
  const despues = navyBodyFat({ waist: 82, neck: 38, height: 160 });
  assert.ok(despues < antes, 'bajar de cintura tiene que bajar el porcentaje');
});

test('la fórmula de 4 medidas usa la cadera', () => {
  const con = navyBodyFat({ waist: 75, neck: 32, hip: 95, height: 160, formula: '4' });
  assert.ok(con > 0 && con < 60, `porcentaje fuera de rango: ${con}`);
  assert.equal(navyBodyFat({ waist: 75, neck: 32, height: 160, formula: '4' }), null,
    'sin cadera la fórmula de 4 no puede calcular');
});

test('mediciones incompletas o imposibles devuelven null en vez de números falsos', () => {
  assert.equal(navyBodyFat({ waist: 0, neck: 38, height: 160 }), null);
  assert.equal(navyBodyFat({ waist: 85, neck: 0, height: 160 }), null);
  assert.equal(navyBodyFat({ waist: 85, neck: 38, height: 0 }), null);
  assert.equal(navyBodyFat({ waist: 30, neck: 38, height: 160 }), null, 'cuello mayor que cintura');
  assert.equal(navyBodyFat({ waist: 38, neck: 38, height: 160 }), null, 'diferencia cero');
  assert.equal(navyBodyFat({ waist: 'x', neck: 'y', height: 'z' }), null);
});

test('IMC y reparto de masa', () => {
  assert.equal(bmi(61.5, 160), 24);
  assert.equal(bmi(0, 160), null);
  assert.equal(bmi(61.5, 0), null);
  const m = massSplit(61.5, 20);
  assert.equal(m.fat, 12.3);
  assert.equal(m.lean, 49.2);
  assert.equal(massSplit(61.5, null), null);
});

test('la meta de agua sale del peso: 35 ml por kilo', () => {
  assert.equal(waterGoalMl(61.5), 2150);
  assert.equal(waterGoalMl(80), 2800);
  assert.equal(waterGoalMl(0), 2000, 'sin peso cargado, un valor razonable por defecto');
});

test('el resumen junta todo a partir de una medición', () => {
  const s = bodySummary({ weight: 61.5, waist: 85, neck: 38 }, { height: 160 });
  assert.equal(s.bmi, 24);
  assert.ok(s.fatPct > 18 && s.fatPct < 21);
  assert.equal(s.waterGoal, 2150);
  assert.equal(s.mass.fat + s.mass.lean, 61.5);
});

test('la tendencia compara dos mediciones', () => {
  const perfil = { height: 160 };
  const previa = bodySummary({ weight: 63, waist: 88, neck: 38 }, perfil);
  const actual = bodySummary({ weight: 61.5, waist: 85, neck: 38 }, perfil);
  const d = bodyDelta(actual, previa);
  assert.equal(d.weight, -1.5);
  assert.equal(d.waist, -3);
  assert.ok(d.fatPct < 0, 'bajó el porcentaje de grasa');
  assert.equal(bodyDelta(actual, null), null);
});

test('la línea de base del perfil da un cálculo coherente', async () => {
  const { DEFAULT_PROFILE } = await import('../js/config.js');
  assert.equal(DEFAULT_PROFILE.height, 160);
  const s = bodySummary(
    { weight: DEFAULT_PROFILE.weight, waist: DEFAULT_PROFILE.waist, neck: DEFAULT_PROFILE.neck },
    DEFAULT_PROFILE,
  );
  assert.equal(s.fatPct, 16.3);
  assert.equal(s.mass.fat, 10);
  assert.equal(s.mass.lean, 51.5);
  assert.equal(s.bmi, 24);
  assert.equal(s.waterGoal, 2150);
});

test('el rango de grasa corporal describe el porcentaje', async () => {
  const { bodyFatBand } = await import('../js/body.js');
  assert.equal(bodyFatBand(28).name, 'Punto de partida');
  assert.equal(bodyFatBand(22).name, 'En progreso');
  assert.equal(bodyFatBand(18.5).name, 'Saludable');
  assert.equal(bodyFatBand(16.3).name, 'Atlético', 'la línea de base cae acá');
  assert.equal(bodyFatBand(14).name, 'Definido');
  assert.equal(bodyFatBand(12.5).name, 'Marcado');
});

test('la escalera de grasa termina en la meta y no premia seguir bajando', async () => {
  const { bodyFatBand } = await import('../js/body.js');
  const meta = bodyFatBand(12.5);
  const extremo = bodyFatBand(6);
  assert.equal(meta.name, extremo.name, 'por debajo del 13% no hay rangos nuevos');
  assert.equal(meta.next, null);
  assert.equal(extremo.next, null);
});

test('la banda dice cuánto falta para la siguiente', async () => {
  const { bodyFatBand } = await import('../js/body.js');
  const b = bodyFatBand(16.3);
  assert.equal(b.next.name, 'Definido');
  assert.equal(b.next.max, 15);
  assert.equal(b.falta, 1.3, 'puntos de grasa hasta la siguiente banda');
  assert.ok(b.pct > 0 && b.pct < 1);
});

test('sin medición no hay banda inventada', async () => {
  const { bodyFatBand } = await import('../js/body.js');
  assert.equal(bodyFatBand(null), null);
  assert.equal(bodyFatBand(0), null);
});
