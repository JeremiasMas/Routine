/**
 * Qué ponerse y si conviene caminar, para alguien que vive en Buenos Aires
 * pero se crió en Río Grande.
 *
 * Todo lo que importa de esa historia entra en dos ideas:
 *
 * 1. **El frío y el viento no te asustan.** En Río Grande el viento de todos
 *    los días anda por los 30 km/h y el invierno pasa semanas bajo cero. Un
 *    viento porteño de 20 km/h, para vos, es aire quieto. Por eso sólo cuenta
 *    el viento que pasa de VIENTO_DE_CASA, y la ropa salta de nivel varios
 *    grados más abajo que para alguien de acá.
 *
 * 2. **El calor húmedo sí.** Eso es lo que nunca entrenaste: con humedad,
 *    25° en Buenos Aires pesan más que cualquier día de verano fueguino. Del
 *    lado del calor los umbrales son más bajos, no más altos, y se usa la
 *    sensación térmica (que con humedad sube) en vez de la temperatura.
 *
 * Este archivo no toca el DOM ni la red: recibe las horas del pronóstico y
 * devuelve recomendaciones. El widget de Android tiene la misma lógica
 * escrita en Kotlin (ClimaLogica.kt) y un test compara las constantes de los
 * dos: si tocás un número acá, tocalo allá.
 */

/** El viento que para vos no existe, en km/h. Lo de Río Grande es más. */
export const VIENTO_DE_CASA = 20;
/** Cuántos grados te saca cada km/h de viento por encima de VIENTO_DE_CASA. */
export const FACTOR_VIENTO = 0.1;
/** Desde esta humedad el frío porteño "cala los huesos". */
export const HUMEDAD_FRIO = 85;
/** Y le resta esto a lo que sentís, por debajo de TEMP_FRIO_HUMEDO. */
export const CASTIGO_HUMEDAD = 1;
export const TEMP_FRIO_HUMEDO = 15;
/** Desde acá manda la sensación térmica: con humedad, el calor pesa más. */
export const TEMP_CALOR = 22;

/**
 * Cuántos grados más abrigado iría un porteño con el mismo tiempo. Es la
 * diferencia entre tus umbrales y los de alguien de acá, sólo del lado frío.
 */
export const ACLIMATACION = 4;

/** Probabilidad de lluvia desde la que se lleva paraguas, y desde la que "por las dudas". */
export const PROB_LLUEVE = 50;
export const PROB_QUIZAS = 25;
/** Milímetros en una hora que ya cuentan como lluvia, diga lo que diga la probabilidad. */
export const MM_LLUEVE = 0.3;
/**
 * Ráfagas desde las que el paraguas se da vuelta. En Río Grande nadie usa
 * paraguas por esto mismo; en Buenos Aires sirve casi siempre, salvo con
 * sudestada.
 */
export const RAFAGAS_PARAGUAS = 55;

/** Para caminar: lo que sentís tiene que estar entre estos dos. */
export const CAMINATA_MIN = -3;
export const CAMINATA_MAX = 27;
export const CAMINATA_RAFAGAS = 60;
export const CAMINATA_UV = 8;
/** La caminata se busca entre estas horas. */
export const CAMINATA_DESDE = 7;
export const CAMINATA_HASTA = 22;
/** Desde esta hora, el plan que se muestra es el de mañana. */
export const HORA_DE_MANANA = 20;

/** Los códigos WMO de tormenta eléctrica. */
export const TORMENTA = [95, 96, 99];

/**
 * Tu ropa según lo que sentís. Cada nivel vale hasta `hasta` grados (sin
 * incluir). Para un porteño los mismos niveles empiezan ACLIMATACION grados
 * más arriba.
 */
export const ROPA = [
  { hasta: 3, id: 'abrigo', icono: '🧣', corto: 'Abrigo completo',
    detalle: 'Campera gruesa, gorro y guantes. En Buenos Aires pasa pocas veces al año.' },
  { hasta: 7, id: 'campera', icono: '🧥', corto: 'Campera',
    detalle: 'Campera de abrigo arriba de un buzo. Para vos es un día fresco, no frío.' },
  { hasta: 13, id: 'liviana', icono: '🧥', corto: 'Campera liviana',
    detalle: 'Campera liviana o un buzo arriba de la remera.' },
  { hasta: 19, id: 'manga-larga', icono: '👔', corto: 'Manga larga',
    detalle: 'Camisa o buzo fino, sin campera.' },
  { hasta: 25, id: 'remera', icono: '👕', corto: 'Remera',
    detalle: 'Remera o camisa liviana.' },
  { hasta: Infinity, id: 'liviano', icono: '🥵', corto: 'Lo más liviano',
    detalle: 'Ropa liviana y clara. El calor húmedo es lo que menos tenés entrenado: llevá agua.' },
];

export const HORARIO_DEFAULT = Object.freeze({
  dias: [1, 2, 3, 4, 5],   // como en JavaScript: 0 = domingo
  entrada: '09:00',
  salida: '18:00',
  viaje: 45,                // minutos de puerta a puerta
});

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const redondear = (n) => Math.round(n * 10) / 10;

/** "09:30" → 570. Lo que no se entiende vale null. */
export function minutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 570 → "9:30"; las horas en punto, sin minutos: 540 → "9". */
export function hora(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`;
}

/** Un horario con todo en su lugar, aunque venga roto del localStorage. */
export function normalizarHorario(h = {}) {
  const dias = Array.isArray(h.dias)
    ? [...new Set(h.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [...HORARIO_DEFAULT.dias];
  let entrada = minutos(h.entrada) != null ? h.entrada : HORARIO_DEFAULT.entrada;
  let salida = minutos(h.salida) != null ? h.salida : HORARIO_DEFAULT.salida;
  // Una salida antes de la entrada no es un horario: vuelve el de siempre.
  if (minutos(salida) <= minutos(entrada)) ({ entrada, salida } = HORARIO_DEFAULT);
  const viaje = Number.isFinite(Number(h.viaje)) ? Math.min(180, Math.max(0, Math.round(Number(h.viaje)))) : HORARIO_DEFAULT.viaje;
  return { dias, entrada, salida, viaje };
}

/**
 * Lo que sentís vos, no lo que siente cualquiera.
 *
 * Con frío: la temperatura, menos el viento que pasa de tu viento de siempre,
 * menos un grado si encima hay mucha humedad. Con calor: la sensación térmica
 * del pronóstico, que con humedad sube.
 */
export function sensacion(h) {
  if (h.temp >= TEMP_CALOR) return redondear(Math.max(h.temp, h.aparente ?? h.temp));
  let s = h.temp - Math.max(0, h.viento - VIENTO_DE_CASA) * FACTOR_VIENTO;
  if (h.hum >= HUMEDAD_FRIO && h.temp < TEMP_FRIO_HUMEDO) s -= CASTIGO_HUMEDAD;
  return redondear(s);
}

/** Lo mismo para un porteño: todo el viento cuenta, y está menos curtido. */
export function sensacionPortena(h) {
  if (h.temp >= TEMP_CALOR) return sensacion(h);
  let s = h.temp - h.viento * FACTOR_VIENTO;
  if (h.hum >= HUMEDAD_FRIO && h.temp < TEMP_FRIO_HUMEDO) s -= CASTIGO_HUMEDAD;
  return redondear(s - ACLIMATACION);
}

export function ropaPara(s) {
  return ROPA.find((r) => s < r.hasta) ?? ROPA[ROPA.length - 1];
}

/** 'tormenta', 'lluvia', 'quizas' o null. */
export function lluviaEn(h) {
  if (TORMENTA.includes(h.codigo)) return 'tormenta';
  if (h.prob >= PROB_LLUEVE || h.lluvia >= MM_LLUEVE) return 'lluvia';
  if (h.prob >= PROB_QUIZAS) return 'quizas';
  return null;
}

/**
 * Paraguas para un tramo de horas.
 * @returns {{nivel: 'no'|'quizas'|'si'|'capucha', texto: string}}
 */
export function paraguas(horas) {
  const estados = horas.map(lluviaEn);
  const moja = estados.some((e) => e === 'lluvia' || e === 'tormenta');
  if (moja) {
    const rafagas = Math.max(0, ...horas.map((h) => h.rafagas ?? 0));
    if (rafagas >= RAFAGAS_PARAGUAS) {
      return { nivel: 'capucha', texto: `Llueve con ráfagas de ${Math.round(rafagas)} km/h: el paraguas no aguanta. Campera con capucha, como en casa.` };
    }
    const tormenta = estados.includes('tormenta');
    return { nivel: 'si', texto: tormenta ? 'Hay tormenta: paraguas sí o sí.' : 'Va a llover: llevá paraguas.' };
  }
  if (estados.includes('quizas')) return { nivel: 'quizas', texto: 'Puede llover: un paraguas chico en la mochila.' };
  return { nivel: 'no', texto: 'Sin lluvia: el paraguas se queda.' };
}

/** Las horas de una fecha que se pisan con [desde, hasta), en minutos. */
export function tramo(horas, fecha, desde, hasta) {
  return horas.filter((h) => h.fecha === fecha && h.hora * 60 < hasta && h.hora * 60 + 60 > desde);
}

const apta = (h) => !lluviaEn(h)
  && sensacion(h) >= CAMINATA_MIN && sensacion(h) <= CAMINATA_MAX
  && (h.rafagas ?? 0) < CAMINATA_RAFAGAS
  && (h.uv ?? 0) < CAMINATA_UV;

function motivoDe(h) {
  const ll = lluviaEn(h);
  if (ll === 'tormenta') return 'tormenta';
  if (ll) return 'lluvia';
  if (sensacion(h) > CAMINATA_MAX) return 'calor';
  if ((h.rafagas ?? 0) >= CAMINATA_RAFAGAS) return 'viento';
  if ((h.uv ?? 0) >= CAMINATA_UV) return 'sol fuerte';
  return 'frío';
}

/**
 * El mejor rato para caminar en una fecha: el tramo apto más largo fuera del
 * horario de oficina, y entre dos iguales el primero.
 *
 * @param {number} desdeMin  no se ofrece nada que ya pasó
 * @returns {null | {desde: number, hasta: number} | {motivo: string}}
 *   null si no queda ninguna hora para mirar ese día.
 */
export function caminata(horas, fecha, horario, desdeMin = 0, oficina = false) {
  const h = normalizarHorario(horario);
  const ocupadoDesde = minutos(h.entrada) - h.viaje;
  const ocupadoHasta = minutos(h.salida) + h.viaje;
  const candidatas = horas.filter((x) => x.fecha === fecha
    && x.hora >= CAMINATA_DESDE && x.hora < CAMINATA_HASTA
    && x.hora * 60 >= desdeMin - 59
    && !(oficina && x.hora * 60 < ocupadoHasta && x.hora * 60 + 60 > ocupadoDesde));
  if (!candidatas.length) return null;

  let mejor = null;
  let actual = null;
  for (const x of candidatas) {
    if (apta(x)) {
      if (actual && x.hora === actual.hasta) actual.hasta += 1;
      else actual = { desde: x.hora, hasta: x.hora + 1 };
      if (!mejor || actual.hasta - actual.desde > mejor.hasta - mejor.desde) mejor = { ...actual };
    } else {
      actual = null;
    }
  }
  if (mejor) return mejor;

  // Nada apto: el motivo que más se repite, y entre dos empatados el primero.
  const cuenta = new Map();
  for (const x of candidatas) {
    const m = motivoDe(x);
    cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  let motivo = null;
  for (const [m, n] of cuenta) if (!motivo || n > cuenta.get(motivo)) motivo = m;
  return { motivo };
}

/** "2026-10-13" → día de la semana, sin depender del huso del dispositivo. */
export function diaDeSemana(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function sumarDias(fecha, n) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * El plan entero de un momento: qué día mirar, qué ponerse, paraguas y
 * caminata.
 *
 * @param {Array} horas  las del pronóstico, ver pronostico.js
 * @param {Object} horario
 * @param {{fecha: string, minutos: number}} ahora  hora de Buenos Aires
 */
export function plan(horas, horario, ahora) {
  const h = normalizarHorario(horario);
  const entrada = minutos(h.entrada);
  const salida = minutos(h.salida);

  // A la noche ya no sirve el plan de hoy: se muestra el de mañana.
  const manana = ahora.minutos >= HORA_DE_MANANA * 60;
  const fecha = manana ? sumarDias(ahora.fecha, 1) : ahora.fecha;
  const etiqueta = manana ? 'Mañana' : 'Hoy';
  const desde = manana ? 0 : ahora.minutos;
  const oficina = h.dias.includes(diaDeSemana(fecha)) && (manana || ahora.minutos < salida + h.viaje);

  let ida = [];
  let vuelta = [];
  let salir;
  if (oficina) {
    ida = tramo(horas, fecha, entrada - h.viaje, entrada);
    vuelta = tramo(horas, fecha, salida, salida + h.viaje);
    salir = [...ida, ...vuelta];
  } else {
    // Día libre: lo que hace falta para salir ahora y las próximas horas, o
    // el mediodía si es para mañana.
    const inicio = manana ? 10 * 60 : ahora.minutos;
    salir = tramo(horas, fecha, inicio, inicio + 4 * 60);
  }
  if (!salir.length) return null;

  const sens = salir.map(sensacion);
  const ropa = ropaPara(Math.min(...sens));
  const portena = ropaPara(Math.min(...salir.map(sensacionPortena)));

  let nota = null;
  if (oficina && ida.length && vuelta.length) {
    const rIda = ropaPara(Math.min(...ida.map(sensacion)));
    const rVuelta = ropaPara(Math.min(...vuelta.map(sensacion)));
    if (rVuelta.hasta > rIda.hasta) nota = `A la vuelta te sobra: alcanza con ${rVuelta.corto.toLowerCase()}.`;
    else if (rVuelta.hasta < rIda.hasta) nota = `A la ida alcanza con ${rIda.corto.toLowerCase()}, pero a la vuelta refresca.`;
  }
  if (Math.max(...sens) > CAMINATA_MAX) {
    nota = [nota, 'Calor pesado para vos: buscá la sombra.'].filter(Boolean).join(' ');
  }

  let camina = caminata(horas, fecha, h, desde, h.dias.includes(diaDeSemana(fecha)));
  let fechaCaminata = fecha;
  let etiquetaCaminata = etiqueta;
  // Si hoy ya no queda nada, la caminata que importa es la de mañana.
  if (!camina && !manana) {
    fechaCaminata = sumarDias(fecha, 1);
    etiquetaCaminata = 'Mañana';
    camina = caminata(horas, fechaCaminata, h, 0, h.dias.includes(diaDeSemana(fechaCaminata)));
  }

  const temps = (hs) => (hs.length ? Math.round(Math.min(...hs.map((x) => x.temp))) : null);
  return {
    fecha,
    etiqueta,
    oficina,
    ropa,
    portena,
    paraguas: paraguas(salir),
    nota,
    ida: oficina ? { temp: temps(ida), desde: entrada - h.viaje } : null,
    vuelta: oficina ? { temp: temps(vuelta), desde: salida } : null,
    temp: Math.round(salir[0].temp),
    maxima: Math.round(Math.max(...horas.filter((x) => x.fecha === fecha).map((x) => x.temp))),
    caminata: camina ? { ...camina, fecha: fechaCaminata, etiqueta: etiquetaCaminata } : null,
  };
}

const ICONO_PARAGUAS = { no: '', quizas: ' · ☂️?', si: ' · ☂️', capucha: ' · capucha' };

/**
 * Las tres líneas del widget. Kotlin arma exactamente las mismas: el test de
 * paridad compara los dos con los mismos casos.
 */
export function lineasWidget(p) {
  if (!p) return { titulo: 'Sin pronóstico', detalle: 'Abrí la app con conexión', caminar: '' };
  const titulo = `${p.ropa.icono} ${p.ropa.corto}${ICONO_PARAGUAS[p.paraguas.nivel]}`;
  const detalle = p.oficina
    ? `${p.etiqueta}: ida ${p.ida.temp ?? '–'}° · vuelta ${p.vuelta.temp ?? '–'}°`
    : `${p.etiqueta}: ${p.temp}° · máx ${p.maxima}°`;
  const c = p.caminata;
  let caminar = '';
  if (c?.motivo) caminar = `🚶 ${c.etiqueta} mejor no: ${c.motivo}`;
  else if (c) caminar = `🚶 Caminar ${c.etiqueta.toLowerCase()} ${c.desde}–${c.hasta} h`;
  return { titulo, detalle, caminar };
}
