/**
 * Semanas de descarga.
 *
 * La progresión doble dice qué hacer de una sesión a la siguiente, pero no qué
 * hacer a lo largo de los meses. Si uno sólo suma, la fatiga se acumula más
 * rápido de lo que se nota y un día deja de poder sumar una repetición: eso no
 * es haber llegado al techo, es no haber bajado nunca.
 *
 * Una descarga es una semana con los MISMOS pesos y la mitad de las series.
 * Se baja el volumen y no la carga a propósito: bajar el peso hace perder el
 * hábito del movimiento pesado y cuesta volver; bajar las series saca la
 * fatiga y deja la fuerza intacta.
 *
 * Acá vive sólo la cuenta. Lo que la hace valer es que derive le pida la meta
 * a este módulo: sin eso, una semana bien hecha aparecería como tres días
 * incompletos y la app terminaría empujando a hacer series de más, que es
 * exactamente lo contrario de una descarga.
 */

import { weekStart, esFechaValida } from './utils.js';

/** Cada cuántas semanas de trabajo conviene una de descarga. */
export const CADA_CUANTAS_SEMANAS = 5;

/** Qué parte del volumen se hace en una descarga. */
export const PARTE_DEL_VOLUMEN = 0.5;

/**
 * Las semanas declaradas como descarga, normalizadas al lunes y sin repetidas.
 * Se guarda el lunes y no el día suelto: la descarga es de la semana entera,
 * y declararla un miércoles tiene que cubrir también el lunes que ya pasó.
 */
export function semanas(crudo) {
  const salida = new Set();
  for (const x of Array.isArray(crudo) ? crudo : []) {
    const fecha = typeof x === 'string' ? x : x?.semana;
    if (!esFechaValida(fecha)) continue;
    salida.add(weekStart(fecha));
  }
  return [...salida].sort();
}

/** Si esa fecha cae en una semana declarada de descarga. */
export function esDescarga(crudo, fecha) {
  if (!esFechaValida(fecha)) return false;
  return semanas(crudo).includes(weekStart(fecha));
}

/**
 * La meta de una sesión en una semana de descarga: la mitad, redondeada para
 * arriba. Para arriba porque con 35 series la mitad exacta es 17,5 y pedir 17
 * sería pedir menos de la mitad; y porque una serie de más no arruina una
 * descarga, pero una meta imposible de igualar sí la arruinaría.
 */
export function metaDeDescarga(metaNormal) {
  const n = Number(metaNormal) || 0;
  if (n <= 0) return 0;
  return Math.max(1, Math.ceil(n * PARTE_DEL_VOLUMEN));
}

/**
 * Si conviene descargar, y por qué.
 *
 * Dos motivos, y el segundo pesa más que el primero. El calendario es un
 * andamio para no tener que pensarlo; el estancamiento es la señal de verdad.
 *
 * @param {Array<string>} semanasEntrenadas lunes de cada semana con sesión
 * @param {Array<string>} declaradas        las descargas ya declaradas
 * @param {string} hoy
 * @param {{estancados?: Array<string>}} ctx ejercicios que no suben hace dos
 *   sesiones seguidas
 * @returns {?{motivo:'calendario'|'estancamiento', semanas:number,
 *             ejercicios?:Array<string>}}
 */
export function tocaDescarga(semanasEntrenadas, declaradas, hoy, { estancados = [] } = {}) {
  if (!esFechaValida(hoy)) return null;
  const estaSemana = weekStart(hoy);
  // En una semana que ya es de descarga no se recomienda descargar.
  if (esDescarga(declaradas, hoy)) return null;

  if (estancados.length >= 2) {
    return { motivo: 'estancamiento', semanas: 0, ejercicios: [...estancados] };
  }

  const entrenadas = [...new Set((semanasEntrenadas || []).filter(esFechaValida).map(weekStart))]
    .sort();
  if (!entrenadas.length) return null;
  const ultima = semanas(declaradas).filter((s) => s < estaSemana).pop();
  // Desde la última descarga, o desde que empezaste si nunca hubo una.
  const desde = ultima || entrenadas[0];
  const seguidas = entrenadas.filter((s) => s > desde || (!ultima && s >= desde)).length;
  if (seguidas < CADA_CUANTAS_SEMANAS) return null;
  return { motivo: 'calendario', semanas: seguidas };
}

/**
 * Qué le toca a un ejercicio esta sesión, para poder pintarlo de un color.
 *
 * Sale del objetivo que ya calcula progresion.js; lo único que agrega es el
 * caso de la descarga, que no depende del ejercicio sino de la semana.
 *
 * @returns {'descarga'|'peso'|'reps'|'mantener'}
 */
export function queTocaHoy(objetivo, { descarga = false } = {}) {
  if (descarga) return 'descarga';
  if (!objetivo) return 'mantener';
  if (objetivo.sube) return 'peso';
  return 'reps';
}

/** Cómo se llama y de qué color va cada estado. */
export const ESTADOS = {
  peso: { nombre: 'Subí el peso', color: '#fbbf24' },
  reps: { nombre: 'Sumá repeticiones', color: '#38bdf8' },
  mantener: { nombre: 'Mantené', color: '#94a3b8' },
  descarga: { nombre: 'Descarga', color: '#a78bfa' },
};

/**
 * Ejercicios que no suben hace dos sesiones seguidas.
 *
 * El estancamiento es la señal de verdad, más que el calendario: querer sumar
 * una repetición y no poder, dos veces seguidas, es fatiga acumulada y no el
 * techo. Se mira el mejor esfuerzo de cada sesión —carga por repeticiones— y
 * no sólo el peso: tres series de 60×10 progresaron respecto de 60×9 aunque el
 * peso sea el mismo.
 *
 * @param {Array<{date:string, entry:object}>} historial de más viejo a más nuevo
 * @param {number} sesiones cuántas de las últimas mirar
 * @returns {Array<string>} nombres, como se escriben en la plantilla
 */
export function estancados(historial, sesiones = 3) {
  const porEjercicio = new Map();
  for (const h of historial || []) {
    for (const ex of h.entry?.exercises || []) {
      const nombre = (ex.name || '').trim();
      if (!nombre) continue;
      // El mejor esfuerzo del día: la serie que más carga movió.
      let mejor = 0;
      for (const s of ex.sets || []) {
        const reps = Number(s.reps) || 0;
        if (reps <= 0) continue;
        mejor = Math.max(mejor, (Number(s.weight) || 0) * reps);
      }
      if (mejor <= 0) continue;
      const serie = porEjercicio.get(nombre) || [];
      serie.push(mejor);
      porEjercicio.set(nombre, serie);
    }
  }

  const salida = [];
  for (const [nombre, serie] of porEjercicio) {
    const ultimas = serie.slice(-sesiones);
    // Hacen falta al menos tres para ver dos sesiones sin mejorar.
    if (ultimas.length < 3) continue;
    const mejoro = ultimas.slice(1).some((v, i) => v > ultimas[i]);
    if (!mejoro) salida.push(nombre);
  }
  return salida;
}
