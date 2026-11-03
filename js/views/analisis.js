// Dónde estás en cada disciplina y qué conviene mover.
import { el, formatValue, formatNumber, shortDate, plural } from '../utils.js';
import { chip, xpBar } from '../ui/components.js';
import {
  tendencia, constancia, proximosSaltos, mejorInversion,
  estancados, proyeccionGrasa, repartoDeFuentes, balances, volumenPorGrupo,
  rangoDe, ordenarPorXp, resumenDeDisciplina, desajustesDeLaRutina,
} from '../analisis.js';
import { colorDe, colorDeRango } from '../theme.js';
import { bodySummary } from '../body.js';
import { getData } from '../state.js';
import { isScheduled, weeklyTargetWithPauses } from '../derive.js';
import { esLibre } from '../pausas.js';
import { juicioDeConstancia } from '../copys.js';

/**
 * La única lista de disciplinas de Progreso.
 *
 * Eran dos secciones con las mismas ocho filas: "Dónde estás" arriba, que se
 * desplegaba, y "Tus disciplinas" abajo, que linkeaba. Emoji, nombre y rango
 * repetidos, unos 760 px de página, y el gimnasio mostrando "Atleta" en una y
 * "Intermedio" en la otra como si fueran dos medidas en desacuerdo.
 *
 * Ahora es una sola, ordenada por XP. La que tiene algo que analizar se
 * despliega; la que no, es un link y se ve igual. El tipo de elemento dice qué
 * hace cada una, en vez de dos afordancias idénticas peleando por el mismo
 * toque.
 */
export function seccionAnalisis(state) {
  const libre = (f, id) => esLibre(state.pausas, f, id);
  const filas = ordenarPorXp([...state.byActivity.values()])
    .map((st) => filaDe(st, state, libre))
    .filter(Boolean);
  if (!filas.length) return null;
  return el('div', {},
    el('div', { class: 'section-title' },
      el('h2', { text: 'Tus disciplinas' }),
      el('small', { text: 'dónde estás y qué mover' })),
    el('div', { class: 'list' }, filas));
}

/** Una fila: desplegable si hay algo que analizar, link si no. */
function filaDe(st, state, libre) {
  const a = st.activity;
  if (!a) return null;

  // Medirse más seguido no es progreso, así que la composición corporal no
  // lleva línea de tendencia: su movimiento real es la proyección de grasa.
  const t = a.kind === 'body' ? null : tendencia(st.history, state.today);
  const metaSemanal = (act, w) => weeklyTargetWithPauses(act, w, state.pausas);
  const c = st.history?.length
    ? constancia(st, state.today, { libre, tocaba: isScheduled, metaSemanal })
    : null;
  const detalle = st.history?.length ? detalleDe(st, state) : null;
  const hayAnalisis = !!(t || c || detalle);

  const cabecera = [
    el('span', { class: 'analisis__icono', text: a.icon }),
    el('div', { class: 'analisis__main' },
      el('div', { class: 'analisis__linea' },
        el('span', { class: 'analisis__nombre', text: a.name }),
        el('span', { class: 'analisis__estado' }, estadoCorto(st, t))),
      el('div', { class: 'analisis__barra' }, xpBar(st.level?.pct || 0)),
      el('div', { class: 'row__sub', text: resumenDeDisciplina(st) })),
  ];

  // Sin nada que analizar no hay nada que desplegar: queda el link de siempre,
  // con la misma pinta. Un desplegable vacío se lee como que la app se colgó.
  if (!hayAnalisis) {
    return el('a', {
      class: 'analisis analisis--link', href: `#/actividad/${st.id}`,
      style: `--c:${colorDe(a)}`,
    }, cabecera, el('span', { class: 'muted', text: '›' }));
  }

  return el('details', { class: 'analisis', style: `--c:${colorDe(a)}` },
    el('summary', { class: 'analisis__cab' }, cabecera,
      el('span', { class: 'analisis__flecha', text: '⌄' })),
    el('div', { class: 'analisis__cuerpo' },
      dondeEstas(st),
      t ? lineaTendencia(st, t) : null,
      c ? lineaConstancia(st, c) : null,
      detalle,
      // El link que antes era toda la fila de abajo. Acá adentro no compite
      // con el despliegue por el mismo toque.
      el('a', { class: 'analisis__ir', href: `#/actividad/${st.id}` },
        `Ver ${a.name} en detalle ›`)));
}

/** Lo que se ve sin desplegar: el titular. */
function estadoCorto(st, t) {
  const flecha = !t ? '' : t.dir === 'sube' ? '↑' : t.dir === 'baja' ? '↓' : '→';
  const clase = !t ? '' : t.dir === 'sube' ? 'chip--ok' : t.dir === 'baja' ? 'chip--warn' : '';
  const rango = rangoDe(st);
  const nombre = rango?.nombre || `Nivel ${st.level?.level ?? 1}`;
  const color = colorDeRango(st.tier, st.tier?.index) || st.tier?.color || 'var(--accent)';
  return el('span', {}, chip(nombre, 'chip--tier', `--t:${color}`),
    !t ? null
      : t.antes === 0 ? chip('nuevo', 'chip--ok')
        : chip(`${flecha} ${Math.abs(Math.round(t.cambio * 100))}%`, clase));
}

/**
 * Lo que el desplegable agrega sobre la fila, y sólo eso.
 *
 * Antes abría con "Nivel 11 · Nak Su. 91h 30m acumuladas." — que es palabra
 * por palabra lo que ahora dice la fila de arriba. Combinar las dos secciones
 * dejó esa frase repitiendo a dos centímetros de distancia.
 *
 * Queda sólo donde suma: el gimnasio, que se mide contra una escala de fuerza
 * y necesita decir contra qué se compara.
 */
function dondeEstas(st) {
  if (!st.strengthOverall) return null;
  const s = st.strengthOverall;
  const partes = [`Fuerza general: ${s.name}${s.next ? `, camino a ${s.next}` : ''}.`];
  // El chip de arriba dice otra palabra para el mismo escalón: uno es la
  // escala de fuerza y el otro el nombre que le pone la app. Sin decirlo,
  // parecen dos medidas que no se ponen de acuerdo.
  const rango = rangoDe(st);
  if (rango?.tambien) partes.push(`En la escala de la app, ese mismo escalón es "${rango.nombre}".`);
  partes.push(`${plural(s.lifts, 'movimiento medido', 'movimientos medidos')}.`);
  return el('p', { class: 'hint', text: partes.join(' ') });
}

/** Un valor con su unidad, cuidando la concordancia cuando es uno solo. */
function cantidad(a, n) {
  if (a.kind === 'writing') return plural(n, 'post', 'posts');
  if (a.kind === 'gym') return plural(n, 'serie', 'series');
  if (a.kind === 'body') return plural(n, 'medición', 'mediciones');
  return formatValue(n, a.unit);
}

function lineaTendencia(st, t) {
  const a = st.activity;
  const pct = Math.abs(Math.round(t.cambio * 100));
  const comparacion = `${cantidad(a, t.ahora)} en las últimas 4 semanas, contra ${cantidad(a, t.antes)} en las 4 anteriores.`;
  // Con cero atrás el porcentaje no significa nada: todo crecimiento desde
  // la nada da 100%, y decirlo suena a un logro que no es.
  const texto = t.antes === 0
    ? `Arrancaste hace poco: ${cantidad(a, t.ahora)} en las últimas 4 semanas y nada en las 4 anteriores. Recién con otro mes hay con qué comparar.`
    : t.dir === 'estable'
      ? `Venís parejo: ${comparacion}`
      : t.dir === 'sube'
        ? `Subiste ${pct}%: ${comparacion}`
        : `Bajaste ${pct}%: ${comparacion}`;
  return el('p', { class: 'hint', style: 'margin-top:8px', text: texto });
}

function lineaConstancia(st, c) {
  const pct = Math.round(c.pct * 100);
  const juicio = juicioDeConstancia(st.activity.id, c.cumplidos, c.total);
  // Donde la meta es semanal, contar días sería injusto: mover la sesión del
  // lunes al martes no es faltar.
  const cuenta = c.modo === 'semanal'
    ? `Llegaste a la meta en ${c.cumplidos} de ${plural(c.total, 'semana', 'semanas')} (${pct}%).`
    : `Cumpliste ${c.cumplidos} de ${plural(c.total, 'día que tocaba', 'días que tocaban')} (${pct}%).`;
  return el('p', { class: 'hint', style: 'margin-top:8px', text: `${cuenta} ${juicio}` });
}

/** La parte propia de cada disciplina. */
function detalleDe(st, state) {
  if (st.activity.kind === 'gym') return detalleGimnasio(st, state);
  if (st.activity.kind === 'body') return detalleCuerpo(st, state);
  if (st.activity.kind === 'multi') return detalleFuentes(st);
  return null;
}

function detalleGimnasio(st, state) {
  const caja = el('div', { style: 'margin-top:10px' });
  const saltos = proximosSaltos(st.strength);
  const general = st.strengthOverall;

  const inversiones = mejorInversion(st.strength);
  if (inversiones.length && general) {
    const mejor = inversiones[0];
    const barato = saltos[0];
    const kg = (n) => `${formatNumber(Math.round(n * 10) / 10)} kg`;

    caja.append(el('div', { class: 'analisis__foco' },
      el('div', { style: 'font-weight:700' }, '🎯 Lo que más te conviene empujar'),
      el('p', { class: 'hint', style: 'margin-top:6px' },
        el('b', { text: mejor.nombre }), ': te faltan ', el('b', { text: kg(mejor.faltan) }),
        ` de 1RM para llegar a ${mejor.nivelSiguiente}`,
        mejor.esPesoCorporal ? ' (de lastre, no de barra)' : '', '. ',
        `Con eso solo, tu fuerza general sube ${Math.round(mejor.delta * 100)}% de una categoría.`),
      el('p', { class: 'hint', style: 'margin-top:6px' },
        'Tu nivel es el promedio de dónde está cada movimiento en su propia escala, ',
        'así que rinde más subir uno atrasado que exprimir el que ya casi terminó su banda.'),
      // El más barato no siempre es el que más rinde: si le falta poco suele
      // ser porque ya está por terminar su banda, y entonces mueve poco.
      barato && barato.lift !== mejor.lift
        ? el('p', { class: 'hint', style: 'margin-top:6px' },
            `Si querés algo rápido, ${barato.nombre} está a ${kg(barato.faltan)}, `,
            'pero mueve menos el promedio porque ya casi terminó su categoría.')
        : null));
  }

  // El más rezagado, que no siempre es el mismo que el salto más barato.
  // Sólo vale nombrarlo si el foco de arriba no lo nombró ya.
  const destacado = inversiones[0]?.lift;
  if (general?.weakest && destacado && general.weakest.liftKey !== destacado) {
    caja.append(el('p', { class: 'hint', style: 'margin-top:8px' },
      `Tu movimiento más atrasado sigue siendo ${general.weakest.lift}: `,
      'es el que más lejos está del resto, aunque llegar a su próxima categoría cueste más.'));
  }

  // Pares que conviene que vayan parejos.
  const pares = balances(st.strength);
  const desparejos = pares.filter((x) => x.desparejo);
  if (desparejos.length) {
    const peor = desparejos[0];
    caja.append(el('div', { class: 'analisis__foco', style: 'margin-top:10px' },
      el('div', { style: 'font-weight:700' }, '⚖️ Desbalanceado'),
      el('p', { class: 'hint', style: 'margin-top:6px' },
        el('b', { text: peor.fuerte.lift }), ' te lleva ',
        el('b', { text: `${formatNumber(Math.round(peor.brecha * 10) / 10)} categorías` }),
        ' de ventaja a ', el('b', { text: peor.flojo.lift }), '. ', peor.consejo),
      el('div', { class: 'list', style: 'margin-top:8px' },
        pares.map((x) => el('div', { class: 'row' },
          el('div', { class: 'row__main' },
            el('div', { text: x.nombre }),
            el('div', { class: 'row__sub', text: `${x.fuerte.lift} por encima de ${x.flojo.lift}` })),
          el('div', { class: 'row__value', style: x.desparejo ? 'color:var(--gold)' : '',
            text: `${formatNumber(Math.round(x.brecha * 10) / 10)}` })))),
      el('p', { class: 'hint', style: 'margin-top:8px' },
        'La diferencia está en categorías de la escala, no en kilos: compara dónde está cada ',
        'movimiento en su propia tabla, que es lo único comparable entre ejercicios distintos.')));
  }

  // Cómo se reparte el trabajo. El total de series no dice nada del reparto:
  // se pueden hacer treinta y que veinte se las lleve la espalda.
  const reparto = volumenPorGrupo(st, state.today);
  if (reparto) caja.append(tarjetaDeVolumen(reparto));

  const trabados = estancados(st, state.today);
  if (trabados.length) {
    caja.append(el('div', { class: 'analisis__foco', style: 'margin-top:10px' },
      el('div', { style: 'font-weight:700' }, '🧱 Trabados'),
      el('div', { class: 'list', style: 'margin-top:6px' },
        trabados.slice(0, 4).map((e) => el('div', { class: 'row' },
          el('div', { class: 'row__main' },
            el('div', { text: e.nombre }),
            el('div', { class: 'row__sub', text: `sin récord hace ${plural(e.dias, 'día', 'días')}, ${plural(e.sesiones, 'sesión', 'sesiones')} desde entonces` })),
          el('div', { class: 'row__value', text: `${formatNumber(Math.round(e.record.e1rm))} kg` })))),
      el('p', { class: 'hint', style: 'margin-top:8px' },
        'Cuando un ejercicio no se mueve en más de un mes, insistir con el mismo peso no suele destrabarlo. ',
        'Lo que sí: bajar un 10% la carga y volver a subir de a poco, o cambiar el rango de repeticiones.')));
  }

  if (!caja.childNodes.length) return null;
  return caja;
}

/** Series semanales por grupo, contra el rango donde la gente progresa. */
/** Lo que la rutina planea para ese grupo, si no coincide con lo que hiciste. */
function planDe(plan, id) {
  const f = plan.porId.get(id);
  if (!f) return null;
  return el('span', {
    style: f.estado === 'ok' ? '' : 'color:var(--gold)',
    text: ` · tu rutina planea ${formatNumber(f.porSemana)}`,
  });
}

/**
 * Cuando el problema no es cómo entrenaste sino cómo está escrita la rutina.
 *
 * Es otra conversación: un grupo corto en el plan no se arregla yendo más
 * seguido, porque las series que faltan no están anotadas en ningún día.
 */
function rutinaDesajustada(plan) {
  if (!plan.bajos.length && !plan.altos.length) return null;
  // Sin verbo que concuerde: "queda corto pantorrillas" es lo que sale de
  // elegir singular o plural por la cantidad de grupos en vez de por el
  // grupo. Cada uno con su rango al lado, para no tener que buscarlo arriba.
  const lista = (fs) => fs
    .map((f) => `${f.nombre.toLowerCase()} ${formatNumber(f.porSemana)} de ${f.min}-${f.max}`)
    .join(', ');
  return el('div', { class: 'analisis__foco', style: 'margin-top:10px' },
    el('div', { style: 'font-weight:700' }, '📋 La rutina, tal como está escrita'),
    el('p', { class: 'hint', style: 'margin-top:6px' },
      'Series por semana sumando los tres días.'),
    plan.bajos.length
      ? el('p', { class: 'hint', style: 'margin-top:4px' }, `Por debajo: ${lista(plan.bajos)}.`)
      : null,
    plan.altos.length
      ? el('p', { class: 'hint', style: 'margin-top:4px' }, `Por encima: ${lista(plan.altos)}.`)
      : null,
    el('p', { class: 'hint', style: 'margin-top:6px' },
      'Esto no se arregla entrenando mejor: las series que faltan no están ',
      'anotadas en ningún día, y las que sobran se hacen igual aunque rindan menos.'));
}

function tarjetaDeVolumen(v) {
  const flojos = v.filas.filter((f) => f.estado === 'bajo');
  const pasados = v.filas.filter((f) => f.estado === 'alto');
  // Lo que la rutina planea, al lado de lo que hiciste. Son preguntas
  // distintas: una se arregla entrenando, la otra cambiando la rutina.
  const plan = desajustesDeLaRutina();

  const barra = (f) => {
    // La barra llega hasta el máximo del rango; la zona verde marca dónde
    // empieza a rendir. Ver el hueco dice más que el número.
    const tope = Math.max(f.max, f.porSemana);
    const pct = (n) => `${Math.min(100, (n / tope) * 100)}%`;
    const color = f.estado === 'ok' ? 'var(--ok)' : 'var(--gold)';
    return el('div', { class: 'vol' },
      el('div', { class: 'vol__zona', style: `left:${pct(f.min)};right:calc(100% - ${pct(f.max)})` }),
      el('div', { class: 'vol__barra', style: `width:${pct(f.porSemana)};background:${color}` }));
  };

  return el('div', { class: 'analisis__foco', style: 'margin-top:10px' },
    el('div', { style: 'font-weight:700' }, '📐 Cómo se reparte el trabajo'),
    el('p', { class: 'hint', style: 'margin-top:6px',
      text: v.semanas === 1
        ? 'Series de la última semana que entrenaste.'
        : `Series por semana, promediadas sobre las ${v.semanas} semanas que entrenaste.` }),
    el('div', { class: 'list', style: 'margin-top:8px' },
      v.filas.map((f) => el('div', { class: 'row', style: 'display:block' },
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:baseline' },
          el('div', { text: f.nombre }),
          el('div', { class: 'row__value', style: f.estado === 'ok' ? '' : 'color:var(--gold)',
            text: formatNumber(f.porSemana) })),
        barra(f),
        el('div', { class: 'row__sub' },
          `${f.min}-${f.max} por semana es donde suele rendir`,
          planDe(plan, f.id))))),
    rutinaDesajustada(plan),
    flojos.length
      ? el('p', { class: 'hint', style: 'margin-top:8px' },
          `Abajo del rango: ${flojos.map((f) => f.nombre.toLowerCase()).join(', ')}. `,
          'Con ese volumen un músculo se mantiene, pero no es de donde va a venir tu próximo salto de fuerza.')
      : null,
    pasados.length
      ? el('p', { class: 'hint', style: 'margin-top:8px' },
          `Arriba del rango: ${pasados.map((f) => f.nombre.toLowerCase()).join(', ')}. `,
          'Más series no siempre es más músculo: pasado cierto punto el límite es cuánto recuperás, no cuánto entrenás.')
      : null,
    el('p', { class: 'hint', style: 'margin-top:8px' },
      'Los ejercicios que ayudan cuentan media serie: un remo entrena bíceps, pero no como un curl. ',
      'Los rangos son referencias, como las tablas de fuerza: ubican, no deciden decimales.'));
}

function detalleCuerpo(st, state) {
  // El porcentaje no se guarda: se calcula de las medidas de cada día.
  const historial = (st.history || [])
    .map((h) => ({ date: h.date, pct: h.entry ? bodySummary(h.entry, getData().settings || {})?.fatPct : null }))
    .filter((m) => Number.isFinite(m.pct));
  const meta = st.activity.targetBodyFat || 13;
  const p = proyeccionGrasa(historial, meta, state.today);

  const texto = {
    'pocos-datos': `Con ${plural(p.faltan, 'medición más', 'mediciones más')} ya se puede proyectar cuándo llegás al ${meta}%.`,
    'poco-tiempo': 'Falta tiempo entre mediciones: con menos de tres semanas cualquier ruido parece una tendencia.',
    'llegaste': `Llegaste al ${meta}%. 🎉`,
    'plano': `Hace ${p.dias} días que el porcentaje no se mueve (${formatNumber(Math.abs(p.porSemana * 10) / 10)} puntos por semana es ruido de medición). Si la meta sigue siendo el ${meta}%, algo tiene que cambiar.`,
    'lejos': 'Al ritmo actual la meta queda a más de dos años: el ritmo es tan chico que proyectarlo no dice nada.',
    'en-camino': p.estado === 'en-camino'
      ? `Vas bajando ${formatNumber(Math.abs(Math.round(p.porSemana * 100) / 100))} puntos por semana. A este ritmo llegás al ${meta}% alrededor del ${shortDate(p.fecha)} (${p.dias} días).`
      : '',
  }[p.estado];

  return texto ? el('div', { class: 'analisis__foco', style: 'margin-top:10px' },
    el('div', { style: 'font-weight:700' }, `📉 Camino al ${meta}%`),
    el('p', { class: 'hint', style: 'margin-top:6px', text: texto })) : null;
}

function detalleFuentes(st) {
  const r = repartoDeFuentes(st.activity, st.sourceTotals);
  if (!r) return null;
  const fuerte = r.filas[0];
  const flojo = r.filas[r.filas.length - 1];
  return el('div', { style: 'margin-top:10px' },
    el('div', { class: 'list' }, r.filas.map((f) => el('div', { class: 'row' },
      el('div', { class: 'row__main' },
        el('div', { text: f.nombre }),
        el('div', { class: 'row__sub', text: `${formatNumber(f.cantidad)} en total` })),
      el('div', { class: 'row__value', text: `${Math.round(f.pct * 100)}%` })))),
    r.desbalance > 0.6
      ? el('p', { class: 'hint', style: 'margin-top:8px' },
          `Casi todo tu francés viene de ${fuerte.nombre}. `,
          flojo.id === 'cbf'
            ? 'Duolingo entrena reconocer y producir frases sueltas, pero casi no entrena el oído: sin escuchar a alguien hablando a velocidad real, entender una conversación sigue siendo el cuello de botella.'
            : 'El podcast entrena el oído, pero escuchar no hace producir: sin ejercicios que te obliguen a armar frases, el vocabulario queda pasivo.')
      : el('p', { class: 'hint', style: 'margin-top:8px' },
          'Tenés las dos fuentes equilibradas: una entrena el oído y la otra te hace producir. Así está bien.'));
}
