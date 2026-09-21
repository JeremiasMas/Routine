// El orquestador: baja cada tabla, la lee y la guarda.
//
// Nada de esto se detiene por una página rota: se anota el fallo con su URL y
// se sigue. Al final la corrida dice cuántas tablas entraron, cuántas filas y
// qué quedó afuera, así se puede reintentar sólo eso.

import { extraerTabla } from './extraer.mjs';
import { cosecharPerfiles } from './urls.mjs';
import { aSlug } from './normalizar.mjs';

/**
 * Identidad estable de una fila. Si hay perfil, manda la URL (es el id que
 * usa chambers); si no, el nombre normalizado dentro de su tipo.
 */
export function idEntidad({ tipo, nombre, url }) {
  const perfil = url ? cosecharPerfiles(url)[0] : null;
  return perfil ? `${tipo}:${perfil.perfilId}` : `${tipo}:${aSlug(nombre)}`;
}

/**
 * Recorre las tablas y las guarda en la base.
 * @param {object} opciones
 * @param {object} opciones.cliente cliente HTTP
 * @param {object} opciones.base base abierta
 * @param {Array<object>} opciones.tablas descriptores de descubrirTablas
 * @param {number} opciones.corridaId
 * @param {Map<number,{nombre:string,slug:string}>} [opciones.guias]
 * @returns {Promise<{tablas:number, filas:number, fallos:number, vacias:string[]}>}
 */
export async function scrapearTablas({ cliente, base, tablas, corridaId, guias = new Map(), forzar = false, log }) {
  const stats = { tablas: 0, filas: 0, fallos: 0, vacias: [] };

  for (const [i, descriptor] of tablas.entries()) {
    const etiqueta = `${i + 1}/${tablas.length} ${descriptor.slug} (${descriptor.clave})`;
    let pagina;
    try {
      pagina = await cliente.obtener(descriptor.url, { forzar });
    } catch (error) {
      stats.fallos++;
      base.registrarFallo({ corridaId, url: descriptor.url, motivo: error.message });
      log?.aviso(`✖ ${etiqueta}: ${error.message}`);
      continue;
    }

    let leida;
    try {
      leida = extraerTabla(pagina.cuerpo, descriptor.url);
    } catch (error) {
      stats.fallos++;
      base.registrarFallo({ corridaId, url: descriptor.url, motivo: `no se pudo leer: ${error.message}` });
      log?.aviso(`✖ ${etiqueta}: no se pudo leer (${error.message})`);
      continue;
    }

    if (!leida.entradas.length) {
      stats.vacias.push(descriptor.url);
      base.registrarFallo({ corridaId, url: descriptor.url, motivo: 'la página no trajo filas' });
      log?.aviso(`○ ${etiqueta}: sin filas (¿cambió el sitio? probá "sondear")`);
      continue;
    }

    base.enTransaccion(() => {
      const guia = guias.get(descriptor.guiaId);
      base.guardarGuia({
        id: descriptor.guiaId,
        slug: guia?.slug ?? aSlug(leida.guia ?? String(descriptor.guiaId)),
        nombre: leida.guia ?? guia?.nombre ?? '',
        url: guia?.url ?? '',
        edicion: leida.edicion,
      });
      base.guardarUbicacion({ id: descriptor.ubicacionId, nombre: leida.ubicacion ?? '', slug: aSlug(leida.ubicacion ?? '') });
      base.guardarArea({ id: descriptor.areaId, nombre: leida.area ?? '', slug: aSlug(leida.area ?? '') });
      base.guardarTabla({ ...descriptor, titulo: leida.titulo, edicion: leida.edicion, fuente: leida.fuente });

      for (const entrada of leida.entradas) {
        const id = idEntidad(entrada);
        base.guardarEntidad({ id, tipo: entrada.tipo, nombre: entrada.nombre, slug: aSlug(entrada.nombre), url: entrada.url });
        base.guardarRanking({
          corridaId,
          tablaClave: descriptor.clave,
          entidadId: id,
          seccion: entrada.seccion ?? '',
          banda: entrada.banda,
          orden: entrada.orden,
        });
        stats.filas++;
      }
      stats.tablas++;
    });

    log?.info(`✓ ${etiqueta}: ${leida.entradas.length} filas (${leida.fuente}${pagina.deCache ? ', caché' : ''})`);
  }

  return stats;
}
