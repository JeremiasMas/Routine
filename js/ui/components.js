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

/** Gráfico de línea simple en SVG, para series que suben y bajan poco. */
export function lineChart(points, { color = 'var(--accent)', height = 120, suffix = '' } = {}) {
  const values = points.filter((p) => p.value != null);
  if (values.length < 2) {
    return el('div', { class: 'empty', text: 'Necesitás al menos dos mediciones para ver la tendencia.' });
  }
  const min = Math.min(...values.map((p) => p.value));
  const max = Math.max(...values.map((p) => p.value));
  const span = max - min || 1;
  const pad = span * 0.18;
  const lo = min - pad;
  const hi = max + pad;
  const W = 300;
  const H = 100;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const d = values.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${W},${H} L0,${H} Z`;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');

  const fill = document.createElementNS(ns, 'path');
  fill.setAttribute('d', area);
  fill.setAttribute('fill', color);
  fill.setAttribute('opacity', '.14');

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(fill, line);

  for (const [i, p] of values.entries()) {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x(i));
    dot.setAttribute('cy', y(p.value));
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', color);
    dot.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(dot);
  }

  return el('div', {},
    svg,
    el('div', { class: 'bars__axis' },
      el('span', { style: 'text-align:left', text: `${values[0].label} · ${formatNumber(values[0].value)}${suffix}` }),
      el('span', { style: 'text-align:right', text: `${values[values.length - 1].label} · ${formatNumber(values[values.length - 1].value)}${suffix}` })));
}
