import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lo que estás cargando y todavía no guardaste tiene que sobrevivir a que
// Android mate la app en segundo plano.

/** Un localStorage de mentira, con la cuenta de lo que se escribió. */
function conAlmacenamiento(fn, inicial = {}) {
  const antes = globalThis.localStorage;
  const datos = { ...inicial };
  globalThis.localStorage = {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
  };
  try { return fn(datos); } finally {
    if (antes === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = antes;
  }
}

const API = async () => import('../js/state.js');

test('el borrador vuelve con la misma forma con que se guardó', async () => {
  const { guardarBorrador, leerBorrador } = await API();
  await conAlmacenamiento(() => {
    const sesion = { templateId: 'pecho-piernas', meta: 35, exercises: [{ name: 'Pecho plano', sets: [{ weight: 60, reps: 10 }] }] };
    guardarBorrador('2026-10-18', 'gym', sesion);
    assert.deepEqual(leerBorrador('2026-10-18', 'gym'), sesion);
  });
});

test('el borrador de otro día o de otra actividad no se cruza', async () => {
  // Si no, abrir el agua del martes mostraría la sesión de gimnasio del lunes.
  const { guardarBorrador, leerBorrador } = await API();
  await conAlmacenamiento(() => {
    guardarBorrador('2026-10-18', 'gym', { templateId: 'x' });
    assert.equal(leerBorrador('2026-10-19', 'gym'), null, 'otro día');
    assert.equal(leerBorrador('2026-10-18', 'agua'), null, 'otra actividad');
  });
});

test('guardar un borrador pisa el anterior', async () => {
  // Hay uno solo a la vez: un borrador viejo de algo que ya cerraste no tiene
  // que resucitar más adelante.
  const { guardarBorrador, leerBorrador } = await API();
  await conAlmacenamiento(() => {
    guardarBorrador('2026-10-18', 'gym', { meta: 1 });
    guardarBorrador('2026-10-19', 'agua', { value: 500 });
    assert.equal(leerBorrador('2026-10-18', 'gym'), null, 'el viejo ya no está');
    assert.deepEqual(leerBorrador('2026-10-19', 'agua'), { value: 500 });
  });
});

test('borrarlo lo borra de verdad', async () => {
  const { guardarBorrador, leerBorrador, borrarBorrador } = await API();
  await conAlmacenamiento(() => {
    guardarBorrador('2026-10-18', 'gym', { meta: 1 });
    borrarBorrador();
    assert.equal(leerBorrador('2026-10-18', 'gym'), null);
  });
});

test('el borrador le gana al registro guardado al abrir el formulario', async () => {
  // Es más nuevo por definición: es lo que estabas cargando encima de lo que
  // ya había.
  const { guardarBorrador, entradaOBorrador, load } = await API();
  await conAlmacenamiento(() => {
    load();
    guardarBorrador('2026-10-18', 'gym', { templateId: 'nuevo', meta: 35 });
    assert.equal(entradaOBorrador('2026-10-18', 'gym').templateId, 'nuevo');
  });
});

test('sin borrador se abre con lo que ya estaba guardado', async () => {
  const { entradaOBorrador, load } = await API();
  const guardado = JSON.stringify({
    version: 1, settings: {}, unlocked: {},
    entries: { '2026-10-18': { gym: { templateId: 'viejo', meta: 30 } } },
  });
  await conAlmacenamiento(() => {
    load();
    assert.equal(entradaOBorrador('2026-10-18', 'gym').templateId, 'viejo');
    assert.equal(entradaOBorrador('2026-10-18', 'agua'), null, 'y null si no hay nada');
  }, { 'routine-rpg': guardado });
});

test('un borrador corrupto no rompe el formulario', async () => {
  // Es una red de seguridad: si falla, tiene que fallar en silencio y dejar
  // pasar lo que ya estaba guardado.
  const { leerBorrador } = await API();
  for (const basura of ['no es json', '{"fecha":', 'null', '[]']) {
    await conAlmacenamiento(() => {
      assert.equal(leerBorrador('2026-10-18', 'gym'), null, `con ${basura}`);
    }, { 'routine-rpg-borrador': basura });
  }
});

test('el borrador NO pasa por mutate, o se comería los logros', async () => {
  // mutate marca los logros como desbloqueados al escribir. Si el
  // autoguardado pasara por ahí, para cuando tocaras Guardar ya no quedaría
  // nada que festejar: la app es un juego, y esa es la mitad del asunto.
  const src = readFileSync('js/state.js', 'utf8');
  const fn = src.slice(src.indexOf('export function guardarBorrador'));
  const cuerpo = fn.slice(0, fn.indexOf('\nexport function leerBorrador'));
  assert.ok(!cuerpo.includes('mutate('), 'guardarBorrador no puede usar mutate');
  assert.ok(cuerpo.includes('localStorage.setItem'), 'escribe directo en su propia clave');
});

test('el borrador vive en una clave aparte de los datos', async () => {
  // Si compartiera clave con el progreso, un borrador roto se llevaría puesto
  // el historial entero.
  const { guardarBorrador } = await API();
  await conAlmacenamiento((datos) => {
    guardarBorrador('2026-10-18', 'gym', { meta: 1 });
    const claves = Object.keys(datos);
    assert.ok(claves.length === 1 && claves[0] !== 'routine-rpg',
      `escribió en ${claves.join(', ')}`);
  });
});

// ---------------------------------------------------------------------------
// Que el autoguardado esté realmente enganchado
// ---------------------------------------------------------------------------

const logger = readFileSync('js/ui/logger.js', 'utf8');

test('el registrador anota el borrador al mandar la app al fondo', () => {
  // visibilitychange es el único aviso que da Android antes de matar la app.
  // Sin esto, el resto del arreglo no sirve de nada en el caso real.
  assert.match(logger, /addEventListener\('visibilitychange'/,
    'falta escuchar cuando la app se va al fondo');
  assert.match(logger, /visibilityState === 'hidden'/);
  assert.match(logger, /setInterval\(anotarBorrador/,
    'y la red por si el sistema no llega ni a avisar');
});

test('guardar y borrar limpian el borrador', () => {
  // Si no, al volver a abrir el día aparecería otra vez lo que ya guardaste.
  const guardado = logger.slice(logger.indexOf("save.addEventListener('click'"));
  assert.match(guardado.slice(0, 400), /borrarBorrador\(\)/,
    'guardar tiene que limpiar el borrador');
  const borrado = logger.slice(logger.indexOf('const remove ='));
  assert.match(borrado.slice(0, 600), /borrarBorrador\(\)/,
    'borrar también');
});

test('cerrar el panel suelta el reloj del autoguardado', () => {
  // Un intervalo por cada formulario abierto se acumula toda la sesión.
  assert.match(logger, /clearInterval\(reloj\)/);
  assert.match(logger, /removeEventListener\('visibilitychange'/);
  assert.match(logger, /onClose:/, 'y el panel tiene que llamar a esa limpieza');
});

test('closeSheet también corre la limpieza del panel', () => {
  // Es el camino que se usa después de guardar: si no la corriera, el reloj
  // quedaba vivo justo en el caso más común.
  const sheet = readFileSync('js/ui/sheet.js', 'utf8');
  const fn = sheet.slice(sheet.indexOf('export function closeSheet'));
  assert.match(fn.slice(0, 300), /limpiar/,
    'closeSheet tiene que soltar lo que el panel dejó andando');
});

test('la barra de abajo no muestra el recuadro de fábrica de Android', () => {
  const css = readFileSync('css/styles.css', 'utf8');
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent/,
    'sin esto Android pinta un cuadrado celeste que se sale de la píldora');
  assert.match(css, /:focus-visible/,
    'y el foco tiene que seguir marcándose de alguna forma');
});
