// Piezas visuales reutilizables.
import { el, formatNumber } from '../utils.js';

/** Anillo de progreso SVG. */
export function ring(pct, { size = 46, stroke = 4, color = 'var(--accent)', children = null } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(ns, 'circle');
  track.setAttribute('class', 'ring__track');
  track.setAttribute('cx', size / 2); track.setAttribute('cy', size / 2); track.setAttribute('r', r);
  track.setAttribute('stroke-width', stroke);

  const fill = document.createElementNS(ns, 'circle');
  fill.setAttribute('class', 'ring__fill');
  fill.setAttribute('cx', size / 2); fill.setAttribute('cy', size / 2); fill.setAttribute('r', r);
  fill.setAttribute('stroke-width', stroke);
  fill.setAttribute('stroke-dasharray', c);
  fill.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(1, pct))));
  fill.style.setProperty('--c', color);

  svg.append(track, fill);
  const wrap = el('div', { class: 'quest__ring', style: `width:${size}px;height:${size}px` }, svg);
  if (children) wrap.append(el('div', { class: 'quest__ringlvl' }, children));
  return wrap;
}

/** Barra de XP con etiqueta opcional. */
export function xpBar(pct, label) {
  const bar = el('div', { class: 'xpbar' },
    el('div', { class: 'xpbar__fill', style: `width:${Math.max(2, Math.min(100, pct * 100))}%` }));
  if (!label) return bar;
  return el('div', {}, bar, el('div', { class: 'xpbar__label' },
    el('span', { text: label.left }), el('span', { text: label.right })));
}

export function chip(text, variant = '', style = '') {
  return el('span', { class: `chip ${variant}`, style }, text);
}

export function stat(value, label) {
  return el('div', { class: 'stat' },
    el('div', { class: 'stat__value', text: typeof value === 'number' ? formatNumber(value) : value }),
    el('div', { class: 'stat__label', text: label }));
}

/** Gráfico de barras simple (sin librerías). */
export function barChart(points, { color = 'var(--accent)', height = 110, labelEvery = 1 } = {}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const cols = points.map((p) => {
    const h = p.value > 0 ? Math.max(3, (p.value / max) * 100) : 2;
    const bar = el('div', {
      class: `bars__bar${p.value > 0 ? '' : ' bars__bar--empty'}`,
      style: `height:${h}%;--c:${color}${p.met ? '' : ';opacity:.5'}`,
      title: `${p.label}: ${formatNumber(p.value)}`,
    });
    return el('div', { class: 'bars__col' }, bar);
  });
  const axis = points.map((p, i) => el('span', { text: i % labelEvery === 0 ? p.short ?? '' : '' }));
  return el('div', {},
    el('div', { class: 'bars', style: `height:${height}px` }, cols),
    el('div', { class: 'bars__axis' }, axis));
}
