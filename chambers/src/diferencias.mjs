// Qué cambió entre dos corridas: altas, bajas y movimientos de banda.
//
// Sólo se comparan las tablas que están en las dos corridas. Si en una corrida
// no se bajó Chile, Chile no aparece como "baja": aparece como lo que es, algo
// que no se midió.

/**
 * @param {object} base
 * @param {number} corridaA la vieja
 * @param {number} corridaB la nueva
 * @returns {{altas:object[], bajas:object[], cambios:object[], tablas:number}}
 */
export function compararCorridas(base, corridaA, corridaB) {
  const comunes = `
    SELECT DISTINCT a.tabla_clave AS clave
    FROM ranking a JOIN ranking b ON b.tabla_clave = a.tabla_clave
    WHERE a.corrida_id = ?1 AND b.corrida_id = ?2`;

  const datos = `
    t.clave AS tabla, u.nombre AS pais, ar.nombre AS area, g.nombre AS guia,
    e.tipo AS tipo, e.nombre AS nombre, e.url AS perfil, t.url AS url_tabla`;

  const juntar = `
    JOIN tabla t ON t.clave = r.tabla_clave
    JOIN entidad e ON e.id = r.entidad_id
    LEFT JOIN ubicacion u ON u.id = t.ubicacion_id
    LEFT JOIN area ar ON ar.id = t.area_id
    LEFT JOIN guia g ON g.id = t.guia_id`;

  const altas = base.consultar(`
    SELECT ${datos}, r.seccion, r.banda AS banda
    FROM ranking r ${juntar}
    WHERE r.corrida_id = ?2 AND r.tabla_clave IN (${comunes})
      AND NOT EXISTS (
        SELECT 1 FROM ranking v WHERE v.corrida_id = ?1
          AND v.tabla_clave = r.tabla_clave AND v.entidad_id = r.entidad_id)
    ORDER BY pais, area, nombre`, corridaA, corridaB);

  const bajas = base.consultar(`
    SELECT ${datos}, r.seccion, r.banda AS banda
    FROM ranking r ${juntar}
    WHERE r.corrida_id = ?1 AND r.tabla_clave IN (${comunes})
      AND NOT EXISTS (
        SELECT 1 FROM ranking v WHERE v.corrida_id = ?2
          AND v.tabla_clave = r.tabla_clave AND v.entidad_id = r.entidad_id)
    ORDER BY pais, area, nombre`, corridaA, corridaB);

  const cambios = base.consultar(`
    SELECT ${datos}, vieja.seccion AS seccion,
           vieja.banda AS banda_antes, nueva.banda AS banda_despues,
           vieja.banda_orden AS orden_antes, nueva.banda_orden AS orden_despues,
           CASE
             WHEN nueva.banda_orden < vieja.banda_orden THEN 'sube'
             WHEN nueva.banda_orden > vieja.banda_orden THEN 'baja'
             ELSE 'lateral'
           END AS movimiento
    FROM ranking vieja
    JOIN ranking nueva ON nueva.tabla_clave = vieja.tabla_clave
      AND nueva.entidad_id = vieja.entidad_id AND nueva.corrida_id = ?2
    JOIN ranking r ON r.rowid = nueva.rowid
    ${juntar}
    WHERE vieja.corrida_id = ?1 AND vieja.banda <> nueva.banda
    ORDER BY pais, area, nombre`, corridaA, corridaB);

  const tablas = base.consultar(`SELECT COUNT(*) AS n FROM (${comunes})`, corridaA, corridaB)[0]?.n ?? 0;
  return { altas, bajas, cambios, tablas };
}

/** Resumen de una línea, para el log y para el cuerpo de un issue. */
export function resumirDiferencias({ altas, bajas, cambios, tablas }) {
  const sube = cambios.filter((c) => c.movimiento === 'sube').length;
  const baja = cambios.filter((c) => c.movimiento === 'baja').length;
  return `${tablas} tablas comparadas · ${altas.length} altas · ${bajas.length} bajas · ${cambios.length} cambios de banda (${sube} suben, ${baja} bajan)`;
}
