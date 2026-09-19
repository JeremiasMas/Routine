// Composición corporal y meta de hidratación. Módulo puro: sin DOM, sin storage.

/**
 * Grasa corporal por el método de la Marina de EE.UU. (circunferencias, en cm).
 * Hay dos fórmulas: la de 3 medidas (cintura, cuello, estatura) y la de 4, que
 * agrega la cadera. Se elige en Ajustes; por defecto la de 3.
 * @param {{waist:number, neck:number, height:number, hip?:number, formula?:'3'|'4'}} m
 * @returns {number|null} porcentaje, o null si faltan datos o dan imposibles
 */
export function navyBodyFat({ waist, neck, height, hip, formula = '3' }) {
  const w = Number(waist) || 0;
  const n = Number(neck) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || n <= 0 || h <= 0) return null;

  let pct;
  if (formula === '4') {
    const hp = Number(hip) || 0;
    if (hp <= 0) return null;
    const suma = w + hp - n;
    if (suma <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * Math.log10(suma) + 0.22100 * Math.log10(h)) - 450;
  } else {
    const dif = w - n;
    if (dif <= 0) return null; // la cintura tiene que superar al cuello
    pct = 495 / (1.0324 - 0.19077 * Math.log10(dif) + 0.15456 * Math.log10(h)) - 450;
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 80) return null;
  return Math.round(pct * 10) / 10;
}

/** Índice de masa corporal. */
export function bmi(weightKg, heightCm) {
  const w = Number(weightKg) || 0;
  const h = (Number(heightCm) || 0) / 100;
  if (w <= 0 || h <= 0) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

/** Kilos de grasa y de masa magra a partir del porcentaje. */
export function massSplit(weightKg, bodyFatPct) {
  const w = Number(weightKg) || 0;
  if (w <= 0 || bodyFatPct == null) return null;
  const fat = Math.round(w * (bodyFatPct / 100) * 10) / 10;
  return { fat, lean: Math.round((w - fat) * 10) / 10 };
}

/** Mililitros de agua por día: 35 ml por kilo, redondeado a 50. */
export const ML_PER_KG = 35;
export function waterGoalMl(weightKg) {
  const w = Number(weightKg) || 0;
  if (w <= 0) return 2000;
  return Math.round((w * ML_PER_KG) / 50) * 50;
}

/** Resumen completo de una medición, listo para mostrar. */
export function bodySummary(entry, profile = {}) {
  const height = Number(entry?.height) || Number(profile.height) || 0;
  const weight = Number(entry?.weight) || 0;
  const fatPct = navyBodyFat({
    waist: entry?.waist, neck: entry?.neck, hip: entry?.hip,
    height, formula: profile.bodyFormula || '3',
  });
  return {
    height,
    weight,
    waist: Number(entry?.waist) || 0,
    neck: Number(entry?.neck) || 0,
    hip: Number(entry?.hip) || 0,
    fatPct,
    bmi: bmi(weight, height),
    mass: massSplit(weight, fatPct),
    waterGoal: waterGoalMl(weight),
  };
}

/**
 * Rangos de grasa corporal. El nombre describe el porcentaje, y la escalera
 * TERMINA en la meta: no premia seguir bajando indefinidamente, porque por
 * debajo de ahí ya no es salud sino preparación de competencia.
 * Cada banda aplica cuando el porcentaje es menor que `max`.
 */
export const BODY_FAT_BANDS = {
  m: [
    { max: Infinity, name: 'Punto de partida', color: '#94a3b8' },
    { max: 25, name: 'En progreso', color: '#4ade80' },
    { max: 20, name: 'Saludable', color: '#38bdf8' },
    { max: 17, name: 'Atlético', color: '#a78bfa' },
    { max: 15, name: 'Definido', color: '#fbbf24' },
    { max: 13, name: 'Marcado', color: '#fb7185' },
  ],
  f: [
    { max: Infinity, name: 'Punto de partida', color: '#94a3b8' },
    { max: 38, name: 'En progreso', color: '#4ade80' },
    { max: 32, name: 'Saludable', color: '#38bdf8' },
    { max: 28, name: 'Atlética', color: '#a78bfa' },
    { max: 25, name: 'Definida', color: '#fbbf24' },
    { max: 22, name: 'Marcada', color: '#fb7185' },
  ],
};

/**
 * Ubica un porcentaje de grasa en su banda.
 * @returns {{index:number, name:string, color:string, next:?object, pct:number}|null}
 */
export function bodyFatBand(fatPct, sexo = 'm') {
  const bandas = BODY_FAT_BANDS[sexo === 'f' ? 'f' : 'm'];
  if (!(fatPct > 0)) return null;

  // La banda más exigente cuyo techo todavía supera al porcentaje.
  let index = 0;
  for (let i = 0; i < bandas.length; i++) if (fatPct < bandas[i].max) index = i;

  const actual = bandas[index];
  const siguiente = bandas[index + 1] || null;
  // Progreso dentro de la banda: cuánto falta para bajar a la siguiente.
  const techo = Number.isFinite(actual.max) ? actual.max : fatPct + 5;
  const piso = siguiente ? siguiente.max : techo;
  const pct = techo > piso ? Math.min(1, Math.max(0, (techo - fatPct) / (techo - piso))) : 1;

  return {
    index,
    level: index + 1,
    name: actual.name,
    color: actual.color,
    max: actual.max,
    next: siguiente ? { name: siguiente.name, max: siguiente.max, index: index + 1 } : null,
    pct,
    falta: siguiente ? Math.round((fatPct - siguiente.max) * 10) / 10 : 0,
  };
}

/** Diferencia entre dos mediciones, para mostrar la tendencia. */
export function bodyDelta(actual, previa) {
  if (!actual || !previa) return null;
  const dif = (a, b) => (a != null && b != null ? Math.round((a - b) * 10) / 10 : null);
  return {
    fatPct: dif(actual.fatPct, previa.fatPct),
    weight: dif(actual.weight, previa.weight),
    waist: dif(actual.waist, previa.waist),
    lean: dif(actual.mass?.lean, previa.mass?.lean),
  };
}
