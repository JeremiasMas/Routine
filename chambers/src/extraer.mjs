// De una página de ranking a filas comparables.
//
// Se intentan dos lecturas, en este orden:
//
//   1. el JSON que el propio sitio embebe para dibujar la tabla;
//   2. el HTML, atando cada enlace a perfil con el último encabezado de banda
//      que quedó por encima.
//
// La segunda es la red de contención: si mañana cambian el framework, los
// enlaces /lawyer/… y los "Band 2" del texto siguen estando.

import { titulo as tituloDe, meta, scripts, enlaces, trozosDeTexto, aTexto } from './html.mjs';
import { cosecharJson, recorrer } from './json-embebido.mjs';
import { normalizarBanda, esEncabezadoDeBanda, limpiarNombre, limpiarTexto, parsearTitulo, parsearEdicion } from './normalizar.mjs';
import { parsearTabla, absoluta, RE_PERSONA, RE_ORGANIZACION } from './urls.mjs';

const CLAVES_NOMBRE = ['name', 'displayname', 'fullname', 'individualname', 'organisationname', 'organizationname', 'personname', 'title'];
const CLAVES_BANDA = ['band', 'bandname', 'bandlabel', 'bandvalue', 'bandnumber', 'banddisplayname', 'rank', 'rankname', 'ranking', 'tier'];
const CLAVES_URL = ['url', 'href', 'path', 'slug', 'profileurl', 'link', 'canonicalurl'];
const CLAVES_SECCION = ['sectionname', 'section', 'heading', 'subsectionname', 'tablename', 'name', 'title'];
const CLAVES_ARRAY = ['individuals', 'organisations', 'organizations', 'rankings', 'items', 'results', 'rows', 'entries', 'people', 'lawyers', 'firms', 'departments', 'bands', 'sections', 'subsections', 'groups', 'tables'];
const CLAVES_EDICION = ['publicationyear', 'year', 'edition', 'editionyear', 'guideyear'];

/** Índice por clave en minúscula, para no depender de cómo la escriban. */
function indexar(obj) {
  const salida = new Map();
  for (const [k, v] of Object.entries(obj)) salida.set(k.toLowerCase(), v);
  return salida;
}

function primeroDe(indice, claves, predicado) {
  for (const clave of claves) {
    if (!indice.has(clave)) continue;
    const valor = indice.get(clave);
    if (predicado(valor)) return valor;
  }
  return undefined;
}

const esTextoUtil = (v) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 160;

/** Tipo de entidad a partir de una URL de perfil. */
export function tipoPorUrl(url) {
  if (!url) return null;
  if (new RegExp(RE_PERSONA.source, 'i').test(url)) return 'persona';
  if (new RegExp(RE_ORGANIZACION.source, 'i').test(url)) return 'organizacion';
  return null;
}

/** Tipo de entidad a partir del nombre de la clave que la contenía. */
function tipoPorContexto(ruta) {
  for (let i = ruta.length - 1; i >= 0; i--) {
    const paso = String(ruta[i]).toLowerCase();
    if (/individual|person|lawyer|people/.test(paso)) return 'persona';
    if (/organisation|organization|firm|department|company/.test(paso)) return 'organizacion';
  }
  return null;
}

/**
 * Lee las filas de ranking que haya en el JSON embebido.
 * @param {unknown[]} valores
 * @returns {Array<object>}
 */
export function entradasDesdeJson(valores) {
  const encontradas = [];
  const contexto = new Map(); // objeto → { banda, seccion }

  for (const raiz of valores) {
    recorrer(raiz, (nodo, ruta) => {
      if (Array.isArray(nodo)) return;
      const indice = indexar(nodo);

      // Contexto heredado del ancestro más cercano que lo haya fijado.
      const padre = contextoDe(contexto, ruta, raiz);
      const bandaLocal = normalizarBanda(primeroDe(indice, CLAVES_BANDA, (v) => normalizarBanda(v) !== null));
      const tieneLista = CLAVES_ARRAY.some((c) => Array.isArray(indice.get(c)));
      // Un grupo cuyo título es "Band 2" fija banda, no sección.
      const tituloGrupo = tieneLista
        ? limpiarTexto(primeroDe(indice, CLAVES_SECCION, esTextoUtil) ?? '')
        : '';
      const bandaDelGrupo = tituloGrupo ? normalizarBanda(tituloGrupo) : null;
      const seccionLocal = bandaDelGrupo ? '' : tituloGrupo;
      contexto.set(nodo, {
        banda: bandaLocal ?? bandaDelGrupo ?? padre.banda,
        seccion: seccionLocal || padre.seccion,
      });

      // Un nodo que contiene listas es un grupo, no una fila.
      if (tieneLista) return;

      const nombre = limpiarNombre(primeroDe(indice, CLAVES_NOMBRE, esTextoUtil) ?? '');
      if (!nombre) return;

      const crudaUrl = primeroDe(indice, CLAVES_URL, (v) => typeof v === 'string' && /lawyer|department|firm|organisation/i.test(v));
      const url = crudaUrl ? absoluta(crudaUrl) : null;
      const banda = bandaLocal ?? contexto.get(nodo).banda;
      const tipo = tipoPorUrl(url) ?? tipoPorContexto(ruta);
      if (!banda && !url) return;      // sin banda ni perfil no es una fila
      if (!tipo) return;               // ni sabemos si es persona o estudio

      encontradas.push({
        tipo,
        nombre,
        url,
        seccion: contexto.get(nodo).seccion || null,
        banda: banda ?? null,
        orden: encontradas.length,
      });
    });
  }
  return deduplicar(encontradas);
}

/** Contexto del ancestro más cercano ya visitado. */
function contextoDe(contexto, ruta, raiz) {
  let nodo = raiz;
  let mejor = { banda: null, seccion: '' };
  for (const paso of ruta) {
    if (nodo === null || typeof nodo !== 'object') break;
    if (contexto.has(nodo)) mejor = contexto.get(nodo);
    nodo = nodo[paso];
  }
  return mejor;
}

/**
 * Lectura de respaldo: enlaces a perfil + el encabezado de banda anterior.
 * @param {string} html
 */
export function entradasDesdeHtml(html) {
  const encabezados = trozosDeTexto(html)
    .filter((t) => esEncabezadoDeBanda(t.texto))
    .map((t) => ({ indice: t.indice, banda: normalizarBanda(t.texto) }));

  const encontradas = [];
  for (const enlace of enlaces(html)) {
    const url = absoluta(enlace.href);
    const tipo = tipoPorUrl(url);
    if (!tipo) continue;
    const nombre = limpiarNombre(enlace.texto) || nombreDesdeUrl(url);
    if (!nombre) continue;
    let banda = null;
    for (const e of encabezados) {
      if (e.indice < enlace.indice) banda = e.banda;
      else break;
    }
    encontradas.push({ tipo, nombre, url, seccion: null, banda, orden: encontradas.length });
  }
  return deduplicar(encontradas);
}

/** "juan-perez-latin-america-9:123" → "Juan Perez Latin America". */
function nombreDesdeUrl(url) {
  const m = /\/(?:lawyer|department|firm|organisation)\/([a-z0-9-]+?)-\d/i.exec(String(url));
  if (!m) return '';
  return m[1].split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Una fila por entidad: gana la que traiga más datos. */
function deduplicar(entradas) {
  const porClave = new Map();
  for (const e of entradas) {
    const clave = e.url || `${e.tipo}|${e.nombre.toLowerCase()}|${e.seccion ?? ''}`;
    const previa = porClave.get(clave);
    if (!previa) { porClave.set(clave, e); continue; }
    porClave.set(clave, {
      ...previa,
      url: previa.url ?? e.url,
      banda: previa.banda ?? e.banda,
      seccion: previa.seccion ?? e.seccion,
    });
  }
  return [...porClave.values()].map((e, i) => ({ ...e, orden: i }));
}

/** Año de edición de la guía, mirando título, metadatos, JSON y cuerpo. */
export function detectarEdicion(html, valoresJson = []) {
  const candidatos = [meta(html, 'og:title'), tituloDe(html), meta(html, 'description')];
  for (const c of candidatos) {
    const año = parsearEdicion(c);
    if (año) return año;
  }
  for (const raiz of valoresJson) {
    let año = null;
    recorrer(raiz, (nodo) => {
      if (año || Array.isArray(nodo)) return;
      const indice = indexar(nodo);
      for (const clave of CLAVES_EDICION) {
        const valor = indice.get(clave);
        const n = typeof valor === 'number' ? valor : parsearEdicion(valor ?? '');
        if (n && n >= 1990 && n <= 2100) { año = n; return false; }
      }
    });
    if (año) return año;
  }
  // El encabezado de las portadas de guía suele ser "Chambers <guía> <año>".
  const h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i.exec(html)?.[1];
  const añoH1 = h1 ? parsearEdicion(aTexto(h1)) : null;
  if (añoH1) return añoH1;

  const texto = aTexto(html).slice(0, 20000);
  const m = /\b(?:guide|edition|guía|edición)\s*((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\s*(?:guide|edition)\b/i.exec(texto);
  if (m) return Number(m[1] || m[2]);
  const cerca = /Chambers[^.<>]{0,40}?\b((?:19|20)\d{2})\b/i.exec(texto);
  return cerca ? Number(cerca[1]) : null;
}

/**
 * Lee una página de tabla de ranking completa.
 * @param {string} html
 * @param {string} url
 * @returns {{url:string, clave:string|null, slug:string|null, guiaId:number|null,
 *            areaId:number|null, ubicacionId:number|null, subseccionId:number|null,
 *            titulo:string, area:string|null, ubicacion:string|null, guia:string|null,
 *            edicion:number|null, fuente:'json'|'html'|'vacio', entradas:Array<object>}}
 */
export function extraerTabla(html, url) {
  const ids = parsearTabla(url) ?? {};
  const bruto = tituloDe(html);
  const desdeTitulo = parsearTitulo(bruto) ?? parsearTitulo(meta(html, 'og:title')) ?? null;
  const valores = cosecharJson(html, { scripts });

  let entradas = entradasDesdeJson(valores);
  let fuente = entradas.length ? 'json' : 'vacio';
  if (!entradas.length) {
    entradas = entradasDesdeHtml(html);
    fuente = entradas.length ? 'html' : 'vacio';
  }

  return {
    url,
    clave: ids.clave ?? null,
    slug: ids.slug ?? null,
    guiaId: ids.guiaId ?? null,
    areaId: ids.areaId ?? null,
    ubicacionId: ids.ubicacionId ?? null,
    subseccionId: ids.subseccionId ?? null,
    titulo: bruto,
    area: desdeTitulo?.area ?? null,
    ubicacion: desdeTitulo?.ubicacion ?? null,
    guia: desdeTitulo?.guia || null,
    edicion: detectarEdicion(html, valores),
    fuente,
    entradas,
  };
}
