import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const vistas = ['js/views', 'js/ui'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
const fuentes = vistas.map((ruta) => [ruta, sinComentarios(readFileSync(ruta, 'utf8'))]);

/* ---------------------------------------------------------------------------
   Nada nombra el escalón que todavía no alcanzaste
   --------------------------------------------------------------------------- */

test('ninguna pantalla escribe el nombre del próximo nivel', () => {
  // Enterarse al llegar es media gracia de la escalera. Se puede decir
  // cuánto falta —eso es accionable— pero no cómo se llama lo que viene.
  const prohibidos = [
    /\$\{[^}]*nextTier[^}]*\.name[^}]*\}/,
    /\$\{[^}]*\bbanda\.next\.name[^}]*\}/,
    /\$\{[^}]*\bnivel\.next\}/,
    /\$\{[^}]*nivelSiguiente[^}]*\}/,
    /\$\{[^}]*strengthOverall\.next\}/,
    /camino a \$\{/,
  ];
  for (const [ruta, texto] of fuentes) {
    for (const patron of prohibidos) {
      assert.doesNotMatch(texto, patron, `${ruta} spoilea el nombre del próximo escalón (${patron})`);
    }
  }
});

test('la proyección de rango no adelanta ni el nombre ni su nota', () => {
  const stats = fuentes.find(([r]) => r.endsWith('stats.js'))[1];
  const tarjeta = stats.slice(stats.indexOf("cab('Próximo rango')"));
  assert.ok(stats.includes("cab('Próximo rango')"), 'volvió el nombre del rango que viene');
  assert.ok(!tarjeta.slice(0, tarjeta.indexOf('}')).includes('titulo.nota'),
    'la nota del rango describe quién fue: contarla antes de llegar lo quema igual');
});

test('lo que ya alcanzaste sí se nombra', () => {
  // La regla es sobre lo que viene, no sobre lo que sos. Tu rango actual y el
  // nivel al que acabás de subir se siguen diciendo.
  const stats = fuentes.find(([r]) => r.endsWith('stats.js'))[1];
  assert.match(stats, /\$\{p\.titulo\.name\} · nivel/,
    'se perdió el rango propio en el último escalón, que no es un spoiler');
});

test('se sigue diciendo cuánto falta', () => {
  // Sacar el nombre no puede llevarse el dato accionable.
  const act = fuentes.find(([r]) => r.endsWith('activity.js'))[1];
  assert.match(act, /El próximo rango llega en el nivel \$\{st\.nextTier\.min\}/);
  assert.match(act, /te faltan \$\{formatNumber\(s\.falta\)\} kg/);
  assert.match(act, /Te faltan \$\{formatNumber\(banda\.falta\)\} puntos para la próxima banda/);
});

/* ---------------------------------------------------------------------------
   Ninguna disciplina le habla con el texto de otra
   --------------------------------------------------------------------------- */

test('el análisis de fuentes no tiene escrita ninguna disciplina', () => {
  // "Casi todo tu francés viene de Brilliant" apareció en Análisis de datos:
  // el código de fuentes es el mismo para todas, y el texto estaba fijo.
  const vista = fuentes.find(([r]) => r.endsWith('views/analisis.js'))[1];
  const bloque = vista.slice(vista.indexOf('function detalleFuentes'));
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}'));
  for (const palabra of ['francés', 'Duolingo', 'podcast', 'Brilliant', 'oído']) {
    assert.ok(!cuerpo.includes(palabra),
      `detalleFuentes nombra "${palabra}": eso se lo va a decir a la disciplina equivocada`);
  }
  assert.match(cuerpo, /st\.activity\.name\.toLowerCase\(\)/, 'la frase no usa el nombre real');
});

test('cada fuente trae escrito qué se pierde si te apoyás sólo en ella', () => {
  const conFuentes = DEFAULT_ACTIVITIES.filter((a) => a.sources?.length);
  assert.ok(conFuentes.length >= 2, 'esperaba al menos francés y análisis de datos');
  for (const a of conFuentes) {
    assert.ok(a.equilibrio, `${a.id} no dice nada para el caso equilibrado`);
    for (const f of a.sources) {
      assert.ok(f.sesgo, `la fuente ${f.id} de ${a.id} no dice qué deja afuera`);
      assert.ok(f.sesgo.length > 40, `el sesgo de ${f.id} es demasiado corto para decir algo`);
    }
  }
});

test('el sesgo de una fuente habla de esa fuente', () => {
  const frances = DEFAULT_ACTIVITIES.find((a) => a.id === 'frances');
  const datos = DEFAULT_ACTIVITIES.find((a) => a.id === 'datos');
  assert.match(frances.sources.find((f) => f.id === 'duolingo').sesgo, /Duolingo/);
  assert.match(frances.sources.find((f) => f.id === 'cbf').sesgo, /podcast/i);
  assert.match(datos.sources.find((f) => f.id === 'brilliant').sesgo, /Brilliant/);
  // Y no al revés: el de datos no puede hablar de francés.
  for (const f of datos.sources) {
    assert.ok(!/francés|Duolingo|oído/.test(f.sesgo), `la fuente ${f.id} de datos habla de francés`);
  }
});
