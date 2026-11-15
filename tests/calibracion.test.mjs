import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calibracion, CALIBRACION, KCAL_POR_KG_GRASA, FASES, faseDe } from '../js/calorias.js';
import { daysBetween, addDays } from '../js/utils.js';

// La app calcula el gasto con un modelo —basal por fórmula, METs de tabla—
// que nunca midió a este usuario. El peso en el tiempo sí, y está guardado.
// calibracion() es el único control de calidad que la app puede hacerse.

const INICIO = '2026-10-17';
/** Mediciones con una pendiente exacta de kg por día. */
const serie = (kgPorDia, n = 4, cada = 7, peso0 = 61.6) =>
  Array.from({ length: n }, (_, i) => ({
    date: addDays(INICIO, i * cada),
    weight: Math.round((peso0 + kgPorDia * i * cada) * 1000) / 1000,
  }));

const cal = (m, delta) => calibracion(m, delta, daysBetween);

test('traduce la pendiente del peso a kcal por día', () => {
  // Medio kilo por semana son 7.700/2 kcal repartidas en siete días.
  const c = cal(serie(-0.5 / 7), 0);
  assert.equal(c.medido, -Math.round(KCAL_POR_KG_GRASA * 0.5 / 7));
  assert.equal(c.kgPorSemana, -0.5);
  assert.equal(c.dias, 21);
  assert.equal(c.mediciones, 4);
});

test('el peso quieto es déficit cero, no "sin datos"', () => {
  const c = cal(serie(0), 0);
  assert.equal(c.medido, 0);
  assert.equal(c.coincide, true, 'cero contra cero tiene que coincidir');
});

test('mide la distancia entre lo que la app asume y lo que pasó', () => {
  // La app promete 400 de déficit; el peso dice que sólo hubo 138.
  const reales = [
    { date: '2026-10-17', weight: 61.6 }, { date: '2026-10-24', weight: 61.5 },
    { date: '2026-11-02', weight: 61.35 }, { date: '2026-11-08', weight: 61.2 },
  ];
  const c = cal(reales, -400);
  assert.equal(c.asumido, -400);
  assert.ok(c.medido > -200 && c.medido < -100, `medido fuera de rango: ${c.medido}`);
  assert.ok(c.diferencia > 200, 'no detectó que el modelo exagera');
  assert.equal(c.coincide, false);
  // Y con la fase que sí corresponde a esos datos, el modelo acierta.
  assert.equal(cal(reales, -200).coincide, true);
});

test('usa la pendiente de todas las mediciones, no la primera contra la última', () => {
  // Mismo principio y mismo final; en el medio, un día de agua. La pendiente
  // apenas se mueve; primera-contra-última no vería ninguna diferencia y
  // tampoco vería la que sí importa.
  const limpia = [
    { date: '2026-10-17', weight: 62 }, { date: '2026-10-24', weight: 61.7 },
    { date: '2026-10-31', weight: 61.4 }, { date: '2026-11-07', weight: 61.1 },
  ];
  const conRuido = [
    { date: '2026-10-17', weight: 62 }, { date: '2026-10-24', weight: 62.6 },
    { date: '2026-10-31', weight: 60.5 }, { date: '2026-11-07', weight: 61.1 },
  ];
  // Con datos perfectamente lineales la pendiente da lo mismo que los
  // extremos (que acá se calculan a mano: dos puntos no pasan el mínimo).
  const porExtremos = Math.round(((61.1 - 62) / 21) * KCAL_POR_KG_GRASA);
  assert.equal(cal(limpia, 0).medido, porExtremos);
  assert.notEqual(cal(conRuido, 0).medido, cal(limpia, 0).medido,
    'la pendiente ignoró por completo los puntos del medio');
});

test('mira sólo la ventana reciente, no todo el historial', () => {
  // Es el caso real que lo motivó: una medición de hace casi dos meses, de
  // antes de cambiar nada, arrastraba la pendiente y la app decía "estás
  // subiendo de peso" cuando hacía tres semanas que bajaba.
  const vieja = { date: '2026-09-21', weight: 60.5 };
  const recientes = [
    { date: '2026-10-17', weight: 61.6 }, { date: '2026-10-24', weight: 61.5 },
    { date: '2026-11-02', weight: 61.35 }, { date: '2026-11-08', weight: 61.2 },
  ];
  const solas = cal(recientes, -200);
  const conVieja = cal([vieja, ...recientes], -200);
  assert.equal(conVieja.medido, solas.medido, 'la medición vieja movió el resultado');
  assert.equal(conVieja.mediciones, recientes.length, 'contó una medición fuera de ventana');
  assert.ok(solas.kgPorSemana < 0, 'el peso de las últimas semanas viene bajando');
  // Y el control: con las cinco juntas la pendiente diría lo contrario.
  const todasSinTecho = (61.2 - 60.5) / 48;
  assert.ok(todasSinTecho > 0, 'el test no probaría nada si el historial completo no subiera');
});

test('no opina con una ventana corta ni con pocas mediciones', () => {
  assert.equal(cal(serie(-0.05, 4, 3), 0), null, '12 días no alcanzan');
  assert.equal(cal(serie(-0.05, 2, 30), 0), null, 'dos mediciones no son una tendencia');
  assert.equal(cal([], 0), null);
  assert.equal(cal(null, 0), null);
  assert.ok(CALIBRACION.dias >= 21, 'menos de tres semanas es ruido de agua');
  assert.ok(CALIBRACION.maxDias >= CALIBRACION.dias * 2, 'la ventana no deja entrar un mínimo holgado');
  // Mediciones viejas y una sola reciente: la ventana se queda sin puntos.
  assert.equal(cal([{ date: '2026-01-01', weight: 62 }, { date: '2026-01-08', weight: 62 },
    { date: '2026-11-08', weight: 61 }], 0), null, 'armó una pendiente con un solo punto en ventana');
  // Y el caso que el mínimo de días no alcanza a tapar: tres mediciones en
  // total, dos dentro de la ventana y con sobrada distancia entre ellas.
  // Si el mínimo no se revalida DESPUÉS de recortar, esto devuelve una
  // pendiente trazada con dos puntos.
  assert.equal(cal([{ date: '2026-01-01', weight: 64 }, { date: '2026-10-01', weight: 62 },
    { date: '2026-11-08', weight: 61 }], 0), null,
  'el mínimo de mediciones no se revalidó después de recortar la ventana');
});

test('descarta mediciones sin peso en vez de tomarlas como cero', () => {
  // Una medición de sólo cintura no es un día en que pesaste cero kilos.
  const con = serie(-0.05);
  const sucia = [...con];
  sucia.splice(2, 0, { date: '2026-10-29', weight: 0 });
  assert.equal(cal(sucia, 0).medido, cal(con, 0).medido);
  assert.equal(cal(sucia, 0).mediciones, con.length);
});

test('el margen evita perseguir ruido', () => {
  const casi = cal(serie(-(CALIBRACION.margen * 0.5) / KCAL_POR_KG_GRASA), 0);
  assert.equal(casi.coincide, true, 'media diferencia de margen no es una señal');
  const real = cal(serie(-(CALIBRACION.margen * 3) / KCAL_POR_KG_GRASA), 0);
  assert.equal(real.coincide, false, 'el triple del margen sí lo es');
});

/* ---------------------------------------------------------------------------
   La fase intermedia
   --------------------------------------------------------------------------- */

test('hay una fase entre mantener y bajar', () => {
  // Sin ella el salto era de 0 a -400: un déficit del 17% sobre un gasto de
  // 2.300, donde la grasa baja pero el músculo no se construye.
  const deltas = Object.values(FASES).map((f) => f.delta);
  const intermedia = deltas.filter((d) => d < 0 && d > -400);
  assert.equal(intermedia.length, 1, 'falta (o sobra) el escalón intermedio');
  assert.equal(FASES.recomponer.delta, -200);
});

test('recomponer pide tanta proteína como bajar', () => {
  // En déficit la proteína es lo que protege el músculo, y recomponer existe
  // justamente para no perderlo.
  assert.equal(FASES.recomponer.proteina, FASES.bajar.proteina);
  assert.ok(FASES.recomponer.proteina > FASES.mantener.proteina);
});

test('las fases van ordenadas de más comida a menos', () => {
  const deltas = Object.values(FASES).map((f) => f.delta);
  const ordenado = [...deltas].sort((a, b) => b - a);
  assert.deepEqual(deltas, ordenado, 'el selector dejó de leerse como una escala');
});

test('una fase desconocida no rompe nada', () => {
  assert.equal(faseDe({ fase: 'recomponer' }), 'recomponer');
  assert.ok(FASES[faseDe({ fase: 'loquesea' })]);
});

test('el selector se acomoda cuando hay más de tres fases', () => {
  // Cuatro nombres en una fila de teléfono parten "Ganar músculo" al medio.
  const vista = readFileSync('js/views/settings.js', 'utf8');
  assert.match(vista, /segmento--grilla/, 'el selector no cambia de forma con cuatro opciones');
  assert.match(readFileSync('css/styles.css', 'utf8'),
    /\.segmento--grilla \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});

test('la vista del cuerpo muestra la calibración', () => {
  const vista = readFileSync('js/views/activity.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  // La llamada, no la definición: `function tarjetaDeCalibracion(mediciones,
  // perfil)` también matchea el nombre, así que una guarda sobre el nombre
  // pelado pasa igual aunque nadie la invoque.
  assert.match(vista, /const cal = tarjetaDeCalibracion\(mediciones, perfil\);/,
    'la tarjeta existe pero no se llama desde ningún lado');
  assert.match(vista, /if \(cal\) root\.append\(cal\);/,
    'se calcula la tarjeta y no se agrega a la pantalla');
  // Antes comparaba contra el delta de la fase de hoy. Ahora compara contra
  // las fases que rigieron en la ventana; la de hoy sólo cubre lo que no
  // tiene historia.
  assert.match(vista, /fasesEnVentana\(perfil\?\.faseHistory, fase, desde, hasta, daysBetween\)/,
    'la tarjeta dejó de comparar contra las fases de la ventana');
});

test('las frases de bandas concuerdan con su número', () => {
  // "Te faltan 1 puntos para la próxima banda" aparecía justo cuando estás a
  // un punto, que es cuando más se lee esa frase. Pasaba en las dos bandas:
  // la de grasa corporal y la de FFMI.
  const vista = readFileSync('js/views/activity.js', 'utf8');
  assert.ok(!/Te faltan \$\{formatNumber\(banda\.falta\)\} puntos para la próxima banda/.test(vista),
    'volvió el plural fijo en la banda de grasa corporal');
  assert.ok(!/\$\{formatNumber\(banda\.falta\)\} puntos de FFMI/.test(vista),
    'volvió el plural fijo en la frase del FFMI');
  assert.match(vista, /uno \? 'falta' : 'faltan'/, 'el verbo dejó de concordar');
  // Con "de FFMI" pegado: las dos bandas usan plural(banda.falta, …) ahora,
  // así que la guarda pelada pasa aunque se rompa justo ésta.
  assert.match(vista, /plural\(banda\.falta, 'punto', 'puntos'\)\} de FFMI/,
    'el sustantivo dejó de concordar en la banda de FFMI');
  assert.match(vista, /unKg \? 'es un' : 'son unos'/, 'los kilos dejaron de concordar');
});

// ─────────────────────────────────────────────────────────────────────────
// Cambiar de fase a mitad de la ventana
//
// La calibración mira hasta seis semanas de balanza. Si en el medio pasaste
// de "bajar" a "recomponer", comparar todo contra el −200 de hoy es comparar
// contra un déficit que sólo existió al final.
// ─────────────────────────────────────────────────────────────────────────

const { anotarFase, fasesEnVentana } = await import('../js/calorias.js');
const { ANTES_DE_TODO } = await import('../js/derive.js');
const { enLista } = await import('../js/utils.js');

const ventana = (historia, actual, desde, hasta) =>
  fasesEnVentana(historia, actual, desde, hasta, daysBetween);

test('el primer cambio de fase deja escrita también la de antes', () => {
  const h = anotarFase({ fase: 'bajar' }, 'recomponer', '2026-11-08');
  assert.deepEqual(h, [
    { from: ANTES_DE_TODO, fase: 'bajar' },
    { from: '2026-11-08', fase: 'recomponer' },
  ]);
});

test('sin fase guardada, la de antes es la de por defecto', () => {
  const h = anotarFase({}, 'bajar', '2026-11-08');
  assert.equal(h[0].fase, faseDe({}));
  assert.equal(h[0].from, ANTES_DE_TODO);
});

test('elegir la misma fase, o una que no existe, no escribe nada', () => {
  assert.equal(anotarFase({ fase: 'bajar' }, 'bajar', '2026-11-08'), null);
  assert.equal(anotarFase({ fase: 'bajar' }, 'volar', '2026-11-08'), null);
  // Sin fase guardada rige la de por defecto: elegirla no es un cambio.
  assert.equal(anotarFase({}, faseDe({}), '2026-11-08'), null);
});

test('dos cambios el mismo día son uno solo, y vale el último', () => {
  const uno = anotarFase({ fase: 'bajar' }, 'mantener', '2026-11-08');
  const dos = anotarFase({ fase: 'mantener', faseHistory: uno }, 'recomponer', '2026-11-08');
  assert.deepEqual(dos, [
    { from: ANTES_DE_TODO, fase: 'bajar' },
    { from: '2026-11-08', fase: 'recomponer' },
  ]);
  // Y no tocó la historia que recibió.
  assert.equal(uno[1].fase, 'mantener');
});

test('los cambios siguientes se agregan en orden y no repiten la semilla', () => {
  const uno = anotarFase({ fase: 'bajar' }, 'recomponer', '2026-11-01');
  const dos = anotarFase({ fase: 'recomponer', faseHistory: uno }, 'mantener', '2026-11-10');
  assert.deepEqual(dos.map((t) => t.fase), ['bajar', 'recomponer', 'mantener']);
  assert.deepEqual(dos.map((t) => t.from), [ANTES_DE_TODO, '2026-11-01', '2026-11-10']);
});

test('sin historia, toda la ventana es la fase de hoy', () => {
  const v = ventana(undefined, 'bajar', '2026-10-17', '2026-11-07');
  assert.equal(v.delta, FASES.bajar.delta);
  assert.deepEqual(v.tramos, [{ fase: 'bajar', dias: 21 }]);
});

test('con un cambio adentro, el delta es el promedio pesado por días', () => {
  // 14 días bajando (−400) y 7 recomponiendo (−200): (14·400 + 7·200) / 21.
  const h = [{ from: ANTES_DE_TODO, fase: 'bajar' }, { from: '2026-10-31', fase: 'recomponer' }];
  const v = ventana(h, 'recomponer', '2026-10-17', '2026-11-07');
  assert.deepEqual(v.tramos, [{ fase: 'bajar', dias: 14 }, { fase: 'recomponer', dias: 7 }]);
  assert.ok(Math.abs(v.delta - (-(14 * 400 + 7 * 200) / 21)) < 1e-9, `delta: ${v.delta}`);
});

test('una fase que empieza el día de la última medición todavía no aportó nada', () => {
  // Te pesaste el 7 y ese mismo día cambiaste: ese peso es de lo comido antes.
  const h = [{ from: ANTES_DE_TODO, fase: 'bajar' }, { from: '2026-11-07', fase: 'recomponer' }];
  const v = ventana(h, 'recomponer', '2026-10-17', '2026-11-07');
  assert.deepEqual(v.tramos, [{ fase: 'bajar', dias: 21 }]);
  assert.equal(v.delta, FASES.bajar.delta);
});

test('un cambio posterior a la ventana no cuenta, y uno anterior la cubre entera', () => {
  const despues = [{ from: ANTES_DE_TODO, fase: 'bajar' }, { from: '2026-11-20', fase: 'subir' }];
  assert.equal(ventana(despues, 'subir', '2026-10-17', '2026-11-07').delta, FASES.bajar.delta);
  const antes = [{ from: ANTES_DE_TODO, fase: 'bajar' }, { from: '2026-09-01', fase: 'subir' }];
  assert.deepEqual(ventana(antes, 'subir', '2026-10-17', '2026-11-07').tramos, [{ fase: 'subir', dias: 21 }]);
});

test('ir y volver a la misma fase suma sus días en un solo renglón', () => {
  const h = [
    { from: ANTES_DE_TODO, fase: 'bajar' },
    { from: '2026-10-24', fase: 'mantener' },
    { from: '2026-10-31', fase: 'bajar' },
  ];
  const v = ventana(h, 'bajar', '2026-10-17', '2026-11-07');
  assert.deepEqual(v.tramos, [{ fase: 'bajar', dias: 14 }, { fase: 'mantener', dias: 7 }]);
  assert.ok(Math.abs(v.delta - (-(14 * 400) / 21)) < 1e-9);
});

test('los tramos sucios se ignoran, y lo anterior al primero vale como hoy', () => {
  const h = [
    { from: '', fase: 'subir' }, { from: '2026-10-20', fase: 'volar' }, null,
    { from: '2026-10-31', fase: 'recomponer' },
  ];
  const v = ventana(h, 'mantener', '2026-10-17', '2026-11-07');
  assert.deepEqual(v.tramos, [{ fase: 'mantener', dias: 14 }, { fase: 'recomponer', dias: 7 }]);
});

test('los tramos desordenados se leen en orden', () => {
  const h = [{ from: '2026-10-31', fase: 'recomponer' }, { from: ANTES_DE_TODO, fase: 'bajar' }];
  const v = ventana(h, 'recomponer', '2026-10-17', '2026-11-07');
  assert.deepEqual(v.tramos, [{ fase: 'bajar', dias: 14 }, { fase: 'recomponer', dias: 7 }]);
});

test('calibracion() acepta el delta como función de la ventana que usó', () => {
  // Cinco mediciones, la primera fuera del techo: la ventana real empieza en
  // la segunda, y la función tiene que recibir ESA fecha y no la primera.
  const m = [
    { date: '2026-08-01', weight: 63 },
    ...serie(-0.2 / 7),
  ];
  let visto = null;
  const c = calibracion(m, (desde, hasta) => { visto = { desde, hasta }; return -300; }, daysBetween);
  assert.deepEqual(visto, { desde: INICIO, hasta: addDays(INICIO, 21) });
  assert.equal(c.asumido, -300);
  assert.equal(c.desde, INICIO);
  assert.equal(c.hasta, addDays(INICIO, 21));
});

test('el caso real: balanza de −140 con dos semanas en bajar y una en recomponer', () => {
  const reales = [
    { date: '2026-10-17', weight: 61.6 }, { date: '2026-10-24', weight: 61.5 },
    { date: '2026-11-02', weight: 61.35 }, { date: '2026-11-08', weight: 61.2 },
  ];
  const h = [{ from: ANTES_DE_TODO, fase: 'bajar' }, { from: '2026-11-02', fase: 'recomponer' }];
  const c = calibracion(reales, (d, a) => ventana(h, 'recomponer', d, a).delta, daysBetween);
  // 16 días a −400 y 6 a −200 sobre 22: −345, no los −200 de hoy.
  assert.equal(c.asumido, Math.round(-(16 * 400 + 6 * 200) / 22));
  assert.equal(c.coincide, false, 'contra el promedio real el modelo sigue sin acertar');
  // Con el −200 plano de antes habría dicho que acertaba.
  assert.equal(calibracion(reales, -200, daysBetween).coincide, true);
});

test('la tarjeta calcula lo asumido con la historia de fases, no con la de hoy', () => {
  const vista = readFileSync(new URL('../js/views/activity.js', import.meta.url), 'utf8');
  const cuerpo = vista.slice(vista.indexOf('function tarjetaDeCalibracion('));
  const tarjeta = cuerpo.slice(0, cuerpo.indexOf('\nfunction ', 10));
  assert.match(tarjeta, /fasesEnVentana\(perfil\?\.faseHistory, fase, desde, hasta, daysBetween\)/);
  assert.doesNotMatch(tarjeta, /calibracion\(mediciones, FASES\[fase\]\.delta/);
  assert.match(tarjeta, /Cambiaste de fase/);
});

test('guardar la fase pasa por anotarFase', () => {
  const estado = readFileSync(new URL('../js/state.js', import.meta.url), 'utf8');
  const cuerpo = estado.slice(estado.indexOf('export function updateSettings('));
  const fn = cuerpo.slice(0, cuerpo.indexOf('\nexport function ', 10));
  assert.match(fn, /anotarFase\(d\.settings, patch\.fase, todayKey\(\)\)/);
  assert.match(fn, /d\.settings\.faseHistory = historia/);
  // La historia se anota ANTES de pisar la fase: después ya no hay "vieja".
  assert.ok(fn.indexOf('anotarFase(') < fn.indexOf('Object.assign(d.settings, patch)'));
});

test('enLista enumera como se dice en voz alta', () => {
  assert.equal(enLista([]), '');
  assert.equal(enLista(['a']), 'a');
  assert.equal(enLista(['a', 'b']), 'a y b');
  assert.equal(enLista(['a', 'b', 'c']), 'a, b y c');
  assert.equal(enLista(['a', null, 'c']), 'a y c');
});

test('anotar una fase deja la historia en orden aunque viniera desordenada', () => {
  // Una historia que llegó al revés (una copia vieja fusionada, por ejemplo).
  const sucia = [{ from: '2026-10-01', fase: 'mantener' }, { from: ANTES_DE_TODO, fase: 'bajar' }];
  const h = anotarFase({ fase: 'mantener', faseHistory: sucia }, 'recomponer', '2026-11-08');
  assert.deepEqual(h.map((t) => t.from), [ANTES_DE_TODO, '2026-10-01', '2026-11-08']);
});
