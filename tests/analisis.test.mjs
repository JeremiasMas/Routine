import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tendencia, constancia, proximosSaltos, impactoDeSubir, estancados,
  proyeccionGrasa, repartoDeFuentes, VENTANA, DIAS_PARA_ESTANCARSE,
} from '../js/analisis.js';
import { addDays } from '../js/utils.js';
import { STANDARDS } from '../js/strength.js';

const PESO = 61.5;

/**
 * Un perfil coherente: el 1RM se calcula desde el propio estándar, así la
 * categoría declarada y los kilos no se contradicen. Inventarlos a mano daba
 * un perfil imposible (100 kg de sentadilla a 61,5 de peso ya es categoría 2,
 * no 1) y la función lo descartaba, con razón.
 */
const enCategoria = (liftKey, index, avance = 0.4) => {
  const u = STANDARDS[liftKey].m;
  const desde = u[index];
  const hasta = u[index + 1] ?? desde * 1.2;
  const e1rm = (desde + (hasta - desde) * avance) * PESO;
  const objetivo = hasta * PESO;
  return {
    liftKey, lift: STANDARDS[liftKey].name, exercise: STANDARDS[liftKey].name,
    nivel: { index, pct: avance }, e1rm, objetivo,
    falta: Math.round((objetivo - e1rm) * 10) / 10,
    usaPesoCorporal: liftKey === 'pullup',
  };
};

const HOY = '2026-09-20';
const hace = (n) => addDays(HOY, -n);

// ---------------------------------------------------------------------------
// Tendencia y constancia
// ---------------------------------------------------------------------------

test('la tendencia compara las últimas cuatro semanas con las cuatro previas', () => {
  const historia = [
    { date: hace(50), value: 30, met: true },
    { date: hace(40), value: 30, met: true },   // 60 antes
    { date: hace(10), value: 45, met: true },
    { date: hace(5), value: 45, met: true },    // 90 ahora
  ];
  const t = tendencia(historia, HOY);
  assert.equal(t.antes, 60);
  assert.equal(t.ahora, 90);
  assert.equal(t.dir, 'sube');
  assert.ok(Math.abs(t.cambio - 0.5) < 1e-9);
});

test('un cambio chico es "estable", no una tendencia', () => {
  // Sin esto, 100 → 103 se anunciaría como una mejora, que es ruido.
  const historia = [
    { date: hace(40), value: 100, met: true },
    { date: hace(5), value: 103, met: true },
  ];
  assert.equal(tendencia(historia, HOY).dir, 'estable');
});

test('sin datos en la ventana no se inventa una tendencia', () => {
  assert.equal(tendencia([], HOY), null);
  assert.equal(tendencia([{ date: hace(200), value: 30 }], HOY), null);
  assert.equal(tendencia(null, HOY), null);
});

test('arrancar de cero cuenta como subida, no como división por cero', () => {
  const t = tendencia([{ date: hace(3), value: 45, met: true }], HOY);
  assert.equal(t.antes, 0);
  assert.equal(t.dir, 'sube');
  assert.ok(Number.isFinite(t.cambio));
});

test('la constancia mide cuántas veces cumpliste, no cuánto hiciste', () => {
  const historia = [
    { date: hace(5), value: 60, met: true },
    { date: hace(4), value: 10, met: false },
    { date: hace(3), value: 90, met: true },
    { date: hace(2), value: 5, met: false },
  ];
  const c = constancia(historia, HOY);
  assert.equal(c.total, 4);
  assert.equal(c.cumplidos, 2);
  assert.equal(c.pct, 0.5);
});

// ---------------------------------------------------------------------------
// Fuerza
// ---------------------------------------------------------------------------

const perfil = (filas) => filas.map(([liftKey, e1rm, index, pct, falta = null]) => ({
  liftKey, lift: liftKey, e1rm, nivel: { index, pct }, falta, objetivo: null,
}));

test('dice cuántos kilos faltan para la próxima categoría', () => {
  const p = [enCategoria('squat', 1), enCategoria('bench', 0)];
  const saltos = proximosSaltos(p);
  assert.equal(saltos.length, 2, 'los dos tienen categoría por encima');
  for (const s of saltos) {
    assert.ok(s.faltan > 0, `${s.lift} dice que faltan ${s.faltan}`);
    assert.ok(s.objetivo > s.actual);
    assert.ok(s.nivelSiguiente, 'tiene que nombrar a qué categoría sube');
  }
});

test('los saltos vienen ordenados del más barato al más caro', () => {
  const saltos = proximosSaltos(
    [enCategoria('squat', 1, 0.9), enCategoria('bench', 0, 0.1), enCategoria('ohp', 0, 0.5)]);
  assert.ok(saltos.length >= 2);
  for (let i = 1; i < saltos.length; i++) {
    assert.ok(saltos[i].faltan >= saltos[i - 1].faltan, 'no están ordenados');
  }
});

test('un levantamiento en lo más alto ya no tiene salto', () => {
  // El perfil le pone falta null cuando no hay categoría por encima.
  assert.deepEqual(proximosSaltos(perfil([['squat', 500, 4, 1, null]])), []);
});

test('no inventa un salto donde no hay nada que subir', () => {
  assert.deepEqual(proximosSaltos(perfil([['squat', 100, 1, 0.5, 0]])), [], 'faltan 0 kg');
  assert.deepEqual(proximosSaltos(perfil([['squat', 100, 1, 0.5, -5]])), [], 'ya lo pasaste');
  assert.deepEqual(proximosSaltos(null), []);
  assert.deepEqual(proximosSaltos([{ liftKey: 'squat', falta: 10 }]), [], 'sin categoría no se opina');
});

test('subir un movimiento mueve el nivel general, y dice cuánto', () => {
  const p = perfil([['squat', 100, 2, 0.3], ['bench', 70, 0, 0.2], ['rdl', 120, 2, 0.5]]);
  const r = impactoDeSubir(p, 'bench');
  assert.ok(r.nuevo > r.actual);
  // Con tres movimientos, subir uno una categoría sube el promedio ~1/3.
  assert.ok(Math.abs(r.delta - (1 - 0.2) / 3) < 1e-9, `delta ${r.delta}`);
});

test('con un solo movimiento no hay promedio que mover', () => {
  assert.equal(impactoDeSubir(perfil([['squat', 100, 1, 0.5]]), 'squat'), null);
});

// ---------------------------------------------------------------------------
// Estancamiento
// ---------------------------------------------------------------------------

const gimnasio = ({ record, ultima, sesiones }) => ({
  records: new Map([['press militar', { name: 'Press militar', date: record }]]),
  ultimaVez: new Map([['press militar', ultima]]),
  sesionesDeEjercicio: new Map([['press militar', sesiones]]),
});

test('marca un ejercicio que seguís haciendo y no mejora', () => {
  const g = gimnasio({ record: hace(60), ultima: hace(3), sesiones: 8 });
  const r = estancados(g, HOY);
  assert.equal(r.length, 1);
  assert.equal(r[0].nombre, 'Press militar');
  assert.equal(r[0].dias, 60);
});

test('un ejercicio que dejaste de hacer no está estancado: no está', () => {
  // Marcarlo sería un reproche por algo que decidiste vos.
  const g = gimnasio({ record: hace(90), ultima: hace(60), sesiones: 8 });
  assert.deepEqual(estancados(g, HOY), []);
});

test('un récord reciente no es estancamiento', () => {
  const g = gimnasio({ record: hace(DIAS_PARA_ESTANCARSE - 5), ultima: hace(2), sesiones: 8 });
  assert.deepEqual(estancados(g, HOY), []);
});

test('un ejercicio nuevo necesita varias sesiones antes de juzgarlo', () => {
  const g = gimnasio({ record: hace(60), ultima: hace(2), sesiones: 1 });
  assert.deepEqual(estancados(g, HOY), []);
});

test('aguanta un gimnasio vacío', () => {
  assert.deepEqual(estancados(null, HOY), []);
  assert.deepEqual(estancados({ records: new Map() }, HOY), []);
});

// ---------------------------------------------------------------------------
// Grasa corporal
// ---------------------------------------------------------------------------

test('proyecta cuándo llegás a la meta si venís bajando', () => {
  const m = [
    { date: hace(90), pct: 22 },
    { date: hace(60), pct: 20.5 },
    { date: hace(30), pct: 19 },
    { date: hace(1), pct: 17.5 },
  ];
  const r = proyeccionGrasa(m, 13, HOY);
  assert.equal(r.estado, 'en-camino');
  assert.ok(r.porSemana < 0, 'tiene que ir bajando');
  assert.ok(r.dias > 0 && r.dias < 365, `proyectó ${r.dias} días`);
  assert.ok(r.fecha > HOY);
});

test('avisa cuando hace tiempo que no se mueve', () => {
  const m = [
    { date: hace(90), pct: 18 },
    { date: hace(60), pct: 18.1 },
    { date: hace(30), pct: 17.9 },
    { date: hace(1), pct: 18 },
  ];
  assert.equal(proyeccionGrasa(m, 13, HOY).estado, 'plano');
});

test('con dos mediciones no se proyecta nada', () => {
  // Con dos puntos cualquier ruido parece una tendencia.
  const r = proyeccionGrasa([{ date: hace(30), pct: 20 }, { date: hace(1), pct: 18 }], 13, HOY);
  assert.equal(r.estado, 'pocos-datos');
  assert.equal(r.faltan, 1);
});

test('tres mediciones en una semana tampoco alcanzan', () => {
  const m = [{ date: hace(6), pct: 20 }, { date: hace(3), pct: 19 }, { date: hace(1), pct: 18 }];
  assert.equal(proyeccionGrasa(m, 13, HOY).estado, 'poco-tiempo');
});

test('si ya llegaste, lo dice', () => {
  const m = [{ date: hace(90), pct: 16 }, { date: hace(45), pct: 14 }, { date: hace(1), pct: 12.5 }];
  assert.equal(proyeccionGrasa(m, 13, HOY).estado, 'llegaste');
});

test('subir de grasa no se proyecta como si bajara', () => {
  const m = [{ date: hace(90), pct: 16 }, { date: hace(45), pct: 17 }, { date: hace(1), pct: 18 }];
  const r = proyeccionGrasa(m, 13, HOY);
  assert.equal(r.estado, 'plano');
  assert.ok(r.porSemana > 0);
});

// ---------------------------------------------------------------------------
// Francés
// ---------------------------------------------------------------------------

const frances = {
  sources: [
    { id: 'duolingo', name: 'Duolingo', minutes: 2 },
    { id: 'cbf', name: 'Coffee Break French', minutes: 22 },
  ],
};

test('reparte los minutos entre las fuentes', () => {
  const r = repartoDeFuentes(frances, { duolingo: 50, cbf: 5 });
  assert.equal(r.total, 100 + 110);
  assert.equal(r.filas[0].id, 'cbf', 'el podcast aporta más minutos');
  assert.ok(Math.abs(r.filas[0].pct - 110 / 210) < 1e-9);
});

test('detecta cuando te apoyás en una sola fuente', () => {
  const soloApp = repartoDeFuentes(frances, { duolingo: 100, cbf: 0 });
  assert.ok(soloApp.desbalance > 0.9, `desbalance ${soloApp.desbalance}`);
  const parejo = repartoDeFuentes(frances, { duolingo: 55, cbf: 5 });
  assert.ok(parejo.desbalance < 0.1, `desbalance ${parejo.desbalance}`);
});

test('sin datos no hay reparto que mostrar', () => {
  assert.equal(repartoDeFuentes(frances, { duolingo: 0, cbf: 0 }), null);
  assert.equal(repartoDeFuentes({ sources: [] }, {}), null);
  assert.equal(repartoDeFuentes(null, null), null);
});

test('lo que más rinde no es siempre lo más barato', async () => {
  const { mejorInversion } = await import('../js/analisis.js');
  // "row" está a punto de terminar su banda: subirlo cuesta poco y mueve poco.
  // "ohp" recién empieza la suya: cuesta más y mueve mucho más.
  const p = [enCategoria('row', 1, 0.95), enCategoria('ohp', 1, 0.05), enCategoria('squat', 2, 0.5)];
  const saltos = proximosSaltos(p);
  const inversiones = mejorInversion(p);
  assert.equal(saltos[0].lift, 'row', 'el más barato en kilos');
  assert.equal(inversiones[0].lift, 'ohp', 'el que más sube el nivel por kilo');
  assert.ok(inversiones[0].delta > saltos[0].faltan * inversiones[0].rinde - 1e-9);
});

test('la inversión no inventa mejoras donde no las hay', async () => {
  const { mejorInversion } = await import('../js/analisis.js');
  assert.deepEqual(mejorInversion([]), []);
  assert.deepEqual(mejorInversion(null), []);
  // Con un solo movimiento no hay promedio, así que tampoco hay impacto.
  assert.deepEqual(mejorInversion([enCategoria('squat', 1)]), []);
});
