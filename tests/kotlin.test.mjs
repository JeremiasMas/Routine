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
