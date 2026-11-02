import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rangoDe, ordenarPorXp, resumenDeDisciplina } from '../js/analisis.js';

const vista = readFileSync('js/views/analisis.js', 'utf8');
const stats = readFileSync('js/views/stats.js', 'utf8');
const css = readFileSync('css/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------------------------------------------------------------------------
   El rango, que eran dos nombres del mismo escalón
   --------------------------------------------------------------------------- */

test('el gimnasio tiene un solo rango, no dos en desacuerdo', () => {
  // "Atleta" e "Intermedio" salían del mismo index: derive calcula el escalón
  // con nivelGeneral(strength) y después lo bautiza con el tierNames de la
  // actividad. Mostrarlos como dos chips iguales se leía como un error.
  const gym = rangoDe({ tier: { name: 'Atleta' }, strengthOverall: { name: 'Intermedio' } });
  assert.equal(gym.nombre, 'Atleta', 'manda el nombre de la app, que es el que usan todas');
  assert.equal(gym.tambien, 'Intermedio', 'se perdió el nombre de la escala de fuerza');
});

test('cuando las dos palabras coinciden no se dice dos veces', () => {
  const r = rangoDe({ tier: { name: 'Nak Su' }, strengthOverall: { name: 'Nak Su' } });
  assert.equal(r.tambien, null);
  assert.equal(rangoDe({ tier: { name: 'Analista' } }).tambien, null);
});

test('sin rango no se inventa uno', () => {
  assert.equal(rangoDe({}), null);
  assert.equal(rangoDe(null), null);
  assert.equal(rangoDe({ tier: {} }), null);
});

/* ---------------------------------------------------------------------------
   El orden de la lista
   --------------------------------------------------------------------------- */

test('la lista va de más a menos XP', () => {
  const dada = [{ xp: 100 }, { xp: 9000 }, { xp: 500 }];
  assert.deepEqual(ordenarPorXp(dada).map((s) => s.xp), [9000, 500, 100]);
});

test('ordenar no toca la lista que le pasaron', () => {
  // `sort` ordena en el lugar. El filtro va primero justamente por eso: lo que
  // recibimos es el estado vivo de la app, y reordenarlo movería el tablero de
  // Hoy, que depende del orden del catálogo.
  const dada = [{ xp: 100 }, { xp: 9000 }, { xp: 500 }];
  ordenarPorXp(dada);
  assert.deepEqual(dada.map((s) => s.xp), [100, 9000, 500], 'ordenar pisó la lista original');
});

test('un hábito sin nivel no se rankea', () => {
  // El agua tiene leveled: false. Ponerla en un ranking de XP es compararla
  // con algo que no mide lo mismo.
  const salida = ordenarPorXp([{ xp: 10, leveled: false }, { xp: 5, leveled: true }]);
  assert.deepEqual(salida.map((s) => s.xp), [5]);
  assert.deepEqual(ordenarPorXp([]), []);
  assert.deepEqual(ordenarPorXp(null), []);
});

test('empatados, mandan en el orden en que venían', () => {
  const salida = ordenarPorXp([{ xp: 7, id: 'a' }, { xp: 7, id: 'b' }]);
  assert.deepEqual(salida.map((s) => s.id), ['a', 'b']);
});

/* ---------------------------------------------------------------------------
   La línea de abajo
   --------------------------------------------------------------------------- */

test('el total se dice en el idioma de cada disciplina', () => {
  const linea = (kind, unit, total) => resumenDeDisciplina(
    { activity: { kind, unit }, level: { level: 4 }, xp: 2459, total });
  assert.equal(linea('gym', 'series', 677), 'Nivel 4 · 2.459 XP · 677 series en total');
  assert.equal(linea('writing', 'posts', 4), 'Nivel 4 · 2.459 XP · 4 posts en total');
  assert.equal(linea('body', 'mediciones', 4), 'Nivel 4 · 2.459 XP · 4 mediciones en total');
  assert.equal(linea('number', 'pasos', 7129845), 'Nivel 4 · 2.459 XP · 7.129.845 pasos en total');
});

test('uno solo va en singular', () => {
  // "1 mediciones" ya nos mordió una vez.
  const linea = (kind, unit) => resumenDeDisciplina(
    { activity: { kind, unit }, level: { level: 1 }, xp: 0, total: 1 });
  assert.match(linea('body', 'mediciones'), /1 medición en total$/);
  assert.match(linea('writing', 'posts'), /1 post en total$/);
  assert.match(linea('gym', 'series'), /1 serie en total$/);
});

test('sin actividad no revienta', () => {
  assert.equal(resumenDeDisciplina({}), '');
  assert.equal(resumenDeDisciplina(null), '');
});

/* ---------------------------------------------------------------------------
   Que las dos secciones no vuelvan a separarse
   --------------------------------------------------------------------------- */

test('Progreso arma la lista de disciplinas en un solo lugar', () => {
  assert.ok(vista.includes("text: 'Tus disciplinas'"), 'la sección perdió su título');
  assert.ok(!stats.includes('Tus disciplinas'),
    'stats.js volvió a armar su propia lista de disciplinas: son las mismas filas dos veces');
  assert.ok(!/byActivity\.values\(\)[\s\S]{0,200}sort/.test(stats),
    'stats.js volvió a rankear actividades por su cuenta');
});

test('la fila sin análisis es un link y la que tiene se despliega', () => {
  // Un <details> que no abre nada se lee como que la app se colgó, y un <a>
  // que no navega, igual. El tipo de elemento dice qué hace.
  assert.ok(vista.includes("el('a', {\n      class: 'analisis analisis--link'"),
    'la fila sin análisis dejó de ser un link');
  assert.ok(vista.includes("el('details', { class: 'analisis'"),
    'la fila con análisis dejó de desplegarse');
  assert.ok(css.includes('.analisis--link'), 'la fila-link no tiene estilo');
});

test('el link al detalle vive adentro del desplegable', () => {
  // En el resumen competiría con el despliegue por el mismo toque, que es el
  // problema que tenían las dos secciones juntas.
  const cuerpo = vista.slice(vista.indexOf("class: 'analisis__cuerpo'"));
  const corte = cuerpo.indexOf('\n}');
  assert.ok(cuerpo.slice(0, corte).includes('analisis__ir'),
    'el link al detalle se fue del cuerpo del desplegable');
  const cab = vista.slice(vista.indexOf("class: 'analisis__cab'"));
  assert.ok(!cab.slice(0, cab.indexOf('\n')).includes('href'),
    'el resumen volvió a navegar: dos acciones peleando por el mismo toque');
});

test('el desplegable no repite lo que ya dice la fila', () => {
  // Abría con "Nivel 11 · Nak Su. 91h 30m acumuladas.", que es palabra por
  // palabra el renglón de arriba.
  const f = vista.slice(vista.indexOf('function dondeEstas(st) {'));
  assert.match(f.slice(0, f.indexOf('\n}')), /^function dondeEstas\(st\) \{\s*\n\s*if \(!st\.strengthOverall\) return null;/,
    'dondeEstas volvió a escribir el nivel y el total que ya están en la fila');
});

test('la fila lleva barra, rango y acumulado', () => {
  for (const clase of ['analisis__main', 'analisis__linea', 'analisis__barra', 'analisis__flecha']) {
    assert.ok(vista.includes(clase), `la fila no usa ${clase}`);
    assert.ok(css.includes(`.${clase}`), `${clase} no tiene estilo`);
  }
  assert.ok(vista.includes('resumenDeDisciplina(st)'), 'la fila perdió el acumulado');
  assert.ok(vista.includes('xpBar(st.level?.pct'), 'la fila perdió la barra de nivel');
});
