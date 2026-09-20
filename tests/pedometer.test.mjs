import test from 'node:test';
import assert from 'node:assert/strict';
import { contarPasos, Pedometro, PICOS_PARA_ARRANCAR, CALIBRACION_MS, MAX_CALIBRACION } from '../js/pedometer.js';

const G = 9.81;

/**
 * Caminata sintética: la gravedad más una oscilación a la cadencia dada.
 * No es la señal de un teléfono real —eso tiene armónicos, ruido del sensor y
 * el balanceo del brazo— pero tiene lo que el detector mira: un pico por
 * pisada, a intervalos parejos. Que acá dé exacto no significa que dé exacto
 * caminando: significa que el algoritmo hace lo que dice hacer.
 */
function caminata({ hz = 2, segundos = 10, amplitud = 3, muestreoMs = 20, ruido = 0, desde = 0, semilla = 7 } = {}) {
  const out = [];
  let r = semilla;
  const azar = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 - 0.5; };
  for (let t = 0; t <= segundos * 1000; t += muestreoMs) {
    const fase = 2 * Math.PI * hz * (t / 1000);
    out.push({ t: desde + t, x: ruido * azar(), y: ruido * azar(), z: G + amplitud * Math.sin(fase) + ruido * azar() });
  }
  return out;
}

function quieto({ segundos = 10, muestreoMs = 20, ruido = 0.05, desde = 0, semilla = 3 } = {}) {
  return caminata({ hz: 0, segundos, amplitud: 0, muestreoMs, ruido, desde, semilla });
}

/**
 * Zancadas por impulsos, que es como se ve de verdad el acelerómetro al
 * caminar: un golpe fuerte al apoyar el talón y un rebote menor al despegar el
 * pie, unos 160 ms después. Son DOS picos por paso, y el detector tiene que
 * contar uno solo.
 */
function zancadas({ n = 20, periodo = 500, amp = 4, rebote = 0.6, retraso = 160, ancho = 20, muestreoMs = 10 } = {}) {
  const out = [];
  const bump = (t, t0, a) => a * Math.exp(-((t - t0) ** 2) / (2 * ancho * ancho));
  for (let t = 0; t <= n * periodo + 500; t += muestreoMs) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v += bump(t, i * periodo, amp);
      if (rebote) v += bump(t, i * periodo + retraso, amp * rebote);
    }
    out.push({ t, x: 0, y: 0, z: G + v });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contar lo que hay que contar
// ---------------------------------------------------------------------------

test('cuenta los pasos de una caminata normal', () => {
  assert.equal(contarPasos(caminata({ hz: 2, segundos: 30 })), 60);
});

test('no pierde los primeros pasos mientras se calibra', () => {
  // La calibración dura medio segundo largo: a 2 Hz eso es más de un paso.
  // Si se descartara ese tramo en vez de reprocesarlo, faltarían pasos.
  const segundos = 5;
  assert.equal(contarPasos(caminata({ hz: 2, segundos })), 2 * segundos);
  assert.ok(CALIBRACION_MS >= 500, 'la calibración tiene que cubrir al menos una zancada');
});

test('sigue el ritmo desde caminar despacio hasta trotar', () => {
  for (const hz of [1.4, 1.7, 2, 2.5, 3]) {
    assert.equal(contarPasos(caminata({ hz, segundos: 20 })), Math.round(hz * 20), `a ${hz} Hz`);
  }
});

test('el teléfono en la mano sacude poco y aun así cuenta', () => {
  assert.equal(contarPasos(caminata({ hz: 1.8, segundos: 30, amplitud: 1.1, ruido: 0.15 })), 54);
});

test('el teléfono en el bolsillo sacude mucho y no cuenta de más', () => {
  assert.equal(contarPasos(caminata({ hz: 2, segundos: 30, amplitud: 8, ruido: 0.4 })), 60);
});

test('el umbral se adapta: la misma cadencia con amplitudes muy distintas', () => {
  // Un umbral fijo no puede servir para las dos: el de la mano se pierde o
  // el del bolsillo cuenta el ruido.
  for (const amplitud of [0.9, 1.5, 3, 6, 10]) {
    assert.equal(contarPasos(caminata({ hz: 2, segundos: 20, amplitud, ruido: amplitud * 0.1 })), 40,
      `con amplitud ${amplitud}`);
  }
});

// ---------------------------------------------------------------------------
// No contar lo que no hay que contar
// ---------------------------------------------------------------------------

test('quieto no cuenta nada', () => {
  assert.equal(contarPasos(quieto({ segundos: 60 })), 0);
});

test('el teléfono apoyado en una mesa que vibra tampoco', () => {
  assert.equal(contarPasos(quieto({ segundos: 60, ruido: 0.2 })), 0);
});

test('levantar el teléfono y volver a dejarlo no suma pasos', () => {
  // Tres sacudones seguidos, dentro de la ventana de ritmo pero sin sostenerlo:
  // no llegan a los cuatro picos rítmicos que hacen falta para contar.
  const muestras = [...quieto({ segundos: 3 })];
  for (let i = 0; i < 3; i++) {
    for (const m of caminata({ hz: 1.4, segundos: 0.35, amplitud: 7, desde: 3000 + i * 800 })) muestras.push(m);
    for (const m of quieto({ segundos: 0.45, desde: 3350 + i * 800 })) muestras.push(m);
  }
  for (const m of quieto({ segundos: 5, desde: 5400 })) muestras.push(m);
  muestras.sort((a, b) => a.t - b.t);
  assert.equal(contarPasos(muestras), 0);
});

test('cuenta un paso por zancada, no dos: el rebote del pie no es un paso', () => {
  // Cada zancada deja dos picos (talón y despegue). Sin el intervalo mínimo
  // entre picos, el contador casi se duplica.
  assert.equal(contarPasos(zancadas({ n: 20, rebote: 0.6 })), 20);
  assert.equal(contarPasos(zancadas({ n: 20, rebote: 0 })), 20, 'con o sin rebote, la cuenta es la misma');
});

test('el rebote no cuenta con cualquier separación', () => {
  for (const retraso of [120, 160, 200, 240]) {
    assert.equal(contarPasos(zancadas({ n: 20, retraso })), 20, `rebote a ${retraso} ms`);
  }
});

// ---------------------------------------------------------------------------
// Robustez
// ---------------------------------------------------------------------------

test('funciona igual a distintas frecuencias de muestreo', () => {
  // Los teléfonos entregan el acelerómetro entre 16 y 60 ms. Los filtros se
  // calculan sobre el tiempo transcurrido, no sobre el número de muestras.
  for (const ms of [16, 20, 33, 60]) {
    assert.equal(contarPasos(caminata({ hz: 2, segundos: 30, muestreoMs: ms })), 60, `a ${ms} ms`);
    assert.equal(contarPasos(caminata({ hz: 2, segundos: 30, muestreoMs: ms, amplitud: 1.0, ruido: 0.15 })), 60,
      `señal débil a ${ms} ms`);
  }
});

test('aguanta que las muestras lleguen a intervalos irregulares', () => {
  const base = caminata({ hz: 2, segundos: 30, muestreoMs: 10 });
  let r = 11;
  const salteadas = base.filter(() => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 > 0.45; });
  const pasos = contarPasos(salteadas);
  assert.ok(Math.abs(pasos - 60) <= 2, `con muestras irregulares contó ${pasos}`);
});

test('una pausa en el medio corta el ritmo pero la caminata sigue', () => {
  const pasos = contarPasos([
    ...caminata({ hz: 2, segundos: 20 }),
    ...quieto({ segundos: 30, desde: 20000 }),
    ...caminata({ hz: 2, segundos: 20, desde: 50000 }),
  ]);
  assert.ok(pasos >= 76 && pasos <= 82, `esperaba ~80, contó ${pasos}`);
});

test('hacen falta cuatro picos rítmicos para empezar a contar', () => {
  const p = new Pedometro();
  let acumulado = 0;
  for (const m of caminata({ hz: 2, segundos: 2.5 })) acumulado += p.push(m.x, m.y, m.z, m.t);
  assert.ok(p.pasos >= PICOS_PARA_ARRANCAR, `contó ${p.pasos}`);
  assert.equal(acumulado, p.pasos, 'lo que devuelve cada muestra tiene que sumar el total');
});

test('el contador incremental y el de una pasada dan lo mismo', () => {
  const muestras = caminata({ hz: 2, segundos: 15 });
  const p = new Pedometro();
  let suma = 0;
  for (const m of muestras) suma += p.push(m.x, m.y, m.z, m.t);
  assert.equal(suma, p.pasos);
  assert.equal(p.pasos, contarPasos(muestras));
});

test('un teléfono que repite la marca de tiempo no cuelga la calibración', () => {
  // Si el reloj del evento no avanza, la ventana de calibración nunca se
  // cumpliría: el tope de muestras la cierra igual en vez de acumular para
  // siempre.
  const p = new Pedometro();
  for (let i = 0; i < 2000; i++) p.push(0, 0, G, 0);
  assert.ok(p.buffer.length <= MAX_CALIBRACION, `el buffer quedó en ${p.buffer.length}`);
  assert.notEqual(p.gravedad, null, 'la calibración tiene que haber terminado');
  assert.equal(p.pasos, 0, 'y sin movimiento no cuenta nada');
});
