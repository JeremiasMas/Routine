import test from 'node:test';
import assert from 'node:assert/strict';
import { diasACargar, mensajeDeEstado, EVENTO } from '../js/native.js';

test('carga los días que manda Health Connect', () => {
  const r = diasACargar({ '2026-09-19': 9430, '2026-09-20': 6200 }, {});
  assert.deepEqual(r, [{ date: '2026-09-19', value: 9430 }, { date: '2026-09-20', value: 6200 }]);
});

test('no reescribe lo que ya está igual', () => {
  const entries = { '2026-09-19': { pasos: { value: 9430, fuente: 'health-connect' } } };
  assert.deepEqual(diasACargar({ '2026-09-19': 9430 }, entries), []);
});

test('sí reescribe cuando el número cambió', () => {
  // Volvés a abrir la app más tarde: caminaste más desde la última lectura.
  const entries = { '2026-09-19': { pasos: { value: 9430, fuente: 'health-connect' } } };
  assert.deepEqual(diasACargar({ '2026-09-19': 11200 }, entries), [{ date: '2026-09-19', value: 11200 }]);
});

test('pisa lo cargado a mano: Health Connect es el número de verdad', () => {
  const entries = { '2026-09-19': { pasos: { value: 8000 } } };
  assert.deepEqual(diasACargar({ '2026-09-19': 9430 }, entries), [{ date: '2026-09-19', value: 9430 }]);
});

test('un día sin datos en Health Connect no se toca', () => {
  // Si la app mandara ceros o no mandara el día, lo que anotaste a mano
  // tiene que quedar: borrarlo sería perder datos por una lectura vacía.
  const entries = { '2026-09-18': { pasos: { value: 7000 } } };
  assert.deepEqual(diasACargar({ '2026-09-19': 9430 }, entries), [{ date: '2026-09-19', value: 9430 }]);
  assert.deepEqual(diasACargar({ '2026-09-18': 0 }, entries), []);
});

test('ignora basura', () => {
  assert.deepEqual(diasACargar(null, {}), []);
  assert.deepEqual(diasACargar({ 'ayer': 5000, '2026-13-99': 1, '2026-09-19': 'muchos' }, {}), []);
  assert.deepEqual(diasACargar({ '2026-09-19': -5 }, {}), []);
});

test('redondea: Health Connect puede mandar decimales', () => {
  assert.deepEqual(diasACargar({ '2026-09-19': 9430.6 }, {}), [{ date: '2026-09-19', value: 9431 }]);
});

test('cada estado tiene un mensaje y los que se pueden resolver, un botón', () => {
  assert.equal(mensajeDeEstado('listo').ok, true);
  for (const estado of ['sin_permiso', 'sin_health_connect', 'hay_que_actualizar']) {
    const m = mensajeDeEstado(estado);
    assert.equal(m.ok, false, estado);
    assert.ok(m.texto, `${estado} sin texto`);
    assert.ok(m.accion && m.boton, `${estado} sin acción`);
  }
  const raro = mensajeDeEstado('cualquier-cosa');
  assert.equal(raro.ok, false);
  assert.ok(raro.texto);
});

test('el nombre del evento es el que manda la app de Android', () => {
  // Si esto cambia hay que cambiarlo también en MainActivity.kt.
  assert.equal(EVENTO, 'rutina-pasos');
});

test('una fecha con forma válida pero inexistente no crea un día fantasma', () => {
  for (const mala of ['2026-13-01', '2026-02-30', '2026-00-10', '2026-09-31']) {
    assert.deepEqual(diasACargar({ [mala]: 9000 }, {}), [], mala);
  }
  // Y el 29 de febrero de un año bisiesto sí es un día real.
  assert.deepEqual(diasACargar({ '2028-02-29': 9000 }, {}), [{ date: '2028-02-29', value: 9000 }]);
});

test('guardarArchivo avisa si la app no lo soporta', async () => {
  const { guardarArchivo } = await import('../js/native.js');
  globalThis.window = {};
  assert.equal(guardarArchivo('x.json', '{}'), false, 'sin puente no se hace cargo nadie');

  // Una app vieja, sin el método: la web tiene que volver al blob.
  globalThis.window = { RutinaNativa: { disponible: () => true } };
  assert.equal(guardarArchivo('x.json', '{}'), false);

  let recibido = null;
  globalThis.window = { RutinaNativa: { guardarArchivo: (n, c) => { recibido = [n, c]; return true; } } };
  assert.equal(guardarArchivo('copia.json', '{"a":1}'), true);
  assert.deepEqual(recibido, ['copia.json', '{"a":1}']);

  // Si la app falla al guardar, la web no debe decir que guardó.
  globalThis.window = { RutinaNativa: { guardarArchivo: () => false } };
  assert.equal(guardarArchivo('x.json', '{}'), false);
  globalThis.window = { RutinaNativa: { guardarArchivo: () => { throw new Error('sin espacio'); } } };
  assert.equal(guardarArchivo('x.json', '{}'), false, 'una excepción no puede romper la exportación');
  delete globalThis.window;
});

test('lee las apps que escribieron pasos', async () => {
  const { leerOrigenes } = await import('../js/native.js');
  const r = leerOrigenes([
    { paquete: 'Samsung Health\u0000com.sec.android.app.shealth', pasos: 9430 },
    { paquete: 'Google Fit\u0000com.google.android.apps.fitness', pasos: 1200 },
  ]);
  assert.deepEqual(r, [
    { nombre: 'Samsung Health', paquete: 'com.sec.android.app.shealth', pasos: 9430 },
    { nombre: 'Google Fit', paquete: 'com.google.android.apps.fitness', pasos: 1200 },
  ]);
});

test('una app sin nombre conocido se muestra igual', async () => {
  const { leerOrigenes } = await import('../js/native.js');
  const r = leerOrigenes([{ paquete: 'com.otra.app\u0000com.otra.app', pasos: 500 }]);
  assert.equal(r[0].nombre, 'com.otra.app');
  assert.deepEqual(leerOrigenes(null), []);
  assert.deepEqual(leerOrigenes([{ paquete: '', pasos: 5 }]), [], 'sin paquete no sirve de nada');
});

test('detecta cuando dos apps cuentan los mismos pasos', async () => {
  const { leerOrigenes, hayConflictoDeOrigenes } = await import('../js/native.js');
  const dos = leerOrigenes([
    { paquete: 'Samsung Health\u0000com.sec.android.app.shealth', pasos: 9430 },
    { paquete: 'Google Fit\u0000com.google.android.apps.fitness', pasos: 1200 },
  ]);
  const c = hayConflictoDeOrigenes(dos);
  assert.equal(c.cuantas, 2);
  assert.equal(c.total, 10630);
  assert.equal(c.mayor.nombre, 'Samsung Health');
  assert.equal(c.sobrante, 1200, 'lo que infla el total respecto de la fuente principal');
});

test('una sola app no es un conflicto', async () => {
  const { leerOrigenes, hayConflictoDeOrigenes } = await import('../js/native.js');
  const una = leerOrigenes([{ paquete: 'Samsung Health\u0000com.sec.android.app.shealth', pasos: 9430 }]);
  assert.equal(hayConflictoDeOrigenes(una), null);
  assert.equal(hayConflictoDeOrigenes([]), null);
  assert.equal(hayConflictoDeOrigenes(null), null);
});

test('una app que hoy no aportó nada no cuenta como conflicto', async () => {
  const { leerOrigenes, hayConflictoDeOrigenes } = await import('../js/native.js');
  const r = leerOrigenes([
    { paquete: 'Samsung Health\u0000com.sec.android.app.shealth', pasos: 9430 },
    { paquete: 'Google Fit\u0000com.google.android.apps.fitness', pasos: 0 },
  ]);
  assert.equal(hayConflictoDeOrigenes(r), null, 'con 0 pasos no infla nada');
});
