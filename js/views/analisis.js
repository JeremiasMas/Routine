// Dónde estás en cada disciplina y qué conviene mover.
import { el, formatValue, formatNumber, shortDate, plural } from '../utils.js';
import { chip } from '../ui/components.js';
import {
  tendencia, constancia, proximosSaltos, mejorInversion,
  estancados, proyeccionGrasa, repartoDeFuentes, balances, volumenPorGrupo,
} from '../analisis.js';
import { colorDe, colorDeRango } from '../theme.js';
import { bodySummary } from '../body.js';
import { getData } from '../state.js';
import { isScheduled, weeklyTargetFor } from '../derive.js';
import { esLibre } from '../pausas.js';
import { juicioDeConstancia } from '../copys.js';

/** La sección entera, para pegar en Progreso. */
export function seccionAnalisis(state) {
  const cuerpo = el('div', { class: 'list' });
  const libre = (f) => esLibre(getData().pausas, f);
  let algo = false;
  for (const st of state.byActivity.values()) {
    const tarjeta = tarjetaDe(st, state, libre);
    if (tarjeta) { cuerpo.append(tarjeta); algo = true; }
  }
  if (!algo) return null;
  return el('div', {},
    el('div', { class: 'section-title' },
      el('h2', { text: 'Dónde estás' }), el('small', { text: 'y qué mover' })),
    cuerpo);
}

function tarjetaDe(st, state, libre) {
  const a = st.activity;
  if (st.leveled === false) return null;               // el agua no tiene análisis
  if (!st.history?.length) return null;

  // Medirse más seguido no es progreso, así que la composición corporal no
  // lleva línea de tendencia: su movimiento real es la proyección de grasa.
  const t = a.kind === 'body' ? null : tendencia(st.history, state.today);
  const c = constancia(st, state.today, { libre, tocaba: isScheduled, metaSemanal: weeklyTargetFor });
  const detalle = detalleDe(st, state);
  if (!t && !c && !detalle) return null;

  return el('details', { class: 'analisis', style: `--c:${colorDe(a)}` },
    el('summary', { class: 'analisis__cab' },
      el('span', { class: 'analisis__icono', text: a.icon }),
      el('span', { class: 'analisis__nombre', text: a.name }),
      el('span', { class: 'analisis__estado' }, estadoCorto(st, t))),
    el('div', { class: 'analisis__cuerpo' },
      dondeEstas(st),
      t ? lineaTendencia(st, t) : null,
      c ? lineaConstancia(st, c) : null,
      detalle));
}

/** Lo que se ve sin desplegar: el titular. */
function estadoCorto(st, t) {
  const flecha = !t ? '' : t.dir === 'sube' ? '↑' : t.dir === 'baja' ? '↓' : '→';
  const clase = !t ? '' : t.dir === 'sube' ? 'chip--ok' : t.dir === 'baja' ? 'chip--warn' : '';
  const nombre = st.strengthOverall?.name || st.tier?.name || `Nivel ${st.level.level}`;
  const color = colorDeRango(st.tier, st.tier?.index) || st.tier?.color || 'var(--accent)';
  return el('span', {}, chip(nombre, 'chip--tier', `--t:${color}`),
    !t ? null
      : t.antes === 0 ? chip('nuevo', 'chip--ok')
        : chip(`${flecha} ${Math.abs(Math.round(t.cambio * 100))}%`, clase));
}

function dondeEstas(st) {
  const a = st.activity;
  const partes = [];
  if (st.strengthOverall) {
    const s = st.strengthOverall;
    partes.push(`Fuerza general: ${s.name}${s.next ? `, camino a ${s.next}` : ''}.`);
    partes.push(`${plural(s.lifts, 'movimiento medido', 'movimientos medidos')}.`);
  } else {
    partes.push(`Nivel ${st.level.level}${st.tier ? ` · ${st.tier.name}` : ''}.`);
    partes.push(acumulado(st));
  }
  return el('p', { class: 'hint', text: partes.join(' ') });
}

/**
 * Lo juntado hasta hoy, dicho en el idioma de cada disciplina.
 *
 * "1 mediciones acumulados" era el precio de tener una sola frase para todo:
 * la unidad de una actividad no siempre entra en una oración genérica.
 */
function acumulado(st) {
  const a = st.activity;
  if (a.kind === 'body') return `${plural(st.total, 'medición registrada', 'mediciones registradas')}.`;
  if (a.kind === 'writing') return `${plural(st.total, 'post publicado', 'posts publicados')}.`;
  if (a.kind === 'gym') return `${plural(st.total, 'serie hecha', 'series hechas')}.`;
  // En minutos el formato pasa a horas, y las horas son femeninas.
  const participio = a.unit === 'min' && st.total >= 60 ? 'acumuladas' : 'acumulados';
  return `${formatValue(st.total, a.unit)} ${participio}.`;
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
function tarjetaDeVolumen(v) {
  const flojos = v.filas.filter((f) => f.estado === 'bajo');
  const pasados = v.filas.filter((f) => f.estado === 'alto');

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
        el('div', { class: 'row__sub', text: `${f.min}-${f.max} por semana es donde suele rendir` })))),
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
