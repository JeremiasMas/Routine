import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  estadoInicial, normalizar, metaPasos, xpPasos, semaforoDelDia, comidasCumplidas,
  resumenDia, nivelDesdeXp, xpParaSubir, rachaActual, derivar, sumarDias, diaSemana, LOGROS,
  lunesDe, sesionesDeLaSemana, xpEjercicio, ejercicioDelDia,
} from '../ataraxia/js/logica.js';
import { FILOSOFOS, filosofoDe } from '../ataraxia/js/filosofos.js';
import { RUTINA_POSTURA } from '../ataraxia/js/postura.js';
import {
  imc, nivelDeImc, nivelesEnKg, rangoSaludable, metaValida, resumenPeso, XP_PESO,
} from '../ataraxia/js/peso.js';
import {
  pasosACargar, mensajeDeEstado, leerOrigenes, hayVariasFuentes, FUENTE,
} from '../ataraxia/js/nativo.js';

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
  const tipo = (k) => metaPasos(e, k).tipo;
  // 8.000 de lunes a viernes, 4.000 el sábado, nada domingo ni miércoles.
  assert.deepEqual(metaPasos(e, LUNES), { tipo: 'alta', meta: 8000, cambiada: false });
  assert.equal(tipo(sumarDias(LUNES, 1)), 'alta');
  assert.equal(tipo(sumarDias(LUNES, 2)), 'libre', 'miércoles');
  assert.equal(tipo(sumarDias(LUNES, 3)), 'alta');
  assert.equal(tipo(sumarDias(LUNES, 4)), 'alta');
  assert.deepEqual(metaPasos(e, sumarDias(LUNES, 5)), { tipo: 'suave', meta: 4000, cambiada: false });
  assert.equal(tipo(DOMINGO), 'libre');
});

test('un día puntual se puede cambiar sin tocar el plan', () => {
  const e = con({ [LUNES]: { tipoPasos: 'suave' } });
  assert.deepEqual(metaPasos(e, LUNES), { tipo: 'suave', meta: 4000, cambiada: true });
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
  const e = con({ [LUNES]: { pasos: 8000, comidas, postura: todaLaPostura } });
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
  for (let i = 0; i < 14; i += 1) {
    const k = sumarDias('2026-09-21', i);
    dias[k] = { pasos: 8000 };
  }
  const d = derivar(con(dias), '2026-10-04');
  // Dos semanas con 5 días de pasos cada una: domingo y miércoles no cuentan.
  assert.equal(d.rachas.pasos, 10);
  assert.equal(d.totales.pasos, 112000);
  assert.ok(d.logros.find((l) => l.id === 'peripatetica').hecho);
  assert.ok(d.nivel.nivel > 1);
  assert.equal(d.filosofo.nivel, d.nivel.nivel);
  assert.equal(new Set(LOGROS.map((l) => l.id)).size, LOGROS.length);
});

test('normalizar repara un estado viejo o roto', () => {
  const e = normalizar({ config: { pasos: { plan: ['x'], alta: -3 } }, dias: { [LUNES]: { pasos: 5 } } });
  assert.equal(e.config.pasos.plan.length, 7);
  assert.equal(e.config.pasos.alta, 8000);
  assert.equal(e.dias[LUNES].pasos, 5);
  assert.deepEqual(normalizar(null), estadoInicial());
});

const MIERCOLES = '2026-09-30';
const SABADO = '2026-10-03';
const ses = (tipo, minutos) => ({ ejercicio: { tipo, minutos } });

test('el ejercicio toca miércoles y sábado, de 45 minutos a una hora', () => {
  const e = estadoInicial();
  assert.deepEqual(e.config.ejercicio, { dias: [3, 6], minimo: 45, maximo: 60 });
  assert.ok(resumenDia(e, MIERCOLES).toca.ejercicio);
  assert.ok(resumenDia(e, SABADO).toca.ejercicio);
  assert.ok(!resumenDia(e, LUNES).toca.ejercicio);
});

test('45 minutos cumplen y la hora suma un poco más', () => {
  assert.equal(xpEjercicio(45, 45, 60), 100);
  assert.equal(xpEjercicio(60, 45, 60), 130);
  assert.equal(xpEjercicio(90, 45, 60), 130, 'pasarse de la hora no suma');
  assert.equal(xpEjercicio(30, 45, 60), 67);
  const corta = ejercicioDelDia(con({ [MIERCOLES]: ses('yoga', 30) }), MIERCOLES);
  assert.equal(corta.completa, false);
  // Las primeras versiones guardaban sólo el tipo: cuenta como el mínimo.
  assert.equal(ejercicioDelDia(con({ [MIERCOLES]: { ejercicio: 'yoga' } }), MIERCOLES).minutos, 45);
  // Un tipo que ya no existe pasa a "otro" en vez de perder la sesión.
  assert.equal(ejercicioDelDia(con({ [MIERCOLES]: ses('gimnasio', 45) }), MIERCOLES).tipo, 'otro');
  assert.equal(ejercicioDelDia(con({ [MIERCOLES]: { ejercicio: { minutos: 45 } } }), MIERCOLES), null);
});

test('el día de ejercicio pide la sesión para ser pleno', () => {
  const comidas = { desayuno: 'verde', almuerzo: 'verde', merienda: 'verde', cena: 'verde' };
  const base = { comidas, postura: todaLaPostura };
  // Miércoles: sin pasos, pero con ejercicio.
  assert.ok(!resumenDia(con({ [MIERCOLES]: base }), MIERCOLES).pleno);
  assert.ok(!resumenDia(con({ [MIERCOLES]: { ...base, ...ses('pilates', 30) } }), MIERCOLES).pleno);
  assert.ok(resumenDia(con({ [MIERCOLES]: { ...base, ...ses('pilates', 50) } }), MIERCOLES).pleno);
  // Un lunes no la pide, y si se hace, suma igual.
  const lunes = resumenDia(con({ [LUNES]: { ...base, pasos: 8000, ...ses('baile', 45) } }), LUNES);
  assert.ok(lunes.pleno);
  assert.equal(lunes.xp, 100 + 100 + 100 + 100 + 50);
});

test('la semana se cumple con dos sesiones completas, en el día que sea', () => {
  assert.equal(lunesDe(LUNES), LUNES);
  assert.equal(lunesDe(DOMINGO), '2026-09-28');
  const e = con({ '2026-10-01': ses('yoga', 45), [SABADO]: ses('baile', 60), [MIERCOLES]: ses('cardio', 20) });
  assert.equal(sesionesDeLaSemana(e, DOMINGO), 2, 'el jueves reemplaza al miércoles; la de 20 min no cuenta');
});

test('la racha de ejercicio se cuenta en semanas y la actual no corta', () => {
  const e = con({
    '2026-09-16': ses('yoga', 45), '2026-09-20': ses('yoga', 60),
    '2026-09-23': ses('baile', 45), '2026-09-26': ses('cardio', 50),
  });
  assert.equal(derivar(e, '2026-09-29').rachas.ejercicio, 2);
  assert.equal(derivar(e, '2026-10-06').rachas.ejercicio, 0);
  assert.equal(derivar(e, '2026-10-06').mejores.ejercicio, 2);
});

test('normalizar repara la configuración del ejercicio', () => {
  const n = (ej) => normalizar({ config: { ejercicio: ej } }).config.ejercicio;
  assert.deepEqual(n(undefined), { dias: [3, 6], minimo: 45, maximo: 60 });
  assert.deepEqual(n({ porSemana: 2 }), { dias: [3, 6], minimo: 45, maximo: 60 });
  assert.deepEqual(n({ dias: [1, 9, 1], minimo: 30, maximo: 20 }), { dias: [1], minimo: 30, maximo: 30 });
});

test('Health Connect pisa lo cargado a mano pero nunca borra un día que no vino', () => {
  const registros = {
    '2026-10-01': { pasos: 5000 },
    '2026-10-02': { pasos: 7000, fuentePasos: FUENTE },
    '2026-10-03': { pasos: 3000, comidas: { cena: 'verde' } },
  };
  const cambios = pasosACargar({
    '2026-10-01': 8123, // a mano: lo pisa
    '2026-10-02': 7000, // igual que antes: no reescribe
    '2026-10-04': 0, // vacío: no toca
    'basura': 900,
  }, registros);
  assert.deepEqual(cambios, [{ clave: '2026-10-01', pasos: 8123 }]);
  // Un día que no vino en la lectura queda como estaba.
  assert.ok(!cambios.some((c) => c.clave === '2026-10-03'));
});

test('el estado de Health Connect se explica con una acción', () => {
  assert.ok(mensajeDeEstado('listo').ok);
  assert.equal(mensajeDeEstado('sin_permiso').accion, 'permiso');
  assert.equal(mensajeDeEstado('sin_health_connect').accion, 'instalar');
  assert.equal(mensajeDeEstado(null).ok, false);
});

test('las apps que aportan pasos se leen con su nombre', () => {
  const o = leerOrigenes([
    { paquete: 'Mi Fitness\u0000com.xiaomi.wearable', pasos: 6000 },
    { paquete: 'com.android.healthconnect.phone.0123456789abcdef', pasos: 5900 },
  ]);
  assert.deepEqual(o.map((x) => x.nombre), ['Mi Fitness', 'Contador del teléfono']);
  assert.ok(hayVariasFuentes(o));
  assert.ok(!hayVariasFuentes(o.slice(0, 1)));
});

test('los niveles de peso para 165 cm salen de la escala de la OMS', () => {
  assert.deepEqual(rangoSaludable(165), { min: 50.4, max: 68.1 });
  assert.equal(nivelDeImc(imc(60, 165)).id, 'saludable');
  assert.equal(nivelDeImc(imc(70, 165)).id, 'sobrepeso');
  assert.equal(nivelDeImc(imc(48, 165)).id, 'bajo');
  assert.equal(nivelDeImc(imc(90, 165)).id, 'obesidad-1');
  const niveles = nivelesEnKg(165);
  assert.equal(niveles.length, 6);
  assert.equal(niveles[0].desdeKg, null);
  assert.equal(niveles[5].hastaKg, null);
  // Cada nivel empieza donde termina el anterior.
  for (let i = 1; i < niveles.length; i += 1) assert.equal(niveles[i].desdeKg, niveles[i - 1].hastaKg);
});

test('no se acepta una meta por debajo del rango saludable', () => {
  assert.ok(metaValida(58, 165));
  assert.ok(!metaValida(48, 165));
  assert.equal(normalizar({ config: { peso: { altura: 165, meta: 45 } } }).config.peso.meta, null);
  assert.equal(normalizar({ config: { peso: { altura: 165, meta: 60 } } }).config.peso.meta, 60);
  assert.deepEqual(normalizar({}).config.peso, { altura: 165, meta: null });
});

test('pesarse da XP una vez por semana, sea cual sea el número', () => {
  const e = con({
    '2026-09-29': { peso: 70 }, // martes: primera de la semana
    '2026-10-01': { peso: 69.5 }, // jueves: misma semana, sin XP
    [LUNES]: { peso: 71 }, // semana nueva: subir también da XP
  });
  assert.equal(resumenDia(e, '2026-09-29').xp, XP_PESO);
  assert.equal(resumenDia(e, '2026-10-01').xp, 0);
  assert.equal(resumenDia(e, LUNES).xp, XP_PESO);
  const d = derivar(e, LUNES);
  assert.equal(d.rachas.peso, 2);
  assert.equal(d.totales.pesadas, 3);
  assert.ok(d.logros.find((l) => l.id === 'balanza').hecho);
});

test('el resumen del peso compara contra cuatro semanas atrás y sigue la meta', () => {
  const e = con({
    '2026-09-01': { peso: 72 },
    '2026-09-08': { peso: 71 },
    '2026-10-06': { peso: 69 },
  }, (x) => { x.config.peso.meta = 65; return x; });
  const p = resumenPeso(e, '2026-10-06');
  assert.equal(p.ultimo.kg, 69);
  assert.equal(p.cambio4, -2, 'contra la pesada del 8 de septiembre');
  assert.equal(p.cambioTotal, -3);
  assert.deepEqual(p.faltaMeta, { kg: 4, alcanzada: false, bajando: true });
  assert.equal(p.nivel.id, 'sobrepeso');
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
