// Persistencia en localStorage + detección de eventos de juego
// (subidas de nivel, logros nuevos, día perfecto) para poder celebrarlos.
import { DEFAULT_ACTIVITIES, SCHEMA_VERSION } from './config.js';
import { derive } from './derive.js';
import { todayKey, uid } from './utils.js';

const STORAGE_KEY = 'routine-rpg';
const listeners = new Set();

let data = null;
let cache = null;

function blankData() {
  return {
    version: SCHEMA_VERSION,
    createdAt: todayKey(),
    settings: { sound: true, celebrate: true, reduceMotion: false },
    activities: structuredClone(DEFAULT_ACTIVITIES),
    entries: {},
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
  next.unlocked = raw.unlocked || {};
  const known = new Map(DEFAULT_ACTIVITIES.map((a) => [a.id, a]));
  next.activities = (raw.activities?.length ? raw.activities : base.activities)
    .map((a) => ({ ...(known.get(a.id) || {}), ...a }));
  for (const def of DEFAULT_ACTIVITIES) {
    if (!next.activities.some((a) => a.id === def.id)) next.activities.push(structuredClone(def));
  }
  next.version = SCHEMA_VERSION;
  return next;
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
