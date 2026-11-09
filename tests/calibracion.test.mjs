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
    /\.segmento--grilla \{[^}]*grid-template-columns: 1fr 1fr/);
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
  assert.match(vista, /calibracion\(mediciones, FASES\[fase\]\.delta, daysBetween\)/,
    'la tarjeta dejó de comparar contra la fase elegida');
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
