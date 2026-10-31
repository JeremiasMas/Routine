# Scraper de rankings de Chambers

Baja las tablas de ranking de [chambers.com](https://chambers.com) —abogados y
estudios, con su banda— para los países y las áreas de práctica que le pidas, y
las guarda en SQLite **con historial**: cada corrida queda entera, así que se
puede preguntar quién subió, quién bajó y quién entró entre una guía y la
siguiente.

Vive en su propia carpeta y no se cruza con la app de la rutina: sus tests, su
`package.json` y su workflow son aparte.

> **Antes de la primera corrida, leé [«Lo que todavía no está probado»](#lo-que-todavía-no-está-probado).**

---

## Cómo se identifica una tabla

Todo se apoya en la forma de las URLs de chambers, que es lo más estable que
tiene el sitio:

```
https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1
                                    └──────── slug ────────┘ │ │  │ └ subsección
                                                             │ │  └── ubicación (Argentina)
                                                             │ └───── área de práctica
                                                             └─────── guía (9 = Latin America)
```

Esos cuatro números son la clave primaria de la tabla: no dependen del diseño
del sitio y sirven para volver a encontrarla el año que viene. La misma área en
la guía Global (`2:6:19:1`) y en la de Latin America (`9:6:19:1`) son dos tablas
distintas, y así se guardan.

Las guías conocidas están en [`config/guias.json`](config/guias.json) — UK (1),
Global (2), USA (5), Europe (7), Asia-Pacific (8), Latin America (9), High Net
Worth (21), FinTech (49). Las que falten las descubre solo: lee la portada y
agrega las que encuentre.

## Uso

Requiere Node 22 (usa `node:sqlite`, que viene incluido). No instala nada.

```bash
# 1. identificate: chambers tiene derecho a saber quién le está pidiendo
export CHAMBERS_UA='MiScraper/1.0 (+tu-mail@dominio)'

# 2. mirá qué tablas salen con tu filtro, sin bajar nada todavía
node chambers/cli.mjs descubrir --pais argentina,chile --guia latin-america

# 3. bajá una sola tabla primero y miralo con tus ojos
node chambers/cli.mjs sondear "https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1"

# 4. recién ahí, la corrida completa
node chambers/cli.mjs scrapear --pais argentina,chile --guia latin-america

# 5. lo que quedó
node chambers/cli.mjs estado
node chambers/cli.mjs exportar --formato csv --salida chambers/datos/export/rankings.csv
```

| Comando | Qué hace |
|---|---|
| `descubrir` | arma la lista de tablas que entran en el filtro (no baja rankings) |
| `scrapear` | descubre, baja y guarda; al terminar compara contra la corrida anterior |
| `revisar` | ¿se publicó una guía nueva? Sale con **código 10** si sí, 0 si no |
| `diff [--desde N --hasta M]` | altas, bajas y movimientos de banda entre dos corridas |
| `exportar [--formato csv\|json\|ndjson]` | la foto vigente |
| `estado` | qué hay guardado y cuáles fueron las últimas corridas |
| `sondear <url>` | diagnóstico de una página suelta: qué lectura funcionó y qué trajo |

Opciones que importan: `--pais`, `--guia`, `--limite N` (cortar temprano),
`--demora ms` (pausa entre pedidos), `--profundidad N`, `--forzar` (ignorar la
caché), `--no-sitemap`, `--base ruta.sqlite`, `--log detalle`. Los valores por
defecto están en [`config/scraper.json`](config/scraper.json).

El país se escribe como aparece al final del slug de la URL: `argentina`,
`chile`, `brazil`, `uk-wide`, `usa-nationwide`. Sin `--pais` entran todos los de
las guías elegidas.

## Cómo lee una página

Dos lecturas, en orden, y la segunda existe porque la primera se va a romper
algún día:

1. **El JSON que el propio sitio embebe** (`__NEXT_DATA__`, `application/json`,
   la cola de hidratación `self.__next_f`). Son los mismos datos con los que la
   web dibuja la tabla.
2. **El HTML**, atando cada enlace a perfil (`/lawyer/…`, `/department/…`) con
   el último encabezado de banda que quedó por encima.

A propósito **no** se usan selectores CSS: cada rediseño los rompe. Si las dos
lecturas fallan, la tabla se anota como vacía —nunca se inventa una fila— y
`sondear` te deja el HTML en `chambers/datos/sondeo.html` para mirarlo.

Las bandas se guardan con la etiqueta original (`Band 2`, `Star Individuals`,
`Up and Coming`, `Associates to Watch`…) y, al lado, un orden numérico para
poder decir "subió" o "bajó" sin perder el matiz.

## Modales con el sitio

- **robots.txt se lee y se obedece**, sin bandera para saltearlo. Si una ruta
  está prohibida, el scraper no la pide y sale con código 2.
- Un pedido por vez y 2 segundos de pausa por defecto; si `robots.txt` declara
  un `Crawl-delay` mayor, gana el del sitio.
- Caché en disco con `ETag`/`If-Modified-Since`: una corrida interrumpida se
  reanuda sin volver a pedir lo mismo, y la corrida semanal sólo trae lo que
  cambió.
- Reintentos con espera creciente (2s, 4s, 8s, 16s) ante 429 y 5xx, respetando
  `Retry-After`. Un 404 no se reintenta.

Va sin vueltas: los rankings de Chambers son contenido con dueño y sus términos
de uso restringen el scraping y la reutilización comercial. Esto sirve para
consulta y análisis propio; si la idea es un producto o un servicio a terceros,
el camino es el **Rankings Data Hub**, el producto pago de datos que vende
Chambers. Tenerlo en cuenta es parte de usar esto.

## La base

```sql
-- la foto vigente, ya legible
SELECT pais, area, banda, nombre FROM vista_rankings
WHERE pais = 'Argentina' AND tipo = 'persona'
ORDER BY area, banda_numero;

-- en cuántas tablas está ranqueado cada estudio
SELECT nombre, COUNT(*) AS tablas FROM vista_rankings
WHERE tipo = 'organizacion' GROUP BY nombre ORDER BY tablas DESC LIMIT 20;

-- un abogado a lo largo de las guías
SELECT edicion, guia, area, banda FROM vista_rankings WHERE slug = 'ana-rossi';
```

Tablas: `corrida` (cada ejecución), `guia`, `ubicacion`, `area`, `tabla`,
`entidad` (personas y estudios), `ranking` (una fila por entidad, tabla y
corrida) y `fallo`. La vista `ranking_vigente` devuelve la última foto de cada
tabla; `vista_rankings` la misma con los nombres resueltos.

Nada se pisa: `ranking` guarda cada corrida completa. Eso es lo que hace posible
el `diff`, y lo que hace que la base crezca con el tiempo (una corrida de una
guía chica son miles de filas; una corrida mundial, millones).

## Cuando sale una guía nueva

`revisar` mira la portada de cada guía y saca dos señales: el año de edición y
la huella del índice de tablas. Año distinto = guía nueva publicada; huella
distinta con el mismo año = se movieron tablas. Cualquiera de las dos amerita
volver a bajar.

El workflow [`.github/workflows/chambers.yml`](../.github/workflows/chambers.yml)
lo hace solo: **todos los lunes** revisa, y **sólo si hay novedad** baja los
rankings, exporta CSV/JSON, sube todo como artefacto y abre un issue con el
resumen del diff. También se puede disparar a mano (*Run workflow*) con países,
guías y un límite.

Para que funcione hace falta una variable de repositorio **`CHAMBERS_UA`**
(Settings → Secrets and variables → Actions → Variables) con tu user-agent y un
mail de contacto. Sin eso el workflow se planta y te lo dice.

Un detalle importante: la base viaja entre corridas en la **caché de Actions**,
que GitHub desaloja si nadie la usa por una semana o si el repo se pasa de
tamaño. Alcanza para una guía o dos. Si el objetivo es la base mundial que se
acumula año a año, hay que guardarla afuera: commitearla a una rama de datos,
subirla a un bucket o apuntar `--base` a un volumen propio.

## Lo que todavía no está probado

**El scraper nunca corrió contra chambers.com.** El entorno donde se escribió
tiene el dominio bloqueado por política de red: no pude abrir una sola página
real, ni el `robots.txt`. La estructura de las URLs está confirmada contra
resultados de búsqueda públicos, pero **la forma exacta del JSON embebido y del
HTML de las tablas es una hipótesis**, no una observación.

En criollo: el esqueleto está completo y probado (37 tests, incluido uno de
punta a punta contra un chambers de mentira en localhost que ejercita robots,
sitemap, recorrido, lectura, base, diff y export), pero **la primera corrida
real es una verificación, no una cosecha**. El orden sano:

```bash
node chambers/cli.mjs sondear "https://chambers.com/legal-rankings/banking-finance-argentina-9:6:19:1" --log detalle
```

y mirar tres cosas del resultado:

- `lectura`: `json` (ideal), `html` (funciona, respaldo) o `vacio` (hay que tocar);
- `filas` y `muestra`: ¿los nombres y las bandas son los que se ven en la página?
- `area`, `ubicacion`, `guia`, `edicion`: ¿coinciden con el título?

Si dice `vacio`, el HTML queda en `chambers/datos/sondeo.html` y lo que hay que
ajustar está en un solo lugar: las listas de claves al principio de
[`src/extraer.mjs`](src/extraer.mjs) (`CLAVES_NOMBRE`, `CLAVES_BANDA`,
`CLAVES_SECCION`, `CLAVES_ARRAY`). Son los nombres de campo que el scraper
reconoce en el JSON; agregar los que use chambers de verdad es cuestión de
minutos, y los tests con fixtures están para que el cambio no rompa el resto.

Otros límites conocidos:

- **Identidad entre guías.** Una entidad es un perfil: si el mismo abogado tiene
  URLs distintas en Global y en Latin America, son dos filas. Para seguirlo
  entre guías está la columna `slug` (nombre normalizado); unificarlos de verdad
  pide un paso de reconciliación que todavía no existe.
- **Sitemaps comprimidos.** Si chambers publica `.xml.gz`, se saltean con un
  aviso y queda el recorrido desde las portadas (`--no-sitemap --profundidad 3`).
- **La base mundial es cara.** Son 200+ jurisdicciones por decenas de áreas por
  varias guías: del orden de decenas de miles de tablas. A 2 segundos por pedido
  eso son entre diez y veinte horas de corrida. Conviene ir por guía o por
  región, apoyándose en la caché, y no intentar el mundo entero de una.
- **Los perfiles no se abren.** Se guarda lo que está en la tabla de ranking
  (nombre, banda, enlace). Bajar cada perfil para sacar firma, cargo o reseñas
  sería otra corrida, mucho más larga.

## Tests

```bash
cd chambers && npm test        # o: node --test chambers/tests/*.test.mjs
```

37 tests sin dependencias: URLs y bandas, las dos lecturas contra fixtures,
robots.txt (comodines, grupos, `Crawl-delay`), el cliente HTTP (caché, 304,
reintentos, 404), la base y el diff, y el de punta a punta contra un sitio de
mentira que se levanta en localhost.
