/**
 * Copia de seguridad automática.
 *
 * Todo el historial vive en el almacenamiento de un solo teléfono. El aviso a
 * los catorce días depende de que uno le haga caso; esto no. Adentro de la app
 * de Android se escribe una copia en Descargas cada tanto, sola, al abrirla.
 *
 * En el navegador no se puede: una descarga necesita un gesto tuyo, y bajar un
 * archivo sin que lo pidas sería una grosería. Ahí sigue el recordatorio.
 */
import { guardarArchivo, enApp } from './native.js';
import { getData, exportData, markExported } from './state.js';
import { todayKey, daysBetween } from './utils.js';

/** Cada cuántos días se guarda sola. */
export const CADA_DIAS = 7;

/** Nombre del archivo, con la fecha adentro para no pisar el anterior. */
export function nombreDeCopia(fecha = todayKey()) {
  return `rutina-rpg-auto-${fecha}.json`;
}

/**
 * ¿Toca guardar? Decide sobre datos, sin efectos, para poder probarlo.
 * @param {object} settings  los ajustes actuales
 * @param {string} hoy
 * @param {boolean} puede    si este entorno sabe guardar archivos
 * @param {boolean} hayDatos  si hay algo que valga la pena guardar
 */
export function tocaGuardar(settings, hoy = todayKey(), puede = true, hayDatos = true) {
  if (!puede) return false;
  // Una copia de una app vacía no sirve de nada y deja un archivo suelto en
  // Descargas el día que la instalás.
  if (!hayDatos) return false;
  if (settings?.autoBackup === false) return false;
  const ultimo = settings?.lastAutoBackupAt || settings?.lastExportAt;
  if (!ultimo) return true;
  return daysBetween(ultimo, hoy) >= CADA_DIAS;
}

/**
 * Guarda si corresponde. Se llama al arrancar la app.
 * @returns {?string} el nombre del archivo si guardó.
 */
export function copiaAutomatica() {
  const data = getData();
  const hayDatos = Object.keys(data.entries || {}).length > 0;
  if (!tocaGuardar(data.settings, todayKey(), enApp(), hayDatos)) return null;
  const nombre = nombreDeCopia();
  if (!guardarArchivo(nombre, exportData())) return null;
  // Se anota como copia hecha: también apaga el recordatorio de los 14 días,
  // porque efectivamente hay una copia fresca.
  data.settings.lastAutoBackupAt = todayKey();
  markExported();
  return nombre;
}
