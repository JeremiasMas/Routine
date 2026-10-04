// Prueba de punta a punta contra un chambers de mentira levantado en
// localhost: robots.txt, sitemap, recorrido, lectura, base, diff y export.
//
// Es lo más cerca del sitio real que se puede llegar sin pedirle nada al
// sitio real. Cuando chambers cambie, esta prueba va a seguir pasando: para
// enterarse de eso está el comando `sondear`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let edicion = 2025; // el sitio de mentira publica una guía nueva a mitad de prueba

const paginaGuia = () => `<!doctype html><html><head>
  <title>Latin America Guide | Chambers</title></head><body>
  <h1>Chambers Latin America ${edicion}</h1>
  <a href="/legal-rankings/banking-finance-argentina-9:6:19:1">Banking &amp; Finance</a>
  <a href="/legal-rankings/tax-argentina-9:49:19:1">Tax</a>
  <a href="/legal-rankings/tax-chile-9:49:37:1">Tax Chile</a>
  <a href="/about-us/methodology">Metodología</a>
</body></html>`;

const bancaArgentina = () => {
  const datos = {
    props: { pageProps: { rankingTable: {
      publicationYear: edicion,
      sections: [
        { sectionName: 'Ranked Firms', organisations: [
          { band: 1, organisationName: 'Estudio Alfa', url: '/department/estudio-alfa-9:19:1001' },
        ] },
        { sectionName: 'Ranked Lawyers', bands: [
          { name: edicion === 2025 ? 'Band 2' : 'Band 1', individuals: [
            { displayName: 'Ana Rossi', profileUrl: '/lawyer/ana-rossi-9:19:2001' },
          ] },
          ...(edicion === 2025
            ? [{ name: 'Band 3', individuals: [{ displayName: 'Bruno Paz', profileUrl: '/lawyer/bruno-paz-9:19:2002' }] }]
            : [{ name: 'Up and Coming', individuals: [{ displayName: 'Carla Díaz', profileUrl: '/lawyer/carla-diaz-9:19:2003' }] }]),
        ] },
      ],
    } } },
  };
  return `<!doctype html><html><head>
    <title>Banking &amp; Finance, Argentina, Latin America | Chambers Rankings</title></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(datos)}</script>
  </body></html>`;
};

const taxArgentina = () => `<!doctype html><html><head>
  <title>Tax, Argentina, Latin America | Chambers Rankings</title></head><body>
  <p>Chambers Latin America ${edicion} guide</p>
  <h3>Band 1</h3><a href="/department/beta-abogados-9:19:1002">Beta Abogados</a>
  <h3>Band 2</h3><a href="/lawyer/diego-soto-9:19:2004">Diego Soto</a>
</body></html>`;

const taxChile = () => `<!doctype html><html><head>
  <title>Tax, Chile, Latin America | Chambers Rankings</title></head><body>
  <h3>Band 1</h3><a href="/lawyer/elena-vega-9:37:2005">Elena Vega</a>
</body></html>`;

const rutas = {
  '/': () => '<html><body><a href="/legal-guide/latin-america-9">Latin America</a></body></html>',
  '/robots.txt': () => `User-agent: *\nDisallow: /privado\nSitemap: ${origen}/sitemap.xml\n`,
  '/sitemap.xml': () => `<?xml version="1.0"?><sitemapindex><sitemap><loc>${origen}/sitemap-rankings.xml</loc></sitemap></sitemapindex>`,
  '/sitemap-rankings.xml': () => `<?xml version="1.0"?><urlset>
      <url><loc>${origen}/legal-rankings/banking-finance-argentina-9:6:19:1</loc></url>
      <url><loc>${origen}/legal-rankings/tax-argentina-9:49:19:1</loc></url>
      <url><loc>${origen}/legal-rankings/tax-chile-9:49:37:1</loc></url>
    </urlset>`,
  '/legal-guide/latin-america-9': paginaGuia,
  '/legal-rankings/banking-finance-argentina-9:6:19:1': bancaArgentina,
  '/legal-rankings/tax-argentina-9:49:19:1': taxArgentina,
  '/legal-rankings/tax-chile-9:49:37:1': taxChile,
};

let origen = '';
const servidor = createServer((pedido, respuesta) => {
  const ruta = decodeURIComponent(new URL(pedido.url, origen).pathname);
  const pagina = rutas[ruta];
  if (!pagina) { respuesta.writeHead(404).end('no'); return; }
  respuesta.writeHead(200, { 'content-type': ruta.endsWith('.xml') ? 'application/xml' : 'text/html' });
  respuesta.end(pagina());
});

await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
origen = `http://127.0.0.1:${servidor.address().port}`;
process.env.CHAMBERS_BASE = origen;

// Los módulos se importan recién acá: leen CHAMBERS_BASE al cargarse.
const { crearCliente } = await import('../src/http.mjs');
const { descubrirGuias, descubrirTablas } = await import('../src/descubrir.mjs');
const { scrapearTablas } = await import('../src/scrapear.mjs');
const { revisarGuias } = await import('../src/revisar.mjs');
const { abrirBase } = await import('../src/base.mjs');
const { compararCorridas } = await import('../src/diferencias.mjs');
const { exportarRankings } = await import('../src/exportar.mjs');

test.after(() => servidor.close());

const CATALOGO = [{ id: 9, slug: 'latin-america', nombre: 'Latin America' }];
const nuevoCliente = () => crearCliente({
  userAgent: 'PruebaChambers/1.0 (+prueba@local)',
  demoraMs: 0,
  cacheDir: mkdtempSync(join(tmpdir(), 'chambers-e2e-')),
});

test('descubre sólo las tablas del país pedido', async () => {
  const cliente = nuevoCliente();
  const guias = await descubrirGuias(cliente, CATALOGO);
  assert.deepEqual(guias.map((g) => g.id), [9]);

  const tablas = await descubrirTablas(cliente, { guias, paises: ['argentina'], profundidad: 1 });
  assert.deepEqual(tablas.map((t) => t.clave).sort(), ['9:49:19:1', '9:6:19:1']);
});

test('sin filtro de país entran todas, y la guía se recorre igual sin sitemap', async () => {
  const cliente = nuevoCliente();
  const guias = await descubrirGuias(cliente, CATALOGO);
  const tablas = await descubrirTablas(cliente, { guias, paises: [], profundidad: 1, usarSitemap: false });
  assert.equal(tablas.length, 3);
});

test('una corrida completa deja los rankings consultables', async () => {
  edicion = 2025;
  const cliente = nuevoCliente();
  const base = abrirBase(':memory:');
  const guias = await descubrirGuias(cliente, CATALOGO);
  const tablas = await descubrirTablas(cliente, { guias, paises: ['argentina'], profundidad: 1 });

  const corrida = base.iniciarCorrida({ paises: ['argentina'], guias: ['latin-america'] });
  const stats = await scrapearTablas({ cliente, base, tablas, corridaId: corrida, guias: new Map(guias.map((g) => [g.id, g])) });
  base.cerrarCorrida(corrida, stats);

  assert.equal(stats.tablas, 2);
  assert.equal(stats.fallos, 0);
  assert.equal(stats.filas, 5);

  const filas = base.consultar('SELECT pais, area, nombre, banda, tipo, edicion FROM vista_rankings ORDER BY area, nombre');
  assert.deepEqual(filas.map((f) => [f.area, f.nombre, f.banda]), [
    ['Banking & Finance', 'Ana Rossi', 'Band 2'],
    ['Banking & Finance', 'Bruno Paz', 'Band 3'],
    ['Banking & Finance', 'Estudio Alfa', 'Band 1'],
    ['Tax', 'Beta Abogados', 'Band 1'],
    ['Tax', 'Diego Soto', 'Band 2'],
  ]);
  assert.ok(filas.every((f) => f.pais === 'Argentina' && f.edicion === 2025));

  // La guía nueva: Ana sube, Bruno se va, Carla entra.
  edicion = 2026;
  const segunda = base.iniciarCorrida({ paises: ['argentina'], guias: ['latin-america'] });
  const stats2 = await scrapearTablas({ cliente, base, tablas, corridaId: segunda, forzar: true, guias: new Map(guias.map((g) => [g.id, g])) });
  base.cerrarCorrida(segunda, stats2);

  const d = compararCorridas(base, corrida, segunda);
  assert.deepEqual(d.altas.map((a) => a.nombre), ['Carla Díaz']);
  assert.deepEqual(d.bajas.map((b) => b.nombre), ['Bruno Paz']);
  assert.deepEqual(d.cambios.map((c) => [c.nombre, c.banda_antes, c.banda_despues, c.movimiento]),
    [['Ana Rossi', 'Band 2', 'Band 1', 'sube']]);

  const destino = join(mkdtempSync(join(tmpdir(), 'chambers-export-')), 'rankings.csv');
  const { filas: exportadas, ruta } = await exportarRankings(base, { formato: 'csv', salida: destino });
  assert.equal(exportadas, 5);
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync(ruta, 'utf8');
  assert.match(csv, /^guia,edicion,pais,area,seccion,tipo,nombre,banda/);
  assert.match(csv, /"Banking & Finance"|Banking & Finance/);
  assert.match(csv, /Ana Rossi,Band 1/);
  base.cerrar();
});

test('revisar avisa cuando la guía cambia de edición', async () => {
  const cliente = nuevoCliente();
  const base = abrirBase(':memory:');
  edicion = 2025;
  const primera = await revisarGuias({ cliente, base, guias: CATALOGO });
  assert.equal(primera.revisadas[0].estado, 'primera vez');
  assert.equal(primera.revisadas[0].edicion, 2025);
  assert.equal(primera.revisadas[0].tablas, 3);

  const sinCambios = await revisarGuias({ cliente, base, guias: CATALOGO });
  assert.equal(sinCambios.novedades.length, 0);

  edicion = 2026;
  const conNovedad = await revisarGuias({ cliente, base, guias: CATALOGO });
  assert.equal(conNovedad.novedades.length, 1);
  assert.equal(conNovedad.novedades[0].estado, 'edición nueva');
  assert.equal(conNovedad.novedades[0].edicionPrevia, 2025);
  base.cerrar();
});

test('robots.txt manda: una ruta prohibida no se pide', async () => {
  const cliente = nuevoCliente();
  const { ErrorRobots } = await import('../src/http.mjs');
  await assert.rejects(() => cliente.obtener(`${origen}/privado/lo-que-sea`), ErrorRobots);
});
