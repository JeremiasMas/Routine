// Todo lo que se calcula: metas, XP, niveles, rachas y logros.
// Módulo puro: sin DOM ni almacenamiento, así se puede probar con node --test.

import { RUTINA_POSTURA } from './postura.js';
import { filosofoDe } from './filosofos.js';

/* -------------------------------------------------------------------------
   Fechas. Siempre en hora local y como 'AAAA-MM-DD', que además ordena bien
   como texto.
   ------------------------------------------------------------------------- */

export function claveDe(fecha = new Date()) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function fechaDe(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

export function sumarDias(clave, n) {
  const f = fechaDe(clave);
  f.setDate(f.getDate() + n);
  return claveDe(f);
}

/** 0 = domingo, como `Date#getDay`. */
export function diaSemana(clave) {
  return fechaDe(clave).getDay();
}

/* -------------------------------------------------------------------------
   Estado inicial
   ------------------------------------------------------------------------- */

/**
 * Las comidas que se pueden marcar. Se eligen en Ajustes; la colación viene
 * apagada porque no todo el mundo la hace.
 */
export const COMIDAS = [
  { id: 'desayuno', nombre: 'Desayuno', icono: '☕' },
  { id: 'almuerzo', nombre: 'Almuerzo', icono: '🍲' },
  { id: 'merienda', nombre: 'Merienda', icono: '🍎' },
  { id: 'cena', nombre: 'Cena', icono: '🌙' },
  { id: 'colacion', nombre: 'Colación', icono: '🥜' },
];

/**
 * Los tres colores del semáforo y cuánto vale cada uno.
 *
 * El rojo no vale cero a propósito: anotarlo ya es honestidad, y si marcar
 * rojo diera lo mismo que no marcar nada, la tentación sería no marcar.
 */
export const COLORES = {
  verde: { nombre: 'Bien', valor: 1 },
  amarillo: { nombre: 'Más o menos', valor: 0.6 },
  rojo: { nombre: 'Mal', valor: 0.2 },
};

/** Tipos de día para los pasos. `libre` no rompe la racha ni la suma. */
export const TIPOS_PASOS = ['alta', 'suave', 'libre'];

export function estadoInicial() {
  return {
    version: 1,
    nombre: '',
    config: {
      pasos: {
        alta: 10000,
        suave: 6000,
        // Por día de la semana, empezando el domingo. Arranca con los días de
        // semana en 10.000 y el fin de semana en 6.000; se cambia en Ajustes.
        plan: ['suave', 'alta', 'alta', 'alta', 'alta', 'alta', 'suave'],
      },
      comidas: ['desayuno', 'almuerzo', 'merienda', 'cena'],
      postura: { dias: [0, 1, 2, 3, 4, 5, 6] },
    },
    dias: {},
  };
}

/**
 * Completa lo que falte en un estado guardado (o importado) con los valores
 * de fábrica, para que una versión vieja nunca deje la app en blanco.
 */
export function normalizar(crudo) {
  const base = estadoInicial();
  if (!crudo || typeof crudo !== 'object') return base;
  const c = crudo.config || {};
  const pasos = { ...base.config.pasos, ...(c.pasos || {}) };
  if (!Array.isArray(pasos.plan) || pasos.plan.length !== 7
    || !pasos.plan.every((t) => TIPOS_PASOS.includes(t))) {
    pasos.plan = base.config.pasos.plan;
  }
  pasos.alta = numeroPositivo(pasos.alta, base.config.pasos.alta);
  pasos.suave = numeroPositivo(pasos.suave, base.config.pasos.suave);
  const comidas = Array.isArray(c.comidas)
    ? COMIDAS.map((x) => x.id).filter((id) => c.comidas.includes(id))
    : base.config.comidas;
  const diasPostura = Array.isArray(c.postura?.dias)
    ? [...new Set(c.postura.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : base.config.postura.dias;
  return {
    version: 1,
    nombre: typeof crudo.nombre === 'string' ? crudo.nombre : '',
    config: { pasos, comidas, postura: { dias: diasPostura } },
    dias: crudo.dias && typeof crudo.dias === 'object' ? crudo.dias : {},
  };
}

function numeroPositivo(v, respaldo) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : respaldo;
}

/* -------------------------------------------------------------------------
   Pasos
   ------------------------------------------------------------------------- */

/**
 * Qué meta de pasos rige un día: la que marca el plan semanal, salvo que ese
 * día se haya cambiado a mano.
 * @returns {{tipo:'alta'|'suave'|'libre', meta:number, cambiada:boolean}}
 */
export function metaPasos(estado, clave) {
  const { pasos } = estado.config;
  const delPlan = pasos.plan[diaSemana(clave)];
  const propio = estado.dias[clave]?.tipoPasos;
  const tipo = TIPOS_PASOS.includes(propio) ? propio : delPlan;
  // Un día libre no tiene meta, pero lo caminado igual suma: se mide contra
  // la meta suave para darle XP.
  const meta = tipo === 'alta' ? pasos.alta : pasos.suave;
  return { tipo, meta, cambiada: TIPOS_PASOS.includes(propio) && propio !== delPlan };
}

/**
 * Cumplir la meta vale 100 XP, sea de 10.000 o de 6.000: lo que se premia es
 * hacer lo que te propusiste ese día. Pasarse suma hasta 30 más.
 */
export function xpPasos(pasos, meta) {
  if (!(pasos > 0) || !(meta > 0)) return 0;
  const r = pasos / meta;
  return Math.round(Math.min(r, 1) * 100 + Math.min(Math.max(r - 1, 0), 1) * 30);
}

function pasosDelDia(estado, clave) {
  const p = estado.dias[clave]?.pasos;
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/* -------------------------------------------------------------------------
   Semáforo de comidas
   ------------------------------------------------------------------------- */

export function comidasActivas(estado) {
  return COMIDAS.filter((c) => estado.config.comidas.includes(c.id));
}

/**
 * Resumen del semáforo de un día.
 * `puntaje` va de 0 a 1 y es null mientras no haya nada marcado.
 */
export function semaforoDelDia(estado, clave) {
  const activas = comidasActivas(estado);
  const marcadas = estado.dias[clave]?.comidas || {};
  let suma = 0;
  let registradas = 0;
  const cuenta = { verde: 0, amarillo: 0, rojo: 0 };
  for (const c of activas) {
    const color = marcadas[c.id];
    if (!COLORES[color]) continue;
    registradas += 1;
    cuenta[color] += 1;
    suma += COLORES[color].valor;
  }
  const total = activas.length;
  return {
    total,
    registradas,
    ...cuenta,
    completo: total > 0 && registradas === total,
    puntaje: registradas ? suma / registradas : null,
    // Todas las comidas en verde suman 100, repartidas entre las que haya.
    xp: total ? Math.round((suma / total) * 100) : 0,
  };
}

/**
 * Un día de comidas cumplido: todas anotadas, a lo sumo una roja y en
 * promedio no peor que amarillo. Una comida roja no arruina el día si el
 * resto compensa, porque un día real tiene un cumpleaños o un apuro; dos ya
 * no son un accidente. Todo amarillo lo cumple, de justo.
 */
export function comidasCumplidas(s) {
  // El margen es por la coma flotante: cuatro amarillos suman 2,4000000000000004.
  return s.completo && s.rojo <= 1 && s.puntaje >= COLORES.amarillo.valor - 1e-9;
}

/* -------------------------------------------------------------------------
   Postura
   ------------------------------------------------------------------------- */

export function posturaToca(estado, clave) {
  return estado.config.postura.dias.includes(diaSemana(clave));
}

export function posturaDelDia(estado, clave, rutina = RUTINA_POSTURA) {
  const hechos = new Set(estado.dias[clave]?.postura || []);
  const n = rutina.filter((e) => hechos.has(e.id)).length;
  return {
    hechos: n,
    total: rutina.length,
    completa: rutina.length > 0 && n === rutina.length,
    xp: rutina.length ? Math.round((n / rutina.length) * 100) : 0,
  };
}

/* -------------------------------------------------------------------------
   Un día entero
   ------------------------------------------------------------------------- */

export const BONUS_PLENO = 50;

/**
 * Todo lo de un día: qué tocaba, qué se cumplió y cuánta XP dio.
 * "Pleno" es cumplir todo lo que tocaba ese día.
 */
export function resumenDia(estado, clave) {
  const meta = metaPasos(estado, clave);
  const pasos = pasosDelDia(estado, clave);
  const pasosOk = meta.tipo !== 'libre' && pasos >= meta.meta;
  const semaforo = semaforoDelDia(estado, clave);
  const postura = posturaDelDia(estado, clave);
  const toca = {
    pasos: meta.tipo !== 'libre',
    comidas: semaforo.total > 0,
    postura: posturaToca(estado, clave),
  };
  const ok = {
    pasos: pasosOk,
    comidas: comidasCumplidas(semaforo),
    postura: postura.completa,
  };
  const habitos = Object.keys(toca).filter((k) => toca[k]);
  const pleno = habitos.length > 0 && habitos.every((k) => ok[k]);
  const xp = xpPasos(pasos, meta.meta) + semaforo.xp + postura.xp + (pleno ? BONUS_PLENO : 0);
  return { clave, meta, pasos, semaforo, postura, toca, ok, pleno, xp };
}

/* -------------------------------------------------------------------------
   Niveles
   ------------------------------------------------------------------------- */

/**
 * XP para pasar del nivel n al siguiente. Lineal, como en la otra app: con
 * un día bueno típico (~280 XP) el nivel 10 cae a las dos semanas y el 60,
 * el de Camus, cerca del año. Más lento dejaría media escalera decorativa.
 */
export function xpParaSubir(nivel) {
  return 150 + 40 * (nivel - 1);
}

export function nivelDesdeXp(xpTotal) {
  let nivel = 1;
  let resto = Math.max(0, Math.floor(xpTotal));
  while (resto >= xpParaSubir(nivel) && nivel < 999) {
    resto -= xpParaSubir(nivel);
    nivel += 1;
  }
  const necesita = xpParaSubir(nivel);
  return { nivel, enNivel: resto, necesita, pct: resto / necesita };
}

/* -------------------------------------------------------------------------
   Rachas
   ------------------------------------------------------------------------- */

/**
 * Racha actual de un hábito: días seguidos cumplidos hacia atrás desde hoy.
 * Los días en que no tocaba se saltean sin cortar nada, y hoy, mientras no
 * esté cumplido, tampoco corta: el día todavía no terminó.
 */
export function rachaActual(desde, hoy, toca, cumple) {
  let n = 0;
  for (let clave = hoy; clave >= desde; clave = sumarDias(clave, -1)) {
    if (!toca(clave)) continue;
    if (cumple(clave)) n += 1;
    else if (clave !== hoy) break;
  }
  return n;
}

/** La racha más larga desde el primer registro. */
export function mejorRacha(desde, hoy, toca, cumple) {
  let mejor = 0;
  let n = 0;
  for (let clave = desde; clave <= hoy; clave = sumarDias(clave, 1)) {
    if (!toca(clave)) continue;
    if (cumple(clave)) { n += 1; mejor = Math.max(mejor, n); } else if (clave !== hoy) n = 0;
  }
  return mejor;
}

/* -------------------------------------------------------------------------
   Todo junto
   ------------------------------------------------------------------------- */

export function primerDia(estado, hoy) {
  const claves = Object.keys(estado.dias).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= hoy);
  return claves.length ? claves.sort()[0] : hoy;
}

/**
 * Deriva todo del historial. Nada se guarda calculado: si cambia una meta o
 * el plan de la semana, el progreso se recalcula solo.
 */
export function derivar(estado, hoy = claveDe()) {
  const desde = primerDia(estado, hoy);
  const memo = new Map();
  const dia = (clave) => {
    if (!memo.has(clave)) memo.set(clave, resumenDia(estado, clave));
    return memo.get(clave);
  };

  const totales = {
    xp: 0, pasos: 0, comidas: 0, verdes: 0, rojas: 0, diasVerdes: 0,
    posturas: 0, plenos: 0, diasConAlgo: 0, mejorDiaPasos: 0,
  };
  for (let clave = desde; clave <= hoy; clave = sumarDias(clave, 1)) {
    const r = dia(clave);
    totales.xp += r.xp;
    totales.pasos += r.pasos;
    totales.mejorDiaPasos = Math.max(totales.mejorDiaPasos, r.pasos);
    totales.comidas += r.semaforo.registradas;
    totales.verdes += r.semaforo.verde;
    totales.rojas += r.semaforo.rojo;
    if (r.semaforo.completo && r.semaforo.verde === r.semaforo.total) totales.diasVerdes += 1;
    if (r.postura.completa) totales.posturas += 1;
    if (r.pleno) totales.plenos += 1;
    if (r.pasos || r.semaforo.registradas || r.postura.hechos) totales.diasConAlgo += 1;
  }

  const habitos = {
    pasos: { toca: (k) => dia(k).toca.pasos, cumple: (k) => dia(k).ok.pasos },
    comidas: { toca: (k) => dia(k).toca.comidas, cumple: (k) => dia(k).ok.comidas },
    postura: { toca: (k) => dia(k).toca.postura, cumple: (k) => dia(k).ok.postura },
    plenos: { toca: () => true, cumple: (k) => dia(k).pleno },
    sinRojo: {
      toca: (k) => dia(k).toca.comidas,
      cumple: (k) => dia(k).semaforo.completo && dia(k).semaforo.rojo === 0,
    },
  };
  const rachas = {};
  const mejores = {};
  for (const [id, h] of Object.entries(habitos)) {
    rachas[id] = rachaActual(desde, hoy, h.toca, h.cumple);
    mejores[id] = mejorRacha(desde, hoy, h.toca, h.cumple);
  }

  const nivel = nivelDesdeXp(totales.xp);
  const stats = { totales, rachas, mejores, nivel: nivel.nivel };
  return {
    hoy: dia(hoy),
    totales,
    rachas,
    mejores,
    nivel,
    filosofo: filosofoDe(nivel.nivel),
    siguiente: filosofoDe(nivel.nivel + 1),
    logros: LOGROS.map((l) => {
      const actual = Math.min(l.progreso(stats), l.meta);
      return { ...l, actual, hecho: actual >= l.meta };
    }),
    dia,
  };
}

/* -------------------------------------------------------------------------
   Logros
   ------------------------------------------------------------------------- */

export const LOGROS = [
  { id: 'primero', nombre: 'Primer paso', icono: '🌱', meta: 1,
    desc: 'Anotá algo por primera vez.',
    progreso: (s) => (s.totales.diasConAlgo ? 1 : 0) },
  { id: 'peripatetica', nombre: 'Peripatética', icono: '🚶‍♀️', meta: 7,
    desc: 'Siete días seguidos cumpliendo los pasos. Aristóteles enseñaba caminando.',
    progreso: (s) => s.mejores.pasos },
  { id: 'kant', nombre: 'Puntual como Kant', icono: '🕰️', meta: 30,
    desc: 'Treinta días seguidos cumpliendo los pasos.',
    progreso: (s) => s.mejores.pasos },
  { id: 'medio-millon', nombre: 'Medio millón', icono: '👟', meta: 500000,
    desc: '500.000 pasos acumulados.',
    progreso: (s) => s.totales.pasos },
  { id: 'millon', nombre: 'Un millón', icono: '🌍', meta: 1000000,
    desc: 'Un millón de pasos: unos 700 km caminados.',
    progreso: (s) => s.totales.pasos },
  { id: 'quince-mil', nombre: 'Día largo', icono: '🏞️', meta: 15000,
    desc: '15.000 pasos en un solo día.',
    progreso: (s) => s.totales.mejorDiaPasos },
  { id: 'dia-verde', nombre: 'Día verde', icono: '🟢', meta: 1,
    desc: 'Todas las comidas de un día en verde.',
    progreso: (s) => s.totales.diasVerdes },
  { id: 'semana-sin-rojo', nombre: 'Semana sin rojo', icono: '🥗', meta: 7,
    desc: 'Siete días seguidos con todas las comidas anotadas y ninguna roja.',
    progreso: (s) => s.mejores.sinRojo },
  { id: 'epicurea', nombre: 'Epicúrea', icono: '🍇', meta: 20,
    desc: 'Veinte días verdes. Epicuro pedía poco y lo disfrutaba mucho.',
    progreso: (s) => s.totales.diasVerdes },
  { id: 'honesta', nombre: 'Diario honesto', icono: '📓', meta: 100,
    desc: 'Cien comidas anotadas, las rojas también.',
    progreso: (s) => s.totales.comidas },
  { id: 'erguida', nombre: 'Erguida', icono: '🧍‍♀️', meta: 1,
    desc: 'Completá la rutina de postura por primera vez.',
    progreso: (s) => s.totales.posturas },
  { id: 'columna', nombre: 'Columna jónica', icono: '🏛️', meta: 7,
    desc: 'Siete días seguidos de rutina de postura.',
    progreso: (s) => s.mejores.postura },
  { id: 'treinta-posturas', nombre: 'Treinta rutinas', icono: '🪷', meta: 30,
    desc: 'Treinta rutinas de postura completas.',
    progreso: (s) => s.totales.posturas },
  { id: 'ataraxia', nombre: 'Ataraxia', icono: '🕊️', meta: 1,
    desc: 'Tu primer día pleno: pasos, comidas y postura, todo cumplido.',
    progreso: (s) => s.totales.plenos },
  { id: 'semana-plena', nombre: 'Semana plena', icono: '✨', meta: 7,
    desc: 'Siete días plenos seguidos.',
    progreso: (s) => s.mejores.plenos },
  { id: 'nivel-10', nombre: 'Como Sócrates', icono: '🏺', meta: 10,
    desc: 'Llegá al nivel 10.',
    progreso: (s) => s.nivel },
  { id: 'nivel-22', nombre: 'Meditaciones', icono: '📜', meta: 22,
    desc: 'Llegá al nivel 22, el de Marco Aurelio.',
    progreso: (s) => s.nivel },
  { id: 'nivel-60', nombre: 'Sísifo feliz', icono: '🪨', meta: 60,
    desc: 'Nivel 60: el final de la escalera.',
    progreso: (s) => s.nivel },
];
