// La base: SQLite, sin dependencias (node:sqlite viene con Node 22).
//
// Cada corrida queda guardada entera, no se pisa la anterior. Eso es lo que
// después permite preguntar "¿quién subió de banda entre la guía 2025 y la
// 2026?" en vez de tener sólo una foto del presente.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ESQUEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS corrida (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  inicio   TEXT NOT NULL,
  fin      TEXT,
  paises   TEXT NOT NULL DEFAULT '',
  guias    TEXT NOT NULL DEFAULT '',
  tablas   INTEGER NOT NULL DEFAULT 0,
  filas    INTEGER NOT NULL DEFAULT 0,
  fallos   INTEGER NOT NULL DEFAULT 0,
  notas    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS guia (
  id      INTEGER PRIMARY KEY,
  slug    TEXT NOT NULL,
  nombre  TEXT NOT NULL DEFAULT '',
  url     TEXT NOT NULL DEFAULT '',
  edicion INTEGER,
  huella  TEXT NOT NULL DEFAULT '',
  visto   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ubicacion (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  slug   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS area (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  slug   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tabla (
  clave        TEXT PRIMARY KEY,
  guia_id      INTEGER NOT NULL,
  area_id      INTEGER NOT NULL,
  ubicacion_id INTEGER NOT NULL,
  subseccion_id INTEGER NOT NULL,
  slug         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL,
  titulo       TEXT NOT NULL DEFAULT '',
  edicion      INTEGER,
  fuente       TEXT NOT NULL DEFAULT '',
  visto        TEXT NOT NULL
);

-- Una entidad es un perfil: la identidad viene de la URL de chambers. Ojo:
-- el mismo abogado puede tener perfiles distintos en guías distintas, así que
-- para seguirlo entre guías se agrupa por 'slug' (nombre normalizado).
CREATE TABLE IF NOT EXISTS entidad (
  id     TEXT PRIMARY KEY,
  tipo   TEXT NOT NULL,
  nombre TEXT NOT NULL,
  slug   TEXT NOT NULL DEFAULT '',
  url    TEXT,
  visto  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ranking (
  corrida_id   INTEGER NOT NULL REFERENCES corrida(id) ON DELETE CASCADE,
  tabla_clave  TEXT NOT NULL,
  entidad_id   TEXT NOT NULL,
  seccion      TEXT NOT NULL DEFAULT '',
  banda        TEXT NOT NULL DEFAULT '',
  banda_numero INTEGER,
  banda_orden  INTEGER NOT NULL DEFAULT 99,
  banda_tipo   TEXT NOT NULL DEFAULT '',
  orden        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (corrida_id, tabla_clave, entidad_id, seccion)
);

CREATE INDEX IF NOT EXISTS ranking_por_entidad ON ranking(entidad_id);
CREATE INDEX IF NOT EXISTS ranking_por_tabla ON ranking(tabla_clave, corrida_id);

CREATE TABLE IF NOT EXISTS fallo (
  corrida_id INTEGER NOT NULL,
  url        TEXT NOT NULL,
  motivo     TEXT NOT NULL,
  fecha      TEXT NOT NULL
);

-- Última foto de cada tabla, sea cual sea la corrida que la trajo.
CREATE VIEW IF NOT EXISTS ranking_vigente AS
SELECT r.*
FROM ranking r
JOIN (SELECT tabla_clave, MAX(corrida_id) AS ultima FROM ranking GROUP BY tabla_clave) u
  ON u.tabla_clave = r.tabla_clave AND u.ultima = r.corrida_id;

-- La misma foto, ya legible: es la vista para exportar o consultar a mano.
CREATE VIEW IF NOT EXISTS vista_rankings AS
SELECT
  g.nombre        AS guia,
  t.edicion       AS edicion,
  u.nombre        AS pais,
  a.nombre        AS area,
  t.clave         AS tabla,
  r.seccion       AS seccion,
  e.tipo          AS tipo,
  e.nombre        AS nombre,
  e.slug          AS slug,
  r.banda         AS banda,
  r.banda_numero  AS banda_numero,
  e.url           AS perfil,
  t.url           AS url_tabla,
  r.corrida_id    AS corrida
FROM ranking_vigente r
JOIN tabla t   ON t.clave = r.tabla_clave
LEFT JOIN guia g      ON g.id = t.guia_id
LEFT JOIN ubicacion u ON u.id = t.ubicacion_id
LEFT JOIN area a      ON a.id = t.area_id
JOIN entidad e ON e.id = r.entidad_id;
`;

/**
 * Abre (y crea si hace falta) la base.
 * @param {string} ruta
 */
export function abrirBase(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec(ESQUEMA);

  const sentencias = {
    guia: db.prepare(`INSERT INTO guia (id, slug, nombre, url, edicion, huella, visto) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,
        nombre=CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE guia.nombre END,
        url=excluded.url,
        edicion=COALESCE(excluded.edicion, guia.edicion),
        huella=CASE WHEN excluded.huella <> '' THEN excluded.huella ELSE guia.huella END,
        visto=excluded.visto`),
    ubicacion: db.prepare(`INSERT INTO ubicacion (id, nombre, slug) VALUES (?,?,?)
      ON CONFLICT(id) DO UPDATE SET nombre=CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE ubicacion.nombre END,
        slug=CASE WHEN excluded.slug <> '' THEN excluded.slug ELSE ubicacion.slug END`),
    area: db.prepare(`INSERT INTO area (id, nombre, slug) VALUES (?,?,?)
      ON CONFLICT(id) DO UPDATE SET nombre=CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE area.nombre END,
        slug=CASE WHEN excluded.slug <> '' THEN excluded.slug ELSE area.slug END`),
    tabla: db.prepare(`INSERT INTO tabla (clave, guia_id, area_id, ubicacion_id, subseccion_id, slug, url, titulo, edicion, fuente, visto)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(clave) DO UPDATE SET slug=excluded.slug, url=excluded.url,
        titulo=CASE WHEN excluded.titulo <> '' THEN excluded.titulo ELSE tabla.titulo END,
        edicion=COALESCE(excluded.edicion, tabla.edicion),
        fuente=excluded.fuente, visto=excluded.visto`),
    entidad: db.prepare(`INSERT INTO entidad (id, tipo, nombre, slug, url, visto) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, slug=excluded.slug,
        url=COALESCE(excluded.url, entidad.url), visto=excluded.visto`),
    ranking: db.prepare(`INSERT INTO ranking (corrida_id, tabla_clave, entidad_id, seccion, banda, banda_numero, banda_orden, banda_tipo, orden)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(corrida_id, tabla_clave, entidad_id, seccion) DO UPDATE SET
        banda=excluded.banda, banda_numero=excluded.banda_numero,
        banda_orden=excluded.banda_orden, banda_tipo=excluded.banda_tipo, orden=excluded.orden`),
    fallo: db.prepare('INSERT INTO fallo (corrida_id, url, motivo, fecha) VALUES (?,?,?,?)'),
    abrirCorrida: db.prepare('INSERT INTO corrida (inicio, paises, guias, notas) VALUES (?,?,?,?)'),
    cerrarCorrida: db.prepare('UPDATE corrida SET fin=?, tablas=?, filas=?, fallos=? WHERE id=?'),
  };

  const ahora = () => new Date().toISOString();

  return {
    db,

    iniciarCorrida({ paises = [], guias = [], notas = '' } = {}) {
      const r = sentencias.abrirCorrida.run(ahora(), paises.join(','), guias.join(','), notas);
      return Number(r.lastInsertRowid);
    },

    cerrarCorrida(id, { tablas = 0, filas = 0, fallos = 0 } = {}) {
      sentencias.cerrarCorrida.run(ahora(), tablas, filas, fallos, id);
    },

    guardarGuia({ id, slug, nombre = '', url = '', edicion = null, huella = '' }) {
      sentencias.guia.run(id, slug, nombre, url, edicion, huella, ahora());
    },

    guardarUbicacion({ id, nombre = '', slug = '' }) {
      sentencias.ubicacion.run(id, nombre, slug);
    },

    guardarArea({ id, nombre = '', slug = '' }) {
      sentencias.area.run(id, nombre, slug);
    },

    guardarTabla(tabla) {
      sentencias.tabla.run(
        tabla.clave, tabla.guiaId, tabla.areaId, tabla.ubicacionId, tabla.subseccionId,
        tabla.slug ?? '', tabla.url, tabla.titulo ?? '', tabla.edicion ?? null, tabla.fuente ?? '', ahora()
      );
    },

    guardarEntidad({ id, tipo, nombre, slug = '', url = null }) {
      sentencias.entidad.run(id, tipo, nombre, slug, url, ahora());
    },

    guardarRanking({ corridaId, tablaClave, entidadId, seccion = '', banda = null, orden = 0 }) {
      sentencias.ranking.run(
        corridaId, tablaClave, entidadId, seccion ?? '',
        banda?.etiqueta ?? '', banda?.numero ?? null, banda?.orden ?? 99, banda?.tipo ?? '', orden
      );
    },

    registrarFallo({ corridaId, url, motivo }) {
      sentencias.fallo.run(corridaId, url, String(motivo).slice(0, 500), ahora());
    },

    /** Ejecuta `fn` dentro de una transacción. */
    enTransaccion(fn) {
      db.exec('BEGIN');
      try {
        const salida = fn();
        db.exec('COMMIT');
        return salida;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    consultar(sql, ...params) {
      return db.prepare(sql).all(...params);
    },

    corridas(limite = 10) {
      return db.prepare('SELECT * FROM corrida ORDER BY id DESC LIMIT ?').all(limite);
    },

    /** Última corrida terminada (o la última a secas, si ninguna cerró). */
    ultimaCorrida() {
      return db.prepare('SELECT * FROM corrida WHERE fin IS NOT NULL ORDER BY id DESC LIMIT 1').get()
        ?? db.prepare('SELECT * FROM corrida ORDER BY id DESC LIMIT 1').get()
        ?? null;
    },

    huellaDeGuia(id) {
      return db.prepare('SELECT huella, edicion FROM guia WHERE id = ?').get(id) ?? null;
    },

    cerrar() {
      db.close();
    },
  };
}
