// Importación de pasos desde un CSV (export de Samsung Health o genérico).
// Módulo puro: recibe texto, devuelve {fecha -> pasos}. Sin DOM, sin storage.
import { dayKey } from './utils.js';

/** Divide una línea CSV respetando comillas dobles. */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const COLUMNAS_FECHA = ['day_time', 'start_time', 'date', 'fecha', 'day', 'create_time'];
const COLUMNAS_PASOS = ['step_count', 'total_step', 'count', 'steps', 'pasos'];

function puntajeCabecera(campos) {
  const bajo = campos.map((c) => c.toLowerCase());
  const tieneFecha = bajo.some((c) => COLUMNAS_FECHA.some((k) => c.includes(k)));
  const tienePasos = bajo.some((c) => COLUMNAS_PASOS.some((k) => c === k || c.endsWith(`.${k}`) || c.includes(k)));
  return (tieneFecha ? 1 : 0) + (tienePasos ? 1 : 0) + Math.min(campos.length, 20) / 100;
}

/** Elige, entre las primeras líneas, la que parece la cabecera de columnas. */
export function findHeader(lines) {
  let mejor = { index: -1, score: 0, fields: [] };
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (!lines[i]?.trim()) continue;
    const fields = splitCsvLine(lines[i]);
    const score = puntajeCabecera(fields);
    if (score > mejor.score) mejor = { index: i, score, fields };
  }
  return mejor.score >= 2 ? mejor : null;
}

/** Índice de la columna que mejor coincide con una lista de nombres. */
function elegirColumna(campos, candidatos) {
  const bajo = campos.map((c) => c.toLowerCase());
  for (const clave of candidatos) {
    const exacta = bajo.findIndex((c) => c === clave || c.endsWith(`.${clave}`));
    if (exacta >= 0) return exacta;
  }
  for (const clave of candidatos) {
    const parcial = bajo.findIndex((c) => c.includes(clave));
    if (parcial >= 0) return parcial;
  }
  return -1;
}

/** Convierte un valor de fecha (epoch ms, ISO o "YYYY-MM-DD ...") en clave de día. */
export function parseFecha(valor) {
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  if (/^\d{10}$/.test(texto)) return dayKey(new Date(Number(texto) * 1000));
  if (/^\d{12,14}$/.test(texto)) return dayKey(new Date(Number(texto)));

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const barras = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // d/m/aaaa
  if (barras) {
    const [, d, m, y] = barras;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : dayKey(fecha);
}

/**
 * Lee un CSV de pasos y devuelve los totales diarios.
 *
 * El export de Samsung Health trae varias filas por día (una por dispositivo o
 * app, más una agregada). Sumarlas contaría los pasos dos veces, así que se
 * toma el MÁXIMO de cada día, que es la fila agregada.
 *
 * @returns {{days: Array<{date:string, steps:number}>, rows:number, skipped:number, error?:string}}
 */
export function parseStepsCsv(text) {
  const vacio = { days: [], rows: 0, skipped: 0 };
  if (!text || !text.trim()) return { ...vacio, error: 'El archivo está vacío.' };

  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = findHeader(lines);
  if (!header) {
    return { ...vacio, error: 'No encontré columnas de fecha y de pasos. ¿Es el CSV de pasos del export?' };
  }

  const iFecha = elegirColumna(header.fields, COLUMNAS_FECHA);
  const iPasos = elegirColumna(header.fields, COLUMNAS_PASOS);
  if (iFecha < 0 || iPasos < 0) {
    return { ...vacio, error: 'El archivo no tiene una columna de fecha y otra de pasos.' };
  }

  const porDia = new Map();
  let rows = 0;
  let skipped = 0;
  for (let i = header.index + 1; i < lines.length; i++) {
    const linea = lines[i];
    if (!linea?.trim()) continue;
    const campos = splitCsvLine(linea);
    if (campos.length <= Math.max(iFecha, iPasos)) { skipped++; continue; }
    const fecha = parseFecha(campos[iFecha]);
    const pasos = Math.round(Number(campos[iPasos]));
    if (!fecha || !Number.isFinite(pasos) || pasos < 0) { skipped++; continue; }
    rows++;
    porDia.set(fecha, Math.max(porDia.get(fecha) || 0, pasos));
  }

  const days = [...porDia.entries()]
    .filter(([, steps]) => steps > 0)
    .map(([date, steps]) => ({ date, steps }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!days.length) return { ...vacio, rows, skipped, error: 'No había ningún día con pasos para importar.' };
  return { days, rows, skipped };
}

/** Compara lo importado con lo que ya está cargado, para avisar qué va a cambiar. */
export function diffSteps(days, entries, activityId = 'pasos') {
  let nuevos = 0;
  let cambiados = 0;
  let iguales = 0;
  for (const { date, steps } of days) {
    const actual = Number(entries?.[date]?.[activityId]?.value) || 0;
    if (!actual) nuevos++;
    else if (actual !== steps) cambiados++;
    else iguales++;
  }
  return { nuevos, cambiados, iguales, total: days.length };
}
