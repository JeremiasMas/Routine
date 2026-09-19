// Deriva TODO el estado de juego (XP, niveles, rachas, récords, logros)
// a partir del historial crudo. Es una función pura: mismo historial,
// mismo resultado. Así nunca se desincroniza nada.
import { ACHIEVEMENTS, BONUS, templateById, plannedSets } from './config.js';
import {
  entryXp, levelFromXp, playerLevelFromXp, tierFor, playerTitleFor,
  gymVolume, estimatedOneRepMax, streakMultiplier,
} from './xp.js';
import { liftDeEjercicio, usaPesoCorporal, strengthProfile, nivelGeneral } from './strength.js';
import { todayKey, addDays, daysBetween, weekStart, dayKey, keyToDate } from './utils.js';

const MAX_SHIELDS = 2;      // escudos de racha acumulables
const SHIELD_EVERY = 7;     // se gana uno cada 7 días de racha

/**
 * Valor numérico de un registro, según el tipo de actividad.
 * En el gimnasio la unidad son SERIES completadas: con una rutina de 30 a 42
 * series, el tonelaje sirve como marca pero no como meta.
 */
export function entryValue(activity, entry) {
  if (!entry) return 0;
  if (activity.kind === 'gym') return completedSets(entry.exercises);
  // Una medición corporal cuenta como hecha si tiene al menos peso o cintura.
  if (activity.kind === 'body') return (Number(entry.weight) > 0 || Number(entry.waist) > 0) ? 1 : 0;
  return Number(entry.value) || 0;
}

/** Series con repeticiones cargadas (el peso puede ir vacío: peso corporal). */
export function completedSets(exercises = []) {
  let n = 0;
  for (const ex of exercises) {
    for (const set of ex.sets || []) if (Number(set.reps) > 0) n += 1;
  }
  return n;
}

/** Tonelaje de la sesión: se guarda como estadística y alimenta los récords. */
export function entryVolume(entry) {
  return entry?.exercises ? gymVolume(entry.exercises) : 0;
}

/**
 * Meta de un registro concreto. Casi siempre es la meta de la actividad, pero
 * una sesión de gimnasio con plantilla se mide contra SU rutina: completar el
 * día de pecho (27 series) vale lo mismo que el de hombros (42).
 */
export function goalFor(activity, entry) {
  if (activity.kind === 'gym' && entry?.templateId) {
    const planned = plannedSets(templateById(entry.templateId));
    if (planned > 0) return planned;
  }
  return Number(activity.goal) || 1;
}

/**
 * ¿Toca esta actividad este día? Sin `days` se espera todos los días.
 * Los días libres no suman ni rompen rachas: descansar no es fallar.
 */
export function isScheduled(activity, dateKey) {
  if (!activity.days?.length) return activity.streakMode !== 'weekly';
  return activity.days.includes(keyToDate(dateKey).getDay());
}

function emptyActivityState(activity) {
  return {
    id: activity.id,
    activity,
    xp: 0,
    streak: 0,
    bestStreak: 0,
    shields: 0,
    total: 0,
    volume: 0,
    activeDays: 0,
    goalDays: 0,
    best: 0,
    bestDate: null,
    history: [],          // [{date, value, xp, met}]
    byDate: new Map(),
    records: new Map(),      // ejercicio -> {weight, reps, e1rm, date}
    lastSets: new Map(),     // ejercicio -> últimas series cargadas
    lastByTemplate: new Map(), // plantilla -> últimos ejercicios de esa rutina
    prCount: 0,
    weekCount: 0,
    weekTarget: activity.weeklyTarget || 0,
    doneToday: false,
    valueToday: 0,
    xpToday: 0,
  };
}

/**
 * @param {object} data estado crudo persistido
 * @param {string} [today] clave de día para "hoy" (inyectable para tests)
 */
export function derive(data, today = todayKey()) {
  const activities = data.activities.filter((a) => a.active !== false);
  const entries = data.entries || {};
  const dates = Object.keys(entries).sort();
  const start = dates.length ? dates[0] : today;
  const end = dates.length && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;

  const byActivity = new Map();
  for (const a of activities) byActivity.set(a.id, emptyActivityState(a));

  const daily = new Map();     // dateKey -> {xp, perfect, met, required}
  const weekly = new Map();    // "actId|weekStart" -> sesiones
  let bonusXp = 0;
  let perfectDays = 0;
  let totalEntries = 0;

  const span = Math.max(0, daysBetween(start, end));

  // ---- Pasada 1: semanas (para actividades con objetivo semanal) ----
  for (const a of activities) {
    if (a.streakMode !== 'weekly') continue;
    for (const date of dates) {
      const value = entryValue(a, entries[date]?.[a.id]);
      if (value > 0) {
        const key = `${a.id}|${weekStart(date)}`;
        weekly.set(key, (weekly.get(key) || 0) + (a.kind === 'writing' ? value : 1));
      }
    }
  }

  // Racha semanal: semanas consecutivas que alcanzaron el objetivo.
  const weekStreaks = new Map(); // actId -> {streak, best}
  for (const a of activities) {
    if (a.streakMode !== 'weekly') continue;
    const target = a.weeklyTarget || 1;
    let streak = 0;
    let best = 0;
    const firstWeek = weekStart(start);
    const currentWeek = weekStart(today);
    for (let w = firstWeek; w <= currentWeek; w = addDays(w, 7)) {
      const count = weekly.get(`${a.id}|${w}`) || 0;
      if (count >= target) {
        streak += 1;
        best = Math.max(best, streak);
      } else if (w < currentWeek) {
        streak = 0; // la semana en curso todavía no rompe la racha
      }
    }
    weekStreaks.set(a.id, { streak, best });
  }

  // ---- Pasada 2: día por día, en orden cronológico ----
  const streakState = new Map(); // actId -> {streak, shields}
  for (const a of activities) streakState.set(a.id, { streak: 0, shields: 0 });

  // Peso corporal vigente en cada fecha: lo necesitan los ejercicios que se
  // hacen con el propio cuerpo (dominadas, fondos) para calcular la carga real.
  let pesoCorporal = Number(data.settings?.weight) || 0;

  for (let i = 0; i <= span; i++) {
    const date = addDays(start, i);
    const dayEntries = entries[date] || {};
    const pesado = Number(dayEntries.cuerpo?.weight) || 0;
    if (pesado > 0) pesoCorporal = pesado;
    let dayXp = 0;
    let metCount = 0;
    let required = 0;

    for (const a of activities) {
      const st = byActivity.get(a.id);
      const raw = dayEntries[a.id];
      const value = entryValue(a, raw);
      const goal = goalFor(a, raw);
      const met = value >= goal;
      const scheduled = isScheduled(a, date);
      const ss = streakState.get(a.id);

      if (raw !== undefined && value > 0) totalEntries += 1;

      if (value > 0) {
        // El multiplicador usa la racha ANTERIOR al registro del día.
        const streakForBonus = a.streakMode === 'weekly'
          ? (weekStreaks.get(a.id)?.streak || 0) * 3   // una semana cumplida ≈ 3 días
          : ss.streak;
        const xp = entryXp(value, goal, streakForBonus);
        st.xp += xp;
        st.total += value;
        st.volume += entryVolume(raw);
        st.activeDays += 1;
        if (met) st.goalDays += 1;
        st.history.push({ date, value, xp, met, goal, volume: entryVolume(raw), entry: raw });
        st.byDate.set(date, { value, xp, met, goal, entry: raw });
        dayXp += xp;
        if (value > st.best) {
          st.best = value;
          st.bestDate = date;
        }
        if (date === today) {
          st.doneToday = true;
          st.valueToday = value;
          st.xpToday = xp;
        }
      }

      // Récords personales del gimnasio (en orden cronológico).
      if (a.kind === 'gym' && raw?.exercises) {
        if (raw.templateId) st.lastByTemplate.set(raw.templateId, raw.exercises);
        for (const ex of raw.exercises) {
          const name = (ex.name || '').trim().toLowerCase();
          if (!name) continue;
          // Lo último que levantaste en este ejercicio, para precargarlo.
          if (ex.sets?.length) st.lastSets.set(name, ex.sets);

          const esPesoCorporal = ex.bw === true || usaPesoCorporal(liftDeEjercicio(ex.name));
          for (const set of ex.sets || []) {
            const extra = Number(set.weight) || 0;
            const reps = Number(set.reps) || 0;
            const carga = esPesoCorporal ? pesoCorporal + extra : extra;
            const e1rm = estimatedOneRepMax(carga, reps);
            if (e1rm <= 0) continue;
            // En los ejercicios de peso corporal el récord se mide en veces tu
            // propio peso: así engordar no regala un récord falso. El ratio se
            // calcula sobre el valor sin redondear, porque el redondeo del 1RM
            // por sí solo alcanzaba para simular una mejora.
            const ratio = pesoCorporal > 0 ? (carga * (1 + reps / 30)) / pesoCorporal : 0;
            const marca = { name: ex.name.trim(), weight: extra, reps, e1rm, load: Math.round(carga * 10) / 10, ratio, bw: esPesoCorporal, date };
            const prev = st.records.get(name);
            const mejora = prev && (esPesoCorporal
              ? marca.ratio > prev.ratio + 0.002
              : e1rm > prev.e1rm + 0.01);
            if (!prev) {
              st.records.set(name, marca);
            } else if (mejora) {
              st.records.set(name, marca);
              st.prCount += 1;
              bonusXp += BONUS.personalRecord;
            }
          }
        }
      }

      // Racha diaria con escudos: un día perdido consume un escudo si hay.
      if (a.streakMode !== 'weekly') {
        if (met) {
          // Cumplir en un día libre también suma: hacer de más nunca penaliza.
          ss.streak += 1;
          if (ss.streak % SHIELD_EVERY === 0) ss.shields = Math.min(MAX_SHIELDS, ss.shields + 1);
          st.bestStreak = Math.max(st.bestStreak, ss.streak);
        } else if (date < today && scheduled) {
          if (ss.shields > 0) ss.shields -= 1; // la racha sobrevive
          else ss.streak = 0;
        }
      }

      // El día perfecto es "hiciste todo lo que HOY tocaba", no todo lo que existe.
      if (scheduled) {
        required += 1;
        if (met) metCount += 1;
      }
    }

    const perfect = required > 0 && metCount === required;
    if (perfect) {
      perfectDays += 1;
      bonusXp += BONUS.perfectDay;
      dayXp += BONUS.perfectDay;
    }
    if (dayXp > 0 || perfect) daily.set(date, { date, xp: dayXp, perfect, met: metCount, required });
  }

  // ---- Consolidación por actividad ----
  const totals = {};
  const volumes = {};
  const bests = {};
  const sessions = {};
  const activeDays = {};
  const goalDays = {};
  const weeklyStreaks = {};
  let personalRecords = 0;
  let bestDailyStreak = 0;
  let minActivityLevel = Infinity;
  let activityXp = 0;

  for (const a of activities) {
    const st = byActivity.get(a.id);
    const ss = streakState.get(a.id);
    if (a.streakMode === 'weekly') {
      const w = weekStreaks.get(a.id) || { streak: 0, best: 0 };
      st.streak = w.streak;
      st.bestStreak = w.best;
      st.weekCount = weekly.get(`${a.id}|${weekStart(today)}`) || 0;
    } else {
      st.streak = ss.streak;
      st.shields = ss.shields;
      bestDailyStreak = Math.max(bestDailyStreak, st.bestStreak);
    }
    st.level = levelFromXp(st.xp);
    st.tier = tierFor(st.level.level);
    st.multiplier = streakMultiplier(
      a.streakMode === 'weekly' ? st.streak * 3 : st.streak,
    );
    st.recordList = [...st.records.values()].sort((x, y) => y.e1rm - x.e1rm);
    totals[a.id] = st.total;
    volumes[a.id] = st.volume;
    weeklyStreaks[a.id] = a.streakMode === 'weekly' ? st.streak : 0;
    bests[a.id] = st.best;
    sessions[a.id] = st.activeDays;
    activeDays[a.id] = st.activeDays;
    goalDays[a.id] = st.goalDays;
    personalRecords += st.prCount;
    minActivityLevel = Math.min(minActivityLevel, st.level.level);
    activityXp += st.xp;
  }
  if (!Number.isFinite(minActivityLevel)) minActivityLevel = 0;

  // ---- Fuerza relativa ----
  const sexo = data.settings?.bodyFormula === '4' ? 'f' : 'm';
  const gimnasio = [...byActivity.values()].find((st) => st.activity.kind === 'gym');
  const strength = gimnasio ? strengthProfile(gimnasio.records, pesoCorporal, sexo) : [];
  const strengthOverall = nivelGeneral(strength);
  const strengthRatios = Object.fromEntries(strength.map((s) => [s.liftKey, s.ratio]));
  // Movimientos en nivel intermedio o superior (índice 2 en la escala).
  const strengthIntermediates = strength.filter((s) => (s.nivel?.index ?? -1) >= 2).length;

  // ---- Logros ----
  const summary = {
    totals, volumes, bests, sessions, activeDays, goalDays, weeklyStreaks, perfectDays, personalRecords,
    strengthRatios, strengthIntermediates,
    bestDailyStreak, totalEntries, minActivityLevel,
    playerLevel: playerLevelFromXp(activityXp + bonusXp).level,
  };
  let achievementXp = 0;
  const achievements = ACHIEVEMENTS.map((def) => {
    const progress = Math.max(0, Number(def.progress(summary)) || 0);
    const unlocked = progress >= def.target;
    if (unlocked) achievementXp += def.xp;
    return {
      ...def,
      progress: Math.min(progress, def.target),
      pct: Math.min(1, progress / def.target),
      unlocked,
      unlockedAt: data.unlocked?.[def.id] || null,
    };
  });

  const playerXp = activityXp + bonusXp + achievementXp;
  const player = playerLevelFromXp(playerXp);

  // Racha global: días consecutivos con al menos un registro.
  let globalStreak = 0;
  for (let d = today; ; d = addDays(d, -1)) {
    const day = daily.get(d);
    if (day && day.xp > 0) globalStreak += 1;
    else if (d !== today) break;
    else if (!day) { /* hoy todavía puede sumarse */ }
    if (d <= start) break;
  }

  return {
    today,
    bodyweight: pesoCorporal,
    strength,
    strengthOverall,
    activities,
    byActivity,
    daily,
    weekly,
    player: { ...player, title: playerTitleFor(player.level), xp: playerXp },
    bonusXp,
    achievementXp,
    activityXp,
    achievements,
    unlockedIds: achievements.filter((a) => a.unlocked).map((a) => a.id),
    globalStreak,
    ...summary,
  };
}

/** XP que sumaría un valor dado hoy, para mostrar la previsualización. */
export function previewXp(state, activity, value, entry = null) {
  const st = state.byActivity.get(activity.id);
  const streak = activity.streakMode === 'weekly'
    ? (st?.streak || 0) * 3
    : (st?.streak || 0);
  return entryXp(value, goalFor(activity, entry), streak);
}

export { dayKey };
