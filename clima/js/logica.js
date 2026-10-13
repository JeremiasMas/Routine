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

/** Tu meta de todos los días. */
export const META_PASOS = 10000;
/**
 * Pasos por minuto de caminata: el mismo número que usa Rutina
 * (js/config.js), del lado largo a propósito.
 */
export const PASOS_POR_MINUTO = 100;
/** La sensación ideal para caminar, para alguien curtido en el sur. */
export const CAMINATA_IDEAL = 15;
/**
 * Cuánto más cómodo (en puntos de penalidad por hora) tiene que ser otro
 * horario para proponértelo aunque el tuyo esté bien.
 */
export const MEJORA = 4;
/** Cuánto dura una caminata cuando no se sabe cuántos pasos llevás. */
export const DURACION_SIN_PASOS = 60;
export const DURACION_MIN = 20;
export const DURACION_MAX = 120;

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

/**
 * Tu semana: oficina martes, miércoles y jueves, de 9 a 18, con una hora de
 * colectivo de cada lado (salís de casa a las 8, llegás a las 19). Lunes y
 * viernes, home office en el mismo horario y sin viaje. Todos esos días, de
 * 13 a 14:30, el almuerzo: el rato que tenés para caminar.
 */
export const HORARIO_DEFAULT = Object.freeze({
  dias: [2, 3, 4],          // de oficina; como en JavaScript: 0 = domingo
  remoto: [1, 5],           // de home office: mismo horario, sin colectivo
  entrada: '09:00',
  salida: '18:00',
  viaje: 60,                // minutos de puerta a puerta, en colectivo
  almuerzo: Object.freeze({ desde: '13:00', hasta: '14:30' }),
  caminatas: [],            // tus horarios de caminata de lunes a viernes
  meta: META_PASOS,
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
  const validos = (lista, def) => (Array.isArray(lista)
    ? [...new Set(lista.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [...def]);
  const dias = validos(h.dias, HORARIO_DEFAULT.dias);
  // Un día es de oficina o de home office, no las dos cosas: gana la oficina.
  const remoto = validos(h.remoto, HORARIO_DEFAULT.remoto).filter((d) => !dias.includes(d));
  let entrada = minutos(h.entrada) != null ? h.entrada : HORARIO_DEFAULT.entrada;
  let salida = minutos(h.salida) != null ? h.salida : HORARIO_DEFAULT.salida;
  // Una salida antes de la entrada no es un horario: vuelve el de siempre.
  if (minutos(salida) <= minutos(entrada)) ({ entrada, salida } = HORARIO_DEFAULT);
  const viaje = Number.isFinite(Number(h.viaje)) ? Math.min(180, Math.max(0, Math.round(Number(h.viaje)))) : HORARIO_DEFAULT.viaje;
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  // Sin almuerzo cargado vale el de siempre; null es "no tengo almuerzo libre".
  // Uno que no cae adentro del horario de oficina no es un almuerzo.
  const alm = h.almuerzo === undefined ? HORARIO_DEFAULT.almuerzo : h.almuerzo;
  const almDesde = minutos(alm?.desde);
  const almHasta = minutos(alm?.hasta);
  const almuerzo = almDesde != null && almHasta != null && almDesde < almHasta
    && almDesde >= minutos(entrada) && almHasta <= minutos(salida)
    ? { desde: hhmm(almDesde), hasta: hhmm(almHasta) }
    : null;
  const caminatas = Array.isArray(h.caminatas)
    ? [...new Set(h.caminatas.map(minutos).filter((m) => m != null))].sort((a, b) => a - b).slice(0, 3).map(hhmm)
    : [];
  const meta = Number.isFinite(Number(h.meta)) && Number(h.meta) >= 1000
    ? Math.min(50000, Math.round(Number(h.meta)))
    : META_PASOS;
  return { dias, remoto, entrada, salida, viaje, almuerzo, caminatas, meta };
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
 * Qué tan incómoda es una hora para caminar: 0 es perfecta. Suma lo lejos que
 * está de CAMINATA_IDEAL, la chance de lluvia, el sol y las ráfagas fuertes.
 * Sólo compara horas aptas entre sí; las que no lo son ni se miran.
 */
export function penalidad(h) {
  return Math.abs(sensacion(h) - CAMINATA_IDEAL) + h.prob / 10 + (h.uv ?? 0) / 2
    + Math.max(0, (h.rafagas ?? 0) - 40) / 5;
}

/**
 * Las horas de una fecha en las que podrías salir: ni pasadas ni de oficina,
 * salvo las del almuerzo. Una hora cuenta para el almuerzo si arranca adentro
 * de él (de 13 a 14:30 son las 13 y las 14).
 */
function libres(horas, fecha, h, desdeMin, trabaja, viaje) {
  const ocupadoDesde = minutos(h.entrada) - viaje;
  const ocupadoHasta = minutos(h.salida) + viaje;
  const almD = h.almuerzo ? minutos(h.almuerzo.desde) : -1;
  const almH = h.almuerzo ? minutos(h.almuerzo.hasta) : -1;
  return horas.filter((x) => x.fecha === fecha
    && x.hora >= CAMINATA_DESDE && x.hora < CAMINATA_HASTA
    && x.hora * 60 >= desdeMin - 59
    && !(trabaja && x.hora * 60 < ocupadoHasta && x.hora * 60 + 60 > ocupadoDesde
      && !(x.hora * 60 >= almD && x.hora * 60 < almH)));
}

/**
 * Un tramo de horas enteras, en minutos y recortado a lo que de verdad tenés
 * libre: si cae en el almuerzo, termina cuando termina el almuerzo.
 */
function recortar(v, h, trabaja, viaje) {
  const desde = v.desde * 60;
  const hasta = v.hasta * 60;
  if (!trabaja || !h.almuerzo) return { desde, hasta };
  const ocupadoDesde = minutos(h.entrada) - viaje;
  const ocupadoHasta = minutos(h.salida) + viaje;
  if (!(desde < ocupadoHasta && hasta > ocupadoDesde)) return { desde, hasta };
  return { desde: Math.max(desde, minutos(h.almuerzo.desde)), hasta: Math.min(hasta, minutos(h.almuerzo.hasta)) };
}

/**
 * El tramo más cómodo de `n` horas seguidas, todas aptas. Si no hay de `n`,
 * prueba más corto. Entre dos iguales, el primero.
 */
export function ventanaOptima(candidatas, n) {
  for (let k = n; k >= 1; k--) {
    let mejor = null;
    for (let i = 0; i + k <= candidatas.length; i++) {
      let suma = 0;
      let sirve = true;
      for (let j = 0; j < k; j++) {
        const x = candidatas[i + j];
        if (x.hora !== candidatas[i].hora + j || !apta(x)) { sirve = false; break; }
        suma += penalidad(x);
      }
      if (sirve && (!mejor || suma < mejor.suma)) mejor = { desde: candidatas[i].hora, hasta: candidatas[i].hora + k, suma };
    }
    if (mejor) return { desde: mejor.desde, hasta: mejor.hasta, penal: mejor.suma / k };
  }
  return null;
}

/** El motivo que más se repite, y entre dos empatados el primero. */
function motivoComun(candidatas) {
  const cuenta = new Map();
  for (const x of candidatas) {
    const m = motivoDe(x);
    cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  let motivo = null;
  for (const [m, n] of cuenta) if (!motivo || n > cuenta.get(motivo)) motivo = m;
  return motivo;
}

const entre = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * La caminata de una fecha.
 *
 * De lunes a viernes revisa tu próximo horario de caminata: si el clima lo
 * acompaña, y si no, cuál es el mejor otro rato. Aunque esté bien, si hay un
 * horario claramente más cómodo te lo propone. Los fines de semana (o si no
 * cargaste horarios) busca directamente el óptimo.
 *
 * Los días de trabajo (de oficina o de home office) el almuerzo cuenta como
 * una caminata más, y la de ese rato no puede durar más que el almuerzo. En
 * home office no hay colectivo: estás libre apenas terminás.
 *
 * La duración sale de los pasos que te faltan: a PASOS_POR_MINUTO, repartidos
 * entre las caminatas que te quedan en el día. Los horarios vuelven en
 * minutos desde la medianoche.
 *
 * @param {number|null} pasos  los de hoy, o null si no se saben
 * @returns {null | {cumplida: true}
 *   | {tipo: 'habitual', inicio, almuerzo, ok, motivo?, otra, minutos, quedan}
 *   | {tipo: 'optimo', desde, hasta, minutos}
 *   | {motivo, minutos}}  null si no queda ninguna hora para mirar ese día.
 */
export function planCaminata(horas, horario, fecha, desdeMin = 0, pasos = null) {
  const h = normalizarHorario(horario);
  const dia = diaDeSemana(fecha);
  const faltan = pasos == null ? null : Math.max(0, h.meta - pasos);
  if (faltan === 0) return { cumplida: true };
  const faltanMin = faltan == null ? null : Math.ceil(faltan / PASOS_POR_MINUTO);
  const oficina = h.dias.includes(dia);
  const trabaja = oficina || h.remoto.includes(dia);
  const viaje = oficina ? h.viaje : 0;
  const candidatas = libres(horas, fecha, h, desdeMin, trabaja, viaje);
  const almD = trabaja && h.almuerzo ? minutos(h.almuerzo.desde) : null;

  const semana = dia >= 1 && dia <= 5;
  const habituales = semana ? h.caminatas.map(minutos) : [];
  if (almD != null && !habituales.includes(almD)) habituales.push(almD);
  habituales.sort((a, b) => a - b);
  const pendientes = habituales.filter((m) => m >= desdeMin - 30);
  if (pendientes.length) {
    const inicio = pendientes[0];
    const almuerzo = inicio === almD;
    let dur = faltanMin == null ? DURACION_SIN_PASOS
      : entre(Math.ceil(faltanMin / pendientes.length), DURACION_MIN, DURACION_MAX);
    if (almuerzo) dur = Math.min(dur, minutos(h.almuerzo.hasta) - inicio);
    const tuyo = horas.filter((x) => x.fecha === fecha && x.hora * 60 < inicio + dur && x.hora * 60 + 60 > inicio);
    if (tuyo.length) {
      const v = ventanaOptima(candidatas, entre(Math.ceil(dur / 60), 1, 2));
      const mejor = v ? { ...recortar(v, h, trabaja, viaje), penal: v.penal } : null;
      const malas = tuyo.filter((x) => !apta(x));
      const base = { tipo: 'habitual', inicio, almuerzo, minutos: faltanMin, quedan: pendientes.length };
      if (!malas.length) {
        let prom = 0;
        for (const x of tuyo) prom += penalidad(x);
        prom /= tuyo.length;
        const otra = mejor && mejor.desde !== Math.floor(inicio / 60) * 60 && mejor.penal + MEJORA <= prom;
        return { ...base, ok: true, otra: otra ? { desde: mejor.desde, hasta: mejor.hasta } : null };
      }
      return { ...base, ok: false, motivo: motivoDe(malas[0]), otra: mejor ? { desde: mejor.desde, hasta: mejor.hasta } : null };
    }
  }

  if (!candidatas.length) return null;
  const n = faltanMin == null ? 1 : entre(Math.ceil(faltanMin / 60), 1, 2);
  const mejor = ventanaOptima(candidatas, n);
  if (mejor) return { tipo: 'optimo', ...recortar(mejor, h, trabaja, viaje), minutos: faltanMin };
  return { motivo: motivoComun(candidatas), minutos: faltanMin };
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
 * @param {number|null} pasos  los de hoy, si se saben
 */
export function plan(horas, horario, ahora, pasos = null) {
  const h = normalizarHorario(horario);
  const entrada = minutos(h.entrada);
  const salida = minutos(h.salida);

  // A la noche ya no sirve el plan de hoy: se muestra el de mañana.
  const manana = ahora.minutos >= HORA_DE_MANANA * 60;
  const fecha = manana ? sumarDias(ahora.fecha, 1) : ahora.fecha;
  const etiqueta = manana ? 'Mañana' : 'Hoy';
  const oficina = h.dias.includes(diaDeSemana(fecha)) && (manana || ahora.minutos < salida + h.viaje);
  const remoto = h.remoto.includes(diaDeSemana(fecha));
  // En home office la única salida del horario de trabajo es el almuerzo:
  // hasta que termina, la ropa es para esa caminata.
  const casa = remoto && h.almuerzo != null && (manana || ahora.minutos < minutos(h.almuerzo.hasta));

  let ida = [];
  let vuelta = [];
  let almuerzo = [];
  let salir;
  if (oficina) {
    ida = tramo(horas, fecha, entrada - h.viaje, entrada);
    vuelta = tramo(horas, fecha, salida, salida + h.viaje);
    salir = [...ida, ...vuelta];
    // Al almuerzo también salís: si llueve a esa hora, el paraguas va.
    if (h.almuerzo) almuerzo = tramo(horas, fecha, minutos(h.almuerzo.desde), minutos(h.almuerzo.hasta));
  } else if (casa) {
    salir = tramo(horas, fecha, minutos(h.almuerzo.desde), minutos(h.almuerzo.hasta));
  } else {
    // Día libre: lo que hace falta para salir ahora y las próximas horas, o
    // el mediodía si es para mañana. En home office, desde que terminás.
    let inicio = manana ? 10 * 60 : ahora.minutos;
    if (remoto && !manana && ahora.minutos < salida) inicio = salida;
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

  // La caminata es de hoy mientras te falten pasos y quede algún rato, aunque
  // ya sea de noche; si no, la de mañana (que todavía no tiene pasos).
  let camina = null;
  let fechaCaminata = ahora.fecha;
  let etiquetaCaminata = 'Hoy';
  if (!manana || (pasos != null && pasos < h.meta)) {
    camina = planCaminata(horas, h, ahora.fecha, ahora.minutos, pasos);
  }
  if (!camina) {
    fechaCaminata = sumarDias(ahora.fecha, 1);
    etiquetaCaminata = 'Mañana';
    camina = planCaminata(horas, h, fechaCaminata, 0, null);
  }

  const temps = (hs) => (hs.length ? Math.round(Math.min(...hs.map((x) => x.temp))) : null);
  return {
    fecha,
    etiqueta,
    oficina,
    casa,
    ropa,
    portena,
    paraguas: paraguas([...salir, ...almuerzo]),
    nota,
    ida: oficina ? { temp: temps(ida), desde: entrada - h.viaje } : null,
    vuelta: oficina ? { temp: temps(vuelta), desde: salida } : null,
    temp: Math.round(salir[0].temp),
    maxima: Math.round(Math.max(...horas.filter((x) => x.fecha === fecha).map((x) => x.temp))),
    caminata: camina ? { ...camina, fecha: fechaCaminata, etiqueta: etiquetaCaminata } : null,
    pasos: pasos == null ? null : { hoy: pasos, meta: h.meta, faltan: Math.max(0, h.meta - pasos) },
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
  let detalle = `${p.etiqueta}: ${p.temp}° · máx ${p.maxima}°`;
  if (p.oficina) detalle = `${p.etiqueta}: ida ${p.ida.temp ?? '–'}° · vuelta ${p.vuelta.temp ?? '–'}°`;
  else if (p.casa) detalle = `${p.etiqueta}: almuerzo ${p.temp}° · máx ${p.maxima}°`;
  return { titulo, detalle, caminar: lineaCaminata(p.caminata) };
}

/** La tercera línea del widget: la caminata, en lo que entra en un renglón. */
export function lineaCaminata(c) {
  if (!c) return '';
  if (c.cumplida) return '🚶 Meta de pasos cumplida ✓';
  const falta = c.minutos != null ? ` · faltan ${c.minutos} min` : '';
  const rato = (v) => `${hora(v.desde)}–${hora(v.hasta)} h`;
  if (c.tipo === 'habitual') {
    const cuando = c.almuerzo
      ? (c.etiqueta === 'Mañana' ? 'Mañana almuerzo' : 'Almuerzo')
      : `${c.etiqueta === 'Mañana' ? 'Mañana ' : ''}${hora(c.inicio)} h`;
    if (c.ok) return c.otra ? `🚶 ${cuando} ok, mejor ${rato(c.otra)}` : `🚶 ${cuando} ✓${falta}`;
    return c.otra ? `🚶 ${cuando}: ${c.motivo} → ${rato(c.otra)}` : `🚶 ${cuando}: ${c.motivo}, no hay otro rato`;
  }
  if (c.tipo === 'optimo') return `🚶 ${c.etiqueta} ${rato(c)}${falta}`;
  return `🚶 ${c.etiqueta} mejor no: ${c.motivo}`;
}
