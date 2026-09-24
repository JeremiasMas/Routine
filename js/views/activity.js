// Detalle de una actividad: su nivel, su historia y sus récords.
import { el, formatValue, formatNumber, formatPreciso, shortDate, addDays, relativeDay, plural, scheduleLabel, keyToDate, weekdayShort } from '../utils.js';
import { getState } from '../state.js';
import { ring, chip, xpBar, stat, barChart, lineChart } from '../ui/components.js';
import { openLogger } from '../ui/logger.js';
import { openWalk, walkDisponible } from '../ui/walk.js';
import { enApp } from '../native.js';
import { colorDe, colorDeRango } from '../theme.js';
import { EQUIV_MANCUERNA } from '../strength.js';
import { explicarProgreso } from '../analisis.js';
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
  const esHabito = st.leveled === false;
  const anilloCentro = esHabito
    ? el('b', { style: 'font-size:.9rem', text: `${st.streak}` })
    : a.rankBy === 'strength' && st.strengthOverall
      ? el('div', { style: 'text-align:center' },
          el('b', { style: 'font-size:1.2rem;display:block;line-height:1', text: String(st.level.level) }),
          el('span', { style: 'font-size:.5rem;letter-spacing:.1em;color:var(--muted)', text: 'FUERZA' }))
    : a.rankBy === 'bodyfat' && st.bodyFat != null
      ? el('div', { style: 'text-align:center' },
          el('b', { style: 'font-size:1rem;display:block;line-height:1', text: `${formatNumber(st.bodyFat)}%` }),
          el('span', { style: 'font-size:.5rem;letter-spacing:.1em;color:var(--muted)', text: 'GRASA' }))
      : el('div', { style: 'text-align:center' },
          el('b', { style: 'font-size:1.2rem;display:block;line-height:1', text: String(st.level.level) }),
          el('span', { style: 'font-size:.5rem;letter-spacing:.12em;color:var(--muted)', text: 'NIVEL' }));

  root.append(el('div', { class: 'card', style: `--c:${colorDe(a)}` },
    el('div', { style: 'display:flex;gap:14px;align-items:center' },
      ring(esHabito ? (st.doneToday ? 1 : 0) : st.level.pct, { size: 68, stroke: 6, color: colorDeRango(st.tier, st.tier?.index) || colorDe(a),
        children: anilloCentro }),
      el('div', { style: 'flex:1;min-width:0' },
        el('h1', { style: 'font-size:1.2rem', text: `${a.icon} ${a.name}` }),
        el('div', { class: 'quest__meta', style: 'margin-top:6px' },
          esHabito ? null : chip(st.tier.name, 'chip--tier', `--t:${colorDeRango(st.tier, st.tier.index) || colorDe(a)}`),
          chip(`📅 ${a.streakMode === 'weekly' && !a.days?.length
            ? `${a.weeklyTarget}× por semana`
            : scheduleLabel(a.days)}`),
          st.streak > 0 ? chip(`🔥 ${a.streakMode === 'weekly'
            ? plural(st.streak, 'semana', 'semanas')
            : plural(st.streak, 'día', 'días')}`, 'chip--fire') : null,
          st.shields > 0 ? chip(`🛡 ${plural(st.shields, 'escudo', 'escudos')}`, 'chip--shield') : null))),
    esHabito
      ? el('p', { class: 'hint', style: 'margin-top:12px' },
          'Es un hábito, no una disciplina: cuenta la racha y hace falta para el día perfecto, pero no acumula XP ni rangos.')
      : a.rankBy === 'bodyfat'
        ? bodyFatHeader(st, a)
        : a.rankBy === 'strength'
        ? strengthHeader(st, a)
        : el('div', {},
            el('div', { style: 'margin-top:12px' },
              xpBar(st.level.pct, { left: `${formatNumber(st.level.into)} / ${formatNumber(st.level.need)} XP`, right: `Nivel ${st.level.level + 1} en ${formatNumber(st.level.need - st.level.into)} XP` })),
            st.nextTier
              ? el('p', { class: 'hint', style: 'margin-top:10px' },
                  `Próximo rango: ${st.nextTier.name} en el nivel ${st.nextTier.min}.`)
              : el('p', { class: 'hint', style: 'margin-top:10px' }, 'Último rango de la escalera. 🐐')),
    a.motto ? el('p', { class: 'hint', style: 'margin-top:6px;font-style:italic', text: `“${a.motto}”` }) : null));

  root.append(el('div', { style: 'margin-top:12px' },
    el('button', { class: 'btn btn--primary btn--block', style: `--c:${colorDe(a)}`,
      onClick: () => openLogger(a, state.today, (...args) => { celebrate(...args); navigate(); }) },
      `Registrar ${relativeDay(state.today).toLowerCase()}`)));

  // Los pasos se pueden contar en vivo con el acelerómetro, sin esperar a la
  // exportación de Samsung Health.
  // Con la app de Android el conteo lo hace el sistema todo el día, así que
  // el modo caminata sólo sobra: sumaría encima del total real.
  if (a.id === 'pasos' && walkDisponible() && !enApp()) {
    root.append(el('div', { style: 'margin-top:8px' },
      el('button', { class: 'btn btn--block', onClick: () => openWalk(a, (events, pasos) => {
        if (pasos > 0) celebrate(events, pasos); else navigate();
      }) }, '👣 Modo caminata')));
  }

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
    esHabito ? stat(st.goalDays, 'Días cumplidos') : stat(formatNumber(st.xp), 'XP total'),
    stat(st.bestStreak, a.streakMode === 'weekly' ? 'Mejor racha (sem.)' : 'Mejor racha (días)')));

  if (st.carryOver > 0) {
    root.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('div', { class: 'row__main' },
        el('div', { text: 'Antes de la app' }),
        el('div', { class: 'row__sub', text: 'ya lo tenías hecho: cuenta para el total y la XP, pero no para la racha' })),
      el('div', { class: 'row__value', text: formatValue(st.carryOver, a.unit) })));
  }

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
  root.append(el('div', { class: 'card' }, barChart(points, { color: colorDe(a), labelEvery: 1 }),
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
            // El nombre grande es el rango de la actividad; entre paréntesis, el
            // de la escala estándar, que es el que usan los movimientos de abajo.
            el('div', { style: 'font-weight:700;font-size:1.05rem', text: st.tier?.name || state.strengthOverall.name }),
            el('div', { class: 'row__sub', text: `nivel ${state.strengthOverall.name} en la escala general · promedio de ${state.strengthOverall.lifts} ${state.strengthOverall.lifts === 1 ? 'movimiento' : 'movimientos'}` }),
            state.strengthOverall.next
              ? el('div', { class: 'row__sub', text: `${Math.round(state.strengthOverall.pct * 100)}% hacia ${st.nextTier?.name || state.strengthOverall.next}` })
              : null),
          el('div', { style: 'font-size:1.6rem', text: '💪' })),
        el('div', { style: 'margin-top:10px' }, xpBar(state.strengthOverall.pct))));
    }

    root.append(el('div', { class: 'list' }, state.strength.map((s) => el('div', { class: 'row', style: 'display:block' },
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:baseline' },
        el('span', { style: 'font-weight:650', text: s.lift }),
        el('span', { class: 'row__value', text: `${formatNumber(s.e1rm)} kg` })),
      el('div', { class: 'quest__meta', style: 'margin-top:4px' },
        chip(s.nivel.name, 'chip--tier', `--t:${colorDe(a)}`),
        chip(`${formatNumber(s.ratio)}× tu peso`),
        // El ajuste por mancuerna se muestra: un número corregido en silencio
        // es peor que uno sin corregir.
        s.conversion > 1 ? chip(`≈ ${formatNumber(s.comparable)} kg en barra`) : null,
        s.usaPesoCorporal ? chip(s.weight > 0 ? `+${formatNumber(s.weight)} kg de lastre` : 'sin lastre') : null),
      s.nivel.next
        ? el('div', { style: 'margin-top:8px' },
            xpBar(s.nivel.pct),
            el('div', { class: 'row__sub', style: 'margin-top:4px', text: `${s.nivel.next} a los ${formatNumber(s.objetivo)} kg — te faltan ${formatNumber(s.falta)} kg` }))
        : el('div', { class: 'row__sub', style: 'margin-top:6px', text: 'Nivel máximo de la escala. 🐐' })))));

    if (state.calibracionVencida?.length) {
      const nombres = state.calibracionVencida.map((c) => c.lift.toLowerCase()).join(', ');
      root.append(el('div', { class: 'row', style: 'margin-top:10px;border-color:color-mix(in srgb, var(--gold) 40%, var(--line));background:rgba(251,191,36,.08)' },
        el('span', { style: 'font-size:1.2rem' }, '🎯'),
        el('div', { class: 'row__main' },
          el('div', { style: 'font-weight:650', text: 'Calibrá tu fuerza' }),
          el('div', { class: 'row__sub', text: `Hacé una serie pesada de 5 repeticiones en ${nombres}. Con series de 10-15 la estimación de 1RM se dispersa hasta ±28 kg; con 5 baja a ±4.` }))));
    }

    root.append(el('p', { class: 'hint', style: 'margin-top:10px' },
      'El 1RM sale del promedio de cuatro fórmulas (Epley, Brzycki, Lombardi y Wathen) sobre tu mejor serie de hasta 12 repeticiones: las más largas entrenan, pero no sirven para medir. Los niveles son referencias generales, así que ubican y muestran progresión, no deciden decimales.'));

    if (state.strength.some((s) => s.conversion > 1)) {
      root.append(el('p', { class: 'hint', style: 'margin-top:8px' },
        'Las tablas están hechas con barra. Con mancuernas el mismo peso total es más difícil ',
        '—cada brazo se estabiliza solo y el recorrido es mayor—, así que para ubicarte en la ',
        `escala se convierte: el total que movés cuenta como ${formatPreciso(EQUIV_MANCUERNA)}× en barra. `,
        'Es una regla de dedo, como las tablas mismas. Los kilos que te faltan siguen siendo reales: ',
        'es lo que le tenés que sumar a la mancuerna.'));
    }
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
            ? `${r.weight > 0 ? `+${formatNumber(r.weight)} kg` : 'sin lastre'} × ${r.reps} reps · ${formatNumber(r.load)} kg movidos · ${shortDate(r.date)}`
            : `${formatNumber(r.weight)} kg${r.db ? ' c/u' : ''} × ${r.reps} reps · ${shortDate(r.date)}` })),
        el('div', { class: 'row__value', text: `${formatNumber(r.e1rm)} kg` })))));
    const progresion = progresionPorEjercicio(st, a);
    if (progresion) root.append(progresion);
    root.append(el('p', { class: 'hint', style: 'margin-top:8px' },
      'El valor de la derecha es tu 1RM estimado (fórmula de Epley). ',
      st.recordList.some((r) => r.db)
        ? 'En los de mancuerna es por mancuerna, igual que lo que anotás.'
        : ''));
  }

  // --- Patrón semanal ---
  const patron = patronSemanal(st, a);
  if (patron) root.append(patron);

  // --- Historial ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Historial' })));
  const recent = [...st.history].reverse().slice(0, 20);
  root.append(recent.length
    ? el('div', { class: 'list' }, recent.map((h) => el('button', {
        class: 'row', style: 'width:100%;text-align:left',
        onClick: () => openLogger(a, h.date, (...args) => { celebrate(...args); navigate(); }),
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

/**
 * Promedio por día de la semana. Un promedio general esconde que un día
 * puntual arrastra al resto: acá se ve cuál es el flojo.
 */
function patronSemanal(st, a) {
  const DIAS_MIRADOS = 84;   // doce semanas
  const desde = addDays(st.history.length ? st.history[st.history.length - 1].date : '', -DIAS_MIRADOS);
  const recientes = st.history.filter((h) => h.date >= desde && h.value > 0);
  if (recientes.length < 21) return null;   // sin datos suficientes no dice nada

  const porDia = Array.from({ length: 7 }, () => ({ suma: 0, n: 0, met: 0 }));
  for (const h of recientes) {
    const d = porDia[keyToDate(h.date).getDay()];
    d.suma += h.value;
    d.n += 1;
    if (h.met) d.met += 1;
  }

  const orden = [1, 2, 3, 4, 5, 6, 0];
  const filas = orden.map((i) => ({ i, ...porDia[i], prom: porDia[i].n ? porDia[i].suma / porDia[i].n : 0 }))
    .filter((f) => f.n > 0);
  if (filas.length < 4) return null;

  const max = Math.max(...filas.map((f) => f.prom));
  const flojo = filas.reduce((peor, f) => (f.prom < peor.prom ? f : peor), filas[0]);
  const fuerte = filas.reduce((mejor, f) => (f.prom > mejor.prom ? f : mejor), filas[0]);

  return el('div', {},
    el('div', { class: 'section-title' },
      el('h2', { text: 'Por día de la semana' }),
      el('small', { text: 'últimas 12 semanas' })),
    el('div', { class: 'card', style: 'display:grid;gap:8px' },
      filas.map((f) => el('div', { style: 'display:flex;align-items:center;gap:10px' },
        el('span', { style: 'width:28px;font-size:.74rem;color:var(--muted);text-transform:capitalize', text: weekdayShort(f.i) }),
        el('div', { style: 'flex:1;height:14px;border-radius:7px;background:rgba(255,255,255,.06);overflow:hidden' },
          el('div', { style: `height:100%;width:${Math.max(3, (f.prom / max) * 100)}%;border-radius:7px;background:${f.i === flojo.i ? 'var(--muted)' : colorDe(a)};opacity:${f.i === flojo.i ? .55 : .9}` })),
        el('span', {
          style: 'width:66px;text-align:right;font-size:.74rem;white-space:nowrap;font-variant-numeric:tabular-nums',
          // Sin la unidad: ya está en el título de la actividad y hace que el número parta en dos líneas.
          text: a.unit === 'min' ? formatValue(Math.round(f.prom), a.unit) : formatNumber(Math.round(f.prom)),
        }),
        el('span', { style: `width:38px;text-align:right;font-size:.7rem;color:${f.met / f.n >= 0.6 ? 'var(--ok)' : 'var(--muted)'}`, text: `${Math.round((f.met / f.n) * 100)}%` }))),
      el('p', { class: 'hint', style: 'margin-top:4px' },
        flojo.prom < fuerte.prom * 0.85
          ? `Tu día más flojo es el ${weekdayShort(flojo.i)}: ${formatValue(Math.round(flojo.prom), a.unit)} de promedio contra ${formatValue(Math.round(fuerte.prom), a.unit)} el ${weekdayShort(fuerte.i)}. El porcentaje de la derecha es cuántas veces cumpliste la meta ese día.`
          : `Estás parejo toda la semana. El porcentaje de la derecha es cuántas veces cumpliste la meta ese día.`)));
}

/** Cabecera del gimnasio: el nivel lo da la fuerza, no las sesiones. */
/**
 * El nivel de fuerza se mide en veces tu peso corporal, así que bajar de peso
 * lo sube sin levantar un kilo más. Las dos cosas son logros, pero distintos:
 * callarlo sería dejar que la app te felicite por algo que no hiciste.
 */
function avisoDePesoCorporal(st) {
  const conPeso = (st.strength || [])
    .map((s) => ({ s, e: explicarProgreso(s.progreso) }))
    .filter((x) => x.e);
  if (!conPeso.length) return null;

  const soloPeso = conPeso.filter((x) => x.e.soloPorPeso);
  const kg = (n) => formatNumber(Math.round(Math.abs(n) * 10) / 10);

  if (soloPeso.length) {
    const nombres = soloPeso.map((x) => x.s.lift.toLowerCase()).join(', ');
    return el('p', { class: 'hint', style: 'margin-top:10px' },
      `Ojo con ${nombres}: ${soloPeso.length === 1 ? 'subió' : 'subieron'} de cociente `,
      `porque bajaste ${kg(soloPeso[0].e.kgDePeso)} kg, no porque levantes más. `,
      'Pesar menos cuenta —mover tu cuerpo es más fácil— pero no es lo mismo que ganar fuerza.');
  }

  const mixto = conPeso.find((x) => x.e.pesoPct > 0.3);
  if (!mixto) return null;
  return el('p', { class: 'hint', style: 'margin-top:10px' },
    `En ${mixto.s.lift.toLowerCase()}, cerca del ${Math.round(mixto.e.pesoPct * 100)}% de la mejora `,
    `viene de haber bajado ${kg(mixto.e.kgDePeso)} kg; el resto, de los `,
    `${kg(mixto.e.kgLevantados)} kg que sumaste al 1RM.`);
}

/**
 * Cómo se movió un ejercicio en el tiempo. El récord es un número: dice si
 * alguna vez subiste, no si estás subiendo. La serie sí.
 */
function progresionPorEjercicio(st, a) {
  const series = [...(st.serieDeEjercicio || new Map()).entries()]
    .map(([clave, puntos]) => ({ clave, puntos, nombre: puntos[puntos.length - 1]?.name || clave }))
    .filter((x) => x.puntos.length >= 2)
    .sort((x, y) => y.puntos.length - x.puntos.length);
  if (!series.length) return null;

  const caja = el('div', {});
  caja.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Progresión' }), el('small', { text: '1RM estimado' })));

  const selector = el('select', { class: 'select' },
    series.map((x) => el('option', { value: x.clave, text: `${x.nombre} · ${x.puntos.length} sesiones` })));
  const panel = el('div', { class: 'card' });

  const dibujar = () => {
    const elegida = series.find((x) => x.clave === selector.value) || series[0];
    const puntos = elegida.puntos.map((x) => ({ label: shortDate(x.date), value: Math.round(x.e1rm * 10) / 10 }));
    const primero = puntos[0].value;
    const ultimo = puntos[puntos.length - 1].value;
    const delta = Math.round((ultimo - primero) * 10) / 10;
    panel.innerHTML = '';
    panel.append(
      lineChart(puntos, { color: colorDe(a), suffix: ' kg' }),
      el('p', { class: 'hint', style: 'margin-top:10px' },
        delta > 0
          ? `Subiste ${formatNumber(delta)} kg de 1RM desde ${shortDate(elegida.puntos[0].date)}.`
          : delta < 0
            ? `Bajaste ${formatNumber(Math.abs(delta))} kg desde ${shortDate(elegida.puntos[0].date)}. Puede ser una semana floja o que haga falta cambiar algo.`
            : `Sin cambios desde ${shortDate(elegida.puntos[0].date)}: mismo 1RM estimado.`));
  };
  selector.addEventListener('change', dibujar);
  dibujar();

  caja.append(el('div', { style: 'margin-bottom:8px' }, selector), panel);
  return caja;
}

function strengthHeader(st, a) {
  const g = st.strengthOverall;
  if (!g) {
    return el('p', { class: 'hint', style: 'margin-top:12px' },
      'Cargá algunas sesiones con peso y repeticiones: el nivel del gimnasio lo da la fuerza que lográs, no la cantidad de veces que vas.');
  }
  const flojo = g.weakest;
  return el('div', {},
    el('div', { style: 'margin-top:12px' },
      xpBar(g.pct, {
        left: `promedio de ${g.lifts} ${g.lifts === 1 ? 'movimiento' : 'movimientos'}`,
        right: g.next ? `Próximo: ${st.nextTier?.name || g.next}` : 'Último rango',
      })),
    flojo && flojo.falta > 0
      ? el('p', { class: 'hint', style: 'margin-top:10px' },
          `Lo que más frena el promedio es ${flojo.lift.toLowerCase()}: ${formatNumber(flojo.falta)} kg de 1RM para pasar a ${flojo.nivel.next}.`)
      : null,
    avisoDePesoCorporal(st),
    g.lifts < 3
      ? el('p', { class: 'hint', style: 'margin-top:6px' },
          `El promedio sale de ${g.lifts} ${g.lifts === 1 ? 'movimiento' : 'movimientos'}. Cargá los básicos —sentadilla, banca, press militar, remo y dominadas— para que el nivel sea representativo.`)
      : null);
}

/** Barra de progreso hacia la meta de grasa corporal. */
function bodyFatHeader(st, a) {
  if (st.bodyFat == null) {
    return el('p', { class: 'hint', style: 'margin-top:12px' },
      `Cargá tu primera medición para ver en qué rango estás. La meta es llegar al ${a.targetBodyFat}% de grasa.`);
  }
  const banda = st.band;
  return el('div', {},
    el('div', { style: 'margin-top:12px' },
      xpBar(banda.pct, {
        left: `${formatNumber(st.bodyFat)}% de grasa`,
        right: banda.next ? `${banda.next.name} bajando de ${banda.next.max}%` : `Meta del ${a.targetBodyFat}% alcanzada`,
      })),
    el('p', { class: 'hint', style: 'margin-top:10px' },
      banda.next
        ? `Te faltan ${formatNumber(banda.falta)} puntos para ${banda.next.name}.` +
          (banda.next.max > a.targetBodyFat ? ` La meta final es el ${a.targetBodyFat}%.` : '')
        : `Llegaste a la meta del ${a.targetBodyFat}%. La escalera termina acá a propósito: más abajo ya no es salud, es preparación de competencia.`));
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
      { color: 'var(--accent)', suffix: '%' })));

  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Peso' })));
  root.append(el('div', { class: 'card' },
    lineChart(mediciones.map((m) => ({ label: shortDate(m.date), value: m.weight || null })),
      { color: 'var(--gold)', suffix: ' kg' })));

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
