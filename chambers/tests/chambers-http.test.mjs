import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearRobots, parsearRobots } from '../src/robots.mjs';
import { crearCliente, ErrorRobots, ErrorHttp } from '../src/http.mjs';

const carpeta = () => mkdtempSync(join(tmpdir(), 'chambers-'));

/** fetch de mentira: devuelve lo que le digan y anota qué le pidieron. */
function fetchFalso(respuestas) {
  const pedidos = [];
  const traer = async (url, opciones = {}) => {
    pedidos.push({ url: String(url), headers: opciones.headers ?? {} });
    const siguiente = respuestas.shift();
    if (!siguiente) throw new Error(`pedido inesperado: ${url}`);
    if (siguiente instanceof Error) throw siguiente;
    const { estado = 200, cuerpo = '', headers = {} } = siguiente;
    return {
      ok: estado >= 200 && estado < 300,
      status: estado,
      headers: { get: (n) => headers[n.toLowerCase()] ?? null },
      text: async () => cuerpo,
    };
  };
  traer.pedidos = pedidos;
  return traer;
}

test('robots.txt: gana la regla más específica y Allow desempata', () => {
  const robots = crearRobots(`
User-agent: *
Disallow: /buscar
Allow: /buscar/publico
Crawl-delay: 3
Sitemap: https://chambers.com/sitemap.xml
`, 'MiScraper/1.0');
  assert.ok(robots.permitido('/legal-rankings/tax-chile-9:49:37:1'));
  assert.ok(!robots.permitido('/buscar/algo'));
  assert.ok(robots.permitido('/buscar/publico/x'));
  assert.equal(robots.demoraSegundos, 3);
  assert.deepEqual(robots.sitemaps, ['https://chambers.com/sitemap.xml']);
});

test('robots.txt: el grupo del agente pisa al de *', () => {
  const texto = 'User-agent: *\nDisallow:\n\nUser-agent: MalBot\nDisallow: /\n';
  assert.ok(crearRobots(texto, 'OtroBot/1').permitido('/x'));
  assert.ok(!crearRobots(texto, 'MalBot/2 (+mail)').permitido('/x'));
  assert.equal(parsearRobots(texto).grupos.size, 2);
});

test('robots.txt: comodines y fin de línea', () => {
  const robots = crearRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /api/*/privado\n', 'X');
  assert.ok(!robots.permitido('/informes/algo.pdf'));
  assert.ok(robots.permitido('/informes/algo.pdf.html'));
  assert.ok(!robots.permitido('/api/v2/privado'));
});

test('no se pide una URL que robots prohíbe', async () => {
  const traer = fetchFalso([{ cuerpo: 'User-agent: *\nDisallow: /legal-rankings\n' }]);
  const cliente = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 0, cacheDir: null, fetch: traer });
  await assert.rejects(
    () => cliente.obtener('https://chambers.com/legal-rankings/tax-chile-9:49:37:1'),
    ErrorRobots
  );
  assert.equal(traer.pedidos.length, 1); // sólo el robots.txt
});

test('un 503 se reintenta y un 404 no', async () => {
  const traer = fetchFalso([
    { cuerpo: '' },                       // robots.txt
    { estado: 503 },
    { estado: 503 },
    { estado: 200, cuerpo: '<html>ok</html>' },
  ]);
  const cliente = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 0, cacheDir: null, fetch: traer, dormirFn: async () => {} });
  const res = await cliente.obtener('https://chambers.com/a');
  assert.equal(res.cuerpo, '<html>ok</html>');
  assert.equal(cliente.stats.reintentos, 2);

  const traer404 = fetchFalso([{ cuerpo: '' }, { estado: 404 }]);
  const otro = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 0, cacheDir: null, fetch: traer404, dormirFn: async () => {} });
  await assert.rejects(() => otro.obtener('https://chambers.com/b'), ErrorHttp);
  assert.equal(traer404.pedidos.length, 2);
});

test('la caché evita el segundo pedido y revalida con etag cuando vence', async () => {
  const cache = carpeta();
  const traer = fetchFalso([
    { cuerpo: '' },                                                   // robots.txt
    { estado: 200, cuerpo: '<html>1</html>', headers: { etag: 'W/"v1"' } },
  ]);
  const cliente = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 0, cacheDir: cache, fetch: traer });
  const primera = await cliente.obtener('https://chambers.com/a');
  assert.equal(primera.deCache, false);

  const segunda = await cliente.obtener('https://chambers.com/a');
  assert.equal(segunda.deCache, true);
  assert.equal(traer.pedidos.length, 2); // no hubo pedido nuevo

  // Con la caché vencida se revalida: el 304 devuelve el cuerpo guardado.
  const traer2 = fetchFalso([{ cuerpo: '' }, { estado: 304 }]);
  const cliente2 = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 0, cacheDir: cache, maxEdadMs: 0, fetch: traer2 });
  const tercera = await cliente2.obtener('https://chambers.com/a');
  assert.equal(tercera.cuerpo, '<html>1</html>');
  assert.equal(tercera.deCache, true);
  assert.equal(traer2.pedidos[1].headers['if-none-match'], 'W/"v1"');
  assert.equal(cliente2.stats.revalidados, 1);
});

test('el Crawl-delay del sitio pisa al ritmo configurado si es más lento', async () => {
  const traer = fetchFalso([{ cuerpo: 'User-agent: *\nCrawl-delay: 5\n' }, { cuerpo: 'ok' }]);
  const cliente = crearCliente({ userAgent: 'Prueba/1.0', demoraMs: 100, cacheDir: null, fetch: traer, dormirFn: async () => {} });
  await cliente.obtener('https://chambers.com/a');
  assert.equal(cliente.demora, 5000);
});

test('sin user-agent no se crea el cliente', () => {
  assert.throws(() => crearCliente({}), /user-agent/i);
});
