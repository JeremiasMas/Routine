import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sensacion, sensacionPortena, ropaPara, paraguas, planCaminata, plan, lineasWidget, lineaCaminata,
  normalizarHorario, minutos, diaDeSemana, sumarDias, HORARIO_DEFAULT,
} from '../clima/js/logica.js';
import { horasDe, ahoraEnBA, traer, URL_PRONOSTICO } from '../clima/js/pronostico.js';
import { CASOS, dia } from './clima-casos.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// 2026-10-13 es martes.
const MARTES = '2026-10-13';

test('las fechas no dependen del huso del teléfono', () => {
  assert.equal(diaDeSemana(MARTES), 2);
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(minutos('9:30'), 570);
  assert.equal(minutos('25:00'), null);
  assert.deepEqual(ahoraEnBA(new Date('2026-10-13T02:30:00Z')), { fecha: '2026-10-12', minutos: 23 * 60 + 30 });
});

test('el viento de Río Grande no cuenta: sólo el que pasa de 20 km/h', () => {
  const base = { temp: 10, hum: 60, aparente: 6 };
  assert.equal(sensacion({ ...base, viento: 18 }), 10);
  assert.equal(sensacion({ ...base, viento: 40 }), 8);
  // Un porteño siente todo el viento y además está menos curtido.
  assert.ok(sensacionPortena({ ...base, viento: 18 }) < sensacion({ ...base, viento: 18 }) - 3);
});

test('el frío húmedo porteño resta un grado', () => {
  assert.equal(sensacion({ temp: 10, hum: 90, viento: 0 }), 9);
  assert.equal(sensacion({ temp: 18, hum: 90, viento: 0 }), 18);
});

test('con calor manda la sensación térmica, que con humedad sube', () => {
  assert.equal(sensacion({ temp: 30, hum: 75, viento: 10, aparente: 35 }), 35);
  // Y nunca baja de la temperatura: el viento no te refresca un día de calor.
  assert.equal(sensacion({ temp: 26, hum: 30, viento: 30, aparente: 24 }), 26);
});

test('la ropa va varios grados más abajo que la de un porteño', () => {
  assert.equal(ropaPara(10).id, 'liviana');
  assert.equal(ropaPara(10 - 4).id, 'campera');
  assert.equal(ropaPara(2).id, 'abrigo');
  assert.equal(ropaPara(30).id, 'liviano');
});

test('paraguas: lluvia sí, llovizna probable chico, sudestada capucha', () => {
  const seco = { prob: 5, lluvia: 0, codigo: 1, rafagas: 20 };
  assert.equal(paraguas([seco]).nivel, 'no');
  assert.equal(paraguas([{ ...seco, prob: 30 }]).nivel, 'quizas');
  assert.equal(paraguas([{ ...seco, prob: 70, lluvia: 0.2 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, lluvia: 1.2 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, codigo: 95 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, prob: 80, lluvia: 2, rafagas: 70 }]).nivel, 'capucha');
});

test('una probabilidad alta sin agua esperada no es lluvia, es "por las dudas"', () => {
  // Lo que pasó el 13/10: chubascos sueltos a la mañana, y a la tarde
  // Open-Meteo con probabilidad alta pero sin milímetros. No era para
  // mandarte a caminar a las 19 en vez de al almuerzo.
  const seco = { prob: 5, lluvia: 0, codigo: 1, rafagas: 20 };
  assert.equal(paraguas([{ ...seco, prob: 70 }]).nivel, 'quizas');
  assert.equal(paraguas([{ ...seco, prob: 10, lluvia: 0.1 }]).nivel, 'quizas');
  assert.equal(paraguas([{ ...seco, prob: 10, lluvia: 0.3 }]).nivel, 'si');
});

test('la lluvia que ya pasó no cuenta para el paraguas', () => {
  // Llovió a la ida (8 a 9); al mediodía ya no llueve más en el día.
  const horas = dia(MIERCOLES, (h) => (h === 8 ? { prob: 90, lluvia: 2 } : {}));
  const alas7 = plan(horas, HORARIO_DEFAULT, { fecha: MIERCOLES, minutos: 7 * 60 });
  assert.equal(alas7.paraguas.nivel, 'si');
  const mediodia = plan(horas, HORARIO_DEFAULT, { fecha: MIERCOLES, minutos: 12 * 60 + 50 });
  assert.equal(mediodia.paraguas.nivel, 'no');
  // Y al mediodía estás en la oficina: el widget no dice qué ponerte.
  assert.equal(lineasWidget(mediodia).titulo, '');
});

test('el horario roto vuelve al de siempre', () => {
  assert.deepEqual(normalizarHorario(null ?? undefined), { ...HORARIO_DEFAULT, dias: [2, 3, 4], almuerzo: { ...HORARIO_DEFAULT.almuerzo }, caminatas: [] });
  assert.deepEqual(normalizarHorario({ entrada: '18:00', salida: '09:00' }).entrada, '09:00');
  assert.deepEqual(normalizarHorario({ dias: [5, 1, 9, 1] }).dias, [1, 5]);
  assert.equal(normalizarHorario({ viaje: 999 }).viaje, 180);
});

const SABADO = '2026-10-17';
// Las reglas generales se prueban con un horario fijo de lunes a viernes, sin
// almuerzo libre; tu semana real se prueba aparte, más abajo.
const LV = { dias: [1, 2, 3, 4, 5], entrada: '09:00', salida: '18:00', viaje: 45, almuerzo: null, ocupados: [] };
const conCaminata = (caminatas, extra = {}) => ({ ...LV, caminatas, ...extra });

test('sin horarios propios busca el óptimo, fuera de la oficina', () => {
  const horas = dia(MARTES, () => ({}));
  // Libre a las 7 (a las 8:15 salís) y de 19 a 22. Todo igual de bueno: el primero.
  assert.deepEqual(planCaminata(horas, LV, MARTES), { tipo: 'optimo', desde: 7 * 60, hasta: 8 * 60, minutos: null, sol: false });
});

test('con los pasos que faltan calcula cuánto caminar', () => {
  const horas = dia(MARTES, () => ({}));
  // 8.000 pasos que faltan son 80 minutos: hacen falta dos horas seguidas, y
  // a la mañana hay una sola.
  assert.deepEqual(planCaminata(horas, LV, MARTES, 0, 2000), { tipo: 'optimo', desde: 19 * 60, hasta: 21 * 60, minutos: 80, sol: false });
  assert.deepEqual(planCaminata(horas, LV, MARTES, 0, 9950), { tipo: 'optimo', desde: 7 * 60, hasta: 8 * 60, minutos: 1, sol: false });
  assert.deepEqual(planCaminata(horas, LV, MARTES, 0, 10200), { cumplida: true });
  assert.deepEqual(planCaminata(horas, conCaminata([], { meta: 12000 }), MARTES, 0, 10200).minutos, 18);
});

test('tu horario de siempre, si el clima acompaña, queda', () => {
  const horas = dia(MARTES, () => ({}));
  assert.deepEqual(planCaminata(horas, conCaminata(['19:00']), MARTES, 0, 4000),
    { tipo: 'habitual', inicio: 19 * 60, almuerzo: false, fin: null, quedan: 1, ok: true, otra: null, minutos: 60 });
});

test('si llueve en tu horario, propone otro', () => {
  const horas = dia(MARTES, (h) => (h === 19 ? { prob: 80 } : h === 7 ? { temp: 30, aparente: 30 } : {}));
  assert.deepEqual(planCaminata(horas, conCaminata(['19:00']), MARTES),
    { tipo: 'habitual', inicio: 19 * 60, almuerzo: false, fin: null, quedan: 1, ok: false, motivo: 'lluvia', otra: { desde: 20 * 60, hasta: 21 * 60 }, minutos: null });
});

test('aunque tu horario sirva, avisa si otro es mucho mejor', () => {
  const horas = dia(MARTES, (h) => (h === 13 ? { temp: 26, aparente: 26 } : {}));
  const casa = conCaminata(['13:00'], { dias: [] });
  assert.deepEqual(planCaminata(horas, casa, MARTES),
    { tipo: 'habitual', inicio: 13 * 60, almuerzo: false, fin: null, quedan: 1, ok: true, otra: { desde: 7 * 60, hasta: 8 * 60 }, minutos: null });
});

test('el fin de semana da el horario óptimo, sin mirar los de la semana', () => {
  // Nublado todo el día salvo de 10 a 12, que además está a 15°.
  const horas = dia(SABADO, (h) => (h === 10 || h === 11 ? { temp: 15, uv: 4 } : { uv: 1 }));
  assert.deepEqual(planCaminata(horas, conCaminata(['19:00']), SABADO, 0, 2000),
    { tipo: 'optimo', desde: 10 * 60, hasta: 12 * 60, minutos: 80, sol: true });
});

test('el fin de semana busca sol para la vitamina D, sin pasarse', () => {
  // Una curva de UV de primavera: sube a la mañana, pico de 9 al mediodía.
  const uv = [0, 0, 0, 0, 0, 0, 0, 0.5, 1.5, 3, 4.5, 6.5, 8.5, 9, 8, 6, 4, 2, 0.5, 0, 0, 0, 0, 0];
  const horas = dia(SABADO, (h) => ({ uv: uv[h] }));
  const c = planCaminata(horas, conCaminata([]), SABADO, 7 * 60, 2000);
  // De 9 a 11: UV de 3 a 4,5. El mediodía (8,5 y más) ni se ofrece, y a
  // las 11 (6,5) ya se pasa de la franja.
  assert.deepEqual([c.desde, c.hasta, c.sol], [9 * 60, 11 * 60, true]);
  // Por la tarde, si a la mañana llueve: de 15 a 17, cuando el sol baja.
  const tarde = dia(SABADO, (h) => ({ uv: uv[h], ...(h < 13 ? { prob: 90 } : {}) }));
  const t = planCaminata(tarde, conCaminata([]), SABADO, 7 * 60, 2000);
  assert.deepEqual([t.desde, t.hasta, t.sol], [15 * 60, 17 * 60, true]);
});

test('entre semana el sol no se busca, y el widget no lo marca', () => {
  const horas = dia(MARTES, (h) => ({ uv: h >= 10 && h <= 16 ? 5 : 0 }));
  const c = planCaminata(horas, LV, MARTES, 0, null);
  assert.equal(c.sol, false);
  assert.ok(!lineaCaminata({ ...c, etiqueta: 'Hoy' }).includes('☀️'));
});

test('un fin de semana nublado no promete sol', () => {
  const horas = dia(SABADO, () => ({ uv: 1 }));
  assert.equal(planCaminata(horas, conCaminata([]), SABADO, 7 * 60, null).sol, false);
});

test('un horario que ya pasó no se revisa', () => {
  const horas = dia(MARTES, () => ({}));
  assert.equal(planCaminata(horas, conCaminata(['07:00', '19:00']), MARTES, 12 * 60).inicio, 19 * 60);
  assert.deepEqual(planCaminata(horas, LV, MARTES, 20 * 60 + 10), { tipo: 'optimo', desde: 20 * 60, hasta: 21 * 60, minutos: null, sol: false });
});

test('sin ningún rato bueno, dice por qué', () => {
  const horas = dia(MARTES, () => ({ prob: 90 }));
  assert.deepEqual(planCaminata(horas, LV, MARTES), { motivo: 'lluvia', minutos: null });
});

test('los horarios de caminata se ordenan y se limpian', () => {
  assert.deepEqual(normalizarHorario({ caminatas: ['19:00', '7:30', 'roto', '19:00', '12:00', '21:00'] }).caminatas,
    ['07:30', '12:00', '19:00']);
  assert.equal(normalizarHorario({ meta: 'x' }).meta, 10000);
});

test('la línea de la caminata entra en un renglón', () => {
  const casos = [
    [{ tipo: 'habitual', inicio: 1140, ok: true, otra: null, minutos: 45, etiqueta: 'Hoy' }, 'Caminá 19 h · faltan 45 min'],
    [{ tipo: 'habitual', inicio: 1170, ok: true, otra: { desde: 7 * 60, hasta: 8 * 60 }, minutos: null, etiqueta: 'Hoy' }, 'Caminá 7–8 h, mejor que a las 19:30'],
    [{ tipo: 'habitual', inicio: 1140, ok: false, motivo: 'lluvia', otra: { desde: 16 * 60, hasta: 17 * 60 }, etiqueta: 'Mañana' }, 'Mañana: lluvia a las 19, caminá 16–17 h'],
    [{ tipo: 'habitual', inicio: 1140, ok: false, motivo: 'calor', otra: null, etiqueta: 'Hoy' }, 'Calor a las 19, no hay otro rato'],
    [{ tipo: 'optimo', desde: 9 * 60, hasta: 11 * 60, minutos: 80, etiqueta: 'Hoy' }, 'Caminá 9–11 h · faltan 80 min'],
    [{ tipo: 'optimo', desde: 9 * 60, hasta: 11 * 60, minutos: 80, sol: true, etiqueta: 'Hoy' }, 'Caminá 9–11 h al sol · faltan 80 min'],
    [{ tipo: 'optimo', desde: 19 * 60, hasta: 20 * 60, minutos: null, etiqueta: 'Mañana' }, 'Mañana caminá 19–20 h'],
    [{ tipo: 'optimo', desde: 13 * 60, hasta: 14 * 60 + 30, minutos: 90, etiqueta: 'Hoy' }, 'Caminá 13–14:30 h · faltan 90 min'],
    [{ tipo: 'habitual', inicio: 780, fin: 870, almuerzo: true, ok: true, otra: null, minutos: 40, etiqueta: 'Hoy' }, 'Caminá 13–14:30 h · faltan 40 min'],
    [{ tipo: 'habitual', inicio: 780, fin: 870, almuerzo: true, ok: true, otra: { desde: 1140, hasta: 1200 }, etiqueta: 'Hoy' }, 'Caminá 19–20 h, mejor que al almuerzo'],
    [{ tipo: 'habitual', inicio: 780, fin: 870, almuerzo: true, ok: false, motivo: 'lluvia', otra: { desde: 1140, hasta: 1200 }, etiqueta: 'Hoy' }, 'Lluvia al almuerzo, caminá 19–20 h'],
    [{ motivo: 'tormenta', etiqueta: 'Hoy' }, 'Hoy mejor no caminar: tormenta'],
  ];
  for (const [c, texto] of casos) {
    assert.equal(lineaCaminata(c), texto);
    // La caminata va escrita: los emojis son sólo para el paraguas y el abrigo.
    assert.doesNotMatch(texto, /\p{Extended_Pictographic}/u, `"${texto}" lleva un emoji`);
    assert.ok([...texto].length <= 40, `"${texto}" no entra en el widget`);
  }
});

// ---------------------------------------------------------------------------
// Qué ponerte, sólo cuando estás por salir
// ---------------------------------------------------------------------------

const wid = (horas, horario, fecha, min, pasos = null) => lineasWidget(plan(horas, horario, { fecha, minutos: min }, pasos));

test('a la mañana de oficina avisa si a la vuelta hace falta abrigo o paraguas', () => {
  // Mañana despejada y templada; a la vuelta refresca fuerte y llueve.
  const horas = dia(MIERCOLES, (h) => (h >= 18 ? { temp: 6, prob: 80, lluvia: 1 } : { temp: 21 }));
  const w = wid(horas, HORARIO_DEFAULT, MIERCOLES, 7 * 60);
  // El paraguas se decide al salir de casa: va arriba aunque a la ida no llueva.
  assert.equal(w.titulo, 'Remera ☔');
  assert.equal(w.aviso, '🧥🌧️ a la vuelta');
  // Si la vuelta está igual o mejor que la ida, no hay aviso.
  const parejo = dia(MIERCOLES, () => ({ temp: 21 }));
  assert.equal(wid(parejo, HORARIO_DEFAULT, MIERCOLES, 7 * 60).aviso, '');
});

test('si llueve al almuerzo, el paraguas va arriba y abajo dice cuándo', () => {
  const horas = dia(MIERCOLES, (h) => (h === 13 ? { prob: 80, lluvia: 1 } : {}));
  const w = wid(horas, HORARIO_DEFAULT, MIERCOLES, 7 * 60);
  assert.equal(w.titulo, 'Manga larga ☔');
  assert.equal(w.aviso, '🌧️ al almuerzo');
  // Lo de la captura: al almuerzo llueve seguro y a la vuelta quizás. Manda
  // lo peor; el "quizás" de la vuelta ya está cubierto con el paraguas.
  const ambas = dia(MIERCOLES, (h) => (h === 13 ? { prob: 80, lluvia: 1 } : h === 18 ? { prob: 30 } : {}));
  const w2 = wid(ambas, HORARIO_DEFAULT, MIERCOLES, 7 * 60);
  assert.equal(w2.titulo, 'Manga larga ☔');
  assert.equal(w2.aviso, '🌧️ al almuerzo');
  // Igual de feo en los dos.
  const dos = dia(MIERCOLES, (h) => (h === 13 || h === 18 ? { prob: 30 } : {}));
  assert.equal(wid(dos, HORARIO_DEFAULT, MIERCOLES, 7 * 60).aviso, '🌦️ al almuerzo y a la vuelta');
  // Si ya llueve a la ida, lo ves al salir: no hace falta decir cuándo.
  const siempre = dia(MIERCOLES, () => ({ prob: 80, lluvia: 1 }));
  const w3 = wid(siempre, HORARIO_DEFAULT, MIERCOLES, 7 * 60);
  assert.equal(w3.titulo, 'Manga larga ☔');
  assert.equal(w3.aviso, '');
});

test('el aviso de la mañana entra en un renglón', () => {
  // Lo más largo que puede armar: abrigo y lluvia en los dos tramos.
  const peor = dia(MIERCOLES, (h) => (h === 13 ? { prob: 30 } : h >= 18 ? { temp: 8, prob: 30 } : { temp: 30 }));
  const w = wid(peor, HORARIO_DEFAULT, MIERCOLES, 7 * 60);
  assert.equal(w.aviso, '🌦️ al almuerzo · 🧥🌦️ a la vuelta');
  assert.ok([...w.aviso].length <= 40);
});

test('en la oficina no dice qué ponerte hasta una hora antes de salir', () => {
  const horas = dia(MIERCOLES, (h) => (h >= 18 ? { temp: 6 } : {}));
  assert.equal(wid(horas, HORARIO_DEFAULT, MIERCOLES, 10 * 60, 10400).titulo, '');
  assert.equal(wid(horas, HORARIO_DEFAULT, MIERCOLES, 16 * 60 + 59, 10400).titulo, '');
  // Desde las 17 y hasta llegar a casa (19), lo de la vuelta.
  assert.equal(wid(horas, HORARIO_DEFAULT, MIERCOLES, 17 * 60, 10400).titulo, 'Campera');
  assert.equal(wid(horas, HORARIO_DEFAULT, MIERCOLES, 18 * 60 + 30, 10400).titulo, 'Campera');
  // Ya en casa, nada.
  assert.equal(wid(horas, HORARIO_DEFAULT, MIERCOLES, 19 * 60 + 10, 10400).titulo, '');
});

test('en home office, lo de tu próxima caminata; sin caminata, nada', () => {
  // Lunes: el almuerzo es tu caminata, y a esa hora hace 12°.
  const horas = dia(LUNES, (h) => ({ temp: h === 13 || h === 14 ? 12 : 20 }));
  assert.equal(wid(horas, HORARIO_DEFAULT, LUNES, 9 * 60, 4000).titulo, 'Campera liviana');
  // Con la meta cumplida no hay caminata, y no hay qué ponerse.
  assert.equal(wid(horas, HORARIO_DEFAULT, LUNES, 9 * 60, 10400).titulo, '');
});

test('el fin de semana, lo de salir ahora', () => {
  const horas = dia(SABADO, (h) => ({ temp: h < 12 ? 10 : 20 }));
  assert.equal(wid(horas, HORARIO_DEFAULT, SABADO, 9 * 60).titulo, 'Campera liviana');
  assert.equal(wid(horas, HORARIO_DEFAULT, SABADO, 15 * 60).titulo, 'Remera');
});

test('con la meta de pasos cumplida, el widget no dice nada de caminar', () => {
  assert.equal(lineaCaminata({ cumplida: true, etiqueta: 'Hoy' }), '');
  const horas = dia(MARTES, () => ({}));
  // A las 15 estás en la oficina y ya caminaste: el widget no dice nada.
  const w = lineasWidget(plan(horas, LV, { fecha: MARTES, minutos: 15 * 60 }, 10400));
  assert.deepEqual(w, { titulo: '', aviso: '', caminar: '' });
});

test('el widget son líneas cortas: qué ponerte, un aviso si hace falta, cuándo caminar', () => {
  const horas = dia(MARTES, (h) => (h === 8 ? { prob: 30 } : {}));
  const w = lineasWidget(plan(horas, LV, { fecha: MARTES, minutos: 7 * 60 }));
  assert.deepEqual(Object.keys(w), ['titulo', 'aviso', 'caminar']);
  assert.equal(w.aviso, '');
  assert.equal(w.titulo, 'Manga larga 🌂');
  // Los únicos emojis: paraguas, lluvia y abrigo, que ahorran palabras.
  for (const t of Object.values(w)) {
    assert.doesNotMatch(t.replace(/[🌂☔🌦🌧🧥]\uFE0F?/gu, ''), /\p{Extended_Pictographic}/u);
  }
});

test('los pasos por minuto son los mismos que en Rutina', async () => {
  const { PASOS_POR_MINUTO: deRutina } = await import('../js/config.js');
  const { PASOS_POR_MINUTO } = await import('../clima/js/logica.js');
  assert.equal(PASOS_POR_MINUTO, deRutina);
});

// ---------------------------------------------------------------------------
// Tu semana: oficina martes a jueves de 9 a 18, una hora de colectivo, y el
// almuerzo de 13 a 14:30 para caminar.
// ---------------------------------------------------------------------------

const MIERCOLES = '2026-10-14';
const LUNES = '2026-10-12';

test('el horario por defecto es tu semana', () => {
  const h = normalizarHorario({});
  assert.deepEqual(h.dias, [2, 3, 4]);
  assert.equal(minutos(h.entrada) - h.viaje, 8 * 60, 'salís de casa a las 8');
  assert.equal(minutos(h.salida) + h.viaje, 19 * 60, 'llegás a las 19');
  assert.deepEqual(h.almuerzo, { desde: '13:00', hasta: '14:30' });
  // Sacarlo a mano vale; uno que no cae en el horario de oficina, no.
  assert.equal(normalizarHorario({ almuerzo: null }).almuerzo, null);
  assert.equal(normalizarHorario({ almuerzo: { desde: '19:00', hasta: '20:00' } }).almuerzo, null);
});

test('un día de oficina, la caminata es la del almuerzo', () => {
  const horas = dia(MIERCOLES, () => ({}));
  // 3.000 pasos que faltan son 30 minutos: entran en el almuerzo.
  assert.deepEqual(planCaminata(horas, HORARIO_DEFAULT, MIERCOLES, 10 * 60, 7000),
    { tipo: 'habitual', inicio: 13 * 60, almuerzo: true, fin: 14 * 60 + 30, minutos: 30, quedan: 1, ok: true, otra: null });
});

test('si llueve al mediodía, propone la vuelta a casa o la mañana', () => {
  const horas = dia(MIERCOLES, (h) => (h === 13 || h === 14 ? { prob: 80, lluvia: 2 } : {}));
  const sinNadaFijo = { ...HORARIO_DEFAULT, ocupados: [] };
  const c = planCaminata(horas, sinNadaFijo, MIERCOLES, 10 * 60, 7000);
  assert.equal(c.ok, false);
  assert.equal(c.motivo, 'lluvia');
  // Llegás a las 19: de 19 a 20 es el primer rato bueno después.
  assert.deepEqual(c.otra, { desde: 19 * 60, hasta: 20 * 60 });
  // Pero los miércoles a las 19 tenés gimnasio: el rato pasa a las 20.
  assert.deepEqual(planCaminata(horas, HORARIO_DEFAULT, MIERCOLES, 10 * 60, 7000).otra, { desde: 20 * 60, hasta: 21 * 60 });
});

// ---------------------------------------------------------------------------
// Lo fijo de tu semana: K1 y el gimnasio
// ---------------------------------------------------------------------------

const MARTES_K1 = '2026-10-13';
const JUEVES = '2026-10-15';
const VIERNES = '2026-10-16';

test('los horarios ocupados por defecto son los de tu calendario', () => {
  const o = normalizarHorario({}).ocupados;
  assert.deepEqual(o.map((x) => `${x.nombre} ${x.dias.join(',')} ${x.desde}-${x.hasta}`), [
    'K1 2,4 20:30-22:00',
    'Gimnasio 3 19:00-20:00',
    'Gimnasio 5 18:00-20:00',
  ]);
  assert.deepEqual(normalizarHorario({ ocupados: [] }).ocupados, []);
  // Lo roto se descarta: sin días, al revés, o con horas que no existen.
  assert.deepEqual(normalizarHorario({ ocupados: [
    { nombre: 'x', dias: [], desde: '10:00', hasta: '11:00' },
    { nombre: 'y', dias: [1], desde: '12:00', hasta: '11:00' },
    { nombre: 'z', dias: [1], desde: '25:00', hasta: '26:00' },
    { nombre: ' Yoga ', dias: [6, 6], desde: '9:00', hasta: '10:00' },
  ] }).ocupados, [{ nombre: 'Yoga', dias: [6], desde: '09:00', hasta: '10:00' }]);
});

test('martes y jueves no te manda a caminar a la hora de K1', () => {
  // A la noche: llegás a las 19 y K1 es a las 20:30. Queda de 19 a 20.
  for (const fecha of [MARTES_K1, JUEVES]) {
    const horas = dia(fecha, (h) => (h < 19 ? { prob: 90 } : {}));
    const c = planCaminata(horas, HORARIO_DEFAULT, fecha, 15 * 60, 9000);
    assert.deepEqual([c.tipo, c.desde, c.hasta], ['optimo', 19 * 60, 20 * 60], `${fecha}: ${JSON.stringify(c)}`);
  }
});

test('el viernes, después del gimnasio, queda desde las 20', () => {
  const horas = dia(VIERNES, (h) => (h < 20 ? { prob: 90 } : {}));
  const c = planCaminata(horas, HORARIO_DEFAULT, VIERNES, 15 * 60, 9000);
  assert.deepEqual([c.tipo, c.desde, c.hasta], ['optimo', 20 * 60, 21 * 60]);
});

test('una caminata habitual que cae adentro de algo fijo no se revisa', () => {
  const horas = dia(MARTES_K1, () => ({}));
  const conReunion = { ...HORARIO_DEFAULT, ocupados: [{ nombre: 'Almuerzo de trabajo', dias: [2], desde: '13:00', hasta: '14:30' }] };
  const c = planCaminata(horas, conReunion, MARTES_K1, 10 * 60, 9000);
  assert.notEqual(c.tipo, 'habitual');
  assert.ok(c.desde >= 19 * 60, JSON.stringify(c));
});

test('"mejor que al almuerzo" nunca propone un pedazo del mismo almuerzo', () => {
  // A las 13 hace calor; a las 14, ideal. Las dos horas son del almuerzo:
  // proponer "14–14:30, mejor que al almuerzo" sería proponer el almuerzo.
  const horas = dia(MIERCOLES, (h) => (h === 13 ? { temp: 26, aparente: 26 } : h === 14 ? { temp: 15, uv: 0 } : { prob: 90 }));
  const c = planCaminata(horas, { ...HORARIO_DEFAULT, ocupados: [] }, MIERCOLES, 10 * 60, 9000);
  assert.deepEqual([c.almuerzo, c.ok, c.otra], [true, true, null]);
});

test('nunca propone caminar en horario de oficina, fuera del almuerzo', () => {
  // Las horas de escritorio son las más lindas del día: igual no se ofrecen.
  const oficina = (h) => h >= 8 && h < 19 && h !== 13 && h !== 14;
  const horas = dia(MIERCOLES, (h) => (oficina(h) ? { temp: 15, uv: 0 } : {}));
  const sinAlmuerzo = planCaminata(horas, { ...HORARIO_DEFAULT, almuerzo: null }, MIERCOLES, 0, 0);
  assert.equal(sinAlmuerzo.tipo, 'optimo');
  assert.ok(sinAlmuerzo.hasta <= 8 * 60 || sinAlmuerzo.desde >= 19 * 60, JSON.stringify(sinAlmuerzo));
  const conAlmuerzo = planCaminata(horas, HORARIO_DEFAULT, MIERCOLES, 0, 0);
  assert.deepEqual([conAlmuerzo.almuerzo, conAlmuerzo.ok], [true, true]);
  const o = conAlmuerzo.otra;
  assert.ok(!o || o.hasta <= 8 * 60 || o.desde >= 19 * 60 || (o.desde >= 13 * 60 && o.hasta <= 14 * 60 + 30), JSON.stringify(o));
});

test('el óptimo de un día de oficina puede caer en el almuerzo, recortado', () => {
  // Pasado el horario del almuerzo como caminata habitual (ya son las 14:10),
  // vuelve el óptimo del resto del día.
  const horas = dia(MIERCOLES, (h) => (h >= 19 ? { prob: 90 } : {}));
  const c = planCaminata(horas, HORARIO_DEFAULT, MIERCOLES, 14 * 60 + 10, 8000);
  assert.deepEqual(c, { tipo: 'optimo', desde: 14 * 60, hasta: 14 * 60 + 30, minutos: 20, sol: false });
});

test('lunes y viernes de home office: la caminata también es al almuerzo', () => {
  const horas = dia(LUNES, () => ({}));
  assert.deepEqual(planCaminata(horas, HORARIO_DEFAULT, LUNES, 8 * 60, 7000),
    { tipo: 'habitual', inicio: 13 * 60, almuerzo: true, fin: 14 * 60 + 30, minutos: 30, quedan: 1, ok: true, otra: null });
});

test('en home office no hay colectivo: estás libre a las 18, no a las 19', () => {
  // Llueve en el almuerzo y hasta las 18: el primer rato bueno es a las 18.
  const horas = dia(LUNES, (h) => (h >= 10 && h < 18 ? { prob: 90 } : {}));
  const c = planCaminata(horas, HORARIO_DEFAULT, LUNES, 10 * 60, 7000);
  assert.deepEqual([c.ok, c.motivo, c.otra], [false, 'lluvia', { desde: 18 * 60, hasta: 19 * 60 }]);
  // Y antes de las 9 también: no hay que salir a las 8 para el colectivo.
  const temprano = dia(LUNES, (h) => (h === 8 ? { temp: 15, uv: 0 } : h >= 10 ? { prob: 90 } : {}));
  assert.deepEqual(planCaminata(temprano, HORARIO_DEFAULT, LUNES, 7 * 60, 9000).otra, { desde: 8 * 60, hasta: 9 * 60 });
});

test('en home office la ropa es para salir al almuerzo, y después para cuando terminás', () => {
  const horas = dia(LUNES, (h) => ({ temp: h < 13 ? 8 : h < 15 ? 15 : h < 18 ? 20 : 12 }));
  const manana = lineasWidget(plan(horas, HORARIO_DEFAULT, { fecha: LUNES, minutos: 7 * 60 }));
  assert.equal(manana.titulo, 'Manga larga');
  const temprano = plan(horas, HORARIO_DEFAULT, { fecha: LUNES, minutos: 7 * 60 });
  assert.deepEqual([temprano.casa, temprano.temp], [true, 15], 'a la mañana la ropa es para el almuerzo');
  const tarde = plan(horas, HORARIO_DEFAULT, { fecha: LUNES, minutos: 15 * 60 });
  assert.equal(tarde.casa, false);
  assert.equal(tarde.temp, 12, 'a las 15 la ropa es para cuando terminás, a las 18');
});

test('un día no puede ser de oficina y de home office a la vez', () => {
  assert.deepEqual(normalizarHorario({ dias: [1, 2], remoto: [1, 5] }).remoto, [5]);
  assert.deepEqual(normalizarHorario({}).remoto, [1, 5]);
});

test('si llueve al mediodía, el paraguas va aunque la ida y la vuelta estén secas', () => {
  const horas = dia(MIERCOLES, (h) => (h === 13 ? { prob: 80, lluvia: 1 } : {}));
  const ahora = { fecha: MIERCOLES, minutos: 7 * 60 };
  assert.equal(plan(horas, HORARIO_DEFAULT, ahora).paraguas.nivel, 'si');
  assert.equal(plan(horas, { ...HORARIO_DEFAULT, almuerzo: null }, ahora).paraguas.nivel, 'no');
});

test('tu semana en el widget', () => {
  const horas = dia(MIERCOLES, () => ({}));
  const w = lineasWidget(plan(horas, HORARIO_DEFAULT, { fecha: MIERCOLES, minutos: 7 * 60 }, 6000));
  assert.equal(w.titulo, 'Manga larga');
  assert.equal(w.caminar, 'Caminá 13–14:30 h · faltan 40 min');
});

for (const caso of CASOS) {
  test(`caso: ${caso.nombre}`, () => {
    const w = lineasWidget(plan(caso.horas, caso.horario, caso.ahora, caso.pasos ?? null));
    assert.deepEqual(w, caso.widget);
  });
}

test('la URL pide lo que la lógica usa, en hora de Buenos Aires', () => {
  for (const campo of ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'uv_index']) {
    assert.ok(URL_PRONOSTICO.includes(campo), `falta ${campo}`);
  }
  assert.match(URL_PRONOSTICO, /timezone=America%2FArgentina%2FBuenos_Aires/);
  assert.match(URL_PRONOSTICO, /wind_speed_unit=kmh/);
});

test('horasDe descarta lo que no sirve', () => {
  const horas = horasDe({ hourly: {
    time: ['2026-10-13T08:00', 'roto', '2026-10-13T09:00'],
    temperature_2m: [12, 13, null],
    precipitation_probability: [null, 0, 0],
  } });
  assert.equal(horas.length, 1);
  assert.equal(horas[0].hora, 8);
  assert.equal(horas[0].prob, 0);
});

test('sin conexión usa el último pronóstico guardado', async () => {
  const mem = new Map();
  const almacen = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const json = { hourly: { time: ['2026-10-13T08:00'], temperature_2m: [12] } };
  const ok = await traer({ fetch: async () => ({ ok: true, json: async () => json }), almacen });
  assert.equal(ok.fresco, true);
  const caido = await traer({ fetch: async () => { throw new Error('sin red'); }, almacen });
  assert.equal(caido.fresco, false);
  assert.deepEqual(caido.json, json);
  await assert.rejects(traer({ fetch: async () => { throw new Error('sin red'); }, almacen: { getItem: () => null } }));
});

// ---------------------------------------------------------------------------
// La web y el widget tienen que decir lo mismo
// ---------------------------------------------------------------------------

const KT = readFileSync('android/app/src/clima/java/com/jeremiasmas/rutina/ClimaLogica.kt', 'utf8');
const JS = readFileSync('clima/js/logica.js', 'utf8');

test('las constantes de la web y del widget son las mismas', async () => {
  const logica = await import('../clima/js/logica.js');
  const enKotlin = [...KT.matchAll(/const val (\w+) = (-?[\d.]+)/g)];
  assert.ok(enKotlin.length >= 15, `encontré ${enKotlin.length} constantes en Kotlin`);
  for (const [, nombre, valor] of enKotlin) {
    assert.ok(nombre in logica, `${nombre} está en ClimaLogica.kt y no en logica.js`);
    assert.equal(Number(valor), logica[nombre], `${nombre}: Kotlin dice ${valor}, la web ${logica[nombre]}`);
  }
  // Y al revés: un umbral numérico nuevo en la web tiene que llegar al widget.
  const soloWeb = ['ACLIMATACION'];   // sólo se usa en el texto "un porteño iría con…"
  for (const m of JS.matchAll(/export const (\w+) = -?[\d.]+;/g)) {
    if (soloWeb.includes(m[1])) continue;
    assert.ok(enKotlin.some((k) => k[1] === m[1]), `${m[1]} está en logica.js y no en ClimaLogica.kt`);
  }
});

test('los niveles de ropa son los mismos en la web y en el widget', async () => {
  const { ROPA } = await import('../clima/js/logica.js');
  const enKotlin = [...KT.matchAll(/Ropa\(([\d.]+|Double\.POSITIVE_INFINITY), "([^"]+)", "([^"]+)"\)/g)]
    .map((m) => ({ hasta: m[1] === 'Double.POSITIVE_INFINITY' ? Infinity : Number(m[1]), icono: m[2], corto: m[3] }));
  assert.deepEqual(enKotlin, ROPA.map(({ hasta, icono, corto }) => ({ hasta, icono, corto })));
});

test('el widget baja el mismo pronóstico que la web', () => {
  const kt = readFileSync('android/app/src/clima/java/com/jeremiasmas/rutina/Clima.kt', 'utf8');
  const bloque = /const val URL_PRONOSTICO = ([\s\S]*?)\n\n/.exec(kt)?.[1];
  assert.ok(bloque, 'no encontré URL_PRONOSTICO en Clima.kt');
  const url = [...bloque.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join('');
  assert.equal(url, URL_PRONOSTICO);
});

// ---------------------------------------------------------------------------
// La web del clima
// ---------------------------------------------------------------------------

const modulos = readdirSync('clima/js').map((n) => `clima/js/${n}`);

for (const ruta of modulos) {
  test(`${ruta} parsea`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' }));
  });
}

test('el service worker del clima cachea todo y nada que no exista', () => {
  const sw = readFileSync('clima/sw.js', 'utf8');
  const listados = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const m of modulos) assert.ok(listados.includes(m.slice('clima/'.length)), `${m} no está en clima/sw.js`);
  for (const r of listados) assert.ok(existsSync(`clima/${r}`), `clima/sw.js lista ${r}, que no existe`);
  for (const base of ['index.html', 'manifest.webmanifest', 'styles.css']) {
    assert.ok(listados.includes(base), `falta ${base} en clima/sw.js`);
  }
});

test('los campos de los ajustes bajan de renglón en vez de desbordar la pantalla', () => {
  // Tres inputs de hora por fila ("08:30 p.m." con su reloj) no entran en un
  // teléfono: con columnas fijas la pantalla entera se desplazaba de costado.
  const css = readFileSync('clima/styles.css', 'utf8');
  const campos = /^\.campos \{([^}]*)\}/m.exec(css)?.[1] ?? '';
  assert.match(campos, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/,
    '.campos tiene que acomodar las columnas que entren, no un número fijo');
  const inputs = /^\.campos input \{([^}]*)\}/m.exec(css)?.[1] ?? '';
  assert.match(inputs, /min-width:\s*0/);
  assert.match(inputs, /max-width:\s*100%/);
});
