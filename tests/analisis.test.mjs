import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tendencia, constancia, proximosSaltos, impactoDeSubir, estancados,
  proyeccionGrasa, repartoDeFuentes, VENTANA, DIAS_PARA_ESTANCARSE,
} from '../js/analisis.js';
import { addDays, weekStart } from '../js/utils.js';
import { isScheduled } from '../js/derive.js';
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

/** Un estado de actividad con lo justo que mira la constancia. */
const estadoDe = (activity, registros) => {
  const history = registros.map((r) => ({ met: false, ...r }));
  return { activity, history, byDate: new Map(history.map((h) => [h.date, h])) };
};

const DIARIA = { id: 'x', name: 'X', streakMode: 'daily', unit: 'min', goal: 30 };

test('la constancia mide cuántas veces cumpliste, no cuánto hiciste', () => {
  const st = estadoDe(DIARIA, [
    { date: hace(3), value: 60, met: true },
    { date: hace(2), value: 10, met: false },
    { date: hace(1), value: 90, met: true },
    { date: HOY, value: 5, met: false },
  ]);
  const c = constancia(st, HOY);
  assert.equal(c.modo, 'diario');
  assert.equal(c.total, 4);
  assert.equal(c.cumplidos, 2);
  assert.equal(c.pct, 0.5);
});

test('los días que ni registraste cuentan como ausencias', () => {
  // Cuatro días de ventana y un solo registro: contar sólo lo registrado
  // daría 100%, que es justo lo que la constancia no debe decir.
  const st = estadoDe(DIARIA, [{ date: hace(3), value: 60, met: true }]);
  const c = constancia(st, HOY);
  assert.equal(c.total, 4);
  assert.equal(c.cumplidos, 1);
});

test('la ventana no arranca antes del primer registro', () => {
  // Recién empezada, una disciplina no puede figurar con dos meses de faltas.
  const st = estadoDe(DIARIA, [
    { date: hace(1), value: 60, met: true },
    { date: HOY, value: 60, met: true },
  ]);
  const c = constancia(st, HOY);
  assert.equal(c.total, 2);
  assert.equal(c.pct, 1);
});

test('sólo cuenta los días agendados', () => {
  // Piano: lunes, viernes, sábado y domingo. Los martes no son faltas.
  const soloDomingos = { ...DIARIA, days: [0] };
  const st = estadoDe(soloDomingos, [{ date: hace(7), value: 60, met: true }]);
  const c = constancia(st, HOY, { tocaba: isScheduled });
  assert.equal(c.total, 2, 'hace 7 días y hoy son los dos únicos domingos');
  assert.equal(c.cumplidos, 1);
});

test('un día de pausa no es una falta', () => {
  const st = estadoDe(DIARIA, [{ date: hace(3), value: 60, met: true }]);
  const enPausa = new Set([hace(2), hace(1)]);
  const c = constancia(st, HOY, { libre: (d) => enPausa.has(d) });
  assert.equal(c.total, 2, 'quedan el día del registro y hoy');
  assert.equal(c.cumplidos, 1);
});

test('con meta semanal cuenta semanas, no días', () => {
  // Mover la sesión del lunes al martes no es faltar: lo que se mide es si
  // la semana llegó al número.
  const semanal = { id: 'gym', name: 'Gym', streakMode: 'weekly', weeklyTarget: 2, unit: 'series' };
  const l0 = weekStart(HOY);
  const l1 = addDays(l0, -7);
  const l2 = addDays(l0, -14);
  const st = estadoDe(semanal, [
    { date: l2, value: 30, met: true },
    { date: addDays(l2, 3), value: 30, met: true },
    { date: addDays(l1, 2), value: 30, met: true },          // una sola: no llega
    { date: addDays(l0, 1), value: 30, met: true },
    { date: addDays(l0, 4), value: 30, met: true },
  ]);
  const c = constancia(st, HOY);
  assert.equal(c.modo, 'semanal');
  assert.equal(c.total, 3);
  assert.equal(c.cumplidos, 2);
});

test('una sesión floja igual cuenta para la semana', () => {
  // La meta semanal es de apariciones: tres idas cortas son tres idas.
  const semanal = { id: 'gym', name: 'Gym', streakMode: 'weekly', weeklyTarget: 2, unit: 'series' };
  const l1 = addDays(weekStart(HOY), -7);
  const st = estadoDe(semanal, [
    { date: l1, value: 8, met: false },
    { date: addDays(l1, 3), value: 12, met: false },
  ]);
  const c = constancia(st, HOY);
  assert.equal(c.cumplidos, 1);
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

// ---------------------------------------------------------------------------
// Fuerza relativa contra fuerza real
// ---------------------------------------------------------------------------

test('las dos partes suman exactamente el cambio total', async () => {
  const { descomponerProgreso } = await import('../js/analisis.js');
  for (const [a, pa, b, pb] of [[80, 65, 90, 62], [100, 60, 100, 55], [50, 70, 45, 70], [120, 61.5, 125, 61.5]]) {
    const d = descomponerProgreso(a, pa, b, pb);
    assert.ok(Math.abs((d.porFuerza + d.porPeso) - d.delta) < 1e-12,
      `${a}/${pa} → ${b}/${pb}: las partes no suman el total`);
  }
});

test('bajar de peso sin levantar más se atribuye al peso, no a la fuerza', async () => {
  const { descomponerProgreso, explicarProgreso } = await import('../js/analisis.js');
  const d = descomponerProgreso(100, 65, 100, 60);
  assert.equal(d.porFuerza, 0, 'no levantó ni un kilo más');
  assert.ok(d.porPeso > 0);
  const e = explicarProgreso(d);
  assert.equal(e.soloPorPeso, true);
  assert.ok(e.pesoPct > 0.99, 'todo el mérito es del peso');
});

test('levantar más sin cambiar de peso se atribuye a la fuerza', async () => {
  const { descomponerProgreso, explicarProgreso } = await import('../js/analisis.js');
  const d = descomponerProgreso(80, 61.5, 95, 61.5);
  assert.ok(d.porFuerza > 0);
  assert.equal(d.porPeso, 0);
  assert.equal(explicarProgreso(d), null, 'no hay nada que aclarar');
});

test('cuando aportan las dos cosas, reparte', async () => {
  const { descomponerProgreso, explicarProgreso } = await import('../js/analisis.js');
  const d = descomponerProgreso(80, 65, 90, 62);
  const e = explicarProgreso(d);
  assert.ok(e.pesoPct > 0 && e.pesoPct < 1, `repartió ${e.pesoPct}`);
  assert.equal(e.soloPorPeso, false);
  assert.equal(e.kgLevantados, 10);
  assert.equal(e.kgDePeso, -3);
});

test('engordar baja el cociente aunque levantes lo mismo', async () => {
  const { descomponerProgreso } = await import('../js/analisis.js');
  const d = descomponerProgreso(100, 60, 100, 65);
  assert.ok(d.delta < 0 && d.porPeso < 0 && d.porFuerza === 0);
});

test('no opina sin datos completos', async () => {
  const { descomponerProgreso, explicarProgreso } = await import('../js/analisis.js');
  assert.equal(descomponerProgreso(0, 60, 100, 60), null);
  assert.equal(descomponerProgreso(100, 0, 100, 60), null);
  assert.equal(descomponerProgreso(100, 60, NaN, 60), null);
  assert.equal(explicarProgreso(null), null);
});

// ---------------------------------------------------------------------------
// Balance entre pares
// ---------------------------------------------------------------------------

test('marca el desbalance y dice cuál es el flojo', async () => {
  const { balances } = await import('../js/analisis.js');
  const r = balances([enCategoria('bench', 2, 0.5), enCategoria('row', 1, 0.1)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].fuerte.liftKey, 'bench');
  assert.equal(r[0].flojo.liftKey, 'row');
  assert.ok(Math.abs(r[0].brecha - 1.4) < 1e-9, `brecha ${r[0].brecha}`);
  assert.equal(r[0].desparejo, true);
});

test('dos parejos no son un desbalance', async () => {
  const { balances } = await import('../js/analisis.js');
  const r = balances([enCategoria('bench', 1, 0.5), enCategoria('row', 1, 0.6)]);
  assert.equal(r[0].desparejo, false);
});

test('da igual cuál de los dos esté adelante', async () => {
  const { balances } = await import('../js/analisis.js');
  const a = balances([enCategoria('squat', 3, 0.2), enCategoria('rdl', 1, 0.2)])[0];
  const b = balances([enCategoria('rdl', 3, 0.2), enCategoria('squat', 1, 0.2)])[0];
  assert.equal(a.brecha, b.brecha);
  assert.equal(a.flojo.liftKey, 'rdl');
  assert.equal(b.flojo.liftKey, 'squat');
});

test('un par incompleto no se inventa', async () => {
  const { balances } = await import('../js/analisis.js');
  assert.deepEqual(balances([enCategoria('bench', 2, 0.5)]), []);
  assert.deepEqual(balances([]), []);
  assert.deepEqual(balances(null), []);
});

test('los desbalances vienen del más grave al menos', async () => {
  const { balances } = await import('../js/analisis.js');
  const r = balances([
    enCategoria('bench', 1, 0.5), enCategoria('row', 1, 0.4),      // brecha 0,1
    enCategoria('squat', 3, 0.5), enCategoria('rdl', 1, 0.0),      // brecha 2,5
  ]);
  assert.equal(r[0].a, 'squat', 'el peor va primero');
  assert.ok(r[0].brecha > r[1].brecha);
});

// ---------------------------------------------------------------------------
// Rachas en riesgo
// ---------------------------------------------------------------------------

const estado = (id, extra = {}) => ({
  id, activity: { id, name: id, icon: '·' }, streak: 10, shields: 0, doneToday: false, ...extra,
});
const siempreToca = () => true;

test('avisa de una racha que se corta hoy', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  const r = rachasEnRiesgo([estado('piano', { streak: 30 })], siempreToca);
  assert.equal(r.length, 1);
  assert.equal(r[0].seCorta, true);
  assert.equal(r[0].streak, 30);
});

test('lo ya hecho hoy no está en riesgo', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  assert.deepEqual(rachasEnRiesgo([estado('piano', { doneToday: true })], siempreToca), []);
});

test('lo que hoy no tocaba tampoco', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  assert.deepEqual(rachasEnRiesgo([estado('gym')], () => false), []);
});

test('sin racha no hay nada que perder', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  assert.deepEqual(rachasEnRiesgo([estado('piano', { streak: 0 })], siempreToca), []);
});

test('con escudo la racha sobrevive, pero avisa que cuesta uno', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  const r = rachasEnRiesgo([estado('piano', { shields: 2 })], siempreToca);
  assert.equal(r[0].seCorta, false);
  assert.equal(r[0].ultimoEscudo, false);
  const ultimo = rachasEnRiesgo([estado('piano', { shields: 1 })], siempreToca);
  assert.equal(ultimo[0].ultimoEscudo, true, 'gastar el último no es lo mismo que gastar el primero');
});

test('primero lo que se corta, después lo que sólo gasta escudo', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  const r = rachasEnRiesgo([
    estado('datos', { streak: 100, shields: 2 }),   // protegida
    estado('piano', { streak: 5, shields: 0 }),     // se corta
  ], siempreToca);
  assert.equal(r[0].id, 'piano', 'lo que se pierde de verdad va primero');
  assert.equal(r[1].id, 'datos');
});

test('las semanales no entran: no se cortan por un día', async () => {
  const { rachasEnRiesgo } = await import('../js/analisis.js');
  const semanal = estado('substack');
  semanal.activity.streakMode = 'weekly';
  assert.deepEqual(rachasEnRiesgo([semanal], siempreToca), []);
});

// ---------------------------------------------------------------------------
// Resumen semanal
// ---------------------------------------------------------------------------

test('el resumen compara la semana con la anterior', async () => {
  const { resumenSemanal } = await import('../js/analisis.js');
  const { derive } = await import('../js/derive.js');
  const { DEFAULT_ACTIVITIES } = await import('../js/config.js');
  const { isScheduled } = await import('../js/derive.js');

  const LUNES = '2026-09-14';          // lunes
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'piano');
  const entries = {};
  // Semana anterior: dos sesiones. Esta semana: cuatro.
  for (const d of ['2026-09-07', '2026-09-11']) entries[d] = { piano: { value: 30 } };
  for (const d of ['2026-09-14', '2026-09-18', '2026-09-19', '2026-09-20']) entries[d] = { piano: { value: 30 } };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: {} }, '2026-09-21');
  const r = resumenSemanal(state, LUNES, { tocaba: isScheduled });

  const piano = r.porActividad.find((x) => x.id === 'piano');
  assert.equal(piano.total, 120, 'cuatro sesiones de 30');
  assert.equal(piano.totalAnterior, 60);
  assert.equal(piano.delta, 60);
  assert.equal(r.mejor.id, 'piano');
  assert.equal(r.peor, null);
  assert.equal(r.vacia, false);
});

test('señala lo que se cayó respecto de la semana anterior', async () => {
  const { resumenSemanal } = await import('../js/analisis.js');
  const { derive, isScheduled } = await import('../js/derive.js');
  const { DEFAULT_ACTIVITIES } = await import('../js/config.js');
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'datos');
  const entries = {};
  for (const d of ['2026-09-07', '2026-09-08', '2026-09-09']) entries[d] = { datos: { value: 45 } };
  entries['2026-09-14'] = { datos: { value: 45 } };
  const state = derive({ activities: acts, entries, unlocked: {}, settings: {} }, '2026-09-21');
  const r = resumenSemanal(state, '2026-09-14', { tocaba: isScheduled });
  assert.equal(r.peor.id, 'datos');
  assert.ok(r.peor.delta < 0);
});

test('los días declarados libres no cuentan como fallo', async () => {
  const { resumenSemanal } = await import('../js/analisis.js');
  const { derive, isScheduled } = await import('../js/derive.js');
  const { DEFAULT_ACTIVITIES } = await import('../js/config.js');
  const acts = DEFAULT_ACTIVITIES.filter((a) => a.id === 'datos');
  const state = derive({ activities: acts, entries: { '2026-09-14': { datos: { value: 45 } } },
    unlocked: {}, settings: {} }, '2026-09-21');
  const conLibres = resumenSemanal(state, '2026-09-14',
    { tocaba: isScheduled, libre: (d) => d >= '2026-09-15' });
  const sinLibres = resumenSemanal(state, '2026-09-14', { tocaba: isScheduled });
  const a = conLibres.porActividad.find((x) => x.id === 'datos');
  const b = sinLibres.porActividad.find((x) => x.id === 'datos');
  assert.ok(a.agendados < b.agendados, 'una semana de descanso pide menos');
  assert.equal(conLibres.diasLibres, 6);
});

test('una semana sin nada se declara vacía en vez de fingir', async () => {
  const { resumenSemanal } = await import('../js/analisis.js');
  const { derive, isScheduled } = await import('../js/derive.js');
  const state = derive({ activities: [], entries: {}, unlocked: {}, settings: {} }, '2026-09-21');
  assert.equal(resumenSemanal(state, '2026-09-14', { tocaba: isScheduled }).vacia, true);
});
