import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  estadoInicial, normalizar, metaPasos, xpPasos, semaforoDelDia, comidasCumplidas,
  resumenDia, nivelDesdeXp, xpParaSubir, rachaActual, derivar, sumarDias, diaSemana, LOGROS,
  lunesDe, sesionesDeLaSemana, XP_SESION,
} from '../ataraxia/js/logica.js';
import { FILOSOFOS, filosofoDe } from '../ataraxia/js/filosofos.js';
import { RUTINA_POSTURA } from '../ataraxia/js/postura.js';

// 2026-10-05 es lunes; 2026-10-04, domingo.
const LUNES = '2026-10-05';
const DOMINGO = '2026-10-04';
const todaLaPostura = RUTINA_POSTURA.map((e) => e.id);

function con(dias, ajuste = (e) => e) {
  const e = estadoInicial();
  e.dias = dias;
  return ajuste(e);
}

test('las fechas usan el día de la semana local', () => {
  assert.equal(diaSemana(LUNES), 1);
  assert.equal(diaSemana(DOMINGO), 0);
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
});

test('la meta de pasos sale del plan semanal', () => {
  const e = estadoInicial();
  assert.deepEqual(metaPasos(e, LUNES), { tipo: 'alta', meta: 10000, cambiada: false });
  assert.deepEqual(metaPasos(e, DOMINGO), { tipo: 'suave', meta: 6000, cambiada: false });
});

test('un día puntual se puede cambiar sin tocar el plan', () => {
  const e = con({ [LUNES]: { tipoPasos: 'suave' } });
  assert.deepEqual(metaPasos(e, LUNES), { tipo: 'suave', meta: 6000, cambiada: true });
  assert.equal(metaPasos(e, sumarDias(LUNES, 7)).tipo, 'alta');
});

test('cumplir 6.000 un día suave vale lo mismo que 10.000 un día largo', () => {
  assert.equal(xpPasos(6000, 6000), 100);
  assert.equal(xpPasos(10000, 10000), 100);
  assert.equal(xpPasos(3000, 6000), 50);
  assert.equal(xpPasos(50000, 6000), 130, 'pasarse suma, con tope');
  assert.equal(xpPasos(0, 6000), 0);
});

test('el semáforo premia anotar, incluso en rojo', () => {
  const e = con({ [LUNES]: { comidas: { desayuno: 'rojo' } } });
  const s = semaforoDelDia(e, LUNES);
  assert.equal(s.registradas, 1);
  assert.ok(s.xp > 0);
  assert.equal(semaforoDelDia(con({}), LUNES).xp, 0);
});

test('todo verde son 100 XP, tenga el día las comidas que tenga', () => {
  const verde = { desayuno: 'verde', almuerzo: 'verde', merienda: 'verde', cena: 'verde', colacion: 'verde' };
  assert.equal(semaforoDelDia(con({ [LUNES]: { comidas: verde } }), LUNES).xp, 100);
  const cinco = con({ [LUNES]: { comidas: verde } }, (e) => { e.config.comidas.push('colacion'); return e; });
  assert.equal(semaforoDelDia(cinco, LUNES).xp, 100);
});

test('un día de comidas se cumple con todas anotadas y a lo sumo una roja', () => {
  const dia = (c) => comidasCumplidas(semaforoDelDia(con({ [LUNES]: { comidas: c } }), LUNES));
  assert.ok(dia({ desayuno: 'amarillo', almuerzo: 'amarillo', merienda: 'amarillo', cena: 'amarillo' }));
  assert.ok(dia({ desayuno: 'verde', almuerzo: 'verde', merienda: 'verde', cena: 'rojo' }));
  assert.ok(!dia({ desayuno: 'verde', almuerzo: 'verde', merienda: 'rojo', cena: 'rojo' }));
  assert.ok(!dia({ desayuno: 'verde', almuerzo: 'verde', merienda: 'verde' }), 'falta la cena');
});

test('un día pleno es cumplir todo lo que tocaba', () => {
  const comidas = { desayuno: 'verde', almuerzo: 'verde', merienda: 'verde', cena: 'verde' };
  const e = con({ [LUNES]: { pasos: 10000, comidas, postura: todaLaPostura } });
  const r = resumenDia(e, LUNES);
  assert.ok(r.pleno);
  assert.equal(r.xp, 100 + 100 + 100 + 50);
  // Un día libre de pasos no exige pasos para ser pleno.
  const libre = con({ [LUNES]: { tipoPasos: 'libre', comidas, postura: todaLaPostura } });
  assert.ok(resumenDia(libre, LUNES).pleno);
});

test('los niveles suben con una curva lineal', () => {
  assert.equal(nivelDesdeXp(0).nivel, 1);
  assert.equal(nivelDesdeXp(xpParaSubir(1)).nivel, 2);
  assert.equal(nivelDesdeXp(xpParaSubir(1) - 1).nivel, 1);
});

test('hay un filósofo por nivel, del 1 al 60, sin repetir', () => {
  assert.equal(FILOSOFOS.length, 60);
  FILOSOFOS.forEach((f, i) => assert.equal(f.nivel, i + 1));
  assert.equal(new Set(FILOSOFOS.map((f) => f.nombre)).size, 60);
  assert.equal(filosofoDe(1).nombre, 'Tales de Mileto');
  assert.equal(filosofoDe(500).nombre, 'Albert Camus');
});

test('la racha saltea los días libres y no se corta por hoy', () => {
  const cumple = new Set(['2026-10-01', '2026-10-02', '2026-10-04']);
  const toca = (k) => k !== '2026-10-03';
  assert.equal(rachaActual('2026-09-25', '2026-10-05', toca, (k) => cumple.has(k)), 3);
  assert.equal(rachaActual('2026-09-25', '2026-10-06', toca, (k) => cumple.has(k)), 0);
});

test('derivar junta XP, rachas y logros del historial', () => {
  const dias = {};
  for (let i = 0; i < 7; i += 1) {
    const k = sumarDias('2026-09-28', i);
    dias[k] = { pasos: 10000 };
  }
  const d = derivar(con(dias), '2026-10-04');
  assert.equal(d.rachas.pasos, 7);
  assert.equal(d.totales.pasos, 70000);
  assert.ok(d.logros.find((l) => l.id === 'peripatetica').hecho);
  assert.ok(d.nivel.nivel > 1);
  assert.equal(d.filosofo.nivel, d.nivel.nivel);
  assert.equal(new Set(LOGROS.map((l) => l.id)).size, LOGROS.length);
});

test('normalizar repara un estado viejo o roto', () => {
  const e = normalizar({ config: { pasos: { plan: ['x'], alta: -3 } }, dias: { [LUNES]: { pasos: 5 } } });
  assert.equal(e.config.pasos.plan.length, 7);
  assert.equal(e.config.pasos.alta, 10000);
  assert.equal(e.dias[LUNES].pasos, 5);
  assert.deepEqual(normalizar(null), estadoInicial());
});

test('la semana del ejercicio va de lunes a domingo', () => {
  assert.equal(lunesDe(LUNES), LUNES);
  assert.equal(lunesDe(DOMINGO), '2026-09-28');
  const e = con({ '2026-09-29': { ejercicio: 'yoga' }, [DOMINGO]: { ejercicio: 'baile' }, [LUNES]: { ejercicio: 'bici' } });
  assert.equal(sesionesDeLaSemana(e, DOMINGO), 2);
  assert.equal(sesionesDeLaSemana(e, LUNES), 1);
  assert.equal(sesionesDeLaSemana(con({ [LUNES]: { ejercicio: 'inventado' } }), LUNES), 0);
});

test('cada sesión de ejercicio suma XP pero no entra en el día pleno', () => {
  const r = resumenDia(con({ [LUNES]: { ejercicio: 'pilates' } }), LUNES);
  assert.equal(r.xp, XP_SESION);
  assert.ok(!r.pleno);
  const comidas = { desayuno: 'verde', almuerzo: 'verde', merienda: 'verde', cena: 'verde' };
  const sin = resumenDia(con({ [LUNES]: { pasos: 10000, comidas, postura: todaLaPostura } }), LUNES);
  assert.ok(sin.pleno, 'un día sin ejercicio puede ser pleno');
});

test('la racha de ejercicio se cuenta en semanas y la actual no corta', () => {
  // Dos semanas completas (dos sesiones cada una) y la semana en curso vacía.
  const e = con({
    '2026-09-15': { ejercicio: 'yoga' }, '2026-09-18': { ejercicio: 'yoga' },
    '2026-09-22': { ejercicio: 'baile' }, '2026-09-26': { ejercicio: 'bici' },
  });
  assert.equal(derivar(e, '2026-09-29').rachas.ejercicio, 2);
  // Si la semana termina sin sesiones, se corta.
  assert.equal(derivar(e, '2026-10-06').rachas.ejercicio, 0);
  assert.equal(derivar(e, '2026-10-06').mejores.ejercicio, 2);
  // Con una sola sesión por semana pedida, también cuentan las de una.
  const una = con({ '2026-09-22': { ejercicio: 'yoga' } }, (x) => { x.config.ejercicio.porSemana = 1; return x; });
  assert.equal(derivar(una, '2026-09-28').rachas.ejercicio, 1);
});

test('normalizar acota las sesiones por semana', () => {
  assert.equal(normalizar({ config: { ejercicio: { porSemana: 12 } } }).config.ejercicio.porSemana, 2);
  assert.equal(normalizar({ config: { ejercicio: { porSemana: 3 } } }).config.ejercicio.porSemana, 3);
  assert.equal(normalizar({}).config.ejercicio.porSemana, 2);
});

test('los módulos de Ataraxia parsean y el service worker los cachea todos', () => {
  const sw = readFileSync('ataraxia/sw.js', 'utf8');
  for (const nombre of readdirSync('ataraxia/js')) {
    const ruta = `ataraxia/js/${nombre}`;
    execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' });
    assert.ok(sw.includes(`'./js/${nombre}'`), `falta ${ruta} en ataraxia/sw.js`);
  }
  for (const f of ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
    assert.ok(sw.includes(`'./${f}'`), `falta ${f} en ataraxia/sw.js`);
  }
});
