import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, goalFor } from '../js/derive.js';
import { waterGoalMl } from '../js/body.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';

// La meta de agua sale del peso, así que depende de CUÁNDO. Pesarse no puede
// volver incompletos los días que ya se habían cumplido.

const agua = DEFAULT_ACTIVITIES.find((a) => a.id === 'agua');
const LIVIANO = 60.5;
const PESADO = 64;

const estado = (entries, hoy, peso = PESADO) => derive({
  activities: [agua], entries, unlocked: {}, settings: { weight: peso },
}, hoy).byActivity.get('agua');

test('las dos metas son distintas, o el test no probaría nada', () => {
  assert.notEqual(waterGoalMl(LIVIANO), waterGoalMl(PESADO));
  assert.equal(waterGoalMl(LIVIANO), 2100);
  assert.equal(waterGoalMl(PESADO), 2250);
});

test('subir de peso no vuelve incompletos los días anteriores', () => {
  // El caso exacto reportado: días cumplidos con 2100 ml que al pesarse más
  // pasaron a estar incompletos contra una meta que ese día no existía.
  const entries = {
    '2026-10-10': { cuerpo: { weight: LIVIANO } },
    '2026-10-12': { agua: { value: 2100 } },
    '2026-10-13': { agua: { value: 2100 } },
    '2026-10-15': { cuerpo: { weight: PESADO } },   // acá te pesás más
    '2026-10-16': { agua: { value: 2100 } },
  };
  const st = estado(entries, '2026-10-16');
  assert.equal(st.byDate.get('2026-10-12').goal, 2100, 'meta del peso de entonces');
  assert.equal(st.byDate.get('2026-10-12').met, true, 'y sigue cumplido');
  assert.equal(st.byDate.get('2026-10-13').met, true);
  // Desde la pesada nueva, la meta sube: ahí sí 2100 ml no alcanzan.
  assert.equal(st.byDate.get('2026-10-16').goal, 2250, 'desde la pesada, la meta nueva');
  assert.equal(st.byDate.get('2026-10-16').met, false, 'el cambio rige de ahí en adelante');
});

test('el cambio de peso rige desde su fecha, no antes', () => {
  // El mismo día de la pesada ya cuenta con la meta nueva: "no retroactivo"
  // es que no toque el pasado, no que tarde en aplicarse.
  const entries = {
    '2026-10-10': { cuerpo: { weight: LIVIANO } },
    '2026-10-15': { cuerpo: { weight: PESADO }, agua: { value: 2100 } },
  };
  const st = estado(entries, '2026-10-15');
  assert.equal(st.byDate.get('2026-10-15').goal, 2250);
  assert.equal(st.byDate.get('2026-10-15').met, false);
});

test('una racha no se corta porque engordaste', () => {
  // Lo que más dolía: la racha se caía sola, sin haber fallado un día.
  const entries = { '2026-10-01': { cuerpo: { weight: LIVIANO } } };
  for (let d = 2; d <= 14; d += 1) {
    entries[`2026-10-${String(d).padStart(2, '0')}`] = { agua: { value: 2100 } };
  }
  entries['2026-10-15'] = { cuerpo: { weight: PESADO }, agua: { value: 2300 } };
  const st = estado(entries, '2026-10-15');
  assert.equal(st.streak, 14, `esperaba 14 días de racha, obtuve ${st.streak}`);
});

test('los días anteriores a la primera medición usan el peso más viejo', () => {
  // Antes de la primera medición no hay dato. El más viejo es lo más parecido
  // a la verdad; con el último, esos días se juzgaban con un peso del futuro.
  const entries = {
    '2026-10-02': { agua: { value: 2100 } },         // antes de medirse
    '2026-10-05': { cuerpo: { weight: LIVIANO } },
    '2026-10-06': { agua: { value: 2100 } },
  };
  const st = estado(entries, '2026-10-06');
  assert.equal(st.byDate.get('2026-10-02').goal, 2100, 'el primer peso conocido, no el de settings');
  assert.equal(st.byDate.get('2026-10-02').met, true);
});

test('sin ninguna medición, la meta sale del peso de los ajustes', () => {
  const st = estado({ '2026-10-06': { agua: { value: 2250 } } }, '2026-10-06', PESADO);
  assert.equal(st.byDate.get('2026-10-06').goal, waterGoalMl(PESADO));
});

test('sin peso en ningún lado, la meta es la de la actividad', () => {
  assert.equal(goalFor(agua, { value: 100 }), agua.goal);
  assert.equal(goalFor(agua, { value: 100 }, { pesoCorporal: 0 }), agua.goal);
});

test('el peso del día sólo manda en las metas derivadas del peso', () => {
  // Pasarle el peso a una actividad cualquiera no puede moverle la meta.
  for (const id of ['datos', 'pasos', 'piano', 'muaythai']) {
    const a = DEFAULT_ACTIVITIES.find((x) => x.id === id);
    assert.equal(goalFor(a, { value: 1 }, { pesoCorporal: PESADO }), a.goal, id);
  }
});

test('bajar de peso tampoco regala días', () => {
  // La simetría importa: si adelgazás, los días viejos no pasan a estar
  // cumplidos de prepo con una meta más baja que la que tenían.
  const entries = {
    '2026-10-01': { cuerpo: { weight: PESADO } },
    '2026-10-02': { agua: { value: 2100 } },         // no alcanzaba para 64 kg
    '2026-10-10': { cuerpo: { weight: LIVIANO } },
  };
  const st = estado(entries, '2026-10-10', LIVIANO);
  assert.equal(st.byDate.get('2026-10-02').goal, 2250, 'la meta que regía ese día');
  assert.equal(st.byDate.get('2026-10-02').met, false, 'ese día no llegó, y sigue sin llegar');
});
