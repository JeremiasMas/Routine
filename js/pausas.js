/**
 * Días libres declarados.
 *
 * Los escudos cubren un despiste suelto, pero no un viaje ni una gripe: se
 * gastan los dos y la racha se corta igual. Un día declarado libre no suma ni
 * rompe nada — sale del cálculo como si no existiera.
 *
 * La diferencia con no hacer nada es la intención: una racha tiene sentido
 * como medida de constancia, y estar diez días con fiebre no es falta de
 * constancia. Lo que no hace es regalar XP: descansar no es entrenar.
 */

import { esFechaValida } from './utils.js';

/** Un tramo guardado: {desde, hasta, motivo}. Las fechas son inclusivas. */
export function normalizar(tramo) {
  if (!tramo?.desde) return null;
  const desde = String(tramo.desde);
  const hasta = String(tramo.hasta || tramo.desde);
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return null;
  // Si vienen al revés, se ordenan en vez de descartarlos.
  return {
    desde: desde <= hasta ? desde : hasta,
    hasta: desde <= hasta ? hasta : desde,
    motivo: String(tramo.motivo || '').slice(0, 60),
  };
}

/** Los tramos válidos, ordenados y sin los que no se entienden. */
export function tramos(lista) {
  return (lista || []).map(normalizar).filter(Boolean).sort((a, b) => a.desde.localeCompare(b.desde));
}

/** ¿Este día está declarado libre? */
export function esLibre(lista, fecha) {
  return tramos(lista).some((t) => fecha >= t.desde && fecha <= t.hasta);
}

/** El tramo que cubre un día, para poder decir por qué. */
export function tramoDe(lista, fecha) {
  return tramos(lista).find((t) => fecha >= t.desde && fecha <= t.hasta) || null;
}

/** Cuántos días cubre un tramo, contando los dos extremos. */
export function largo(tramo) {
  const t = normalizar(tramo);
  if (!t) return 0;
  const ms = Date.parse(`${t.hasta}T00:00:00Z`) - Date.parse(`${t.desde}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

/**
 * Agrega un tramo fusionando con los que se tocan, para que no queden
 * solapados ni pegados: dos tramos contiguos son un tramo.
 */
export function agregar(lista, nuevo) {
  const t = normalizar(nuevo);
  if (!t) return tramos(lista);
  const todos = [...tramos(lista), t];
  const salida = [];
  for (const actual of todos) {
    const ultimo = salida[salida.length - 1];
    const pegados = ultimo && diaSiguiente(ultimo.hasta) >= actual.desde;
    if (pegados) {
      ultimo.hasta = ultimo.hasta >= actual.hasta ? ultimo.hasta : actual.hasta;
      if (!ultimo.motivo && actual.motivo) ultimo.motivo = actual.motivo;
    } else {
      salida.push({ ...actual });
    }
  }
  return salida;
}

/** Saca el tramo que empieza en esa fecha. */
export function quitar(lista, desde) {
  return tramos(lista).filter((t) => t.desde !== desde);
}

function diaSiguiente(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
