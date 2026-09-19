// Matemática de XP, niveles y rachas. Módulo puro: sin DOM, sin storage.
import { TIERS, PLAYER_TITLES } from './config.js';

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

/** XP necesaria para pasar del nivel `level` al siguiente. */
export function xpToNextLevel(level) {
  return Math.round((100 * Math.pow(level, 1.2)) / 5) * 5;
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

export function tierFor(level) {
  let tier = TIERS[0];
  for (const t of TIERS) if (level >= t.min) tier = t;
  return tier;
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

/** Mejor serie de un ejercicio, estimada con Epley (1RM). */
export function estimatedOneRepMax(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}
