// Reconstruir una sesión de gimnasio a medio cargar.
//
// Módulo puro: entra la rutina del día y lo que quedó guardado, sale la
// rutina con lo hecho adentro. Sin DOM y sin storage.

/**
 * Lo ya registrado, pero dentro de la rutina del día.
 *
 * Del registro sólo se guardan las series con repeticiones, así que una
 * sesión a medio cargar vuelve del disco como una rutina recortada: los
 * ejercicios que todavía no tocaste no están, y las series que te faltan de
 * los que sí tampoco. Si en ese estado se recarga la app —y una sesión dura
 * tres cuartos de hora con el teléfono en el bolsillo— al reabrir el
 * registro aparecía sólo lo hecho, y el resto había que escribirlo a mano.
 *
 * Acá la plantilla vuelve a ser el esqueleto y lo guardado se acomoda
 * adentro: cada ejercicio con sus series hechas primero y las que faltan
 * vacías detrás, en el orden de la rutina. Lo que agregaste por fuera se
 * conserva al final, que para eso lo agregaste.
 *
 * El nombre es la clave, sin distinguir mayúsculas ni espacios de más: es lo
 * único que comparten la plantilla y el registro guardado.
 *
 * @param {Array<{name:string, sets:Array}>} plantilla filas ya armadas, con sus series vacías
 * @param {Array<{name:string, sets:Array}>} guardado lo que hay en el registro
 * @returns {Array} la plantilla con lo guardado adentro
 */
export function mezclarSesion(plantilla = [], guardado = []) {
  const clave = (n) => (n || '').trim().toLowerCase();
  const guardadas = new Map();
  for (const ex of guardado) {
    const k = clave(ex?.name);
    if (k) guardadas.set(k, ex);
  }

  const usadas = new Set();
  const filas = plantilla.map((fila) => {
    const k = clave(fila?.name);
    const hecho = guardadas.get(k);
    if (!hecho) return fila;
    usadas.add(k);
    const hechas = (hecho.sets || []).map((s) => ({ ...s }));
    // Las series que faltan salen de la precarga, no de la nada: el peso ya
    // puesto es la mitad del trabajo de anotar.
    const faltan = (fila.sets || []).slice(hechas.length);
    return {
      ...fila,
      // Cómo se anotó el número manda sobre lo que diga la plantilla: un
      // registro viejo puede traer el total donde hoy se anota una mancuerna.
      bw: hecho.bw ?? fila.bw,
      db: hecho.db ?? fila.db,
      sets: [...hechas, ...faltan],
    };
  });

  for (const [k, ex] of guardadas) {
    if (usadas.has(k)) continue;
    filas.push({ ...ex, sets: (ex.sets || []).map((s) => ({ ...s })) });
  }
  return filas;
}
