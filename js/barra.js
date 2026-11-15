/**
 * El peso de la barra.
 *
 * Los ejercicios con barra se anotan con la barra incluida: 20 kg por lado
 * son 60 si la barra pesa 20. Pero la barra la suponés, no la pesaste, y si
 * resulta que pesa 15, todo lo que anotaste con ella está cinco kilos arriba:
 * los récords, el 1RM, el nivel de fuerza contra tu peso corporal.
 *
 * Corregirlo a mano es abrir sesión por sesión. Acá se corrige de una vez, y
 * con una sola regla: lo que no cambia son los discos. A cada serie se le
 * suma la diferencia entre la barra real y la supuesta, y nada más. No se
 * tocan las series, ni las repeticiones, ni la meta de la sesión: un día
 * cumplido sigue cumplido.
 *
 * Qué barra supone cada ejercicio queda guardado (`settings.barra`), y por
 * eso corregir dos veces lo mismo no hace nada, y volver al valor anterior
 * deshace el cambio.
 *
 * De ahí sale la única regla que hay que cuidar: los registros de una copia
 * y su anotación van siempre juntos. Una copia corregida y otra sin corregir
 * no se pueden mezclar serie por serie; por eso la fusión las lleva primero
 * a la misma barra (`alinearBarras`).
 *
 * Qué ejercicios se hacen con barra no lo decide la app: "Curl en polea baja
 * con barra" tiene la palabra y no tiene la barra. Se eligen a mano.
 */

import { GYM_TEMPLATES, perfilDeEjercicio } from './config.js';

/** Lo que pesa una barra olímpica, y lo que se supone mientras nadie diga otra cosa. */
export const BARRA_ASUMIDA = 20;
/** Fuera de esto no es una barra: es un error de tipeo. */
export const BARRA_MIN = 1;
export const BARRA_MAX = 50;

const clave = (nombre) => (nombre || '').trim().toLowerCase();
const redondear = (kg) => Math.round(kg * 100) / 100;

/** ¿Es un peso de barra creíble? */
export function barraValida(kg) {
  const n = Number(kg);
  return Number.isFinite(n) && n >= BARRA_MIN && n <= BARRA_MAX;
}

/** Con qué barra están anotados los registros de cada ejercicio corregido. */
export function barrasDe(settings) {
  const salida = new Map();
  const guardado = settings?.barra;
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return salida;
  for (const [nombre, kg] of Object.entries(guardado)) {
    if (clave(nombre) && barraValida(kg)) salida.set(clave(nombre), Number(kg));
  }
  return salida;
}

/** La barra que suponen los registros de un ejercicio. */
export function barraDe(settings, nombre) {
  return barrasDe(settings).get(clave(nombre)) ?? BARRA_ASUMIDA;
}

/** Una sesión con mancuernas o con el propio cuerpo no lleva barra. */
function llevaBarra(ex) {
  if (!ex || !clave(ex.name)) return false;
  if (ex.bw || ex.db === true) return false;
  const perfil = perfilDeEjercicio(ex.name);
  if (perfil.bw) return false;
  // Sin marca propia vale lo que diga la rutina.
  if (ex.db === undefined && perfil.db) return false;
  return true;
}

/** Recorre cada ejercicio de gimnasio que podría llevar barra. */
function recorrer(data, visitar) {
  // Una copia muy vieja puede no traer la lista de actividades: el gimnasio
  // siempre se llamó igual.
  const ids = Array.isArray(data?.activities)
    ? data.activities.filter((a) => a.kind === 'gym').map((a) => a.id)
    : ['gym'];
  for (const fecha of Object.keys(data?.entries || {}).sort()) {
    for (const id of ids) {
      const entry = data.entries[fecha]?.[id];
      if (!entry || !Array.isArray(entry.exercises)) continue;
      for (const ex of entry.exercises) {
        if (llevaBarra(ex)) visitar(ex, `${fecha}|${id}`);
      }
    }
  }
}

const ORDEN_DE_RUTINA = new Map();
GYM_TEMPLATES.forEach((t) => t.exercises.forEach((e) => {
  if (!ORDEN_DE_RUTINA.has(clave(e.name))) ORDEN_DE_RUTINA.set(clave(e.name), ORDEN_DE_RUTINA.size);
}));

/**
 * Los ejercicios que tienen algo anotado con peso y sin mancuernas: los que
 * podrían ser de barra. En el orden de la rutina, que es como los conocés.
 *
 * @returns {Array<{clave:string, nombre:string, sesiones:number, series:number, maximo:number, barra:number}>}
 */
export function candidatosDeBarra(data) {
  const barras = barrasDe(data?.settings);
  const porClave = new Map();
  recorrer(data, (ex) => {
    const conPeso = (ex.sets || []).filter((s) => Number(s?.weight) > 0);
    if (!conPeso.length) return;
    const k = clave(ex.name);
    const fila = porClave.get(k) || {
      clave: k, nombre: ex.name.trim(), sesiones: 0, series: 0, maximo: 0,
      barra: barras.get(k) ?? BARRA_ASUMIDA,
    };
    fila.sesiones += 1;
    fila.series += conPeso.length;
    fila.maximo = Math.max(fila.maximo, ...conPeso.map((s) => Number(s.weight)));
    porClave.set(k, fila);
  });
  const lugar = (f) => ORDEN_DE_RUTINA.get(f.clave) ?? Infinity;
  return [...porClave.values()].sort((a, b) => (
    lugar(a) - lugar(b) || a.nombre.localeCompare(b.nombre, 'es')
  ));
}

/**
 * El trabajo de verdad, con o sin escribir.
 *
 * @param {object} data
 * @param {{ejercicios:string[], kg:number}} cambio
 * @param {boolean} aplicar  false: sólo cuenta qué cambiaría
 */
function pasada(data, { ejercicios, kg } = {}, aplicar) {
  const resumen = { kg: Number(kg), filas: [], series: 0, sesiones: 0, sinTocar: 0 };
  if (!barraValida(kg)) return resumen;
  const real = Number(kg);
  const elegidos = new Set((ejercicios || []).map(clave).filter(Boolean));
  if (!elegidos.size) return resumen;

  const barras = barrasDe(data?.settings);
  const filas = new Map();
  const sesiones = new Set();

  recorrer(data, (ex, sesion) => {
    const k = clave(ex.name);
    if (!elegidos.has(k)) return;
    const de = barras.get(k) ?? BARRA_ASUMIDA;
    const delta = redondear(real - de);
    if (!delta) return;
    const fila = filas.get(k) || {
      clave: k, nombre: ex.name.trim(), de, a: real, delta,
      series: 0, sesiones: 0, maximoAntes: 0, maximoDespues: 0,
    };
    let tocadas = 0;
    for (const set of ex.sets || []) {
      const peso = Number(set?.weight) || 0;
      const nuevo = redondear(peso + delta);
      // Sin peso anotado no hay nada que corregir. Y si la cuenta da cero o
      // menos, esa serie no pudo incluir la barra: se deja como está.
      if (!(peso > 0) || !(nuevo > 0)) { resumen.sinTocar += 1; continue; }
      fila.maximoAntes = Math.max(fila.maximoAntes, peso);
      fila.maximoDespues = Math.max(fila.maximoDespues, nuevo);
      // Sólo el peso. La marca de tiempo del registro dice cuándo entrenaste
      // y de ella salen los logros por horario: no se toca.
      if (aplicar) set.weight = nuevo;
      tocadas += 1;
    }
    if (!tocadas) return;
    fila.series += tocadas;
    fila.sesiones += 1;
    filas.set(k, fila);
    sesiones.add(sesion);
  });

  resumen.filas = [...filas.values()];
  resumen.series = resumen.filas.reduce((n, f) => n + f.series, 0);
  resumen.sesiones = sesiones.size;

  if (aplicar && data?.settings) {
    // Se anota la barra de todo lo elegido, haya tenido series o no: es lo
    // que hace que repetir la corrección no vuelva a restar.
    const guardado = Object.fromEntries(barras);
    for (const k of elegidos) {
      if (real === BARRA_ASUMIDA) delete guardado[k];
      else guardado[k] = real;
    }
    if (Object.keys(guardado).length) data.settings.barra = guardado;
    else delete data.settings.barra;
  }
  return resumen;
}

/** Qué cambiaría, sin tocar nada. */
export function previaDeBarra(data, cambio) {
  return pasada(data, cambio, false);
}

/** Corrige los registros. Modifica `data`. */
export function corregirBarra(data, cambio) {
  return pasada(data, cambio, true);
}

/**
 * Lleva dos copias a la misma barra antes de fusionarlas.
 *
 * Corregiste en el teléfono y la copia del navegador sigue suponiendo 20: si
 * se unen registro por registro quedan sentadillas de 60 al lado de
 * sentadillas de 55 que eran la misma. Cada copia es coherente con SU
 * anotación, así que antes de unirlas se convierten las dos a una sola.
 *
 * Manda lo de acá; donde acá no hay nada anotado, vale lo que traiga el
 * archivo: una corrección explícita le gana a un "nunca lo miré".
 *
 * No modifica lo que recibe.
 *
 * @returns {{local:object, entrante:object, barra:object|null, ajustadas:number}}
 *   `ajustadas`: cuántas series de acá cambian de peso por una corrección que
 *   vino en el archivo.
 */
export function alinearBarras(local, entrante) {
  const aca = barrasDe(local?.settings);
  const alla = barrasDe(entrante?.settings);
  if (!aca.size && !alla.size) return { local, entrante, barra: null, ajustadas: 0 };

  const destino = new Map([...alla, ...aca]);
  const llevar = (data) => {
    const copia = {
      ...(data || {}),
      settings: { ...(data?.settings || {}) },
      entries: structuredClone(data?.entries || {}),
    };
    const porKg = new Map();
    // Lo que ya está en esa barra no se mueve: corregir a lo mismo es nada.
    for (const [k, kg] of destino) porKg.set(kg, [...(porKg.get(kg) || []), k]);
    let series = 0;
    for (const [kg, ejercicios] of porKg) series += corregirBarra(copia, { ejercicios, kg }).series;
    return { copia, series };
  };

  const deAca = llevar(local);
  const deAlla = llevar(entrante);
  return {
    local: deAca.copia,
    entrante: deAlla.copia,
    barra: Object.fromEntries(destino),
    ajustadas: deAca.series,
  };
}
