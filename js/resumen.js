/**
 * La meta del gimnasio sale de las series que planea la rutina de ese día —el
 * lunes 36, el miércoles 42, el viernes 39—, y eso vive en la plantilla, no en
 * un número fijo.
 *
 * goalFor la saca del registro, pero antes de cargar la primera serie no hay
 * registro: ahí caía en la meta suelta de la actividad y el widget decía 30
 * cualquiera fuera el día. La pantalla de hoy ya pasaba la plantilla; esto es
 * lo mismo del lado del widget.
 */
function conLaRutinaDelDia(activity, entry, fecha) {
  // El filtro por kind le sobra a goalFor, que ya mira lo mismo. Está igual
  // para no devolverle una sesión de gimnasio inventada a la caminata.
  if (entry || activity.kind !== 'gym') return entry;
  const plantilla = templateForDay(keyToDate(fecha).getDay());
  return plantilla ? { templateId: plantilla.id } : entry;
}

/**
 * El día de hoy, resumido para que lo pueda mostrar algo que no es la web.
 *
 * El widget de Android corre en otro proceso: no tiene WebView, no puede leer
 * el localStorage y no sabe nada de derive.js. Así que la web le deja servido
 * un resumen chiquito cada vez que cambia algo, y el widget sólo lo dibuja.
 *
 * Módulo puro: entra el estado derivado, sale un objeto serializable. Todo lo
 * que el widget necesita decidir tiene que estar acá adentro, porque del otro
 * lado no hay con qué calcular nada.
 */
import { isScheduledWithPauses, goalFor } from './derive.js';
import { templateForDay } from './config.js';
import { formatValue, formatNumber, esFechaValida, keyToDate } from './utils.js';
import { colorDe } from './theme.js';

/** Versión del formato. Si cambia la forma, la app vieja no lo interpreta mal. */
export const VERSION_RESUMEN = 1;

/** Cuántas misiones entran en el widget antes de resumir el resto. */
export const MAX_MISIONES = 6;

/**
 * ¿Esta actividad se puede dar por cumplida con un solo toque?
 *
 * Sólo donde "cumplir" es un número único y sin ambigüedad: minutos, pasos,
 * mililitros. En el gimnasio o en una medición no existe un valor obvio, y
 * ofrecerlo sería inventar el dato.
 *
 * Los pasos quedan afuera adentro de la app: los escribe Health Connect, y un
 * valor puesto a mano se pisa en la siguiente lectura.
 */
export function puedeUnToque(activity, { enApp = false } = {}) {
  if (!activity || activity.kind !== 'number') return false;
  if (activity.id === 'pasos' && enApp) return false;
  return (Number(activity.goal) || 0) > 0;
}

/**
 * El resumen del día para el widget.
 *
 * @param {object} state el estado derivado
 * @param {{enApp?:boolean, fecha?:string}} opciones
 * @returns {object} listo para JSON.stringify
 */
export function resumenDelDia(state, { enApp = false, fecha = null } = {}) {
  const hoy = fecha || state.today;
  const toca = state.activities.filter((a) => isScheduledWithPauses(a, hoy, state.pausas));

  const misiones = toca.map((a, i) => {
    const st = state.byActivity.get(a.id);
    const dia = st?.byDate.get(hoy);
    const meta = goalFor(a, conLaRutinaDelDia(a, dia?.entry, hoy));
    const valor = Number(dia?.value) || 0;
    return {
      id: a.id,
      // El orden del día, que no cambia con lo que vayas cumpliendo. La lista
      // sale ordenada por lo que falta primero, y un widget que le da un
      // anillo fijo a cada disciplina necesita un orden que no se mueva.
      orden: i,
      icono: a.icon,
      nombre: a.name,
      hecho: Boolean(dia?.met),
      // Lo que se lee en la fila: cuánto llevás de cuánto, ya formateado, que
      // del otro lado no hay de dónde sacar el separador de miles ni la unidad.
      texto: dia?.met
        ? formatValue(valor, a.unit)
        : `${formatNumber(valor)} / ${formatValue(meta, a.unit)}`,
      meta,
      unidad: a.unit,
      // Para los widgets que dibujan anillos: cuánto llevás de la meta, y de
      // qué color es esta disciplina en el tema puesto. Del otro lado no hay
      // CSS del que sacarlo ni con qué calcularlo.
      pct: meta > 0 ? Math.max(0, Math.min(1, valor / meta)) : (dia?.met ? 1 : 0),
      color: colorDe(a) || '#ef2b34',
      // Si se acumula sola durante el día o si hay que sentarse a hacerla: un
      // widget muestra lo primero como anillo y lo segundo como pendiente.
      continua: a.continua === true,
      // Si se puede marcar desde el widget, y con qué valor.
      unToque: puedeUnToque(a, { enApp }) && !dia?.met ? meta : 0,
    };
  });

  const hechas = misiones.filter((m) => m.hecho).length;

  return {
    v: VERSION_RESUMEN,
    fecha: hoy,
    xp: state.daily.get(hoy)?.xp || 0,
    nivel: state.player?.level || 1,
    rango: state.player?.title?.name || '',
    racha: state.globalStreak || 0,
    hechas,
    total: misiones.length,
    perfecto: misiones.length > 0 && hechas === misiones.length,
    // Primero lo que falta: el widget es para lo que queda por hacer.
    misiones: [...misiones].sort((a, b) => Number(a.hecho) - Number(b.hecho)),
  };
}

/**
 * Qué registros del widget hay que aplicar de verdad.
 *
 * El widget encola lo que tocaste sin abrir la app. Al volver, se aplican —
 * pero nunca encima de algo que ya está cargado: si entre medio anotaste el
 * valor real, ese manda. La fecha viaja con el registro, así que un toque del
 * martes que se aplica el jueves queda en el martes, que es cuando pasó.
 *
 * @param {Array<{actividad:string, fecha:string, valor:number}>} pendientes
 * @param {object} entries los registros actuales
 */
export function pendientesAAplicar(pendientes, entries = {}) {
  const vistos = new Set();
  const salida = [];
  for (const p of pendientes || []) {
    const id = String(p?.actividad || '');
    const fecha = String(p?.fecha || '');
    const valor = Number(p?.valor) || 0;
    // esFechaValida y no un patrón de forma: "2026-13-99" tiene la pinta
    // correcta y no existe. Ese error ya se coló dos veces.
    if (!id || !esFechaValida(fecha) || valor <= 0) continue;
    const clave = `${fecha}|${id}`;
    if (vistos.has(clave)) continue;          // dos toques del mismo día: uno
    if (entries[fecha]?.[id] !== undefined) continue;  // ya hay algo cargado
    vistos.add(clave);
    salida.push({ actividad: id, fecha, valor });
  }
  return salida;
}
