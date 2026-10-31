// Direcciones de chambers.com: armarlas, reconocerlas y leerles los ids.
//
// Toda tabla de ranking vive en una URL con esta forma:
//
//   https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1
//                                       └─────── slug ───────┘ │ │  │ └ subsección
//                                                              │ │  └── ubicación (Argentina)
//                                                              │ └───── área de práctica
//                                                              └─────── guía (9 = Latin America)
//
// Esos cuatro números son la clave primaria de una tabla: sobreviven a los
// cambios de diseño del sitio y son lo único que hace falta para volver a
// buscarla el año que viene.

// Se puede apuntar a otro origen con CHAMBERS_BASE: lo usan las pruebas de
// punta a punta, que levantan un sitio de mentira en localhost.
export const BASE = (process.env.CHAMBERS_BASE ?? 'https://chambers.com').replace(/\/$/, '');

/** Tablas de ranking. El grupo 1 es el slug legible; del 2 al 5, los ids. */
export const RE_TABLA = /\/legal-rankings\/([a-z0-9][a-z0-9-]*?)-(\d+):(\d+):(\d+):(\d+)/gi;

/** Portadas de guía: /legal-guide/latin-america-9 */
export const RE_GUIA = /\/legal-guide\/([a-z0-9][a-z0-9-]*?)-(\d+)\b/gi;

/** Perfiles de persona y de estudio (la parte después del nombre varía). */
export const RE_PERSONA = /\/lawyer\/([a-z0-9][a-z0-9-]*?)-(\d[\d:]*)/gi;
export const RE_ORGANIZACION = /\/(?:department|firm|organisation)\/([a-z0-9][a-z0-9-]*?)-(\d[\d:]*)/gi;

/** Une slug + ids en la clave con la que guardamos una tabla. */
export function claveTabla({ guiaId, areaId, ubicacionId, subseccionId }) {
  return `${guiaId}:${areaId}:${ubicacionId}:${subseccionId}`;
}

/**
 * Arma la URL canónica de una tabla de ranking.
 * @param {{slug:string, guiaId:number, areaId:number, ubicacionId:number, subseccionId:number}} tabla
 */
export function urlTabla({ slug, guiaId, areaId, ubicacionId, subseccionId }) {
  return `${BASE}/legal-rankings/${slug}-${guiaId}:${areaId}:${ubicacionId}:${subseccionId}`;
}

/** Arma la URL de la portada de una guía. */
export function urlGuia({ slug, id }) {
  return `${BASE}/legal-guide/${slug}-${id}`;
}

/**
 * Lee una URL de tabla. Devuelve null si no lo es.
 * @param {string} url
 * @returns {{clave:string, url:string, slug:string, guiaId:number, areaId:number,
 *            ubicacionId:number, subseccionId:number, paisSlug:string}|null}
 */
export function parsearTabla(url) {
  const re = new RegExp(RE_TABLA.source, 'i');
  const m = re.exec(String(url));
  if (!m) return null;
  const tabla = {
    slug: m[1].toLowerCase(),
    guiaId: Number(m[2]),
    areaId: Number(m[3]),
    ubicacionId: Number(m[4]),
    subseccionId: Number(m[5]),
  };
  return {
    ...tabla,
    clave: claveTabla(tabla),
    url: urlTabla(tabla),
    paisSlug: colaDelSlug(tabla.slug),
  };
}

/** Lee una URL de guía. Devuelve null si no lo es. */
export function parsearGuia(url) {
  const m = new RegExp(RE_GUIA.source, 'i').exec(String(url));
  return m ? { slug: m[1].toLowerCase(), id: Number(m[2]) } : null;
}

/**
 * Última palabra (o últimas dos, para "uk-wide" o "hong-kong") del slug: es
 * donde chambers pone la jurisdicción. Sirve para filtrar por país sin haber
 * abierto todavía la página; el nombre real se confirma después con el título.
 */
export function colaDelSlug(slug) {
  const partes = String(slug).toLowerCase().split('-').filter(Boolean);
  return partes.slice(-1)[0] ?? '';
}

/**
 * ¿La tabla parece ser del país pedido? Compara contra la cola del slug para
 * no bajarse media guía antes de descartarla.
 * @param {string} slug slug de la tabla
 * @param {string} paisSlug país normalizado, p. ej. "argentina" o "uk-wide"
 */
export function slugEsDelPais(slug, paisSlug) {
  const s = String(slug).toLowerCase();
  const p = String(paisSlug).toLowerCase().replace(/\s+/g, '-');
  return s === p || s.endsWith(`-${p}`);
}

/** Absolutiza un href relativo y le saca hash y querystring de idioma. */
export function absoluta(href, base = BASE) {
  try {
    const u = new URL(String(href), base);
    if (u.hostname !== new URL(base).hostname) return null;
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Junta todas las tablas de ranking que aparezcan en un texto (HTML, XML de
 * sitemap, JSON embebido: da igual, se buscan por forma de URL).
 * @param {string} texto
 * @returns {Array<ReturnType<typeof parsearTabla>>}
 */
export function cosecharTablas(texto) {
  const vistas = new Map();
  for (const m of String(texto).matchAll(RE_TABLA)) {
    const tabla = parsearTabla(m[0]);
    if (tabla && !vistas.has(tabla.clave)) vistas.set(tabla.clave, tabla);
  }
  return [...vistas.values()];
}

/** Ídem para portadas de guía. */
export function cosecharGuias(texto) {
  const vistas = new Map();
  for (const m of String(texto).matchAll(RE_GUIA)) {
    const guia = parsearGuia(m[0]);
    if (guia && !vistas.has(guia.id)) vistas.set(guia.id, guia);
  }
  return [...vistas.values()];
}

/**
 * Perfiles que aparecen en un texto, con su tipo.
 * @returns {Array<{tipo:'persona'|'organizacion', slug:string, perfilId:string, url:string}>}
 */
export function cosecharPerfiles(texto) {
  const salida = new Map();
  const fuentes = [
    ['persona', RE_PERSONA, 'lawyer'],
    ['organizacion', RE_ORGANIZACION, null],
  ];
  for (const [tipo, re] of fuentes) {
    for (const m of String(texto).matchAll(re)) {
      const url = absoluta(m[0]);
      if (!url || salida.has(url)) continue;
      salida.set(url, { tipo, slug: m[1].toLowerCase(), perfilId: m[2], url });
    }
  }
  return [...salida.values()];
}
