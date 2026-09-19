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
  assert.equal(estimatedOneRepMax(100, 5), 116.7);
  assert.equal(estimatedOneRepMax(0, 5), 0);
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
    // El agua es un hábito sin niveles y el cuerpo usa las bandas de grasa.
    if (a.leveled === false || a.rankBy) {
      assert.ok(!a.tierNames, `${a.id} no debería tener escalera de XP`);
      continue;
    }
    assert.ok(Array.isArray(a.tierNames), `${a.id} no tiene tierNames`);
    assert.equal(a.tierNames.length, TIERS.length, `${a.id} tiene ${a.tierNames.length} rangos`);
    assert.equal(new Set(a.tierNames).size, TIERS.length, `${a.id} repite algún nombre de rango`);
    for (const n of a.tierNames) assert.ok(n.trim().length > 0, `${a.id} tiene un rango vacío`);
  }
});
