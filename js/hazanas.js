/**
 * Las cuentas que sólo hacen falta para los logros.
 *
 * Viven aparte de derive.js porque son una pasada más sobre datos que ya
 * están calculados, y porque son muchas: meterlas ahí adentro convertía la
 * función principal en algo imposible de leer.
 *
 * Todas miran hacia atrás sobre el historial completo. Ninguna guarda estado
 * propio: lo que se desbloqueó una vez se vuelve a desbloquear al recalcular,
 * que es lo que hace que importar una copia vieja no te robe nada.
 */
import { addDays, daysBetween, weekStart } from './utils.js';
import { GRUPOS, perfilDeEjercicio } from './config.js';
import { esLibre } from './pausas.js';
import { bodySummary } from './body.js';
import { EJERCICIO_A_LIFT } from './strength.js';

/** Los tres movimientos con los que se mide una sentadilla, un empuje y un press. */
export const TRES_GRANDES = ['squat', 'bench', 'ohp'];

/** Sin récord nuevo en tantos días, un ejercicio que seguís haciendo está trabado. */
export const DIAS_DE_SEQUIA = 35;

/** Cuántos días mira la recomposición: dos meses es lo mínimo para verla. */
export const VENTANA_RECOMP = 56;

/**
 * @param {object} ctx  lo ya calculado por derive
 * @returns {object} campos sueltos para el resumen de logros
 */
export function hazanas(ctx) {
  const { byActivity, daily, dates, today, strength, data, bodyFat } = ctx;
  const gym = byActivity.get('gym');
  const peso = Number(data?.settings?.weight) || 0;

  return {
    ...rachasFinas(daily, dates, today, data),
    ...deFuerza(strength, gym, peso, today),
    ...delGimnasio(gym, today),
    ...delCuerpo(byActivity, bodyFat, gym, today, data?.settings),
    ...deCalendario(daily, byActivity, dates, today),
    minutosTotales: minutosTotales(byActivity),
    francesTier: byActivity.get('frances')?.tier?.index ?? 0,
    trimestreInvicto: semanasInvictas(byActivity, today),
  };
}

// ---------------------------------------------------------------------------
// Rachas
// ---------------------------------------------------------------------------

function rachasFinas(daily, dates, today, data) {
  let perfectStreak = 0;
  let actual = 0;
  let diasPerfectosEnPausa = 0;
  const pausas = data?.pausas;

  const primero = dates.length ? dates[0] : today;
  for (let d = primero; d <= today; d = addDays(d, 1)) {
    const dia = daily.get(d);
    if (dia?.perfect) {
      actual += 1;
      perfectStreak = Math.max(perfectStreak, actual);
      // Cumplir todo durante un viaje, cuando nada te obligaba, cuenta aparte.
      if (esLibre(pausas, d)) diasPerfectosEnPausa += 1;
    } else {
      actual = 0;
    }
  }
  return { perfectStreak, diasPerfectosEnPausa };
}

/**
 * Semanas seguidas cumpliendo a la vez las tres metas semanales: gimnasio,
 * muay thai y escribir. Cada una por separado ya tiene su racha; lo difícil
 * es que las tres caigan la misma semana, muchas semanas seguidas.
 */
function semanasInvictas(byActivity, today) {
  const semanales = [...byActivity.values()].filter((st) => st.activity.streakMode === 'weekly'
    && st.activity.id !== 'cuerpo');
  if (semanales.length < 2) return 0;

  const primero = semanales
    .map((st) => st.history[0]?.date)
    .filter(Boolean)
    .sort()[0];
  if (!primero) return 0;

  let mejor = 0;
  let seguidas = 0;
  for (let w = weekStart(primero); addDays(w, 6) <= today; w = addDays(w, 7)) {
    const todas = semanales.every((st) => {
      const meta = st.activity.weeklyTarget || 1;
      let hechas = 0;
      for (let i = 0; i < 7; i += 1) {
        const reg = st.byDate.get(addDays(w, i));
        if (reg?.value > 0) hechas += st.activity.kind === 'writing' ? reg.value : 1;
      }
      return hechas >= meta;
    });
    seguidas = todas ? seguidas + 1 : 0;
    mejor = Math.max(mejor, seguidas);
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Fuerza
// ---------------------------------------------------------------------------

function deFuerza(strength, gym, peso, today) {
  const porLift = new Map((strength || []).map((s) => [s.liftKey, s]));

  // La suma de los tres grandes, en veces tu peso corporal. Es la cifra con
  // la que se comparan los levantadores entre sí.
  let suma = 0;
  let completos = 0;
  for (const k of TRES_GRANDES) {
    const s = porLift.get(k);
    if (s?.e1rm > 0) { suma += s.e1rm; completos += 1; }
  }
  const sumaTresGrandes = completos === TRES_GRANDES.length ? Math.round(suma * 10) / 10 : 0;

  return {
    sumaTresGrandes,
    ratioTresGrandes: peso > 0 && sumaTresGrandes > 0 ? sumaTresGrandes / peso : 0,
    // Los kilos y la categoría de cada movimiento, para los logros que hablan
    // de uno solo. Salen de la misma escala que el nivel del gimnasio, así que
    // un logro nunca puede contradecir a la categoría que ves en pantalla.
    strengthE1rm: Object.fromEntries((strength || []).map((x) => [x.liftKey, x.e1rm || 0])),
    strengthNivel: Object.fromEntries((strength || []).map((x) => [x.liftKey, x.nivel?.index ?? -1])),
    lastreMaximo: lastreMaximo(gym),
    strengthAvanzados: (strength || []).filter((s) => (s.nivel?.index ?? -1) >= 3).length,
    // Cuántos movimientos medís en total: sin esto, "avanzado en todo" se
    // desbloquearía con un solo ejercicio cargado.
    strengthMedidos: (strength || []).length,
    brechaMaxima: brechaMaxima(strength),
    ...sequias(gym, today),
    progresionLimpia: progresionLimpia(gym),
  };
}

/**
 * El lastre más pesado con el que hiciste una dominada.
 *
 * En los ejercicios de peso corporal el campo `weight` es la carga EXTRA, no
 * el total: es justo el número del que habla el logro.
 */
function lastreMaximo(gym) {
  let mejor = 0;
  for (const puntos of (gym?.serieDeEjercicio || new Map()).values()) {
    for (const p of puntos) {
      if (p.bw && EJERCICIO_A_LIFT[p.name.trim().toLowerCase()] === 'pullup') {
        mejor = Math.max(mejor, Number(p.weight) || 0);
      }
    }
  }
  return mejor;
}

/**
 * La mayor diferencia entre los dos lados de un par que conviene parejo.
 * Devuelve Infinity si no hay ningún par medido, porque no saber no es estar
 * equilibrado.
 */
function brechaMaxima(strength) {
  const PARES = [['bench', 'row'], ['ohp', 'pullup'], ['squat', 'rdl']];
  const pos = new Map((strength || [])
    .filter((s) => s.nivel)
    .map((s) => [s.liftKey, s.nivel.index + (s.nivel.pct || 0)]));
  let peor = -1;
  let medidos = 0;
  for (const [a, b] of PARES) {
    if (!pos.has(a) || !pos.has(b)) continue;
    medidos += 1;
    peor = Math.max(peor, Math.abs(pos.get(a) - pos.get(b)));
  }
  return medidos === PARES.length ? peor : Infinity;
}

/**
 * La sequía más larga: el hueco más grande entre dos récords de un mismo
 * ejercicio que seguiste haciendo. Un ejercicio que abandonaste no cuenta —
 * dejar de hacer algo no es estancarse en eso.
 */
function sequias(gym, today) {
  const series = gym?.serieDeEjercicio;
  if (!series?.size) return { sequiaMaxima: 0, diasSinSequia: 0 };

  let peor = 0;
  for (const puntos of series.values()) {
    if (puntos.length < 2) continue;
    // La última vez que lo hiciste: si hace meses que no aparece, el hueco
    // abierto es abandono, no sequía.
    const ultimo = puntos[puntos.length - 1].date;
    const sigueEnLaRutina = daysBetween(ultimo, today) <= DIAS_DE_SEQUIA;

    let mejorE1rm = 0;
    let fechaDelRecord = puntos[0].date;
    for (const p of puntos) {
      if (p.e1rm > mejorE1rm + 0.01) {
        peor = Math.max(peor, daysBetween(fechaDelRecord, p.date));
        mejorE1rm = p.e1rm;
        fechaDelRecord = p.date;
      }
    }
    // El hueco que sigue abierto hoy también cuenta, si el ejercicio vive.
    if (sigueEnLaRutina) peor = Math.max(peor, daysBetween(fechaDelRecord, today));
  }

  const desde = gym.history[0]?.date;
  const historial = desde ? daysBetween(desde, today) : 0;
  return { sequiaMaxima: peor, diasSinSequia: peor <= DIAS_DE_SEQUIA ? historial : 0 };
}

/** Sesiones seguidas de un mismo ejercicio sin que el 1RM estimado baje. */
function progresionLimpia(gym) {
  let mejor = 0;
  for (const puntos of (gym?.serieDeEjercicio || new Map()).values()) {
    let seguidas = puntos.length ? 1 : 0;
    for (let i = 1; i < puntos.length; i += 1) {
      seguidas = puntos[i].e1rm >= puntos[i - 1].e1rm - 0.01 ? seguidas + 1 : 1;
      mejor = Math.max(mejor, seguidas);
    }
    mejor = Math.max(mejor, seguidas);
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Gimnasio: tonelaje y reparto
// ---------------------------------------------------------------------------

function delGimnasio(gym, today) {
  const tonelajeMaxSesion = Math.max(0, ...(gym?.history || []).map((h) => h.volume || 0));
  return { tonelajeMaxSesion, semanasTodoEnRango: semanasTodoEnRango(gym, today) };
}

/**
 * Semanas seguidas en que TODOS los grupos musculares quedaron dentro de su
 * rango productivo. Es el logro que obliga a mirar el reparto y no sólo el
 * total: se puede hacer muchísimo y que la mitad del cuerpo quede corta.
 */
function semanasTodoEnRango(gym, today) {
  const historia = gym?.history;
  if (!historia?.length) return 0;

  const ids = Object.keys(GRUPOS);
  let mejor = 0;
  let seguidas = 0;
  for (let w = weekStart(historia[0].date); addDays(w, 6) <= today; w = addDays(w, 7)) {
    const cuenta = new Map();
    for (let i = 0; i < 7; i += 1) {
      const ejercicios = gym.byDate.get(addDays(w, i))?.entry?.exercises;
      for (const ex of ejercicios || []) {
        const series = (ex.sets || []).filter((x) => Number(x.reps) > 0).length;
        if (!series) continue;
        const perfil = perfilDeEjercicio(ex.name);
        if (!perfil.grupo) continue;
        cuenta.set(perfil.grupo, (cuenta.get(perfil.grupo) || 0) + series);
        for (const g of perfil.tambien) {
          if (GRUPOS[g]) cuenta.set(g, (cuenta.get(g) || 0) + series * 0.5);
        }
      }
    }
    const todos = ids.every((id) => {
      const n = cuenta.get(id) || 0;
      return n >= GRUPOS[id].min && n <= GRUPOS[id].max;
    });
    seguidas = todos ? seguidas + 1 : 0;
    mejor = Math.max(mejor, seguidas);
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Cuerpo
// ---------------------------------------------------------------------------

function delCuerpo(byActivity, bodyFat, gym, today, perfil) {
  const cuerpoSt = [...byActivity.values()].find((st) => st.activity.rankBy === 'bodyfat');
  const meta = cuerpoSt?.activity?.targetBodyFat || 13;
  const historial = (cuerpoSt?.history || [])
    .map((h) => ({ date: h.date, pct: h.entry ? bodySummary(h.entry, perfil || {})?.fatPct : null }))
    .filter((m) => Number.isFinite(m.pct));

  // El más bajo que llegaste a medir, no el de hoy: bajar y volver a subir
  // sigue siendo haber bajado.
  const bodyFatMin = historial.length ? Math.min(...historial.map((m) => m.pct)) : null;

  // Días seguidos por debajo de la meta, contados desde la primera medición
  // que la cumplió y sin ninguna por encima en el medio.
  let diasBajoMeta = 0;
  if (historial.length) {
    let desde = null;
    for (const m of historial) {
      if (m.pct <= meta) { if (desde === null) desde = m.date; } else desde = null;
    }
    if (desde !== null && bodyFat != null && bodyFat <= meta) diasBajoMeta = daysBetween(desde, today);
  }

  return { bodyFatMin, diasBajoMeta, recomposicion: recomposicion(historial, gym, today) };
}

/**
 * Bajar grasa y subir fuerza al mismo tiempo.
 *
 * Es lo difícil de verdad: casi siempre que baja una sube la otra. Se compara
 * el principio y el final de una ventana de ocho semanas, usando la suma de
 * los 1RM de los tres grandes como medida de fuerza.
 */
function recomposicion(historial, gym, today) {
  if (historial.length < 2) return 0;
  const desde = addDays(today, -VENTANA_RECOMP);
  const enVentana = historial.filter((m) => m.date >= desde);
  if (enVentana.length < 2) return 0;

  const grasaAntes = enVentana[0];
  const grasaAhora = enVentana[enVentana.length - 1];
  if (!(grasaAhora.pct < grasaAntes.pct - 0.2)) return 0;

  // Sólo los movimientos con estándar conocido: sumar vuelos laterales al
  // total de fuerza haría que cambiar de accesorio pareciera progreso.
  const fuerza = (corte) => {
    let suma = 0;
    let medidos = 0;
    for (const [nombre, puntos] of (gym?.serieDeEjercicio || new Map())) {
      if (!EJERCICIO_A_LIFT[nombre]) continue;
      const hasta = puntos.filter((p) => p.date <= corte);
      if (!hasta.length) continue;
      suma += Math.max(...hasta.map((p) => p.e1rm));
      medidos += 1;
    }
    return medidos >= 3 ? suma : null;
  };
  const antes = fuerza(grasaAntes.date);
  const ahora = fuerza(grasaAhora.date);
  if (antes === null || ahora === null) return 0;
  return ahora > antes + 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Calendario y horarios
// ---------------------------------------------------------------------------

function deCalendario(daily, byActivity, dates, today) {
  const mesesConPerfecto = new Set();
  let navidad = 0;
  let anoNuevo = 0;

  for (const [fecha, dia] of daily) {
    if (dia.perfect) mesesConPerfecto.add(fecha.slice(0, 7));
    const mmdd = fecha.slice(5);
    if (dia.xp > 0 && mmdd === '12-25') navidad = 1;
    if (dia.xp > 0 && mmdd === '01-01') anoNuevo = 1;
  }

  return {
    mesesConPerfecto: mesesConPerfecto.size,
    navidad,
    anoNuevo,
    ...porHorario(byActivity),
  };
}

/**
 * Registros hechos de madrugada o muy temprano.
 *
 * Sólo cuentan si la marca de tiempo cae en el MISMO día del registro. Sin
 * esa condición, corregir el lunes a las tres de la mañana del jueves te daba
 * el logro sin haber entrenado de noche: sería un logro por editar, no por
 * hacer.
 */
function porHorario(byActivity) {
  let madrugador = 0;
  let nocturno = 0;
  const vistos = new Set();

  for (const st of byActivity.values()) {
    for (const h of st.history) {
      const marca = h.entry?.updatedAt;
      if (!marca) continue;
      const d = new Date(marca);
      if (Number.isNaN(d.getTime())) continue;
      const mismoDia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (mismoDia !== h.date) continue;
      const hora = d.getHours();
      // Un día, un logro: cinco registros de la misma madrugada son una noche.
      const clave = `${h.date}|${hora < 4 ? 'noche' : 'temprano'}`;
      if (vistos.has(clave)) continue;
      if (hora < 4) { nocturno += 1; vistos.add(clave); } else if (hora < 7) { madrugador += 1; vistos.add(clave); }
    }
  }
  return { madrugador, nocturno };
}

// ---------------------------------------------------------------------------

/** Todo el tiempo registrado, en minutos, sumando las actividades que lo miden. */
function minutosTotales(byActivity) {
  let total = 0;
  for (const st of byActivity.values()) {
    if (st.activity.unit === 'min') total += st.total;
  }
  return total;
}
