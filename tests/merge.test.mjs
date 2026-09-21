import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionar, marcaDeTiempo } from '../js/merge.js';

const copia = (entries, extra = {}) => ({ entries, unlocked: {}, activities: [], ...extra });
const reg = (value, updatedAt) => ({ value, updatedAt });

test('une días que sólo están de un lado', () => {
  const local = copia({ '2026-09-01': { piano: reg(30, '2026-09-01T10:00:00Z') } });
  const otro = copia({ '2026-09-02': { piano: reg(45, '2026-09-02T10:00:00Z') } });
  const r = fusionar(local, otro);
  assert.deepEqual(Object.keys(r.entries), ['2026-09-01', '2026-09-02']);
  assert.equal(r.resumen.diasNuevos, 1);
});

test('nunca pierde un día', () => {
  // La propiedad que importa: fusionar sólo puede agregar días, jamás sacar.
  const local = copia({ '2026-09-01': { piano: reg(30, 'x') }, '2026-09-03': { datos: reg(45, 'x') } });
  const otro = copia({ '2026-09-02': { pasos: reg(9000, 'x') } });
  const r = fusionar(local, otro);
  for (const d of ['2026-09-01', '2026-09-02', '2026-09-03']) assert.ok(r.entries[d], `falta ${d}`);
});

test('cuando el registro está en los dos, gana el más nuevo', () => {
  const local = copia({ '2026-09-01': { piano: reg(30, '2026-09-01T10:00:00Z') } });
  const otro = copia({ '2026-09-01': { piano: reg(60, '2026-09-01T20:00:00Z') } });
  assert.equal(fusionar(local, otro).entries['2026-09-01'].piano.value, 60);
  assert.equal(fusionar(otro, local).entries['2026-09-01'].piano.value, 60, 'el orden no cambia el resultado');
});

test('lo que está sólo acá se conserva aunque el archivo sea más nuevo', () => {
  const local = copia({ '2026-09-01': { piano: reg(30, '2026-01-01T00:00:00Z') } });
  const otro = copia({ '2026-09-01': { datos: reg(45, '2026-09-09T00:00:00Z') } });
  const dia = fusionar(local, otro).entries['2026-09-01'];
  assert.equal(dia.piano.value, 30);
  assert.equal(dia.datos.value, 45);
});

test('acepta importedAt además de updatedAt', () => {
  // Los pasos que entran por Samsung Health o por la app llevan importedAt.
  const local = copia({ '2026-09-01': { pasos: { value: 8000, importedAt: '2026-09-01T10:00:00Z' } } });
  const otro = copia({ '2026-09-01': { pasos: { value: 9430, updatedAt: '2026-09-01T23:00:00Z' } } });
  assert.equal(fusionar(local, otro).entries['2026-09-01'].pasos.value, 9430);
});

test('un registro sin fecha pierde contra uno que la tiene', () => {
  const local = copia({ '2026-09-01': { piano: { value: 30 } } });
  const otro = copia({ '2026-09-01': { piano: reg(45, '2020-01-01T00:00:00Z') } });
  assert.equal(fusionar(local, otro).entries['2026-09-01'].piano.value, 45);
});

test('registros idénticos no cuentan como cambio', () => {
  const a = { value: 30, updatedAt: '2026-09-01T10:00:00Z' };
  const b = { value: 30, updatedAt: '2026-09-05T10:00:00Z' };   // mismo dato, otra fecha
  const r = fusionar(copia({ '2026-09-01': { piano: a } }), copia({ '2026-09-01': { piano: b } }));
  assert.equal(r.resumen.sinCambios, 1);
  assert.equal(r.resumen.reemplazados, 0);
  assert.equal(r.resumen.total, 0, 'no hay nada que avisar');
});

test('fusionar dos veces da lo mismo que una', () => {
  const local = copia({ '2026-09-01': { piano: reg(30, '2026-09-01T10:00:00Z') } });
  const otro = copia({ '2026-09-01': { piano: reg(60, '2026-09-02T10:00:00Z') },
                       '2026-09-02': { datos: reg(45, '2026-09-02T10:00:00Z') } });
  const una = fusionar(local, otro);
  const dos = fusionar({ ...local, entries: una.entries }, otro);
  assert.deepEqual(dos.entries, una.entries);
  assert.equal(dos.resumen.total, 0, 'la segunda vez no debería cambiar nada');
});

test('los logros se unen y vale la fecha más temprana', () => {
  const local = copia({}, { unlocked: { 'week-1': '2026-05-01', 'mt-100': '2026-08-01' } });
  const otro = copia({}, { unlocked: { 'week-1': '2026-03-01', 'piano-100h': '2026-07-01' } });
  assert.deepEqual(fusionar(local, otro).unlocked, {
    'week-1': '2026-03-01', 'mt-100': '2026-08-01', 'piano-100h': '2026-07-01',
  });
});

test('trae las actividades que acá no existen', () => {
  // Si no, sus registros quedarían huérfanos y no se verían en ningún lado.
  const local = copia({}, { activities: [{ id: 'piano' }] });
  const otro = copia({}, { activities: [{ id: 'piano' }, { id: 'ajedrez', name: 'Ajedrez' }] });
  const r = fusionar(local, otro);
  assert.deepEqual(r.actividadesNuevas.map((a) => a.id), ['ajedrez']);
});

test('no inventa días vacíos', () => {
  const r = fusionar(copia({ '2026-09-01': {} }), copia({ '2026-09-02': {} }));
  assert.deepEqual(r.entries, {});
});

test('aguanta datos rotos sin explotar', () => {
  assert.doesNotThrow(() => fusionar(null, null));
  assert.doesNotThrow(() => fusionar({}, {}));
  assert.doesNotThrow(() => fusionar(copia({ x: null }), copia({ x: undefined })));
  assert.equal(marcaDeTiempo(undefined), 0);
  assert.equal(marcaDeTiempo({ updatedAt: 'no es una fecha' }), 0);
});

test('una sesión de gimnasio entera sobrevive a la fusión', () => {
  const sesion = { templateId: 'espalda-biceps', exercises: [{ name: 'Dominadas', sets: [{ weight: 0, reps: 10 }] }],
    updatedAt: '2026-09-01T10:00:00Z' };
  const r = fusionar(copia({}), copia({ '2026-09-01': { gym: sesion } }));
  assert.deepEqual(r.entries['2026-09-01'].gym, sesion);
});

test('los días libres se unen al fusionar', () => {
  // Declararlos en un teléfono y perderlos al restaurar en el otro cortaría
  // una racha que ya estaba protegida.
  const local = copia({}, { pausas: [{ desde: '2026-08-01', hasta: '2026-08-05' }] });
  const otro = copia({}, { pausas: [{ desde: '2026-09-10', hasta: '2026-09-15' }] });
  const r = fusionar(local, otro);
  assert.equal(r.pausas.length, 2);
  assert.deepEqual(r.pausas.map((t) => t.desde), ['2026-08-01', '2026-09-10']);
});

test('y los que se tocan quedan como uno solo', () => {
  const local = copia({}, { pausas: [{ desde: '2026-08-01', hasta: '2026-08-05' }] });
  const otro = copia({}, { pausas: [{ desde: '2026-08-04', hasta: '2026-08-09' }] });
  const r = fusionar(local, otro);
  assert.equal(r.pausas.length, 1);
  assert.deepEqual([r.pausas[0].desde, r.pausas[0].hasta], ['2026-08-01', '2026-08-09']);
});
