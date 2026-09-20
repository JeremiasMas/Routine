import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// El desborde horizontal en el teléfono no se ve en el escritorio y arruina la
// pantalla entera. Ya pasó una vez con una hoja deslizante.
const css = readFileSync('css/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('nada se fija a un ancho mayor que la pantalla', () => {
  // Un width en px sin min() ni max-width se sale en los teléfonos angostos.
  const anchos = [...css.matchAll(/(^|;|\{)\s*width\s*:\s*(\d+)px/g)].map((m) => Number(m[2]));
  for (const w of anchos) {
    assert.ok(w <= 360, `hay un width: ${w}px fijo, que no entra en un teléfono angosto`);
  }
});

test('las rejillas dejan encoger sus columnas', () => {
  // Una columna de rejilla no baja de su contenido salvo que se le diga:
  // 1fr por sí solo desborda cuando adentro hay algo ancho.
  const rejillas = [...css.matchAll(/grid-template-columns\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  for (const r of rejillas) {
    if (!/\bfr\b/.test(r)) continue;
    assert.ok(/minmax\(\s*0/.test(r) || /repeat\([^)]*minmax\(\s*0/.test(r) || /auto-fit|auto-fill/.test(r),
      `"grid-template-columns: ${r}" usa fr sin minmax(0, …): puede desbordar`);
  }
});

test('los márgenes del sistema se aplican en los cuatro lados', () => {
  for (const lado of ['top', 'bottom', 'left', 'right']) {
    assert.ok(css.includes(`--inset-${lado}`), `no se usa el margen ${lado}`);
  }
});
