// Pantalla principal: el tablero de misiones del día.
import {
  el, formatValue, formatNumber, relativeDay, todayKey, addDays,
  weekStart, weekLabel, dayName, keyToDate, plural,
} from '../utils.js';
import { getState, backupVencido, diasSinBackup } from '../state.js';
import { isScheduled, goalFor } from '../derive.js';
import { templateForDay, templateById } from '../config.js';
import { ring, chip, xpBar } from '../ui/components.js';
import { openLogger } from '../ui/logger.js';
import { colorDe } from '../theme.js';

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

  // Lo que toca hoy según tu semana; el resto queda como extra, no como falta.
  const toca = state.activities.filter((a) => isScheduled(a, viewDate));
  // Incluye el gimnasio y el muay thai en sus días libres (para el día 4 opcional),
  // pero no las misiones puramente semanales como Substack.
  const extra = state.activities.filter((a) => !isScheduled(a, viewDate)
    && (a.streakMode !== 'weekly' || a.days?.length));
  const semanales = state.activities.filter((a) => a.streakMode === 'weekly');
  const hechas = toca.filter((a) => state.byActivity.get(a.id)?.byDate.get(viewDate)?.met).length;
  const dayXp = state.daily.get(viewDate)?.xp || 0;
  const perfecto = toca.length > 0 && hechas === toca.length;
  const casi = !perfecto && toca.length > 0 && hechas / toca.length >= 0.8;
  const rutina = templateForDay(keyToDate(viewDate).getDay());

  // --- Resumen del día ---
  root.append(el('div', { class: 'card', style: 'margin-bottom:4px' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px' },
      el('div', {},
        el('div', { style: 'font-weight:700', text: perfecto
          ? '¡Día perfecto! ⭐'
          : `${hechas} de ${toca.length} misiones de hoy${casi ? ' — ¡casi!' : ''}` }),
        el('div', { class: 'row__sub', text: perfecto
          ? '+50 XP de bonus por completar todo lo que tocaba'
          : casi
            ? `+20 XP por llegar al 80%. Te falta ${toca.length - hechas === 1 ? 'una' : toca.length - hechas} para el día perfecto (+50 XP)`
            : 'Desde el 80% hay bonus; completándolo todo son +50 XP' })),
      el('div', { style: 'text-align:right' },
        el('div', { class: 'stat__value', text: `${formatNumber(dayXp)}` }),
        el('div', { class: 'stat__label', text: 'XP del día' }))),
    el('div', { style: 'margin-top:10px' }, xpBar(toca.length ? hechas / toca.length : 0))));

  // --- Lo que toca hoy ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Hoy toca' }),
    el('small', { text: rutina ? rutina.short : (isToday ? 'Tocá para registrar' : 'Registro retroactivo') })));
  root.append(toca.length
    ? el('div', { class: 'quests' }, toca.map((a) => questCard(a, state, viewDate, navigate, celebrate)))
    : el('div', { class: 'empty' }, 'Hoy descansás. 😌 Igual podés registrar lo que hagas.'));

  // --- Lo que hoy no toca (se puede registrar igual) ---
  if (extra.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Hoy no toca' }), el('small', { text: 'suma igual' })));
    root.append(el('div', { class: 'quests' },
      extra.map((a) => questCard(a, state, viewDate, navigate, celebrate, { off: true }))));
  }

  // --- Progreso de la semana ---
  if (semanales.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Tu semana' }), el('small', { text: weekLabel(weekStart(viewDate)) })));
    root.append(el('div', { class: 'card', style: 'display:grid;gap:12px' },
      semanales.map((a) => {
        const st = state.byActivity.get(a.id);
        const hecho = st?.weekCount || 0;
        const meta = st?.weekTarget || 1;
        return el('button', {
          style: 'display:block;width:100%;text-align:left',
          onClick: () => openLogger(a, viewDate, (events) => { celebrate(events); navigate(); }),
        },
          el('div', { style: 'display:flex;justify-content:space-between;gap:8px;font-size:.86rem' },
            el('span', {}, `${a.icon} ${a.name}`),
            el('span', { style: `color:${hecho >= meta ? 'var(--ok)' : 'var(--muted)'}`, text: `${formatNumber(hecho)}/${meta}` })),
          el('div', { style: 'margin-top:6px' },
            el('div', { class: 'xpbar' },
              el('div', { class: 'xpbar__fill', style: `width:${Math.min(100, (hecho / meta) * 100)}%;background:${colorDe(a)}` }))));
      })));
  }

  // --- Aviso de copia de seguridad ---
  if (backupVencido()) {
    const dias = diasSinBackup();
    root.append(el('a', {
      class: 'row', href: '#/ajustes',
      style: 'margin-top:14px;border-color:color-mix(in srgb, var(--danger) 40%, var(--line));background:rgba(251,113,133,.08)',
    },
      el('span', { style: 'font-size:1.2rem' }, '⚠️'),
      el('div', { class: 'row__main' },
        el('div', { style: 'font-weight:650', text: dias === Infinity ? 'Sin copia de seguridad' : `${dias} días sin copia de seguridad` }),
        el('div', { class: 'row__sub', text: 'Tocá para exportar tu progreso' })),
      el('span', { class: 'muted' }, '›')));
  }

  // --- Últimos 7 días ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Últimos 7 días' })));
  root.append(el('div', { class: 'card' }, weekStrip(state)));

  return root;
}

function questCard(activity, state, dateKey, navigate, celebrate, { off = false } = {}) {
  const st = state.byActivity.get(activity.id);
  const day = st?.byDate.get(dateKey);
  const value = day?.value || 0;
  const isWeekly = activity.streakMode === 'weekly';
  // El gimnasio se mide contra la rutina del día: 27 series el viernes, 42 el miércoles.
  const rutina = activity.kind === 'gym'
    ? (templateById(day?.entry?.templateId) || templateForDay(keyToDate(dateKey).getDay()))
    : null;
  const goal = day?.goal ?? goalFor(activity, rutina ? { templateId: rutina.id } : null);
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
    class: `quest${met ? ' is-done' : ''}${off ? ' quest--off' : ''}`,
    style: `--c:${colorDe(activity)}`,
    onClick: () => openLogger(activity, dateKey, (events) => { celebrate(events); navigate(); }),
  },
    el('span', { class: 'quest__icon', text: activity.icon }),
    el('div', { class: 'quest__body' },
      el('div', { class: 'quest__head' },
        el('span', { class: 'quest__name', text: activity.name }),
        rutina && !met ? chip(rutina.short) : null,
        met ? el('span', { text: '✓', style: `color:${colorDe(activity)};font-weight:700` }) : null),
      meta),
    ring(pct, {
      color: colorDe(activity),
      size: 48,
      children: st?.leveled === false
        // Un hábito no tiene nivel: el anillo muestra cuánto llevás del día.
        ? el('b', { style: 'font-size:.66rem', text: met ? '✓' : `${Math.round(pct * 100)}%` })
        : el('div', { style: 'text-align:center;line-height:1' },
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
          style: `width:100%;border-radius:6px 6px 3px 3px;height:${Math.max(3, (xp / max) * 100)}%;background:${info?.perfect ? 'linear-gradient(180deg,var(--gold),var(--fire))' : xp ? 'linear-gradient(180deg,var(--accent),var(--accent-2))' : 'rgba(255,255,255,.07)'}`,
          title: `${d}: ${xp} XP`,
        }),
        el('span', { style: `font-size:.6rem;color:${d === state.today ? 'var(--text)' : 'var(--muted)'}`, text: dayName(d) }));
    }));
}

export function setViewDate(key) { viewDate = key; }
export function getViewDate() { return viewDate; }
