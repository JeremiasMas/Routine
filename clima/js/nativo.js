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
