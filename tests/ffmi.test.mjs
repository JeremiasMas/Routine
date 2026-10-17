import test from 'node:test';
import assert from 'node:assert/strict';
import { ffmi, ffmiBand, FFMI_BANDS, bodySummary, massSplit } from '../js/body.js';

// "¿Qué tan musculoso estoy?" no lo contestan los kilos de magro: hay que
// dividirlos por la estatura para que signifiquen algo.

test('el FFMI es la masa magra por metro cuadrado de estatura', () => {
  assert.equal(ffmi(50.8, 160), 19.8);   // 50,8 / 1,60²
  assert.equal(ffmi(64, 200), 16);       // 64 / 4
});

test('la estatura es justamente lo que el índice corrige', () => {
  // Los mismos kilos de magro son dos cuerpos distintos según la altura, y es
  // la razón de ser del índice: sin esto, "52 kg de magro" no se puede leer.
  const bajo = ffmi(52, 160);
  const alto = ffmi(52, 185);
  assert.ok(bajo > alto, `${bajo} tendría que superar a ${alto}`);
});

test('sin datos no se inventa un número', () => {
  assert.equal(ffmi(0, 160), null);
  assert.equal(ffmi(50, 0), null);
  assert.equal(ffmi(null, null), null);
  assert.equal(ffmi(-10, 160), null);
  assert.equal(ffmi('mucho', 160), null);
});

test('la escalera sube: más músculo, banda más alta', () => {
  // Al revés que la de grasa, y por eso las bandas tienen `min` y no `max`.
  const nombre = (v) => ffmiBand(v).name;
  assert.equal(nombre(15), 'Punto de partida');
  assert.equal(nombre(18), 'Promedio');
  assert.equal(nombre(19.8), 'Entrenado');
  assert.equal(nombre(22), 'Musculoso');
  assert.equal(nombre(24), 'Muy musculoso');
  assert.equal(nombre(27), 'Fuera de rango natural');
});

test('el piso de cada banda ya cuenta como esa banda', () => {
  for (const b of FFMI_BANDS.m) {
    if (b.min <= 0) continue;
    assert.equal(ffmiBand(b.min).name, b.name, `${b.min} tiene que ser ya ${b.name}`);
    assert.notEqual(ffmiBand(b.min - 0.1).name, b.name, `${b.min - 0.1} todavía no`);
  }
});

test('dice cuánto falta para el escalón siguiente', () => {
  const b = ffmiBand(19.8);
  assert.equal(b.next.name, 'Musculoso');
  assert.equal(b.falta, 1.2, '21 − 19,8');
  assert.ok(b.pct > 0 && b.pct < 1, `el progreso dentro de la banda fue ${b.pct}`);
});

test('en el último escalón no hay siguiente ni falta nada', () => {
  const b = ffmiBand(30);
  assert.equal(b.next, null);
  assert.equal(b.falta, null);
  assert.equal(b.pct, 1);
});

test('las bandas de mujer son más bajas, porque la referencia es otra', () => {
  // Con las mismas bandas que los varones, una mujer entrenada aparecería
  // siempre como "punto de partida".
  for (let i = 1; i < FFMI_BANDS.f.length; i += 1) {
    assert.ok(FFMI_BANDS.f[i].min < FFMI_BANDS.m[i].min,
      `${FFMI_BANDS.f[i].name}: ${FFMI_BANDS.f[i].min} tendría que ser menor que ${FFMI_BANDS.m[i].min}`);
  }
  assert.equal(ffmiBand(18, 'f').name, 'Musculosa');
  assert.equal(ffmiBand(18, 'm').name, 'Promedio');
});

test('las dos escaleras tienen el mismo largo', () => {
  assert.equal(FFMI_BANDS.f.length, FFMI_BANDS.m.length);
});

test('un FFMI sin valor no devuelve banda', () => {
  assert.equal(ffmiBand(0), null);
  assert.equal(ffmiBand(null), null);
  assert.equal(ffmiBand(undefined), null);
});

test('el resumen de una medición trae el FFMI ya calculado', () => {
  // Es lo que consume la pantalla: si no viaja acá, la sección no existe.
  const r = bodySummary({ weight: 60.5, waist: 78, neck: 35 }, { height: 160, bodyFormula: '3' });
  assert.ok(r.fatPct > 0, 'la grasa sale de las circunferencias');
  assert.equal(r.ffmi, ffmi(massSplit(60.5, r.fatPct).lean, 160));
  assert.ok(r.ffmi > 15 && r.ffmi < 25, `un FFMI de ${r.ffmi} no es plausible`);
});

test('sin medidas de circunferencia no hay FFMI, porque no hay grasa de la que partir', () => {
  const r = bodySummary({ weight: 60.5 }, { height: 160 });
  assert.equal(r.fatPct, null);
  assert.equal(r.ffmi, null, 'sin porcentaje de grasa no se puede separar el magro');
});
