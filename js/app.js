// Arranque, navegación y celebraciones.
import { el, formatNumber, plural } from './utils.js';
import { load, getState, invalidate, getData } from './state.js';
import { ring, xpBar, chip } from './ui/components.js';
import { openSheet, closeSheet } from './ui/sheet.js';
import { toast, confetti, sounds } from './ui/feedback.js';
import * as today from './views/today.js';
import * as activity from './views/activity.js';
import * as stats from './views/stats.js';
import * as awards from './views/awards.js';
import * as settings from './views/settings.js';
import { conectar as conectarNativo, alCambiar as alCambiarNativo } from './native.js';
import { copiaAutomatica } from './backup.js';
import { aplicarTema } from './theme.js';

const TABS = [
  { hash: '#/', icon: '⚔️', label: 'Hoy' },
  { hash: '#/progreso', icon: '📈', label: 'Progreso' },
  { hash: '#/logros', icon: '🏆', label: 'Logros' },
  { hash: '#/ajustes', icon: '⚙️', label: 'Ajustes' },
];

const ROUTES = [
  { pattern: /^#\/?$/, view: today, tab: '#/' },
  { pattern: /^#\/actividad\/(?<id>[^/]+)$/, view: activity, tab: '#/' },
  { pattern: /^#\/progreso$/, view: stats, tab: '#/progreso' },
  { pattern: /^#\/logros$/, view: awards, tab: '#/logros' },
  { pattern: /^#\/ajustes$/, view: settings, tab: '#/ajustes' },
];

function currentRoute() {
  const hash = location.hash || '#/';
  for (const route of ROUTES) {
    const match = hash.match(route.pattern);
    if (match) return { ...route, params: match.groups || {} };
  }
  return { ...ROUTES[0], params: {} };
}

function navigate() {
  const route = currentRoute();
  if (route.tab === '#/' && navigate.lastTab && navigate.lastTab !== '#/') {
    today.setViewDate(getState().today);
  }
  const host = document.getElementById('view');
  const scroll = window.scrollY;
  host.innerHTML = '';
  host.append(route.view.render({ params: route.params, navigate, celebrate }));
  renderTopbar();
  renderTabbar(route.tab);
  // Al cambiar de pantalla vamos arriba; al refrescar la misma, mantenemos la posición.
  if (navigate.lastTab !== route.tab || navigate.lastHash !== location.hash) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);
  navigate.lastTab = route.tab;
  navigate.lastHash = location.hash;
}

function renderTopbar() {
  const state = getState();
  const p = state.player;
  const host = document.getElementById('topbar');
  host.innerHTML = '';
  host.append(el('div', { class: 'player' },
    el('div', { class: 'player__badge' },
      ring(p.pct, { size: 60, stroke: 5, color: 'var(--gold)' }),
      el('div', { class: 'player__lvl' },
        el('b', { text: String(p.level) }),
        el('span', { text: 'nivel' }))),
    el('div', { class: 'player__info' },
      el('div', { class: 'player__title', text: p.title.name }),
      el('div', { class: 'player__sub' },
        chip(`🔥 ${plural(state.globalStreak, 'día', 'días')}`, 'chip--fire'),
        chip(`⭐ ${state.perfectDays} perfectos`),
        chip(`🏆 ${state.unlockedIds.length}/${state.achievements.length}`)),
      el('div', { class: 'player__xp' },
        xpBar(p.pct, {
          left: `${formatNumber(p.into)} / ${formatNumber(p.need)} XP`,
          right: `${formatNumber(p.xp)} XP totales`,
        })))));
}

function renderTabbar(active) {
  const host = document.getElementById('tabbar');
  host.innerHTML = '';
  for (const tab of TABS) {
    host.append(el('a', {
      href: tab.hash,
      'aria-current': tab.hash === active ? 'page' : null,
    }, el('span', { text: tab.icon }), el('span', { text: tab.label })));
  }
}

/** Muestra el feedback de lo que acaba de pasar: XP, logros, subidas de nivel. */
function celebrate(events, value) {
  closeSheet();
  if (!events) { toast('🗑', 'Registro borrado.'); return; }

  const { levelUps = [], achievements = [], playerLevelUp, perfectDay } = events;
  sounds.xp();

  if (perfectDay) {
    toast('⭐', '<b>¡Día perfecto!</b> +50 XP de bonus');
    confetti(['#fbbf24', '#f59e0b', '#fde68a']);
  }

  for (const a of achievements) {
    setTimeout(() => { toast(a.icon, `<b>Logro:</b> ${a.name} · +${a.xp} XP`, 4200); sounds.award(); }, 400);
  }

  const headline = levelUps[0];
  if (headline) {
    setTimeout(() => showLevelUp(headline), 260);
  } else if (playerLevelUp) {
    setTimeout(() => showPlayerLevelUp(playerLevelUp), 260);
  } else if (!perfectDay && !achievements.length) {
    toast('✨', 'Registrado. ¡Sumaste XP!', 2200);
  }

  // Si además subió el nivel de jugador, lo avisamos después.
  if (headline && playerLevelUp) {
    setTimeout(() => toast('🏅', `<b>Nivel de jugador ${playerLevelUp.to}</b> · ${playerLevelUp.title.name}`, 4000), 3200);
  }
}

function showLevelUp({ activity: act, to, tier }) {
  sounds.levelUp();
  confetti([act.color, '#fbbf24', '#ffffff']);
  openSheet('Subiste de nivel', el('div', { class: 'levelup', style: `--c:${act.color}` },
    el('div', { class: 'levelup__icon', text: act.icon }),
    el('div', { class: 'levelup__title', text: act.name }),
    el('div', { class: 'levelup__lvl', text: `Nv ${to}` }),
    el('div', { class: 'levelup__sub', text: `Rango: ${tier.name}` }),
    el('button', { class: 'btn btn--primary btn--block', style: `--c:${act.color};margin-top:18px`, onClick: closeSheet }, 'Seguir')));
}

function showPlayerLevelUp({ to, title }) {
  sounds.levelUp();
  confetti();
  openSheet('Nivel de jugador', el('div', { class: 'levelup', style: '--c:#fbbf24' },
    el('div', { class: 'levelup__icon', text: '🏅' }),
    el('div', { class: 'levelup__lvl', text: `Nv ${to}` }),
    el('div', { class: 'levelup__title', text: title.name }),
    el('button', { class: 'btn btn--primary btn--block', style: '--c:#fbbf24;margin-top:18px', onClick: closeSheet }, 'Seguir')));
}

/** Si la app quedó abierta y cambió el día, refresca el tablero. */
function watchDayChange() {
  let day = getState().today;
  const check = () => {
    invalidate(); // "hoy" se evalúa al derivar, así que hay que recalcular
    const state = getState();
    if (state.today !== day) {
      day = state.today;
      today.setViewDate(day);
      location.hash = '#/';
      navigate();
    }
  };
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    check();
    // Al volver a la app, el tablero siempre muestra hoy.
    if (currentRoute().tab === '#/' && today.getViewDate() !== getState().today) {
      today.setViewDate(getState().today);
      navigate();
    }
  });
}

function boot() {
  load();
  aplicarTema(getData().settings?.tema);
  // El puente se engancha antes de pintar: si la app de Android ya mandó los
  // pasos, la primera pantalla ya los muestra.
  conectarNativo();
  alCambiarNativo((estado, cargados) => {
    navigate();
    if (cargados.length) {
      const dias = cargados.length === 1 ? 'un día' : `${cargados.length} días`;
      toast('👟', `Pasos actualizados desde Samsung Health (${dias}).`);
    }
  });
  window.addEventListener('hashchange', navigate);
  navigate();
  watchDayChange();

  // Una copia cada tanto, sin que haya que acordarse. Sólo adentro de la app,
  // que es la única que sabe escribir un archivo sin pedir permiso.
  const copia = copiaAutomatica();
  if (copia) toast('💾', 'Copia de seguridad guardada en Descargas.');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* funciona igual sin modo offline */ });
    });
  }
}

boot();
