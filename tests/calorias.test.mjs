import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  metabolismoBasal, kcalDeActividad, minutosDePasos, kcalDeMision, gastoDelDia, presupuesto,
  faseDe, FASES, METS, FACTOR_SEDENTARIO, PASOS_YA_CONTADOS, MINUTOS_POR_SERIE,
  gastoDesdeElEstado,
} from '../js/calorias.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

const vista = readFileSync('js/views/today.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const de = (id) => DEFAULT_ACTIVITIES.find((a) => a.id === id);

/* ---------------------------------------------------------------------------
   El metabolismo
   --------------------------------------------------------------------------- */

test('el basal sale de la masa magra, no del peso', () => {
  // Katch-McArdle: 370 + 21,6 × magra. Dos personas de 78 kg con distinta
  // grasa no gastan lo mismo, y la app mide la composición.
  assert.equal(metabolismoBasal(65.8), Math.round(370 + 21.6 * 65.8));
  assert.ok(metabolismoBasal(70) > metabolismoBasal(60), 'más músculo tiene que gastar más');
});

test('sin medición no se inventa un basal', () => {
  assert.equal(metabolismoBasal(0), 0);
  assert.equal(metabolismoBasal(null), 0);
  assert.equal(metabolismoBasal(-5), 0);
});

/* ---------------------------------------------------------------------------
   Lo que cuesta moverse
   --------------------------------------------------------------------------- */

test('se cobra lo que está por encima del reposo, no el total', () => {
  // Esa hora ibas a existir igual: el gasto del reposo ya está en el basal.
  // Cobrar el MET entero lo contaría dos veces.
  const neto = kcalDeActividad(5, 60, 78);
  const bruto = (5 * 3.5 * 78 * 60) / 200;
  assert.ok(neto < bruto);
  assert.equal(Math.round(neto), Math.round(((5 - 1) * 3.5 * 78 * 60) / 200));
});

test('estar en reposo no cuesta nada extra', () => {
  assert.equal(kcalDeActividad(1, 60, 78), 0);
  assert.equal(kcalDeActividad(0.5, 60, 78), 0, 'un MET menor que el reposo no puede dar negativo');
  assert.equal(kcalDeActividad(5, 0, 78), 0);
  assert.equal(kcalDeActividad(5, 60, 0), 0);
});

test('los primeros pasos del día ya están en el factor sedentario', () => {
  // Un día sedentario no son cero pasos: son los que das yendo al baño y a la
  // cocina. Cobrar los diez mil enteros contaría dos veces los primeros tres mil.
  assert.equal(minutosDePasos(PASOS_YA_CONTADOS), 0);
  assert.equal(minutosDePasos(1000), 0);
  assert.equal(minutosDePasos(0), 0);
  assert.equal(minutosDePasos(PASOS_YA_CONTADOS + 1000), 10);
});

/* ---------------------------------------------------------------------------
   Qué misión cuesta qué
   --------------------------------------------------------------------------- */

test('lo que se hace sentado no suma gasto', () => {
  // Piano, francés y análisis de datos ya están adentro del 1,2. Cobrarlos
  // sería inventar calorías que no quemaste.
  for (const id of ['piano', 'frances', 'datos', 'agua', 'cuerpo', 'substack']) {
    assert.equal(kcalDeMision(de(id), 999, 78), 0, `${id} suma gasto y no debería`);
  }
});

test('caminar, pesas y muay thai sí', () => {
  assert.ok(kcalDeMision(de('pasos'), 10000, 78) > 0);
  assert.ok(kcalDeMision(de('gym'), 35, 78) > 0);
  assert.ok(kcalDeMision(de('muaythai'), 90, 78) > 0);
});

test('el gimnasio se cobra por el tiempo que lleva, no por la serie suelta', () => {
  const unaSesion = kcalDeMision(de('gym'), 35, 78);
  assert.equal(Math.round(unaSesion),
    Math.round(kcalDeActividad(METS.gym, 35 * MINUTOS_POR_SERIE, 78)));
  // Una sesión de 35 series da unos 66 minutos: el orden de magnitud que dijo.
  assert.ok(unaSesion > 200 && unaSesion < 450, `dio ${Math.round(unaSesion)} kcal`);
});

test('una misión sin hacer no cuesta nada', () => {
  assert.equal(kcalDeMision(de('pasos'), 0, 78), 0);
  assert.equal(kcalDeMision(null, 100, 78), 0);
});

/* ---------------------------------------------------------------------------
   El día
   --------------------------------------------------------------------------- */

const dia = (valor, meta, fase = 'mantener') => gastoDelDia({
  masaMagra: 65.8, peso: 78, fase,
  misiones: [{ activity: de('pasos'), valor, meta }],
});

test('la proyección cuenta lo que falta como si lo fueras a hacer', () => {
  const g = dia(0, 10000);
  assert.ok(g.proyectado > g.gastado, 'la proyección no mira la meta');
  assert.equal(g.gastado, g.sedentario, 'sin hacer nada, lo gastado es sólo la base');
});

test('pasarse de la meta mueve el número', () => {
  // Es lo que se pidió: más pasos que la meta, más gasto.
  const justo = dia(10000, 10000);
  const pasado = dia(16000, 10000);
  assert.ok(pasado.proyectado > justo.proyectado,
    'caminar de más no cambió la proyección');
  assert.equal(pasado.gastado, pasado.proyectado,
    'con la meta pasada no queda nada por proyectar');
  assert.equal(pasado.partes[0].pasada, true);
});

test('quedarse corto no baja la proyección por debajo de la meta', () => {
  assert.equal(dia(4000, 10000).proyectado, dia(0, 10000).proyectado);
});

test('el objetivo corre el gasto según la fase', () => {
  const mantener = dia(0, 10000, 'mantener');
  assert.equal(mantener.objetivo, mantener.proyectado, 'mantener no puede correr nada');
  assert.equal(dia(0, 10000, 'bajar').objetivo, mantener.proyectado + FASES.bajar.delta);
  assert.equal(dia(0, 10000, 'subir').objetivo, mantener.proyectado + FASES.subir.delta);
  assert.ok(FASES.bajar.delta < 0 && FASES.subir.delta > 0);
});

test('el objetivo nunca baja del metabolismo basal', () => {
  // Un déficit no puede llevarte por debajo de lo que gastás existiendo.
  const g = gastoDelDia({ masaMagra: 20, peso: 40, fase: 'bajar', misiones: [] });
  assert.ok(g.objetivo >= g.basal, `objetivo ${g.objetivo} quedó bajo el basal ${g.basal}`);
});

test('la base sedentaria es el basal por el factor, y nada más', () => {
  const g = gastoDelDia({ masaMagra: 65.8, peso: 78, misiones: [] });
  assert.equal(g.sedentario, Math.round(g.basal * FACTOR_SEDENTARIO));
  assert.equal(g.gastado, g.sedentario);
  assert.deepEqual(g.partes, [], 'un día sin misiones no lista nada');
});

test('sin composición corporal no hay número', () => {
  // Mejor no mostrar nada que mostrar un gasto inventado.
  assert.equal(gastoDelDia({ masaMagra: 0, peso: 78, misiones: [] }), null);
  assert.equal(gastoDelDia({ masaMagra: 60, peso: 0, misiones: [] }), null);
  assert.equal(gastoDelDia(), null);
});

test('el desglose va de mayor a menor', () => {
  const g = gastoDelDia({ masaMagra: 65.8, peso: 78, misiones: [
    { activity: de('pasos'), valor: 0, meta: 10000 },
    { activity: de('muaythai'), valor: 0, meta: 90 },
  ] });
  assert.equal(g.partes[0].id, 'muaythai', 'lo que más pesa tiene que ir primero');
});

/* ---------------------------------------------------------------------------
   La fase
   --------------------------------------------------------------------------- */

test('la fase por defecto es no suponer nada', () => {
  assert.equal(faseDe({}), 'mantener');
  assert.equal(faseDe({ fase: 'inventada' }), 'mantener');
  assert.equal(faseDe(null), 'mantener');
  assert.equal(faseDe({ fase: 'bajar' }), 'bajar');
});

/* ---------------------------------------------------------------------------
   La pantalla
   --------------------------------------------------------------------------- */

test('la tarjeta muestra un solo número, y de dónde sale', () => {
  // Eran tres --proyección, gastado y desglose-- y se actúa sobre uno.
  assert.match(vista, /gastoDesdeElEstado\(/, 'Hoy no calcula el gasto');
  assert.match(vista, /presupuesto\(g, \{/, 'Hoy no calcula el presupuesto');
  assert.match(vista, /formatNumber\(p\.kcal\)/, 'falta el número grande');
  assert.match(vista, /g\.partes\.map/,
    'sin desglose, un número de calorías no se puede discutir');
  assert.match(vista, /function desgloseDeCalorias/,
    'el desglose dejó de estar plegado y vuelve a competir con el número');
  assert.match(vista, /^\s*desgloseDeCalorias\(g, p, fase\)\);$/m,
    'el desglose quedó escrito pero nadie lo pone en la tarjeta');
});

test('sólo se muestra en el día de hoy', () => {
  // En un día pasado la proyección no significa nada: ya pasó.
  assert.match(vista, /viewDate === state\.today\)\s*\{\s*\n\s*const calorias/,
    'la tarjeta aparecería en días viejos, proyectando un día que ya terminó');
});

/* ---------------------------------------------------------------------------
   Lo que hiciste cuenta, estuviera o no en la agenda
   --------------------------------------------------------------------------- */

test('una misión que hoy no tocaba, pero hiciste, se cobra igual', () => {
  // Un muay thai de sábado son 860 kcal. El filtro las descartaba antes de
  // mirar si lo habías hecho, así que comías como un sábado de sofá.
  const sinAgenda = gastoDelDia({ masaMagra: 65.8, peso: 78, fase: 'bajar', misiones: [
    { activity: de('pasos'), valor: 10000, meta: 10000 },
    { activity: de('muaythai'), valor: 90, meta: 0 },
  ] });
  const soloAgenda = gastoDelDia({ masaMagra: 65.8, peso: 78, fase: 'bajar', misiones: [
    { activity: de('pasos'), valor: 10000, meta: 10000 },
  ] });
  assert.ok(sinAgenda.proyectado - soloAgenda.proyectado > 700,
    'el muay thai hecho fuera de agenda no sumó nada');
  const mt = sinAgenda.partes.find((x) => x.id === 'muaythai');
  assert.ok(mt, 'el muay thai no aparece en el desglose');
  assert.equal(mt.pasada, false,
    'sin meta no se puede "superar" nada: el dorado quiere decir que te pasaste');
  assert.equal(mt.fueraDeAgenda, true);
});

test('lo que no tocaba y no hiciste no se proyecta', () => {
  // No se puede proyectar un muay thai que depende de si tus compañeros se
  // coparon: el sábado sigue siendo un sábado hasta que lo cargues.
  const g = gastoDelDia({ masaMagra: 65.8, peso: 78, misiones: [
    { activity: de('muaythai'), valor: 0, meta: 0 },
  ] });
  assert.deepEqual(g.partes, []);
  assert.equal(g.proyectado, g.sedentario);
});

/**
 * Un estado mínimo como el que devuelve derive: lo que gastoDesdeElEstado
 * realmente lee. Antes esto se verificaba leyendo el texto de la función, que
 * pasaba igual si el cálculo quedaba mal.
 */
function estadoFalso({ hoy, registros = {}, descargas = [], actividades }) {
  const activities = actividades || [de('gym'), de('pasos'), de('muaythai')];
  const byActivity = new Map(activities.map((a) => [a.id, {
    byDate: new Map(registros[a.id] ? [[hoy, registros[a.id]]] : []),
  }]));
  return {
    today: hoy,
    descargas,
    activities,
    byActivity,
    composicion: { weight: 78, fatPct: 15.6 },
  };
}

// 2026-11-06 es viernes: pecho y piernas, 35 series. 2026-11-07, sábado: nada.
const VIERNES = '2026-11-06';
const SABADO = '2026-11-07';
// partes no lleva la meta, lleva su costo: la proyección del gimnasio en kcal
// es la huella de cuántas series se proyectaron.
const gymProyectado = (g) => g.partes.find((p) => p.id === 'gym')?.proyectado ?? 0;
const kcalDeSeries = (n) => Math.round(kcalDeMision(de('gym'), n, 78));

test('el adaptador no descarta lo registrado fuera de agenda', () => {
  // Un muay thai de sábado no está en la agenda, pero si lo cargaste la
  // energía se gastó: tiene que aparecer en el gasto del día.
  const estado = estadoFalso({ hoy: SABADO, registros: { muaythai: { value: 1 } } });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'pasos');
  assert.ok(g.partes.some((p) => p.id === 'muaythai'), 'el muay thai de sábado no se cobró');
});

test('lo registrado fuera de agenda se cobra por lo hecho, no por una meta', () => {
  // Un sábado no toca gimnasio. Si igual fuiste y cargaste 10 series, son 10:
  // no se puede proyectar la rutina entera sobre un día que no estaba agendado,
  // porque el número de la mañana serviría para comprar comida que no gastaste.
  const estado = estadoFalso({ hoy: SABADO, registros: { gym: { value: 10 } } });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'pasos');
  assert.equal(gymProyectado(g), kcalDeSeries(10), 'proyectó una meta en un día sin agenda');
  const parte = g.partes.find((p) => p.id === 'gym');
  assert.equal(parte.fueraDeAgenda, true);
  assert.equal(parte.pasada, false, 'sin meta no te podés haber pasado de ella');
});

test('lo que no está en agenda y no se hizo no proyecta nada', () => {
  const estado = estadoFalso({ hoy: SABADO });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'pasos');
  assert.ok(!g.partes.some((p) => p.id === 'muaythai'),
    'un sábado sin muay thai no puede proyectar uno');
});

test('a la mañana el gimnasio proyecta la rutina del día, no la meta genérica', () => {
  // Sin registro todavía. El viernes toca pecho y piernas: 35 series, no las
  // 30 genéricas de la actividad.
  const estado = estadoFalso({ hoy: VIERNES });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'gym');
  assert.equal(gymProyectado(g), kcalDeSeries(35),
    'proyectó la meta genérica en vez de la rutina del viernes');
  assert.notEqual(kcalDeSeries(35), kcalDeSeries(30), 'el test no distinguiría 35 de 30');
});

test('en semana de descarga el gimnasio proyecta la mitad', () => {
  const estado = estadoFalso({ hoy: VIERNES, descargas: ['2026-11-02'] });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'gym');
  assert.equal(gymProyectado(g), kcalDeSeries(18), 'la descarga no bajó la proyección');
  const normal = gastoDesdeElEstado(estadoFalso({ hoy: VIERNES }), {}, (a) => a.id === 'gym');
  assert.ok(g.proyectado < normal.proyectado,
    'una semana de descarga no puede proyectar el mismo gasto que una normal');
});

test('con el día ya registrado manda la meta que guardó derive', () => {
  // derive ya resolvió plantilla y descarga cuando construyó el historial:
  // esa meta gana, para que el pasado se juzgue con la meta de entonces.
  const estado = estadoFalso({ hoy: VIERNES, registros: { gym: { value: 20, goal: 28 } } });
  const g = gastoDesdeElEstado(estado, {}, (a) => a.id === 'gym');
  assert.equal(gymProyectado(g), kcalDeSeries(28));
});

/* ---------------------------------------------------------------------------
   El presupuesto
   --------------------------------------------------------------------------- */

const gastoBase = () => gastoDelDia({ masaMagra: 65.8, peso: 78, fase: 'bajar', misiones: [
  { activity: de('pasos'), valor: 0, meta: 10000 },
] });

test('con comidas fijas, el número es el de la comida variable', () => {
  const p = presupuesto(gastoBase(), { fijoKcal: 1067, fijoProteina: 80, peso: 78, fase: 'bajar' });
  assert.equal(p.kcal, gastoBase().objetivo - 1067);
  assert.equal(p.soloVariable, true);
  assert.equal(p.metaProteina, 156, '2 g/kg en déficit');
  assert.equal(p.proteina, 76);
});

test('sin comidas fijas, el número es el objetivo del día', () => {
  const p = presupuesto(gastoBase(), { peso: 78, fase: 'bajar' });
  assert.equal(p.kcal, gastoBase().objetivo);
  assert.equal(p.soloVariable, false);
  assert.equal(p.proteina, p.metaProteina, 'sin nada descontado, falta todo');
});

test('la proteína sube en déficit', () => {
  // Cuando falta energía, es lo que decide si perdés grasa o músculo.
  const prot = (fase) => presupuesto(gastoBase(), { peso: 78, fase }).metaProteina;
  assert.ok(prot('bajar') > prot('mantener'));
  assert.equal(prot('mantener'), prot('subir'));
});

test('un día flojo no te pide que devuelvas comida', () => {
  const p = presupuesto(gastoBase(), { fijoKcal: 99999, fijoProteina: 9999, peso: 78 });
  assert.equal(p.kcal, 0);
  assert.equal(p.proteina, 0);
});

test('sin gasto no hay presupuesto', () => {
  assert.equal(presupuesto(null, { peso: 78 }), null);
});
