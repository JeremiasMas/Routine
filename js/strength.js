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
    const ratio = Math.round((r.e1rm / bodyweight) * 100) / 100;
    const nivel = nivelDeFuerza(r.liftKey, ratio, sexo);
    const objetivo = nivel?.nextRatio != null
      ? Math.round(nivel.nextRatio * bodyweight * 10) / 10
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
      ratio,
      nivel,
      objetivo,                                  // kg de 1RM para el próximo nivel
      falta: objetivo != null ? Math.round((objetivo - r.e1rm) * 10) / 10 : null,
      usaPesoCorporal: usaPesoCorporal(r.liftKey),
    };
  }).sort((a, b) => (b.nivel?.index ?? -1) - (a.nivel?.index ?? -1) || b.ratio - a.ratio);
}

/** Nivel general: el promedio de los ejercicios con estándar. */
export function nivelGeneral(perfil) {
  const conNivel = perfil.filter((p) => p.nivel);
  if (!conNivel.length) return null;
  const promedio = conNivel.reduce((n, p) => n + p.nivel.index + p.nivel.pct, 0) / conNivel.length;
  const index = Math.max(0, Math.min(NIVELES.length - 1, Math.floor(promedio)));
  return {
    name: promedio < 0 ? 'Empezando' : NIVELES[index],
    index,
    pct: promedio - Math.floor(promedio),
    next: index + 1 < NIVELES.length ? NIVELES[index + 1] : null,
    lifts: conNivel.length,
  };
}
