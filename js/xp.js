// Matemática de XP, niveles y rachas. Módulo puro: sin DOM, sin storage.
import { TIERS, PLAYER_TITLES, DEFAULT_TIER_NAMES } from './config.js';

/**
 * XP base de un registro. La meta de CADA actividad vale 100 XP, así el
 * progreso es relativo a la disciplina y no a la unidad que usa.
 * Pasarse de la meta suma, pero con rendimiento decreciente (tope 160).
 */
export function baseXp(value, goal) {
  if (!(value > 0) || !(goal > 0)) return 0;
  const ratio = value / goal;
  let xp = Math.min(ratio, 1) * 100;
  if (ratio > 1) xp += Math.min(ratio - 1, 1) * 40;   // hasta +40 por duplicar
  if (ratio > 2) xp += Math.min(ratio - 2, 2) * 10;   // hasta +20 extra
  return Math.round(xp);
}

/** Multiplicador por racha: +2% por día, tope +50%. */
export function streakMultiplier(streak) {
  return 1 + Math.min(Math.max(streak, 0) * 0.02, 0.5);
}

/** XP final de un registro, ya con el bonus de racha aplicado. */
export function entryXp(value, goal, streak = 0) {
  return Math.round(baseXp(value, goal) * streakMultiplier(streak));
}

/**
 * XP para pasar del nivel `level` al siguiente.
 *
 * La curva es lineal a propósito: con el exponente anterior (1,2) el último
 * rango quedaba a casi siete años de cumplir la meta todos los días, o sea que
 * la mitad de la escalera era decorativa. Así, cumpliendo a diario, el nivel 20
 * cae a los ~6 meses, el 35 al año y medio y el 50 a los ~3 años y medio.
 */
export function xpToNextLevel(level) {
  return 100 * Math.max(1, Math.round(level));
}

/** XP necesaria para subir de nivel de jugador (curva más lenta). */
export function xpToNextPlayerLevel(level) {
  return Math.round((250 * Math.pow(level, 1.3)) / 10) * 10;
}

/**
 * Convierte XP acumulada en nivel + progreso dentro del nivel.
 * @returns {{level:number, into:number, need:number, pct:number, total:number}}
 */
export function levelFromXp(totalXp, curve = xpToNextLevel) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  let need = curve(level);
  let guard = 0;
  while (remaining >= need && guard++ < 10000) {
    remaining -= need;
    level += 1;
    need = curve(level);
  }
  return {
    level,
    into: remaining,
    need,
    pct: need > 0 ? remaining / need : 0,
    total: Math.max(0, Math.floor(totalXp)),
  };
}

export function playerLevelFromXp(totalXp) {
  return levelFromXp(totalXp, xpToNextPlayerLevel);
}

/**
 * Rango de un nivel. Cada actividad puede traer sus propios nombres
 * (`tierNames`); los umbrales y los colores son siempre los mismos.
 * @param {number} level
 * @param {string[]} [names] nombres temáticos de la actividad
 */
export function tierFor(level, names = null) {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) if (level >= TIERS[i].min) index = i;
  const lista = names?.length === TIERS.length ? names : DEFAULT_TIER_NAMES;
  return { ...TIERS[index], index, name: lista[index] };
}

/** El rango siguiente y en qué nivel se alcanza, o null si ya es el último. */
export function nextTierFor(level, names = null) {
  const actual = tierFor(level, names);
  const siguiente = TIERS[actual.index + 1];
  if (!siguiente) return null;
  const lista = names?.length === TIERS.length ? names : DEFAULT_TIER_NAMES;
  return { ...siguiente, index: actual.index + 1, name: lista[actual.index + 1] };
}

export function playerTitleFor(level) {
  let title = PLAYER_TITLES[0];
  for (const t of PLAYER_TITLES) if (level >= t.min) title = t;
  return title;
}

/** Tonelaje de una sesión de gimnasio: suma de peso × reps de cada serie. */
export function gymVolume(exercises = []) {
  let volume = 0;
  for (const ex of exercises) {
    for (const set of ex.sets || []) {
      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      volume += weight * reps;
    }
  }
  return Math.round(volume);
}

/**
 * Repeticiones por encima de las cuales el 1RM estimado deja de ser confiable.
 * A 5 reps las fórmulas usuales coinciden dentro de ±4 kg; a 15 discrepan ±28,
 * así que una serie larga no sirve para medir fuerza por más que sea buen
 * entrenamiento.
 */
export const REPS_FIABLES = 12;

/** A 8 reps o menos la estimación es sólida: sirve para calibrar. */
export const REPS_CALIBRACION = 8;

/** Qué tan confiable es el 1RM estimado a partir de una serie. */
export function confianzaDe(reps) {
  const r = Number(reps) || 0;
  if (r <= 0) return 'ninguna';
  if (r <= REPS_CALIBRACION) return 'alta';
  if (r <= REPS_FIABLES) return 'media';
  return 'baja';
}

export function esSerieFiable(reps) {
  const r = Number(reps) || 0;
  return r > 0 && r <= REPS_FIABLES;
}

/**
 * 1RM estimado: promedio de las cuatro fórmulas usuales (Epley, Brzycki,
 * Lombardi y Wathen). Ninguna es la verdad, pero el promedio no hereda el
 * sesgo de ninguna en particular, sobre todo cuando se separan entre sí.
 */
export function estimatedOneRepMax(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  const epley = w * (1 + r / 30);
  const brzycki = r < 37 ? (w * 36) / (37 - r) : epley;
  const lombardi = w * Math.pow(r, 0.10);
  const wathen = (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r));
  const promedio = (epley + brzycki + lombardi + wathen) / 4;
  return Math.round(promedio * 10) / 10;
}
