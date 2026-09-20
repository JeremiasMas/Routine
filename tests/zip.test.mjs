import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { listarEntradas, leerEntrada, extraerTextos } from '../js/zip.js';
import { parseStepsCsv, esCsvDePasos, elegirArchivosDePasos } from '../js/steps-import.js';

/** Arma un ZIP real (deflate) para no depender de un archivo binario en el repo. */
function armarZip(archivos) {
  const locales = [];
  const centrales = [];
  let offset = 0;

  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(datos);
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // versión
    local.writeUInt16LE(8, 8);            // método: deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    locales.push(local, nombreBuf, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombreBuf);

    offset += local.length + nombreBuf.length + comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(centrales);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(archivos).length, 8);
  eocd.writeUInt16LE(Object.keys(archivos).length, 10);
  eocd.writeUInt32LE(directorio.length, 12);
  eocd.writeUInt32LE(cuerpo.length, 16);

  const total = Buffer.concat([cuerpo, directorio, eocd]);
  return total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength);
}

const CSV_PASOS = [
  'com.samsung.shealth.step_daily_trend,1',
  'binning_data,source_type,count,day_time',
  ',1,4200,2026-09-15',
  ',-2,9430,2026-09-15',
  ',-2,12880,2026-09-16',
].join('\n');

const EXPORT = {
  'Samsung Health/com.samsung.shealth.step_daily_trend.20260918.csv': CSV_PASOS,
  'Samsung Health/com.samsung.shealth.sleep.20260918.csv': 'nada,que,ver\n1,2',
  'Samsung Health/com.samsung.health.heart_rate.csv': 'tampoco,esto\n3,4',
};

test('lee las entradas de un ZIP', () => {
  const entradas = listarEntradas(armarZip(EXPORT));
  assert.equal(entradas.length, 3);
  assert.ok(entradas.every((e) => e.method === 8), 'vienen con deflate');
  assert.ok(entradas.some((e) => e.name.includes('step_daily_trend')));
});

test('descomprime una entrada y devuelve su texto', async () => {
  const zip = armarZip(EXPORT);
  const entrada = listarEntradas(zip).find((e) => e.name.includes('step_daily_trend'));
  assert.equal(await leerEntrada(zip, entrada), CSV_PASOS);
});

test('reconoce cuál de los archivos es el de pasos', () => {
  assert.ok(esCsvDePasos('com.samsung.shealth.step_daily_trend.20260918.csv'));
  assert.ok(esCsvDePasos('Samsung Health/tracker.pedometer_day_summary.csv'));
  assert.ok(!esCsvDePasos('com.samsung.shealth.sleep.csv'));
  assert.ok(!esCsvDePasos('com.samsung.health.heart_rate.csv'));
  assert.ok(!esCsvDePasos('carpeta/step_daily_trend.json'), 'sólo CSV');
});

test('del ZIP entero saca sólo los pasos y los interpreta', async () => {
  const elegidos = new Set(elegirArchivosDePasos(Object.keys(EXPORT)));
  const textos = await extraerTextos(armarZip(EXPORT), (n) => elegidos.has(n));
  assert.equal(textos.length, 1, 'ignora sueño y pulsaciones');
  assert.deepEqual(parseStepsCsv(textos[0].text).days, [
    { date: '2026-09-15', steps: 9430 },
    { date: '2026-09-16', steps: 12880 },
  ]);
});

test('un archivo que no es ZIP da un error claro', () => {
  const basura = new TextEncoder().encode('esto no es un zip, es un CSV suelto').buffer;
  assert.throws(() => listarEntradas(basura), /no parece un ZIP/);
});

test('un ZIP sin archivos de pasos devuelve vacío en vez de romper', async () => {
  const sinPasos = armarZip({ 'Samsung Health/sleep.csv': 'a,b\n1,2' });
  assert.deepEqual(elegirArchivosDePasos(['Samsung Health/sleep.csv']), []);
  assert.deepEqual(await extraerTextos(sinPasos, () => false), []);
});
