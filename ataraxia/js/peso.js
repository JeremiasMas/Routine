// El peso: los niveles del índice de masa corporal, pasados a kilos para su
// altura. Módulo puro, como logica.js.

/**
 * Los niveles son los de la Organización Mundial de la Salud. No se inventan
 * nombres nuevos: son los que va a escuchar en cualquier consultorio.
 *
 * El IMC no distingue músculo de grasa ni cómo se reparte, así que ubica pero
 * no diagnostica. Por eso la app lo muestra como una escala y no como una nota.
 */
export const NIVELES_PESO = [
  { id: 'bajo', nombre: 'Bajo peso', hasta: 18.5, color: '#93c5fd' },
  { id: 'saludable', nombre: 'Saludable', hasta: 25, color: '#5eead4' },
  { id: 'sobrepeso', nombre: 'Sobrepeso', hasta: 30, color: '#facc15' },
  { id: 'obesidad-1', nombre: 'Obesidad grado I', hasta: 35, color: '#fdba74' },
  { id: 'obesidad-2', nombre: 'Obesidad grado II', hasta: 40, color: '#fb923c' },
  { id: 'obesidad-3', nombre: 'Obesidad grado III', hasta: Infinity, color: '#f87171' },
];

export const PESO_MIN = 30;
export const PESO_MAX = 250;

/** XP por pesarse: una vez por semana, que es lo que tiene sentido medir. */
export const XP_PESO = 50;

export function imc(kg, cm) {
  if (!(kg > 0) || !(cm > 0)) return null;
  const m = cm / 100;
  return kg / (m * m);
}

/** El nivel que corresponde a un IMC. */
export function nivelDeImc(valor) {
  if (valor == null) return null;
  const i = NIVELES_PESO.findIndex((n) => valor < n.hasta);
  return { ...NIVELES_PESO[i], indice: i };
}

/** El peso que corresponde a un IMC para una altura, redondeado a 0,1 kg. */
export function kgDeImc(valor, cm) {
  const m = cm / 100;
  return Math.round(valor * m * m * 10) / 10;
}

/**
 * Cada nivel con sus kilos para esta altura. Con 165 cm: saludable de
 * 50,4 a 68,1 kg.
 */
export function nivelesEnKg(cm) {
  let desde = null;
  return NIVELES_PESO.map((n) => {
    const hasta = Number.isFinite(n.hasta) ? kgDeImc(n.hasta, cm) : null;
    const fila = { ...n, desdeKg: desde, hastaKg: hasta };
    desde = hasta;
    return fila;
  });
}

/** El rango saludable en kilos para una altura. */
export function rangoSaludable(cm) {
  return { min: kgDeImc(18.5, cm), max: kgDeImc(25, cm) };
}

export function pesoValido(kg) {
  return Number.isFinite(kg) && kg >= PESO_MIN && kg <= PESO_MAX;
}

/** Todas las pesadas, de la más vieja a la más nueva, sin pasar de `hasta`. */
export function pesadas(estado, hasta = '9999-12-31') {
  return Object.entries(estado.dias)
    .filter(([clave, d]) => clave <= hasta && pesoValido(d?.peso))
    .map(([clave, d]) => ({ clave, kg: d.peso }))
    .sort((a, b) => (a.clave < b.clave ? -1 : 1));
}

/**
 * Una meta por debajo del rango saludable no se acepta. Bajar de ahí ya no
 * es cuidarse, y una app de hábitos no debería empujar hacia allá.
 */
export function metaValida(kg, cm) {
  return pesoValido(kg) && kg >= rangoSaludable(cm).min;
}

/**
 * Todo lo que se muestra del peso a una fecha: el último, el nivel, cuánto
 * cambió y cuánto falta para la meta.
 */
export function resumenPeso(estado, hoy) {
  const { altura, meta } = estado.config.peso;
  const lista = pesadas(estado, hoy);
  const ultimo = lista[lista.length - 1] || null;
  const valor = ultimo ? imc(ultimo.kg, altura) : null;
  const primero = lista[0] || null;
  // Contra la pesada más cercana a cuatro semanas atrás: una sola pesada
  // contra la anterior se mueve por agua y sal, no por lo que se come.
  let hace4 = null;
  if (ultimo) {
    const corte = restarDias(ultimo.clave, 28);
    for (const p of lista) if (p.clave <= corte) hace4 = p;
  }
  let faltaMeta = null;
  if (ultimo && meta && primero) {
    const bajando = meta < primero.kg;
    const falta = bajando ? ultimo.kg - meta : meta - ultimo.kg;
    faltaMeta = { kg: Math.max(0, Math.round(falta * 10) / 10), alcanzada: falta <= 0, bajando };
  }
  return {
    altura,
    meta,
    lista,
    ultimo,
    imc: valor,
    nivel: nivelDeImc(valor),
    rango: rangoSaludable(altura),
    cambio4: ultimo && hace4 ? Math.round((ultimo.kg - hace4.kg) * 10) / 10 : null,
    cambioTotal: ultimo && primero && primero !== ultimo ? Math.round((ultimo.kg - primero.kg) * 10) / 10 : null,
    faltaMeta,
  };
}

function restarDias(clave, n) {
  const [a, m, d] = clave.split('-').map(Number);
  const f = new Date(a, m - 1, d - n, 12);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
