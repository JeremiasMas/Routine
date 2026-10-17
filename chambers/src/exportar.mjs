// Exportar lo que hay en la base: CSV para la planilla, JSON para el resto.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Una fila de CSV, con las comillas donde corresponde. */
export function filaCsv(valores) {
  return valores
    .map((v) => {
      const texto = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    })
    .join(',');
}

/**
 * Tabla de objetos a CSV. Las columnas salen del primer registro salvo que se
 * pasen a mano.
 */
export function aCsv(filas, columnas) {
  const cols = columnas ?? (filas.length ? Object.keys(filas[0]) : []);
  return [filaCsv(cols), ...filas.map((f) => filaCsv(cols.map((c) => f[c])))].join('\n') + '\n';
}

/** Escribe un archivo creando la carpeta si hace falta. */
export async function escribir(ruta, contenido) {
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, contenido, 'utf8');
  return ruta;
}

/**
 * Exporta la foto vigente de los rankings.
 * @param {object} base
 * @param {{formato?:'csv'|'json'|'ndjson', salida:string, paises?:string[], guias?:string[]}} opciones
 */
export async function exportarRankings(base, { formato = 'csv', salida, paises = [], guias = [] }) {
  const condiciones = [];
  const params = [];
  if (paises.length) {
    condiciones.push(`LOWER(pais) IN (${paises.map(() => '?').join(',')})`);
    params.push(...paises.map((p) => p.toLowerCase()));
  }
  if (guias.length) {
    condiciones.push(`LOWER(guia) IN (${guias.map(() => '?').join(',')})`);
    params.push(...guias.map((g) => g.toLowerCase()));
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = base.consultar(
    `SELECT guia, edicion, pais, area, seccion, tipo, nombre, banda, banda_numero, perfil, url_tabla, tabla
     FROM vista_rankings ${donde}
     ORDER BY guia, pais, area, banda_numero IS NULL, banda_numero, nombre`,
    ...params
  );

  const cuerpo = formato === 'csv' ? aCsv(filas.map((f) => ({ ...f })))
    : formato === 'ndjson' ? filas.map((f) => JSON.stringify(f)).join('\n') + '\n'
    : JSON.stringify(filas, null, 2);

  await escribir(salida, cuerpo);
  return { filas: filas.length, ruta: salida };
}
