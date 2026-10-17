// Utilidades mínimas de HTML. No es un DOM: es lo justo para encontrar
// scripts, enlaces y texto en una página que no controlamos.
//
// A propósito no dependemos de selectores CSS: cada rediseño de chambers los
// rompe. Lo que no se rompe son las URLs (tienen los ids adentro) y el JSON
// que el propio sitio embebe para hidratar la página.

import { limpiarTexto } from './normalizar.mjs';

const RE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const RE_ATRIBUTO = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Atributos de una etiqueta, como objeto. */
export function atributos(fragmento) {
  const salida = {};
  for (const m of String(fragmento).matchAll(RE_ATRIBUTO)) {
    salida[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return salida;
}

/**
 * Todos los <script> de la página con su tipo y su id.
 * @returns {Array<{tipo:string, id:string, contenido:string}>}
 */
export function scripts(html) {
  const salida = [];
  for (const m of String(html).matchAll(RE_SCRIPT)) {
    const attrs = atributos(m[1]);
    salida.push({ tipo: (attrs.type || 'text/javascript').toLowerCase(), id: attrs.id || '', contenido: m[2] });
  }
  return salida;
}

/** Contenido de <title>. */
export function titulo(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html));
  return m ? limpiarTexto(m[1]) : '';
}

/** Contenido de un <meta> por nombre o propiedad (og:*, description, etc.). */
export function meta(html, nombre) {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${nombre}["'][^>]*>`, 'i');
  const m = re.exec(String(html));
  return m ? limpiarTexto(atributos(m[0]).content || '') : '';
}

/**
 * Enlaces de la página, en orden de aparición y con su texto visible.
 * @returns {Array<{href:string, texto:string, indice:number}>}
 */
export function enlaces(html) {
  const salida = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of String(html).matchAll(re)) {
    const href = atributos(m[1]).href;
    if (!href) continue;
    salida.push({ href, texto: aTexto(m[2]), indice: m.index });
  }
  return salida;
}

/** HTML a texto plano, conservando los saltos que separan bloques. */
export function aTexto(html) {
  return limpiarTexto(
    String(html)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*/g, '\n')
  );
}

/**
 * Texto de la página troceado con la posición donde empieza cada trozo. Sirve
 * para saber qué encabezado de banda quedó *antes* de cada enlace.
 * @returns {Array<{texto:string, indice:number}>}
 */
export function trozosDeTexto(html) {
  const salida = [];
  const re = />([^<>]{1,400})</g;
  for (const m of String(html).matchAll(re)) {
    const texto = limpiarTexto(m[1]);
    if (texto) salida.push({ texto, indice: m.index + 1 });
  }
  return salida;
}
