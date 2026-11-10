import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanas, esDescarga, metaDeDescarga, tocaDescarga, queTocaHoy, estancados,
  ESTADOS, CADA_CUANTAS_SEMANAS,
} from '../js/descargas.js';
import { readFileSync } from 'node:fs';
import { derive, metaDelDia } from '../js/derive.js';
import { DEFAULT_ACTIVITIES, templateForDay, plannedSets } from '../js/config.js';

const gym = DEFAULT_ACTIVITIES.find((a) => a.id === 'gym');
const LUNES = '2026-11-23';
const MIERCOLES = '2026-11-25';

// ---------------------------------------------------------------------------
// La semana
// ---------------------------------------------------------------------------

test('una descarga declarada cualquier día cubre la semana entera', () => {
  // Se guarda el lunes, no el día: declararla un miércoles tiene que cubrir
  // el lunes que ya entrenaste.
  assert.deepEqual(semanas([MIERCOLES]), [LUNES]);
  assert.equal(esDescarga([MIERCOLES], LUNES), true, 'el lunes anterior');
  assert.equal(esDescarga([MIERCOLES], '2026-11-27'), true, 'y el viernes');
  assert.equal(esDescarga([MIERCOLES], '2026-11-30'), false, 'pero no la siguiente');
});

test('declarar dos veces la misma semana no la duplica', () => {
  assert.deepEqual(semanas([LUNES, MIERCOLES, '2026-11-27']), [LUNES]);
});

test('una fecha inválida se ignora en vez de romper', () => {
  assert.deepEqual(semanas(['no es fecha', null, undefined, '']), []);
  assert.deepEqual(semanas(null), []);
  assert.equal(esDescarga([LUNES], 'cualquier cosa'), false);
});

test('la meta de descarga es la mitad, redondeada para arriba', () => {
  // Para arriba porque la mitad de 35 es 17,5: pedir 17 sería pedir menos de
  // la mitad, y una serie de más no arruina una descarga.
  assert.equal(metaDeDescarga(39), 20);
  assert.equal(metaDeDescarga(45), 23);
  assert.equal(metaDeDescarga(35), 18);
});

test('una meta rota no devuelve una meta negativa ni cero exigible', () => {
  assert.equal(metaDeDescarga(0), 0);
  assert.equal(metaDeDescarga(-5), 0);
  assert.equal(metaDeDescarga(1), 1, 'nunca pide menos de una serie');
});

// ---------------------------------------------------------------------------
// Lo que hace que valga la pena: el día cuenta como cumplido
// ---------------------------------------------------------------------------

const sesionParcial = (parte) => {
  const t = templateForDay(1);
  return {
    templateId: t.id,
    meta: plannedSets(t),
    exercises: t.exercises.slice(0, Math.ceil(t.exercises.length * parte)).map((ex) => ({
      name: ex.name,
      sets: [{ weight: 40, reps: 10 }, { weight: 40, reps: 10 }, { weight: 40, reps: 10 }],
    })),
  };
};
const estado = (descargas) => derive({
  activities: [gym], entries: { [LUNES]: { gym: sesionParcial(0.5) } }, unlocked: {}, descargas,
}, LUNES).byActivity.get('gym').byDate.get(LUNES);

test('media sesión en semana de descarga es un día cumplido', () => {
  // Es la razón de ser de todo esto: sin esta parte, una descarga bien hecha
  // aparecía como tres días incompletos y la app empujaba a hacer series de
  // más, que es exactamente lo contrario de descargar.
  const dia = estado([LUNES]);
  assert.equal(dia.goal, metaDeDescarga(plannedSets(templateForDay(1))));
  assert.equal(dia.met, true);
  assert.ok(dia.xp >= 100, `esperaba la XP entera, obtuve ${dia.xp}`);
});

test('la misma media sesión sin declarar la descarga queda incompleta', () => {
  // El control del test anterior: si esto también diera cumplido, la descarga
  // no estaría haciendo nada.
  const dia = estado([]);
  assert.equal(dia.met, false);
  assert.ok(dia.xp < 100);
});

test('la descarga sólo le baja la meta al gimnasio', () => {
  // Es una decisión de entrenamiento con fierros: el agua, los pasos y el
  // francés no tienen por qué bajar porque descargues en el gimnasio.
  const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
  const d = derive({
    activities: [agua], entries: { [LUNES]: { agua: { value: 1100 } } },
    unlocked: {}, descargas: [LUNES], settings: { weight: 62 },
  }, LUNES).byActivity.get('agua').byDate.get(LUNES);
  assert.equal(d.met, false, 'media meta de agua sigue siendo media meta');
});

// ---------------------------------------------------------------------------
// Cuándo conviene
// ---------------------------------------------------------------------------

const semanasSeguidas = (n, desde = '2026-09-07') => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${desde}T00:00:00`);
  d.setDate(d.getDate() + i * 7);
  return d.toISOString().slice(0, 10);
});

test('no se recomienda nada antes de tiempo', () => {
  const pocas = semanasSeguidas(CADA_CUANTAS_SEMANAS - 1);
  assert.equal(tocaDescarga(pocas, [], pocas[pocas.length - 1]), null);
});

test('se recomienda por calendario después de varias semanas seguidas', () => {
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 1);
  const r = tocaDescarga(muchas, [], muchas[muchas.length - 1]);
  assert.equal(r.motivo, 'calendario');
  assert.ok(r.semanas >= CADA_CUANTAS_SEMANAS);
});

test('la cuenta arranca de nuevo después de una descarga', () => {
  // Si no, una vez cumplidas las semanas la recomendación no se iría nunca.
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 2);
  const haceUna = muchas[muchas.length - 2];
  assert.equal(tocaDescarga(muchas, [haceUna], muchas[muchas.length - 1]), null);
});

test('en una semana que ya es de descarga no se recomienda descargar', () => {
  const muchas = semanasSeguidas(CADA_CUANTAS_SEMANAS + 1);
  const hoy = muchas[muchas.length - 1];
  assert.equal(tocaDescarga(muchas, [hoy], hoy), null);
});

test('el estancamiento se recomienda aunque el calendario no lo pida', () => {
  // Es la señal de verdad: querer sumar una repetición y no poder, dos veces
  // seguidas, es fatiga y no el techo.
  const pocas = semanasSeguidas(2);
  const r = tocaDescarga(pocas, [], pocas[1], { estancados: ['Pecho plano', 'Sentadilla con barra'] });
  assert.equal(r.motivo, 'estancamiento');
  assert.deepEqual(r.ejercicios, ['Pecho plano', 'Sentadilla con barra']);
});

test('un solo ejercicio estancado no pide descargar todo', () => {
  // Ese se baja solo, un 10 %, sin tocar el resto del programa.
  const pocas = semanasSeguidas(2);
  assert.equal(tocaDescarga(pocas, [], pocas[1], { estancados: ['Pecho plano'] }), null);
});

test('sin historial no se recomienda nada', () => {
  assert.equal(tocaDescarga([], [], LUNES), null);
  assert.equal(tocaDescarga(null, [], LUNES), null);
  assert.equal(tocaDescarga(['2026-11-23'], [], 'no es fecha'), null);
});

// ---------------------------------------------------------------------------
// El estancamiento
// ---------------------------------------------------------------------------

const sesionDe = (kg, reps) => ({
  entry: { exercises: [{ name: 'Pecho plano', sets: [{ weight: kg, reps }] }] },
});

test('un ejercicio que progresa no figura como estancado', () => {
  assert.deepEqual(estancados([sesionDe(60, 8), sesionDe(60, 9), sesionDe(60, 10)]), []);
});

test('sumar repeticiones cuenta como progreso, no sólo subir el peso', () => {
  // Tres series de 60×10 progresaron respecto de 60×9 aunque el peso no se
  // haya movido: por eso se mira carga por repeticiones y no el peso solo.
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10), sesionDe(60, 11)]), []);
});

test('dos sesiones sin mejorar sí es un estancamiento', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10), sesionDe(60, 10)]), ['Pecho plano']);
});

test('con menos de tres sesiones no se puede hablar de estancamiento', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 10)]), []);
});

test('un ejercicio que bajó también está estancado', () => {
  assert.deepEqual(estancados([sesionDe(60, 10), sesionDe(60, 9), sesionDe(60, 8)]), ['Pecho plano']);
});

test('las series sin repeticiones no cuentan como sesión del ejercicio', () => {
  const vacia = { entry: { exercises: [{ name: 'Pecho plano', sets: [{ weight: 60, reps: 0 }] }] } };
  assert.deepEqual(estancados([sesionDe(60, 10), vacia, sesionDe(60, 10)]), [],
    'son dos sesiones reales, no tres');
});

// ---------------------------------------------------------------------------
// Los colores
// ---------------------------------------------------------------------------

test('cada estado tiene nombre y color propios', () => {
  const vistos = new Set();
  for (const [id, e] of Object.entries(ESTADOS)) {
    assert.ok(e.nombre?.length > 2, `${id} sin nombre`);
    assert.match(e.color, /^#[0-9a-f]{6}$/i, `${id} sin color`);
    assert.ok(!vistos.has(e.color), `${e.color} repetido: dos estados del mismo color no se distinguen`);
    vistos.add(e.color);
  }
});

test('la descarga manda sobre lo que diga la progresión', () => {
  // En una semana de descarga no importa que el ejercicio se haya ganado el
  // salto de peso: el salto espera a la semana que viene.
  assert.equal(queTocaHoy({ sube: true }, { descarga: true }), 'descarga');
});

test('fuera de la descarga, el color sale del objetivo', () => {
  assert.equal(queTocaHoy({ sube: true }), 'peso');
  assert.equal(queTocaHoy({ sube: false }), 'reps');
  assert.equal(queTocaHoy(null), 'mantener', 'sin sesión previa no hay qué subir');
});

test('todo estado que devuelve queTocaHoy tiene su entrada en ESTADOS', () => {
  // Si faltara una, la pantalla intentaría leer el color de undefined.
  for (const caso of [[{ sube: true }, {}], [{ sube: false }, {}], [null, {}], [null, { descarga: true }]]) {
    assert.ok(ESTADOS[queTocaHoy(...caso)], `sin entrada para ${JSON.stringify(caso)}`);
  }
});

// ---------------------------------------------------------------------------
// Qué levantar en una descarga
// ---------------------------------------------------------------------------

import { objetivoDeDescarga, textoDeDescarga } from '../js/descargas.js';
import { objetivoDeHoy } from '../js/progresion.js';
import { perfilDeEjercicio, RANGOS_REPS, DEFAULT_SETS } from '../js/config.js';

const medio = perfilDeEjercicio('Sillón de cuádriceps');     // rango 8-12
const pesado = perfilDeEjercicio('Sentadilla con barra');    // rango 5-8
const venia = (kg, reps, n = 3) => Array.from({ length: n }, () => ({ weight: kg, reps }));

test('en descarga se mantiene el peso y bajan las repeticiones al piso', () => {
  // El peso se mantiene porque bajarlo hace perder el hábito del movimiento
  // pesado; las repeticiones bajan para quedar lejos del fallo.
  const o = objetivoDeDescarga(venia(62.5, 11), medio, 2);
  assert.equal(o.peso, 62.5, 'el mismo peso de la última vez');
  assert.deepEqual(o.reps, [8, 8], 'el piso del rango');
});

test('cada ejercicio baja al piso de SU rango', () => {
  assert.equal(objetivoDeDescarga(venia(55, 8), pesado, 2).reps[0], RANGOS_REPS.pesado.min);
  assert.equal(objetivoDeDescarga(venia(62.5, 12), medio, 2).reps[0], RANGOS_REPS.medio.min);
});

test('una descarga nunca pide MÁS repeticiones de las que venías haciendo', () => {
  // Si venías en 6 de un rango de 8-12, pedirte 8 sería subirte el trabajo
  // justo la semana que viniste a bajarlo.
  const o = objetivoDeDescarga(venia(40, 6), medio, 2);
  assert.deepEqual(o.reps, [6, 6]);
});

test('la descarga nunca sube el peso, aunque te lo hayas ganado', () => {
  // Es el caso que motivó esto: cerrar el rango en todas las series dispara
  // el salto de peso, y en descarga ese salto tiene que esperar.
  const cerradas = venia(62.5, 12);
  assert.equal(objetivoDeHoy(cerradas, medio, 3).sube, true, 'la progresión normal sube');
  assert.equal(objetivoDeDescarga(cerradas, medio, 3).peso, 62.5, 'la descarga no');
});

test('sin sesión previa no se inventa un peso', () => {
  assert.equal(objetivoDeDescarga([], medio, 2), null);
  assert.equal(objetivoDeDescarga(null, medio, 2), null);
  assert.equal(objetivoDeDescarga([{ weight: 50, reps: 0 }], medio, 2), null,
    'una serie sin repeticiones no es una sesión');
});

test('la cantidad de series la pide quien llama', () => {
  assert.equal(objetivoDeDescarga(venia(60, 10), medio, 2).reps.length, 2);
  assert.equal(objetivoDeDescarga(venia(60, 10), medio, 4).reps.length, 4);
  // Pedir cero series no es un pedido: cae en el valor por defecto, como en
  // el resto de la app. Lo que importa es que nunca devuelva una lista vacía.
  assert.equal(objetivoDeDescarga(venia(60, 10), medio, 0).reps.length, DEFAULT_SETS);
  assert.ok(objetivoDeDescarga(venia(60, 10), medio, -2).reps.length >= 1, 'ni negativa');
});

test('el texto dice el peso, el plan y que tiene que sobrar', () => {
  const t = textoDeDescarga(objetivoDeDescarga(venia(62.5, 11), medio, 2), medio);
  assert.match(t, /62,5 kg/);
  assert.match(t, /8-8/);
  assert.match(t, /fallo/, 'lo que hay que entender de una descarga');
  assert.equal(textoDeDescarga(null, medio), null);
});

test('en mancuerna el texto aclara que el peso es de una', () => {
  const db = perfilDeEjercicio('Vuelo lateral con mancuerna vertical');
  assert.match(textoDeDescarga(objetivoDeDescarga(venia(9, 15), db, 2), db), /c\/u/);
});

test('el registrador usa el objetivo de descarga, no el récord', () => {
  // La línea de abajo decía "Lo superás con 65 kg × 11" en plena semana de
  // descarga: lo contrario de lo que hay que hacer. Se vio al usarla, no al
  // leer el código.
  const src = readFileSync('js/ui/logger.js', 'utf8');
  assert.match(src, /semanaDeDescarga\s*\n?\s*\?\s*textoDeDescarga/,
    'el texto del ejercicio tiene que cambiar en descarga');
  assert.match(src, /if \(semanaDeDescarga\) return objetivoDeDescarga/,
    'y el objetivo también');
  assert.match(src, /semanaDeDescarga && objetivo\) \? objetivo\.peso/,
    'la precarga no puede traer el peso del récord en descarga');
});

// ---------------------------------------------------------------------------
// metaDelDia: la única puerta a "cuánto toca hoy"
// ---------------------------------------------------------------------------

test('metaDelDia usa la plantilla del día, no la meta genérica', () => {
  // Sin registro todavía —el caso de la mañana— la rutina del día es la que
  // manda. El lunes es espalda y bíceps; la meta genérica de la actividad es
  // otra, y era la que se usaba antes.
  const esperada = plannedSets(templateForDay(1));
  assert.equal(metaDelDia(gym, LUNES, {}), esperada);
  assert.notEqual(esperada, Number(gym.goal), 'el test no distinguiría una de la otra');
  assert.equal(metaDelDia(gym, MIERCOLES, {}), plannedSets(templateForDay(3)));
});

test('metaDelDia parte la meta al medio en semana de descarga', () => {
  // El agujero que esto cierra: a la mañana de un día de descarga el tablero
  // pedía la rutina entera, porque la mitad sólo se aplicaba al construir el
  // historial y el historial no existe hasta que registrás algo.
  assert.equal(metaDelDia(gym, LUNES, { descargas: [LUNES] }),
    metaDeDescarga(plannedSets(templateForDay(1))));
  assert.ok(metaDelDia(gym, LUNES, { descargas: [LUNES] }) < metaDelDia(gym, LUNES, {}),
    'la descarga tiene que pedir menos que una semana normal');
});

test('metaDelDia respeta la meta que viaja en el registro', () => {
  // El pasado se juzga con la meta de entonces: si la sesión guardó 28, la
  // meta de ese día es 28 aunque la plantilla de hoy planee otra cosa.
  assert.equal(metaDelDia(gym, LUNES, { entry: { meta: 28 } }), 28);
});

test('metaDelDia no le toca la meta a lo que no es gimnasio', () => {
  const pasos = DEFAULT_ACTIVITIES.find((a) => a.id === 'pasos');
  assert.equal(metaDelDia(pasos, LUNES, { descargas: [LUNES] }), Number(pasos.goal));
});

test('metaDelDia saca la meta del agua del peso de ese día', () => {
  const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
  const conPeso = metaDelDia(agua, LUNES, { pesoCorporal: 62 });
  assert.ok(conPeso > 0);
  assert.notEqual(conPeso, metaDelDia(agua, LUNES, { pesoCorporal: 90 }),
    'el peso tiene que mover la meta del agua');
});

test('el tablero resuelve la meta del día por metaDelDia y le pasa las descargas', () => {
  // El tablero no se puede renderizar acá, así que se verifica el cableado:
  // sin las descargas, metaDelDia devuelve la rutina entera y un viernes de
  // descarga volvería a decir 0/35 hasta la primera serie.
  const vista = readFileSync('js/views/today.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(vista, /metaDelDia\(activity, dateKey, \{ descargas: state\.descargas \}\)/);
  assert.ok(!/\bgoalFor\b/.test(vista),
    'volvió goalFor, que no sabe de plantillas ni de descargas');
});

test('las calorías resuelven la meta del día por metaDelDia y le pasan las descargas', () => {
  const fuente = readFileSync('js/calorias.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(fuente, /metaDelDia\(a, state\.today, \{ descargas: state\.descargas/);
});

/* ---------------------------------------------------------------------------
   La descarga borra la pizarra
   --------------------------------------------------------------------------- */

/** Un historial de sesiones con un solo ejercicio que nunca sube. */
const sesion = (date, peso, reps, nombre = 'Pullover') => ({
  date, entry: { exercises: [{ name: nombre, sets: [{ weight: peso, reps }, { weight: peso, reps }] }] },
});

test('lo anterior a la descarga no puede pedir otra descarga', () => {
  // Es el punto entero: el estancamiento es la evidencia de fatiga y la
  // descarga es el tratamiento. Sin esto, el lunes siguiente a descargar la
  // app volvía a recomendar descargar con los mismos ejercicios de antes, y
  // así para siempre hasta que algún día subieran.
  const antes = [sesion('2026-10-12', 55, 12), sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12)];
  assert.deepEqual(estancados(antes), ['Pullover'], 'sin descarga declarada tiene que marcarlo');
  assert.deepEqual(estancados(antes, 3, { descargas: ['2026-11-02'], hoy: '2026-11-09' }), [],
    'la descarga no limpió el estancamiento anterior');
});

test('las sesiones de la propia descarga no son un estancamiento', () => {
  // En descarga se levanta lo mismo con la mitad de las series y las reps en
  // el piso: bajan a propósito. Leerlas como "no subió" es al revés.
  //
  // Hacen falta TRES sesiones dentro de la semana de descarga, que es el
  // mínimo para que el detector opine: con dos, cortar al inicio de la
  // semana o a su fin da lo mismo y el test no probaría nada.
  const h = [
    sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 13),
    sesion('2026-11-02', 55, 8), sesion('2026-11-04', 55, 8), sesion('2026-11-06', 55, 8),
  ];
  assert.deepEqual(estancados(h, 3, { descargas: ['2026-11-02'], hoy: '2026-11-06' }), [],
    'contó las sesiones de la semana de descarga');
  // El control: esas mismas tres sesiones, sin declarar la descarga, sí son
  // tres sesiones sin subir.
  assert.deepEqual(estancados(h, 3, { hoy: '2026-11-06' }), ['Pullover'],
    'el test no distinguiría nada si sin descarga tampoco las marcara');
});

test('después de la descarga hacen falta tres sesiones nuevas', () => {
  const previo = [sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12), sesion('2026-11-02', 55, 8)];
  const d = ['2026-11-02'];
  const nuevas = ['2026-11-09', '2026-11-16', '2026-11-23'].map((f) => sesion(f, 55, 12));
  assert.deepEqual(estancados([...previo, nuevas[0]], 3, { descargas: d }), [], 'con una nueva no alcanza');
  assert.deepEqual(estancados([...previo, ...nuevas.slice(0, 2)], 3, { descargas: d }), [], 'con dos tampoco');
  assert.deepEqual(estancados([...previo, ...nuevas], 3, { descargas: d }), ['Pullover'],
    'con tres sesiones nuevas sin subir sí es estancamiento de verdad');
});

test('si sube después de la descarga, no está estancado', () => {
  const previo = [sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12)];
  const sube = [sesion('2026-11-09', 55, 12), sesion('2026-11-16', 55, 13), sesion('2026-11-23', 55, 14)];
  assert.deepEqual(estancados([...previo, ...sube], 3, { descargas: ['2026-11-02'] }), []);
});

test('una descarga futura no borra el estancamiento de hoy', () => {
  // Declarar una descarga para la semana que viene no puede apagar la señal
  // que la está justificando: la descarga todavía no pasó.
  const h = [sesion('2026-10-12', 55, 12), sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12)];
  assert.deepEqual(estancados(h, 3, { descargas: ['2026-12-28'], hoy: '2026-10-26' }), ['Pullover']);
});

test('una descarga sin ninguna sesión adentro igual limpia', () => {
  // La descarga mejor hecha es la que no tiene sesiones: descansaste. Medir
  // el corte contra la última sesión la dejaba siempre en el futuro, así que
  // descansar entero era lo único que no contaba como descarga.
  const h = [sesion('2026-10-12', 55, 12), sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12)];
  assert.deepEqual(estancados(h, 3, { descargas: ['2026-11-02'], hoy: '2026-11-09' }), [],
    'una semana de descanso total no limpió el estancamiento');
});

test('vale la última descarga, no la primera', () => {
  const h = [sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12), sesion('2026-11-09', 55, 12)];
  assert.deepEqual(estancados(h, 3, { descargas: ['2026-09-07', '2026-11-02'], hoy: '2026-11-16' }), [],
    'se quedó con la descarga vieja y dejó pasar lo anterior a la última');
});

test('sin descargas declaradas se comporta igual que antes', () => {
  const h = [sesion('2026-10-12', 55, 12), sesion('2026-10-19', 55, 12), sesion('2026-10-26', 55, 12)];
  assert.deepEqual(estancados(h, 3, { descargas: [] }), estancados(h));
  assert.deepEqual(estancados(h, 3, {}), estancados(h));
});

test('la semana siguiente a una descarga no recomienda descargar', () => {
  // El caso completo, de punta a punta: tres sesiones sin subir, se descarga,
  // y al lunes siguiente la app no vuelve a pedir lo mismo.
  // Hacen falta DOS ejercicios trabados: con uno solo tocaDescarga no opina,
  // y el test no probaría lo que dice.
  const dos = (date) => ({
    date,
    entry: {
      exercises: [
        { name: 'Pullover', sets: [{ weight: 55, reps: 12 }] },
        { name: 'Remo con barra al pecho', sets: [{ weight: 50, reps: 10 }] },
      ],
    },
  });
  const previo = ['2026-10-12', '2026-10-19', '2026-10-26'].map(dos);
  const d = ['2026-11-02'];
  const fechas = previo.map((h) => h.date);
  assert.equal(estancados(previo).length, 2, 'el fixture no tiene dos ejercicios trabados');
  assert.equal(tocaDescarga(fechas, [], '2026-10-26', { estancados: estancados(previo) })?.motivo,
    'estancamiento', 'antes de descargar tiene que recomendarla');
  assert.equal(tocaDescarga(fechas, d, '2026-11-09',
    { estancados: estancados(previo, 3, { descargas: d, hoy: '2026-11-09' }) }), null,
  'el lunes después de la descarga volvió a pedir descarga');
});

test('el tablero le pasa las descargas al detector', () => {
  const vista = readFileSync('js/views/today.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.match(vista, /estancados\(gym\.history, 3, \{ descargas: state\.descargas, hoy: fecha \}\)/,
    'el tablero volvió a llamar al detector sin decirle cuándo descargaste');
});
