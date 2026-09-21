// Cliente HTTP con modales: un pedido por vez (o los que se configuren), una
// pausa entre pedidos, caché en disco con revalidación condicional y
// reintentos con espera creciente.
//
// La caché no es sólo velocidad: es lo que permite reanudar una corrida
// interrumpida sin volver a pedirle al sitio lo que ya bajamos, y lo que hace
// que una corrida semanal sólo traiga lo que cambió.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crearRobots } from './robots.mjs';

export class ErrorHttp extends Error {
  constructor(mensaje, { estado = 0, url = '', reintentable = false } = {}) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.url = url;
    this.reintentable = reintentable;
  }
}

export class ErrorRobots extends Error {
  constructor(url) {
    super(`robots.txt no permite pedir ${url}`);
    this.name = 'ErrorRobots';
    this.url = url;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const clave = (url) => createHash('sha1').update(url).digest('hex').slice(0, 24);

/**
 * @param {object} opciones
 * @param {string} opciones.userAgent identifícate y dejá un contacto
 * @param {number} [opciones.demoraMs] pausa mínima entre pedidos
 * @param {number} [opciones.concurrencia]
 * @param {string|null} [opciones.cacheDir] null desactiva la caché
 * @param {number} [opciones.maxEdadMs] antigüedad tolerada sin revalidar
 * @param {number} [opciones.reintentos]
 * @param {typeof fetch} [opciones.fetch] inyectable para las pruebas
 */
export function crearCliente({
  userAgent,
  demoraMs = 1500,
  concurrencia = 1,
  cacheDir = null,
  maxEdadMs = 6 * 60 * 60 * 1000,
  reintentos = 4,
  respetarRobots = true,
  fetch: traer = globalThis.fetch,
  log = { detalle() {}, aviso() {}, error() {}, info() {} },
  dormirFn = dormir,
} = {}) {
  if (!userAgent) throw new Error('Falta el user-agent: identificá al scraper.');

  const robotsPorHost = new Map();
  let libres = concurrencia;
  const cola = [];
  let proximoPermiso = 0;
  const stats = { pedidos: 0, cache: 0, revalidados: 0, reintentos: 0, errores: 0 };

  async function tomarTurno() {
    if (libres <= 0) await new Promise((r) => cola.push(r));
    libres--;
    const ahora = Date.now();
    const espera = Math.max(0, proximoPermiso - ahora);
    proximoPermiso = Math.max(ahora, proximoPermiso) + demoraActual();
    if (espera > 0) await dormirFn(espera);
  }

  function soltarTurno() {
    libres++;
    const siguiente = cola.shift();
    if (siguiente) siguiente();
  }

  let demoraRobots = 0;
  const demoraActual = () => Math.max(demoraMs, demoraRobots);

  async function robotsDe(url) {
    const { origin, hostname } = new URL(url);
    if (robotsPorHost.has(hostname)) return robotsPorHost.get(hostname);
    const promesa = (async () => {
      let texto = '';
      try {
        const res = await traer(`${origin}/robots.txt`, { headers: { 'user-agent': userAgent } });
        if (res.ok) texto = await res.text();
        else log.aviso(`robots.txt devolvió ${res.status}; se asume permitido`);
      } catch (error) {
        log.aviso(`no se pudo leer robots.txt (${error.message}); se asume permitido`);
      }
      const robots = crearRobots(texto, userAgent);
      if (robots.demoraSegundos) {
        demoraRobots = Math.max(demoraRobots, robots.demoraSegundos * 1000);
        log.detalle(`robots.txt pide Crawl-delay ${robots.demoraSegundos}s`);
      }
      return robots;
    })();
    robotsPorHost.set(hostname, promesa);
    return promesa;
  }

  async function leerCache(url) {
    if (!cacheDir) return null;
    try {
      const meta = JSON.parse(await readFile(join(cacheDir, `${clave(url)}.json`), 'utf8'));
      const cuerpo = await readFile(join(cacheDir, `${clave(url)}.html`), 'utf8');
      return { ...meta, cuerpo };
    } catch {
      return null;
    }
  }

  async function guardarCache(url, datos) {
    if (!cacheDir) return;
    await mkdir(cacheDir, { recursive: true });
    const { cuerpo, ...meta } = datos;
    await writeFile(join(cacheDir, `${clave(url)}.html`), cuerpo, 'utf8');
    await writeFile(join(cacheDir, `${clave(url)}.json`), JSON.stringify({ ...meta, url }, null, 2), 'utf8');
  }

  /**
   * Pide una URL. Devuelve el cuerpo como texto.
   * @param {string} url
   * @param {{forzar?:boolean, maxEdadMs?:number}} [opciones]
   * @returns {Promise<{url:string, estado:number, cuerpo:string, deCache:boolean, fecha:string}>}
   */
  async function obtener(url, { forzar = false, maxEdadMs: edadMax = maxEdadMs } = {}) {
    const destino = new URL(url);
    if (respetarRobots) {
      const robots = await robotsDe(url);
      if (!robots.permitido(destino.pathname + destino.search)) throw new ErrorRobots(url);
    }

    const guardado = await leerCache(url);
    if (guardado && !forzar && Date.now() - Date.parse(guardado.fecha) < edadMax) {
      stats.cache++;
      return { url, estado: guardado.estado, cuerpo: guardado.cuerpo, deCache: true, fecha: guardado.fecha };
    }

    const cabeceras = { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-GB,en;q=0.9' };
    if (guardado && !forzar) {
      if (guardado.etag) cabeceras['if-none-match'] = guardado.etag;
      if (guardado.lastModified) cabeceras['if-modified-since'] = guardado.lastModified;
    }

    let ultimoError = null;
    for (let intento = 0; intento <= reintentos; intento++) {
      if (intento > 0) {
        stats.reintentos++;
        const espera = Math.min(16000, 2000 * 2 ** (intento - 1));
        log.detalle(`reintento ${intento} en ${espera}ms → ${url}`);
        await dormirFn(espera);
      }
      await tomarTurno();
      try {
        stats.pedidos++;
        const res = await traer(url, { headers: cabeceras, redirect: 'follow' });

        if (res.status === 304 && guardado) {
          stats.revalidados++;
          const fecha = new Date().toISOString();
          await guardarCache(url, { ...guardado, fecha });
          return { url, estado: 200, cuerpo: guardado.cuerpo, deCache: true, fecha };
        }

        if (res.status === 429 || res.status >= 500) {
          const reintentarEn = Number(res.headers.get('retry-after'));
          if (Number.isFinite(reintentarEn) && reintentarEn > 0) await dormirFn(Math.min(60000, reintentarEn * 1000));
          ultimoError = new ErrorHttp(`HTTP ${res.status}`, { estado: res.status, url, reintentable: true });
          continue;
        }

        if (!res.ok) throw new ErrorHttp(`HTTP ${res.status}`, { estado: res.status, url });

        const cuerpo = await res.text();
        const fecha = new Date().toISOString();
        await guardarCache(url, {
          estado: res.status,
          etag: res.headers.get('etag') ?? null,
          lastModified: res.headers.get('last-modified') ?? null,
          fecha,
          cuerpo,
        });
        return { url, estado: res.status, cuerpo, deCache: false, fecha };
      } catch (error) {
        if (error instanceof ErrorHttp && !error.reintentable) { stats.errores++; throw error; }
        ultimoError = error;
      } finally {
        soltarTurno();
      }
    }
    stats.errores++;
    throw ultimoError ?? new ErrorHttp('falló sin motivo declarado', { url });
  }

  return { obtener, robotsDe, stats, get demora() { return demoraActual(); } };
}
