/**
 * Las barras.
 *
 * En el gimnasio uno carga discos de a pares y piensa en "20 por lado". Lo
 * que vale para el récord, el 1RM y el nivel de fuerza es el total con la
 * barra adentro, y hasta ahora ese total había que sumarlo de cabeza cada
 * vez, en cada serie, con la barra que tocara.
 *
 * Acá se dice una sola vez con qué barra se hace cada ejercicio y cuánto
 * pesa. Desde ahí el registrador pide el peso por lado y la suma la hace la
 * app. Lo que se guarda sigue siendo el total: nada más cambia de forma.
 *
 * Decir con qué barra hacés un ejercicio NO toca lo ya anotado. Esos totales
 * los sumaste vos con esa misma barra, así que ya están bien.
 *
 * Hay un solo caso en que lo anotado sí se corrige, y es explícito: cuando
 * la barra que venías sumando no era la real ("la contaba como 20 y pesa
 * 15"). Ahí todos los totales de ese ejercicio están corridos por la misma
 * diferencia, y se corrigen de una vez con una sola regla: los discos no
 * cambian. No se tocan series, repeticiones ni metas: un día cumplido sigue
 * cumplido.
 *
 * De cada ejercicio marcado se guarda la barra (`kg`) y la barra con la que
 * estaba anotado antes de marcarlo (`antes`). Con las dos se puede deshacer,
 * y se pueden fusionar dos copias aunque una esté corregida y la otra no
 * (`alinearBarras`).
 *
 * Qué ejercicios se hacen con barra no lo decide la app: "Curl en polea baja
 * con barra" tiene la palabra y no tiene la barra. Se eligen a mano.
 */

import { GYM_TEMPLATES, perfilDeEjercicio } from './config.js';
import { formatPreciso } from './utils.js';

/** Lo que pesa una barra olímpica. Sólo una sugerencia para el casillero. */
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

/**
 * Lo guardado, ya limpio: ejercicio -> { kg, antes }.
 *
 * La primera versión guardaba sólo un número, y sólo cuando había corregido
 * registros que suponían una barra de 20: se lee con ese significado.
 */
function guardadas(settings) {
  const salida = new Map();
  const guardado = settings?.barra;
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return salida;
  for (const [nombre, valor] of Object.entries(guardado)) {
    if (!clave(nombre)) continue;
    const viejo = typeof valor === 'number' || typeof valor === 'string';
    const kg = viejo ? valor : valor?.kg;
    if (!barraValida(kg)) continue;
    const antes = viejo ? BARRA_ASUMIDA : valor?.antes;
    salida.set(clave(nombre), {
      kg: Number(kg),
      antes: barraValida(antes) ? Number(antes) : Number(kg),
    });
  }
  return salida;
}

/** Con qué barra se hace cada ejercicio marcado: ejercicio -> kg. */
export function barrasDe(settings) {
  return new Map([...guardadas(settings)].map(([k, v]) => [k, v.kg]));
}

/** La barra de un ejercicio, o null si no está marcado como de barra. */
export function barraDe(settings, nombre) {
  return barrasDe(settings).get(clave(nombre)) ?? null;
}

/**
 * Del total al peso por lado. Devuelve null cuando no hay cuenta posible:
 * sin total, o con un total más liviano que la barra sola.
 */
export function aLado(total, barra) {
  if (!barraValida(barra)) return null;
  // Un casillero vacío vale cero y algo que no es un número no vale nada:
  // los dos quedan por debajo de la barra, y caen en el mismo null.
  const lado = Math.round(((Number(total) - Number(barra)) / 2) * 1000) / 1000;
  return lado >= 0 ? lado : null;
}

/** Del peso por lado al total, que es lo que se guarda. */
export function deLado(lado, barra) {
  if (lado === '' || lado === null || lado === undefined) return '';
  const l = Number(lado);
  if (!Number.isFinite(l) || l < 0 || !barraValida(barra)) return '';
  return redondear(l * 2 + Number(barra));
}

/**
 * Un peso dicho como se carga: "21,25 kg por lado". Devuelve null si el
 * ejercicio no tiene barra, para que quien llama diga el total de siempre.
 * Con discos de 1,25 el lado tiene dos decimales: redondear a uno lo cambia.
 */
export function porLado(total, perfil) {
  if (perfil?.barra === null || perfil?.barra === undefined) return null;
  const lado = aLado(total, perfil.barra);
  return lado === null ? null : `${formatPreciso(lado, 3)} kg por lado`;
}

/**
 * La carga de un ejercicio ya hecho, dicha como se cargó: por lado, con el
 * total al lado cuando es uno solo. null si no hay barra o si algún peso no
 * tiene lado (más liviano que la barra): ahí vale el total de siempre.
 */
export function resumenDeCarga(pesos, barra) {
  if (barra === null || barra === undefined || !pesos?.length) return null;
  const lados = pesos.map((x) => aLado(x, barra));
  if (lados.some((l) => l === null)) return null;
  const decir = (n) => formatPreciso(n, 3);
  return lados.length === 1
    ? `${decir(lados[0])} por lado (${decir(pesos[0])} kg)`
    : `${decir(Math.min(...lados))}–${decir(Math.max(...lados))} por lado`;
}

/** Una sesión con mancuernas o con el propio cuerpo no lleva barra. */
export function llevaBarra(ex) {
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
 * `ultimo` es el peso de la última serie con peso: sirve para mostrar cuánto
 * sería por lado y que se vea a simple vista si la barra está bien puesta.
 *
 * @returns {Array<{clave:string, nombre:string, sesiones:number, series:number,
 *   maximo:number, ultimo:number, barra:number|null}>}
 */
export function candidatosDeBarra(data) {
  const barras = barrasDe(data?.settings);
  const porClave = new Map();
  recorrer(data, (ex) => {
    const conPeso = (ex.sets || []).filter((s) => Number(s?.weight) > 0);
    if (!conPeso.length) return;
    const k = clave(ex.name);
    const fila = porClave.get(k) || {
      clave: k, nombre: ex.name.trim(), sesiones: 0, series: 0, maximo: 0, ultimo: 0,
      barra: barras.get(k) ?? null,
    };
    fila.sesiones += 1;
    fila.series += conPeso.length;
    fila.maximo = Math.max(fila.maximo, ...conPeso.map((s) => Number(s.weight)));
    // Las fechas se recorren en orden: la última vista es la más reciente.
    fila.ultimo = Number(conPeso[conPeso.length - 1].weight);
    porClave.set(k, fila);
  });
  const lugar = (f) => ORDEN_DE_RUTINA.get(f.clave) ?? Infinity;
  return [...porClave.values()].sort((a, b) => (
    lugar(a) - lugar(b) || a.nombre.localeCompare(b.nombre, 'es')
  ));
}

/** Suma `delta` a cada serie con peso de los ejercicios pedidos. */
function correr(data, deltas, aplicar) {
  const filas = new Map();
  const sesiones = new Set();
  let sinTocar = 0;
  recorrer(data, (ex, sesion) => {
    const k = clave(ex.name);
    const cambio = deltas.get(k);
    if (!cambio || !cambio.delta) return;
    const fila = filas.get(k) || {
      clave: k, nombre: ex.name.trim(), de: cambio.de, a: cambio.a, delta: cambio.delta,
      series: 0, sesiones: 0, maximoAntes: 0, maximoDespues: 0,
    };
    let tocadas = 0;
    for (const set of ex.sets || []) {
      const peso = Number(set?.weight) || 0;
      const nuevo = redondear(peso + cambio.delta);
      // Sin peso anotado no hay nada que corregir. Y si la cuenta da cero o
      // menos, esa serie no pudo incluir la barra: se deja como está.
      if (!(peso > 0) || !(nuevo > 0)) { sinTocar += 1; continue; }
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
  const lista = [...filas.values()];
  return {
    filas: lista,
    series: lista.reduce((n, f) => n + f.series, 0),
    sesiones: sesiones.size,
    sinTocar,
  };
}

function guardar(data, mapa) {
  if (!data?.settings) return;
  if (mapa.size) data.settings.barra = Object.fromEntries(mapa);
  else delete data.settings.barra;
}

/**
 * El trabajo de verdad, con o sin escribir.
 *
 * @param {object} data
 * @param {{ejercicios:string[], kg:number, antes?:number}} cambio
 *   `antes`: con qué barra venías sumando lo ya anotado. Sólo cuenta para lo
 *   que todavía no está marcado; lo marcado ya se sabe con cuál está. Sin
 *   `antes` se entiende que sumabas con esta misma, y no se toca nada.
 * @param {boolean} aplicar  false: sólo cuenta qué cambiaría
 */
function pasada(data, { ejercicios, kg, antes } = {}, aplicar) {
  const vacio = { kg: Number(kg), marcados: 0, filas: [], series: 0, sesiones: 0, sinTocar: 0 };
  if (!barraValida(kg)) return vacio;
  const real = Number(kg);
  const elegidos = [...new Set((ejercicios || []).map(clave).filter(Boolean))];
  if (!elegidos.length) return vacio;

  const mapa = guardadas(data?.settings);
  const deltas = new Map();
  let marcados = 0;
  for (const k of elegidos) {
    const ya = mapa.get(k);
    const de = ya ? ya.kg : (barraValida(antes) ? Number(antes) : real);
    deltas.set(k, { de, a: real, delta: redondear(real - de) });
    if (!ya || ya.kg !== real) marcados += 1;
    // `antes` se escribe una sola vez, al marcar: es con qué barra están las
    // copias que nunca se enteraron de esta, y eso no cambia después.
    mapa.set(k, { kg: real, antes: ya ? ya.antes : de });
  }

  const resumen = { kg: real, marcados, ...correr(data, deltas, aplicar) };
  if (aplicar) guardar(data, mapa);
  return resumen;
}

/** Qué cambiaría, sin tocar nada. */
export function previaDeBarra(data, cambio) {
  return pasada(data, cambio, false);
}

/**
 * Marca ejercicios como hechos con una barra de `kg`. Modifica `data`.
 * Sólo cambia pesos ya anotados si la barra que suponían era otra.
 */
export function corregirBarra(data, cambio) {
  return pasada(data, cambio, true);
}

/**
 * Desmarca ejercicios: vuelven a anotarse por total, y lo que se hubiera
 * corregido vuelve a como estaba antes de marcarlos. Modifica `data`.
 */
export function quitarBarra(data, ejercicios) {
  const mapa = guardadas(data?.settings);
  const deltas = new Map();
  for (const k of new Set((ejercicios || []).map(clave))) {
    const ya = mapa.get(k);
    if (!ya) continue;
    deltas.set(k, { de: ya.kg, a: ya.antes, delta: redondear(ya.antes - ya.kg) });
    mapa.delete(k);
  }
  const resumen = { quitados: deltas.size, ...correr(data, deltas, true) };
  if (deltas.size) guardar(data, mapa);
  return resumen;
}

/**
 * Lleva dos copias a la misma barra antes de fusionarlas.
 *
 * Corregiste en el teléfono ("la contaba como 20 y pesa 15") y la copia del
 * navegador sigue con los totales viejos: si se unen registro por registro
 * quedan sentadillas de 60 al lado de sentadillas de 55 que eran la misma.
 * Cada copia es coherente con SU anotación, así que antes de unirlas se
 * convierten las dos a una sola.
 *
 * Manda lo de acá; lo que acá no está marcado, se marca como en el archivo.
 * Una copia que no tiene marcado un ejercicio lo tiene anotado con la barra
 * de `antes`, que es justo para lo que se guarda.
 *
 * No modifica lo que recibe.
 *
 * @returns {{local:object, entrante:object, barra:object|null, ajustadas:number}}
 *   `ajustadas`: cuántas series de acá cambian de peso por una corrección que
 *   vino en el archivo.
 */
export function alinearBarras(local, entrante) {
  const aca = guardadas(local?.settings);
  const alla = guardadas(entrante?.settings);
  if (!aca.size && !alla.size) return { local, entrante, barra: null, ajustadas: 0 };

  const destino = new Map([...alla, ...aca]);
  const llevar = (data) => {
    const copia = {
      ...(data || {}),
      settings: { ...(data?.settings || {}) },
      entries: structuredClone(data?.entries || {}),
    };
    let series = 0;
    for (const [k, { kg, antes }] of destino) {
      // Lo marcado se sabe con qué barra está y `antes` no le hace nada; lo
      // no marcado está con la de antes.
      series += corregirBarra(copia, { ejercicios: [k], kg, antes }).series;
    }
    return { copia, series };
  };

  const deAca = llevar(local);
  const deAlla = llevar(entrante);
  return {
    local: deAca.copia,
    entrante: deAlla.copia,
    barra: deAca.copia.settings.barra,
    ajustadas: deAca.series,
  };
}
