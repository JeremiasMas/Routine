/**
 * Las decisiones del tablero del día, separadas del DOM.
 *
 * La vista arma elementos; acá está lo que hay que decidir antes de armarlos:
 * qué dato se muestra cuando no entran todos, cómo se escribe un valor contra
 * su meta, y qué se dice arriba de todo. Nada de esto se puede probar desde
 * `today.js`, porque esa pantalla sólo existe dentro de un navegador.
 */
import { formatNumber } from './utils.js';

/** Los tres niveles de chip. Un cuarto se agrega sólo si significa algo nuevo. */
export const NIVELES = ['dato', 'mudo', 'vivo', 'urgente'];

/** Cuántos datos chicos entran al lado de la barra sin empujarla a nada. */
export const MAX_MICRO = 2;

/**
 * Un valor contra su meta, con la unidad escrita una sola vez.
 *
 * `formatValue` convierte cada número por su cuenta, y eso daba pares como
 * "900 ml / 2,2 L": dos escalas distintas en la misma frase, que obligan a
 * hacer la cuenta para saber cuánto falta. Acá manda la escala de la meta.
 */
export function parValor(valor, meta, unidad) {
  const v = Math.max(0, Number(valor) || 0);
  const m = Math.max(0, Number(meta) || 0);
  if (unidad === 'ml' && m >= 1000) return `${litros(v)} / ${litros(m)} L`;
  if (unidad === 'min' && m >= 60) return `${horas(v)} / ${horas(m)}`;
  return `${formatNumber(v)} / ${formatNumber(m)} ${unidad}`;
}

function litros(ml) { return formatNumber(Math.round(ml / 100) / 10); }

function horas(min) {
  if (min < 60) return `${formatNumber(Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Los datos chicos de una fila, en orden de utilidad y recortados a los que
 * entran.
 *
 * El orden no es decorativo: primero lo que te pide algo ahora (una racha que
 * se corta hoy, los minutos que te faltan caminar), después lo que llevás. Si
 * algo se cae por falta de lugar, que sea lo que no cambia ninguna decisión.
 *
 * @returns {{texto:string, nivel:string}[]}
 */
export function microDatos({ activity, st, day, minutos = 0, riesgo = null } = {}) {
  const met = !!day?.met;

  // Una racha en juego se lleva la fila entera: es la única frase que importa
  // y es demasiado larga para compartir el renglón con otra cosa.
  if (riesgo && !met) {
    return [{
      texto: riesgo.seCorta
        ? `🔥 ${formatNumber(riesgo.streak)} · hoy o se corta`
        : `🛡 hoy gastás ${riesgo.ultimoEscudo ? 'el último' : 'uno'}`,
      nivel: 'urgente',
    }];
  }

  const todos = [];
  if (minutos > 0 && !met) todos.push({ texto: `🚶 ${formatNumber(Math.round(minutos))} min`, nivel: 'vivo' });
  if (activity?.streakMode === 'weekly' && st) {
    const hecho = Number(st.weekCount) || 0;
    const meta = Number(st.weekTarget) || 1;
    todos.push({ texto: `${formatNumber(hecho)}/${meta} sem`, nivel: hecho >= meta ? 'dato' : 'mudo' });
  }
  if (st?.streak > 0) todos.push({ texto: `🔥 ${formatNumber(st.streak)}`, nivel: 'dato' });
  if (st?.shields > 0) todos.push({ texto: `🛡 ${formatNumber(st.shields)}`, nivel: 'dato' });
  return todos.slice(0, MAX_MICRO);
}

/**
 * El nivel, en la pastilla de la derecha.
 *
 * El agua no tiene nivel declarado y antes el anillo le mostraba el porcentaje
 * del día. En la fila eso ya lo dice la barra, así que no se repite: devuelve
 * null y la pastilla no se dibuja.
 */
export function nivelTexto(activity, st) {
  if (!st || activity?.leveled === false || st.leveled === false) return null;
  return `NV ${formatNumber(st.level?.level ?? 1)}`;
}

/**
 * El encabezado del día en tres números.
 *
 * "Desde el 80% hay bonus" es un reglamento; "faltan 4" es algo que podés
 * hacer. Los umbrales se van a la barra, que es donde se miden.
 */
export function resumenDelDia({ hechas = 0, total = 0, xp = 0 } = {}) {
  const faltan = Math.max(0, total - hechas);
  const pct = total > 0 ? hechas / total : 0;
  const perfecto = total > 0 && faltan === 0;
  // El bonus del 80% se cobra con misiones enteras: 5 de 6 son 83%, 4 no.
  const paraBonus = Math.max(0, Math.ceil(total * 0.8) - hechas);
  return {
    hechas,
    total,
    xp,
    faltan,
    pct,
    perfecto,
    paraBonus,
    titulo: perfecto ? '¡Día perfecto! ⭐' : 'Misiones',
    marcas: perfecto ? '+50 XP de bonus' : '80% → +20 XP · 100% → +50 XP',
    porcentaje: `${Math.round(pct * 100)}%`,
  };
}

/** Lo que queda por hacer y lo que ya está, en ese orden. */
export function partirPorHechas(misiones, estaHecha) {
  const pendientes = [];
  const hechas = [];
  for (const m of misiones || []) (estaHecha(m) ? hechas : pendientes).push(m);
  return { pendientes, hechas };
}

/**
 * Si la semana ya arrancó. Mientras está toda en cero, la sección ocupa media
 * pantalla para decir que no hay nada: se muestra plegada y se abre sola en
 * cuanto hay una hecha.
 */
export function semanaArrancada(estados) {
  return (estados || []).some((st) => (Number(st?.weekCount) || 0) > 0);
}
