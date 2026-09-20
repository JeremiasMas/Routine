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

/**
 * Lo que el WebView soporta. Un WebView viejo puede no tener
 * DecompressionStream, y entonces la importación del ZIP de Samsung falla sin
 * que quede claro por qué.
 */
export function capacidades() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
  return {
    chrome: chrome ? Number(chrome) : null,
    webview: /; wv\)/.test(ua),
    zip: typeof DecompressionStream === 'function',
    archivos: typeof window !== 'undefined' && 'FileReader' in window,
    guardar: typeof window?.RutinaNativa?.guardarArchivo === 'function',
  };
}

/** Último estado recibido, para que las pantallas lo puedan mostrar. */
export const nativo = { estado: null, dias: {}, diagnostico: null, cargados: 0, origenes: [] };

/**
 * Qué apps escribieron pasos hoy. Health Connect suma lo que escriben todas,
 * así que si hay dos midiendo la misma caminata el total sale más alto que el
 * que ves en Samsung Health. Saber quiénes son es lo que explica la diferencia.
 *
 * La app manda la clave como "Nombre\0paquete" para no tener que mantener la
 * tabla de nombres en los dos lados.
 */
export function leerOrigenes(crudos) {
  return (crudos || []).map((o) => {
    const [nombre, paquete] = String(o.paquete ?? '').split('\u0000');
    const id = paquete || nombre || '';
    return { nombre: nombreDeApp(id, nombre), paquete: id, pasos: Number(o.pasos) || 0 };
  }).filter((o) => o.paquete);
}

/**
 * Nombre legible de la app que escribió los pasos.
 *
 * La app de Android ya traduce las que conoce, pero algunas fuentes traen un
 * identificador con un hash pegado —el contador del propio teléfono es
 * "com.android.healthconnect.phone.<hash>"— que ni significa nada ni entra en
 * la pantalla. Se traduce acá, del lado web, para que el arreglo llegue sin
 * tener que reinstalar la app.
 */
export function nombreDeApp(paquete, nombreNativo = '') {
  // Si la app ya lo tradujo, se respeta.
  if (nombreNativo && nombreNativo !== paquete) return nombreNativo;
  const POR_PREFIJO = [
    ['com.android.healthconnect.phone', 'Contador del teléfono'],
    ['com.google.android.apps.fitness', 'Google Fit'],
    ['com.sec.android.app.shealth', 'Samsung Health'],
    ['com.samsung.android.wear', 'Reloj Samsung'],
    ['com.fitbit', 'Fitbit'],
    ['com.jeremiasmas.rutina', 'Esta app'],
  ];
  for (const [prefijo, nombre] of POR_PREFIJO) {
    if (paquete.startsWith(prefijo)) return nombre;
  }
  // Uno desconocido: la última parte legible, sin el hash, y acotado.
  const partes = paquete.split('.').filter((x) => x && !/^[0-9a-f]{12,}$/i.test(x));
  const corto = partes[partes.length - 1] || paquete;
  return corto.length > 24 ? `${corto.slice(0, 24)}…` : corto;
}

/**
 * ¿Hay más de una app aportando pasos hoy? Es la causa más común de que el
 * número de la app no coincida con el de Samsung Health.
 */
export function hayConflictoDeOrigenes(origenes) {
  const conPasos = (origenes || []).filter((o) => o.pasos > 0);
  if (conPasos.length < 2) return null;
  const total = conPasos.reduce((n, o) => n + o.pasos, 0);
  const mayor = conPasos.reduce((a, b) => (b.pasos > a.pasos ? b : a));
  return { total, mayor, cuantas: conPasos.length, sobrante: total - mayor.pasos };
}

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
    nativo.origenes = leerOrigenes(datos.origenes);

    const aCargar = diasACargar(nativo.dias, getData().entries);
    nativo.cargados = aCargar.length;
    if (aCargar.length) {
      bulkSetEntries('pasos', aCargar.map((d) => ({ ...d, fuente: 'health-connect' })));
    }
    oyentes.forEach((fn) => fn(nativo, aCargar));
  });
}

/**
 * Guarda un archivo usando la app. La web exporta con un blob y un
 * <a download>, que adentro de un WebView no descarga nada.
 * @returns {boolean} si la app se hizo cargo.
 */
export function guardarArchivo(nombre, contenido) {
  if (typeof window.RutinaNativa?.guardarArchivo !== 'function') return false;
  try {
    return window.RutinaNativa.guardarArchivo(nombre, contenido) !== false;
  } catch {
    return false;
  }
}

export function pedirPermiso() { window.RutinaNativa?.pedirPermiso?.(); }
export function instalarHealthConnect() { window.RutinaNativa?.instalarHealthConnect?.(); }
export function refrescar() { window.RutinaNativa?.refrescar?.(); }
export function usarSoloOrigen(paquete) { window.RutinaNativa?.usarSoloOrigen?.(paquete || ''); }
