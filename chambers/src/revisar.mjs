// "¿Salió una guía nueva?" — sin abrir el navegador ni pedirle nada al sitio
// más que la portada de cada guía.
//
// De cada portada se sacan dos señales: el año de edición y la huella del
// índice de tablas. Un año distinto es una guía nueva publicada; una huella
// distinta con el mismo año es un retoque (tablas que se agregaron o se
// fueron). Cualquiera de las dos amerita volver a bajar todo.

import { createHash } from 'node:crypto';
import { cosecharTablas, urlGuia } from './urls.mjs';
import { detectarEdicion } from './extraer.mjs';

/**
 * @param {object} opciones
 * @param {object} opciones.cliente
 * @param {object} opciones.base
 * @param {Array<{id:number, slug:string, nombre?:string}>} opciones.guias
 * @returns {Promise<{revisadas:object[], novedades:object[]}>}
 */
export async function revisarGuias({ cliente, base, guias, log, guardar = true }) {
  const revisadas = [];

  for (const guia of guias) {
    const url = urlGuia(guia);
    let cuerpo;
    try {
      ({ cuerpo } = await cliente.obtener(url, { forzar: true }));
    } catch (error) {
      log?.aviso(`no se pudo revisar ${guia.slug}: ${error.message}`);
      revisadas.push({ ...guia, url, estado: 'ilegible', motivo: error.message });
      continue;
    }

    const edicion = detectarEdicion(cuerpo);
    const claves = cosecharTablas(cuerpo)
      .filter((t) => t.guiaId === guia.id)
      .map((t) => t.clave)
      .sort();
    const huella = createHash('sha1').update(`${edicion ?? ''}|${claves.join(',')}`).digest('hex');

    const previo = base.huellaDeGuia(guia.id);
    let estado = 'sin cambios';
    if (!previo || !previo.huella) estado = 'primera vez';
    else if (edicion && previo.edicion && edicion !== previo.edicion) estado = 'edición nueva';
    else if (previo.huella !== huella) estado = 'índice cambiado';

    if (guardar) {
      base.guardarGuia({ id: guia.id, slug: guia.slug, nombre: guia.nombre ?? '', url, edicion, huella });
    }

    const fila = { ...guia, url, edicion, edicionPrevia: previo?.edicion ?? null, tablas: claves.length, estado };
    revisadas.push(fila);
    log?.info(`${estado === 'sin cambios' ? '·' : '★'} ${guia.slug}: ${estado}${edicion ? ` (edición ${edicion})` : ''} · ${claves.length} tablas en la portada`);
  }

  return { revisadas, novedades: revisadas.filter((r) => r.estado !== 'sin cambios' && r.estado !== 'ilegible') };
}
