/**
 * Puente con la app de Android.
 *
 * El widget corre en otro proceso y no ve el localStorage: lo único que sabe
 * del horario es lo que la web le manda por acá. De paso le pasa el último
 * pronóstico, así el widget se dibuja al toque sin esperar su propia descarga.
 *
 * En el navegador, sin la app, nada de esto existe y no hace nada.
 */

export const DESCARGA_APK = 'https://github.com/JeremiasMas/Routine/releases/download/apk/clima.apk';

export function enApp() {
  return typeof window !== 'undefined' && typeof window.RutinaNativa?.disponible === 'function';
}

export function sincronizar(horario, json) {
  if (!enApp() || typeof window.RutinaNativa.guardarClima !== 'function') return false;
  try {
    window.RutinaNativa.guardarClima(JSON.stringify(horario), json ? JSON.stringify(json) : '');
    return true;
  } catch {
    return false;
  }
}

/*
 * Pasos.
 *
 * Adentro de la app los pasos de hoy llegan solos: la app los lee de Health
 * Connect y los manda en un evento cada vez que vuelve a primer plano. Es el
 * mismo puente que usan Rutina y Ataraxia. El permiso es de esta app: aunque
 * ya se lo hayas dado a Rutina, acá hay que darlo una vez más.
 */

export const EVENTO_PASOS = 'rutina-pasos';

/** Escucha los pasos. `cb` recibe {estado, pasos (de hoy o null), origenes}. */
export function escucharPasos(hoy, cb) {
  if (typeof window === 'undefined') return;
  window.addEventListener(EVENTO_PASOS, (e) => {
    const d = e.detail || {};
    const crudo = Number(d.dias?.[hoy()]);
    const origenes = (d.origenes || []).map((o) => {
      const [nombre, paquete] = String(o.paquete ?? '').split('\u0000');
      return { nombre: nombre || paquete, paquete: paquete || nombre, pasos: Number(o.pasos) || 0 };
    }).filter((o) => o.paquete && o.pasos > 0);
    // Con permiso, un día sin registros es un día de cero pasos, no uno sin dato.
    const pasos = Number.isFinite(crudo) && crudo >= 0 ? crudo : (d.estado === 'listo' ? 0 : null);
    cb({ estado: d.estado || null, pasos, origenes });
  });
}

export function pedirPermiso() { window.RutinaNativa?.pedirPermiso?.(); }
export function instalarHealthConnect() { window.RutinaNativa?.instalarHealthConnect?.(); }
export function refrescarPasos() { window.RutinaNativa?.refrescar?.(); }
/** Contar sólo los pasos de una app, para no sumar dos veces la misma caminata. */
export function usarSoloOrigen(paquete) { window.RutinaNativa?.usarSoloOrigen?.(paquete || ''); }
