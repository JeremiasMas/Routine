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
  // La regla es sobre lo que viene, no sobre lo que sos: tu rango actual, su
  // nota y tu nivel se siguen diciendo.
  //
  // Antes este test los buscaba en la tarjeta del último escalón de Progreso.
  // Los tres viven en la cabecera, que se ve en las cuatro pantallas sin
  // scrollear, así que repetirlos abajo no era "no spoilear": era decir dos
  // veces lo mismo. Lo que el test cuida es que sigan estando, no dónde.
  // app.js no está en js/views ni js/ui, así que no entra en `fuentes`.
  const cabecera = sinComentarios(readFileSync('js/app.js', 'utf8'));
  assert.match(cabecera, /text: p\.title\.name/,
    'se perdió el rango propio, que no es un spoiler');
  assert.match(cabecera, /text: p\.title\.nota/, 'se perdió la nota del rango propio');
  assert.match(cabecera, /text: String\(p\.level\)/, 'se perdió el nivel');
});

test('se sigue diciendo cuánto falta', () => {
  // Sacar el nombre no puede llevarse el dato accionable.
  const act = fuentes.find(([r]) => r.endsWith('activity.js'))[1];
  assert.match(act, /El próximo rango llega en el nivel \$\{st\.nextTier\.min\}/);
  assert.match(act, /te faltan \$\{formatNumber\(s\.falta\)\} kg/);
  // Lo que se cuida es que el número siga dicho, no cómo está redactado:
  // antes esto fijaba la frase literal y se rompió al hacer que "1 puntos"
  // concordara. El dato es `banda.falta` y la referencia, "la próxima banda".
  assert.match(act, /plural\(banda\.falta, 'punto', 'puntos'\)\} para la próxima banda/,
    'se dejó de decir cuántos puntos faltan para la próxima banda de grasa');
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
