// Vitrina de logros.
import { el, formatNumber, shortDate } from '../utils.js';
import { getState } from '../state.js';
import { xpBar } from '../ui/components.js';

export function render() {
  const state = getState();
  const unlocked = state.achievements.filter((a) => a.unlocked);
  const locked = state.achievements.filter((a) => !a.unlocked)
    .sort((a, b) => b.pct - a.pct);

  const root = el('div', {});
  root.append(el('div', { class: 'card' },
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' },
      el('div', {},
        el('div', { style: 'font-weight:700', text: `${unlocked.length} de ${state.achievements.length} logros` }),
        el('div', { class: 'row__sub', text: `${formatNumber(state.achievementXp)} XP ganados en logros` })),
      el('div', { style: 'font-size:1.6rem', text: '🏆' })),
    el('div', { style: 'margin-top:10px' }, xpBar(unlocked.length / state.achievements.length))));

  if (unlocked.length) {
    root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Desbloqueados' })));
    root.append(el('div', { class: 'awards' }, unlocked.map(card)));
  }

  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Por desbloquear' }), el('small', { text: 'los más cercanos primero' })));
  root.append(locked.length
    ? el('div', { class: 'awards' }, locked.map(card))
    : el('div', { class: 'empty' }, '¡Los conseguiste todos! Leyenda. 🐐'));

  return root;
}

function card(a) {
  return el('div', { class: `award${a.unlocked ? ' is-unlocked' : ''}` },
    el('div', { class: 'award__icon', text: a.icon }),
    el('div', { class: 'award__name', text: a.name }),
    el('div', { class: 'award__desc', text: a.desc }),
    a.unlocked
      ? el('div', { class: 'award__xp', text: a.unlockedAt ? `+${a.xp} XP · ${shortDate(a.unlockedAt)}` : `+${a.xp} XP` })
      : el('div', {},
          xpBar(a.pct),
          el('div', { class: 'award__xp', text: `${formatNumber(a.progress)} / ${formatNumber(a.target)}` })));
}
