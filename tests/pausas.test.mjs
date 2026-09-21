import test from 'node:test';
import assert from 'node:assert/strict';
import { tramos, esLibre, tramoDe, largo, agregar, quitar, normalizar } from '../js/pausas.js';

test('un día suelto es un tramo de un día', () => {
  assert.equal(largo({ desde: '2026-09-21' }), 1);
  assert.equal(normalizar({ desde: '2026-09-21' }).hasta, '2026-09-21');
});

test('cuenta los dos extremos', () => {
  assert.equal(largo({ desde: '2026-09-21', hasta: '2026-09-27' }), 7);
});

test('un día adentro del tramo está libre, uno afuera no', () => {
  const l = [{ desde: '2026-09-21', hasta: '2026-09-25' }];
  assert.equal(esLibre(l, '2026-09-21'), true, 'el primero cuenta');
  assert.equal(esLibre(l, '2026-09-23'), true);
  assert.equal(esLibre(l, '2026-09-25'), true, 'el último también');
  assert.equal(esLibre(l, '2026-09-20'), false);
  assert.equal(esLibre(l, '2026-09-26'), false);
});

test('las fechas al revés se ordenan en vez de descartarse', () => {
  const t = normalizar({ desde: '2026-09-25', hasta: '2026-09-21' });
  assert.equal(t.desde, '2026-09-21');
  assert.equal(t.hasta, '2026-09-25');
});

test('dos tramos que se tocan se fusionan', () => {
  const r = agregar([{ desde: '2026-09-21', hasta: '2026-09-25' }], { desde: '2026-09-24', hasta: '2026-09-28' });
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].desde, r[0].hasta], ['2026-09-21', '2026-09-28']);
});

test('dos tramos contiguos también, que son el mismo descanso', () => {
  const r = agregar([{ desde: '2026-09-21', hasta: '2026-09-25' }], { desde: '2026-09-26', hasta: '2026-09-28' });
  assert.equal(r.length, 1);
  assert.equal(r[0].hasta, '2026-09-28');
});

test('dos tramos separados quedan separados', () => {
  const r = agregar([{ desde: '2026-09-21', hasta: '2026-09-25' }], { desde: '2026-10-10', hasta: '2026-10-12' });
  assert.equal(r.length, 2);
});

test('un tramo contenido en otro no lo achica', () => {
  const r = agregar([{ desde: '2026-09-01', hasta: '2026-09-30' }], { desde: '2026-09-10', hasta: '2026-09-12' });
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].desde, r[0].hasta], ['2026-09-01', '2026-09-30']);
});

test('se puede sacar un tramo por su fecha de inicio', () => {
  const l = [{ desde: '2026-09-21', hasta: '2026-09-25' }, { desde: '2026-10-10', hasta: '2026-10-12' }];
  assert.equal(quitar(l, '2026-09-21').length, 1);
  assert.equal(quitar(l, '2026-01-01').length, 2, 'una fecha que no existe no borra nada');
});

test('el motivo se conserva y se acota', () => {
  const t = normalizar({ desde: '2026-09-21', motivo: 'x'.repeat(200) });
  assert.equal(t.motivo.length, 60);
  assert.equal(tramoDe([{ desde: '2026-09-21', motivo: 'Viaje' }], '2026-09-21').motivo, 'Viaje');
});

test('la basura se descarta sin romper nada', () => {
  assert.deepEqual(tramos(null), []);
  assert.deepEqual(tramos([null, {}, { desde: 'ayer' }, { desde: '2026-13-99' }]), []);
  assert.equal(esLibre(null, '2026-09-21'), false);
  assert.equal(largo(null), 0);
  assert.deepEqual(agregar(null, null), []);
});

test('los tramos salen ordenados por fecha', () => {
  const r = tramos([{ desde: '2026-10-01' }, { desde: '2026-08-01' }, { desde: '2026-09-01' }]);
  assert.deepEqual(r.map((t) => t.desde), ['2026-08-01', '2026-09-01', '2026-10-01']);
});
