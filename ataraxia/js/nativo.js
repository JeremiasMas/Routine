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

/* -------------------------------------------------------------------------
   Recordatorio de peso

   La web no puede avisar con la app cerrada; la app de Android sí, con una
   notificación. Acá sólo se le dice cuándo, y se le pregunta cómo quedó.
   Un APK anterior a esto no tiene los métodos: entonces se avisa que hay que
   actualizarlo, y el recordatorio adentro de la app sigue funcionando igual.
   ------------------------------------------------------------------------- */

export const EVENTO_RECORDATORIO = 'rutina-recordatorio';

export function puedeNotificar() {
  return typeof window !== 'undefined' && typeof window.RutinaNativa?.recordatorio === 'function';
}

/** Cómo está programado en el teléfono, o null si la app no lo soporta. */
export function recordatorioNativo() {
  if (typeof window?.RutinaNativa?.estadoRecordatorio !== 'function') return null;
  try {
    return JSON.parse(window.RutinaNativa.estadoRecordatorio());
  } catch {
    return null;
  }
}

/** Pasa '08:30' a [8, 30]. */
export function horaYMinuto(texto) {
  const [h, m] = String(texto || '08:00').split(':').map(Number);
  return [Number.isInteger(h) ? h : 8, Number.isInteger(m) ? m : 0];
}

/** ¿Lo programado en el teléfono coincide con lo que pide la configuración? */
export function recordatorioAlDia(config, nativoActual) {
  if (!nativoActual) return false;
  const [hora, minuto] = horaYMinuto(config.hora);
  if (!config.activo) return nativoActual.activo === false;
  return nativoActual.activo === true && nativoActual.dia === config.dia
    && nativoActual.hora === hora && nativoActual.minuto === minuto;
}

/**
 * Le pasa la configuración al teléfono si hace falta. Con `forzar` se manda
 * igual, que es lo que vuelve a pedir el permiso si estaba denegado.
 * @returns {boolean} si la app se hizo cargo
 */
export function programarRecordatorio(config, forzar = false) {
  if (!puedeNotificar()) return false;
  if (!forzar && recordatorioAlDia(config, recordatorioNativo())) return true;
  const [hora, minuto] = horaYMinuto(config.hora);
  try {
    window.RutinaNativa.recordatorio(Boolean(config.activo), config.dia, hora, minuto);
    return true;
  } catch {
    return false;
  }
}
