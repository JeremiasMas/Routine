// Progreso global: mapa de calor, XP por semana y ranking de actividades.
import { el, formatNumber, formatValue, addDays, weekStart, shortDate, monthName, keyToDate, daysBetween } from '../utils.js';
import { getState } from '../state.js';
import { stat, xpBar, chip, barChart } from '../ui/components.js';
import { colorDe, colorDeRango } from '../theme.js';
import { seccionAnalisis } from './analisis.js';

export function render() {
  const state = getState();
  const root = el('div', {});

  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Resumen' })));
  root.append(el('div', { class: 'stat-grid' },
    stat(formatNumber(state.player.xp), 'XP total'),
    stat(state.player.level, 'Nivel jugador'),
    stat(state.globalStreak, 'Racha global'),
    stat(state.perfectDays, 'Días perfectos')));

  // --- Mapa de calor del último año ---
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

  // --- Ranking de actividades ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Tus disciplinas' }), el('small', { text: 'ordenadas por XP' })));
  const ranked = [...state.byActivity.values()]
    .filter((st) => st.leveled !== false)
    .sort((a, b) => b.xp - a.xp);
  root.append(el('div', { class: 'list' }, ranked.map((st) => el('a', {
    class: 'row', href: `#/actividad/${st.id}`, style: `--c:${colorDe(st.activity)}`,
  },
    el('span', { style: 'font-size:1.3rem', text: st.activity.icon }),
    el('div', { class: 'row__main' },
      el('div', { style: 'display:flex;gap:8px;align-items:center' },
        el('span', { text: st.activity.name }),
        chip(st.tier.name, 'chip--tier', `--t:${colorDe(st.activity)}`)),
      el('div', { style: 'margin-top:6px' }, xpBar(st.level.pct)),
      el('div', { class: 'row__sub', style: 'margin-top:4px', text: `Nivel ${st.level.level} · ${formatNumber(st.xp)} XP · ${formatValue(st.total, st.activity.unit)} en total` })),
    el('span', { class: 'muted', text: '›' })))));

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
