import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parValor, microDatos, nivelTexto, resumenDelDia, partirPorHechas, semanaArrancada, MAX_MICRO,
} from '../js/tablero.js';

const vista = readFileSync('js/views/today.js', 'utf8');
const css = readFileSync('css/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------------------------------------------------------------------------
   El valor contra su meta
   --------------------------------------------------------------------------- */

test('la unidad se escribe una sola vez', () => {
  assert.equal(parValor(4200, 10000, 'pasos'), '4.200 / 10.000 pasos');
  assert.equal(parValor(0, 39, 'series'), '0 / 39 series');
});

test('los dos lados se miden en la misma escala', () => {
  // formatValue convierte cada número por su cuenta y daba "900 ml / 2,2 L":
  // dos escalas en la misma frase, que obligan a hacer la cuenta.
  const agua = parValor(900, 2150, 'ml');
  assert.equal(agua, '0,9 / 2,2 L');
  assert.ok(!/ml/.test(agua), `"${agua}" mezcla mililitros con litros`);

  const largo = parValor(30, 90, 'min');
  assert.ok(/1h 30m$/.test(largo), `"${largo}" no lleva la meta a horas`);
});

test('las metas chicas no se convierten', () => {
  assert.equal(parValor(0, 45, 'min'), '0 / 45 min');
  assert.equal(parValor(300, 900, 'ml'), '300 / 900 ml');
});

/* ---------------------------------------------------------------------------
   Los datos chicos de la fila
   --------------------------------------------------------------------------- */

const pasos = { unit: 'pasos', streakMode: 'daily' };
const gym = { unit: 'series', streakMode: 'weekly' };
const stPasos = { streak: 18, shields: 1, level: { level: 11 } };

test('una racha en juego se lleva la fila entera', () => {
  const micro = microDatos({
    activity: pasos, st: stPasos, day: { met: false }, minutos: 58,
    riesgo: { streak: 30, seCorta: true },
  });
  assert.equal(micro.length, 1, 'la cuenta regresiva comparte renglón con otra cosa');
  assert.equal(micro[0].nivel, 'urgente');
  assert.match(micro[0].texto, /hoy o se corta/);
});

test('con escudo el aviso cambia, y dice si es el último', () => {
  const uno = microDatos({ activity: pasos, st: stPasos, day: { met: false },
    riesgo: { streak: 30, seCorta: false, ultimoEscudo: true } });
  assert.match(uno[0].texto, /último/);
  const varios = microDatos({ activity: pasos, st: stPasos, day: { met: false },
    riesgo: { streak: 30, seCorta: false, ultimoEscudo: false } });
  assert.match(varios[0].texto, /🛡/);
  assert.ok(!/último/.test(varios[0].texto), 'dice "el último" teniendo dos');
});

test('una racha en juego ya cumplida no avisa nada', () => {
  const micro = microDatos({ activity: pasos, st: stPasos, day: { met: true },
    riesgo: { streak: 30, seCorta: true } });
  assert.ok(micro.every((m) => m.nivel !== 'urgente'), 'avisa de una racha que ya salvaste');
});

test('lo accionable va primero y lo demás cae si no entra', () => {
  const micro = microDatos({ activity: pasos, st: stPasos, day: { met: false }, minutos: 58 });
  assert.equal(micro.length, MAX_MICRO);
  assert.equal(micro[0].texto, '🚶 58 min');
  assert.equal(micro[0].nivel, 'vivo', 'los minutos que faltan no están marcados como accionables');
  assert.equal(micro[1].texto, '🔥 18');
  // El escudo es lo primero que se cae: no cambia ninguna decisión de hoy.
  assert.ok(!micro.some((m) => m.texto.includes('🛡')), 'el escudo desplazó a la racha');
});

test('cumplido, los minutos que faltan no se muestran', () => {
  const micro = microDatos({ activity: pasos, st: stPasos, day: { met: true }, minutos: 58 });
  assert.ok(!micro.some((m) => m.texto.includes('🚶')), 'dice cuánto falta caminar con la meta hecha');
  assert.deepEqual(micro.map((m) => m.texto), ['🔥 18', '🛡 1']);
});

test('una misión semanal muestra su avance de la semana', () => {
  const floja = microDatos({ activity: gym, st: { weekCount: 0, weekTarget: 3 }, day: { met: false } });
  assert.deepEqual(floja, [{ texto: '0/3 sem', nivel: 'mudo' }]);
  const cumplida = microDatos({ activity: gym, st: { weekCount: 3, weekTarget: 3 }, day: { met: false } });
  assert.equal(cumplida[0].nivel, 'dato', 'la semana cumplida sigue apagada');
});

test('sin nada que decir no se inventa un chip', () => {
  assert.deepEqual(microDatos({ activity: pasos, st: { streak: 0, shields: 0 }, day: { met: false } }), []);
  assert.deepEqual(microDatos({}), []);
});

/* ---------------------------------------------------------------------------
   El nivel
   --------------------------------------------------------------------------- */

test('un hábito sin nivel no muestra pastilla', () => {
  // El agua no tiene nivel: el anillo le mostraba el porcentaje del día, y en
  // la fila eso ya lo dice la barra.
  assert.equal(nivelTexto({ leveled: false }, { level: { level: 3 } }), null);
  assert.equal(nivelTexto({}, { leveled: false, level: { level: 3 } }), null);
  assert.equal(nivelTexto({}, { level: { level: 14 } }), 'NV 14');
  assert.equal(nivelTexto({}, {}), 'NV 1');
  assert.equal(nivelTexto({}, null), null);
});

/* ---------------------------------------------------------------------------
   El resumen del día
   --------------------------------------------------------------------------- */

test('el resumen dice cuántas faltan, no cómo funciona el bonus', () => {
  const r = resumenDelDia({ hechas: 2, total: 6, xp: 75 });
  assert.equal(r.faltan, 4);
  assert.equal(r.porcentaje, '33%');
  assert.equal(r.perfecto, false);
  assert.match(r.marcas, /80%/);
  assert.match(r.marcas, /100%/);
});

test('el bonus del 80% se cobra con misiones enteras', () => {
  // 5 de 6 son 83% y cobran; 4 de 6 son 67% y no. Redondear para abajo
  // prometería un bonus que no llega.
  assert.equal(resumenDelDia({ hechas: 0, total: 6 }).paraBonus, 5);
  assert.equal(resumenDelDia({ hechas: 4, total: 6 }).paraBonus, 1);
  assert.equal(resumenDelDia({ hechas: 5, total: 6 }).paraBonus, 0);
});

test('el día perfecto se anuncia y no pide nada más', () => {
  const r = resumenDelDia({ hechas: 6, total: 6, xp: 400 });
  assert.equal(r.perfecto, true);
  assert.equal(r.faltan, 0);
  assert.equal(r.pct, 1);
  assert.ok(!/80%/.test(r.marcas), 'el día perfecto sigue explicando el umbral');
});

test('un día sin misiones no divide por cero', () => {
  const r = resumenDelDia({ hechas: 0, total: 0 });
  assert.equal(r.pct, 0);
  assert.equal(r.perfecto, false, 'un día vacío se anuncia como perfecto');
  assert.equal(r.porcentaje, '0%');
});

/* ---------------------------------------------------------------------------
   El orden del tablero
   --------------------------------------------------------------------------- */

test('lo que falta va arriba y conserva su orden', () => {
  const lista = ['gym', 'datos', 'pasos', 'agua', 'frances', 'piano'];
  const { pendientes, hechas } = partirPorHechas(lista, (id) => id === 'frances' || id === 'piano');
  assert.deepEqual(pendientes, ['gym', 'datos', 'pasos', 'agua']);
  assert.deepEqual(hechas, ['frances', 'piano']);
});

test('la semana se pliega sólo mientras está toda en cero', () => {
  assert.equal(semanaArrancada([{ weekCount: 0 }, { weekCount: 0 }]), false);
  assert.equal(semanaArrancada([{ weekCount: 0 }, { weekCount: 1 }]), true);
  assert.equal(semanaArrancada([]), false);
});

/* ---------------------------------------------------------------------------
   Guardas sobre lo que la vista y la hoja de estilos tienen que sostener
   --------------------------------------------------------------------------- */

test('el tablero ya no dibuja anillos', () => {
  // Dos círculos del mismo tamaño al lado del otro, y sólo uno se tocaba.
  assert.ok(!/\bring\(/.test(vista), 'today.js volvió a dibujar el anillo de nivel');
  assert.ok(vista.includes("nivelTexto"), 'el nivel dejó de mostrarse en la fila');
});

test('el botón de la meta es sólido', () => {
  const bloque = css.slice(css.indexOf('.quest__quick {'));
  const regla = bloque.slice(0, bloque.indexOf('}'));
  assert.match(regla, /background:\s*var\(--c/,
    'el botón volvió al relleno translúcido: se confunde con un dato');
  assert.ok(!/color-mix[^;]*background/.test(regla));
});

test('la fila lleva barra, número y datos chicos', () => {
  for (const clase of ['quest__num', 'quest__bar', 'quest__micro', 'quest__nv']) {
    assert.ok(vista.includes(clase), `la fila no usa ${clase}`);
    assert.ok(css.includes(`.${clase}`), `${clase} no tiene estilo`);
  }
});

test('la urgencia tiene un solo tratamiento y nadie más lo usa', () => {
  assert.ok(vista.includes('quest--urge'), 'la fila dejó de marcar la racha en juego');
  assert.ok(css.includes('.quest--urge'), 'la marca de urgencia no tiene estilo');
  // Si "urgente" se repartiera entre varios chips dejaría de querer decir algo.
  const usos = [...vista.matchAll(/chip--urgente/g)].length;
  assert.equal(usos, 0, 'la vista pinta de urgente a mano en vez de dejarlo en microDatos');
  assert.ok(css.includes('.chip--urgente'));
});

test('los chips comparten una sola forma', () => {
  const base = css.slice(css.indexOf('.chip {'));
  const regla = base.slice(0, base.indexOf('}'));
  assert.match(regla, /border-radius:\s*7px/, 'el chip volvió a la píldora');
  assert.match(regla, /border:\s*1px/, 'el chip perdió el borde que lo hace uno solo');
  for (const nivel of ['dato', 'mudo', 'vivo']) {
    assert.ok(css.includes(`.chip--${nivel}`), `falta el nivel ${nivel}`);
  }
});

test('las secciones plegadas son <details>, no un botón a mano', () => {
  // Abrir y cerrar sin estado propio: la vista se vuelve a dibujar entera en
  // cada registro y cualquier bandera nuestra se perdería en el camino.
  assert.ok(/el\('details'/.test(vista), 'lo plegado dejó de ser nativo');
  // Las misiones hechas, la semana sin arrancar y el desglose de calorías.
  assert.ok([...vista.matchAll(/el\('details'/g)].length >= 3,
    'se perdió alguna de las secciones plegadas');
  assert.ok(!/plegado--abierto|estaAbierto|setState/.test(vista),
    'lo plegado volvió a depender de una bandera nuestra, que se pierde al redibujar');
  assert.ok(css.includes('.plegado > summary'));
});
