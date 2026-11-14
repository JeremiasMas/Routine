import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatValue, unidadPara } from '../js/utils.js';
import { parValor, resumenDelDia } from '../js/tablero.js';
import { nombreDeCopiaManual } from '../js/backup.js';
import { tintaSobre, contraste, luminancia, estiloDeBoton, TINTA_CLARA, TINTA_OSCURA } from '../js/theme.js';
import { filasDeGimnasio } from '../js/csv.js';
import { estimatedOneRepMax } from '../js/xp.js';

// Lo que salió de revisar la app entera, pantalla por pantalla.

const css = readFileSync('css/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const sinComentarios = (ruta) => readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/* ---------------------------------------------------------------------------
   "1 mediciones"
   --------------------------------------------------------------------------- */

test('una unidad acompaña a su número: 1 medición, 2 mediciones', () => {
  // Estaba en Ajustes ("1 mediciones · 1× por semana", "1 posts") y en el
  // tablero ("0 / 1 posts") todos los días.
  assert.equal(formatValue(1, 'mediciones'), '1 medición');
  assert.equal(formatValue(2, 'mediciones'), '2 mediciones');
  assert.equal(formatValue(1, 'posts'), '1 post');
  assert.equal(formatValue(0, 'posts'), '0 posts', 'cero va en plural');
  assert.equal(formatValue(1, 'series'), '1 serie');
  assert.equal(formatValue(1, 'pasos'), '1 paso');
});

test('las unidades que no conoce no las toca', () => {
  // Adivinar el singular de una palabra cualquiera sale mal más veces de las
  // que sale bien: "min" no pierde nada y "flexiones" no pasa a "flexione".
  assert.equal(formatValue(1, 'min'), '1 min');
  assert.equal(formatValue(1, 'kg'), '1 kg');
  assert.equal(formatValue(1, 'flexiones'), '1 flexiones');
  assert.equal(unidadPara(1, 'inventada'), 'inventada');
});

test('en el tablero la unidad sigue a la meta, que es el número que tiene al lado', () => {
  assert.equal(parValor(0, 1, 'posts'), '0 / 1 post');
  assert.equal(parValor(1, 1, 'mediciones'), '1 / 1 medición');
  assert.equal(parValor(1, 30, 'series'), '1 / 30 series', 'manda la meta, no lo hecho');
});

/* ---------------------------------------------------------------------------
   La copia fechada con el día de acá
   --------------------------------------------------------------------------- */

test('la copia manual se nombra con la fecha local, no la de Greenwich', () => {
  // Una fecha que no sea hoy: con la de hoy, una versión que ignore el
  // argumento y lea el reloj pasa el test de casualidad.
  assert.equal(nombreDeCopiaManual('2020-01-02'), 'rutina-rpg-2020-01-02.json');
  // De las 21 en adelante en Argentina, toISOString() ya es mañana.
  const ajustes = sinComentarios('js/views/settings.js');
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(ajustes),
    'Ajustes volvió a fechar un archivo con la hora de Greenwich');
  assert.equal([...ajustes.matchAll(/nombreDeCopiaManual\(\)/g)].length, 2,
    'exportar y compartir tienen que nombrar la copia igual');
});

/* ---------------------------------------------------------------------------
   La tinta sobre un botón de color
   --------------------------------------------------------------------------- */

test('sobre el rojo oscuro se escribe en blanco', () => {
  // "Registrar hoy" era casi negro sobre bordó en los temas rojos: 3,4 de
  // contraste, cuando lo legible arranca en 4,5.
  assert.ok(contraste(TINTA_OSCURA, '#c62828') < 4.5, 'el caso que motivó el arreglo ya no existe');
  assert.equal(tintaSobre('#c62828', 'sangre'), TINTA_CLARA);
  assert.equal(tintaSobre('#dc2626', 'sangre'), TINTA_CLARA);
  assert.ok(contraste(tintaSobre('#c62828', 'sangre'), '#c62828') >= 4.5);
});

test('sobre los colores claros se sigue escribiendo en oscuro', () => {
  for (const claro of ['#7dd3fc', '#34d399', '#f59e0b', '#fbbf24', '#a8a29e']) {
    for (const tema of ['consola', 'brasa', 'sangre', 'carmin']) {
      assert.equal(tintaSobre(claro, tema), TINTA_OSCURA, `${claro} en ${tema} quedó con texto blanco`);
    }
  }
});

test('la tinta se elige contra el peor extremo del degradé', () => {
  // El mismo rojo se lee distinto según hacia dónde se vaya el degradé: hacia
  // el violeta del tema de fábrica aguanta el negro; hacia el bordó, no.
  const tinta = tintaSobre('#ef2b34', 'brasa');
  const extremoOscuro = '#bd2529'; // 55% de #ef2b34 con #7f1d1d
  assert.ok(contraste(tinta, extremoOscuro) > contraste(tinta === TINTA_CLARA ? TINTA_OSCURA : TINTA_CLARA, extremoOscuro));
});

test('un color que no se entiende no rompe: cae en la tinta de siempre', () => {
  assert.equal(tintaSobre('rojo', 'sangre'), TINTA_OSCURA);
  assert.equal(tintaSobre(undefined, 'sangre'), TINTA_OSCURA);
  assert.equal(luminancia('#fff'), 1);
  assert.equal(luminancia('#000000'), 0);
  assert.equal(estiloDeBoton('#c62828', 'sangre'), `--c:#c62828;--sobre:${TINTA_CLARA}`);
});

test('ningún botón principal se pinta sin decir su tinta', () => {
  // Un --c suelto hereda la tinta del tema, que en los rojos es blanca: un
  // botón verde claro con letras blancas. Todos pasan por estiloDeBoton.
  for (const ruta of ['js/app.js', 'js/ui/logger.js', 'js/ui/walk.js', 'js/views/activity.js', 'js/views/settings.js']) {
    const fuente = sinComentarios(ruta);
    for (const linea of fuente.split('\n').filter((l) => l.includes('btn--primary'))) {
      assert.ok(!/--c:/.test(linea), `${ruta}: un botón principal fija --c a mano: ${linea.trim().slice(0, 80)}`);
    }
  }
  assert.match(css, /\.btn--primary \{[^}]*color: var\(--sobre, #071018\)/);
  assert.match(css, /\.quest__quick \{[^}]*color: var\(--sobre,/);
});

/* ---------------------------------------------------------------------------
   El resumen del día
   --------------------------------------------------------------------------- */

test('el próximo premio se dice en misiones, no en porcentajes', () => {
  assert.equal(resumenDelDia({ hechas: 2, total: 5 }).siguiente, '2 más → +20 XP');
  assert.equal(resumenDelDia({ hechas: 3, total: 5 }).siguiente, '1 más → +20 XP');
  // Con el 80% ya cobrado, lo que queda es el día perfecto.
  assert.equal(resumenDelDia({ hechas: 4, total: 5 }).siguiente, '1 más → +50 XP');
  assert.equal(resumenDelDia({ hechas: 5, total: 5 }).siguiente, '+50 XP de bonus');
});

test('el resumen del día no repite un número que ya está al lado', () => {
  // Eran tres casilleros: 2/5 misiones, la XP, y "3 faltan hoy", que es la
  // resta de los dos números del primero.
  const hoy = sinComentarios('js/views/today.js');
  assert.ok(!/Faltan hoy|Falta hoy/.test(hoy), 'volvió el casillero que resta 5 menos 2');
  assert.match(hoy, /right: resumen\.siguiente/);
});

/* ---------------------------------------------------------------------------
   El 1RM es uno solo
   --------------------------------------------------------------------------- */

test('el CSV exporta el mismo 1RM que muestra la app', () => {
  // Salía con Epley sola y la pantalla con el promedio de cuatro fórmulas:
  // dos números distintos para la misma serie, bajo el mismo nombre.
  const state = { byActivity: new Map([['gym', { activity: { kind: 'gym' }, history: [
    { date: '2026-10-30', entry: { exercises: [{ name: 'Pecho plano', sets: [{ weight: 65, reps: 10 }] }] } },
  ] }]]) };
  const [fila] = filasDeGimnasio(state);
  assert.equal(fila.e1rm_kg, estimatedOneRepMax(65, 10));
  assert.notEqual(fila.e1rm_kg, Math.round(65 * (1 + 10 / 30) * 100) / 100, 'sigue saliendo Epley sola');
  assert.ok(!/fórmula de Epley\)/.test(sinComentarios('js/views/activity.js')),
    'la pantalla volvió a decir que el 1RM es Epley');
});

/* ---------------------------------------------------------------------------
   Detalles de pantalla
   --------------------------------------------------------------------------- */

test('el brillo de las barras pasa una vez, no para siempre', () => {
  const regla = css.slice(css.indexOf('.xpbar__fill::after'));
  const cuerpo = regla.slice(0, regla.indexOf('}'));
  assert.ok(!/infinite/.test(cuerpo), 'el brillo volvió a correr sin parar en cada barra');
  assert.match(cuerpo, /animation: shine [^;]* 1 both/);
  // Y no se sale del relleno hacia la parte vacía de la barra.
  const relleno = css.slice(css.indexOf('.xpbar__fill {'));
  assert.match(relleno.slice(0, relleno.indexOf('}')), /overflow: hidden/);
});

test('la barra de fuerza dice cuánto falta, no "falta"', () => {
  const act = sinComentarios('js/views/activity.js');
  assert.ok(!/'Falta para el próximo'/.test(act), 'volvió la frase sin número');
  assert.match(act, /% hacia el próximo`/);
});

test('los récords largos se pliegan', () => {
  const act = sinComentarios('js/views/activity.js');
  assert.match(act, /st\.recordList\.slice\(0, RECORDS_A_LA_VISTA\)/);
  assert.match(act, /st\.recordList\.slice\(RECORDS_A_LA_VISTA\)/, 'los que no entran se perdieron en vez de plegarse');
});

test('la cabecera no parte sus etiquetas por la mitad', () => {
  assert.match(css, /\.player__xp \.xpbar__label span \{[^}]*white-space: nowrap/);
  assert.match(css, /@media \(max-width: 379px\) \{ \.chip__extra \{ display: none; \} \}/);
});
