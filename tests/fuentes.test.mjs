import test from 'node:test';
import assert from 'node:assert/strict';
import { multiValue, derive } from '../js/derive.js';
import { DEFAULT_ACTIVITIES } from '../js/config.js';
import { singular, unidadesParaLaMeta } from '../js/ui/logger.js';

// Qué pasa cuando una actividad que se medía con un solo número pasa a tener
// varias fuentes, como Análisis de datos al sumarle Brilliant.

const DATOS = {
  kind: 'multi', goal: 45, unit: 'min',
  sources: [{ id: 'curso', minutes: 1 }, { id: 'brilliant', minutes: 8 }],
};

// ---------------------------------------------------------------------------
// El respaldo de los registros viejos
// ---------------------------------------------------------------------------

test('un registro de antes de las fuentes sigue valiendo lo que valía', () => {
  // Sin esto, convertir una actividad a multi-fuente le borraba el historial
  // en silencio: minutos que de verdad entrenaste pasaban a valer cero, y con
  // ellos la XP, el nivel y la racha.
  assert.equal(multiValue(DATOS, { value: 45 }), 45);
  assert.equal(multiValue(DATOS, { value: 82 }), 82);
});

test('las fuentes anotadas le ganan al valor suelto', () => {
  // El respaldo es para lo que quedó atrás, no una segunda forma de cargar.
  assert.equal(multiValue(DATOS, { sources: { brilliant: 6 }, value: 999 }), 48);
});

test('las fuentes se suman en minutos', () => {
  assert.equal(multiValue(DATOS, { sources: { brilliant: 6 } }), 48, '6 lecciones');
  assert.equal(multiValue(DATOS, { sources: { curso: 30 } }), 30, 'media hora de curso');
  assert.equal(multiValue(DATOS, { sources: { curso: 30, brilliant: 2 } }), 46, 'las dos cosas');
});

test('un día sin nada vale cero, no NaN', () => {
  assert.equal(multiValue(DATOS, {}), 0);
  assert.equal(multiValue(DATOS, null), 0);
  assert.equal(multiValue(DATOS, { sources: {} }), 0);
  assert.equal(multiValue(DATOS, { value: 'un rato' }), 0);
});

test('seis lecciones de Brilliant cumplen la meta del día, y cinco no', () => {
  // Sobre el catálogo de verdad, no sobre un objeto de prueba: la equivalencia
  // es el número que se le prometió al usuario, y si la estimación por lección
  // se mueve sin querer, la meta pasa a pedir otra cosa sin que nadie avise.
  const datos = DEFAULT_ACTIVITIES.find((a) => a.id === 'datos');
  const brilliant = datos.sources.find((f) => f.id === 'brilliant');
  assert.ok(multiValue(datos, { sources: { brilliant: 6 } }) >= datos.goal,
    `6 lecciones a ${brilliant.minutes} min no llegan a los ${datos.goal} de la meta`);
  assert.ok(multiValue(datos, { sources: { brilliant: 5 } }) < datos.goal,
    `con ${brilliant.minutes} min por lección alcanzan 5, así que la estimación quedó generosa`);
});

test('el curso se carga en minutos, uno a uno', () => {
  // Es lo que preserva la forma vieja de anotar: 45 escritos en Curso tienen
  // que seguir siendo 45 minutos, o el cambio le movería la vara a lo que ya
  // venía haciendo.
  const datos = DEFAULT_ACTIVITIES.find((a) => a.id === 'datos');
  const curso = datos.sources.find((f) => f.id === 'curso');
  assert.equal(curso.minutes, 1, 'un minuto de curso es un minuto');
  assert.equal(multiValue(datos, { sources: { curso: 45 } }), datos.goal);
});

// ---------------------------------------------------------------------------
// Que el cambio del catálogo llegue a quien ya tenía datos
// ---------------------------------------------------------------------------

/** Carga `guardado` como si fuera el localStorage del teléfono. */
async function cargar(guardado) {
  const antes = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify(guardado), setItem: () => {} };
  try {
    const { load } = await import('../js/state.js');
    return load();
  } finally {
    if (antes === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = antes;
  }
}

const guardadoViejo = (extra = {}, entries = {}) => ({
  version: 1,
  activities: [{ id: 'datos', name: 'Análisis de datos', icon: '📊', kind: 'number',
    unit: 'min', goal: 45, streakMode: 'daily', ...extra }],
  entries, unlocked: {}, settings: {},
});

test('la actividad guardada adopta las fuentes nuevas del catálogo', async () => {
  // Lo guardado le gana al catálogo en todo campo que ya traiga, así que el
  // `kind: 'number'` viejo tapaba la conversión: la actividad se quedaba con
  // las fuentes y sin saber usarlas, y Brilliant no se podía cargar.
  const datos = (await cargar(guardadoViejo())).activities.find((a) => a.id === 'datos');
  assert.equal(datos.kind, 'multi');
  assert.ok(datos.sources?.some((f) => f.id === 'brilliant'), 'con Brilliant entre las fuentes');
});

test('adoptar las fuentes no revierte lo que tocaste a mano', async () => {
  const datos = (await cargar(guardadoViejo({ goal: 90, name: 'Data science' })))
    .activities.find((a) => a.id === 'datos');
  assert.equal(datos.goal, 90, 'la meta que elegiste');
  assert.equal(datos.name, 'Data science', 'y el nombre');
  assert.equal(datos.kind, 'multi', 'pero el kind sí se adopta');
});

test('a quien ya definió sus propias fuentes no se le tocan', async () => {
  const mias = [{ id: 'mia', name: 'La mía', unitLabel: 'cosas', minutes: 3 }];
  const datos = (await cargar(guardadoViejo({ kind: 'multi', sources: mias })))
    .activities.find((a) => a.id === 'datos');
  assert.equal(datos.sources.length, 1, 'las propias mandan');
  assert.equal(datos.sources[0].id, 'mia');
});

test('los minutos registrados antes de la conversión siguen contando', async () => {
  // La prueba que de verdad importa: 21 sesiones de 45 minutos no pueden pasar
  // a valer cero porque la actividad cambió de forma.
  const dias = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const entries = Object.fromEntries(dias.map((d) => [d, { datos: { value: 45 } }]));
  const st = derive(await cargar(guardadoViejo({}, entries)), '2026-10-02');
  const datos = st.byActivity.get('datos');
  for (const d of dias) {
    assert.equal(datos.byDate.get(d)?.value, 45, `${d}: los 45 minutos siguen ahí`);
    assert.equal(datos.byDate.get(d)?.met, true, `${d}: y la meta sigue cumplida`);
  }
  assert.equal(datos.streak, dias.length, 'la racha no se corta');
  assert.ok(datos.xp > 0, 'y la XP tampoco se borra');
});

// ---------------------------------------------------------------------------
// La etiqueta de una unidad cuando es una sola
// ---------------------------------------------------------------------------

test('el singular de una unidad no se come el acento ni la vocal', () => {
  // La regla vieja sacaba una `es` entera: dejaba "1 leccion" sin acento, y
  // "1 seri" de "series", que es una unidad que esta app usa de verdad.
  assert.equal(singular('lecciones'), 'lección');
  assert.equal(singular('mediciones'), 'medición');
  assert.equal(singular('series'), 'serie');
  assert.equal(singular('minutos'), 'minuto');
  assert.equal(singular('episodios'), 'episodio');
  assert.equal(singular('posts'), 'post');
});

test('una unidad que ya está en singular no se recorta', () => {
  assert.equal(singular('min'), 'min');
  assert.equal(singular('ml'), 'ml');
});

test('una etiqueta vacía no rompe', () => {
  assert.equal(singular(''), '');
  assert.equal(singular(null), '');
  assert.equal(singular(undefined), '');
});

test('cada fuente del catálogo tiene un singular legible', () => {
  for (const a of DEFAULT_ACTIVITIES) {
    for (const f of a.sources || []) {
      const uno = singular(f.unitLabel);
      assert.ok(uno.length >= 3, `${a.name} / ${f.name}: "${f.unitLabel}" queda en "${uno}"`);
      assert.ok(!/[^a-záéíóúñü]$/i.test(uno), `"${uno}" no termina bien`);
    }
  }
});

test('el ejemplo de cada fuente alcanza la meta, no se queda corto', () => {
  // Redondear para abajo daba "5 lecciones de Brilliant" para una meta de 45
  // minutos: cinco por ocho son cuarenta. El ejemplo mandaría a quedarse a
  // cinco minutos de cumplir, y encima en la pantalla donde uno lo copia.
  for (const a of DEFAULT_ACTIVITIES) {
    if (!a.sources?.length) continue;
    for (const { fuente, n } of unidadesParaLaMeta(a)) {
      assert.ok(n * fuente.minutes >= a.goal,
        `${a.name}: ${n} × ${fuente.name} son ${n * fuente.minutes} y la meta es ${a.goal}`);
      // Y que no se vaya de largo: el ejemplo tiene que ser el mínimo que sirve.
      assert.ok((n - 1) * fuente.minutes < a.goal,
        `${a.name}: con ${n - 1} de ${fuente.name} ya alcanzaba`);
    }
  }
});

test('una fuente sin minutos declarados no aparece como ejemplo', () => {
  // Si no se sabe cuánto rinde, no hay ejemplo honesto que dar.
  const act = { goal: 45, sources: [{ id: 'a', minutes: 0 }, { id: 'b' }, { id: 'c', minutes: 8 }] };
  const ejemplos = unidadesParaLaMeta(act);
  assert.equal(ejemplos.length, 1);
  assert.equal(ejemplos[0].fuente.id, 'c');
});

test('una actividad sin fuentes no da ejemplos ni rompe', () => {
  assert.deepEqual(unidadesParaLaMeta({ goal: 45 }), []);
  assert.deepEqual(unidadesParaLaMeta(null), []);
});
