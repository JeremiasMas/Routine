// robots.txt: se lee y se obedece. Sin excepciones ni banderas para saltearlo.
//
// Si chambers prohíbe una ruta, el scraper no la pide. Y si declara
// Crawl-delay, ese valor manda por encima del ritmo configurado.

/**
 * Parsea un robots.txt a grupos por user-agent.
 * @param {string} texto
 * @returns {{grupos:Map<string,{permitir:string[], prohibir:string[], demora:number|null}>, sitemaps:string[]}}
 */
export function parsearRobots(texto) {
  const grupos = new Map();
  const sitemaps = [];
  let agentesActuales = [];
  let esperandoAgentes = true;

  for (const linea of String(texto).split(/\r?\n/)) {
    const sinComentario = linea.replace(/#.*$/, '').trim();
    if (!sinComentario) continue;
    const corte = sinComentario.indexOf(':');
    if (corte < 0) continue;
    const campo = sinComentario.slice(0, corte).trim().toLowerCase();
    const valor = sinComentario.slice(corte + 1).trim();

    if (campo === 'sitemap') { sitemaps.push(valor); continue; }

    if (campo === 'user-agent') {
      if (!esperandoAgentes) { agentesActuales = []; esperandoAgentes = true; }
      const nombre = valor.toLowerCase();
      agentesActuales.push(nombre);
      if (!grupos.has(nombre)) grupos.set(nombre, { permitir: [], prohibir: [], demora: null });
      continue;
    }

    if (!agentesActuales.length) continue;
    esperandoAgentes = false;
    for (const agente of agentesActuales) {
      const grupo = grupos.get(agente);
      if (campo === 'allow' && valor) grupo.permitir.push(valor);
      else if (campo === 'disallow') grupo.prohibir.push(valor);
      else if (campo === 'crawl-delay') {
        const n = Number(valor.replace(',', '.'));
        if (Number.isFinite(n) && n >= 0) grupo.demora = n;
      }
    }
  }
  return { grupos, sitemaps };
}

/** Patrón de robots (`*` y `$`) a expresión regular anclada al inicio. */
function aRegex(patron) {
  const anclado = patron.endsWith('$');
  const cuerpo = anclado ? patron.slice(0, -1) : patron;
  const escapado = cuerpo.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escapado}${anclado ? '$' : ''}`);
}

/**
 * Reglas aplicables a un agente: el grupo exacto si existe, si no el de `*`.
 */
function grupoPara(grupos, agente) {
  const ua = String(agente).toLowerCase();
  let mejor = null;
  for (const [nombre, grupo] of grupos) {
    if (nombre === '*') continue;
    if (ua.includes(nombre) && (!mejor || nombre.length > mejor.nombre.length)) {
      mejor = { nombre, grupo };
    }
  }
  return mejor?.grupo ?? grupos.get('*') ?? { permitir: [], prohibir: [], demora: null };
}

/**
 * Cierra un robots.txt sobre un user-agent concreto.
 * @param {string} texto contenido de robots.txt ('' = todo permitido)
 * @param {string} agente
 */
export function crearRobots(texto, agente) {
  const { grupos, sitemaps } = parsearRobots(texto ?? '');
  const grupo = grupoPara(grupos, agente);
  const reglas = [
    ...grupo.permitir.map((p) => ({ permite: true, patron: p, re: aRegex(p), peso: p.length })),
    ...grupo.prohibir.filter(Boolean).map((p) => ({ permite: false, patron: p, re: aRegex(p), peso: p.length })),
  ];

  return {
    sitemaps,
    demoraSegundos: grupo.demora,
    /** @param {string} ruta path + query, p. ej. "/legal-rankings/x-1:2:3:4" */
    permitido(ruta) {
      const camino = String(ruta || '/');
      let ganadora = null;
      for (const regla of reglas) {
        if (!regla.re.test(camino)) continue;
        if (!ganadora || regla.peso > ganadora.peso || (regla.peso === ganadora.peso && regla.permite)) {
          ganadora = regla;
        }
      }
      return ganadora ? ganadora.permite : true;
    },
  };
}
