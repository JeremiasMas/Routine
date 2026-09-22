/**
 * Qué te toca levantar hoy en cada ejercicio.
 *
 * Progresión doble: primero se suben las repeticiones dentro del rango y
 * recién cuando el rango está cerrado en todas las series sube la carga, que
 * vuelve al piso del rango. Es la regla que uno olvida entre una sesión y la
 * siguiente, y la razón por la que se pasan meses con el mismo peso.
 *
 * Módulo puro: entra lo que levantaste la vez pasada, sale un objetivo. No
 * inventa nada — sin sesión anterior no hay objetivo, y se dice así.
 */
import { RANGOS_REPS, DEFAULT_SETS, perfilDeEjercicio } from './config.js';
import { formatNumber } from './utils.js';

const redondear = (n) => Math.round(n * 10) / 10;

/**
 * El objetivo de hoy para un ejercicio.
 *
 * @param {Array<{weight:number, reps:number}>} previas series de la última vez
 * @param {object} perfil el de `perfilDeEjercicio`
 * @param {number} series cuántas series se planean hoy
 * @returns {?{peso:number, proximoPeso:number, reps:number[], sube:boolean,
 *             faltan:?number, rango:{min:number,max:number}}}
 */
export function objetivoDeHoy(previas, perfil, series = DEFAULT_SETS) {
  const hechas = (previas || [])
    .map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }))
    .filter((s) => s.reps > 0);
  if (!hechas.length) return null;

  const rango = RANGOS_REPS[perfil?.rango] || RANGOS_REPS.medio;
  const salto = Number(perfil?.salto) || 2.5;
  // El peso con el que terminaste: es el que tu cuerpo tiene más fresco y el
  // que la precarga ya venía usando.
  const peso = hechas[hechas.length - 1].weight;
  const proximoPeso = redondear(peso + salto);

  // En los de peso corporal la carga puede ser cero y aun así corresponder
  // subir: lo que sube es el lastre.
  const hayCarga = perfil?.bw ? peso >= 0 : peso > 0;
  const mismaCarga = hechas.every((s) => s.weight === peso);
  const completas = hechas.length >= series;
  const alTope = hechas.every((s) => s.reps >= rango.max);

  if (hayCarga && mismaCarga && completas && alTope) {
    return {
      peso: proximoPeso,
      pesoAnterior: peso,
      proximoPeso,
      reps: Array.from({ length: series }, () => rango.min),
      sube: true,
      faltan: 0,
      rango,
    };
  }

  // Una repetición más en cada serie, sin pasarse del tope. Las series que no
  // hiciste la vez pasada arrancan en el piso del rango.
  const reps = Array.from({ length: series }, (_, i) => {
    const previa = hechas[i]?.reps || 0;
    if (!previa) return rango.min;
    return Math.min(rango.max, Math.max(previa + 1, rango.min));
  });

  // Cuántas repeticiones te separan de subir de peso. Sólo tiene sentido
  // decirlo si todas las series fueron con la misma carga.
  const faltan = mismaCarga && hayCarga
    ? Array.from({ length: series }, (_, i) => Math.max(0, rango.max - (hechas[i]?.reps || 0)))
      .reduce((a, b) => a + b, 0)
    : null;

  return { peso, pesoAnterior: peso, proximoPeso, reps, sube: false, faltan, rango };
}

/** Lo mismo, pero buscando el perfil por nombre. */
export function objetivoPorNombre(nombre, previas, series = DEFAULT_SETS) {
  return objetivoDeHoy(previas, perfilDeEjercicio(nombre), series);
}

/**
 * El objetivo dicho en una línea, para mostrar arriba del ejercicio.
 * Devuelve null cuando no hay nada honesto que decir.
 */
export function textoDeObjetivo(objetivo, perfil) {
  if (!objetivo) return null;
  const cada = perfil?.db ? ' c/u' : '';
  const kg = (n) => `${formatNumber(redondear(n))} kg${cada}`;

  if (objetivo.sube) {
    return objetivo.pesoAnterior > 0
      ? `Hoy ${kg(objetivo.peso)} × ${objetivo.rango.min}: cerraste todas las series en ${objetivo.rango.max}.`
      : `Hoy sumale ${kg(objetivo.peso)} de lastre y volvé a ${objetivo.rango.min} repeticiones.`;
  }

  const plan = objetivo.reps.join('-');
  const base = objetivo.peso > 0
    ? `Hoy ${kg(objetivo.peso)} × ${plan}`
    : `Hoy ${plan} repeticiones`;
  if (objetivo.faltan === null) return `${base}.`;

  // Sólo se promete el salto si el plan de hoy de verdad cierra el rango.
  // Decir "a 7 repeticiones de subir" cuando el plan de hoy cierra 3 de esas
  // 7 es cierto y confuso a la vez.
  const cierra = objetivo.reps.every((r) => r >= objetivo.rango.max);
  if (!cierra) {
    return `${base}. Subís a ${kg(objetivo.proximoPeso)} cuando cierres las ${objetivo.reps.length} series en ${objetivo.rango.max}.`;
  }
  if (objetivo.faltan === 0) return `${base}. Con eso subís a ${kg(objetivo.proximoPeso)}.`;
  const r = objetivo.faltan === 1 ? 'repetición' : 'repeticiones';
  return `${base}. A ${objetivo.faltan} ${r} de subir a ${kg(objetivo.proximoPeso)}.`;
}
