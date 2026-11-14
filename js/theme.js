/**
 * Temas. Cada uno redefine variables de CSS y nada más: ninguna pantalla sabe
 * de qué tema se trata, así que agregar uno nuevo es agregar un bloque en el
 * CSS y una línea acá.
 */
import { DEFAULT_ACTIVITIES } from './config.js';

export const TEMAS = [
  { id: 'consola', nombre: 'Consola', desc: 'El original: azul noche.',
    muestra: ['#080b16', '#7dd3fc', '#fbbf24'] },
  { id: 'brasa', nombre: 'Brasa', desc: 'Negro puro y rojo encendido. El más oscuro.',
    muestra: ['#000000', '#ef2b34', '#f59e0b'] },
  { id: 'sangre', nombre: 'Sangre fría', desc: 'Gris oscuro y rojo profundo. Sobrio.',
    muestra: ['#0a0a0c', '#c62828', '#d4a017'] },
  { id: 'carmin', nombre: 'Carmín', desc: 'Negro cálido, rojo vivo y dorado.',
    muestra: ['#050304', '#ff3b47', '#ffc233'] },
];

export const TEMA_POR_DEFECTO = 'consola';

export function esTema(id) {
  return TEMAS.some((t) => t.id === id);
}

/** El color de la barra del navegador, para que no desentone con el fondo. */
export function colorDeTema(id) {
  return (TEMAS.find((t) => t.id === id) || TEMAS[0]).muestra[0];
}

/**
 * Aplica un tema al documento. El de fábrica no pone atributo, así que el CSS
 * base sigue siendo el camino por defecto y no hace falta duplicarlo.
 */
export function aplicarTema(id) {
  const tema = esTema(id) ? id : TEMA_POR_DEFECTO;
  const raiz = document.documentElement;
  if (tema === TEMA_POR_DEFECTO) raiz.removeAttribute('data-tema');
  else raiz.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colorDeTema(tema));
  return tema;
}

/**
 * Cada disciplina tiene su color, y en el tema de fábrica son fríos (cian,
 * violeta, celeste). En los temas rojos eso desentona: quedan islas azules en
 * una pantalla que no lo es. Acá se remapean a una gama cálida que sigue
 * distinguiendo una disciplina de otra —que es para lo que está el color— sin
 * traer de vuelta el azul.
 */
const PALETA_CALIDA = {
  datos: '#ef4444',
  piano: '#f97316',
  gym: '#dc2626',
  muaythai: '#f43f5e',
  pasos: '#f59e0b',
  frances: '#fb7185',
  agua: '#a8a29e',
  cuerpo: '#fb923c',
  substack: '#fbbf24',
};

/** Escalera de rangos en gama cálida, de apagado a encendido. */
const TIERS_CALIDOS = ['#9a8b90', '#c2703a', '#e07a2b', '#ef4444', '#dc2626', '#fbbf24'];

const CALIDOS = new Set(['brasa', 'sangre', 'carmin']);

function temaActual() {
  return (typeof document !== 'undefined' && document.documentElement.dataset.tema) || TEMA_POR_DEFECTO;
}

/** El color con el que viene cada disciplina de fábrica. */
const DE_FABRICA = new Map(DEFAULT_ACTIVITIES.map((a) => [a.id, a.color]));

/**
 * El color de una actividad en el tema puesto.
 *
 * La paleta cálida existe para que los colores de fábrica —pensados para el
 * tema azul— no desentonen en un tema rojo. No para pisar una decisión: si
 * elegiste un color a mano, ese gana en cualquier tema. Una actividad que
 * agregaste vos no tiene color de fábrica, así que siempre usa el suyo.
 */
export function colorDe(actividad, tema = temaActual()) {
  const propio = actividad?.color;
  if (!CALIDOS.has(tema)) return propio;
  if (propio && propio !== DE_FABRICA.get(actividad?.id)) return propio;
  return PALETA_CALIDA[actividad?.id] || propio;
}

/** El color de un rango en el tema puesto. */
export function colorDeRango(tier, indice, tema = temaActual()) {
  if (!CALIDOS.has(tema)) return tier?.color;
  if (!Number.isFinite(indice)) return tier?.color;
  return TIERS_CALIDOS[Math.min(TIERS_CALIDOS.length - 1, Math.max(0, indice))] || tier?.color;
}

/** ¿Este tema usa la gama cálida? */
export function esCalido(tema = temaActual()) {
  return CALIDOS.has(tema);
}

/* ---------------------------------------------------------------------------
   La tinta sobre un botón de color
   --------------------------------------------------------------------------- */

export const TINTA_OSCURA = '#071018';
export const TINTA_CLARA = '#ffffff';

/** Los segundos colores de cada tema, hacia donde se va el degradé del botón. */
const SEGUNDO = { consola: '#a78bfa', brasa: '#7f1d1d', sangre: '#7a1f1f', carmin: '#9f1239' };

function aRgb(hex) {
  const h = String(hex || '').trim().replace('#', '');
  const largo = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(largo)) return null;
  return [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16));
}

/** Luminancia relativa de WCAG, de 0 (negro) a 1 (blanco). */
export function luminancia(hex) {
  const rgb = aRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores, de 1 a 21. */
export function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mezclar(a, b, parteDeA) {
  const ra = aRgb(a);
  const rb = aRgb(b);
  if (!ra || !rb) return a;
  return '#' + ra.map((v, i) => Math.round(v * parteDeA + rb[i] * (1 - parteDeA)).toString(16).padStart(2, '0')).join('');
}

/**
 * Con qué color se escribe sobre un botón de este color.
 *
 * El texto del botón principal era siempre casi negro, pensado para el celeste
 * del tema de fábrica. En los temas rojos el botón es un degradé que termina en
 * bordó, y "Registrar hoy" quedaba en negro sobre rojo oscuro: 3,4 de contraste
 * en la punta clara y 2,5 en la otra, cuando lo legible arranca en 4,5.
 *
 * Se elige la tinta que mejor se lee en el PEOR extremo del degradé, no en el
 * promedio: un botón con media palabra ilegible es un botón ilegible.
 *
 * @param {string} color el color del botón (--c)
 * @param {string} [tema]
 * @returns {string} TINTA_OSCURA o TINTA_CLARA
 */
export function tintaSobre(color, tema = temaActual()) {
  if (luminancia(color) === null) return TINTA_OSCURA;
  // El mismo degradé que arma el CSS: del color al 55% de color con el segundo.
  const extremos = [color, mezclar(color, SEGUNDO[tema] || SEGUNDO.consola, 0.55)];
  const peor = (tinta) => Math.min(...extremos.map((e) => contraste(tinta, e)));
  return peor(TINTA_CLARA) > peor(TINTA_OSCURA) ? TINTA_CLARA : TINTA_OSCURA;
}

/** El estilo en línea de un botón principal: su color y la tinta que le va. */
export function estiloDeBoton(color, tema = temaActual()) {
  return `--c:${color};--sobre:${tintaSobre(color, tema)}`;
}
