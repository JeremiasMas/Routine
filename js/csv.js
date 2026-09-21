/**
 * Exportación a CSV en formato largo.
 *
 * El JSON de la copia de seguridad está pensado para restaurar, no para leer:
 * anida sesiones de gimnasio, fuentes de francés y mediciones en estructuras
 * distintas. Esto lo aplana a una fila por día y actividad, que es la forma en
 * que cualquier herramienta de análisis espera recibir datos.
 */
import { esFechaValida } from './utils.js';

export const COLUMNAS = [
  'fecha', 'dia_semana', 'actividad', 'unidad', 'valor', 'meta',
  'cumplida', 'xp', 'tocaba', 'dia_libre',
];

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Escapa un campo. Sin esto, un motivo con una coma parte la fila en dos y el
 * archivo entero se corre de columna a partir de ahí.
 */
export function campo(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function filasACsv(filas, columnas = COLUMNAS) {
  const lineas = [columnas.join(',')];
  for (const f of filas) lineas.push(columnas.map((c) => campo(f[c])).join(','));
  // Con \r\n para que Excel no junte todo en una línea.
  return `${lineas.join('\r\n')}\r\n`;
}

/**
 * Una fila por día y actividad con registro. Los días sin nada no ocupan
 * espacio: en formato largo, la ausencia de fila ya dice que no hubo.
 */
export function filasDeHistorial(state, { libre = () => false } = {}) {
  const filas = [];
  for (const st of state.byActivity.values()) {
    const a = st.activity;
    for (const h of st.history || []) {
      if (!esFechaValida(h.date)) continue;
      filas.push({
        fecha: h.date,
        dia_semana: DIAS[new Date(`${h.date}T00:00:00Z`).getUTCDay()],
        actividad: a.id,
        unidad: a.unit || '',
        valor: redondear(h.value),
        meta: redondear(h.goal),
        cumplida: h.met ? 1 : 0,
        xp: redondear(h.xp),
        tocaba: h.goal > 0 ? 1 : 0,
        dia_libre: libre(h.date) ? 1 : 0,
      });
    }
  }
  return filas.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.actividad.localeCompare(y.actividad));
}

/** Las series del gimnasio, que no entran en una fila por día. */
export const COLUMNAS_GIMNASIO = [
  'fecha', 'ejercicio', 'serie', 'peso_kg', 'repeticiones', 'por_mancuerna', 'peso_corporal', 'e1rm_kg',
];

export function filasDeGimnasio(state) {
  const gym = [...state.byActivity.values()].find((s) => s.activity.kind === 'gym');
  const filas = [];
  for (const h of gym?.history || []) {
    const ejercicios = h.entry?.exercises || [];
    for (const ex of ejercicios) {
      (ex.sets || []).forEach((set, i) => {
        const reps = Number(set.reps) || 0;
        if (reps <= 0) return;
        const peso = Number(set.weight) || 0;
        filas.push({
          fecha: h.date,
          ejercicio: (ex.name || '').trim(),
          serie: i + 1,
          peso_kg: redondear(peso),
          repeticiones: reps,
          por_mancuerna: ex.db ? 1 : 0,
          peso_corporal: ex.bw ? 1 : 0,
          e1rm_kg: peso > 0 ? redondear(peso * (1 + reps / 30)) : '',
        });
      });
    }
  }
  return filas;
}

/** Las mediciones corporales, una fila por medición. */
export const COLUMNAS_CUERPO = ['fecha', 'peso_kg', 'cintura_cm', 'cuello_cm', 'cadera_cm'];

export function filasDeCuerpo(state) {
  const cuerpo = [...state.byActivity.values()].find((s) => s.activity.kind === 'body');
  return (cuerpo?.history || []).map((h) => ({
    fecha: h.date,
    peso_kg: redondear(h.entry?.weight),
    cintura_cm: redondear(h.entry?.waist),
    cuello_cm: redondear(h.entry?.neck),
    cadera_cm: redondear(h.entry?.hip),
  })).filter((f) => f.peso_kg !== '' || f.cintura_cm !== '');
}

function redondear(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Math.round(v * 100) / 100;
}
