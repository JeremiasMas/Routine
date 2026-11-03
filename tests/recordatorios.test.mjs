import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisoDelDia, loQueVaAlTelefono, enumerar, TIPO, MAX_NOMBRES } from '../js/recordatorios.js';

const nativo = readFileSync('js/native.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const kotlin = readFileSync('android/app/src/main/java/com/jeremiasmas/rutina/Recordatorio.kt', 'utf8');

const act = (id, icon, name) => ({ id, icon, name });
const AGUA = act('agua', '💧', 'Agua');
const PIANO = act('piano', '🎹', 'Piano');
const DATOS = act('datos', '📊', 'Análisis de datos');
const PASOS = act('pasos', '👟', 'Pasos');

/* ---------------------------------------------------------------------------
   Qué dice
   --------------------------------------------------------------------------- */

test('sin nada pendiente no suena nada', () => {
  // Una notificación que felicita es una notificación que se apaga.
  assert.equal(avisoDelDia({ pendientes: [], total: 6 }), null);
  assert.equal(avisoDelDia({}), null);
});

test('una racha que se corta se lleva el aviso entero', () => {
  // Es lo único que no se recupera mañana. Si compartiera el aviso con las
  // misiones sueltas, se perdería entre ellas.
  const a = avisoDelDia({
    pendientes: [AGUA, PIANO, DATOS],
    total: 6,
    riesgos: [{ activity: DATOS, streak: 30, seCorta: true }],
  });
  assert.match(a.titulo, /30 días/);
  assert.match(a.texto, /Análisis de datos/);
  assert.ok(!/Agua/.test(a.texto), 'la racha en juego quedó mezclada con el resto');
});

test('con escudo el aviso es otro, y dice si es el último', () => {
  const ultimo = avisoDelDia({
    pendientes: [DATOS], riesgos: [{ activity: DATOS, streak: 30, seCorta: false, ultimoEscudo: true }],
  });
  assert.match(ultimo.titulo, /último escudo/);
  const otro = avisoDelDia({
    pendientes: [DATOS], riesgos: [{ activity: DATOS, streak: 30, seCorta: false, ultimoEscudo: false }],
  });
  assert.match(otro.titulo, /un escudo/);
  assert.ok(!/último/.test(otro.titulo));
});

test('la que se corta manda sobre la que sólo gasta escudo', () => {
  const a = avisoDelDia({
    pendientes: [DATOS, PIANO],
    riesgos: [
      { activity: PIANO, streak: 5, seCorta: false, ultimoEscudo: false },
      { activity: DATOS, streak: 30, seCorta: true },
    ],
  });
  assert.match(a.titulo, /Se corta/);
});

test('sin rachas en juego, cuenta lo que falta', () => {
  const una = avisoDelDia({ pendientes: [AGUA], total: 6 });
  assert.match(una.titulo, /una misión/);
  assert.match(una.texto, /Llevás 5 de 6/);

  const varias = avisoDelDia({ pendientes: [AGUA, PIANO], total: 6 });
  assert.match(varias.titulo, /2 misiones/);
  assert.match(varias.texto, /💧 Agua y 🎹 Piano/);
});

test('un día entero sin empezar no dice "llevás 0 de 6"', () => {
  const a = avisoDelDia({ pendientes: [AGUA, PIANO], total: 2 });
  assert.ok(!/Llevás/.test(a.texto), 'contar lo hecho cuando no hay nada hecho no aporta');
  assert.match(a.texto, /💧 Agua y 🎹 Piano/);
});

/* ---------------------------------------------------------------------------
   La enumeración
   --------------------------------------------------------------------------- */

test('tres nombres entran; de ahí en más se cuenta', () => {
  assert.equal(enumerar([AGUA]), '💧 Agua');
  assert.equal(enumerar([AGUA, PIANO]), '💧 Agua y 🎹 Piano');
  assert.equal(enumerar([AGUA, PIANO, DATOS]), '💧 Agua, 🎹 Piano y 📊 Análisis de datos');
  assert.equal(enumerar([AGUA, PIANO, DATOS, PASOS]), '💧 Agua, 🎹 Piano, 📊 Análisis de datos y 1 más');
  assert.equal(enumerar([]), '');
  assert.equal(MAX_NOMBRES, 3);
});

/* ---------------------------------------------------------------------------
   Lo que viaja al teléfono
   --------------------------------------------------------------------------- */

test('el paquete lleva la fecha, para que un texto viejo no suene', () => {
  // Si la app no se abre en todo el día, lo guardado es de ayer. Nombrar una
  // racha que ya salvaste es peor que no decir nada.
  const p = loQueVaAlTelefono({ pendientes: [AGUA], total: 6 }, '2026-11-03');
  assert.equal(p.fecha, '2026-11-03');
  assert.equal(p.tipo, TIPO);
  assert.equal(p.hecho, false);
  assert.ok(p.titulo && p.texto);
});

test('con el día cerrado el paquete lo dice, y va sin texto', () => {
  const p = loQueVaAlTelefono({ pendientes: [], total: 6 }, '2026-11-03');
  assert.equal(p.hecho, true);
  assert.equal(p.titulo, '');
  assert.equal(p.texto, '');
});

/* ---------------------------------------------------------------------------
   Las dos puntas del puente
   --------------------------------------------------------------------------- */

test('el aviso se publica con cada cambio, no sólo al abrir', () => {
  // Si cerrás el agua a las siete, el aviso de las ocho no puede nombrarla.
  const bloque = nativo.slice(nativo.indexOf('subscribe((state)'));
  assert.match(bloque.slice(0, 200), /publicarAviso\(paqueteDelEstado\(state\)\)/,
    'el aviso dejó de recalcularse con cada cambio del estado');
});

test('el teléfono descarta un texto que no sea de hoy', () => {
  assert.match(kotlin, /fun guardarTexto\(/, 'el lado de Android no guarda el texto de la web');
  const f = kotlin.slice(kotlin.indexOf('private fun textoDeHoy'));
  const cuerpo = f.slice(0, f.indexOf('\n  }'));
  assert.match(cuerpo, /texto_fecha[\s\S]*LocalDate\.now\(\)/,
    'usaría el texto de ayer sin comparar la fecha');
  assert.match(cuerpo, /tipo\.titulo to tipo\.texto/, 'falta el respaldo genérico');
});

test('el recordatorio de la rutina existe y no pisa a los de Ataraxia', () => {
  const tipos = [...kotlin.matchAll(/^    (\w+)\(\n      "(\w+)", "(\w+)", (\d+), (\d+),/gm)];
  const rutina = tipos.find((t) => t[2] === 'rutina');
  assert.ok(rutina, 'falta el tipo de recordatorio de la rutina');
  assert.equal(rutina[6 - 1], '1004');
  // Código de alarma, notificación y preferencias, todos propios: si dos
  // compartieran uno, programar uno cancelaría al otro sin que nada falle.
  for (const i of [3, 4, 5]) {
    assert.equal(new Set(tipos.map((t) => t[i])).size, tipos.length,
      `dos recordatorios comparten el campo ${i}`);
  }
});

test('la notificación muestra el texto largo entero', () => {
  // "Análisis de datos no tiene escudos. Si el día termina sin registrarlo,
  // vuelve a cero" no entra en una línea.
  assert.match(kotlin, /BigTextStyle\(\)\.bigText/, 'el texto se corta en una línea');
});
