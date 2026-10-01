/**
 * Días libres declarados.
 *
 * Los escudos cubren un despiste suelto, pero no un viaje ni una gripe: se
 * gastan los dos y la racha se corta igual. Un día declarado libre no suma ni
 * rompe nada — sale del cálculo como si no existiera.
 *
 * La diferencia con no hacer nada es la intención: una racha tiene sentido
 * como medida de constancia, y estar diez días con fiebre no es falta de
 * constancia. Lo que no hace es regalar XP: descansar no es entrenar.
 *
 * Hay dos formas de declarar un día, y la diferencia es de intención:
 *
 * - **Vacaciones**: un tramo de días que sale del cálculo. Un viaje, una gripe,
 *   una semana de mudanza. Por defecto cubre todo, pero se puede acotar a
 *   algunas disciplinas: irse de viaje sin gimnasio no es irse sin caminar.
 * - **Excusa**: un día y una disciplina. El martes que no llegaste a muay thai
 *   por un evento de trabajo. Perdonar el día entero por eso vaciaría la racha
 *   de sentido tanto como cortarla.
 *
 * El motor no mira el tipo: lo que decide qué se perdona es el alcance. El tipo
 * está para poder nombrarlos distinto y para no fusionar dos cosas que uno
 * declaró por razones distintas.
 */

import { esFechaValida } from './utils.js';

/** Los dos tipos de tramo. El primero es el que valen los tramos sin tipo. */
export const TIPOS = ['vacaciones', 'excusa'];

/**
 * Un tramo guardado: {desde, hasta, tipo, motivo, actividades?}. Las fechas son
 * inclusivas. Sin `actividades` el tramo cubre el día entero, que es lo que
 * valen los tramos viejos guardados antes de que existieran las excepciones
 * por disciplina.
 */
export function normalizar(tramo) {
  if (!tramo?.desde) return null;
  const desde = String(tramo.desde);
  const hasta = String(tramo.hasta || tramo.desde);
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return null;
  const actividades = limpiarActividades(tramo.actividades);
  // Si vienen al revés, se ordenan en vez de descartarlos.
  const t = {
    desde: desde <= hasta ? desde : hasta,
    hasta: desde <= hasta ? hasta : desde,
    tipo: tipoDe(tramo),
    motivo: String(tramo.motivo || '').slice(0, 60),
  };
  // La clave sólo aparece cuando hay algo que limitar: así un tramo de día
  // entero se guarda exactamente igual que antes.
  if (actividades.length) t.actividades = actividades;
  return t;
}

/**
 * El tipo de un tramo. Lo que no lo dice se deduce del alcance, que es lo que
 * deja bien nombrados los tramos guardados antes de que el tipo existiera.
 */
function tipoDe(tramo) {
  if (TIPOS.includes(tramo?.tipo)) return tramo.tipo;
  return limpiarActividades(tramo?.actividades).length ? 'excusa' : 'vacaciones';
}

/** Los ids de actividad de un tramo, ordenados y sin repetidos ni basura. */
export function limpiarActividades(valor) {
  if (!Array.isArray(valor)) return [];
  const ids = valor.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  return [...new Set(ids)].sort();
}

/** Los tramos válidos, ordenados y sin los que no se entienden. */
export function tramos(lista) {
  return (lista || []).map(normalizar).filter(Boolean).sort(porFecha);
}

/**
 * ¿Este día está declarado libre?
 *
 * Sin `actividadId` la pregunta es por el día entero, y sólo la contestan los
 * tramos que cubren todo: un permiso que protege nada más el muay thai no
 * convierte el martes en día libre.
 */
export function esLibre(lista, fecha, actividadId = null) {
  return tramos(lista).some((t) => cubre(t, fecha, actividadId));
}

/** El tramo que cubre un día, para poder decir por qué. */
export function tramoDe(lista, fecha, actividadId = null) {
  return tramos(lista).find((t) => cubre(t, fecha, actividadId)) || null;
}

/** ¿Este tramo cubre ese día para esa disciplina? */
function cubre(t, fecha, actividadId) {
  if (!(fecha >= t.desde && fecha <= t.hasta)) return false;
  if (!t.actividades) return true;
  return typeof actividadId === 'string' && t.actividades.includes(actividadId);
}

/** Cuántos días cubre un tramo, contando los dos extremos. */
export function largo(tramo) {
  const t = normalizar(tramo);
  if (!t) return 0;
  const ms = Date.parse(`${t.hasta}T00:00:00Z`) - Date.parse(`${t.desde}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

/**
 * Agrega un tramo fusionando con los que se tocan, para que no queden
 * solapados ni pegados: dos tramos contiguos son un tramo.
 *
 * Sólo se fusionan los que cubren exactamente lo mismo. Juntar un permiso de
 * muay thai con uno de día entero le regalaría al primero las disciplinas del
 * segundo, o al segundo le sacaría las que ya tenía perdonadas.
 */
export function agregar(lista, nuevo) {
  const t = normalizar(nuevo);
  if (!t) return tramos(lista);

  const grupos = new Map();
  for (const actual of [...tramos(lista), t]) {
    const k = claveDe(actual);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(actual);
  }

  const salida = [];
  for (const grupo of grupos.values()) {
    const fusionados = [];
    for (const actual of grupo.sort(porFecha)) {
      const ultimo = fusionados[fusionados.length - 1];
      const pegados = ultimo && diaSiguiente(ultimo.hasta) >= actual.desde;
      if (pegados) {
        ultimo.hasta = ultimo.hasta >= actual.hasta ? ultimo.hasta : actual.hasta;
        if (!ultimo.motivo && actual.motivo) ultimo.motivo = actual.motivo;
      } else {
        fusionados.push({ ...actual });
      }
    }
    salida.push(...fusionados);
  }
  return salida.sort(porFecha);
}

/**
 * Saca un tramo.
 *
 * Con el tramo entero saca exactamente ése: el mismo día puede tener unas
 * vacaciones y una excusa de muay thai, y borrar las dos de un toque sería
 * borrar lo que no se pidió. Con una fecha suelta saca todos los que arrancan
 * ese día.
 */
export function quitar(lista, cual) {
  if (typeof cual === 'string') return tramos(lista).filter((t) => t.desde !== cual);
  const t = normalizar(cual);
  if (!t) return tramos(lista);
  const k = claveDe(t);
  return tramos(lista).filter((x) => !(x.desde === t.desde && claveDe(x) === k));
}

/**
 * Qué es y qué cubre un tramo, como texto comparable. Es lo que decide si dos
 * tramos son "el mismo descanso": unas vacaciones y una excusa del mismo día
 * no lo son, aunque cubran lo mismo.
 */
export function claveDe(tramo) {
  const actividades = limpiarActividades(tramo?.actividades);
  return `${tipoDe(tramo)}:${actividades.join('|')}`;
}

function porFecha(a, b) {
  return a.desde.localeCompare(b.desde) || claveDe(a).localeCompare(claveDe(b));
}

function diaSiguiente(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
