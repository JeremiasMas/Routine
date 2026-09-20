import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStepsCsv, splitCsvLine, parseFecha, diffSteps, findHeader,
  esCsvDePasos, elegirArchivosDePasos,
} from '../js/steps-import.js';

test('parte líneas CSV respetando comillas', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('a,"di ""hola""",b'), ['a', 'di "hola"', 'b']);
  assert.deepEqual(splitCsvLine(''), ['']);
});

test('entiende los formatos de fecha que aparecen en los exports', () => {
  assert.equal(parseFecha('2026-03-15'), '2026-03-15');
  assert.equal(parseFecha('2026-03-15 00:00:00.000'), '2026-03-15');
  assert.equal(parseFecha('15/3/2026'), '2026-03-15');
  assert.equal(parseFecha(''), null);
  assert.equal(parseFecha('cualquier cosa'), null);
  // epoch en milisegundos a medianoche local
  const ms = new Date(2026, 2, 15, 0, 0, 0).getTime();
  assert.equal(parseFecha(String(ms)), '2026-03-15');
});

test('lee el CSV de pasos de Samsung Health salteando la línea de metadatos', () => {
  const ms = (y, m, d) => String(new Date(y, m - 1, d, 12).getTime());
  const csv = [
    'com.samsung.shealth.step_daily_trend,1',
    'binning_data,source_type,count,speed,distance,calorie,update_time,create_time,source_pkg_name,deviceuuid,day_time',
    `,1,4200,1.2,3100,120,x,x,com.sec.android.app.shealth,uuid-reloj,${ms(2026, 3, 15)}`,
    `,2,3100,1.1,2400,90,x,x,com.samsung.android.wear,uuid-tel,${ms(2026, 3, 15)}`,
    `,-2,7300,1.2,5500,210,x,x,,uuid-total,${ms(2026, 3, 15)}`,
    `,-2,11250,1.3,8200,340,x,x,,uuid-total,${ms(2026, 3, 16)}`,
  ].join('\n');

  const r = parseStepsCsv(csv);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.days, [
    { date: '2026-03-15', steps: 7300 },
    { date: '2026-03-16', steps: 11250 },
  ]);
});

test('toma el máximo por día en vez de sumar los dispositivos', () => {
  // Si sumara reloj + teléfono + agregado, el 15 daría 14.600 pasos: el doble.
  const csv = [
    'day_time,count',
    '2026-03-15,4200',
    '2026-03-15,3100',
    '2026-03-15,7300',
  ].join('\n');
  assert.deepEqual(parseStepsCsv(csv).days, [{ date: '2026-03-15', steps: 7300 }]);
});

test('acepta un CSV genérico en español', () => {
  const csv = 'fecha,pasos\n2026-03-15,9800\n2026-03-16,10450\n';
  assert.deepEqual(parseStepsCsv(csv).days, [
    { date: '2026-03-15', steps: 9800 },
    { date: '2026-03-16', steps: 10450 },
  ]);
});

test('descarta filas rotas sin tirar todo el archivo', () => {
  const csv = [
    'fecha,pasos',
    '2026-03-15,9800',
    'fila,rota',
    ',,,',
    '2026-03-16,sin-numero',
    '2026-03-17,10450',
  ].join('\n');
  const r = parseStepsCsv(csv);
  assert.deepEqual(r.days, [
    { date: '2026-03-15', steps: 9800 },
    { date: '2026-03-17', steps: 10450 },
  ]);
  assert.ok(r.skipped >= 2, 'informa cuántas filas descartó');
});

test('avisa con un mensaje claro cuando el archivo no sirve', () => {
  assert.match(parseStepsCsv('').error, /vacío/);
  assert.match(parseStepsCsv('hola\nqué tal').error, /No encontré columnas/);
  assert.match(parseStepsCsv('fecha,pasos\n2026-03-15,0').error, /ningún día con pasos/);
});

test('no confunde la cabecera con la línea de metadatos', () => {
  const h = findHeader(['com.samsung.shealth.step_daily_trend,1', 'day_time,count,source_type']);
  assert.equal(h.index, 1);
  assert.deepEqual(h.fields, ['day_time', 'count', 'source_type']);
});

test('el resumen previo dice qué va a cambiar antes de tocar nada', () => {
  const dias = [
    { date: '2026-03-15', steps: 9800 },
    { date: '2026-03-16', steps: 10450 },
    { date: '2026-03-17', steps: 12000 },
  ];
  const entries = {
    '2026-03-15': { pasos: { value: 9800 } },   // igual
    '2026-03-16': { pasos: { value: 8000 } },   // distinto
  };
  assert.deepEqual(diffSteps(dias, entries), { nuevos: 1, cambiados: 1, iguales: 1, total: 3 });
});

// ---------------------------------------------------------------------------
// Elegir el archivo correcto de un export real de Samsung Health
// ---------------------------------------------------------------------------

// Los cuatro archivos con "step" o "pedometer" que trae el export de verdad.
const EXPORT_REAL = [
  'samsunghealth_20260920/com.samsung.shealth.step_daily_trend.20260920.csv',
  'samsunghealth_20260920/com.samsung.shealth.tracker.pedometer_day_summary.20260920.csv',
  'samsunghealth_20260920/com.samsung.shealth.tracker.pedometer_recommendation.20260920.csv',
  'samsunghealth_20260920/com.samsung.shealth.tracker.pedometer_step_count.20260920.csv',
  'samsunghealth_20260920/com.samsung.shealth.sleep.20260920.csv',
];

test('de un export real elige sólo los totales diarios', () => {
  const elegidos = elegirArchivosDePasos(EXPORT_REAL);
  assert.equal(elegidos.length, 1);
  assert.ok(elegidos[0].includes('step_daily_trend'));
});

test('descarta los tramos de pocos minutos y la meta sugerida', () => {
  // pedometer_step_count parsea sin error, pero cada fila es un pedacito del
  // día: su máximo diario son ~300 pasos donde realmente hubo 12.000.
  assert.ok(!esCsvDePasos('com.samsung.shealth.tracker.pedometer_step_count.csv'));
  // pedometer_recommendation trae 10.000 fijo: es la meta, no lo caminado.
  assert.ok(!esCsvDePasos('com.samsung.shealth.tracker.pedometer_recommendation.csv'));
});

test('si falta el archivo preferido, usa el resumen diario', () => {
  const sinTrend = EXPORT_REAL.filter((n) => !n.includes('step_daily_trend'));
  const elegidos = elegirArchivosDePasos(sinTrend);
  assert.equal(elegidos.length, 1);
  assert.ok(elegidos[0].includes('pedometer_day_summary'));
});

test('un CSV suelto con otro nombre sigue sirviendo', () => {
  assert.deepEqual(elegirArchivosDePasos(['mis-pasos.csv']), ['mis-pasos.csv']);
  assert.deepEqual(elegirArchivosDePasos(['cualquiera.csv']), []);
});
