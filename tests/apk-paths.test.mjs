import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Lo que viaja adentro del APK tiene que recompilarlo.
 *
 * Desde que el service worker sirve caché primero, la app instalada ya no baja
 * lo nuevo por su cuenta: un cambio de la web que no dispare el build se queda
 * en GitHub Pages y no llega al teléfono nunca. Eso ya pasó una vez, con el
 * rediseño del tablero.
 *
 * Son dos listas en dos lenguajes distintos, a dos carpetas de distancia. Sin
 * esta guarda, agregar una carpeta al APK y olvidarse del workflow falla en
 * silencio: compila, publica, y lo que falta es justamente lo que cambiaste.
 */
const gradle = readFileSync('android/app/build.gradle.kts', 'utf8');
const workflow = readFileSync('.github/workflows/android.yml', 'utf8');

/** Lo que `copiarWeb` mete en los assets. */
function loQueViajaEnElApk() {
  const bloque = gradle.slice(gradle.indexOf('tasks.register<Copy>("copiarWeb")'));
  const hasta = bloque.indexOf('into(');
  assert.ok(hasta > 0, 'no encontré el destino de copiarWeb');
  return [...bloque.slice(0, hasta).matchAll(/include\(([^)]*)\)/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((s) => s[1]));
}

/** Los caminos que disparan el build al mergear. */
function loQueDisparaElBuild() {
  const push = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('  pull_request:'));
  const paths = push.slice(push.indexOf('paths:'));
  return [...paths.matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]);
}

test('encuentro las dos listas', () => {
  assert.ok(loQueViajaEnElApk().length >= 5);
  assert.ok(loQueDisparaElBuild().length >= 5);
});

test('todo lo que viaja en el APK dispara el build', () => {
  const dispara = new Set(loQueDisparaElBuild());
  for (const patron of loQueViajaEnElApk()) {
    assert.ok(dispara.has(patron),
      `"${patron}" va adentro del APK pero no dispara la compilación: `
      + 'un cambio ahí se queda en Pages y no llega al teléfono');
  }
});

test('el propio Android y el workflow también disparan', () => {
  const dispara = new Set(loQueDisparaElBuild());
  assert.ok(dispara.has('android/**'), 'cambiar el Kotlin no recompila');
  assert.ok(dispara.has('.github/workflows/android.yml'), 'cambiar el workflow no lo prueba');
});

test('el build de main publica y el de un PR no', () => {
  // Compilar en cada PR de la web alargaría todos para nada: el Kotlin no se
  // rompe por tocar un CSS. Pero el PR que toca Android sí tiene que compilar.
  const pr = workflow.slice(workflow.indexOf('  pull_request:'), workflow.indexOf('  workflow_dispatch:'));
  assert.ok(pr.includes("'android/**'"), 'un PR de Android dejó de compilar');
  assert.ok(!pr.includes("'js/**'"), 'cada PR de la web compila un APK que nadie va a instalar');
  assert.ok(workflow.includes("if: github.event_name != 'pull_request'"),
    'un PR publicaría el release y pisaría el APK bueno');
});
