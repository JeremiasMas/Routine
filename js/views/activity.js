// Detalle de una actividad: su nivel, su historia y sus récords.
import { el, formatValue, formatNumber, shortDate, addDays, relativeDay, plural, scheduleLabel } from '../utils.js';
import { getState } from '../state.js';
import { ring, chip, xpBar, stat, barChart, lineChart } from '../ui/components.js';
import { openLogger } from '../ui/logger.js';
import { xpToNextLevel } from '../xp.js';
import { bodySummary, bodyDelta } from '../body.js';
import { getData } from '../state.js';

export function render({ params, navigate, celebrate }) {
  const state = getState();
  const st = state.byActivity.get(params.id);
  if (!st) {
    return el('div', { class: 'empty' }, 'Esa actividad ya no existe.',
      el('div', { style: 'margin-top:12px' }, el('a', { class: 'btn', href: '#/' }, 'Volver')));
  }
  const a = st.activity;
  const root = el('div', {});
  root.append(el('a', { class: 'back', href: '#/' }, '‹ Volver al tablero'));

  // --- Cabecera con nivel ---
  root.append(el('div', { class: 'card', style: `--c:${a.color}` },
    el('div', { style: 'display:flex;gap:14px;align-items:center' },
      ring(st.level.pct, { size: 68, stroke: 6, color: a.color,
        children: el('div', { style: 'text-align:center' },
          el('b', { style: 'font-size:1.2rem;display:block;line-height:1', text: String(st.level.level) }),
          el('span', { style: 'font-size:.5rem;letter-spacing:.12em;color:var(--muted)', text: 'NIVEL' })) }),
      el('div', { style: 'flex:1;min-width:0' },
        el('h1', { style: 'font-size:1.2rem', text: `${a.icon} ${a.name}` }),
        el('div', { class: 'quest__meta', style: 'margin-top:6px' },
          chip(st.tier.name, 'chip--tier', `--t:${st.tier.color}`),
          chip(`📅 ${a.streakMode === 'weekly' && !a.days?.length
            ? `${a.weeklyTarget}× por semana`
            : scheduleLabel(a.days)}`),
          st.streak > 0 ? chip(`🔥 ${a.streakMode === 'weekly'
            ? plural(st.streak, 'semana', 'semanas')
            : plural(st.streak, 'día', 'días')}`, 'chip--fire') : null,
          st.shields > 0 ? chip(`🛡 ${plural(st.shields, 'escudo', 'escudos')}`, 'chip--shield') : null))),
    el('div', { style: 'margin-top:12px' },
      xpBar(st.level.pct, { left: `${formatNumber(st.level.into)} / ${formatNumber(st.level.need)} XP`, right: `Nivel ${st.level.level + 1} en ${formatNumber(st.level.need - st.level.into)} XP` })),
    a.motto ? el('p', { class: 'hint', style: 'margin-top:10px;font-style:italic', text: `“${a.motto}”` }) : null));

  root.append(el('div', { style: 'margin-top:12px' },
    el('button', { class: 'btn btn--primary btn--block', style: `--c:${a.color}`,
      onClick: () => openLogger(a, state.today, (events) => { celebrate(events); navigate(); }) },
      `Registrar ${relativeDay(state.today).toLowerCase()}`)));

  if (a.kind === 'body') {
    root.append(bodySection(st));
    return root;
  }

  // --- Números ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Tus números' })));
  root.append(el('div', { class: 'stat-grid' },
    stat(formatValue(st.total, a.unit), 'Acumulado'),
    a.kind === 'gym'
      ? stat(st.volume >= 10000
          ? `${formatNumber(Math.round(st.volume / 100) / 10)} t`
          : `${formatNumber(st.volume)} kg`, 'Tonelaje')
      : stat(st.activeDays, 'Días activos'),
    stat(formatNumber(st.xp), 'XP total'),
    stat(st.bestStreak, a.streakMode === 'weekly' ? 'Mejor racha (sem.)' : 'Mejor racha (días)')));

  if (a.kind === 'gym') {
    root.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('div', { class: 'row__main' },
        el('div', { text: 'Sesiones completadas' }),
        el('div', { class: 'row__sub', text: `${st.weekCount} de ${st.weekTarget} esta semana` })),
      el('div', { class: 'row__value', text: formatNumber(st.activeDays) })));
  }

  // En el gimnasio la "mejor marca" en series no dice nada: el tonelaje y los
  // récords por ejercicio cuentan mucho mejor la historia.
  if (st.best > 0 && a.kind !== 'gym') {
    root.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('div', { class: 'row__main' },
        el('div', { text: 'Tu mejor marca' }),
        el('div', { class: 'row__sub', text: st.bestDate ? shortDate(st.bestDate) : '' })),
      el('div', { class: 'row__value', text: formatValue(st.best, a.unit) })));
  }

  // --- Últimos 30 días ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Últimos 30 días' })));
  const points = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(state.today, i - 29);
    const d = st.byDate.get(date);
    return { label: shortDate(date), short: i % 7 === 0 ? shortDate(date) : '', value: d?.value || 0, met: d?.met };
  });
  root.append(el('div', { class: 'card' }, barChart(points, { color: a.color, labelEvery: 1 }),
    el('p', { class: 'hint', style: 'margin-top:8px', text: `Las barras tenues quedaron por debajo de la meta de ${formatValue(a.goal, a.unit)}.` })));

  // --- Fuerza relativa ---
  if (a.kind === 'gym' && state.strength?.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Fuerza relativa' }),
      el('small', { text: `con ${formatNumber(state.bodyweight)} kg de peso` })));

    if (state.strengthOverall) {
      root.append(el('div', { class: 'card', style: 'margin-bottom:10px' },
        el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px' },
          el('div', {},
            el('div', { style: 'font-weight:700;font-size:1.05rem', text: state.strengthOverall.name }),
            el('div', { class: 'row__sub', text: state.strengthOverall.next
              ? `promedio de ${state.strengthOverall.lifts} movimientos · ${Math.round(state.strengthOverall.pct * 100)}% hacia ${state.strengthOverall.next}`
              : `promedio de ${state.strengthOverall.lifts} movimientos básicos` })),
          el('div', { style: 'font-size:1.6rem', text: '💪' })),
        el('div', { style: 'margin-top:10px' }, xpBar(state.strengthOverall.pct))));
    }

    root.append(el('div', { class: 'list' }, state.strength.map((s) => el('div', { class: 'row', style: 'display:block' },
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:baseline' },
        el('span', { style: 'font-weight:650', text: s.lift }),
        el('span', { class: 'row__value', text: `${formatNumber(s.e1rm)} kg` })),
      el('div', { class: 'quest__meta', style: 'margin-top:4px' },
        chip(s.nivel.name, 'chip--tier', `--t:${a.color}`),
        chip(`${formatNumber(s.ratio)}× tu peso`),
        s.usaPesoCorporal ? chip(s.weight > 0 ? `+${formatNumber(s.weight)} kg de lastre` : 'sin lastre') : null),
      s.nivel.next
        ? el('div', { style: 'margin-top:8px' },
            xpBar(s.nivel.pct),
            el('div', { class: 'row__sub', style: 'margin-top:4px', text: `${s.nivel.next} a los ${formatNumber(s.objetivo)} kg — te faltan ${formatNumber(s.falta)} kg` }))
        : el('div', { class: 'row__sub', style: 'margin-top:6px', text: 'Nivel máximo de la escala. 🐐' })))));

    root.append(el('p', { class: 'hint', style: 'margin-top:10px' },
      'El 1RM se estima con la fórmula de Epley a partir de tu mejor serie. Los niveles son referencias generales: varían con el peso corporal y la técnica, así que sirven para ubicarte y ver la progresión, no para el decimal.'));
  }

  // --- Récords del gimnasio ---
  if (a.kind === 'gym' && st.recordList.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Récords personales' }),
      st.prCount > 0 ? el('small', { text: `${st.prCount} superados` }) : null));
    root.append(el('div', { class: 'list' },
      st.recordList.map((r) => el('div', { class: 'row' },
        el('div', { class: 'row__main' },
          el('div', { text: r.name }),
          el('div', { class: 'row__sub', text: r.bw
            ? `${r.weight > 0 ? `+${r.weight} kg` : 'sin lastre'} × ${r.reps} reps · ${formatNumber(r.load)} kg movidos · ${shortDate(r.date)}`
            : `${r.weight} kg × ${r.reps} reps · ${shortDate(r.date)}` })),
        el('div', { class: 'row__value', text: `${r.e1rm} kg` })))));
    root.append(el('p', { class: 'hint', style: 'margin-top:8px' }, 'El valor de la derecha es tu 1RM estimado (fórmula de Epley).'));
  }

  // --- Historial ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Historial' })));
  const recent = [...st.history].reverse().slice(0, 20);
  root.append(recent.length
    ? el('div', { class: 'list' }, recent.map((h) => el('button', {
        class: 'row', style: 'width:100%;text-align:left',
        onClick: () => openLogger(a, h.date, (events) => { celebrate(events); navigate(); }),
      },
      el('div', { class: 'row__main' },
        el('div', { text: relativeDay(h.date) }),
        el('div', { class: 'row__sub', text: `${formatValue(h.value, a.unit)}${h.met ? ' · meta cumplida' : ''}` })),
      el('div', { class: 'row__value', style: 'color:var(--gold)', text: `+${h.xp}` }))))
    : el('div', { class: 'empty' }, 'Todavía no registraste nada acá. ¡Es el momento!'));

  root.append(el('p', { class: 'hint', style: 'margin-top:14px' },
    `Cada nivel de ${a.name} cuesta más que el anterior: el próximo pide ${formatNumber(xpToNextLevel(st.level.level))} XP.`));

  return root;
}

/** Composición corporal: tendencia de grasa, peso y medidas. */
function bodySection(st) {
  const perfil = getData().settings;
  const mediciones = st.history
    .map((h) => ({ date: h.date, ...bodySummary(h.entry, perfil) }))
    .filter((m) => m.weight > 0 || m.fatPct != null);
  const root = el('div', {});

  if (!mediciones.length) {
    root.append(el('div', { class: 'empty' },
      'Todavía no te mediste. Necesitás una cinta métrica y dos minutos: peso, cintura y cuello.'));
    return root;
  }

  const ultima = mediciones[mediciones.length - 1];
  const previa = mediciones.length > 1 ? mediciones[mediciones.length - 2] : null;
  const delta = bodyDelta(ultima, previa);

  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Última medición' }), el('small', { text: relativeDay(ultima.date) })));
  root.append(el('div', { class: 'stat-grid' },
    stat(ultima.fatPct != null ? `${formatNumber(ultima.fatPct)}%` : '—', 'Grasa corporal'),
    stat(`${formatNumber(ultima.weight)} kg`, 'Peso'),
    stat(ultima.mass ? `${formatNumber(ultima.mass.lean)} kg` : '—', 'Masa magra'),
    stat(ultima.bmi != null ? formatNumber(ultima.bmi) : '—', 'IMC')));

  if (delta) {
    const fila = (label, valor, unidad, mejorBajando = true) => {
      if (valor == null || valor === 0) return null;
      const baja = valor < 0;
      const bien = baja === mejorBajando;
      return el('div', { class: 'row' },
        el('div', { class: 'row__main', text: label }),
        el('div', { class: 'row__value', style: `color:${bien ? 'var(--ok)' : 'var(--muted)'}` },
          `${baja ? '▼' : '▲'} ${formatNumber(Math.abs(valor))} ${unidad}`));
    };
    const filas = [
      fila('Grasa corporal', delta.fatPct, '%'),
      fila('Peso', delta.weight, 'kg'),
      fila('Cintura', delta.waist, 'cm'),
      fila('Masa magra', delta.lean, 'kg', false),
    ].filter(Boolean);
    if (filas.length) {
      root.append(el('div', { class: 'section-title' },
        el('h2', { text: 'Desde la anterior' }), el('small', { text: relativeDay(previa.date) })));
      root.append(el('div', { class: 'list' }, filas));
    }
  }

  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Grasa corporal' })));
  root.append(el('div', { class: 'card' },
    lineChart(mediciones.map((m) => ({ label: shortDate(m.date), value: m.fatPct })),
      { color: '#f472b6', suffix: '%' })));

  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Peso' })));
  root.append(el('div', { class: 'card' },
    lineChart(mediciones.map((m) => ({ label: shortDate(m.date), value: m.weight || null })),
      { color: '#7dd3fc', suffix: ' kg' })));

  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Historial de medidas' })));
  root.append(el('div', { class: 'list' }, [...mediciones].reverse().map((m) => el('div', { class: 'row' },
    el('div', { class: 'row__main' },
      el('div', { text: relativeDay(m.date) }),
      el('div', { class: 'row__sub', text: `cintura ${formatNumber(m.waist)} · cuello ${formatNumber(m.neck)}${m.hip ? ` · cadera ${formatNumber(m.hip)}` : ''} cm` })),
    el('div', { style: 'text-align:right' },
      el('div', { class: 'row__value', text: m.fatPct != null ? `${formatNumber(m.fatPct)}%` : '—' }),
      el('div', { class: 'row__sub', text: `${formatNumber(m.weight)} kg` }))))));

  root.append(el('p', { class: 'hint', style: 'margin-top:14px' },
    'El porcentaje sale del método de circunferencias de la Marina de EE.UU. Tiene un margen de error de ±3 puntos, así que lo que importa es la tendencia, no el número exacto de una medición suelta.'));
  return root;
}
