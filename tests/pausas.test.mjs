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

// --- Permisos para una disciplina sola -------------------------------------

test('un permiso para una disciplina no libera el resto del día', () => {
  const l = [{ desde: '2026-09-22', actividades: ['muaythai'], motivo: 'Evento de trabajo' }];
  assert.equal(esLibre(l, '2026-09-22', 'muaythai'), true);
  assert.equal(esLibre(l, '2026-09-22', 'gym'), false, 'el gimnasio sigue contando');
  assert.equal(esLibre(l, '2026-09-22'), false, 'y el día no es un día libre');
  assert.equal(esLibre(l, '2026-09-23', 'muaythai'), false, 'ni el día siguiente');
});

test('un tramo de día entero cubre cualquier disciplina', () => {
  const l = [{ desde: '2026-09-22', hasta: '2026-09-25' }];
  assert.equal(esLibre(l, '2026-09-23'), true);
  assert.equal(esLibre(l, '2026-09-23', 'muaythai'), true);
  assert.equal(esLibre(l, '2026-09-23', 'cualquiera'), true);
});

test('los tramos viejos, sin actividades, siguen valiendo para todo', () => {
  const t = normalizar({ desde: '2026-09-22' });
  assert.equal('actividades' in t, false, 'no se le inventa la clave');
  assert.equal(esLibre([t], '2026-09-22', 'gym'), true);
});

test('la lista de actividades se limpia, se ordena y no repite', () => {
  const t = normalizar({ desde: '2026-09-22', actividades: ['piano', 'gym', ' ', 'piano', 7, null] });
  assert.deepEqual(t.actividades, ['gym', 'piano']);
  assert.equal('actividades' in normalizar({ desde: '2026-09-22', actividades: [] }), false);
  assert.equal('actividades' in normalizar({ desde: '2026-09-22', actividades: 'gym' }), false);
});

test('tramoDe dice por qué, y sólo para quien corresponde', () => {
  const l = [{ desde: '2026-09-22', actividades: ['muaythai'], motivo: 'Evento de trabajo' }];
  assert.equal(tramoDe(l, '2026-09-22', 'muaythai').motivo, 'Evento de trabajo');
  assert.equal(tramoDe(l, '2026-09-22', 'gym'), null);
  assert.equal(tramoDe(l, '2026-09-22'), null);
});

test('dos tramos que se tocan pero cubren distinto no se fusionan', () => {
  const r = agregar(
    [{ desde: '2026-09-21', hasta: '2026-09-25' }],
    { desde: '2026-09-24', hasta: '2026-09-28', actividades: ['muaythai'] },
  );
  assert.equal(r.length, 2, 'fusionarlos le regalaría el día entero al permiso de muay thai');
  assert.deepEqual(r.map((t) => t.hasta), ['2026-09-25', '2026-09-28']);
});

test('dos permisos de la misma disciplina que se tocan sí se fusionan', () => {
  const r = agregar(
    [{ desde: '2026-09-21', hasta: '2026-09-22', actividades: ['muaythai'] }],
    { desde: '2026-09-23', actividades: ['muaythai'] },
  );
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].desde, r[0].hasta, r[0].actividades], ['2026-09-21', '2026-09-23', ['muaythai']]);
});

test('fusionar no mezcla tramos de grupos distintos aunque se intercalen', () => {
  let l = agregar([], { desde: '2026-09-21', actividades: ['muaythai'] });
  l = agregar(l, { desde: '2026-09-22' });                              // día entero en medio
  l = agregar(l, { desde: '2026-09-23', actividades: ['muaythai'] });
  assert.equal(l.length, 3, 'los dos de muay thai no son contiguos entre sí');
  l = agregar(l, { desde: '2026-09-22', actividades: ['muaythai'] });   // ahora sí los une
  assert.equal(l.length, 2);
  const mt = l.find((t) => t.actividades);
  assert.deepEqual([mt.desde, mt.hasta], ['2026-09-21', '2026-09-23']);
});

test('quitar un permiso no se lleva el tramo de día entero del mismo día', () => {
  const l = [
    { desde: '2026-09-22', hasta: '2026-09-22' },
    { desde: '2026-09-22', hasta: '2026-09-22', actividades: ['muaythai'] },
  ];
  const sinPermiso = quitar(l, '2026-09-22', ['muaythai']);
  assert.equal(sinPermiso.length, 1);
  assert.equal('actividades' in sinPermiso[0], false);

  const sinEntero = quitar(l, '2026-09-22', []);
  assert.equal(sinEntero.length, 1);
  assert.deepEqual(sinEntero[0].actividades, ['muaythai']);

  assert.equal(quitar(l, '2026-09-22').length, 0, 'sin decir qué, se van los dos');
});

test('los tramos del mismo día salen en un orden estable', () => {
  const uno = tramos([{ desde: '2026-09-22', actividades: ['piano'] }, { desde: '2026-09-22' }]);
  const otro = tramos([{ desde: '2026-09-22' }, { desde: '2026-09-22', actividades: ['piano'] }]);
  assert.deepEqual(uno, otro);
});
