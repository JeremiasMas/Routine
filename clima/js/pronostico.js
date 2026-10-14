/**
 * El pronóstico de Open-Meteo para Belgrano.
 *
 * Open-Meteo no pide clave ni cuenta, y deja pedirlo desde el navegador. Las
 * horas vienen en hora de Buenos Aires ("2026-10-13T08:00", sin huso), así que
 * se comparan como texto y no hace falta convertir nada.
 *
 * Para la lluvia pide además lo que dicen tres modelos (URL_MODELOS) y se
 * queda con el del medio: un modelo solo avisa lluvia que no llega. Si esa
 * consulta falla, usa la de siempre.
 *
 * El widget de Android pide exactamente estas mismas URL (Clima.kt).
 */

import { consenso, MODELOS_LLUVIA } from './logica.js';

export const LUGAR = { nombre: 'Belgrano', lat: -34.5627, lon: -58.4566 };
export const ZONA = 'America/Argentina/Buenos_Aires';

const CAMPOS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation_probability', 'precipitation', 'weather_code',
  'wind_speed_10m', 'wind_gusts_10m', 'uv_index',
];

export const URL_PRONOSTICO = 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${LUGAR.lat}&longitude=${LUGAR.lon}`
  + `&hourly=${CAMPOS.join(',')}`
  + '&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=4&wind_speed_unit=kmh';

/** La misma, con cada modelo aparte: los campos vienen con sufijo ("_best_match"). */
export const URL_MODELOS = `${URL_PRONOSTICO}&models=best_match,${MODELOS_LLUVIA.join(',')}`;

const num = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

/** La respuesta cruda de Open-Meteo → una lista de horas fáciles de mirar. */
export function horasDe(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  // Con varios modelos, lo de siempre viene como "temperature_2m_best_match".
  const campo = (nombre, i) => (h[nombre] ?? h[`${nombre}_best_match`])?.[i];
  const salida = [];
  h.time.forEach((t, i) => {
    const temp = campo('temperature_2m', i);
    if (typeof temp !== 'number' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return;
    const { prob, lluvia } = consenso(num(campo('precipitation_probability', i)), num(campo('precipitation', i)),
      MODELOS_LLUVIA.map((m) => h[`precipitation_${m}`]?.[i]));
    salida.push({
      t,
      fecha: t.slice(0, 10),
      hora: Number(t.slice(11, 13)),
      temp,
      hum: num(campo('relative_humidity_2m', i), 60),
      aparente: num(campo('apparent_temperature', i), temp),
      prob,
      lluvia,
      codigo: num(campo('weather_code', i)),
      viento: num(campo('wind_speed_10m', i)),
      rafagas: num(campo('wind_gusts_10m', i)),
      uv: num(campo('uv_index', i)),
    });
  });
  return salida;
}

/** Fecha y minutos de ahora en Buenos Aires, esté donde esté el teléfono. */
export function ahoraEnBA(d = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

/** Qué es cada código WMO, en palabras. */
export function descripcion(codigo) {
  if (codigo === 0) return 'Despejado';
  if (codigo <= 2) return 'Algo nublado';
  if (codigo === 3) return 'Nublado';
  if (codigo <= 48) return 'Niebla';
  if (codigo <= 57) return 'Llovizna';
  if (codigo <= 67) return 'Lluvia';
  if (codigo <= 77) return 'Nieve';
  if (codigo <= 82) return 'Chaparrones';
  if (codigo <= 86) return 'Nieve';
  return 'Tormenta';
}

const CLAVE = 'clima.pronostico';

/** El último pronóstico que se bajó, para abrir sin conexión. */
export function guardado(almacen = globalThis.localStorage) {
  try {
    const crudo = almacen?.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

/** Baja una URL; falla si no vino un pronóstico que sirva. */
async function bajar(f, url) {
  const res = await f(url);
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  const json = await res.json();
  if (!horasDe(json).length) throw new Error('El pronóstico vino vacío');
  return json;
}

/**
 * Baja el pronóstico (con los modelos y, si eso falla, el de siempre) y lo
 * guarda. Si no hay ninguno, devuelve el último que había.
 */
export async function traer({ fetch: f = globalThis.fetch, almacen = globalThis.localStorage } = {}) {
  try {
    const json = await bajar(f, URL_MODELOS).catch(() => bajar(f, URL_PRONOSTICO));
    const registro = { json, bajado: Date.now() };
    try { almacen?.setItem(CLAVE, JSON.stringify(registro)); } catch { /* sin lugar: no importa */ }
    return { ...registro, fresco: true };
  } catch (error) {
    const viejo = guardado(almacen);
    if (viejo) return { ...viejo, fresco: false, error };
    throw error;
  }
}
