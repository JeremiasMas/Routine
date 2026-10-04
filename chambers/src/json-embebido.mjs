// Cosecha del JSON que el sitio embebe en la propia página.
//
// chambers renderiza con un framework que deja los datos crudos adentro del
// HTML (en <script id="__NEXT_DATA__">, en <script type="application/json">
// o en la cola de hidratación self.__next_f.push([...])). Leer eso es mucho
// más estable que adivinar clases CSS: son los mismos datos que usa la web
// para dibujar la tabla.

const MAX_SPAN = 4_000_000; // no intentamos parsear bloques absurdos

/**
 * Todo el JSON que se pueda rescatar de una página.
 * @param {string} html
 * @returns {unknown[]} valores ya parseados, en orden de aparición
 */
export function cosecharJson(html, { scripts }) {
  const salida = [];
  for (const s of scripts(html)) {
    const esJson = s.tipo.includes('json') || s.id === '__NEXT_DATA__';
    if (esJson) {
      const valor = parsearSeguro(s.contenido);
      if (valor !== undefined) salida.push(valor);
      continue;
    }
    // Cola de hidratación: self.__next_f.push([1,"...json escapado..."])
    for (const trozo of payloadsDeFlight(s.contenido)) {
      salida.push(...jsonBalanceado(trozo));
    }
    // Asignaciones tipo window.__INITIAL_STATE__ = {...}
    if (/window\.__|globalThis\.__|self\.__/.test(s.contenido) && s.contenido.length < MAX_SPAN) {
      for (const m of s.contenido.matchAll(/(?:window|self|globalThis)\.__[A-Z0-9_]+__\s*=\s*/g)) {
        salida.push(...jsonBalanceado(s.contenido.slice(m.index + m[0].length), 1));
      }
    }
  }
  return salida;
}

/**
 * JSON.parse que no explota.
 * @param {string} texto
 * @param {{recortar?:boolean}} [opciones] recortar descarta lo que haya antes
 *   del primer `{` o `[` (útil para scripts con prefijos tipo `3:`).
 */
export function parsearSeguro(texto, { recortar = true } = {}) {
  let limpio = String(texto).trim();
  if (recortar) limpio = limpio.replace(/^[^[{]*/, '');
  if (!limpio || limpio.length > MAX_SPAN) return undefined;
  try {
    return JSON.parse(limpio);
  } catch {
    return undefined;
  }
}

/** Devuelve los strings que Next.js empuja en la cola de hidratación. */
export function payloadsDeFlight(codigo) {
  const salida = [];
  const re = /__next_f\.push\(\s*\[\s*\d+\s*,\s*"((?:[^"\\]|\\.)*)"/g;
  for (const m of String(codigo).matchAll(re)) {
    const crudo = parsearSeguro(`"${m[1]}"`, { recortar: false });
    if (typeof crudo === 'string') salida.push(crudo);
  }
  return salida;
}

/**
 * Recorta de un texto cualquiera los bloques {...} o [...] balanceados y
 * parsea los que resulten JSON válido. Respeta comillas y escapes, así que
 * una llave adentro de un string no desbalancea nada.
 * @param {string} texto
 * @param {number} [limite] cuántos bloques devolver como máximo
 */
export function jsonBalanceado(texto, limite = 40) {
  const s = String(texto);
  const salida = [];
  for (let i = 0; i < s.length && salida.length < limite; i++) {
    const abre = s[i];
    if (abre !== '{' && abre !== '[') continue;
    const cierra = abre === '{' ? '}' : ']';
    let nivel = 0;
    let enString = false;
    let escapado = false;
    let fin = -1;
    for (let j = i; j < s.length && j - i < MAX_SPAN; j++) {
      const c = s[j];
      if (escapado) { escapado = false; continue; }
      if (c === '\\') { escapado = true; continue; }
      if (c === '"') { enString = !enString; continue; }
      if (enString) continue;
      if (c === abre) nivel++;
      else if (c === cierra) {
        nivel--;
        if (nivel === 0) { fin = j; break; }
      }
    }
    if (fin < 0) continue;
    const valor = parsearSeguro(s.slice(i, fin + 1));
    if (valor !== undefined && typeof valor === 'object' && valor !== null) {
      salida.push(valor);
      i = fin; // no volvemos a mirar adentro de lo que ya parseamos
    }
  }
  return salida;
}

/**
 * Recorre un valor en profundidad. El visitante recibe cada objeto/array y la
 * ruta hasta él; devolver false corta esa rama.
 * @param {unknown} valor
 * @param {(nodo:any, ruta:Array<string|number>)=>boolean|void} visitante
 */
export function recorrer(valor, visitante, ruta = [], vistos = new Set()) {
  if (valor === null || typeof valor !== 'object') return;
  if (vistos.has(valor)) return;
  vistos.add(valor);
  if (visitante(valor, ruta) === false) return;
  if (Array.isArray(valor)) {
    valor.forEach((hijo, i) => recorrer(hijo, visitante, [...ruta, i], vistos));
  } else {
    for (const [clave, hijo] of Object.entries(valor)) {
      recorrer(hijo, visitante, [...ruta, clave], vistos);
    }
  }
}
