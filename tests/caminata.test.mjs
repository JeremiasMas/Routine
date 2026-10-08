import test from 'node:test';
import assert from 'node:assert/strict';
import { PASOS_POR_MINUTO, minutosDeCaminata, DEFAULT_ACTIVITIES } from '../js/config.js';
import { formatValue } from '../js/utils.js';

// Lo que falta del día dicho en tiempo, que es la unidad en la que uno decide
// si sale a caminar o no.

test('los pasos que faltan se convierten a minutos', () => {
  assert.equal(minutosDeCaminata(1000), 10);
  assert.equal(minutosDeCaminata(5800), 58);
  assert.equal(minutosDeCaminata(PASOS_POR_MINUTO), 1);
});

test('sin nada que caminar no se dice nada', () => {
  // La pantalla no tiene que decidir qué significa "0 min": acá no hay número.
  assert.equal(minutosDeCaminata(0), null, 'la meta ya está');
  assert.equal(minutosDeCaminata(-500), null, 'te pasaste de la meta');
  assert.equal(minutosDeCaminata(null), null);
  assert.equal(minutosDeCaminata(undefined), null);
  assert.equal(minutosDeCaminata('ocho mil'), null);
  assert.equal(minutosDeCaminata(Infinity), null, 'no es un tiempo');
  assert.equal(minutosDeCaminata(NaN), null);
});

test('la cadencia queda del lado largo, no del corto', () => {
  // Caminando relajado salen 110-115 pasos por minuto. Con una cadencia más
  // alta que la real, los minutos saldrían cortos y la app prometería que
  // llegás en menos de lo que te va a llevar.
  assert.ok(PASOS_POR_MINUTO <= 110,
    `${PASOS_POR_MINUTO} pasos por minuto promete una caminata más rápida que la de cualquiera`);
  assert.ok(PASOS_POR_MINUTO >= 70,
    `${PASOS_POR_MINUTO} pasos por minuto es un paseo, no una caminata`);
});

test('los minutos se dicen en horas cuando son muchos', () => {
  // Reusa formatValue, que es el que ya sabe que 100 minutos son "1h 40m".
  const texto = (pasos) => formatValue(Math.round(minutosDeCaminata(pasos)), 'min');
  assert.equal(texto(5800), '58 min');
  assert.equal(texto(10000), '1h 40m');
  assert.equal(texto(6000), '1h');
});

test('la meta diaria de pasos entra en una caminata de un día', () => {
  // Si la meta pidiera cuatro horas a pie, el número sería honesto y la meta
  // estaría mal. Vale la pena que una prueba lo note.
  const pasos = DEFAULT_ACTIVITIES.find((a) => a.id === 'pasos');
  const minutos = minutosDeCaminata(pasos.goal);
  assert.ok(minutos <= 180, `la meta son ${Math.round(minutos)} minutos de caminata`);
});
