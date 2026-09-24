// Fuerza relativa: cuánto levantás en relación a tu propio peso.
// Módulo puro: sin DOM, sin storage.
import { estimatedOneRepMax } from './xp.js';

/**
 * Niveles de fuerza expresados como 1RM dividido el peso corporal.
 *
 * Son REFERENCIAS GENERALES (del tipo de las tablas de ExRx o Strength Level),
 * no ciencia exacta: varían con el peso corporal —a menor peso, mayor ratio
 * esperado— y con la técnica de cada uno. Sirven para ubicarte y para ver la
 * progresión, no para sacar conclusiones finas.
 *
 * Orden: principiante, novato, intermedio, avanzado, élite.
 */
export const NIVELES = ['Principiante', 'Novato', 'Intermedio', 'Avanzado', 'Élite'];

export const STANDARDS = {
  squat:   { name: 'Sentadilla',        m: [1.00, 1.25, 1.50, 2.25, 2.75], f: [0.50, 0.75, 1.15, 1.60, 2.00] },
  bench:   { name: 'Press de banca',    m: [0.75, 1.00, 1.25, 1.75, 2.00], f: [0.35, 0.50, 0.75, 1.00, 1.25] },
  incline: { name: 'Banca inclinada',   m: [0.65, 0.85, 1.05, 1.50, 1.75], f: [0.30, 0.45, 0.65, 0.85, 1.05] },
  ohp:     { name: 'Press militar',     m: [0.50, 0.65, 0.85, 1.10, 1.40], f: [0.30, 0.40, 0.55, 0.75, 0.95] },
  row:     { name: 'Remo con barra',    m: [0.50, 0.75, 1.00, 1.35, 1.75], f: [0.30, 0.45, 0.65, 0.90, 1.20] },
  // El peso muerto rumano se hace con menos carga que el convencional:
  // estas cifras son ~0,7× de los estándares de peso muerto.
  rdl:     { name: 'Peso muerto rumano', m: [0.90, 1.10, 1.40, 1.90, 2.30], f: [0.40, 0.65, 0.95, 1.30, 1.70] },
  // En dominadas la carga es tu peso corporal + el lastre, así que el ratio
  // arranca en 1,0 (una dominada estricta sin peso extra).
  pullup:  { name: 'Dominadas',         m: [0.85, 1.00, 1.20, 1.50, 1.80], f: [0.75, 0.90, 1.05, 1.25, 1.50], bodyweight: true },
};

/** Ejercicios de la rutina que tienen estándar conocido. */
export const EJERCICIO_A_LIFT = {
  'dominadas agarre ancho': 'pullup',
  'remo con barra al pecho': 'row',
  'press militar': 'ohp',
  'pecho plano': 'bench',
  'pecho inclinado': 'incline',
  'sentadilla con barra': 'squat',
  'peso muerto rumano': 'rdl',
};

export function liftDeEjercicio(nombre) {
  return EJERCICIO_A_LIFT[(nombre || '').trim().toLowerCase()] || null;
}

/** ¿La carga de este ejercicio incluye el peso corporal? */
export function usaPesoCorporal(liftKey) {
  return Boolean(STANDARDS[liftKey]?.bodyweight);
}

/**
 * Carga real de una serie: para ejercicios de peso corporal, el cuerpo cuenta.
 * @returns {number} kg movidos en esa serie
 */
export function cargaTotal({ weight = 0, bodyweight = 0, isBodyweight = false }) {
  const extra = Number(weight) || 0;
  return isBodyweight ? (Number(bodyweight) || 0) + extra : extra;
}

/** 1RM estimado de una serie, contando el peso corporal si corresponde. */
export function oneRepMax({ weight, reps, bodyweight = 0, isBodyweight = false }) {
  return estimatedOneRepMax(cargaTotal({ weight, bodyweight, isBodyweight }), reps);
}

/**
 * Ubica un ratio dentro de la escala de un ejercicio.
 * @returns {{index:number, name:string, next:?string, nextRatio:?number, pct:number}}
 */
export function nivelDeFuerza(liftKey, ratio, sexo = 'm') {
  const tabla = STANDARDS[liftKey]?.[sexo === 'f' ? 'f' : 'm'];
  if (!tabla || !(ratio > 0)) return null;

  let index = -1; // por debajo del primer umbral
  for (let i = 0; i < tabla.length; i++) if (ratio >= tabla[i]) index = i;

  const piso = index >= 0 ? tabla[index] : 0;
  const techo = index + 1 < tabla.length ? tabla[index + 1] : null;
  return {
    index,
    name: index >= 0 ? NIVELES[index] : 'Empezando',
    next: techo != null ? NIVELES[index + 1] : null,
    nextRatio: techo,
    pct: techo != null ? Math.min(1, Math.max(0, (ratio - piso) / (techo - piso))) : 1,
  };
}

/**
 * Perfil de fuerza a partir de los récords del gimnasio.
 * @param {Map|Array} records récords por ejercicio ({name, weight, reps, e1rm, load})
 * @param {number} bodyweight peso corporal en kg
 * @param {'m'|'f'} sexo tabla de referencia a usar
 * @returns {Array} un objeto por ejercicio con estándar conocido
 */
/**
 * Cuánto "vale" en barra el mismo peso total movido con mancuernas.
 *
 * Los estándares de arriba son de movimientos con barra. Con mancuernas el
 * mismo total es más difícil: cada brazo se estabiliza solo, el recorrido es
 * mayor y no hay una barra que reparta. La regla de dedo habitual es que el
 * total con mancuernas anda en 85-90% de lo que se mueve con barra, así que
 * para comparar hay que subirlo.
 *
 * Es una regla de dedo, no una constante medida: sirve para no castigar a
 * quien elige mancuernas, igual que las tablas sirven para ubicar y no para
 * decidir decimales. Se muestra en pantalla a propósito, para que el número
 * nunca sea un ajuste escondido.
 */
export const EQUIV_MANCUERNA = 1.15;

export function strengthProfile(records, bodyweight, sexo = 'm') {
  const lista = records instanceof Map ? [...records.values()] : (records || []);
  if (!(bodyweight > 0)) return [];

  const porLift = new Map();
  for (const r of lista) {
    const liftKey = liftDeEjercicio(r.name);
    if (!liftKey) continue;
    const e1rm = Number(r.e1rm) || 0;
    if (e1rm <= 0) continue;
    const previo = porLift.get(liftKey);
    if (!previo || e1rm > previo.e1rm) porLift.set(liftKey, { ...r, e1rm, liftKey });
  }

  return [...porLift.values()].map((r) => {
    // El récord queda como es: lo que de verdad levantaste. Lo que se convierte
    // es sólo la comparación contra la tabla, que está hecha con barra.
    // Se mira qué movimiento es, no cómo se anotó: un registro viejo hecho
    // con mancuernas sigue siendo con mancuernas aunque le falte la marca.
    const conversion = r.conMancuerna === true ? EQUIV_MANCUERNA : 1;
    const comparable = r.e1rm * conversion;
    const ratio = Math.round((comparable / bodyweight) * 100) / 100;
    const nivel = nivelDeFuerza(r.liftKey, ratio, sexo);
    // El objetivo vuelve a kilos reales: lo que te falta es lo que tenés que
    // sumarle a la mancuerna, no a una barra que no usás.
    const objetivo = nivel?.nextRatio != null
      ? Math.round(((nivel.nextRatio * bodyweight) / conversion) * 10) / 10
      : null;
    return {
      liftKey: r.liftKey,
      lift: STANDARDS[r.liftKey].name,
      exercise: r.name,
      e1rm: r.e1rm,
      weight: r.weight,
      reps: r.reps,
      date: r.date,
      bodyweight,
      db: r.db === true,
      conversion,                                // 1 en barra, EQUIV_MANCUERNA en mancuerna
      comparable: Math.round(comparable * 10) / 10,
      ratio,
      nivel,
      objetivo,                                  // kg de 1RM real para el próximo nivel
      falta: objetivo != null ? Math.round((objetivo - r.e1rm) * 10) / 10 : null,
      usaPesoCorporal: usaPesoCorporal(r.liftKey),
    };
  }).sort((a, b) => (b.nivel?.index ?? -1) - (a.nivel?.index ?? -1) || b.ratio - a.ratio);
}

/**
 * Bandas de fuerza general. Son las cinco de la escala más una previa, para
 * cuando todavía no llegaste al primer umbral en ningún movimiento.
 */
export const BANDAS_FUERZA = ['Empezando', ...NIVELES];

/**
 * Nivel general de fuerza: el promedio de la POSICIÓN de cada ejercicio en su
 * propia escala, no de los kilos ni de los ratios crudos.
 *
 * Promediar ratios sería engañoso: 1,5× el peso corporal es intermedio en
 * sentadilla y casi élite en press militar, así que los movimientos pesados
 * dominarían el promedio. Midiendo a cada uno contra su propio estándar, todos
 * pesan igual.
 *
 * @returns {{score:number, index:number, name:string, pct:number, lifts:number,
 *            next:?string, weakest:?object}|null}
 */
export function nivelGeneral(perfil) {
  const conNivel = (perfil || []).filter((p) => p.nivel);
  if (!conNivel.length) return null;

  // index va de -1 (por debajo del primer umbral) a 4 (élite).
  const score = conNivel.reduce((n, p) => n + p.nivel.index + p.nivel.pct, 0) / conNivel.length;
  const banda = Math.max(0, Math.min(BANDAS_FUERZA.length - 1, Math.floor(score) + 1));
  const dentro = score - Math.floor(score);

  // El movimiento más rezagado es el que frena el promedio.
  const weakest = [...conNivel].sort(
    (a, b) => (a.nivel.index + a.nivel.pct) - (b.nivel.index + b.nivel.pct),
  )[0];

  return {
    score,
    index: banda,
    level: banda + 1,               // 1 a 6, para mostrar como nivel
    name: BANDAS_FUERZA[banda],
    pct: banda >= BANDAS_FUERZA.length - 1 ? 1 : dentro,
    next: banda + 1 < BANDAS_FUERZA.length ? BANDAS_FUERZA[banda + 1] : null,
    lifts: conNivel.length,
    weakest,
  };
}
