/**
 * Puente con la app de Android.
 *
 * Cuando la web corre adentro de la app nativa, la app le pasa los pasos que
 * el navegador no puede leer solo: los lee de Health Connect —por donde
 * Samsung Health los comparte— y los manda en un evento cada vez que la app
 * vuelve a primer plano.
 *
 * En Chrome, sin la app, nada de esto existe y la web funciona igual.
 */
import { bulkSetEntries, getData } from './state.js';

export const EVENTO = 'rutina-pasos';

/** ¿Estamos adentro de la app de Android? */
export function enApp() {
  return typeof window !== 'undefined' && typeof window.RutinaNativa?.disponible === 'function';
}

/**
 * Qué días hay que escribir.
 *
 * Health Connect manda el total real de cada día, así que pisa lo que haya
 * cargado a mano: es el mismo número que ves en Samsung Health y ya viene
 * deduplicado entre el reloj y el teléfono. Pero sólo manda los días que
 * tiene: un día sin datos no se toca, para no borrar lo que anotaste vos.
 *
 * @param {Object<string, number>} dias  {'2026-09-20': 9430, ...}
 * @param {Object} entries  los registros actuales
 * @returns {Array<{date: string, value: number}>} sólo lo que cambia
 */
export function diasACargar(dias, entries = {}) {
  const salida = [];
  for (const [date, raw] of Object.entries(dias || {})) {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!esFecha(date)) continue;
    const actual = entries[date]?.pasos;
    // Sin cambios no se escribe: cada escritura recalcula todo y dispara
    // celebraciones, y volver a la app no debería festejar lo mismo de nuevo.
    if (actual && Number(actual.value) === value && actual.fuente === 'health-connect') continue;
    salida.push({ date, value });
  }
  return salida;
}

/**
 * Una fecha de verdad, no sólo con forma de fecha: '2026-13-99' tiene la
 * forma correcta y no existe, y escribirla crearía un día fantasma.
 */
function esFecha(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Traduce el estado que manda la app a algo que se pueda mostrar. */
export function mensajeDeEstado(estado) {
  switch (estado) {
    case 'listo': return { ok: true, texto: 'Conectado a Health Connect.' };
    case 'sin_permiso': return {
      ok: false,
      texto: 'Falta darle permiso para leer los pasos.',
      accion: 'permiso',
      boton: 'Dar permiso',
    };
    case 'sin_health_connect': return {
      ok: false,
      texto: 'Este teléfono no tiene Health Connect instalado.',
      accion: 'instalar',
      boton: 'Instalar Health Connect',
    };
    case 'hay_que_actualizar': return {
      ok: false,
      texto: 'Health Connect está desactualizado.',
      accion: 'instalar',
      boton: 'Actualizar',
    };
    default: return { ok: false, texto: 'No se pudo leer Health Connect.' };
  }
}

/** Último estado recibido, para que las pantallas lo puedan mostrar. */
export const nativo = { estado: null, dias: {}, diagnostico: null, cargados: 0 };

const oyentes = new Set();
export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Engancha el puente. Se llama una vez, al arrancar la app. */
export function conectar() {
  if (typeof window === 'undefined') return;
  window.addEventListener(EVENTO, (e) => {
    const datos = e.detail || {};
    nativo.estado = datos.estado || null;
    nativo.dias = datos.dias || {};
    nativo.diagnostico = datos.diagnostico || null;

    const aCargar = diasACargar(nativo.dias, getData().entries);
    nativo.cargados = aCargar.length;
    if (aCargar.length) {
      bulkSetEntries('pasos', aCargar.map((d) => ({ ...d, fuente: 'health-connect' })));
    }
    oyentes.forEach((fn) => fn(nativo, aCargar));
  });
}

export function pedirPermiso() { window.RutinaNativa?.pedirPermiso?.(); }
export function instalarHealthConnect() { window.RutinaNativa?.instalarHealthConnect?.(); }
export function refrescar() { window.RutinaNativa?.refrescar?.(); }
