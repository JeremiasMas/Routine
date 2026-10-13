/**
 * El pronóstico de Open-Meteo para Buenos Aires.
 *
 * Open-Meteo no pide clave ni cuenta, y deja pedirlo desde el navegador. Las
 * horas vienen en hora de Buenos Aires ("2026-10-13T08:00", sin huso), así que
 * se comparan como texto y no hace falta convertir nada.
 *
 * El widget de Android pide exactamente esta misma URL (Clima.kt).
 */

export const LUGAR = { nombre: 'Buenos Aires', lat: -34.6037, lon: -58.3816 };
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

const num = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

/** La respuesta cruda de Open-Meteo → una lista de horas fáciles de mirar. */
export function horasDe(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const salida = [];
  h.time.forEach((t, i) => {
    const temp = h.temperature_2m?.[i];
    if (typeof temp !== 'number' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return;
    salida.push({
      t,
      fecha: t.slice(0, 10),
      hora: Number(t.slice(11, 13)),
      temp,
      hum: num(h.relative_humidity_2m?.[i], 60),
      aparente: num(h.apparent_temperature?.[i], temp),
      prob: num(h.precipitation_probability?.[i]),
      lluvia: num(h.precipitation?.[i]),
      codigo: num(h.weather_code?.[i]),
      viento: num(h.wind_speed_10m?.[i]),
      rafagas: num(h.wind_gusts_10m?.[i]),
      uv: num(h.uv_index?.[i]),
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

/** Baja el pronóstico y lo guarda. Si falla, devuelve el último que había. */
export async function traer({ fetch: f = globalThis.fetch, almacen = globalThis.localStorage } = {}) {
  try {
    const res = await f(URL_PRONOSTICO);
    if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
    const json = await res.json();
    if (!horasDe(json).length) throw new Error('El pronóstico vino vacío');
    const registro = { json, bajado: Date.now() };
    try { almacen?.setItem(CLAVE, JSON.stringify(registro)); } catch { /* sin lugar: no importa */ }
    return { ...registro, fresco: true };
  } catch (error) {
    const viejo = guardado(almacen);
    if (viejo) return { ...viejo, fresco: false, error };
    throw error;
  }
}
