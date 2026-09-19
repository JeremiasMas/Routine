// Utilidades generales: fechas locales, formato y helpers de DOM.

/** Clave de día en formato YYYY-MM-DD usando la hora LOCAL (nunca UTC). */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Convierte una clave YYYY-MM-DD en Date local a medianoche. */
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(fromKey, toKey) {
  const ms = keyToDate(toKey) - keyToDate(fromKey);
  return Math.round(ms / 86400000);
}

export function todayKey() {
  return dayKey(new Date());
}

/** Lunes de la semana a la que pertenece la clave. */
export function weekStart(key) {
  const d = keyToDate(key);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

export function weekLabel(startKey) {
  const end = addDays(startKey, 6);
  return `${shortDate(startKey)} – ${shortDate(end)}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function shortDate(key) {
  const d = keyToDate(key);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function longDate(key) {
  const d = keyToDate(key);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function dayName(key) {
  return DIAS[keyToDate(key).getDay()];
}

/** Nombre corto de un día de la semana (0 = domingo). */
export function weekdayShort(index) {
  return DIAS[index];
}

/** "lun · mié · vie" o "todos los días". */
export function scheduleLabel(days) {
  if (!days?.length) return 'todos los días';
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden.filter((d) => days.includes(d)).map((d) => DIAS[d]).join(' · ');
}

export function monthName(index) {
  return MESES[index];
}

export function relativeDay(key) {
  const diff = daysBetween(key, todayKey());
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff === -1) return 'Mañana';
  return longDate(key);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatNumber(n) {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

/** Formatea un valor según la unidad de la actividad (min -> 1h 30m). */
export function formatValue(value, unit) {
  if (unit === 'ml') {
    return value >= 1000 ? `${formatNumber(Math.round(value / 100) / 10)} L` : `${formatNumber(value)} ml`;
  }
  if (unit === 'min' && value >= 60) {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${formatNumber(value)} ${unit}`;
}

/** Crea un elemento con clases, atributos e hijos. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** "1 semana" / "3 semanas": evita el clásico "1 semanas". */
export function plural(n, singular, plural_) {
  return `${formatNumber(n)} ${Math.abs(n) === 1 ? singular : plural_}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
