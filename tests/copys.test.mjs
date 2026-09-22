import test from 'node:test';
import assert from 'node:assert/strict';
import { VOZ_CONSTANCIA, VOZ_GENERICA, juicioDeConstancia } from '../js/copys.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

// El copy también se rompe, y se rompe en silencio: la misma frase repetida
// en ocho tarjetas, o el francés hablando de "entrenar más fuerte".

const REGISTROS = ['todo', 'alta', 'media', 'baja'];

/** Las que muestran análisis: el agua no tiene nivel ni tarjeta. */
const CON_ANALISIS = DEFAULT_ACTIVITIES.filter((a) => a.leveled !== false);

test('cada disciplina con análisis tiene voz propia', () => {
  for (const a of CON_ANALISIS) {
    assert.ok(VOZ_CONSTANCIA[a.id], `falta el copy de ${a.id}`);
  }
});

test('ninguna voz se quedó sin registros', () => {
  for (const [id, voz] of Object.entries({ generica: VOZ_GENERICA, ...VOZ_CONSTANCIA })) {
    for (const r of REGISTROS) {
      assert.ok(voz[r]?.length > 20, `${id}.${r} está vacío o es muy corto`);
    }
  }
});

test('no hay dos disciplinas diciendo lo mismo', () => {
  const vistas = new Map();
  for (const [id, voz] of Object.entries({ generica: VOZ_GENERICA, ...VOZ_CONSTANCIA })) {
    for (const r of REGISTROS) {
      const frase = voz[r];
      assert.ok(!vistas.has(frase), `${id}.${r} repite lo que ya dice ${vistas.get(frase)}`);
      vistas.set(frase, `${id}.${r}`);
    }
  }
});

test('cada voz habla del oficio que le toca', () => {
  // No es un diccionario completo: es que cada tarjeta nombre algo suyo en
  // vez de un consejo intercambiable.
  const propio = {
    datos: /dato|problema|archivo/i,
    piano: /toca|piano|mano|pasaje/i,
    gym: /fuerza|sesi[oó]n|pesado|est[ií]mulo/i,
    muaythai: /clase|t[eé]cnica|muay/i,
    pasos: /camin|paso|escalera|vuelta|movimiento/i,
    frances: /idioma|franc[eé]s/i,
    cuerpo: /med[ií]/i,
    substack: /publica|lector|texto|borrador/i,
  };
  for (const [id, re] of Object.entries(propio)) {
    for (const r of REGISTROS) {
      assert.match(VOZ_CONSTANCIA[id][r], re, `${id}.${r} no nombra nada propio`);
    }
  }
});

test('a un idioma no se le dice que entrene', () => {
  for (const r of REGISTROS) {
    assert.doesNotMatch(VOZ_CONSTANCIA.frances[r], /entren/i);
  }
  // Y al revés: medirse tampoco es entrenar.
  for (const r of REGISTROS) {
    assert.doesNotMatch(VOZ_CONSTANCIA.cuerpo[r], /entren/i);
  }
});

test('el registro sale del porcentaje', () => {
  assert.equal(juicioDeConstancia('gym', 7, 7), VOZ_CONSTANCIA.gym.todo);
  assert.equal(juicioDeConstancia('gym', 9, 10), VOZ_CONSTANCIA.gym.alta);
  assert.equal(juicioDeConstancia('gym', 7, 10), VOZ_CONSTANCIA.gym.media);
  assert.equal(juicioDeConstancia('gym', 3, 10), VOZ_CONSTANCIA.gym.baja);
});

test('una actividad nueva cae en la voz genérica sin romper nada', () => {
  assert.equal(juicioDeConstancia('inventada', 7, 10), VOZ_GENERICA.media);
  assert.equal(juicioDeConstancia('inventada', 0, 0), VOZ_GENERICA.baja);
});
