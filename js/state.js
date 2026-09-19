// Persistencia en localStorage + detección de eventos de juego
// (subidas de nivel, logros nuevos, día perfecto) para poder celebrarlos.
import { DEFAULT_ACTIVITIES, DEFAULT_PROFILE, SCHEMA_VERSION } from './config.js';
import { waterGoalMl } from './body.js';
import { buildSeedEntries, ACUMULADO_PREVIO } from './seed.js';
import { derive } from './derive.js';
import { todayKey, uid, daysBetween } from './utils.js';

const STORAGE_KEY = 'routine-rpg';
const listeners = new Set();

let data = null;
let cache = null;

function blankData() {
  return {
    version: SCHEMA_VERSION,
    createdAt: todayKey(),
    settings: { sound: true, celebrate: true, reduceMotion: false, ...DEFAULT_PROFILE },
    activities: structuredClone(DEFAULT_ACTIVITIES),
    // Lo que ya venías haciendo antes de instalar la app.
    entries: buildSeedEntries(),
    carryOver: structuredClone(ACUMULADO_PREVIO),
    unlocked: {},
    deviceId: uid(),
  };
}

/** Rellena campos faltantes y adopta actividades nuevas del catálogo. */
function migrate(raw) {
  const base = blankData();
  const next = { ...base, ...raw };
  next.settings = { ...base.settings, ...(raw.settings || {}) };
  next.entries = raw.entries || {};
  next.carryOver = raw.carryOver || structuredClone(ACUMULADO_PREVIO);
  next.unlocked = raw.unlocked || {};
  const known = new Map(DEFAULT_ACTIVITIES.map((a) => [a.id, a]));
  next.activities = (raw.activities?.length ? raw.activities : base.activities)
    .map((a) => ({ ...(known.get(a.id) || {}), ...a }));
  for (const def of DEFAULT_ACTIVITIES) {
    if (!next.activities.some((a) => a.id === def.id)) next.activities.push(structuredClone(def));
  }
  next.version = SCHEMA_VERSION;
  syncDerivedGoals(next);
  return next;
}

/**
 * Metas que no se escriben a mano: la de agua sale de tu último peso
 * (35 ml por kilo), así se actualiza sola cada vez que te medís.
 */
function syncDerivedGoals(d) {
  const agua = d.activities.find((a) => a.autoGoal === 'water');
  if (!agua) return;
  let peso = Number(d.settings?.weight) || 0;
  for (const date of Object.keys(d.entries || {}).sort()) {
    const w = Number(d.entries[date]?.cuerpo?.weight) || 0;
    if (w > 0) peso = w;
  }
  if (peso > 0) {
    agua.goal = waterGoalMl(peso);
    d.settings.weight = peso;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    data = raw ? migrate(JSON.parse(raw)) : blankData();
  } catch (err) {
    console.warn('No se pudo leer el progreso guardado, se empieza de cero.', err);
    data = blankData();
  }
  cache = null;
  return data;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('No se pudo guardar el progreso.', err);
  }
}

export function getData() {
  if (!data) load();
  return data;
}

export function getState() {
  if (!cache) cache = derive(getData());
  return cache;
}

/** Descarta el estado derivado (p. ej. al cambiar de día con la app abierta). */
export function invalidate() {
  cache = null;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(state) {
  const levels = {};
  for (const [id, st] of state.byActivity) levels[id] = st.level.level;
  return { levels, player: state.player.level, unlocked: new Set(state.unlockedIds) };
}

/**
 * Aplica un cambio y devuelve los eventos de juego que produjo.
 * @returns {{levelUps:Array, playerLevelUp:?object, achievements:Array, perfectDay:boolean}}
 */
export function mutate(fn) {
  const before = snapshot(getState());
  const beforePerfect = getState().perfectDays;
  fn(getData());
  syncDerivedGoals(getData());
  cache = derive(getData());
  const after = getState();

  const levelUps = [];
  for (const [id, st] of after.byActivity) {
    const prev = before.levels[id] ?? st.level.level;
    if (st.level.level > prev) levelUps.push({ activity: st.activity, from: prev, to: st.level.level, tier: st.tier });
  }
  const unlocked = after.achievements.filter((a) => a.unlocked && !before.unlocked.has(a.id));
  const stamp = todayKey();
  for (const a of unlocked) data.unlocked[a.id] = stamp;
  if (unlocked.length) persist();

  const events = {
    levelUps,
    playerLevelUp: after.player.level > before.player ? { from: before.player, to: after.player.level, title: after.player.title } : null,
    achievements: unlocked,
    perfectDay: after.perfectDays > beforePerfect,
  };

  persist();
  listeners.forEach((l) => l(after, events));
  return events;
}

/** Guarda (o borra, si el valor es 0) el registro de una actividad en un día. */
export function setEntry(dateKey, activityId, entry) {
  return mutate((d) => {
    if (!d.entries[dateKey]) d.entries[dateKey] = {};
    if (entry === null) {
      delete d.entries[dateKey][activityId];
      if (!Object.keys(d.entries[dateKey]).length) delete d.entries[dateKey];
    } else {
      d.entries[dateKey][activityId] = { ...entry, updatedAt: new Date().toISOString() };
    }
  });
}

export function getEntry(dateKey, activityId) {
  return getData().entries?.[dateKey]?.[activityId] || null;
}

/**
 * Carga muchos días de una vez (importación de pasos) en una sola operación,
 * para no recalcular ni celebrar día por día.
 */
export function bulkSetEntries(activityId, days) {
  return mutate((d) => {
    for (const { date, value, ...resto } of days) {
      if (!d.entries[date]) d.entries[date] = {};
      d.entries[date][activityId] = { value, ...resto, importedAt: new Date().toISOString() };
    }
  });
}

export function updateActivity(id, patch) {
  return mutate((d) => {
    const act = d.activities.find((a) => a.id === id);
    if (act) Object.assign(act, patch);
  });
}

export function addActivity(activity) {
  return mutate((d) => {
    d.activities.push({
      id: `custom-${uid()}`,
      icon: '🎯',
      color: '#22d3ee',
      kind: 'number',
      unit: 'min',
      goal: 30,
      step: 5,
      presets: [10, 20, 30],
      streakMode: 'daily',
      ...activity,
    });
  });
}

export function removeActivity(id) {
  return mutate((d) => {
    d.activities = d.activities.filter((a) => a.id !== id);
    for (const day of Object.values(d.entries)) delete day[id];
  });
}

export function updateSettings(patch) {
  return mutate((d) => Object.assign(d.settings, patch));
}

export function exportData() {
  return JSON.stringify(getData(), null, 2);
}

/** Días máximos sin exportar antes de avisar. */
export const DIAS_SIN_BACKUP = 14;

/**
 * Hace cuántos días exportaste por última vez, o null si nunca.
 * Todo vive en este navegador: perder los datos del sitio es perder el
 * progreso entero, y nadie se acuerda de exportar sin que se lo recuerden.
 */
export function diasSinBackup() {
  const d = getData();
  if (!Object.keys(d.entries || {}).length) return null;
  const ultimo = d.settings?.lastExportAt;
  return ultimo ? daysBetween(ultimo, todayKey()) : Infinity;
}

export function backupVencido() {
  const dias = diasSinBackup();
  return dias !== null && dias >= DIAS_SIN_BACKUP;
}

/** Deja constancia de que bajaste una copia. */
export function markExported() {
  return mutate((d) => { d.settings.lastExportAt = todayKey(); });
}

export function importData(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
    throw new Error('El archivo no tiene el formato esperado.');
  }
  data = migrate(parsed);
  cache = null;
  persist();
  listeners.forEach((l) => l(getState(), { levelUps: [], achievements: [], playerLevelUp: null }));
}

export function resetAll() {
  data = blankData();
  cache = null;
  persist();
  listeners.forEach((l) => l(getState(), { levelUps: [], achievements: [], playerLevelUp: null }));
}
