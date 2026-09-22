import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
  const tablas = { string: strings, color: colors, drawable: drawables, layout: layouts, xml: xmls };

  const aRevisar = [MANIFEST];
  for (const carpeta of ['layout', 'xml', 'drawable']) {
    for (const n of readdirSync(join(RES, carpeta))) aRevisar.push(join(RES, carpeta, n));
  }
  for (const ruta of aRevisar) {
    for (const m of leer(ruta).matchAll(/"@(string|color|drawable|layout|xml)\/(\w+)"/g)) {
      assert.ok(tablas[m[1]].has(m[2]), `${ruta} usa @${m[1]}/${m[2]}, que no existe`);
    }
  }
});

test('el widget está declarado en el manifiesto', () => {
  const manifest = leer(MANIFEST);
  // Sin el receiver no aparece en la lista de widgets del teléfono, y no hay
  // ningún error: simplemente no está.
  assert.match(manifest, /<receiver\s[\s\S]*?android:name="\.WidgetRutina"/,
    'falta el <receiver> del widget');
  assert.match(manifest, /android\.appwidget\.action\.APPWIDGET_UPDATE/,
    'sin APPWIDGET_UPDATE el widget nunca se dibuja');
  assert.match(manifest, /android:name="android\.appwidget\.provider"/,
    'falta el meta-data que apunta a widget_info');
});

test('la acción del widget dice lo mismo en el manifiesto y en el código', () => {
  const kt = leer('android/app/src/main/java/com/jeremiasmas/rutina/WidgetRutina.kt');
  const accion = /const val ACCION_REGISTRAR = "([^"]+)"/.exec(kt)?.[1];
  assert.ok(accion, 'no encontré ACCION_REGISTRAR');
  assert.ok(leer(MANIFEST).includes(accion),
    `el manifiesto no filtra "${accion}": el botón del widget no haría nada`);
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
