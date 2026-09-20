import test from 'node:test';
import assert from 'node:assert/strict';
import { tocaGuardar, nombreDeCopia, CADA_DIAS } from '../js/backup.js';

test('la primera vez siempre guarda', () => {
  assert.equal(tocaGuardar({}, '2026-09-20'), true);
});

test('espera una semana entre copias', () => {
  const s = { lastAutoBackupAt: '2026-09-14' };
  assert.equal(tocaGuardar(s, '2026-09-20'), false, 'a los 6 días todavía no');
  assert.equal(tocaGuardar(s, '2026-09-21'), true, 'a los 7 sí');
  assert.equal(tocaGuardar(s, '2026-10-30'), true, 'y si pasó mucho, también');
});

test('una exportación a mano también cuenta', () => {
  // Si acabás de exportar vos, guardar otra copia al día siguiente es ruido.
  assert.equal(tocaGuardar({ lastExportAt: '2026-09-19' }, '2026-09-20'), false);
});

test('la copia automática manda sobre la manual', () => {
  const s = { lastAutoBackupAt: '2026-09-19', lastExportAt: '2026-01-01' };
  assert.equal(tocaGuardar(s, '2026-09-20'), false);
});

test('fuera de la app no guarda nada', () => {
  // En el navegador una descarga necesita un gesto del usuario.
  assert.equal(tocaGuardar({}, '2026-09-20', false), false);
});

test('se puede apagar', () => {
  assert.equal(tocaGuardar({ autoBackup: false }, '2026-09-20'), false);
  assert.equal(tocaGuardar({ autoBackup: true }, '2026-09-20'), true);
});

test('cada copia tiene su propio nombre', () => {
  assert.equal(nombreDeCopia('2026-09-20'), 'rutina-rpg-auto-2026-09-20.json');
  assert.notEqual(nombreDeCopia('2026-09-20'), nombreDeCopia('2026-09-27'),
    'si se pisaran, una copia mala borraría la buena');
  assert.ok(CADA_DIAS >= 1 && CADA_DIAS <= 14);
});

test('no guarda una copia de una app vacía', () => {
  // El día que la instalás no hay nada que respaldar: dejar un archivo suelto
  // en Descargas es ruido, no seguridad.
  assert.equal(tocaGuardar({}, '2026-09-20', true, false), false);
  assert.equal(tocaGuardar({}, '2026-09-20', true, true), true);
});
