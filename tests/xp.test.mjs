import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseXp, streakMultiplier, entryXp, levelFromXp, xpToNextLevel,
  gymVolume, estimatedOneRepMax, tierFor,
} from '../js/xp.js';

test('cumplir la meta vale 100 XP en cualquier actividad', () => {
  assert.equal(baseXp(45, 45), 100);      // datos: 45 min
  assert.equal(baseXp(10000, 10000), 100); // pasos: 10 mil
  assert.equal(baseXp(4000, 4000), 100);   // gym: tonelaje
  assert.equal(baseXp(1, 1), 100);         // substack: un post
});

test('el progreso parcial es proporcional', () => {
  assert.equal(baseXp(22.5, 45), 50);
  assert.equal(baseXp(5000, 10000), 50);
  assert.equal(baseXp(0, 45), 0);
});

test('pasarse de la meta rinde cada vez menos y tiene tope', () => {
  assert.equal(baseXp(90, 45), 140);
  assert.equal(baseXp(135, 45), 150);
  assert.equal(baseXp(450, 45), 160);
  assert.equal(baseXp(45000, 45), 160, 'el tope no se puede romper');
});

test('la racha multiplica hasta +50%', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(10), 1.2);
  assert.equal(streakMultiplier(100), 1.5);
  assert.equal(entryXp(45, 45, 25), 150);
});

test('los niveles se derivan de la XP acumulada', () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(99).level, 1);
  assert.equal(levelFromXp(xpToNextLevel(1)).level, 2);
  const l = levelFromXp(150);
  assert.equal(l.level, 2);
  assert.equal(l.into, 150 - xpToNextLevel(1));
  assert.ok(l.pct > 0 && l.pct < 1);
});

test('cada nivel cuesta más que el anterior', () => {
  for (let i = 1; i < 60; i++) assert.ok(xpToNextLevel(i + 1) > xpToNextLevel(i));
});

test('valores raros de XP no rompen el cálculo de nivel', () => {
  assert.equal(levelFromXp(-500).level, 1);
  assert.equal(levelFromXp(Number.NaN).level, 1);
});

test('tonelaje y 1RM del gimnasio', () => {
  const sesion = [
    { name: 'Sentadilla', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] },
    { name: 'Press banca', sets: [{ weight: 60, reps: 8 }] },
  ];
  assert.equal(gymVolume(sesion), 1480);
  assert.equal(gymVolume([]), 0);
  assert.equal(gymVolume([{ name: 'x', sets: [{ weight: '', reps: 5 }] }]), 0);
  // Promedio de Epley, Brzycki, Lombardi y Wathen.
  assert.equal(estimatedOneRepMax(100, 5), 115.8);
  assert.equal(estimatedOneRepMax(100, 1), 100, 'una repetición ES el 1RM');
  assert.equal(estimatedOneRepMax(0, 5), 0);
  assert.equal(estimatedOneRepMax(100, 0), 0);
});

test('los rangos escalan con el nivel', () => {
  assert.equal(tierFor(1).name, 'Novato');
  assert.equal(tierFor(12).name, 'Adepto');
  assert.equal(tierFor(99).name, 'Leyenda');
});

test('cada actividad puede tener sus propios nombres de rango', async () => {
  const { nextTierFor } = await import('../js/xp.js');
  const { DEFAULT_ACTIVITIES, TIERS } = await import('../js/config.js');
  const mt = DEFAULT_ACTIVITIES.find((a) => a.id === 'muaythai');

  assert.equal(tierFor(1, mt.tierNames).name, 'Luk Sit');
  assert.equal(tierFor(11, mt.tierNames).name, 'Nak Su');
  assert.equal(tierFor(99, mt.tierNames).name, 'Ajarn');
  assert.equal(nextTierFor(11, mt.tierNames).name, 'Campeón de estadio');
  assert.equal(nextTierFor(11, mt.tierNames).min, 20);
  assert.equal(nextTierFor(50, mt.tierNames), null, 'el último rango no tiene siguiente');

  // Sin nombres propios usa los genéricos.
  assert.equal(tierFor(11).name, 'Adepto');
  assert.equal(tierFor(11, ['muy', 'pocos']).name, 'Adepto', 'una lista incompleta no rompe nada');
  // Los umbrales y colores no cambian entre actividades.
  assert.equal(tierFor(11, mt.tierNames).color, TIERS[2].color);
});

test('todas las disciplinas con nivel traen una escalera completa de rangos', async () => {
  const { DEFAULT_ACTIVITIES, TIERS } = await import('../js/config.js');
  for (const a of DEFAULT_ACTIVITIES) {
    // El agua es un hábito sin niveles: no lleva escalera.
    if (a.leveled === false) {
      assert.ok(!a.tierNames, `${a.id} es un hábito y no debería tener rangos`);
      continue;
    }
    // La composición corporal usa las bandas de grasa, que traen sus nombres.
    if (a.rankBy === 'bodyfat') {
      assert.ok(!a.tierNames, `${a.id} toma los nombres de las bandas de grasa`);
      continue;
    }
    assert.ok(Array.isArray(a.tierNames), `${a.id} no tiene tierNames`);
    assert.equal(a.tierNames.length, TIERS.length, `${a.id} tiene ${a.tierNames.length} rangos`);
    assert.equal(new Set(a.tierNames).size, TIERS.length, `${a.id} repite algún nombre de rango`);
    for (const n of a.tierNames) assert.ok(n.trim().length > 0, `${a.id} tiene un rango vacío`);
  }
});


test('el 1RM promedia fórmulas en vez de casarse con una', async () => {
  const { estimatedOneRepMax } = await import('../js/xp.js');
  const w = 85;
  const formulas = (r) => [
    w * (1 + r / 30),                                   // Epley
    (w * 36) / (37 - r),                                // Brzycki
    w * Math.pow(r, 0.10),                              // Lombardi
    (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)),   // Wathen
  ];
  for (const r of [5, 8, 12]) {
    const v = formulas(r);
    const est = estimatedOneRepMax(w, r);
    assert.ok(est >= Math.min(...v) && est <= Math.max(...v),
      `el promedio tiene que caer dentro del rango de las fórmulas (${r} reps)`);
  }
  // A pocas repeticiones las cuatro coinciden: el promedio es sólido.
  assert.ok(Math.max(...formulas(5)) - Math.min(...formulas(5)) < 5);
});

test('promediar NO arregla las series largas: por eso hay un tope', async () => {
  const { estimatedOneRepMax, esSerieFiable } = await import('../js/xp.js');
  const w = 85;
  const spread = (r) => {
    const v = [
      w * (1 + r / 30), (w * 36) / (37 - r),
      w * Math.pow(r, 0.10), (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)),
    ];
    return Math.max(...v) - Math.min(...v);
  };
  // A 15 reps las fórmulas discrepan tanto que el promedio no significa nada:
  // Brzycki tira para arriba lo mismo que Lombardi para abajo.
  assert.ok(spread(15) > 20, `a 15 reps la dispersión es de ${spread(15).toFixed(0)} kg`);
  assert.ok(spread(5) < 5, 'a 5 reps es de pocos kilos');
  assert.ok(Math.abs(estimatedOneRepMax(w, 15) - w * (1 + 15 / 30)) < 2,
    'el promedio a 15 reps queda pegado a Epley: no corrige nada');
  // La protección real es no usar esas series para medir fuerza.
  assert.ok(!esSerieFiable(15) && esSerieFiable(8));
});

test('la confianza del 1RM depende de las repeticiones', async () => {
  const { confianzaDe, esSerieFiable, REPS_FIABLES, REPS_CALIBRACION } = await import('../js/xp.js');
  assert.equal(confianzaDe(5), 'alta');
  assert.equal(confianzaDe(REPS_CALIBRACION), 'alta');
  assert.equal(confianzaDe(REPS_CALIBRACION + 1), 'media');
  assert.equal(confianzaDe(REPS_FIABLES), 'media');
  assert.equal(confianzaDe(REPS_FIABLES + 1), 'baja');
  assert.equal(confianzaDe(0), 'ninguna');
  assert.ok(esSerieFiable(12) && !esSerieFiable(15));
});


test('la curva llega al último rango en un plazo humano', async () => {
  const { xpToNextLevel } = await import('../js/xp.js');
  const { TIERS } = await import('../js/config.js');
  const acumulada = (nivel) => {
    let t = 0;
    for (let L = 1; L < nivel; L++) t += xpToNextLevel(L);
    return t;
  };
  // Cumplir la meta todos los días son 100 XP diarios.
  const dias = (nivel) => acumulada(nivel) / 100;
  assert.ok(dias(5) <= 15, `el segundo rango a los ${dias(5)} días`);
  assert.ok(dias(10) <= 60, `nivel 10 a los ${dias(10)} días`);
  assert.ok(dias(20) <= 365, `nivel 20 dentro del primer año (${dias(20)} días)`);
  assert.ok(dias(35) <= 365 * 2, `nivel 35 dentro de dos años (${Math.round(dias(35))} días)`);
  const ultimo = TIERS[TIERS.length - 1].min;
  assert.ok(dias(ultimo) <= 365 * 4,
    `el último rango tiene que ser alcanzable: ${(dias(ultimo) / 365).toFixed(1)} años`);
});

test('cada nivel sigue costando más que el anterior', async () => {
  const { xpToNextLevel } = await import('../js/xp.js');
  for (let i = 1; i < 60; i++) {
    assert.ok(xpToNextLevel(i + 1) > xpToNextLevel(i), `nivel ${i} no progresa`);
  }
});

test('en los de mancuerna el tonelaje cuenta las dos manos', () => {
  // Se anota el peso de una sola mancuerna, que es el número escrito en ella
  // y el que se compara con la vez anterior. Pero las dos manos mueven peso.
  const conMancuerna = [{ name: 'Vuelo lateral', db: true, sets: [{ weight: 10, reps: 12 }] }];
  const conBarra = [{ name: 'Press militar', sets: [{ weight: 10, reps: 12 }] }];
  assert.equal(gymVolume(conBarra), 120);
  assert.equal(gymVolume(conMancuerna), 240, 'diez kilos en cada mano son veinte kilos');
});

test('una sesión mezclada suma cada ejercicio como corresponde', () => {
  const sesion = [
    { name: 'Sentadilla con barra', sets: [{ weight: 80, reps: 5 }] },            // 400
    { name: 'Vuelo lateral', db: true, sets: [{ weight: 8, reps: 15 }] },          // 240
    { name: 'Dominadas', bw: true, sets: [{ weight: 0, reps: 8 }] },               // 0
  ];
  assert.equal(gymVolume(sesion), 640);
});

test('hay un nombre por nivel, del 1 al 60, sin huecos ni repetidos', async () => {
  const { PLAYER_TITLES } = await import('../js/config.js');
  assert.equal(PLAYER_TITLES.length, 60);
  assert.deepEqual(PLAYER_TITLES.map((t) => t.min), Array.from({ length: 60 }, (_, i) => i + 1),
    'cada nivel tiene el suyo y ninguno se saltea');
  assert.equal(PLAYER_TITLES[0].name, 'Leónidas');
  assert.equal(PLAYER_TITLES.at(-1).name, 'Gengis Kan', 'el último cae en el 60 redondo');
});

test('los veinte de siempre siguen en su nivel exacto', async () => {
  // Cambiar dónde cae uno le habría movido el rango a alguien que ya lo tenía.
  const { PLAYER_TITLES } = await import('../js/config.js');
  const ANCLAS = {
    1: 'Leónidas', 6: 'Milcíades', 9: 'Temístocles', 12: 'Escipión', 15: 'Wellington',
    18: 'Eisenhower', 21: 'Saladino', 24: 'Epaminondas', 27: 'Julio César', 30: 'Zhukov',
    33: 'Gustavo Adolfo', 36: 'Tamerlán', 39: 'Subotai', 42: 'Jaled ibn al-Walid',
    45: 'Alejandro Magno', 48: 'Napoleón', 51: 'Federico el Grande', 54: 'Belisario',
    57: 'Aníbal', 60: 'Gengis Kan',
  };
  for (const [nivel, nombre] of Object.entries(ANCLAS)) {
    assert.equal(PLAYER_TITLES.find((t) => t.min === Number(nivel))?.name, nombre,
      `el nivel ${nivel} dejó de ser ${nombre}`);
  }
});

test('los rangos van siempre hacia arriba', async () => {
  const { PLAYER_TITLES } = await import('../js/config.js');
  for (let i = 1; i < PLAYER_TITLES.length; i++) {
    assert.ok(PLAYER_TITLES[i].min > PLAYER_TITLES[i - 1].min,
      `${PLAYER_TITLES[i].name} no está por encima del anterior`);
  }
});

test('cada rango tiene nombre y explicación', async () => {
  const { PLAYER_TITLES } = await import('../js/config.js');
  const nombres = new Set();
  for (const t of PLAYER_TITLES) {
    assert.ok(t.name?.length > 2, `nombre vacío en el nivel ${t.min}`);
    assert.ok(t.nota?.length > 10, `${t.name} no dice por qué está ahí`);
    assert.ok(!nombres.has(t.name), `${t.name} está repetido`);
    nombres.add(t.name);
  }
});

test('cada nivel estrena su propio nombre', async () => {
  const { playerTitleFor } = await import('../js/xp.js');
  const { PLAYER_TITLES } = await import('../js/config.js');
  for (let n = 1; n <= 60; n++) {
    assert.equal(playerTitleFor(n).min, n, `el nivel ${n} no estrena nombre`);
  }
  assert.equal(playerTitleFor(1).name, 'Leónidas');
  assert.equal(playerTitleFor(60).name, 'Gengis Kan', 'el último cae en el 60 redondo');
  assert.equal(playerTitleFor(500).name, 'Gengis Kan', 'pasado el 60 se sigue subiendo, pero no hay nombre nuevo');
  assert.equal(new Set(PLAYER_TITLES.map((t) => t.name)).size, 60, 'ninguno repetido');
  assert.equal(playerTitleFor(0).name, 'Leónidas', 'antes del primero tampoco se rompe');
});

test('ningún nombre queda inalcanzable', async () => {
  const { playerTitleFor } = await import('../js/xp.js');
  const { PLAYER_TITLES } = await import('../js/config.js');
  const vistos = new Set();
  for (let n = 1; n <= 60; n++) vistos.add(playerTitleFor(n).name);
  assert.equal(vistos.size, 60, `sólo se alcanzan ${vistos.size} nombres en 60 niveles`);
  for (const t of PLAYER_TITLES) assert.ok(vistos.has(t.name), `${t.name} nunca se alcanza`);
});
