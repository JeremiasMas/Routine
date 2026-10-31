#!/usr/bin/env node
// Scraper de rankings de chambers.com.
//
//   node chambers/cli.mjs <comando> [opciones]
//
// Comandos:
//   descubrir   arma la lista de tablas de ranking de los países pedidos
//   scrapear    descubre y baja: deja todo en la base SQLite
//   revisar     ¿hay guía nueva publicada? (código de salida 10 si sí)
//   diff        qué cambió entre dos corridas
//   exportar    CSV/JSON de la foto vigente
//   estado      qué hay guardado
//   sondear     diagnostica una URL suelta (qué lectura funcionó y qué trajo)
//
// Antes de nada: `--ua "MiScraper/1.0 (+mail)"` o el campo userAgent del
// archivo de configuración. Identificarse no es opcional.

import './src/silencio.mjs';

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { crearCliente, ErrorRobots } from './src/http.mjs';
import { crearLog } from './src/log.mjs';
import { abrirBase } from './src/base.mjs';
import { descubrirGuias, descubrirTablas } from './src/descubrir.mjs';
import { scrapearTablas } from './src/scrapear.mjs';
import { revisarGuias } from './src/revisar.mjs';
import { compararCorridas, resumirDiferencias } from './src/diferencias.mjs';
import { exportarRankings, aCsv, escribir } from './src/exportar.mjs';
import { extraerTabla } from './src/extraer.mjs';
import { aSlug } from './src/normalizar.mjs';

// Node no lee HTTPS_PROXY por su cuenta; si hay proxy configurado, esto se lo
// hace mirar (Node ≥ 22.21). Tiene que pasar antes del primer fetch.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) process.env.NODE_USE_ENV_PROXY = '1';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** --clave valor · --clave=valor · --bandera · --no-bandera */
export function parsearArgs(argv) {
  const opciones = {};
  const sueltos = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { sueltos.push(arg); continue; }
    const [clave, ...resto] = arg.slice(2).split('=');
    if (resto.length) { opciones[clave] = resto.join('='); continue; }
    if (clave.startsWith('no-')) { opciones[clave.slice(3)] = false; continue; }
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith('--')) { opciones[clave] = true; continue; }
    opciones[clave] = siguiente;
    i++;
  }
  return { opciones, sueltos };
}

/** "argentina, chile" o ["argentina","chile"] → ['argentina','chile'] */
export function listaDe(valor) {
  if (valor === undefined || valor === true || valor === false) return [];
  return String(valor).split(',').map((v) => v.trim()).filter(Boolean);
}

async function leerJson(ruta, porDefecto = null) {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'));
  } catch (error) {
    if (porDefecto !== null) return porDefecto;
    throw new Error(`no se pudo leer ${ruta}: ${error.message}`);
  }
}

async function cargarConfig(opciones) {
  const ruta = opciones.config ? resolve(String(opciones.config)) : join(AQUI, 'config', 'scraper.json');
  const archivo = await leerJson(ruta, {});
  const catalogo = await leerJson(join(AQUI, 'config', 'guias.json'), { guias: [] });

  const cfg = {
    ...archivo,
    userAgent: opciones.ua ?? process.env.CHAMBERS_UA ?? archivo.userAgent,
    demoraMs: Number(opciones.demora ?? archivo.demoraMs ?? 2000),
    concurrencia: Number(opciones.concurrencia ?? archivo.concurrencia ?? 1),
    reintentos: Number(opciones.reintentos ?? archivo.reintentos ?? 4),
    profundidad: Number(opciones.profundidad ?? archivo.profundidad ?? 2),
    maxEdadHoras: Number(opciones['max-edad'] ?? archivo.maxEdadHoras ?? 168),
    usarSitemap: opciones.sitemap === false ? false : (archivo.usarSitemap ?? true),
    base: resolve(String(opciones.base ?? process.env.CHAMBERS_DB ?? archivo.base ?? 'chambers/datos/chambers.sqlite')),
    cache: opciones.cache === false ? null : resolve(String(opciones.cache ?? archivo.cache ?? 'chambers/datos/cache')),
    paises: listaDe(opciones.pais).length ? listaDe(opciones.pais).map(aSlug) : (archivo.paises ?? []).map(aSlug),
    guias: listaDe(opciones.guia).length ? listaDe(opciones.guia) : (archivo.guias ?? []),
    catalogo: catalogo.guias ?? [],
    limite: opciones.limite ? Number(opciones.limite) : null,
    forzar: opciones.forzar === true,
  };

  if (!cfg.userAgent || /PONER-UN-MAIL/.test(cfg.userAgent)) {
    throw new Error('Configurá un user-agent con contacto real: --ua "MiScraper/1.0 (+mail@dominio)" o el campo userAgent de chambers/config/scraper.json');
  }
  return cfg;
}

function armarCliente(cfg, log) {
  return crearCliente({
    userAgent: cfg.userAgent,
    demoraMs: cfg.demoraMs,
    concurrencia: cfg.concurrencia,
    reintentos: cfg.reintentos,
    cacheDir: cfg.cache,
    maxEdadMs: cfg.maxEdadHoras * 3600 * 1000,
    log,
  });
}

/** Guías pedidas por nombre/slug/id, contra el catálogo ya descubierto. */
function elegirGuias(todas, pedidas) {
  if (!pedidas.length) return todas;
  const quiere = pedidas.map((p) => String(p).toLowerCase());
  return todas.filter((g) => quiere.includes(String(g.id)) || quiere.includes(g.slug.toLowerCase()) || quiere.includes(String(g.nombre ?? '').toLowerCase()));
}

const COMANDOS = {
  async descubrir(cfg, log) {
    const cliente = armarCliente(cfg, log);
    const base = abrirBase(cfg.base);
    try {
      const guias = elegirGuias(await descubrirGuias(cliente, cfg.catalogo, { log }), cfg.guias);
      log.info(`guías: ${guias.map((g) => g.slug).join(', ') || '(ninguna)'}`);
      const tablas = await descubrirTablas(cliente, { guias, paises: cfg.paises, profundidad: cfg.profundidad, usarSitemap: cfg.usarSitemap, log });
      for (const g of guias) base.guardarGuia({ id: g.id, slug: g.slug, nombre: g.nombre ?? '' });
      process.stdout.write(JSON.stringify(tablas.map((t) => ({ clave: t.clave, slug: t.slug, url: t.url })), null, 2) + '\n');
      log.info(`${tablas.length} tablas para ${cfg.paises.join(', ') || 'todos los países'}`);
      return tablas.length ? 0 : 1;
    } finally {
      base.cerrar();
    }
  },

  async scrapear(cfg, log) {
    const cliente = armarCliente(cfg, log);
    const base = abrirBase(cfg.base);
    try {
      const guias = elegirGuias(await descubrirGuias(cliente, cfg.catalogo, { log }), cfg.guias);
      let tablas = await descubrirTablas(cliente, { guias, paises: cfg.paises, profundidad: cfg.profundidad, usarSitemap: cfg.usarSitemap, log });
      if (cfg.limite) tablas = tablas.slice(0, cfg.limite);
      if (!tablas.length) {
        log.error('no se encontró ninguna tabla: revisá --pais y --guia, o probá --no-sitemap --profundidad 3');
        return 1;
      }

      const corridaId = base.iniciarCorrida({ paises: cfg.paises, guias: guias.map((g) => g.slug) });
      const stats = await scrapearTablas({
        cliente, base, tablas, corridaId, forzar: cfg.forzar, log,
        guias: new Map(guias.map((g) => [g.id, g])),
      });
      base.cerrarCorrida(corridaId, { tablas: stats.tablas, filas: stats.filas, fallos: stats.fallos + stats.vacias.length });

      log.info(`corrida ${corridaId}: ${stats.tablas} tablas · ${stats.filas} filas · ${stats.fallos} fallos · ${stats.vacias.length} vacías`);
      log.info(`pedidos: ${cliente.stats.pedidos} · caché: ${cliente.stats.cache} · revalidados: ${cliente.stats.revalidados}`);

      const previa = base.corridas(2)[1];
      if (previa) log.info(`contra la corrida ${previa.id}: ${resumirDiferencias(compararCorridas(base, previa.id, corridaId))}`);
      return stats.tablas ? 0 : 1;
    } finally {
      base.cerrar();
    }
  },

  async revisar(cfg, log) {
    const cliente = armarCliente(cfg, log);
    const base = abrirBase(cfg.base);
    try {
      const guias = elegirGuias(await descubrirGuias(cliente, cfg.catalogo, { log }), cfg.guias);
      const { revisadas, novedades } = await revisarGuias({ cliente, base, guias, log });
      process.stdout.write(JSON.stringify({ revisadas, novedades }, null, 2) + '\n');
      return novedades.length ? 10 : 0; // 10 = "hay guía nueva", para el workflow
    } finally {
      base.cerrar();
    }
  },

  async diff(cfg, log, { opciones }) {
    const base = abrirBase(cfg.base);
    try {
      const corridas = base.corridas(50);
      if (corridas.length < 2) { log.error('hacen falta dos corridas para comparar'); return 1; }
      const hasta = Number(opciones.hasta ?? corridas[0].id);
      const desde = Number(opciones.desde ?? corridas.find((c) => c.id < hasta)?.id);
      const resultado = compararCorridas(base, desde, hasta);
      log.info(`corrida ${desde} → ${hasta}: ${resumirDiferencias(resultado)}`);
      process.stdout.write(JSON.stringify(resultado, null, 2) + '\n');
      return 0;
    } finally {
      base.cerrar();
    }
  },

  async exportar(cfg, log, { opciones }) {
    const base = abrirBase(cfg.base);
    try {
      const formato = String(opciones.formato ?? 'csv');
      const salida = String(opciones.salida ?? join(cfg.exportar ?? 'chambers/datos/export', `rankings.${formato === 'ndjson' ? 'ndjson' : formato}`));
      const { filas, ruta } = await exportarRankings(base, { formato, salida, paises: listaDe(opciones.pais), guias: listaDe(opciones.guia) });
      log.info(`${filas} filas → ${ruta}`);
      return filas ? 0 : 1;
    } finally {
      base.cerrar();
    }
  },

  async estado(cfg, log) {
    const base = abrirBase(cfg.base);
    try {
      const resumen = base.consultar(`
        SELECT g.nombre AS guia, u.nombre AS pais, COUNT(DISTINCT t.clave) AS tablas, COUNT(*) AS filas
        FROM ranking_vigente r
        JOIN tabla t ON t.clave = r.tabla_clave
        LEFT JOIN guia g ON g.id = t.guia_id
        LEFT JOIN ubicacion u ON u.id = t.ubicacion_id
        GROUP BY guia, pais ORDER BY filas DESC`);
      const corridas = base.corridas(5);
      process.stdout.write(`base: ${cfg.base}\n\n`);
      process.stdout.write(resumen.length ? aCsv(resumen.map((f) => ({ ...f }))) : '(vacía)\n');
      process.stdout.write('\núltimas corridas:\n');
      for (const c of corridas) {
        process.stdout.write(`  ${c.id}\t${c.inicio}\t${c.tablas} tablas\t${c.filas} filas\t${c.fallos} fallos\t${c.paises}\n`);
      }
      return 0;
    } finally {
      base.cerrar();
    }
  },

  async sondear(cfg, log, { sueltos }) {
    const url = sueltos[0];
    if (!url) { log.error('falta la URL: node chambers/cli.mjs sondear <url>'); return 1; }
    const cliente = armarCliente(cfg, log);
    const { cuerpo, deCache } = await cliente.obtener(url, { forzar: cfg.forzar });
    const leida = extraerTabla(cuerpo, url);
    process.stdout.write(JSON.stringify({
      url, deCache, bytes: cuerpo.length,
      clave: leida.clave, titulo: leida.titulo, area: leida.area, ubicacion: leida.ubicacion,
      guia: leida.guia, edicion: leida.edicion, lectura: leida.fuente, filas: leida.entradas.length,
      muestra: leida.entradas.slice(0, 15).map((e) => ({ tipo: e.tipo, nombre: e.nombre, banda: e.banda?.etiqueta ?? null, seccion: e.seccion })),
    }, null, 2) + '\n');
    if (leida.fuente === 'vacio') {
      const volcado = await escribir(join(dirname(cfg.base), 'sondeo.html'), cuerpo);
      log.aviso(`ninguna de las dos lecturas encontró filas: el HTML quedó en ${volcado} para mirarlo a ojo.`);
      return 1;
    }
    return 0;
  },
};

const AYUDA = `
Scraper de rankings de chambers.com

  node chambers/cli.mjs <comando> [opciones]

Comandos
  descubrir            lista las tablas de ranking que corresponden al filtro
  scrapear             descubre, baja y guarda en la base
  revisar              ¿se publicó una guía nueva? (sale con código 10 si sí)
  diff [--desde N] [--hasta M]
  exportar [--formato csv|json|ndjson] [--salida archivo]
  estado               qué hay guardado
  sondear <url>        diagnóstico de una página suelta

Opciones
  --pais argentina,chile     países (slug del país como aparece en la URL)
  --guia latin-america,global  guías por slug, nombre o id
  --ua "MiScraper/1.0 (+mail@dominio)"   obligatorio si no está en la config
  --demora 2000              pausa mínima entre pedidos, en ms
  --concurrencia 1           pedidos en paralelo
  --profundidad 2            saltos al recorrer desde la portada de cada guía
  --limite 20                cortar después de N tablas (para probar)
  --forzar                   ignorar la caché y volver a pedir
  --no-cache / --no-sitemap
  --base ruta.sqlite  --config ruta.json  --log detalle|info|aviso|error
`;

export async function principal(argv = process.argv.slice(2)) {
  const { opciones, sueltos } = parsearArgs(argv);
  const comando = sueltos.shift();
  if (!comando || opciones.ayuda || opciones.help || comando === 'ayuda') {
    process.stdout.write(AYUDA);
    return comando ? 0 : 1;
  }
  const accion = COMANDOS[comando];
  if (!accion) {
    process.stderr.write(`comando desconocido: ${comando}\n${AYUDA}`);
    return 1;
  }

  const log = crearLog(String(opciones.log ?? 'info'));
  try {
    const cfg = await cargarConfig(opciones);
    return await accion(cfg, log, { opciones, sueltos });
  } catch (error) {
    if (error instanceof ErrorRobots) {
      log.error(`${error.message}. No se insiste: robots.txt manda.`);
      return 2;
    }
    log.error(error.message);
    if (opciones.log === 'detalle') log.detalle(error.stack ?? '');
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  principal().then((codigo) => { process.exitCode = codigo; });
}
