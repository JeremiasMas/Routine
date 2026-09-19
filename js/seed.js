// Historial anterior a la app: lo que ya venías haciendo antes de instalarla.
//
// Se declara como tramos ("tantas veces por semana, estos días, desde tal
// fecha hasta tal otra") y se expande a registros reales al instalar. Así el
// progreso no arranca en cero ignorando meses de trabajo.
import { addDays, keyToDate } from './utils.js';

/**
 * Tramos de historial previo. Editá las fechas si alguna no coincide:
 * los registros se regeneran solos en una instalación nueva.
 */
export const HISTORIAL_PREVIO = [
  // Muay Thai: una clase por semana desde agosto de 2025…
  { activityId: 'muaythai', from: '2025-08-05', to: '2026-09-06', weekdays: [2], value: 90 },
  // …y dos por semana desde principios de septiembre de 2026.
  { activityId: 'muaythai', from: '2026-09-07', to: '2026-09-18', weekdays: [2, 4], value: 90 },
];

/**
 * Expande un tramo a las fechas concretas que le corresponden.
 * @param {{from:string, to:string, weekdays:number[]}} spec 0 = domingo
 * @returns {string[]} claves de día
 */
export function expandSchedule({ from, to, weekdays }) {
  if (!from || !to || !weekdays?.length) return [];
  const dates = [];
  let guard = 0;
  for (let d = from; d <= to && guard++ < 20000; d = addDays(d, 1)) {
    if (weekdays.includes(keyToDate(d).getDay())) dates.push(d);
  }
  return dates;
}

/**
 * Convierte los tramos en un objeto de registros, listo para el estado.
 * Marca cada uno con `seeded` para poder distinguirlos de lo que cargues vos.
 */
export function buildSeedEntries(specs = HISTORIAL_PREVIO) {
  const entries = {};
  for (const spec of specs) {
    for (const date of expandSchedule(spec)) {
      if (!entries[date]) entries[date] = {};
      entries[date][spec.activityId] = { value: spec.value, seeded: true };
    }
  }
  return entries;
}

/** Cuenta cuántos registros genera cada actividad (para informarlo). */
export function seedSummary(specs = HISTORIAL_PREVIO) {
  const porActividad = new Map();
  for (const spec of specs) {
    const n = expandSchedule(spec).length;
    const previo = porActividad.get(spec.activityId) || { sesiones: 0, desde: spec.from, hasta: spec.to };
    porActividad.set(spec.activityId, {
      sesiones: previo.sesiones + n,
      desde: previo.desde < spec.from ? previo.desde : spec.from,
      hasta: previo.hasta > spec.to ? previo.hasta : spec.to,
    });
  }
  return porActividad;
}
