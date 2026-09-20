/**
 * Temas. Cada uno redefine variables de CSS y nada más: ninguna pantalla sabe
 * de qué tema se trata, así que agregar uno nuevo es agregar un bloque en el
 * CSS y una línea acá.
 */
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

/** El color de una actividad en el tema puesto. */
export function colorDe(actividad, tema = temaActual()) {
  if (!CALIDOS.has(tema)) return actividad?.color;
  return PALETA_CALIDA[actividad?.id] || actividad?.color;
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
