// Lector mínimo de ZIP, para tragarse el export de Samsung Health tal cual
// viene en vez de pedir que lo descomprimas y busques el CSV adentro.
//
// Usa DecompressionStream, que ya traen los navegadores y Node: no hace falta
// ninguna librería. No contempla ZIP64 (archivos de más de 4 GB o con más de
// 65535 entradas), que un export de pasos nunca va a alcanzar.

const FIRMA_EOCD = 0x06054b50;   // fin del directorio central
const FIRMA_CENTRAL = 0x02014b50; // entrada del directorio central
const FIRMA_LOCAL = 0x04034b50;   // cabecera local de archivo

/** Busca el fin del directorio central, que está al final del archivo. */
function buscarEocd(vista) {
  const maxComentario = 0xffff;
  const desde = Math.max(0, vista.byteLength - maxComentario - 22);
  for (let i = vista.byteLength - 22; i >= desde; i--) {
    if (vista.getUint32(i, true) === FIRMA_EOCD) return i;
  }
  return -1;
}

/**
 * Lista las entradas de un ZIP sin descomprimir nada todavía.
 * @param {ArrayBuffer} buffer
 * @returns {Array<{name:string, method:number, compressedSize:number, size:number, offset:number}>}
 */
export function listarEntradas(buffer) {
  const vista = new DataView(buffer);
  const eocd = buscarEocd(vista);
  if (eocd < 0) throw new Error('El archivo no parece un ZIP válido.');

  const cantidad = vista.getUint16(eocd + 10, true);
  let puntero = vista.getUint32(eocd + 16, true);
  const decodificador = new TextDecoder();
  const entradas = [];

  for (let i = 0; i < cantidad; i++) {
    if (vista.getUint32(puntero, true) !== FIRMA_CENTRAL) break;
    const method = vista.getUint16(puntero + 10, true);
    const compressedSize = vista.getUint32(puntero + 20, true);
    const size = vista.getUint32(puntero + 24, true);
    const largoNombre = vista.getUint16(puntero + 28, true);
    const largoExtra = vista.getUint16(puntero + 30, true);
    const largoComentario = vista.getUint16(puntero + 32, true);
    const offset = vista.getUint32(puntero + 42, true);
    const name = decodificador.decode(new Uint8Array(buffer, puntero + 46, largoNombre));
    entradas.push({ name, method, compressedSize, size, offset });
    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

/** Descomprime una entrada y la devuelve como texto. */
export async function leerEntrada(buffer, entrada) {
  const vista = new DataView(buffer);
  if (vista.getUint32(entrada.offset, true) !== FIRMA_LOCAL) {
    throw new Error(`Cabecera dañada en ${entrada.name}`);
  }
  const largoNombre = vista.getUint16(entrada.offset + 26, true);
  const largoExtra = vista.getUint16(entrada.offset + 28, true);
  const inicio = entrada.offset + 30 + largoNombre + largoExtra;
  const datos = new Uint8Array(buffer, inicio, entrada.compressedSize);

  if (entrada.method === 0) return new TextDecoder().decode(datos);   // sin comprimir
  if (entrada.method !== 8) throw new Error(`Compresión no soportada en ${entrada.name}`);

  const stream = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/**
 * Saca del ZIP los archivos de texto cuyo nombre pase el filtro.
 * @returns {Promise<Array<{name:string, text:string}>>}
 */
export async function extraerTextos(buffer, filtro = () => true) {
  const salida = [];
  for (const entrada of listarEntradas(buffer)) {
    if (entrada.name.endsWith('/') || !filtro(entrada.name)) continue;
    salida.push({ name: entrada.name, text: await leerEntrada(buffer, entrada) });
  }
  return salida;
}
