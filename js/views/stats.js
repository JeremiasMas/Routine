// Progreso global: resumen, mapa de calor, XP por semana y de dónde sale la XP.
// La lista de disciplinas la arma seccionAnalisis, que es una sola.
import { el, formatNumber, formatValue, addDays, weekStart, shortDate, monthName, keyToDate, daysBetween, plural } from '../utils.js';
import { getState } from '../state.js';
import { stat, xpBar, barChart } from '../ui/components.js';
import { seccionAnalisis } from './analisis.js';
import { resumenDeVentana, proyeccionDeRango } from '../analisis.js';
import { isScheduled } from '../derive.js';
import { esLibre } from '../pausas.js';

export function render() {
  const state = getState();
  const root = el('div', {});

  // El "Resumen" de cuatro casilleros vivía acá y repetía los cuatro números
  // que la cabecera ya muestra doscientos píxeles más arriba: XP total, nivel,
  // racha y días perfectos. Cuatro casilleros grandes para no decir nada
  // nuevo, justo donde la pantalla tiene que empezar a contarte algo.
  const rumbo = tarjetaDeRango(state);
  if (rumbo) root.append(rumbo);

  // --- Mapa de calor del último año ---
  root.append(tarjetaDeVentana(state));

  const analisis = seccionAnalisis(state);
  if (analisis) root.append(analisis);

  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Tu año' }), el('small', { text: 'XP por día' })));
  root.append(el('div', { class: 'card' }, heatmap(state)));

  // --- XP por semana ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'XP por semana' })));
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = weekStart(addDays(state.today, (i - 11) * 7));
    let xp = 0;
    for (let d = 0; d < 7; d++) xp += state.daily.get(addDays(start, d))?.xp || 0;
    return { label: shortDate(start), short: i % 3 === 0 ? shortDate(start) : '', value: xp, met: true };
  });
  root.append(el('div', { class: 'card' }, barChart(weeks, { color: 'var(--accent-2)' })));

  // El ranking de actividades vivía acá abajo y repetía las mismas ocho filas
  // que "Dónde estás": emoji, nombre y rango, con el gimnasio mostrando dos
  // nombres del mismo escalón. Ahora es una sola lista, la de arriba.

  // --- Desglose de la XP ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'De dónde sale tu XP' })));
  root.append(el('div', { class: 'card' },
    el('div', { class: 'list' },
      breakdownRow('Actividades', state.activityXp, state.player.xp),
      breakdownRow('Bonus (días perfectos y récords)', state.bonusXp, state.player.xp),
      breakdownRow('Logros desbloqueados', state.achievementXp, state.player.xp))));

  return root;
}

function breakdownRow(label, value, total) {
  const pct = total > 0 ? value / total : 0;
  return el('div', { class: 'row' },
    el('div', { class: 'row__main' },
      el('div', { text: label }),
      el('div', { style: 'margin-top:6px' }, xpBar(pct))),
    el('div', { class: 'row__value', text: formatNumber(value) }));
}

function heatmap(state) {
  const weeksBack = 26;
  const start = weekStart(addDays(state.today, -weeksBack * 7));
  const totalDays = daysBetween(start, state.today) + 1;
  const max = Math.max(60, ...[...state.daily.values()].map((d) => d.xp));
  const grid = el('div', { class: 'heatmap' });
  const months = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const info = state.daily.get(date);
    const xp = info?.xp || 0;
    const intensity = xp > 0 ? 0.22 + Math.min(1, xp / max) * 0.78 : 0;
    const color = info?.perfect
      ? 'var(--gold)'
      : xp > 0 ? `color-mix(in srgb, var(--heat) ${Math.round(intensity * 100)}%, rgba(255,255,255,.06))` : '';
    grid.append(el('div', {
      class: 'heatmap__cell',
      style: color ? `background:${color}` : '',
      title: `${date}: ${xp} XP${info?.perfect ? ' · día perfecto' : ''}`,
    }));
    const d = keyToDate(date);
    if (d.getDate() <= 7 && d.getDay() === 1) months.push(monthName(d.getMonth()));
  }
  return el('div', {},
    grid,
    el('div', { class: 'heatmap__legend' },
      el('span', { text: 'menos' }),
      ...[0.15, 0.4, 0.7, 1].map((i) => el('span', {
        class: 'heatmap__cell',
        style: `background:color-mix(in srgb, var(--heat) ${i * 100}%, rgba(255,255,255,.06))`,
      })),
      el('span', { class: 'heatmap__cell', style: 'background:var(--gold)' }),
      el('span', { text: 'día perfecto' })));
}


/**
 * El cierre de la semana. La app dice todo el tiempo cómo vas hoy y nunca te
 * hace una devolución; esto mira la semana entera y la compara con la
 * anterior. Hasta el domingo muestra la semana en curso, que todavía se puede
 * cambiar; el lunes ya muestra la cerrada.
 */
/**
 * Cómo venís, contra cómo venías: siete días cerrados contra los siete
 * anteriores.
 *
 * Era la semana del calendario contra la anterior, y mientras la semana
 * estaba en curso los dos lados medían distinto. Yendo exactamente igual la
 * tarjeta marcaba -55% un lunes y -8% un domingo: nunca cero.
 *
 * Las dos ventanas van escritas en el encabezado. Un número comparado sin
 * decir contra qué no se puede creer, y "sin contar hoy" hay que decirlo o a
 * las once de la noche de un día bueno parece que no contó.
 */
function tarjetaDeVentana(state) {
  const libre = (f, id) => esLibre(state.pausas, f, id);
  const r = resumenDeVentana(state, state.today, { libre, tocaba: isScheduled });
  if (r.vacia) return el('div', {});

  const signo = (n) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));
  const rango = (a, b) => `${shortDate(a)} → ${shortDate(b)}`;

  const card = el('div', { class: 'card' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap' },
      el('div', { style: 'font-weight:700', text: rango(r.desde, r.hasta) }),
      el('div', { class: 'row__sub', text: `vs. ${rango(r.desdeAnterior, r.hastaAnterior)}` })),
    el('div', { class: 'stat-grid', style: 'margin-top:12px' },
      stat(formatNumber(r.xp), 'XP'),
      stat(signo(r.deltaXp), `vs. los ${r.largo} previos`),
      stat(r.perfectos, r.perfectos === 1 ? 'día perfecto' : 'días perfectos'),
      stat(r.diasLibres, r.diasLibres === 1 ? 'día libre' : 'días libres')));

  if (r.mejor) {
    card.append(el('p', { class: 'hint', style: 'margin-top:10px' },
      `📈 Lo que más subió: ${r.mejor.activity.name}, `,
      `${formatValue(r.mejor.total, r.mejor.activity.unit)} contra ${formatValue(r.mejor.totalAnterior, r.mejor.activity.unit)}.`));
  }
  if (r.peor) {
    card.append(el('p', { class: 'hint', style: 'margin-top:6px' },
      `📉 Lo que se cayó: ${r.peor.activity.name}, `,
      `${formatValue(r.peor.total, r.peor.activity.unit)} contra ${formatValue(r.peor.totalAnterior, r.peor.activity.unit)}. `,
      'Hoy todavía está abierto.'));
  }
  if (!r.mejor && !r.peor) {
    card.append(el('p', { class: 'hint', style: 'margin-top:10px' },
      'Mismo ritmo que la ventana anterior: ni subiste ni bajaste en nada.'));
  }

  return el('div', {},
    el('div', { class: 'section-title' },
      el('h2', { text: `Últimos ${r.largo} días` }),
      el('small', { text: 'cerrados, sin contar hoy' })),
    card);
}

/**
 * Hacia qué general vas y cuándo llega, al ritmo de las últimas cuatro
 * semanas. El rango de arriba dice dónde estás; esto dice hacia dónde.
 */
function tarjetaDeRango(state) {
  const p = proyeccionDeRango(state, state.today);
  if (!p) return null;

  const cab = (texto) => el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' },
    el('div', { style: 'font-weight:700', text: texto }));

  if (p.estado === 'ultimo') {
    // Sin el nombre, la nota ni el nivel: los tres están en la cabecera, que
    // se ve en esta misma pantalla sin scrollear. Lo único que esta tarjeta
    // sabe y la cabecera no es que la escalera se terminó.
    return el('div', { class: 'card', style: 'margin-top:10px' },
      cab('Último rango'),
      el('p', { class: 'hint', style: 'margin-top:6px',
        text: 'Llegaste al final de la escalera. De acá en adelante lo que sube es el nivel.' }));
  }

  const faltan = `Te faltan ${formatNumber(p.xpFaltante)} XP para el nivel ${p.nivel}.`;
  const cuerpo = p.estado === 'en-camino'
    ? `${faltan} Al ritmo de las últimas 4 semanas (${formatNumber(p.porDia)} XP por día) cae alrededor del ${shortDate(p.fecha)}, en ${plural(p.dias, 'día', 'días')}.`
    : p.estado === 'lejos'
      ? `${faltan} Al ritmo de las últimas 4 semanas quedaría a más de dos años, así que la fecha no diría nada.`
      : `${faltan} En las últimas 4 semanas no sumaste XP, así que no hay ritmo del cual proyectar.`;

  // Sin el nombre ni la nota del rango que viene: enterarse al llegar es
  // media gracia de la escalera, y leerlo acá la quema.
  return el('div', { class: 'card', style: 'margin-top:10px' },
    cab('Próximo rango'),
    el('p', { class: 'hint', style: 'margin-top:6px', text: cuerpo }));
}
