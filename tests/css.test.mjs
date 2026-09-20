import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/styles.css', 'utf8');

// Sin comentarios, para no confundir llaves ni variables citadas de paso.
const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('las llaves cierran', () => {
  let prof = 0;
  for (const c of limpio) {
    if (c === '{') prof += 1;
    else if (c === '}') prof -= 1;
    assert.ok(prof >= 0, 'hay una llave de cierre de más');
  }
  assert.equal(prof, 0, `quedaron ${prof} llaves sin cerrar`);
});

test('toda variable que se usa está definida', () => {
  const definidas = new Set([...limpio.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const usadas = new Set([...limpio.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  // Las que no salen del CSS: --c y --t las pone el JS por estilo en línea, y
  // los márgenes los inyecta la app de Android con lo que miden las barras del
  // sistema. Todas se usan con un valor de respaldo, que es lo que se exige.
  const DE_AFUERA = ['--c', '--t', '--inset-top', '--inset-bottom', '--inset-left', '--inset-right'];
  for (const v of usadas) {
    if (DE_AFUERA.includes(v)) continue;
    assert.ok(definidas.has(v), `${v} se usa y no está definida`);
  }
  for (const v of DE_AFUERA.slice(2)) {
    if (!limpio.includes(v)) continue;
    const sinRespaldo = new RegExp(`var\\(${v}\\s*\\)`).test(limpio);
    assert.ok(!sinRespaldo, `${v} se usa sin valor de respaldo: fuera de la app quedaría en cero`);
  }
});

test('cada tema define su identidad visual completa', () => {
  // Si a un tema le falta una, hereda la del tema base y queda un color
  // suelto de otra paleta. Eso es exactamente lo que pasaba con los azules.
  const IDENTIDAD = ['--bg', '--bg-soft', '--text', '--muted', '--accent', '--accent-2',
    '--gold', '--danger', '--ok', '--heat', '--fire', '--shield',
    '--sheet-a', '--sheet-b', '--quest-glow', '--player', '--bar'];
  const temas = [...limpio.matchAll(/:root\[data-tema='([\w-]+)'\]\s*\{([^}]*)\}/g)];
  assert.ok(temas.length >= 3, `encontré ${temas.length} temas`);
  for (const [, nombre, cuerpo] of temas) {
    for (const v of IDENTIDAD) {
      assert.ok(new RegExp(`${v}\\s*:`).test(cuerpo), `el tema "${nombre}" no define ${v}`);
    }
  }
});

test('las piezas fijas de la interfaz conservan sus propiedades', () => {
  // Una edición mal puesta puede partir una regla en dos y dejar la mitad de
  // las propiedades adentro de otro selector, sin romper la sintaxis.
  const reglas = {
    '.tabbar': ['position', 'bottom', 'background', 'border-radius', 'z-index'],
    '.topbar': ['width', 'padding'],
    '.sheet': ['max-height', 'padding', 'background'],
  };
  for (const [selector, props] of Object.entries(reglas)) {
    const m = new RegExp(`\\n\\${selector}\\s*\\{([^}]*)\\}`).exec(limpio);
    assert.ok(m, `no encontré la regla ${selector}`);
    for (const prop of props) {
      assert.ok(new RegExp(`(^|;|\\s)${prop}\\s*:`).test(m[1]),
        `${selector} perdió "${prop}": puede que una edición haya partido la regla`);
    }
  }
});
