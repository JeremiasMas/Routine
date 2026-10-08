import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// El APK sólo se puede compilar en CI, así que un error de sintaxis cuesta una
// vuelta entera de GitHub Actions. Estas comprobaciones son las que ya nos
// mordieron una vez: valen los milisegundos que tardan.

function kotlins(dir = 'android') {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...kotlins(ruta));
    else if (nombre.endsWith('.kt')) out.push(ruta);
  }
  return out;
}

const archivos = kotlins();
const MAIN = 'android/app/src/main/java/com/jeremiasmas/rutina/MainActivity.kt';

// Recorre el archivo distinguiendo código, comentarios y textos.
function* recorrer(src) {
  let i = 0;
  let linea = 1;
  let estado = 'code';
  let nivel = 0;
  while (i < src.length) {
    if (src[i] === '\n') linea += 1;
    const dos = src.slice(i, i + 2);
    const tres = src.slice(i, i + 3);
    if (estado === 'code') {
      if (dos === '//') { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; continue; }
      if (tres === '"""') { estado = 'raw'; i += 3; continue; }
      if (src[i] === '"') { estado = 'str'; i += 1; continue; }
      if (src[i] === "'") { estado = 'char'; i += 1; continue; }
      if (dos === '/' + '*') { estado = 'block'; nivel = 1; yield { tipo: 'abre', linea }; i += 2; continue; }
      yield { tipo: 'code', char: src[i], linea };
    } else if (estado === 'block') {
      if (dos === '/' + '*') { nivel += 1; yield { tipo: 'anida', linea }; i += 2; continue; }
      if (dos === '*' + '/') { nivel -= 1; if (nivel === 0) estado = 'code'; i += 2; continue; }
    } else if (estado === 'str') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '"') estado = 'code';
    } else if (estado === 'raw') {
      if (tres === '"""') { estado = 'code'; i += 3; continue; }
    } else if (estado === 'char') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === "'") estado = 'code';
    }
    i += 1;
  }
  yield { tipo: 'fin', estado, linea };
}

test('hay fuentes de Kotlin para revisar', () => {
  assert.ok(archivos.length >= 2, `encontré ${archivos.length}`);
});

// Kotlin ANIDA los comentarios de bloque, a diferencia de casi todos los demás
// lenguajes: abrir otro comentario adentro de uno hace que el primer cierre
// cierre sólo el de adentro. El de afuera sigue abierto y se traga el código
// que viene después, con errores que aparecen decenas de líneas más abajo y no
// dicen nada de la causa. Ya costó una vuelta entera de CI.
test('ningún comentario de bloque abre otro adentro', () => {
  for (const ruta of archivos) {
    let ultimaApertura = 0;
    for (const ev of recorrer(readFileSync(ruta, 'utf8'))) {
      if (ev.tipo === 'abre') ultimaApertura = ev.linea;
      if (ev.tipo === 'anida') {
        assert.fail(`${ruta}:${ev.linea} abre un comentario adentro de otro `
          + `(el de afuera empezó en la línea ${ultimaApertura}). Kotlin los anida `
          + `y eso rompe el archivo entero desde ahí.`);
      }
      if (ev.tipo === 'fin') {
        assert.equal(ev.estado, 'code',
          `${ruta}: quedó un comentario sin cerrar (empezó en la línea ${ultimaApertura})`);
      }
    }
  }
});

test('no hay caracteres invisibles en el código', () => {
  // Se pegan sin querer al copiar, no se ven en ningún editor y cambian lo que
  // lee el compilador. El que rompió el build era uno de estos.
  const INVISIBLES = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff, 0x00a0];
  for (const ruta of archivos) {
    readFileSync(ruta, 'utf8').split('\n').forEach((l, n) => {
      for (const cp of INVISIBLES) {
        assert.ok(!l.includes(String.fromCodePoint(cp)),
          `${ruta}:${n + 1} tiene el carácter invisible U+${cp.toString(16).padStart(4, '0')}`);
      }
    });
  }
});

test('las llaves cierran', () => {
  for (const ruta of archivos) {
    let prof = 0;
    for (const ev of recorrer(readFileSync(ruta, 'utf8'))) {
      if (ev.tipo !== 'code') continue;
      if (ev.char === '{') prof += 1;
      if (ev.char === '}') prof -= 1;
      assert.ok(prof >= 0, `${ruta}:${ev.linea} tiene una llave de cierre de más`);
    }
    assert.equal(prof, 0, `${ruta}: quedaron ${prof} llaves sin cerrar`);
  }
});

/** El cuerpo de una clase, delimitado por sus llaves y no por el resto del archivo. */
function cuerpoDe(src, declaracion) {
  const desde = src.indexOf(declaracion);
  assert.notEqual(desde, -1, `no encontré ${declaracion}`);
  const abre = src.indexOf('{', desde);
  let prof = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') prof += 1;
    else if (src[i] === '}') {
      prof -= 1;
      if (prof === 0) return src.slice(abre + 1, i);
    }
  }
  assert.fail(`${declaracion} no cierra`);
}

test('el puente declara @JavascriptInterface en todo lo que expone', () => {
  // Sin la anotación el método existe pero la web no lo ve: falla en silencio,
  // que es lo mismo que pasaba con el selector de archivos.
  const src = readFileSync(MAIN, 'utf8');
  const puente = cuerpoDe(src, 'inner class Puente');
  const funciones = [...puente.matchAll(/fun (\w+)\(/g)].map((m) => m[1]);
  const anotadas = puente.split('@JavascriptInterface').slice(1)
    .map((t) => /fun (\w+)\(/.exec(t)?.[1]).filter(Boolean);
  const faltan = funciones.filter((f) => !anotadas.includes(f));
  assert.deepEqual(faltan, [], `sin anotar: ${faltan.join(', ')}`);
  assert.ok(funciones.length >= 4, `el puente expone ${funciones.length} métodos`);
});

test('lo que la web llama existe en el puente', () => {
  const kt = readFileSync(MAIN, 'utf8');
  const js = readFileSync('js/native.js', 'utf8') + readFileSync('js/views/settings.js', 'utf8');
  const llamados = new Set([...js.matchAll(/RutinaNativa\??\.(\w+)/g)].map((m) => m[1]));
  assert.ok(llamados.size > 0, 'no encontré ninguna llamada al puente');
  for (const metodo of llamados) {
    assert.ok(new RegExp(`fun ${metodo}\\(`).test(kt),
      `la web llama a RutinaNativa.${metodo}() y la app no lo tiene`);
  }
});

test('el nombre del evento coincide entre la app y la web', () => {
  const kt = readFileSync(MAIN, 'utf8');
  const js = readFileSync('js/native.js', 'utf8');
  const enJs = /export const EVENTO = '([^']+)'/.exec(js)?.[1];
  assert.ok(enJs, 'no encontré EVENTO en native.js');
  assert.ok(kt.includes(`new CustomEvent('${enJs}'`),
    `la web escucha '${enJs}' y la app manda otra cosa`);
});

// ---------------------------------------------------------------------------
// El widget
//
// Todo lo que sigue es lo que el compilador de recursos encontraría, pero
// media hora más tarde y después de una vuelta entera de CI. Un R.id que no
// existe no es un error de Kotlin: es un error de aapt, y sale al final.
// ---------------------------------------------------------------------------

const RES = 'android/app/src/main/res';
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const leer = (ruta) => readFileSync(ruta, 'utf8');

/** Todos los ids que declara algún layout, con @+id/. */
function idsDeclarados() {
  const ids = new Set();
  for (const nombre of readdirSync(join(RES, 'layout'))) {
    for (const m of leer(join(RES, 'layout', nombre)).matchAll(/@\+id\/(\w+)/g)) ids.add(m[1]);
  }
  return ids;
}

/** Los nombres declarados en values/, por tipo. */
function valores(tipo) {
  const out = new Set();
  for (const nombre of readdirSync(join(RES, 'values'))) {
    for (const m of leer(join(RES, 'values', nombre)).matchAll(new RegExp(`<${tipo} name="([\\w.]+)"`, 'g'))) {
      out.add(m[1]);
    }
  }
  return out;
}

const fuentesKotlin = archivos.map(leer).join('\n');

test('todo R.id que usa el código existe en algún layout', () => {
  const declarados = idsDeclarados();
  const usados = [...fuentesKotlin.matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]);
  assert.ok(usados.length > 0, 'no encontré ningún R.id');
  for (const id of new Set(usados)) {
    assert.ok(declarados.has(id), `R.id.${id} no está declarado en ningún layout`);
  }
});

test('todo R.layout que usa el código existe', () => {
  const layouts = new Set(readdirSync(join(RES, 'layout')).map((n) => n.replace(/\.xml$/, '')));
  for (const m of fuentesKotlin.matchAll(/R\.layout\.(\w+)/g)) {
    assert.ok(layouts.has(m[1]), `R.layout.${m[1]} no existe`);
  }
});

test('todo R.string y R.color que usa el código existe', () => {
  const strings = valores('string');
  const colors = valores('color');
  for (const m of fuentesKotlin.matchAll(/R\.string\.(\w+)/g)) {
    assert.ok(strings.has(m[1]), `R.string.${m[1]} no está en values/`);
  }
  for (const m of fuentesKotlin.matchAll(/R\.color\.(\w+)/g)) {
    assert.ok(colors.has(m[1]), `R.color.${m[1]} no está en values/`);
  }
});

test('los layouts y el manifiesto sólo apuntan a recursos que existen', () => {
  const strings = valores('string');
  const colors = valores('color');
  const drawables = new Set(readdirSync(join(RES, 'drawable')).map((n) => n.replace(/\.xml$/, '')));
  const layouts = new Set(readdirSync(join(RES, 'layout')).map((n) => n.replace(/\.xml$/, '')));
  const xmls = new Set(readdirSync(join(RES, 'xml')).map((n) => n.replace(/\.xml$/, '')));
  const tablas = {
    string: strings, color: colors, drawable: drawables, layout: layouts, xml: xmls,
    style: valores('style'),
  };

  const aRevisar = [MANIFEST];
  for (const carpeta of ['layout', 'xml', 'drawable']) {
    for (const n of readdirSync(join(RES, carpeta))) aRevisar.push(join(RES, carpeta, n));
  }
  for (const ruta of aRevisar) {
    for (const m of leer(ruta).matchAll(/"@(string|color|drawable|layout|xml|style)\/([\w.]+)"/g)) {
      assert.ok(tablas[m[1]].has(m[2]), `${ruta} usa @${m[1]}/${m[2]}, que no existe`);
    }
  }
});

/** Los widgets que existen en el código, y el <receiver> de cada uno. */
function proveedoresDeWidget() {
  // La clase base es abstracta: no es un widget, es el andamiaje.
  const clases = [...fuentesKotlin.matchAll(/(abstract )?class (\w+) : (?:WidgetCompacto|AppWidgetProvider)\(\)/g)]
    .filter((m) => !m[1])
    .map((m) => m[2]);
  const manifest = leer(MANIFEST);
  // Cada <receiver ...>...</receiver> entero, para poder mirarlo por separado.
  const receivers = new Map();
  for (const m of manifest.matchAll(/<receiver\s[\s\S]*?<\/receiver>/g)) {
    const nombre = /android:name="\.(\w+)"/.exec(m[0])?.[1];
    if (nombre) receivers.set(nombre, m[0]);
  }
  return { clases, receivers };
}

test('todo widget del código está declarado en el manifiesto', () => {
  // Sin el receiver no aparece en la lista de widgets del teléfono, y no hay
  // ningún error: simplemente no está. Con seis widgets, olvidarse de uno es
  // lo más fácil del mundo.
  const { clases, receivers } = proveedoresDeWidget();
  assert.ok(clases.length >= 2, `encontré ${clases.length} widgets, esperaba varios`);
  const xmls = new Set(readdirSync(join(RES, 'xml')).map((n) => n.replace(/\.xml$/, '')));

  for (const clase of clases) {
    const receiver = receivers.get(clase);
    assert.ok(receiver, `falta el <receiver> de ${clase}: no aparecería en el teléfono`);
    assert.match(receiver, /android\.appwidget\.action\.APPWIDGET_UPDATE/,
      `${clase}: sin APPWIDGET_UPDATE nunca se dibuja`);
    const info = /android:resource="@xml\/(\w+)"/.exec(receiver)?.[1];
    assert.ok(info && xmls.has(info), `${clase}: el meta-data no apunta a un xml que exista`);
  }
});

test('cada widget filtra la acción de su botón de un toque', () => {
  // La acción la maneja la clase base, así que la hereda cualquier widget. Si
  // el manifiesto no la filtra, el botón no hace nada y tampoco falla.
  const accion = /const val ACCION_REGISTRAR = "([^"]+)"/.exec(fuentesKotlin)?.[1];
  assert.ok(accion, 'no encontré ACCION_REGISTRAR en ningún fuente');
  const { clases, receivers } = proveedoresDeWidget();
  for (const clase of clases) {
    assert.ok(receivers.get(clase)?.includes(accion),
      `${clase} no filtra "${accion}": su botón de un toque no haría nada`);
  }
});

test('los layouts compactos traen las vistas que usa la clase base', () => {
  // conElDia esconde el contenido y muestra el aviso. setViewVisibility sobre
  // un id que ese layout no tiene no falla: deja el widget en blanco.
  const usados = [...fuentesKotlin.matchAll(/conElDia\(c, R\.layout\.(\w+)/g)].map((m) => m[1]);
  assert.ok(usados.length > 0, 'no encontré ningún layout compacto');
  for (const layout of new Set(usados)) {
    const src = leer(join(RES, 'layout', `${layout}.xml`));
    for (const id of ['compacto_aviso', 'compacto_contenido']) {
      // Con includes, un id renombrado a compacto_aviso_viejo seguía pasando.
      assert.match(src, new RegExp(`@\\+id/${id}"`), `${layout}.xml no declara ${id}`);
    }
  }
});

test('el nombre del evento de pendientes coincide entre la app y la web', () => {
  const enJs = /export const EVENTO_PENDIENTES = '([^']+)'/.exec(readFileSync('js/native.js', 'utf8'))?.[1];
  assert.ok(enJs, 'no encontré EVENTO_PENDIENTES en native.js');
  assert.ok(leer(MAIN).includes(`new CustomEvent('${enJs}'`),
    `la web escucha '${enJs}' y la app manda otra cosa`);
});

test('el widget no se queda con una cola que nadie vacía', () => {
  // Si la web aplica los registros y la app no limpia, se vuelven a aplicar
  // para siempre; si limpia sin que la web avise, se pierden.
  const kt = leer(MAIN);
  assert.match(kt, /fun pendientesAplicados\(\)/, 'falta el aviso de vuelta');
  assert.match(kt, /Resumen\.limpiarPendientes/, 'nadie vacía la cola');
  assert.match(readFileSync('js/native.js', 'utf8'), /pendientesAplicados\?\.\(\)/,
    'la web no avisa que terminó');
});

test('el fondo de la app no quedó del tema viejo', () => {
  // Era el azul de antes de Brasa: se veía como un flash al abrir.
  const fondo = /<color name="fondo">(#[0-9a-fA-F]+)<\/color>/.exec(leer(join(RES, 'values/colors.xml')))?.[1];
  assert.ok(fondo, 'no encontré el color de fondo');
  const azul = /^#(..)(..)(..)$/.exec(fondo.slice(0, 7));
  if (azul) {
    const [r, g, b] = azul.slice(1).map((h) => parseInt(h, 16));
    assert.ok(b <= r + 20, `el fondo ${fondo} sigue tirando a azul`);
  }
});

test('los override con firma estricta no declaran el parámetro nullable', () => {
  // AndroidX anota @NonNull varios parámetros. Declararlos con ? no es un
  // override distinto: no es ninguno, y el método nunca se llama. El
  // compilador lo dice ("overrides nothing"), pero recién en CI.
  const ESTRICTOS = {
    onNewIntent: 'Intent',
    onSaveInstanceState: 'Bundle',
    onRequestPermissionsResult: 'Array<out String>',
  };
  for (const ruta of archivos) {
    const src = leer(ruta);
    for (const [metodo, tipo] of Object.entries(ESTRICTOS)) {
      const m = new RegExp(`override fun ${metodo}\\(([^)]*)\\)`).exec(src);
      if (!m) continue;
      assert.ok(!m[1].includes(`${tipo}?`),
        `${ruta}: ${metodo} declara ${tipo}? y la clase base lo tiene @NonNull, `
        + 'así que no sobrescribe nada y no se llama nunca');
    }
  }
});

test('los textos de Android no tienen comillas sin escapar', () => {
  // Una comilla simple suelta en strings.xml es un error de aapt, no de
  // Kotlin: aparece al final del build y no dice de qué archivo viene.
  for (const nombre of readdirSync(join(RES, 'values'))) {
    const src = leer(join(RES, 'values', nombre));
    for (const m of src.matchAll(/<string name="(\w+)"[^>]*>([\s\S]*?)<\/string>/g)) {
      const cuerpo = m[2];
      const sueltas = [...cuerpo.matchAll(/(^|[^\\])'/g)];
      assert.equal(sueltas.length, 0,
        `${nombre}: la cadena ${m[1]} tiene una comilla simple sin escapar`);
      // Con más de un %s o %d hay que numerarlos, o aapt lo rechaza.
      const sinNumerar = [...cuerpo.matchAll(/%[sd]/g)].length;
      const numerados = [...cuerpo.matchAll(/%\d+\$[sd]/g)].length;
      assert.ok(!(sinNumerar > 1),
        `${nombre}: la cadena ${m[1]} tiene ${sinNumerar} marcadores sin numerar`);
      assert.ok(!(sinNumerar >= 1 && numerados >= 1),
        `${nombre}: la cadena ${m[1]} mezcla marcadores numerados y sin numerar`);
    }
  }
});

/** Los argumentos de una llamada, contando paréntesis en vez de adivinar. */
function argumentosDe(src, desde) {
  let prof = 0;
  let nivelCero = 0;
  for (let i = desde; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') prof += 1;
    else if (ch === ')') {
      prof -= 1;
      if (prof !== 0) continue;
      // Kotlin permite coma final, y esa no separa ningún argumento.
      let j = i - 1;
      while (j > desde && /\s/.test(src[j])) j -= 1;
      return src[j] === ',' ? nivelCero : nivelCero + 1;
    } else if (ch === ',' && prof === 1) nivelCero += 1;
  }
  return null;
}

test('lo que el código le pasa a cada texto coincide con sus marcadores', () => {
  // getString con menos argumentos de los que pide la cadena no falla al
  // compilar: revienta en el teléfono, y sólo cuando se dibuja esa pantalla.
  const strings = new Map();
  for (const nombre of readdirSync(join(RES, 'values'))) {
    for (const m of leer(join(RES, 'values', nombre)).matchAll(/<string name="(\w+)"[^>]*>([\s\S]*?)<\/string>/g)) {
      strings.set(m[1], new Set([...m[2].matchAll(/%(\d+)\$[sd]/g)].map((x) => x[1])).size);
    }
  }
  let revisadas = 0;
  for (const ruta of archivos) {
    const src = leer(ruta);
    for (const m of src.matchAll(/getString\(/g)) {
      const resto = src.slice(m.index);
      const cual = /getString\(\s*R\.string\.(\w+)/.exec(resto)?.[1];
      if (!cual || !strings.has(cual)) continue;
      const pasa = argumentosDe(src, m.index + 'getString'.length) - 1;
      revisadas += 1;
      assert.equal(pasa, strings.get(cual),
        `${ruta}: R.string.${cual} pide ${strings.get(cual)} argumentos y le pasan ${pasa}`);
    }
  }
  assert.ok(revisadas > 0, 'no revisé ninguna llamada a getString');
});

// ---------------------------------------------------------------------------
// La copia que abre sin conexión
//
// Sin red, cargar de GitHub Pages falla y el WebView muestra su pantalla de
// error: el service worker no interviene en la navegación principal. El
// respaldo es una copia dentro del APK, y lo único que la hace segura es que
// se sirva en el MISMO origen: el localStorage está atado al origen, así que
// un respaldo mal apuntado no da un error, da una app vacía.
// ---------------------------------------------------------------------------

const constante = (nombre) => {
  const m = new RegExp(`const val ${nombre} = ([^\\n]+)`).exec(leer(MAIN))?.[1]?.trim();
  if (!m) return null;
  // Admite "literal" y también WEB + "literal".
  return [...m.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
};

test('el respaldo local se sirve en el mismo origen que la web', () => {
  const web = constante('WEB')?.[0];
  const dominio = constante('DOMINIO')?.[0];
  const ruta = constante('RUTA')?.[0];
  assert.ok(web && dominio && ruta, 'faltan WEB, DOMINIO o RUTA');
  assert.equal(`https://${dominio}${ruta}`, web,
    'el dominio y la ruta del respaldo no reconstruyen WEB: offline abriría vacía');
});

test('la copia local se pide por su nombre, no por el directorio', () => {
  // Un manejador de assets no sabe servir el índice de un directorio.
  const kt = leer(MAIN);
  assert.match(kt, /private val inicio = WEB \+ BuildConfig\.SUBRUTA/,
    'la página de cada app tiene que colgar de WEB, el mismo origen que el respaldo');
  assert.match(kt, /loadUrl\(inicio \+ "index\.html"/,
    'sin conexión hay que pedir inicio + "index.html", no la carpeta');
});

test('cada app abre su propia página y la de siempre conserva su identidad', () => {
  const gradle = leer('android/app/build.gradle.kts');
  const sabor = (nombre) => new RegExp(`create\\("${nombre}"\\)\\s*\\{([\\s\\S]*?)\\n    \\}`).exec(gradle)?.[1];
  const rutina = sabor('rutina');
  const ataraxia = sabor('ataraxia');
  assert.ok(rutina && ataraxia, 'faltan los sabores rutina y ataraxia');
  // Cambiarle el applicationId a la tuya la volvería otra app: el APK nuevo
  // no actualizaría al instalado y desinstalar borra el historial.
  assert.doesNotMatch(rutina, /applicationId/, 'la app de siempre no puede cambiar de applicationId');
  assert.match(gradle, /defaultConfig\s*\{[\s\S]*?applicationId = "com\.jeremiasmas\.rutina"/);
  assert.match(ataraxia, /applicationId = "com\.jeremiasmas\.ataraxia"/);
  const subruta = (bloque) => /buildConfigField\("String", "SUBRUTA", "\\"([^\\]*)\\""\)/.exec(bloque)?.[1];
  assert.equal(subruta(rutina), '');
  assert.equal(subruta(ataraxia), 'ataraxia/');
  assert.ok(existsSync('ataraxia/index.html'), 'Ataraxia abre ataraxia/index.html y no existe');

  // Ataraxia no tiene widgets: los de Rutina mostrarían datos que no existen.
  const manifiesto = leer('android/app/src/ataraxia/AndroidManifest.xml');
  for (const m of leer('android/app/src/main/AndroidManifest.xml').matchAll(/<receiver\s+android:name="\.(\w+)"/g)) {
    assert.match(manifiesto, new RegExp(`com\\.jeremiasmas\\.rutina\\.${m[1]}" tools:node="remove"`),
      `el widget ${m[1]} aparecería en Ataraxia`);
  }
  assert.match(leer('android/app/src/ataraxia/res/values/strings.xml'), /name="app_name">Ataraxia</);

  // El recordatorio de peso: el receptor y sus permisos son sólo de Ataraxia.
  assert.match(manifiesto, /android:name="com\.jeremiasmas\.rutina\.RecordatorioReceptor"/);
  assert.match(manifiesto, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifiesto, /android\.intent\.action\.BOOT_COMPLETED/);
  const principal = leer('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(principal, /POST_NOTIFICATIONS|RecordatorioReceptor/,
    'Rutina no tiene recordatorio: no debería pedir permiso de notificaciones');

  // El workflow publica los dos APKs desde la carpeta de cada sabor.
  const ci = leer('.github/workflows/android.yml');
  assert.match(ci, /apk\/rutina\/debug\/app-rutina-debug\.apk rutina\.apk/);
  assert.match(ci, /apk\/ataraxia\/debug\/app-ataraxia-debug\.apk ataraxia\.apk/);
});

test('el respaldo sólo se usa cuando la red falla', () => {
  // Interceptar siempre mataría la actualización automática: la app dejaría
  // de tomar lo que se sube a GitHub Pages.
  const kt = leer(MAIN);
  assert.match(kt, /if \(!sinConexion\) return null/,
    'shouldInterceptRequest tiene que dejar pasar todo mientras haya red');
  assert.match(kt, /request\.isForMainFrame/,
    'sólo el fallo de la navegación principal debe disparar el cambio');
});

test('el APK se lleva todo lo que la web necesita para abrir sola', () => {
  // Si Gradle no copia algo que el service worker cachea, ese archivo no
  // existe sin conexión y la app abre rota en vez de no abrir.
  const gradle = leer('android/app/build.gradle.kts');
  const bloque = /tasks\.register<Copy>\("copiarWeb"\)[\s\S]*?\n\}/.exec(gradle)?.[0];
  assert.ok(bloque, 'no encontré la tarea que copia la web al APK');
  const incluidos = [...bloque.matchAll(/include\(([^)]*)\)/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.ok(incluidos.length > 0, 'la tarea no incluye nada');

  const cubre = (ruta) => incluidos.some((p) => (p.endsWith('/**')
    ? ruta.startsWith(p.slice(0, -2))
    : p === ruta));

  const sw = leer('sw.js');
  const cacheados = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(cacheados.length > 20, `esperaba muchos archivos, encontré ${cacheados.length}`);
  // Y lo mismo para Ataraxia, que vive en su carpeta con su propio service worker.
  const deAtaraxia = [...leer('ataraxia/sw.js').matchAll(/'\.\/([^']*)'/g)]
    .map((m) => m[1]).filter(Boolean).map((r) => `ataraxia/${r}`);
  cacheados.push('ataraxia/index.html', ...deAtaraxia);
  const faltan = cacheados.filter((r) => !cubre(r));
  assert.deepEqual(faltan, [], `el APK no se lleva: ${faltan.join(', ')}`);
});

test('todo lo que el service worker cachea existe de verdad', () => {
  // Un archivo que no existe hace fallar cache.addAll entero, y entonces no
  // hay modo offline en ningún lado.
  const cacheados = [...leer('sw.js').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  const faltan = cacheados.filter((r) => !existsSync(r));
  assert.deepEqual(faltan, [], `en sw.js pero no en el repo: ${faltan.join(', ')}`);
});

test('los widgets sólo meten filas adentro de un contenedor', () => {
  // addView sobre un TextView no falla: el widget queda sin las filas y no
  // hay ningún error que lo diga.
  const destinos = [
    ...fuentesKotlin.matchAll(/\.addView\(R\.id\.(\w+)/g),
    ...fuentesKotlin.matchAll(/\.removeAllViews\(R\.id\.(\w+)/g),
  ].map((m) => m[1]);
  assert.ok(destinos.length > 0, 'no encontré ningún addView');

  // Qué etiqueta declara cada id, mirando todos los layouts.
  const etiquetaDe = new Map();
  for (const nombre of readdirSync(join(RES, 'layout'))) {
    const src = leer(join(RES, 'layout', nombre));
    for (const m of src.matchAll(/<(\w+)[^>]*?android:id="@\+id\/(\w+)"/g)) etiquetaDe.set(m[2], m[1]);
  }

  for (const id of new Set(destinos)) {
    const etiqueta = etiquetaDe.get(id);
    assert.ok(etiqueta, `R.id.${id} no está declarado en ningún layout`);
    assert.match(etiqueta, /Layout$/,
      `se le agregan filas a R.id.${id}, que es un <${etiqueta}> y no un contenedor`);
  }
});

test('la app se firma siempre con la misma clave', () => {
  // Para Android la firma ES la identidad de la app. Sin una clave fija cada
  // runner de CI genera la suya —mismos parámetros, clave aleatoria—, así que
  // cada build sale firmado por alguien distinto y el teléfono no deja
  // actualizar encima: hay que desinstalar, y eso borra el localStorage del
  // WebView, que es el historial entero. Y no falla nada: el APK compila,
  // sube y recién revienta en el teléfono.
  const gradle = leer('android/app/build.gradle.kts');
  const declarado = /storeFile\s*=\s*file\("([^"]+)"\)/.exec(gradle)?.[1];
  assert.ok(declarado, 'no hay storeFile: Gradle volvería a inventarse una clave en cada build');
  assert.match(gradle, /getByName\("debug"\)\s*\{[\s\S]*?storeFile/,
    'el storeFile no está en la config de firma de debug, que es la que usa este APK');

  const ruta = join('android/app', declarado);
  assert.ok(existsSync(ruta), `${ruta} no existe y el build.gradle lo pide`);
  // Un keystore PKCS12 arranca con una SEQUENCE de DER. Un archivo vacío, un
  // texto o un puntero de Git LFS, no.
  assert.deepEqual([...readFileSync(ruta).subarray(0, 2)], [0x30, 0x82],
    `${ruta} no parece un keystore`);

  // Y tiene que estar versionado: si queda afuera de git, CI compila sin él y
  // Gradle se inventa una clave igual que antes, sin decir nada.
  const seguido = execFileSync('git', ['ls-files', '--', ruta], { encoding: 'utf8' }).trim();
  assert.equal(seguido, ruta, `${ruta} no está versionado: en CI no va a existir`);
});

test('la vista previa de cada widget es la que el widget dibuja', () => {
  // El initialLayout es lo que se ve en el selector del teléfono y mientras el
  // widget carga. Si apunta a otro layout no falla nada: el selector muestra
  // una cosa y al soltarlo aparece otra. Al reescribir un widget es lo primero
  // que queda viejo.
  const { clases, receivers } = proveedoresDeWidget();

  // El cuerpo de cada clase, para saber qué layouts usa de verdad.
  const cuerpos = new Map();
  for (const ruta of archivos) {
    const src = leer(ruta);
    const partes = src.split(/^(?=(?:abstract )?class )/m);
    for (const parte of partes) {
      const nombre = /^(?:abstract )?class (\w+)/.exec(parte)?.[1];
      if (nombre) cuerpos.set(nombre, parte);
    }
  }

  for (const clase of clases) {
    const info = /android:resource="@xml\/(\w+)"/.exec(receivers.get(clase))?.[1];
    const xml = leer(join(RES, 'xml', `${info}.xml`));
    const cuerpo = cuerpos.get(clase);
    assert.ok(cuerpo, `no encontré el cuerpo de ${clase}`);
    const usados = [...cuerpo.matchAll(/R\.layout\.(\w+)/g)].map((m) => m[1]);

    // initialLayout es el de siempre; previewLayout es el que mira Android 12
    // para arriba, que es el que vas a ver vos en el selector.
    for (const cual of ['initialLayout', 'previewLayout']) {
      const previa = new RegExp(`android:${cual}="@layout/(\\w+)"`).exec(xml)?.[1];
      assert.ok(previa, `${info}.xml no declara ${cual}`);
      assert.ok(usados.includes(previa),
        `${clase} dibuja ${usados.join(', ') || 'nada'} pero su ${cual} es ${previa}`);
    }
  }
});

test('los widgets no llevan fondo y sus textos se siguen viendo', () => {
  // Sin fondo quedan apoyados sobre el fondo de pantalla, que puede ser
  // cualquier cosa. Un TextView que se olvide la sombra no falla: desaparece
  // sobre un fondo claro, y sólo se nota en el teléfono de quien lo tenga.
  // Y que el estilo de verdad tenga una sombra: vacío pasaría igual, y cada
  // texto del teléfono quedaría sin contraste sin que nada avise.
  const estilo = readdirSync(join(RES, 'values'))
    .map((n) => /<style name="TextoDeWidget">([\s\S]*?)<\/style>/.exec(leer(join(RES, 'values', n)))?.[1])
    .find(Boolean);
  assert.ok(estilo, 'falta el estilo con la sombra');
  assert.match(estilo, /android:shadowColor">@color\/\w+/, 'el estilo no define el color de la sombra');
  assert.match(estilo, /android:shadowRadius">\s*[1-9]/, 'el estilo no define un radio de sombra');

  const layouts = readdirSync(join(RES, 'layout')).filter((n) => n.startsWith('widget'));
  assert.ok(layouts.length >= 5, `sólo encontré ${layouts.length} layouts de widget`);

  for (const nombre of layouts) {
    const src = leer(join(RES, 'layout', nombre));
    // La píldora del botón de un toque es lo único que lleva fondo propio:
    // es la que lo hace parecer un botón.
    for (const m of src.matchAll(/android:background="([^"]+)"/g)) {
      assert.equal(m[1], '@drawable/widget_boton_fondo',
        `${nombre} lleva un fondo (${m[1]}) y los widgets van sobre el fondo de pantalla`);
    }

    const textos = [...src.matchAll(/<TextView\b[\s\S]*?\/>/g)];
    assert.ok(textos.length > 0, `${nombre} no declara ningún TextView`);
    for (const t of textos) {
      const id = /android:id="@\+id\/(\w+)"/.exec(t[0])?.[1] || '¿sin id?';
      assert.match(t[0], /style="@style\/TextoDeWidget"/,
        `${nombre}: ${id} no lleva la sombra y se pierde sobre un fondo claro`);
    }
  }
});

// ---------------------------------------------------------------------------
// Los pasos que el widget trae por su cuenta
// ---------------------------------------------------------------------------

test('todo goAsync termina su PendingResult', () => {
  // Un PendingResult que no se cierra deja el proceso vivo hasta que Android
  // lo mata por ANR. Y tiene que ser en finally: si la lectura de Health
  // Connect tira, el camino del error también tiene que cerrarlo.
  for (const ruta of archivos) {
    const src = leer(ruta);
    if (!src.includes('goAsync()')) continue;
    assert.match(src, /finally\s*\{[^}]*\.finish\(\)/,
      `${ruta}: llama a goAsync pero no cierra el PendingResult en un finally`);
  }
});

test('el origen de los pasos no sale de las preferencias de la actividad', () => {
  // getPreferences es el archivo privado de MainActivity, que lleva el nombre
  // de la clase. Un widget corre en otro proceso y no llega: si leyera otro
  // filtro, la pantalla y el widget mostrarían números distintos del mismo día.
  const widgets = archivos.filter((r) => /Widget/.test(r));
  for (const ruta of widgets) {
    assert.ok(!leer(ruta).includes('getPreferences('),
      `${ruta}: un widget no puede leer las preferencias privadas de la actividad`);
  }
  const pasos = leer('android/app/src/main/java/com/jeremiasmas/rutina/Pasos.kt');
  assert.match(pasos, /fun origen\(/, 'Pasos tiene que exponer de dónde sale el origen');
  assert.match(pasos, /fun migrarOrigen\(/,
    'sin migración, la primera corrida pierde la app elegida y los pasos saltan');
});

test('la lectura de pasos del widget no se cuelga ni pisa con un cero', () => {
  const widgets = leer('android/app/src/main/java/com/jeremiasmas/rutina/WidgetsCompactos.kt');
  // El tope tiene que envolver la lectura, no sólo figurar en los imports.
  assert.match(widgets, /withTimeoutOrNull\([^)]*\)\s*\{\s*Pasos\.hoy\(/,
    'un proveedor de Health Connect que no contesta no puede colgar el receptor');
  const resumen = leer('android/app/src/main/java/com/jeremiasmas/rutina/Resumen.kt');
  assert.match(resumen, /fun conPasosDeHoy\(/);
  // Nunca para abajo: los pasos de un día no bajan, y una lectura a medias no
  // tiene que borrar lo que la web ya había escrito.
  assert.match(resumen, /pasos <= antes/,
    'conPasosDeHoy tiene que descartar una lectura menor a la que ya había');
});

test('el resumen no toca lo que sólo el motor de la web sabe calcular', () => {
  // xp, nivel, racha y rango salen de derive sobre el localStorage, que desde
  // el proceso del widget no existe. Escribirlos acá sería inventarlos.
  const src = leer('android/app/src/main/java/com/jeremiasmas/rutina/Resumen.kt');
  const cuerpo = src.slice(src.indexOf('fun conPasosDeHoy('));
  const fin = cuerpo.indexOf('\n  /** Como formatNumber');
  const funcion = cuerpo.slice(0, fin > 0 ? fin : undefined);
  for (const campo of ['xp', 'nivel', 'racha', 'rango']) {
    assert.ok(!funcion.includes(`put("${campo}"`),
      `conPasosDeHoy escribe ${campo}, que no puede calcular`);
  }
});
