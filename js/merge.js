/**
 * Fusión de dos copias de los datos.
 *
 * Desde que la app de Android tiene su propio almacenamiento, el historial
 * puede vivir en dos lugares a la vez. Importar reemplazando —que es lo que
 * hacía— convierte cualquier despiste en pérdida de datos: si cargaste algo
 * en la copia equivocada, al restaurar desaparece.
 *
 * Acá el historial se une en vez de pisarse. Para cada día y cada actividad
 * gana el registro modificado más tarde, que es lo único que se puede decidir
 * sin preguntar. La configuración no se toca: las metas, los días y los
 * ajustes quedan como están en este dispositivo.
 */

import { tramos, agregar } from './pausas.js';

/** Cuándo se tocó por última vez un registro. */
export function marcaDeTiempo(entry) {
  const t = entry?.updatedAt || entry?.importedAt;
  if (!t) return 0;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Une dos copias.
 * @param {object} local     lo que hay en este dispositivo
 * @param {object} entrante  lo que viene en el archivo
 * @returns {{entries: object, unlocked: object, actividadesNuevas: Array, resumen: object}}
 */
export function fusionar(local, entrante) {
  const entries = {};
  const resumen = {
    diasNuevos: 0,        // días que sólo estaban en el archivo
    registrosNuevos: 0,   // actividades que no teníamos ese día
    reemplazados: 0,      // las de acá eran más viejas
    conservados: 0,       // las de acá eran más nuevas y ganan
    sinCambios: 0,
  };

  const fechas = new Set([
    ...Object.keys(local?.entries || {}),
    ...Object.keys(entrante?.entries || {}),
  ]);

  for (const fecha of [...fechas].sort()) {
    const acá = local?.entries?.[fecha] || null;
    const allá = entrante?.entries?.[fecha] || null;
    if (!acá && allá) resumen.diasNuevos += 1;

    const ids = new Set([...Object.keys(acá || {}), ...Object.keys(allá || {})]);
    const dia = {};
    for (const id of ids) {
      const a = acá?.[id];
      const b = allá?.[id];
      if (a && !b) { dia[id] = a; resumen.conservados += 1; continue; }
      if (b && !a) { dia[id] = b; if (acá) resumen.registrosNuevos += 1; continue; }
      // Están los dos: gana el más nuevo. Si empatan, se queda el de acá,
      // porque cambiar algo por un idéntico no ayuda a nadie.
      if (iguales(a, b)) { dia[id] = a; resumen.sinCambios += 1; continue; }
      if (marcaDeTiempo(b) > marcaDeTiempo(a)) { dia[id] = b; resumen.reemplazados += 1; }
      else { dia[id] = a; resumen.conservados += 1; }
    }
    if (Object.keys(dia).length) entries[fecha] = dia;
  }

  // Los logros son acumulativos: se unen, y vale la fecha más temprana en que
  // se desbloqueó. Perder la fecha original sería falsear la historia.
  const unlocked = { ...(local?.unlocked || {}) };
  for (const [id, fecha] of Object.entries(entrante?.unlocked || {})) {
    if (!unlocked[id] || fecha < unlocked[id]) unlocked[id] = fecha;
  }

  // Si el archivo trae una actividad que acá no existe, hay que traerla:
  // sin ella sus registros quedarían huérfanos y no se verían en ningún lado.
  const idsLocales = new Set((local?.activities || []).map((a) => a.id));
  const actividadesNuevas = (entrante?.activities || []).filter((a) => a.id && !idsLocales.has(a.id));

  // Los días libres se unen: declararlos en un dispositivo y perderlos al
  // restaurar en el otro sería cortar una racha que ya estaba protegida.
  const pausas = fusionarPausas(local?.pausas, entrante?.pausas);
  resumen.pausasNuevas = pausas.length - (local?.pausas?.length || 0);

  resumen.actividadesNuevas = actividadesNuevas.length;
  resumen.total = resumen.diasNuevos + resumen.registrosNuevos + resumen.reemplazados;
  return { entries, unlocked, actividadesNuevas, pausas, resumen };
}

function iguales(a, b) {
  const limpiar = ({ updatedAt, importedAt, ...resto }) => JSON.stringify(orden(resto));
  try {
    return limpiar(a) === limpiar(b);
  } catch {
    return false;
  }
}

/** Ordena las claves para que dos objetos iguales den el mismo texto. */
function orden(v) {
  if (Array.isArray(v)) return v.map(orden);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, orden(v[k])]));
  }
  return v;
}

/** Une los tramos de días libres de las dos copias, fusionando lo que se toca. */
function fusionarPausas(aca, alla) {
  let salida = tramos(aca);
  for (const t of tramos(alla)) salida = agregar(salida, t);
  return salida;
}
