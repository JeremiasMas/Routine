// Descubrimiento: de "quiero Argentina y Chile" a la lista concreta de tablas.
//
// Dos caminos, en orden de preferencia:
//
//   1. el sitemap que declare robots.txt (es la lista que el propio sitio
//      publica para que la recorran: barata y completa);
//   2. un recorrido acotado desde las portadas de guía, siguiendo sólo
//      enlaces que puedan llevar a tablas.
//
// Los dos terminan en lo mismo: URLs /legal-rankings/…-g:a:u:s, que se
// filtran por guía y por país antes de bajar nada.

import { cosecharTablas, cosecharGuias, urlGuia, absoluta, BASE, slugEsDelPais } from './urls.mjs';
import { enlaces } from './html.mjs';
import { aSlug } from './normalizar.mjs';

/** Lista de guías: las conocidas del catálogo más las que estén enlazadas. */
export async function descubrirGuias(cliente, catalogo, { log } = {}) {
  const porId = new Map(catalogo.map((g) => [g.id, { ...g }]));
  try {
    const { cuerpo } = await cliente.obtener(BASE);
    for (const g of cosecharGuias(cuerpo)) {
      if (!porId.has(g.id)) {
        porId.set(g.id, { id: g.id, slug: g.slug, nombre: g.slug.replace(/-/g, ' ') });
        log?.detalle(`guía nueva en la portada: ${g.slug} (${g.id})`);
      }
    }
  } catch (error) {
    log?.aviso(`no se pudo leer la portada para descubrir guías: ${error.message}`);
  }
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

/** ¿Vale la pena seguir este enlace mientras recorremos? */
function vaAAlgunLado(url) {
  const ruta = new URL(url).pathname;
  return /^\/(legal-guide|legal-rankings|practice-areas|locations?|guide)\b/i.test(ruta);
}

/**
 * Tablas de ranking para las guías y países pedidos.
 * @param {object} cliente
 * @param {object} opciones
 * @param {Array<{id:number, slug:string}>} opciones.guias guías a recorrer
 * @param {string[]} opciones.paises slugs de país; vacío = todos
 * @param {number} [opciones.profundidad] saltos desde la portada de cada guía
 * @param {boolean} [opciones.usarSitemap]
 * @returns {Promise<Array<object>>}
 */
export async function descubrirTablas(cliente, { guias, paises = [], profundidad = 2, usarSitemap = true, log } = {}) {
  const idsGuia = new Set(guias.map((g) => g.id));
  const paisesSlug = paises.map(aSlug).filter(Boolean);
  const encontradas = new Map();

  const aceptar = (tabla) => {
    if (idsGuia.size && !idsGuia.has(tabla.guiaId)) return;
    if (paisesSlug.length && !paisesSlug.some((p) => slugEsDelPais(tabla.slug, p))) return;
    if (!encontradas.has(tabla.clave)) encontradas.set(tabla.clave, tabla);
  };

  if (usarSitemap) {
    for (const tabla of await tablasDeSitemap(cliente, { log })) aceptar(tabla);
    log?.info(`sitemap: ${encontradas.size} tablas que encajan con el filtro`);
  }

  // El recorrido corre igual: el sitemap puede estar incompleto o no existir.
  const pendientes = guias.map((g) => ({ url: urlGuia(g), salto: 0 }));
  const visitadas = new Set();
  while (pendientes.length) {
    const { url, salto } = pendientes.shift();
    if (visitadas.has(url) || salto > profundidad) continue;
    visitadas.add(url);
    let cuerpo;
    try {
      ({ cuerpo } = await cliente.obtener(url));
    } catch (error) {
      log?.aviso(`no se pudo leer ${url}: ${error.message}`);
      continue;
    }
    for (const tabla of cosecharTablas(cuerpo)) aceptar(tabla);
    if (salto >= profundidad) continue;
    for (const enlace of enlaces(cuerpo)) {
      const destino = absoluta(enlace.href);
      if (!destino || visitadas.has(destino) || !vaAAlgunLado(destino)) continue;
      if (/\/legal-rankings\//.test(destino)) continue; // ya las cosechamos
      pendientes.push({ url: destino, salto: salto + 1 });
    }
  }

  log?.info(`descubiertas ${encontradas.size} tablas`);
  return [...encontradas.values()];
}

/** Tablas listadas en los sitemaps que declare robots.txt. */
export async function tablasDeSitemap(cliente, { log, maxArchivos = 40 } = {}) {
  const salida = new Map();
  let robots;
  try {
    robots = await cliente.robotsDe(BASE);
  } catch {
    return [];
  }
  const pendientes = [...(robots.sitemaps ?? [])];
  if (!pendientes.length) pendientes.push(`${BASE}/sitemap.xml`);

  const vistos = new Set();
  let leidos = 0;
  while (pendientes.length && leidos < maxArchivos) {
    const url = pendientes.shift();
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    if (/\.gz($|\?)/i.test(url)) {
      log?.aviso(`sitemap comprimido, se saltea: ${url}`);
      continue;
    }
    let cuerpo;
    try {
      ({ cuerpo } = await cliente.obtener(url));
      leidos++;
    } catch (error) {
      log?.aviso(`sitemap ilegible (${error.message}): ${url}`);
      continue;
    }
    for (const tabla of cosecharTablas(cuerpo)) salida.set(tabla.clave, tabla);
    // Índice de sitemaps: encolar los hijos.
    if (/<sitemapindex/i.test(cuerpo)) {
      for (const m of cuerpo.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) pendientes.push(m[1]);
    }
  }
  return [...salida.values()];
}
