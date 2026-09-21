import test from 'node:test';
import assert from 'node:assert/strict';
import { campo, filasACsv, filasDeHistorial, filasDeGimnasio, filasDeCuerpo, COLUMNAS } from '../js/csv.js';
import { derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

test('escapa lo que rompería el archivo', () => {
  // Una coma sin escapar parte la fila y corre todas las columnas de ahí en
  // adelante, sin que nada avise.
  assert.equal(campo('Viaje, con escala'), '"Viaje, con escala"');
  assert.equal(campo('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(campo('dos\nlíneas'), '"dos\nlíneas"');
  assert.equal(campo('simple'), 'simple');
  assert.equal(campo(null), '');
  assert.equal(campo(0), '0', 'el cero es un dato, no un vacío');
});

test('la cabecera va primero y las filas en orden', () => {
  const csv = filasACsv([{ fecha: '2026-09-01', actividad: 'piano' }], ['fecha', 'actividad']);
  assert.equal(csv, 'fecha,actividad\r\n2026-09-01,piano\r\n');
});

test('una fila por día y actividad, en formato largo', () => {
  const acts = DEFAULT_ACTIVITIES.filter((a) => ['piano', 'datos'].includes(a.id));
  const entries = {
    '2026-09-18': { piano: { value: 30 }, datos: { value: 45 } },
    '2026-09-19': { datos: { value: 20 } },
  };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: {} }, '2026-09-20');
  const filas = filasDeHistorial(state);
  assert.equal(filas.length, 3, 'dos del 18 y una del 19');
  const primera = filas[0];
  for (const c of COLUMNAS) assert.ok(c in primera, `falta la columna ${c}`);
  assert.equal(primera.fecha, '2026-09-18');
  assert.equal(primera.dia_semana, 'viernes');
  assert.equal(filas.find((f) => f.actividad === 'datos' && f.fecha === '2026-09-19').cumplida, 0,
    '20 minutos no llegan a la meta de 45');
});

test('marca los días declarados libres', () => {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'piano');
  const state = derive({ activities: acts, entries: { '2026-09-18': { piano: { value: 30 } } },
    unlocked: {}, settings: {} }, '2026-09-20');
  const filas = filasDeHistorial(state, { libre: (f) => f === '2026-09-18' });
  assert.equal(filas[0].dia_libre, 1);
});

test('el gimnasio sale serie por serie, que es donde está el dato', () => {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'gym');
  const entries = { '2026-09-18': { gym: { exercises: [
    { name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 4 }] },
    { name: 'Vuelo lateral', db: true, sets: [{ weight: 10, reps: 12 }] },
    { name: 'Dominadas', bw: true, sets: [{ weight: 0, reps: 8 }] },
  ] } } };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: { weight: 61.5 } }, '2026-09-20');
  const filas = filasDeGimnasio(state);
  assert.equal(filas.length, 4);
  assert.deepEqual(filas.map((f) => f.serie), [1, 2, 1, 1], 'la serie se numera dentro de cada ejercicio');
  assert.equal(filas.find((f) => f.ejercicio === 'Vuelo lateral').por_mancuerna, 1);
  assert.equal(filas.find((f) => f.ejercicio === 'Dominadas').peso_corporal, 1);
  assert.equal(filas.find((f) => f.ejercicio === 'Dominadas').e1rm_kg, '', 'sin lastre no hay 1RM que informar');
});

test('las series sin repeticiones no ensucian el archivo', () => {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'gym');
  const entries = { '2026-09-18': { gym: { exercises: [
    { name: 'Press militar', sets: [{ weight: 40, reps: 6 }, { weight: 40, reps: 0 }, { weight: '', reps: '' }] },
  ] } } };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: { weight: 61.5 } }, '2026-09-20');
  assert.equal(filasDeGimnasio(state).length, 1);
});

test('las mediciones salen aparte, una por fecha', () => {
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'cuerpo');
  const entries = {
    '2026-09-01': { cuerpo: { weight: 63, waist: 82, neck: 35 } },
    '2026-09-15': { cuerpo: { weight: 61.5, waist: 80, neck: 35 } },
  };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: { height: 160 } }, '2026-09-20');
  const filas = filasDeCuerpo(state);
  assert.equal(filas.length, 2);
  assert.equal(filas[1].peso_kg, 61.5);
  assert.equal(filas[1].cintura_cm, 80);
});

test('sin datos, el archivo tiene cabecera y nada más', () => {
  const state = derive({ activities: [], entries: {}, unlocked: {}, settings: {} }, '2026-09-20');
  const csv = filasACsv(filasDeHistorial(state));
  assert.equal(csv.trim(), COLUMNAS.join(','));
});

test('el archivo se puede volver a leer columna por columna', () => {
  // La prueba de que sirve: partir por comas tiene que devolver lo mismo.
  const filas = [{ fecha: '2026-09-18', actividad: 'piano', valor: 30 },
                 { fecha: '2026-09-19', actividad: 'muay thai, jueves', valor: 90 }];
  const csv = filasACsv(filas, ['fecha', 'actividad', 'valor']);
  const lineas = csv.trim().split('\r\n');
  assert.equal(lineas.length, 3);
  // La fila con coma tiene que seguir teniendo 3 columnas al parsear bien.
  const parseado = [...lineas[2].matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1]).filter((x, i, arr) => i < arr.length - 1);
  assert.equal(parseado.length, 3, `quedó en ${parseado.length} columnas: ${lineas[2]}`);
});
