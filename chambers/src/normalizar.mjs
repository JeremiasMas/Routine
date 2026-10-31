// Normalización de lo que dice chambers a algo comparable entre guías y años.
//
// Las bandas no son sólo números: "Star Individuals" está por encima de la
// banda 1, "Up and Coming" no compite con ninguna banda, y cada guía usa un
// subconjunto distinto. Guardamos siempre la etiqueta original y, al lado, un
// orden numérico para poder decir "subió" o "bajó" sin perder el matiz.

const ORDEN_ESPECIAL = [
  [/^star\s+individuals?$/i, 'Star Individuals', 0, 'estrella'],
  [/^global\s+market\s+leaders?$/i, 'Global Market Leaders', 0, 'estrella'],
  [/^senior\s+statespe(ople|rson)$/i, 'Senior Statespeople', 1, 'destacado'],
  [/^eminent\s+practitioners?$/i, 'Eminent Practitioners', 2, 'destacado'],
  [/^star\s+associates?$/i, 'Star Associates', 80, 'promesa'],
  [/^up[\s-]*(?:and|&)?[\s-]*coming$/i, 'Up and Coming', 90, 'promesa'],
  [/^associates?\s+to\s+watch$/i, 'Associates to Watch', 91, 'promesa'],
  [/^spotlight(\s+table)?$/i, 'Spotlight Table', 92, 'destacado'],
  [/^notable\s+practitioners?$/i, 'Notable Practitioners', 93, 'destacado'],
  [/^recognised?\s+practitioners?$/i, 'Recognised Practitioner', 95, 'destacado'],
  [/^foreign\s+experts?$/i, 'Foreign Experts', 96, 'destacado'],
];

/**
 * Lee una banda tal como la escribe chambers.
 * @param {string} texto p. ej. "Band 2", "Star Individuals", "Up and Coming"
 * @returns {{etiqueta:string, numero:number|null, orden:number, tipo:string}|null}
 */
export function normalizarBanda(texto) {
  const limpio = limpiarTexto(texto);
  if (!limpio) return null;

  const banda = /^(?:band|banda)\s*([0-9]{1,2})$/i.exec(limpio) || /^([1-9][0-9]?)$/.exec(limpio);
  if (banda) {
    const numero = Number(banda[1]);
    if (numero < 1 || numero > 20) return null;
    return { etiqueta: `Band ${numero}`, numero, orden: 10 + numero, tipo: 'banda' };
  }

  for (const [re, etiqueta, orden, tipo] of ORDEN_ESPECIAL) {
    if (re.test(limpio)) return { etiqueta, numero: null, orden, tipo };
  }
  return null;
}

/** ¿Este texto suelto es el encabezado de una banda? */
export function esEncabezadoDeBanda(texto) {
  return normalizarBanda(texto) !== null;
}

/** Espacios raros, entidades HTML y adornos fuera. */
export function limpiarTexto(valor) {
  if (valor == null) return '';
  return String(valor)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ ​‎‏]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre de persona o estudio, sin el ruido que a veces viene pegado. */
export function limpiarNombre(valor) {
  return limpiarTexto(valor)
    .replace(/\s*\((?:ranked in|ordered by)[^)]*\)$/i, '')
    .replace(/\s*[|·–—]\s*Chambers.*$/i, '')
    .trim();
}

/** Slug estable para nombres de país, área o guía escritos por una persona. */
export function aSlug(valor) {
  return limpiarTexto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Los títulos de las tablas vienen como "Área, Ubicación, Guía | Chambers
 * Rankings". Es la fuente más confiable de los tres nombres: sobrevive a los
 * rediseños porque es el <title> de la página.
 * @param {string} titulo
 * @returns {{area:string, ubicacion:string, guia:string}|null}
 */
export function parsearTitulo(titulo) {
  const limpio = limpiarTexto(titulo).replace(/\s*\|\s*Chambers.*$/i, '');
  if (!limpio) return null;
  const partes = limpio.split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const guia = partes.length >= 3 ? partes.pop() : '';
  const ubicacion = partes.pop();
  const area = partes.join(', ');
  if (!area || !ubicacion) return null;
  return { area, ubicacion, guia };
}

/** Año de edición de una guía ("Chambers Latin America 2026" → 2026). */
export function parsearEdicion(texto) {
  const m = /\b(19|20)\d{2}\b/.exec(limpiarTexto(texto));
  return m ? Number(m[0]) : null;
}
