import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirBase } from '../src/base.mjs';
import { compararCorridas, resumirDiferencias } from '../src/diferencias.mjs';
import { aCsv, filaCsv } from '../src/exportar.mjs';
import { idEntidad } from '../src/scrapear.mjs';

const banda = (n) => ({ etiqueta: `Band ${n}`, numero: n, orden: 10 + n, tipo: 'banda' });

/** Base con una tabla de Argentina y las entidades de siempre. */
function baseConTabla() {
  const base = abrirBase(':memory:');
  base.guardarGuia({ id: 9, slug: 'latin-america', nombre: 'Latin America', edicion: 2025 });
  base.guardarUbicacion({ id: 19, nombre: 'Argentina', slug: 'argentina' });
  base.guardarArea({ id: 6, nombre: 'Banking & Finance', slug: 'banking-and-finance' });
  base.guardarTabla({
    clave: '9:6:19:1', guiaId: 9, areaId: 6, ubicacionId: 19, subseccionId: 1,
    slug: 'banking-finance-argentina', url: 'https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1',
    titulo: 'Banking & Finance, Argentina, Latin America', edicion: 2025, fuente: 'json',
  });
  for (const [id, nombre] of [['persona:1', 'Ana Rossi'], ['persona:2', 'Bruno Paz'], ['persona:3', 'Carla Díaz']]) {
    base.guardarEntidad({ id, tipo: 'persona', nombre, url: `https://chambers.com/lawyer/${id}` });
  }
  return base;
}

test('la vista vigente muestra la última foto de cada tabla', () => {
  const base = baseConTabla();
  const vieja = base.iniciarCorrida({ paises: ['argentina'] });
  base.guardarRanking({ corridaId: vieja, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(3) });
  base.cerrarCorrida(vieja, { tablas: 1, filas: 1 });

  const nueva = base.iniciarCorrida({ paises: ['argentina'] });
  base.guardarRanking({ corridaId: nueva, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(1) });
  base.cerrarCorrida(nueva, { tablas: 1, filas: 1 });

  const filas = base.consultar('SELECT nombre, banda, pais, area FROM vista_rankings');
  assert.equal(filas.length, 1);
  assert.equal(filas[0].banda, 'Band 1');
  assert.equal(filas[0].pais, 'Argentina');
  base.cerrar();
});

test('guardar dos veces la misma fila no la duplica', () => {
  const base = baseConTabla();
  const corrida = base.iniciarCorrida({});
  base.guardarRanking({ corridaId: corrida, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(2) });
  base.guardarRanking({ corridaId: corrida, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(1) });
  const filas = base.consultar('SELECT banda FROM ranking WHERE corrida_id = ?', corrida);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].banda, 'Band 1');
  base.cerrar();
});

test('el diff cuenta altas, bajas y movimientos', () => {
  const base = baseConTabla();
  const antes = base.iniciarCorrida({});
  base.guardarRanking({ corridaId: antes, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(2) });
  base.guardarRanking({ corridaId: antes, tablaClave: '9:6:19:1', entidadId: 'persona:2', banda: banda(3) });
  base.cerrarCorrida(antes, {});

  const despues = base.iniciarCorrida({});
  base.guardarRanking({ corridaId: despues, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(1) });
  base.guardarRanking({ corridaId: despues, tablaClave: '9:6:19:1', entidadId: 'persona:3', banda: banda(4) });
  base.cerrarCorrida(despues, {});

  const d = compararCorridas(base, antes, despues);
  assert.deepEqual(d.altas.map((a) => a.nombre), ['Carla Díaz']);
  assert.deepEqual(d.bajas.map((b) => b.nombre), ['Bruno Paz']);
  assert.equal(d.cambios.length, 1);
  assert.equal(d.cambios[0].movimiento, 'sube');
  assert.equal(d.cambios[0].banda_antes, 'Band 2');
  assert.equal(d.cambios[0].banda_despues, 'Band 1');
  assert.match(resumirDiferencias(d), /1 altas · 1 bajas/);
  base.cerrar();
});

test('una tabla que no se midió en las dos corridas no genera bajas falsas', () => {
  const base = baseConTabla();
  base.guardarTabla({ clave: '9:49:37:1', guiaId: 9, areaId: 49, ubicacionId: 37, subseccionId: 1, url: 'https://x' });
  const antes = base.iniciarCorrida({});
  base.guardarRanking({ corridaId: antes, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(1) });
  base.guardarRanking({ corridaId: antes, tablaClave: '9:49:37:1', entidadId: 'persona:2', banda: banda(1) });
  base.cerrarCorrida(antes, {});

  const despues = base.iniciarCorrida({}); // esta vez sólo se bajó Argentina
  base.guardarRanking({ corridaId: despues, tablaClave: '9:6:19:1', entidadId: 'persona:1', banda: banda(1) });
  base.cerrarCorrida(despues, {});

  const d = compararCorridas(base, antes, despues);
  assert.equal(d.tablas, 1);
  assert.deepEqual(d.bajas, []);
  base.cerrar();
});

test('la identidad sale del perfil, y si no hay perfil, del nombre', () => {
  assert.equal(idEntidad({ tipo: 'persona', nombre: 'Ana Rossi', url: 'https://chambers.com/lawyer/ana-rossi-9:19:2001' }), 'persona:9:19:2001');
  assert.equal(idEntidad({ tipo: 'organizacion', nombre: 'Estudio Alfa', url: null }), 'organizacion:estudio-alfa');
});

test('el CSV escapa comas, comillas y saltos', () => {
  assert.equal(filaCsv(['a', 'b,c', 'd"e', 'f\ng']), 'a,"b,c","d""e","f\ng"');
  assert.equal(filaCsv([null, undefined, 0]), ',,0');
  assert.equal(aCsv([{ nombre: 'Ana', banda: 'Band 1' }]), 'nombre,banda\nAna,Band 1\n');
});
