import test from 'node:test';
import assert from 'node:assert/strict';
import { tramos, esLibre, tramoDe, largo, agregar, quitar, normalizar, claveDe } from '../js/pausas.js';

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

test('quitar una excusa no se lleva las vacaciones del mismo día', () => {
  const vacaciones = { desde: '2026-09-22', hasta: '2026-09-22' };
  const excusa = { desde: '2026-09-22', hasta: '2026-09-22', actividades: ['muaythai'] };
  const l = [vacaciones, excusa];

  const sinExcusa = quitar(l, excusa);
  assert.equal(sinExcusa.length, 1);
  assert.equal(sinExcusa[0].tipo, 'vacaciones');

  const sinVacaciones = quitar(l, vacaciones);
  assert.equal(sinVacaciones.length, 1);
  assert.deepEqual(sinVacaciones[0].actividades, ['muaythai']);

  assert.equal(quitar(l, '2026-09-22').length, 0, 'con la fecha sola se van los dos');
  assert.equal(quitar(l, null).length, 2, 'y con basura no se borra nada');
});

test('los tramos del mismo día salen en un orden estable', () => {
  const uno = tramos([{ desde: '2026-09-22', actividades: ['piano'] }, { desde: '2026-09-22' }]);
  const otro = tramos([{ desde: '2026-09-22' }, { desde: '2026-09-22', actividades: ['piano'] }]);
  assert.deepEqual(uno, otro);
});

// --- Vacaciones y excusas -------------------------------------------------

test('el tipo se deduce del alcance cuando no viene declarado', () => {
  assert.equal(normalizar({ desde: '2026-09-22' }).tipo, 'vacaciones');
  assert.equal(normalizar({ desde: '2026-09-22', hasta: '2026-09-28' }).tipo, 'vacaciones');
  assert.equal(normalizar({ desde: '2026-09-22', actividades: ['muaythai'] }).tipo, 'excusa',
    'un tramo de una disciplina sola es una excusa');
});

test('el tipo declarado gana, y la basura no', () => {
  assert.equal(normalizar({ desde: '2026-09-22', hasta: '2026-09-28', tipo: 'excusa' }).tipo, 'excusa');
  assert.equal(normalizar({ desde: '2026-09-22', actividades: ['gym'], tipo: 'vacaciones' }).tipo, 'vacaciones',
    'irse de viaje sin gimnasio son vacaciones del gimnasio');
  assert.equal(normalizar({ desde: '2026-09-22', tipo: 'feriado' }).tipo, 'vacaciones');
  assert.equal(normalizar({ desde: '2026-09-22', tipo: 7 }).tipo, 'vacaciones');
});

test('unas vacaciones y una excusa del mismo día no se fusionan', () => {
  // Cubren lo mismo y se tocan, pero se declararon por razones distintas:
  // fusionarlas dejaría una sola fila con un nombre que miente.
  const r = agregar(
    [{ desde: '2026-09-22', hasta: '2026-09-25', tipo: 'vacaciones', actividades: ['muaythai'] }],
    { desde: '2026-09-26', tipo: 'excusa', actividades: ['muaythai'] },
  );
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((t) => t.tipo), ['vacaciones', 'excusa']);
});

test('dos excusas de la misma disciplina que se tocan sí se fusionan', () => {
  const r = agregar(
    [{ desde: '2026-09-22', tipo: 'excusa', actividades: ['muaythai'] }],
    { desde: '2026-09-23', tipo: 'excusa', actividades: ['muaythai'] },
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'excusa');
});

test('lo que decide qué se perdona es el alcance, no el tipo', () => {
  // Unas vacaciones acotadas al gimnasio perdonan el gimnasio y nada más, igual
  // que una excusa: el tipo es para poder nombrarlas.
  const v = [{ desde: '2026-09-22', hasta: '2026-09-28', tipo: 'vacaciones', actividades: ['gym'] }];
  assert.equal(esLibre(v, '2026-09-25', 'gym'), true);
  assert.equal(esLibre(v, '2026-09-25', 'pasos'), false);
  assert.equal(esLibre(v, '2026-09-25'), false, 'no es un día libre entero');

  const e = [{ desde: '2026-09-22', tipo: 'excusa' }];
  assert.equal(esLibre(e, '2026-09-22'), true, 'una excusa sin disciplina cubre todo igual');
});

test('la clave distingue el tipo y el alcance, y nada más', () => {
  const a = { desde: '2026-09-22', tipo: 'excusa', actividades: ['muaythai'], motivo: 'Trabajo' };
  const b = { desde: '2026-10-05', hasta: '2026-10-09', tipo: 'excusa', actividades: ['muaythai'] };
  assert.equal(claveDe(a), claveDe(b), 'ni la fecha ni el motivo entran');
  assert.notEqual(claveDe(a), claveDe({ ...a, tipo: 'vacaciones' }));
  assert.notEqual(claveDe(a), claveDe({ ...a, actividades: ['gym'] }));
  assert.equal(claveDe(undefined), claveDe({}), 'y la basura no revienta');
});
