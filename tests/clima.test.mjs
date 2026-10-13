import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sensacion, sensacionPortena, ropaPara, paraguas, caminata, plan, lineasWidget,
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
  assert.equal(paraguas([{ ...seco, prob: 70 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, lluvia: 1.2 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, codigo: 95 }]).nivel, 'si');
  assert.equal(paraguas([{ ...seco, prob: 80, rafagas: 70 }]).nivel, 'capucha');
});

test('el horario roto vuelve al de siempre', () => {
  assert.deepEqual(normalizarHorario(null ?? undefined), { ...HORARIO_DEFAULT, dias: [1, 2, 3, 4, 5] });
  assert.deepEqual(normalizarHorario({ entrada: '18:00', salida: '09:00' }).entrada, '09:00');
  assert.deepEqual(normalizarHorario({ dias: [5, 1, 9, 1] }).dias, [1, 5]);
  assert.equal(normalizarHorario({ viaje: 999 }).viaje, 180);
});

test('la caminata no cae en horario de oficina y elige el tramo más largo', () => {
  const horas = dia(MARTES, () => ({}));
  const c = caminata(horas, MARTES, HORARIO_DEFAULT, 0, true);
  // Libre de 7 a 8 (antes de salir 8:15) y de 19 a 22: gana la tarde.
  assert.deepEqual(c, { desde: 19, hasta: 22 });
  const sabado = caminata(horas, MARTES, HORARIO_DEFAULT, 0, false);
  assert.deepEqual(sabado, { desde: 7, hasta: 22 });
});

test('sin ningún rato bueno, dice por qué', () => {
  const horas = dia(MARTES, () => ({ prob: 90 }));
  assert.deepEqual(caminata(horas, MARTES, HORARIO_DEFAULT, 0, true), { motivo: 'lluvia' });
});

test('lo que ya pasó no se ofrece', () => {
  const horas = dia(MARTES, () => ({}));
  assert.deepEqual(caminata(horas, MARTES, HORARIO_DEFAULT, 20 * 60 + 10, true), { desde: 20, hasta: 22 });
});

for (const caso of CASOS) {
  test(`caso: ${caso.nombre}`, () => {
    const w = lineasWidget(plan(caso.horas, caso.horario, caso.ahora));
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
