/**
 * Dónde estás en cada disciplina y qué conviene mover.
 *
 * Todo sale de datos que ya están cargados: no hay estimaciones inventadas ni
 * consejos genéricos. Cuando no alcanza la información para decir algo, se
 * dice que no alcanza, que es más útil que un consejo falso.
 */
import { addDays, daysBetween } from './utils.js';
import { NIVELES } from './strength.js';

/** Días que mira la tendencia de cada lado de la comparación. */
export const VENTANA = 28;
/** Sin récord nuevo en tantos días, con el ejercicio todavía en la rutina. */
export const DIAS_PARA_ESTANCARSE = 35;
/** Y habiéndolo hecho al menos estas veces desde el último récord. */
export const SESIONES_PARA_ESTANCARSE = 3;

/**
 * Compara las últimas cuatro semanas con las cuatro anteriores.
 * @returns {?{antes:number, ahora:number, cambio:number, dir:string}}
 */
export function tendencia(historia, hoy) {
  if (!historia?.length) return null;
  const corte = addDays(hoy, -VENTANA);
  const inicio = addDays(hoy, -VENTANA * 2);
  let antes = 0;
  let ahora = 0;
  for (const h of historia) {
    if (h.date > corte) ahora += h.value;
    else if (h.date > inicio) antes += h.value;
  }
  if (antes === 0 && ahora === 0) return null;
  const cambio = antes === 0 ? 1 : (ahora - antes) / antes;
  return {
    antes,
    ahora,
    cambio,
    dir: cambio > 0.1 ? 'sube' : cambio < -0.1 ? 'baja' : 'estable',
  };
}

/**
 * Qué porcentaje de los días que tocaban cumpliste, en la ventana dada.
 * Mide constancia, que no es lo mismo que volumen: se puede entrenar mucho
 * en ráfagas y tener una constancia mala.
 */
export function constancia(historia, hoy, dias = VENTANA * 2) {
  if (!historia?.length) return null;
  const desde = addDays(hoy, -dias);
  const enVentana = historia.filter((h) => h.date > desde);
  if (!enVentana.length) return null;
  const cumplidos = enVentana.filter((h) => h.met).length;
  return { total: enVentana.length, cumplidos, pct: cumplidos / enVentana.length };
}

/**
 * Los saltos que tenés a mano, del más barato al más caro.
 *
 * Los kilos que faltan ya los calcula el perfil de fuerza; acá sólo se
 * ordenan y se nombra a qué categoría llevan. Recalcularlos sería tener dos
 * fuentes de verdad para el mismo número.
 */
export function proximosSaltos(perfil) {
  return (perfil || [])
    .filter((p) => p.nivel && Number.isFinite(p.falta) && p.falta > 0)
    .map((p) => ({
      lift: p.liftKey,
      nombre: p.lift,
      ejercicio: p.exercise,
      actual: p.e1rm,
      objetivo: p.objetivo,
      faltan: p.falta,
      // En los de peso corporal lo que falta es lastre, no barra.
      esPesoCorporal: p.usaPesoCorporal,
      nivelSiguiente: NIVELES[p.nivel.index + 1],
      posicion: p.nivel.index + p.nivel.pct,
    }))
    .sort((a, b) => a.faltan - b.faltan);
}

/**
 * Qué conviene empujar, medido en cuánto sube el nivel general por kilo.
 *
 * El salto más barato no es el que más rinde: un movimiento al que le falta
 * poco suele estar por terminar su banda, así que subirlo casi no mueve el
 * promedio. Uno más caro pero recién empezado mueve mucho más. Esto los
 * ordena por lo que importa: mejora por kilo de esfuerzo.
 */
export function mejorInversion(perfil) {
  const salidas = [];
  for (const salto of proximosSaltos(perfil)) {
    const impacto = impactoDeSubir(perfil, salto.lift);
    if (!impacto || impacto.delta <= 0) continue;
    salidas.push({ ...salto, delta: impacto.delta, rinde: impacto.delta / salto.faltan });
  }
  return salidas.sort((a, b) => b.rinde - a.rinde);
}

/**
 * Cuánto sube el nivel general si un movimiento llega a su próxima categoría.
 * Sirve para responder "¿en qué me conviene poner la energía?" con un número
 * en vez de una intuición.
 */
export function impactoDeSubir(perfil, lift) {
  const conNivel = (perfil || []).filter((p) => p.nivel);
  if (conNivel.length < 2) return null;
  const actual = conNivel.reduce((n, p) => n + p.nivel.index + p.nivel.pct, 0) / conNivel.length;
  const nuevo = conNivel.reduce((n, p) => {
    const pos = (p.liftKey || p.lift) === lift
      ? Math.min(NIVELES.length - 1, p.nivel.index + 1)
      : p.nivel.index + p.nivel.pct;
    return n + pos;
  }, 0) / conNivel.length;
  return { actual, nuevo, delta: nuevo - actual };
}

/**
 * Ejercicios que dejaron de progresar: los seguís haciendo pero el récord no
 * se mueve. Distinto de uno que abandonaste, que no es un problema sino una
 * decisión.
 */
export function estancados(gimnasio, hoy) {
  if (!gimnasio) return [];
  const salida = [];
  for (const [clave, record] of gimnasio.records || []) {
    const ultima = gimnasio.ultimaVez?.get(clave);
    if (!ultima || !record?.date) continue;
    // Si hace más de tres semanas que no lo hacés, no está estancado: no está.
    if (daysBetween(ultima, hoy) > 21) continue;
    const diasSinRecord = daysBetween(record.date, hoy);
    if (diasSinRecord < DIAS_PARA_ESTANCARSE) continue;
    const sesiones = gimnasio.sesionesDeEjercicio?.get(clave) || 0;
    if (sesiones < SESIONES_PARA_ESTANCARSE) continue;
    salida.push({ nombre: record.name, dias: diasSinRecord, sesiones, record });
  }
  return salida.sort((a, b) => b.dias - a.dias);
}

/**
 * A qué ritmo baja la grasa corporal y cuándo llegarías a la meta.
 * Se ajusta una recta por mínimos cuadrados sobre las mediciones recientes:
 * con dos puntos cualquier ruido parece una tendencia, así que hacen falta
 * al menos tres y un mes de diferencia.
 */
export function proyeccionGrasa(mediciones, meta, hoy) {
  const puntos = (mediciones || [])
    .filter((m) => Number.isFinite(m.pct) && m.date)
    .slice(-8);
  if (puntos.length < 3) return { estado: 'pocos-datos', faltan: 3 - puntos.length };

  const x = puntos.map((m) => daysBetween(puntos[0].date, m.date));
  const y = puntos.map((m) => m.pct);
  const n = puntos.length;
  if (x[n - 1] - x[0] < 21) return { estado: 'poco-tiempo', dias: x[n - 1] - x[0] };

  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0);
  const den = x.reduce((s, xi) => s + (xi - mx) ** 2, 0);
  if (den === 0) return { estado: 'poco-tiempo', dias: 0 };

  const pendiente = num / den;               // puntos de grasa por día
  const porSemana = pendiente * 7;
  const actual = y[n - 1];

  if (actual <= meta) return { estado: 'llegaste', actual, porSemana };
  if (pendiente >= -0.005) {
    // Menos de 0,035 puntos por semana es ruido de medición, no progreso.
    return { estado: 'plano', actual, porSemana, dias: x[n - 1] - x[0] };
  }
  const diasRestantes = (actual - meta) / -pendiente;
  if (diasRestantes > 365 * 2) return { estado: 'lejos', actual, porSemana };
  return {
    estado: 'en-camino',
    actual,
    porSemana,
    dias: Math.round(diasRestantes),
    fecha: addDays(hoy, Math.round(diasRestantes)),
  };
}

/**
 * Reparto entre las fuentes de una actividad múltiple (el francés: Duolingo y
 * el podcast). Apoyarse en una sola fuente deja un agujero: Duolingo casi no
 * entrena el oído, y el podcast casi no hace producir.
 */
export function repartoDeFuentes(activity, totales) {
  const fuentes = activity?.sources || [];
  if (fuentes.length < 2 || !totales) return null;
  const filas = fuentes.map((f) => ({
    id: f.id,
    nombre: f.name || f.id,
    cantidad: totales[f.id] || 0,
    minutos: (totales[f.id] || 0) * (Number(f.minutes) || 0),
  }));
  const total = filas.reduce((n, f) => n + f.minutos, 0);
  if (total === 0) return null;
  for (const f of filas) f.pct = f.minutos / total;
  filas.sort((a, b) => b.minutos - a.minutos);
  return { filas, total, desbalance: filas[0].pct - filas[filas.length - 1].pct };
}
