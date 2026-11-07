// Pantalla principal: el tablero de misiones del día.
import {
  el, formatValue, formatNumber, relativeDay, todayKey, addDays,
  weekStart, weekLabel, dayName, keyToDate, plural,
} from '../utils.js';
import { getState, getData, backupVencido, diasSinBackup, setEntry, marcarDescarga } from '../state.js';
import { isScheduledWithPauses, metaDelDia } from '../derive.js';
import { templateForDay, minutosDeCaminata } from '../config.js';
import { chip, xpBar, stat } from '../ui/components.js';
import {
  microDatos, nivelTexto, resumenDelDia, parValor, partirPorHechas, semanaArrancada,
} from '../tablero.js';
import { gastoDesdeElEstado, presupuesto, FASES } from '../calorias.js';
import { openLogger } from '../ui/logger.js';
import { colorDe } from '../theme.js';
import { rachasEnRiesgo } from '../analisis.js';
import { enApp } from '../native.js';
import { puedeUnToque } from '../resumen.js';
import { tramos } from '../pausas.js';
import { tocaDescarga, estancados, esDescarga, CADA_CUANTAS_SEMANAS } from '../descargas.js';

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
  // Un permiso declarado saca su misión del tablero: si ya dijiste que ese
  // martes no ibas a muay thai, el día no tiene por qué recordártelo.
  const toca = state.activities.filter((a) => isScheduledWithPauses(a, viewDate, state.pausas));
  // Incluye el gimnasio y el muay thai en sus días libres (para el día 4 opcional),
  // pero no las misiones puramente semanales como Substack. Lo perdonado también
  // cae acá: queda a mano por si al final llegás a hacerlo.
  const extra = state.activities.filter((a) => !isScheduledWithPauses(a, viewDate, state.pausas)
    && (a.streakMode !== 'weekly' || a.days?.length));
  const semanales = state.activities.filter((a) => a.streakMode === 'weekly');
  const cumplida = (a) => !!state.byActivity.get(a.id)?.byDate.get(viewDate)?.met;
  const cuantasHechas = toca.filter(cumplida).length;
  const dayXp = state.daily.get(viewDate)?.xp || 0;
  const rutina = templateForDay(keyToDate(viewDate).getDay());
  const resumen = resumenDelDia({ hechas: cuantasHechas, total: toca.length, xp: dayXp });

  // Qué racha está en juego hoy, por actividad. El cartel de arriba lo dice una
  // vez; la fila lo lleva encima, que es donde se mira cuando ya scrolleaste.
  const riesgos = new Map();
  if (viewDate === state.today) {
    for (const r of rachasEnRiesgo([...state.byActivity.values()],
      (a) => isScheduledWithPauses(a, viewDate, state.pausas))) riesgos.set(r.activity.id, r);
  }

  // Lo que se pierde hoy si no hacés nada. Sólo en el día de hoy: en un día
  // pasado ya no hay nada que decidir.
  if (riesgos.size) root.append(avisoDeRacha([...riesgos.values()]));

  // --- Resumen del día ---
  root.append(el('div', { class: 'card', style: 'margin-bottom:4px' },
    el('div', { class: 'stat-grid stat-grid--tres' },
      statDoble(resumen.hechas, resumen.total, 'Misiones'),
      stat(resumen.xp, 'XP del día'),
      resumen.perfecto
        ? stat('⭐', 'Día perfecto')
        : stat(resumen.faltan, resumen.faltan === 1 ? 'Falta hoy' : 'Faltan hoy')),
    el('div', { style: 'margin-top:12px' },
      xpBar(resumen.pct, { left: resumen.porcentaje, right: resumen.marcas }))));

  // --- Lo que vas a necesitar comer ---
  if (viewDate === state.today) {
    const calorias = tarjetaDeCalorias(state);
    if (calorias) root.append(calorias);
  }

  // --- Lo que este día tiene perdonado ---
  // Las misiones perdonadas desaparecen del tablero, y sin decirlo parecería
  // que la app se las olvidó.
  const avisos = avisoDePausa(state, viewDate);
  if (avisos) root.append(avisos);

  // --- La descarga ---
  const descarga = avisoDeDescarga(state, viewDate, navigate);
  if (descarga) root.append(descarga);

  // --- Lo que toca hoy ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Hoy toca' }),
    el('small', { text: rutina ? rutina.short : (isToday ? 'Tocá para registrar' : 'Registro retroactivo') })));
  const { pendientes, hechas: yaHechas } = partirPorHechas(toca, cumplida);
  const armar = (a, extraOpts) => misionFila(a, state, viewDate, navigate, celebrate,
    { riesgo: riesgos.get(a.id) || null, ...extraOpts });
  root.append(toca.length
    ? el('div', { class: 'quests' },
        pendientes.map((a) => armar(a)),
        yaHechas.length ? plegadoDeHechas(yaHechas, state, viewDate, armar) : null)
    : el('div', { class: 'empty' }, 'Hoy descansás. 😌 Igual podés registrar lo que hagas.'));

  // --- Lo que hoy no toca (se puede registrar igual) ---
  if (extra.length) {
    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Hoy no toca' }), el('small', { text: 'suma igual' })));
    root.append(el('div', { class: 'quests' },
      extra.map((a) => armar(a, { off: true }))));
  }

  // --- Progreso de la semana ---
  if (semanales.length) {
    const estados = semanales.map((a) => state.byActivity.get(a.id)).filter(Boolean);
    const totalSemanal = estados.reduce((n, st) => n + (Number(st.weekTarget) || 1), 0);
    const cuerpo = el('div', { class: 'card', style: 'display:grid;gap:12px' },
      semanales.map((a) => {
        const st = state.byActivity.get(a.id);
        const hecho = st?.weekCount || 0;
        const meta = st?.weekTarget || 1;
        return el('button', {
          style: 'display:block;width:100%;text-align:left',
          onClick: () => openLogger(a, viewDate, (...args) => { celebrate(...args); navigate(); }),
        },
          el('div', { style: 'display:flex;justify-content:space-between;gap:8px;font-size:.86rem' },
            el('span', {}, `${a.icon} ${a.name}`),
            el('span', { style: `color:${hecho >= meta ? 'var(--ok)' : 'var(--muted)'}`, text: `${formatNumber(hecho)}/${meta}` })),
          el('div', { style: 'margin-top:6px' },
            el('div', { class: 'xpbar' },
              el('div', { class: 'xpbar__fill', style: `width:${Math.min(100, (hecho / meta) * 100)}%;background:${colorDe(a)}` }))));
      }));

    root.append(el('div', { class: 'section-title' },
      el('h2', { text: 'Tu semana' }), el('small', { text: weekLabel(weekStart(viewDate)) })));
    // Toda en cero son casi doscientos píxeles para decir que no empezaste.
    // Plegada ocupa una línea, y se abre sola con la primera hecha.
    root.append(semanaArrancada(estados)
      ? cuerpo
      : el('details', { class: 'plegado' },
          el('summary', { class: 'plegado__cabeza' },
            el('span', { class: 'plegado__iconos', text: semanales.map((a) => a.icon).join(' ') }),
            el('span', { class: 'plegado__nota', text: `todavía sin arrancar · 0 de ${totalSemanal}` }),
            el('span', { class: 'plegado__flecha', text: '⌄' })),
          cuerpo));
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

/**
 * Una misión del tablero, en una fila.
 *
 * Antes era una tarjeta de 128 a 180 px: con seis misiones por día entraban
 * tres y media en pantalla, así que marcar el agua de la tarde pedía scrollear.
 * La fila conserva todo lo que se usa —el emoji, el color de la disciplina, el
 * avance, el nivel y el registro de un toque— y ocupa menos de la mitad.
 *
 * Lo que no entra son las insignias de siempre: de ésas se muestran las dos que
 * más dicen, y el resto vive en la pantalla de la actividad.
 */
function misionFila(activity, state, dateKey, navigate, celebrate, { off = false, riesgo = null } = {}) {
  const st = state.byActivity.get(activity.id);
  const day = st?.byDate.get(dateKey);
  const value = day?.value || 0;
  // El gimnasio se mide contra la rutina del día —35 series el viernes, 45 el
  // miércoles— y contra la descarga, que la parte al medio. metaDelDia sabe
  // las dos cosas; antes el tablero sólo sabía la primera, así que un viernes
  // de descarga decía 0/35 hasta que cargabas la primera serie.
  const goal = day?.goal ?? metaDelDia(activity, dateKey, { descargas: state.descargas });
  const met = value >= goal;
  const pct = Math.min(1, value / goal);
  // Lo que falta, dicho en el tiempo que cuesta: 5.800 pasos no se sienten como
  // nada hasta que son "58 min a pie" y entra la decisión de salir o no. Se mira
  // la unidad y no el id: si algún día hay otra actividad en pasos, vale igual.
  const minutos = activity.unit === 'pasos' && !met ? minutosDeCaminata(goal - value) : 0;
  const enJuego = riesgo && !met ? riesgo : null;

  const micro = microDatos({ activity, st, day: { met }, minutos, riesgo: enJuego });
  const nivel = nivelTexto(activity, st);

  const abrir = () => openLogger(activity, dateKey, (...args) => { celebrate(...args); navigate(); });

  const fila = el('div', {
    class: `quest${met ? ' is-done' : ''}${off ? ' quest--off' : ''}${enJuego ? ' quest--urge' : ''}`,
    style: `--c:${colorDe(activity)}`,
  },
    el('button', { class: 'quest__tap', 'aria-label': `Registrar ${activity.name}`, onClick: abrir }),
    el('span', { class: 'quest__icon', text: activity.icon }),
    el('div', { class: 'quest__body' },
      el('div', { class: 'quest__head' },
        el('span', { class: 'quest__name', text: activity.name }),
        el('span', { class: 'quest__num', text: met
          ? `✓ ${formatValue(goal, activity.unit)}`
          : parValor(value, goal, activity.unit) })),
      el('div', { class: 'quest__foot' },
        el('div', { class: 'quest__bar' },
          el('i', { style: `width:${met ? 100 : Math.max(3, pct * 100)}%` })),
        el('div', { class: 'quest__micro' },
          micro.map((m) => chip(m.texto, `chip--${m.nivel}`)),
          day?.xp ? chip(`+${formatNumber(day.xp)} XP`, 'chip--dato') : null,
          nivel ? el('span', { class: 'quest__nv', text: nivel }) : null))),
    botonRapido(activity, dateKey, met, navigate, celebrate));

  // Ir al detalle con pulsación larga o clic derecho.
  fila.addEventListener('contextmenu', (e) => { e.preventDefault(); location.hash = `#/actividad/${activity.id}`; });
  return fila;
}

/**
 * Las que ya están, plegadas en una línea.
 *
 * Una misión cumplida no pide nada: ocupa lugar para felicitarte. Queda el
 * resumen a la vista y las filas enteras a un toque, por si querés corregir
 * lo que cargaste.
 */
function plegadoDeHechas(lista, state, dateKey, armar) {
  const xp = lista.reduce((n, a) => n + (state.byActivity.get(a.id)?.byDate.get(dateKey)?.xp || 0), 0);
  return el('details', { class: 'plegado' },
    el('summary', { class: 'plegado__cabeza' },
      el('span', { class: 'plegado__tilde', text: '✓' }),
      el('b', { text: plural(lista.length, 'ya hecha', 'ya hechas') }),
      el('span', { class: 'plegado__iconos', text: lista.map((a) => a.icon).join(' ') }),
      xp ? el('span', { class: 'plegado__nota', text: `+${formatNumber(xp)} XP` }) : null,
      el('span', { class: 'plegado__flecha', text: '⌄' })),
    el('div', { class: 'plegado__cuerpo' }, lista.map((a) => armar(a))));
}

/**
 * Lo que vas a necesitar comer hoy.
 *
 * Dos números y los dos hacen falta. El grande es la proyección: lo que vas a
 * gastar si cumplís todo lo que falta, que es el que sirve a la mañana para
 * decidir qué comprar. El chico es lo que llevás gastado de verdad, y es el
 * que se mueve solo cuando caminás de más.
 *
 * El desglose va a la vista a propósito: un número de calorías sin decir de
 * dónde sale no se puede discutir, y estos salen de referencias (los METs del
 * compendio), no de mediciones tuyas.
 */
function tarjetaDeCalorias(state) {
  const settings = getData().settings || {};
  const esDeHoy = (a) => isScheduledWithPauses(a, state.today, state.pausas);
  const g = gastoDesdeElEstado(state, settings, esDeHoy);
  if (!g) {
    return el('div', { class: 'card', style: 'margin-bottom:4px' },
      el('div', { class: 'row__sub' },
        '🍽 Medite el cuerpo una vez y la app calcula cuánto gastás por día.'));
  }

  const peso = Number(state.composicion?.weight) || Number(state.bodyweight) || 0;
  const p = presupuesto(g, {
    fijoKcal: settings.fijoKcal,
    fijoProteina: settings.fijoProteina,
    peso,
    fase: g.fase,
  });
  const fase = FASES[g.fase];

  return el('div', { class: 'card', style: 'margin-bottom:4px' },
    el('div', { class: 'stat__label',
      text: p.soloVariable ? 'Presupuesto de hoy' : 'Para comer hoy' }),
    el('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:2px' },
      el('div', { class: 'stat__value', style: 'font-size:2rem', text: formatNumber(p.kcal) }),
      el('div', { class: 'stat__label', style: 'margin:0', text: 'kcal' }),
      p.proteina > 0
        ? chip(`${formatNumber(p.proteina)} g de proteína`, 'chip--vivo')
        : null),
    el('div', { style: 'margin-top:10px' },
      xpBar(Math.min(1, g.gastado / Math.max(1, g.proyectado)))),
    desgloseDeCalorias(g, p, fase));
}

/**
 * De dónde sale el número, plegado.
 *
 * Un número de calorías sin decir de dónde sale no se puede discutir, pero
 * tampoco hace falta verlo cada vez que abrís la app para saber qué almorzar.
 */
function desgloseDeCalorias(g, p, fase) {
  const linea = (texto, valor, clase = '') => el('div', { class: `row ${clase}` },
    el('div', { class: 'row__main', text: texto }),
    el('div', { class: 'row__value', text: valor }));

  return el('details', { class: 'plegado', style: 'margin-top:10px' },
    el('summary', { class: 'plegado__cabeza' },
      el('span', { class: 'plegado__tilde', text: '🍽' }),
      el('b', { text: 'De dónde sale' }),
      el('span', { class: 'plegado__nota', text: `gastás ${formatNumber(g.proyectado)}` }),
      el('span', { class: 'plegado__flecha', text: '⌄' })),
    el('div', { class: 'plegado__cuerpo' },
      el('div', { class: 'list' },
        linea('🛌 Existir, digerir, trabajar', formatNumber(g.sedentario)),
        g.partes.map((x) => linea(
          `${x.icon} ${x.nombre}`,
          `+${formatNumber(x.proyectado)}`,
          x.pasada ? 'row--pasada' : '')),
        g.delta !== 0 ? linea(`🎯 ${fase.nombre}`, formatNumber(g.delta)) : null,
        p.soloVariable ? linea('🥣 Tus comidas fijas', `−${formatNumber(p.fijoKcal)}`) : null),
      el('p', { class: 'hint', style: 'margin-top:8px' },
        p.soloVariable
          ? `Te quedan ${formatNumber(p.kcal)} kcal y ${formatNumber(p.proteina)} g de proteína para la comida variable, sobre una meta de ${formatNumber(p.metaProteina)} g en el día.`
          : `Meta de proteína del día: ${formatNumber(p.metaProteina)} g. Cargá tus comidas fijas en Ajustes y acá vas a ver lo que te queda para la variable.`),
      el('p', { class: 'hint', style: 'margin-top:6px' },
        'El número sale de lo que vas a gastar si cumplís todo, no de lo que llevás: ',
        'así sirve a la mañana. Sólo se mueve si te pasás de una meta.')));
}

/** Los tres números del día, con el denominador en chico. */
function statDoble(valor, total, label) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__value' },
      el('span', { text: formatNumber(valor) }),
      el('span', { class: 'stat__de', text: `/${formatNumber(total)}` })),
    el('div', { class: 'stat__label', text: label }));
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


/**
 * La semana de descarga: la que está en curso, o la que ya conviene hacer.
 *
 * Es la pieza que le faltaba a la progresión doble. Esa regla dice qué hacer
 * de una sesión a la siguiente, pero si uno sólo suma, la fatiga se acumula
 * más rápido de lo que se nota. Avisar a tiempo es la mitad del valor: nadie
 * descarga por su cuenta cuando viene subiendo.
 */
function avisoDeDescarga(state, fecha, navigate) {
  const gym = state.byActivity.get('gym');
  if (!gym) return null;

  if (esDescarga(state.descargas, fecha)) {
    return el('div', { class: 'card', style: 'margin-bottom:4px;border-color:#a78bfa55' },
      el('div', { style: 'font-weight:700', text: '🪫 Semana de descarga' }),
      el('div', { class: 'row__sub' },
        'Mismos pesos, la mitad de las series, nada al fallo. La meta del gimnasio ya está ajustada.'),
      el('button', {
        class: 'chip', style: 'margin-top:8px;min-height:32px;width:auto;padding:0 12px;border-radius:999px',
        onClick: () => { marcarDescarga(fecha, false); navigate(); },
      }, 'No estoy descargando'));
  }

  const semanasConSesion = (gym.history || []).map((h) => h.date);
  const quietos = estancados(gym.history);
  const toca = tocaDescarga(semanasConSesion, state.descargas, fecha, { estancados: quietos });
  if (!toca) return null;

  const porque = toca.motivo === 'estancamiento'
    ? `${toca.ejercicios.slice(0, 3).join(', ')} no suben hace dos sesiones. Eso no es tu techo: es fatiga acumulada.`
    : `Van ${toca.semanas} semanas seguidas entrenando. Después de ${CADA_CUANTAS_SEMANAS} conviene bajar una.`;

  return el('div', { class: 'card', style: 'margin-bottom:4px;border-color:#a78bfa55' },
    el('div', { style: 'font-weight:700', text: '🪫 Te conviene una semana de descarga' }),
    el('div', { class: 'row__sub', text: porque }),
    el('div', { class: 'row__sub', style: 'margin-top:4px' },
      'Mismos pesos, la mitad de las series. No se pierde: es cuando se cobra el trabajo de las semanas anteriores.'),
    el('button', {
      class: 'chip', style: 'margin-top:8px;min-height:32px;width:auto;padding:0 12px;border-radius:999px',
      onClick: () => { marcarDescarga(fecha, true); navigate(); },
    }, 'Declarar esta semana como descarga'));
}

/**
 * Lo que este día tiene declarado libre, y por qué. Sin esto una misión
 * perdonada simplemente no aparece, y eso se lee como un error de la app.
 */
function avisoDePausa(state, fecha) {
  const cubren = tramos(state.pausas).filter((t) => fecha >= t.desde && fecha <= t.hasta);
  if (!cubren.length) return null;

  const lineas = cubren.map((t) => {
    const nombres = (t.actividades || [])
      .map((id) => state.activities.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => `${a.icon} ${a.name}`);
    const partes = [t.tipo === 'excusa' ? '📝 Excusa' : '🌴 Vacaciones'];
    partes.push(t.actividades
      ? (nombres.length ? nombres.join(', ') : 'Lo declarado')
      : 'Todo el día');
    if (t.motivo) partes.push(t.motivo);
    return el('div', { class: 'row__sub', text: partes.join(' · ') });
  });

  return el('div', { class: 'card', style: 'margin-bottom:4px' },
    el('div', { style: 'font-weight:700', text: 'Declarado libre' }),
    lineas,
    el('div', { class: 'row__sub', style: 'margin-top:6px', text: 'No corta rachas. Si al final lo hacés, suma igual.' }));
}

/** Qué rachas están en juego hoy, en una frase que se pueda usar. */
function avisoDeRacha(riesgo) {
  const cortan = riesgo.filter((r) => r.seCorta);
  const conEscudo = riesgo.filter((r) => !r.seCorta);
  const nombres = (lista) => lista.map((r) => `${r.activity.icon} ${r.activity.name}`).join(', ');

  const caja = el('div', { class: 'aviso aviso--racha', style: 'margin-bottom:10px' });
  if (cortan.length) {
    const peor = cortan[0];
    caja.append(el('div', { style: 'font-weight:700' },
      `🔥 Se corta tu racha de ${plural(peor.streak, 'día', 'días')}`));
    caja.append(el('p', { class: 'hint', style: 'margin-top:4px' },
      cortan.length === 1
        ? `${nombres(cortan)} no tiene escudos: si el día termina sin registrarlo, la racha vuelve a cero.`
        : `${nombres(cortan)} no tienen escudos: si el día termina sin registrarlas, esas rachas vuelven a cero.`));
  } else {
    const peor = conEscudo[0];
    caja.append(el('div', { style: 'font-weight:700' },
      `🛡 Hoy gastás ${peor.ultimoEscudo ? 'tu último escudo' : 'un escudo'}`));
    caja.append(el('p', { class: 'hint', style: 'margin-top:4px' },
      `${nombres(conEscudo)}: la racha sobrevive, pero el escudo no se recupera hasta otros siete días cumplidos.`));
  }
  if (cortan.length && conEscudo.length) {
    caja.append(el('p', { class: 'hint', style: 'margin-top:6px' },
      `${nombres(conEscudo)} ${conEscudo.length === 1 ? 'se salva' : 'se salvan'} con escudo.`));
  }
  return caja;
}


/**
 * Cumplir la meta en un toque, sin abrir la hoja.
 *
 * Sólo donde "cumplir" es un número único y sin ambigüedad: minutos, pasos,
 * mililitros. En el gimnasio o en una medición no existe un valor obvio, y
 * ofrecerlo sería inventar el dato.
 */
function botonRapido(activity, dateKey, met, navigate, celebrate) {
  if (met) return null;
  // La misma regla que usa el widget: si acá se puede de un toque, allá
  // también, y al revés. Tenerla escrita dos veces era pedir que se separen.
  if (!puedeUnToque(activity, { enApp: enApp() })) return null;
  const meta = Number(activity.goal) || 0;

  return el('button', {
    class: 'quest__quick',
    type: 'button',
    title: `Registrar la meta: ${formatValue(meta, activity.unit)}`,
    'aria-label': `Cumplí la meta de ${activity.name}`,
    onClick: (e) => {
      e.stopPropagation();
      const events = setEntry(dateKey, activity.id, { value: meta });
      celebrate(events, meta);
      navigate();
    },
  }, '✓');
}
