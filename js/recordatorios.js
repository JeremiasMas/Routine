/**
 * Qué dice el aviso del teléfono, cuando lo dice.
 *
 * La app sabía desde siempre qué racha se te corta esta noche, y no te lo
 * podía decir: ese dato existía sólo si abrías la app. El código de las
 * notificaciones estaba compilado adentro del APK desde el primer día, pero
 * el receptor se declaraba únicamente en el manifiesto de Ataraxia.
 *
 * Acá vive la decisión, separada del teléfono para poder probarla: con qué
 * texto suena, y cuándo no tiene que sonar.
 */
import { plural, formatNumber } from './utils.js';
import { rachasEnRiesgo } from './analisis.js';
import { isScheduledWithPauses } from './derive.js';

/** El tipo de recordatorio, como lo conoce el puente. */
export const TIPO = 'rutina';

/** Cuántos nombres entran en una notificación antes de volverse una lista. */
export const MAX_NOMBRES = 3;

const nombres = (lista) => lista.map((a) => `${a.icon} ${a.name}`);

/**
 * Una enumeración que no se vuelve ilegible: tres nombres y después un
 * número. "💧 Agua, 🎹 Piano y 4 más" se lee; ocho nombres seguidos, no.
 */
export function enumerar(lista, maximo = MAX_NOMBRES) {
  const items = nombres(lista);
  if (items.length <= maximo) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
  }
  const resto = items.length - maximo;
  return `${items.slice(0, maximo).join(', ')} y ${resto} más`;
}

/**
 * El aviso de hoy, o null si no hay nada que decir.
 *
 * El orden no es decorativo. Una racha que se corta esta noche es lo único
 * que no se puede recuperar mañana; las misiones sueltas sí. Si avisara de
 * las dos cosas a la vez, la que importa se perdería entre las otras.
 *
 * @param {{riesgos?:Array, pendientes?:Array, total?:number}} dia
 * @returns {?{titulo:string, texto:string}}
 */
export function avisoDelDia({ riesgos = [], pendientes = [], total = 0 } = {}) {
  // Día cerrado: no hay por qué molestar.
  if (!pendientes.length) return null;

  const cortan = riesgos.filter((r) => r.seCorta);
  if (cortan.length) {
    const peor = cortan[0];
    return {
      titulo: `🔥 Se corta tu racha de ${plural(peor.streak, 'día', 'días')}`,
      texto: cortan.length === 1
        ? `${peor.activity.icon} ${peor.activity.name} no tiene escudos. Si el día termina sin registrarlo, vuelve a cero.`
        : `${enumerar(cortan.map((r) => r.activity))} no tienen escudos. Si el día termina sin registrarlas, esas rachas vuelven a cero.`,
    };
  }

  const conEscudo = riesgos.filter((r) => !r.seCorta);
  if (conEscudo.length) {
    const peor = conEscudo[0];
    return {
      titulo: `🛡 Hoy gastás ${peor.ultimoEscudo ? 'tu último escudo' : 'un escudo'}`,
      texto: `${enumerar(conEscudo.map((r) => r.activity))}: la racha sobrevive, pero el escudo no se recupera hasta otros siete días cumplidos.`,
    };
  }

  const faltan = pendientes.length;
  return {
    titulo: faltan === 1 ? '🎯 Te queda una misión' : `🎯 Te quedan ${formatNumber(faltan)} misiones`,
    texto: total > 0 && faltan < total
      ? `Llevás ${formatNumber(total - faltan)} de ${formatNumber(total)}. Falta ${enumerar(pendientes)}.`
      : `${enumerar(pendientes)}.`,
  };
}

/**
 * Qué mandarle al teléfono después de cada cambio.
 *
 * El texto va con la fecha a propósito: si la app no se abre en todo el día,
 * lo guardado es de ayer, y nombrar una racha que ya salvaste es peor que no
 * decir nada. El lado de Android usa el respaldo genérico en ese caso.
 */
export function loQueVaAlTelefono(dia, hoy) {
  const aviso = avisoDelDia(dia);
  return {
    tipo: TIPO,
    fecha: hoy,
    // Sin nada pendiente el día está hecho: eso apaga el aviso de hoy.
    hecho: !aviso,
    titulo: aviso?.titulo || '',
    texto: aviso?.texto || '',
  };
}

/**
 * El paquete de hoy, sacado del estado derivado.
 *
 * Se recalcula con cada cambio, igual que el resumen del widget: si cerrás
 * el agua a las siete, el aviso de las ocho ya no la nombra.
 */
export function paqueteDelEstado(state) {
  if (!state?.activities) return null;
  const toca = state.activities.filter((a) => isScheduledWithPauses(a, state.today, state.pausas));
  const pendientes = toca.filter((a) => !state.byActivity.get(a.id)?.byDate.get(state.today)?.met);
  const riesgos = rachasEnRiesgo([...state.byActivity.values()],
    (a) => isScheduledWithPauses(a, state.today, state.pausas));
  return loQueVaAlTelefono({ riesgos, pendientes, total: toca.length }, state.today);
}
