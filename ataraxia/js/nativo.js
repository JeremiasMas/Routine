/**
 * Puente con la app de Android.
 *
 * Adentro de la app, los pasos llegan solos: la app los lee de Health Connect
 * —por donde Mi Fitness, Google Fit o el contador del teléfono los comparten—
 * y los manda en un evento cada vez que la app vuelve a primer plano. Es el
 * mismo puente que usa Rutina, con el mismo nombre y el mismo evento.
 *
 * En el navegador, sin la app, nada de esto existe y los pasos se cargan a
 * mano como siempre.
 */

export const EVENTO = 'rutina-pasos';
export const FUENTE = 'health-connect';

/** Dónde se baja la app. Es el mismo release que publica el APK de Rutina. */
export const DESCARGA_APK = 'https://github.com/JeremiasMas/Routine/releases/download/apk/ataraxia.apk';

/** ¿Estamos adentro de la app de Android? */
export function enApp() {
  return typeof window !== 'undefined' && typeof window.RutinaNativa?.disponible === 'function';
}

/**
 * Qué días hay que escribir con lo que mandó Health Connect.
 *
 * Health Connect manda el total real de cada día, así que pisa lo cargado a
 * mano. Pero sólo manda los días que tiene: un día que no vino no se toca,
 * para no borrar lo anotado por culpa de una lectura vacía. Y lo que no
 * cambió no se reescribe: cada escritura recalcula todo y volvería a festejar
 * lo mismo cada vez que se abre la app.
 *
 * @param {Object<string, number>} dias  {'2026-09-20': 9430, ...}
 * @param {Object} registros  estado.dias
 * @returns {Array<{clave: string, pasos: number}>}
 */
export function pasosACargar(dias, registros = {}) {
  const salida = [];
  for (const [clave, crudo] of Object.entries(dias || {})) {
    const pasos = Math.round(Number(crudo));
    if (!Number.isFinite(pasos) || pasos <= 0 || pasos > 200000) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) continue;
    const actual = registros[clave];
    if (actual?.pasos === pasos && actual?.fuentePasos === FUENTE) continue;
    salida.push({ clave, pasos });
  }
  return salida.sort((a, b) => (a.clave < b.clave ? -1 : 1));
}

/** Traduce el estado que manda la app a algo que se pueda mostrar. */
export function mensajeDeEstado(estado) {
  switch (estado) {
    case 'listo': return { ok: true, texto: 'Conectada a Health Connect: los pasos llegan solos.' };
    case 'sin_permiso': return {
      ok: false, texto: 'Falta darle permiso para leer los pasos.', accion: 'permiso', boton: 'Dar permiso',
    };
    case 'sin_health_connect': return {
      ok: false, texto: 'Este teléfono no tiene Health Connect.', accion: 'instalar', boton: 'Instalar Health Connect',
    };
    case 'hay_que_actualizar': return {
      ok: false, texto: 'Health Connect está desactualizado.', accion: 'instalar', boton: 'Actualizar',
    };
    case null: case undefined: return { ok: false, texto: 'Esperando a Health Connect…' };
    default: return { ok: false, texto: 'No se pudo leer Health Connect.' };
  }
}

/**
 * Qué apps escribieron pasos hoy. La app manda cada una como
 * "Nombre\0paquete" y sus pasos.
 */
export function leerOrigenes(crudos) {
  return (crudos || []).map((o) => {
    const [nombre, paquete] = String(o.paquete ?? '').split('\u0000');
    const id = paquete || nombre || '';
    return { nombre: nombre && nombre !== id ? nombre : nombreCorto(id), paquete: id, pasos: Number(o.pasos) || 0 };
  }).filter((o) => o.paquete);
}

function nombreCorto(paquete) {
  if (paquete.startsWith('com.android.healthconnect.phone')) return 'Contador del teléfono';
  const partes = paquete.split('.').filter((x) => x && !/^[0-9a-f]{12,}$/i.test(x));
  return partes[partes.length - 1] || paquete;
}

/**
 * Con más de una app aportando pasos, Health Connect las suma y el total sale
 * inflado: típicamente el contador del teléfono más Mi Fitness. Es la causa
 * más común de que el número no coincida con el que muestra el teléfono.
 */
export function hayVariasFuentes(origenes) {
  return (origenes || []).filter((o) => o.pasos > 0).length > 1;
}

/** Último estado recibido, para que Ajustes lo pueda mostrar. */
export const nativo = { estado: null, origenes: [], diagnostico: null };

/**
 * Engancha el puente. `aplicar` recibe los días a escribir (ya filtrados) y
 * `avisar` se llama después de cada lectura, haya cambios o no.
 */
export function conectar(registros, aplicar, avisar) {
  if (typeof window === 'undefined') return;
  window.addEventListener(EVENTO, (e) => {
    const datos = e.detail || {};
    nativo.estado = datos.estado || null;
    nativo.origenes = leerOrigenes(datos.origenes);
    nativo.diagnostico = datos.diagnostico || null;
    const cambios = pasosACargar(datos.dias, registros());
    if (cambios.length) aplicar(cambios);
    avisar(cambios);
  });
}

/** Guarda un archivo con la app: adentro de un WebView un <a download> no hace nada. */
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
