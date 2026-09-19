// Pantalla principal: el tablero de misiones del día.
import { el, formatValue, formatNumber, relativeDay, todayKey, addDays, weekStart, weekLabel, dayName, plural } from '../utils.js';
import { getState } from '../state.js';
import { ring, chip, xpBar } from '../ui/components.js';
import { openLogger } from '../ui/logger.js';
import { entryValue } from '../derive.js';

let viewDate = todayKey();

export function render({ navigate, celebrate }) {
  const state = getState();
  const isToday = viewDate === todayKey();
  const root = el('div', {});

  // --- Navegación de fecha ---
  root.append(el('div', { class: 'date-nav' },
    el('button', { 'aria-label': 'Día anterior', onClick: () => { viewDate = addDays(viewDate, -1); navigate(); } }, '‹'),
    el('div', { style: 'display:flex;align-items:center;gap:8px' },
      el('div', { class: 'date-nav__label', text: relativeDay(viewDate) }),
      isToday ? null : el('button', {
        class: 'chip', style: 'min-height:28px;width:auto;padding:0 10px;border-radius:999px',
        onClick: () => { viewDate = todayKey(); navigate(); },
      }, 'Ir a hoy')),
    el('button', { 'aria-label': 'Día siguiente', disabled: isToday, onClick: () => { viewDate = addDays(viewDate, 1); navigate(); } }, '›')));

  const daily = state.activities.filter((a) => a.streakMode !== 'weekly');
  const weekly = state.activities.filter((a) => a.streakMode === 'weekly');
  const done = daily.filter((a) => (state.byActivity.get(a.id)?.byDate.get(viewDate)?.met)).length;
  const dayXp = state.daily.get(viewDate)?.xp || 0;

  // --- Resumen del día ---
  root.append(el('div', { class: 'card', style: 'margin-bottom:4px' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px' },
      el('div', {},
        el('div', { style: 'font-weight:700', text: done === daily.length && daily.length ? '¡Día perfecto! ⭐' : `${done} de ${daily.length} misiones diarias` }),
        el('div', { class: 'row__sub', text: done === daily.length && daily.length ? `+${50} XP de bonus por completar todo` : 'Completá todas para el bonus de día perfecto (+50 XP)' })),
      el('div', { style: 'text-align:right' },
        el('div', { class: 'stat__value', text: `${formatNumber(dayXp)}` }),
        el('div', { class: 'stat__label', text: 'XP del día' }))),
    el('div', { style: 'margin-top:10px' }, xpBar(daily.length ? done / daily.length : 0))));

  // --- Misiones diarias ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Misiones diarias' }),
    el('small', { text: isToday ? 'Tocá para registrar' : 'Registro retroactivo' })));
  root.append(el('div', { class: 'quests' },
    daily.map((a) => questCard(a, state, viewDate, navigate, celebrate))));

  // --- Misiones semanales ---
  if (weekly.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Misiones de la semana' }),
      el('small', { text: weekLabel(weekStart(viewDate)) })));
    root.append(el('div', { class: 'quests' },
      weekly.map((a) => questCard(a, state, viewDate, navigate, celebrate, true))));
  }

  // --- Últimos 7 días ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Últimos 7 días' })));
  root.append(el('div', { class: 'card' }, weekStrip(state)));

  return root;
}

function questCard(activity, state, dateKey, navigate, celebrate, isWeekly = false) {
  const st = state.byActivity.get(activity.id);
  const day = st?.byDate.get(dateKey);
  const value = day?.value || 0;
  const goal = Number(activity.goal) || 1;
  const met = value >= goal;
  const pct = Math.min(1, value / goal);

  const meta = el('div', { class: 'quest__meta' });
  meta.append(el('span', { text: value > 0 ? `${formatValue(value, activity.unit)} / ${formatValue(goal, activity.unit)}` : `Meta: ${formatValue(goal, activity.unit)}` }));
  if (day?.xp) meta.append(chip(`+${day.xp} XP`, 'chip--ok'));
  if (isWeekly && st) {
    meta.append(chip(`${formatNumber(st.weekCount)}/${st.weekTarget} esta semana`, st.weekCount >= st.weekTarget ? 'chip--ok' : ''));
  }
  if (st?.streak > 0) {
    meta.append(chip(isWeekly
      ? `🔥 ${plural(st.streak, 'semana', 'semanas')}`
      : `🔥 ${plural(st.streak, 'día', 'días')}`, 'chip--fire'));
  }
  if (st?.shields > 0) meta.append(chip(`🛡 ${st.shields}`, 'chip--shield'));

  const card = el('button', {
    class: `quest${met ? ' is-done' : ''}`,
    style: `--c:${activity.color}`,
    onClick: () => openLogger(activity, dateKey, (events) => { celebrate(events); navigate(); }),
  },
    el('span', { class: 'quest__icon', text: activity.icon }),
    el('div', { class: 'quest__body' },
      el('div', { class: 'quest__head' },
        el('span', { class: 'quest__name', text: activity.name }),
        met ? el('span', { text: '✓', style: `color:${activity.color};font-weight:700` }) : null),
      meta),
    ring(pct, {
      color: activity.color,
      size: 48,
      children: el('div', { style: 'text-align:center;line-height:1' },
        el('span', { style: 'font-size:.44rem;letter-spacing:.1em;color:var(--muted);display:block', text: 'NV' }),
        el('b', { style: 'font-size:.82rem', text: `${st?.level.level ?? 1}` })),
    }));

  // Ir al detalle con pulsación larga o clic derecho.
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); location.hash = `#/actividad/${activity.id}`; });
  return card;
}

/** Tira de los últimos 7 días con la XP de cada uno. */
function weekStrip(state) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.today, i - 6));
  const max = Math.max(1, ...days.map((d) => state.daily.get(d)?.xp || 0));
  return el('div', { style: 'display:flex;gap:6px;align-items:flex-end;height:92px' },
    days.map((d) => {
      const info = state.daily.get(d);
      const xp = info?.xp || 0;
      return el('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end' },
        el('span', { style: 'font-size:.6rem;color:var(--muted)', text: xp ? formatNumber(xp) : '' }),
        el('div', {
          style: `width:100%;border-radius:6px 6px 3px 3px;height:${Math.max(3, (xp / max) * 100)}%;background:${info?.perfect ? 'linear-gradient(180deg,#fbbf24,#f59e0b)' : xp ? 'linear-gradient(180deg,#7dd3fc,#818cf8)' : 'rgba(255,255,255,.07)'}`,
          title: `${d}: ${xp} XP`,
        }),
        el('span', { style: `font-size:.6rem;color:${d === state.today ? 'var(--text)' : 'var(--muted)'}`, text: dayName(d) }));
    }));
}

export function setViewDate(key) { viewDate = key; }
export function getViewDate() { return viewDate; }
