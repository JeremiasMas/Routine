// Configuración base: actividades, rangos y definición de logros.

export const SCHEMA_VERSION = 1;

/**
 * Cada actividad tiene su propia pista de XP y su propio nivel.
 * La regla de oro: cumplir la meta = 100 XP, sin importar la actividad.
 *  - kind: 'number' (un valor), 'gym' (ejercicios con series), 'writing' (posts)
 *  - streakMode: 'daily' (se espera todos los días) o 'weekly' (N veces por semana)
 */
export const DEFAULT_ACTIVITIES = [
  {
    id: 'datos',
    name: 'Análisis de datos',
    icon: '📊',
    color: '#38bdf8',
    kind: 'number',
    unit: 'min',
    goal: 45,
    step: 5,
    presets: [15, 30, 45, 60],
    streakMode: 'daily',
    tierNames: ['Curioso', 'Analista Jr.', 'Analista', 'Analista Sr.', 'Científico de datos', 'Oráculo'],
    motto: 'Una hora de datos por día construye una carrera.',
  },
  {
    id: 'piano',
    name: 'Piano',
    icon: '🎹',
    color: '#c084fc',
    kind: 'number',
    unit: 'min',
    goal: 30,
    step: 5,
    presets: [10, 20, 30, 45],
    streakMode: 'daily',
    days: [1, 5, 6, 0], // lunes, viernes, sábado y domingo
    tierNames: ['Primeras teclas', 'Estudiante', 'Intérprete', 'Concertista', 'Virtuoso', 'Maestro de capilla'],
    motto: 'Los dedos recuerdan lo que la cabeza olvida.',
  },
  {
    id: 'gym',
    name: 'Gimnasio',
    icon: '🏋️',
    color: '#fb7185',
    kind: 'gym',
    unit: 'series',
    goal: 30,            // series de una sesión libre; con plantilla manda la plantilla
    step: 1,
    streakMode: 'weekly',
    weeklyTarget: 3,
    days: [1, 3, 5],     // lunes, miércoles y viernes
    streakUnitLabel: 'semanas',
    // El nivel no lo dan las sesiones sino la fuerza lograda: cada nombre
    // corresponde a una banda de la escala de fuerza relativa.
    rankBy: 'strength',
    tierNames: ['Novato de sala', 'Fierrero', 'Atleta', 'Fuerte', 'Bestia', 'Titán'],
    motto: 'La rutina no se negocia, se hace.',
  },
  {
    id: 'muaythai',
    name: 'Muay Thai',
    icon: '🥊',
    color: '#f59e0b',
    kind: 'number',
    unit: 'min',
    goal: 90,
    step: 15,
    presets: [60, 75, 90, 120],
    streakMode: 'weekly',
    weeklyTarget: 2,
    // El objetivo cambió en el tiempo: un año de una clase por semana no debe
    // figurar como incumplido solo porque hoy la meta sean dos.
    weeklyTargetHistory: [
      { from: '2025-08-04', target: 1 },
      { from: '2026-09-07', target: 2 },
    ],
    days: [2, 4],        // martes y jueves
    streakUnitLabel: 'semanas',
    // Escalafón tradicional del muay thai: discípulo, peleador, guerrero,
    // campeón, instructor y gran maestro.
    tierNames: ['Luk Sit', 'Nak Muay', 'Nak Su', 'Campeón de estadio', 'Kru', 'Ajarn'],
    motto: 'El arte de las ocho extremidades.',
  },
  {
    id: 'pasos',
    name: 'Pasos',
    icon: '👟',
    color: '#34d399',
    kind: 'number',
    unit: 'pasos',
    goal: 10000,
    step: 500,
    presets: [5000, 8000, 10000, 15000],
    streakMode: 'daily',
    tierNames: ['Paseante', 'Caminante', 'Andariego', 'Trotamundos', 'Explorador', 'Nómade'],
    motto: 'Diez mil razones para salir a caminar.',
  },
  {
    id: 'frances',
    name: 'Francés',
    icon: '🇫🇷',
    color: '#84cc16',
    kind: 'multi',
    unit: 'min',
    goal: 10,            // minutos de francés por día
    step: 5,
    streakMode: 'daily',
    /**
     * Dos fuentes, medidas en minutos reales.
     *
     * Una lección de Duolingo son 2 minutos de repetición densa con retrieval
     * constante; un episodio de Coffee Break French son 22 de diálogo,
     * gramática explicada y escucha a velocidad natural. Por minuto se
     * compensan —Duolingo es más intenso, el podcast más amplio—, así que no
     * hace falta ponderar ninguna: el tiempo real es el denominador honesto.
     * De ahí que un episodio equivalga a 11 lecciones.
     */
    sources: [
      { id: 'duolingo', name: 'Duolingo', icon: '🦉', unitLabel: 'lecciones', minutes: 2, presets: [1, 3, 5, 10] },
      { id: 'cbf', name: 'Coffee Break French', icon: '🎧', unitLabel: 'episodios', minutes: 22, presets: [1, 2] },
    ],
    // Los niveles reales del Marco Común Europeo de Referencia.
    tierNames: ['A1 · Débutant', 'A2 · Élémentaire', 'B1 · Intermédiaire', 'B2 · Avancé', 'C1 · Autonome', 'C2 · Maîtrise'],
    motto: 'Petit à petit, l’oiseau fait son nid.',
  },
  {
    id: 'agua',
    name: 'Agua',
    icon: '💧',
    color: '#22d3ee',
    kind: 'number',
    unit: 'ml',
    goal: 2150,          // 35 ml/kg; se recalcula solo con tu último peso
    step: 250,
    presets: [250, 500, 750, 1000],
    streakMode: 'daily',
    autoGoal: 'water',   // la meta la deriva el peso, no se toca a mano
    // Tomar agua es un hábito, no una disciplina que se entrena: se cuenta la
    // racha y cuenta para el día perfecto, pero no tiene XP ni rangos propios.
    leveled: false,
    motto: 'La hidratación es la mitad del rendimiento.',
  },
  {
    id: 'cuerpo',
    name: 'Composición corporal',
    icon: '📏',
    color: '#f472b6',
    kind: 'body',
    unit: 'mediciones',
    goal: 1,
    step: 1,
    streakMode: 'weekly',
    weeklyTarget: 1,
    streakUnitLabel: 'semanas',
    // El rango no sale de la XP sino del porcentaje de grasa medido, y la
    // escalera termina en la meta: bajar de ahí ya no es salud, es competencia.
    rankBy: 'bodyfat',
    targetBodyFat: 13,
    motto: 'Lo que se mide, se puede mejorar.',
  },
  {
    id: 'substack',
    name: 'Escritura · Substack',
    icon: '✍️',
    color: '#e879f9',
    kind: 'writing',
    unit: 'posts',
    goal: 1,
    step: 1,
    presets: [1, 2],
    streakMode: 'weekly',
    weeklyTarget: 1,
    streakUnitLabel: 'semanas',
    cadence: 'weekly',
    tierNames: ['Borrador', 'Cronista', 'Editorialista', 'Ensayista', 'Escritor', 'Pluma consagrada'],
    motto: 'Publicar es el único editor honesto.',
  },
];

/**
 * Rangos de repeticiones por tipo de movimiento.
 *
 * Un solo rango para todo (eran 10-15) se contradecía con la propia app, que
 * pide series de 5 para medir fuerza porque a 15 repeticiones el 1RM estimado
 * se dispersa ±28 kg. Los movimientos grandes viven abajo, donde la carga es
 * el estímulo y la medición sirve; los aislamientos viven arriba, donde lo que
 * importa es el trabajo acumulado y nadie mide un 1RM de vuelos laterales.
 */
export const RANGOS_REPS = {
  pesado: { min: 5, max: 8 },
  medio: { min: 8, max: 12 },
  liviano: { min: 12, max: 20 },
};

/**
 * Grupos musculares y series semanales donde la mayoría de la gente progresa.
 *
 * Son referencias, como las tablas de fuerza: ubican y muestran si algo está
 * muy abajo o muy arriba, no deciden decimales. Debajo del mínimo el grupo
 * suele estar sólo manteniéndose; muy por encima del máximo la recuperación
 * empieza a ser el límite antes que el estímulo.
 */
export const GRUPOS = {
  espalda: { name: 'Espalda', min: 10, max: 20 },
  pecho: { name: 'Pecho', min: 10, max: 20 },
  hombros: { name: 'Hombros', min: 8, max: 20 },
  biceps: { name: 'Bíceps', min: 8, max: 20 },
  triceps: { name: 'Tríceps', min: 8, max: 20 },
  cuadriceps: { name: 'Cuádriceps', min: 8, max: 18 },
  isquios: { name: 'Isquios', min: 6, max: 16 },
  gluteos: { name: 'Glúteos', min: 6, max: 16 },
  pantorrillas: { name: 'Pantorrillas', min: 8, max: 16 },
  core: { name: 'Core', min: 8, max: 20 },
  antebrazos: { name: 'Antebrazos', min: 6, max: 15 },
};

/**
 * Rutina del gimnasio. Cargarla desde una plantilla evita tipear 14 ejercicios,
 * y las series planificadas son la meta de la sesión: completarlas = 100 XP.
 *  - day: día de la semana en que toca (0 = domingo)
 *  - bw: ejercicio de peso corporal (el peso es carga EXTRA, puede ir vacío)
 *  - db: se hace con una mancuerna en cada mano
 *  - grupo: el músculo que hace el trabajo; `tambien`, los que ayudan y se
 *    llevan media serie de crédito cada uno (un remo entrena bíceps, pero no
 *    como un curl)
 *  - rango: en qué rango de repeticiones vive el ejercicio
 *  - salto: de a cuánto sube la carga cuando cerrás el rango. Por defecto 2,5
 *    en barra y polea y 2 en mancuerna, que es el escalón real del rack
 */
export const GYM_TEMPLATES = [
  {
    id: 'espalda-biceps',
    day: 1,
    name: 'Espalda / Bíceps + Abs',
    short: 'Espalda · Bíceps',
    exercises: [
      { name: 'Dominadas agarre ancho', bw: true, grupo: 'espalda', tambien: ['biceps'], rango: 'pesado' },
      { name: 'Remo bajo cerrado', grupo: 'espalda', tambien: ['biceps'], rango: 'medio' },
      { name: 'Remo con barra al pecho', grupo: 'espalda', tambien: ['biceps'], rango: 'pesado' },
      { name: 'Remo sentado con agarre supino en polea', grupo: 'espalda', tambien: ['biceps'], rango: 'medio' },
      { name: 'Pullover', grupo: 'espalda', tambien: ['pecho'], rango: 'medio' },
      { name: 'Curl en polea baja con barra', grupo: 'biceps', rango: 'medio' },
      { name: 'Curl con soga en polea baja', grupo: 'biceps', tambien: ['antebrazos'], rango: 'medio' },
      { name: 'Face pulls', grupo: 'hombros', tambien: ['espalda'], rango: 'liviano' },
      { name: 'Standing cable crunch', grupo: 'core', rango: 'medio' },
      { name: 'Elevaciones de piernas en paralelas', bw: true, grupo: 'core', rango: 'liviano' },
      { name: 'Weighted crunch', grupo: 'core', rango: 'liviano' },
      { name: 'Russian twist', grupo: 'core', rango: 'liviano' },
    ],
  },
  {
    id: 'hombros-triceps',
    day: 3,
    name: 'Hombros / Tríceps / Antebrazos',
    short: 'Hombros · Tríceps',
    exercises: [
      { name: 'Vuelo lateral con mancuerna vertical', db: true, grupo: 'hombros', rango: 'liviano' },
      { name: 'Vuelo lateral con mancuerna horizontal', db: true, grupo: 'hombros', rango: 'liviano' },
      { name: 'Vuelo posterior', db: true, grupo: 'hombros', tambien: ['espalda'], rango: 'liviano' },
      { name: 'Pullover en camilla inclinada', grupo: 'espalda', tambien: ['pecho'], rango: 'medio' },
      { name: 'Encogimientos de trapecio', db: true, grupo: 'espalda', rango: 'medio' },
      { name: 'Press militar', grupo: 'hombros', tambien: ['triceps'], rango: 'pesado' },
      { name: 'Arnold con polea', grupo: 'hombros', tambien: ['triceps'], rango: 'medio' },
      { name: 'Tríceps supino', grupo: 'triceps', rango: 'medio' },
      { name: 'Tríceps con soga', grupo: 'triceps', rango: 'medio' },
      { name: 'Tríceps trasnuca', grupo: 'triceps', rango: 'medio' },
      { name: 'French press', grupo: 'triceps', rango: 'medio' },
      { name: 'Dumbbell standing pronation wrist', db: true, grupo: 'antebrazos', rango: 'liviano', salto: 1 },
      { name: 'Dumbbell over bench palms up curl', db: true, grupo: 'biceps', tambien: ['antebrazos'], rango: 'medio' },
      { name: 'Dumbbell standing wrist curl', db: true, grupo: 'antebrazos', rango: 'liviano', salto: 1 },
    ],
  },
  {
    id: 'pecho-piernas',
    day: 5,
    name: 'Pecho / Piernas',
    short: 'Pecho · Piernas',
    exercises: [
      { name: 'Pecho plano', grupo: 'pecho', tambien: ['triceps', 'hombros'], rango: 'pesado' },
      { name: 'Pecho inclinado', grupo: 'pecho', tambien: ['triceps', 'hombros'], rango: 'pesado' },
      { name: 'Aperturas inclinadas', db: true, grupo: 'pecho', rango: 'medio' },
      { name: 'Sentadilla con barra', grupo: 'cuadriceps', tambien: ['gluteos'], rango: 'pesado' },
      { name: 'Sillón de cuádriceps', grupo: 'cuadriceps', rango: 'medio' },
      { name: 'Camilla de isquiotibiales', grupo: 'isquios', rango: 'medio' },
      { name: 'Peso muerto rumano', grupo: 'isquios', tambien: ['gluteos', 'espalda'], rango: 'pesado' },
      { name: 'Sillón de abductores', grupo: 'gluteos', rango: 'medio' },
      { name: 'Elevaciones de talón', grupo: 'pantorrillas', rango: 'liviano' },
    ],
  },
];

/**
 * Series por defecto de cada ejercicio. Las repeticiones ya no son una sola
 * cifra para todo: las decide el rango del ejercicio (ver RANGOS_REPS).
 */
export const DEFAULT_SETS = 3;

export function templateById(id) {
  return GYM_TEMPLATES.find((t) => t.id === id) || null;
}

/** Plantilla que toca en un día de la semana (0 = domingo). */
export function templateForDay(weekday) {
  return GYM_TEMPLATES.find((t) => t.day === weekday) || null;
}

/**
 * Ejercicios que se hacen con una mancuerna en cada mano. En esos se anota el
 * peso de UNA —que es el número que está escrito en la mancuerna y el que uno
 * compara con la vez anterior— y la app cuenta las dos para el tonelaje.
 * Sin esta marca, anotar 12 o 24 quedaba a criterio de cada día y el tonelaje
 * dejaba de ser comparable consigo mismo.
 */
export function esMancuerna(nombre, plantillas = GYM_TEMPLATES) {
  const clave = (nombre || '').trim().toLowerCase();
  if (!clave) return false;
  for (const t of plantillas) {
    for (const ex of t.exercises) {
      if (ex.name.trim().toLowerCase() === clave) return Boolean(ex.db);
    }
  }
  // Los que traen "mancuerna" o "dumbbell" en el nombre, aunque sean a mano.
  return /\bmancuerna|\bdumbbell/.test(clave);
}

/**
 * El perfil de un ejercicio: qué músculo trabaja, en qué rango vive y de a
 * cuánto sube.
 *
 * Los de las plantillas lo traen escrito. Los que cargás a mano en el Día 4
 * no, así que se deduce de lo que se pueda: si el nombre dice mancuerna, el
 * salto es el del rack. Lo que no se sabe queda en 'otros' en vez de
 * inventar un grupo, porque un volumen mal atribuido es peor que uno ausente.
 */
export function perfilDeEjercicio(nombre, plantillas = GYM_TEMPLATES) {
  const clave = (nombre || '').trim().toLowerCase();
  let ex = null;
  for (const t of plantillas) {
    for (const e of t.exercises) {
      if (e.name.trim().toLowerCase() === clave) { ex = e; break; }
    }
    if (ex) break;
  }
  const db = ex ? Boolean(ex.db) : esMancuerna(nombre, plantillas);
  return {
    nombre: ex?.name || (nombre || '').trim(),
    grupo: ex?.grupo || null,
    tambien: ex?.tambien || [],
    rango: ex?.rango || 'medio',
    bw: Boolean(ex?.bw),
    db,
    // El escalón real del gimnasio: 2,5 en barra y polea, 2 en mancuerna.
    salto: ex?.salto ?? (db ? 2 : 2.5),
  };
}

/** Series planificadas de una plantilla. */
export function plannedSets(template) {
  if (!template || !template.exercises.length) return 0;
  return template.exercises.reduce((n, ex) => n + (ex.sets || DEFAULT_SETS), 0);
}

/**
 * Datos personales que alimentan los cálculos: la estatura no cambia, el peso
 * sale de la última medición y la fórmula elige entre las dos versiones del
 * método de la Marina (la de 3 medidas o la de 4, que suma la cadera).
 */
export const DEFAULT_PROFILE = {
  height: 160,
  bodyFormula: '3',
  // Línea de base: la primera medición arranca con estos valores ya cargados.
  weight: 61.5,
  waist: 78,
  neck: 35,
};

/**
 * Escalones de rango: en qué nivel se asciende y con qué color.
 * Los NOMBRES los pone cada actividad en su `tierNames`, porque "Adepto" no
 * dice nada y "Nak Su" o "B2 · Avancé" sí.
 */
export const TIERS = [
  { min: 1, name: 'Novato', color: '#94a3b8' },
  { min: 5, name: 'Aprendiz', color: '#4ade80' },
  { min: 10, name: 'Adepto', color: '#38bdf8' },
  { min: 20, name: 'Experto', color: '#a78bfa' },
  { min: 35, name: 'Maestro', color: '#fbbf24' },
  { min: 50, name: 'Leyenda', color: '#fb7185' },
];

/** Nombres genéricos, para actividades que agregues vos. */
export const DEFAULT_TIER_NAMES = TIERS.map((t) => t.name);

/** Rangos del jugador (nivel global). */
/**
 * Rangos de jugador: veinte generales, del nivel 1 al 60.
 *
 * El primero dura cinco niveles —cambiar de rango a los tres días no
 * significaría nada— y de ahí en más se sube cada tres, hasta que Gengis Kan
 * cae exactamente en el 60. Pasado el 60 se sigue subiendo de nivel, pero ya
 * no hay rango nuevo: el último es el último.
 *
 * El orden no es cronológico ni de fama, sino de dificultad de lo logrado: de
 * lo más acotado a lo más improbable. Por eso Escipión va antes que Aníbal
 * aunque lo haya vencido —tenía a Roma entera detrás— y Eisenhower antes que
 * Belisario, que hizo algo comparable con muchísimo menos.
 *
 * Cada `nota` es por qué está en ese escalón, no un dato de enciclopedia.
 */
export const PLAYER_TITLES = [
  { min: 1, name: 'Leónidas', nota: '300 hombres, tres días, un desfiladero.' },
  { min: 6, name: 'Milcíades', nota: 'Maratón: diez mil atenienses contra un imperio.' },
  { min: 9, name: 'Temístocles', nota: 'Construyó una flota y con ella ganó Salamina.' },
  { min: 12, name: 'Escipión', nota: 'Venció al invicto, con Roma entera detrás.' },
  { min: 15, name: 'Wellington', nota: 'Nunca perdió una batalla; tampoco le faltó nada.' },
  { min: 18, name: 'Eisenhower', nota: 'La operación más grande jamás montada.' },
  { min: 21, name: 'Saladino', nota: 'Unificó un mundo dividido y recuperó Jerusalén.' },
  { min: 24, name: 'Epaminondas', nota: 'Rompió el mito espartano con menos hombres.' },
  { min: 27, name: 'Julio César', nota: 'La Galia en inferioridad; después, Roma.' },
  { min: 30, name: 'Zhukov', nota: 'Dio vuelta una guerra que se estaba perdiendo.' },
  { min: 33, name: 'Gustavo Adolfo', nota: 'Suecia contra el Imperio, y cambió cómo se peleaba.' },
  { min: 36, name: 'Tamerlán', nota: 'Rehízo un imperio partiendo de casi nada.' },
  { min: 39, name: 'Subotai', nota: 'Campañas en dos continentes, sin comunicaciones.' },
  { min: 42, name: 'Jaled ibn al-Walid', nota: 'Cien batallas, ninguna perdida, casi siempre en inferioridad.' },
  { min: 45, name: 'Alejandro Magno', nota: 'Heredó el mejor ejército y aun así hizo lo improbable.' },
  { min: 48, name: 'Napoleón', nota: 'De teniente sin fortuna a dueño de Europa, contra siete coaliciones.' },
  { min: 51, name: 'Federico el Grande', nota: 'Prusia sola contra Austria, Francia y Rusia. Sobrevivió.' },
  { min: 54, name: 'Belisario', nota: 'Recuperó medio Imperio con ejércitos diminutos y un emperador en contra.' },
  { min: 57, name: 'Aníbal', nota: 'Quince años en territorio enemigo, sin refuerzos, invicto en campo.' },
  { min: 60, name: 'Gengis Kan', nota: 'Empezó huérfano y esclavo. Terminó con el imperio más grande jamás unido.' },
];

/** XP extra por eventos especiales. */
export const BONUS = {
  perfectDay: 50,        // todo lo que tocaba ese día
  almostPerfect: 20,     // del 80% para arriba: fallar una no es fallar todas
  almostThreshold: 0.8,
  personalRecord: 25,    // récord personal en un ejercicio
};

/**
 * Logros. Cada uno recibe el estado derivado y devuelve el progreso actual
 * sobre `target`; se desbloquea al alcanzarlo.
 */
export const ACHIEVEMENTS = [
  { id: 'first-blood', name: 'Primer paso', icon: '🌱', xp: 25, target: 1,
    desc: 'Registrá tu primera actividad.',
    progress: (s) => (s.totalEntries > 0 ? 1 : 0) },
  { id: 'week-1', name: 'Semana viva', icon: '🔥', xp: 50, target: 7,
    desc: '7 días seguidos de racha en cualquier actividad.',
    progress: (s) => s.bestDailyStreak },
  { id: 'week-4', name: 'Mes de fuego', icon: '🔥', xp: 150, target: 30,
    desc: '30 días seguidos de racha en cualquier actividad.',
    progress: (s) => s.bestDailyStreak },
  { id: 'century-streak', name: 'Centurión', icon: '💯', xp: 500, target: 100,
    desc: '100 días seguidos de racha en cualquier actividad.',
    progress: (s) => s.bestDailyStreak },
  { id: 'perfect-1', name: 'Día perfecto', icon: '⭐', xp: 50, target: 1,
    desc: 'Cumplí todas las metas diarias en un mismo día.',
    progress: (s) => s.perfectDays },
  { id: 'perfect-10', name: 'Diez de diez', icon: '🌟', xp: 200, target: 10,
    desc: 'Diez días perfectos.',
    progress: (s) => s.perfectDays },
  { id: 'data-10h', name: 'Analista jr.', icon: '📊', xp: 100, target: 600,
    desc: '10 horas acumuladas de análisis de datos.',
    progress: (s) => s.totals.datos || 0 },
  { id: 'data-100h', name: 'Científico de datos', icon: '🧠', xp: 400, target: 6000,
    desc: '100 horas acumuladas de análisis de datos.',
    progress: (s) => s.totals.datos || 0 },
  { id: 'piano-25h', name: 'Manos de seda', icon: '🎹', xp: 150, target: 1500,
    desc: '25 horas de piano acumuladas.',
    progress: (s) => s.totals.piano || 0 },
  { id: 'steps-million', name: 'Millón de pasos', icon: '👟', xp: 300, target: 1000000,
    desc: 'Un millón de pasos acumulados.',
    progress: (s) => s.totals.pasos || 0 },
  { id: 'steps-10m', name: 'Diez millones', icon: '🌍', xp: 800, target: 10000000,
    desc: 'Diez millones de pasos: unas 7.000 km, el largo de un continente.',
    progress: (s) => s.totals.pasos || 0 },
  { id: 'steps-20k', name: 'Maratonista', icon: '🏃', xp: 75, target: 1,
    desc: '20.000 pasos en un solo día.',
    progress: (s) => ((s.bests.pasos || 0) >= 20000 ? 1 : 0) },
  { id: 'tonnage-100k', name: 'Cien toneladas', icon: '🏋️', xp: 250, target: 100000,
    desc: '100.000 kg de tonelaje acumulado.',
    progress: (s) => s.volumes.gym || 0 },
  { id: 'gym-50', name: 'Rata de gimnasio', icon: '🦾', xp: 200, target: 50,
    desc: '50 sesiones de gimnasio completadas.',
    progress: (s) => s.sessions.gym || 0 },
  { id: 'gym-full-week', name: 'Semana redonda', icon: '🗓️', xp: 150, target: 4,
    desc: '4 semanas cumpliendo las 3 sesiones de gimnasio.',
    progress: (s) => s.weeklyStreaks.gym || 0 },
  { id: 'pr-1', name: 'Récord personal', icon: '🥇', xp: 50, target: 1,
    desc: 'Rompé tu primer récord en un ejercicio.',
    progress: (s) => s.personalRecords },
  { id: 'pr-25', name: 'Rompehuesos', icon: '💪', xp: 250, target: 25,
    desc: '25 récords personales rotos.',
    progress: (s) => s.personalRecords },
  { id: 'mt-20', name: 'Nak Muay', icon: '🥊', xp: 200, target: 20,
    desc: '20 sesiones de Muay Thai.',
    progress: (s) => s.sessions.muaythai || 0 },
  { id: 'write-4', name: 'Columnista', icon: '✍️', xp: 150, target: 4,
    desc: 'Publicá 4 textos en Substack.',
    progress: (s) => s.totals.substack || 0 },
  { id: 'write-25', name: 'Autor', icon: '📚', xp: 500, target: 25,
    desc: 'Publicá 25 textos en Substack.',
    progress: (s) => s.totals.substack || 0 },
  { id: 'duo-50', name: 'Francófilo', icon: '🇫🇷', xp: 150, target: 50,
    desc: '50 días de francés.',
    progress: (s) => s.activeDays.frances || 0 },
  { id: 'all-lvl-5', name: 'Polifacético', icon: '🎯', xp: 300, target: 1,
    desc: 'Llevá todas tus actividades a nivel 5.',
    progress: (s) => (s.minActivityLevel >= 5 ? 1 : 0) },
  { id: 'water-30', name: 'Bien hidratado', icon: '💧', xp: 150, target: 30,
    desc: '30 días cumpliendo la meta de agua.',
    progress: (s) => s.goalDays.agua || 0 },
  { id: 'body-8', name: 'Bajo control', icon: '📏', xp: 150, target: 8,
    desc: '8 mediciones de composición corporal.',
    progress: (s) => s.sessions.cuerpo || 0 },
  { id: 'bodyfat-15', name: 'Definido', icon: '🔪', xp: 300, target: 1,
    desc: 'Bajar del 15% de grasa corporal.',
    progress: (s) => ((s.bodyFat != null && s.bodyFat < 15) ? 1 : 0) },
  { id: 'bodyfat-meta', name: 'Meta alcanzada', icon: '🎯', xp: 600, target: 1,
    desc: 'Llegar al 13% de grasa corporal.',
    progress: (s) => ((s.bodyFat != null && s.bodyFat <= 13) ? 1 : 0) },
  { id: 'fuerza-1x', name: 'Tu propio peso', icon: '🦵', xp: 200, target: 1,
    desc: 'Sentadilla de 1× tu peso corporal.',
    progress: (s) => ((s.strengthRatios?.squat || 0) >= 1 ? 1 : 0) },
  { id: 'fuerza-intermedio', name: 'Fuerza intermedia', icon: '⚡', xp: 300, target: 3,
    desc: '3 movimientos en nivel intermedio o superior.',
    progress: (s) => s.strengthIntermediates || 0 },
  { id: 'fuerza-general', name: 'Atleta completo', icon: '🏅', xp: 400, target: 3,
    desc: 'Alcanzar nivel intermedio de fuerza general.',
    progress: (s) => s.strengthBand || 0 },
  // --- Resiliencia: recaer y volver también cuenta ---
  { id: 'volver', name: 'Volver', icon: '🔄', xp: 200, target: 14,
    desc: 'Retomá una actividad después de dos semanas sin hacerla.',
    progress: (s) => s.maxGap || 0 },
  { id: 'escudo-usado', name: 'Escudo bien usado', icon: '🛡️', xp: 150, target: 20,
    desc: 'Que un escudo te salve una racha de 20 días o más.',
    progress: (s) => s.shieldSaveBest || 0 },
  { id: 'sin-red', name: 'Sin red', icon: '🧱', xp: 250, target: 30,
    desc: '30 días de racha sin gastar un solo escudo.',
    progress: (s) => s.noShieldStreak || 0 },
  { id: 'remontada', name: 'Mes flojo, mes fuerte', icon: '📈', xp: 200, target: 1,
    desc: 'Después de un mes peor que el anterior, remontar al siguiente.',
    progress: (s) => s.remontadas || 0 },

  // --- Días densos: combinar actividades en la misma jornada ---
  { id: 'doble-sesion', name: 'Doble sesión', icon: '🥵', xp: 100, target: 1,
    desc: 'Gimnasio y Muay Thai el mismo día.',
    progress: (s) => s.combos?.dobleSesion || 0 },
  { id: 'cuerpo-y-mente', name: 'Cuerpo y mente', icon: '🧩', xp: 150, target: 10,
    desc: 'Diez días con datos, gimnasio y los 10.000 pasos.',
    progress: (s) => s.combos?.cuerpoYMente || 0 },
  { id: 'dia-completo', name: 'Día completo', icon: '💯', xp: 250, target: 1,
    desc: 'Cumplir las seis misiones de un lunes, el día más cargado.',
    progress: (s) => s.combos?.diaCompleto || 0 },
  { id: 'domingo-productivo', name: 'Domingo productivo', icon: '🌙', xp: 150, target: 4,
    desc: 'Cuatro domingos con piano, escritura y los pasos hechos.',
    progress: (s) => s.combos?.domingoProductivo || 0 },

  // --- Constancia fina ---
  { id: 'reloj-suizo', name: 'Reloj suizo', icon: '⏱️', xp: 300, target: 4,
    desc: 'Cuatro semanas cumpliendo la meta de pasos los siete días.',
    progress: (s) => s.relojSuizo || 0 },
  { id: 'un-ano', name: 'Un año adentro', icon: '🎂', xp: 500, target: 365,
    desc: 'Un año desde tu primer registro.',
    progress: (s) => s.diasDesdeElPrimero || 0 },
  { id: 'sin-faltar', name: 'Sin faltar', icon: '🌓', xp: 250, target: 30,
    desc: 'Un mes entero sin un solo día en cero.',
    progress: (s) => s.sinFaltar || 0 },
  { id: 'equilibrado', name: 'Equilibrado', icon: '⚖️', xp: 250, target: 1,
    desc: 'Que en el último mes ninguna actividad se lleve más del 40% de tu XP.',
    progress: (s) => ((s.xpMes > 1500 && s.concentracionMes <= 0.4) ? 1 : 0) },

  // --- Los que faltaban por disciplina ---
  { id: 'piano-100h', name: 'Concierto', icon: '🎼', xp: 500, target: 6000,
    desc: '100 horas de piano acumuladas.',
    progress: (s) => s.totals.piano || 0 },
  { id: 'mt-100', name: 'Cien clases', icon: '🥋', xp: 600, target: 100,
    desc: '100 sesiones de Muay Thai.',
    progress: (s) => s.sessions.muaythai || 0 },
  { id: 'cbf-25', name: 'Escucha activa', icon: '📻', xp: 200, target: 25,
    desc: '25 episodios de Coffee Break French.',
    progress: (s) => s.sourceTotals?.frances?.cbf || 0 },
  { id: 'cuerpo-26', name: 'Medio año medido', icon: '📐', xp: 300, target: 26,
    desc: 'Veintiséis mediciones: una por semana durante medio año.',
    progress: (s) => s.sessions.cuerpo || 0 },
  { id: 'mil-series', name: 'Mil series', icon: '🔁', xp: 400, target: 1000,
    desc: 'Mil series de gimnasio acumuladas.',
    progress: (s) => s.totals.gym || 0 },

  { id: 'player-10', name: 'Doble dígito', icon: '🏆', xp: 200, target: 10,
    desc: 'Alcanzá el nivel 10 de jugador.',
    progress: (s) => s.playerLevel },

  // =========================================================================
  // Fuerza
  //
  // Los kilos salen de la misma escala que el nivel del gimnasio, así que un
  // logro y una categoría nunca se contradicen. A 61,5 kg de peso corporal:
  // sentadilla Intermedio 92 kg y Avanzado 138; banca 77 y 108; press militar
  // 52 y 68; dominadas +13 kg y +30.
  // =========================================================================
  { id: 'squat-100', name: 'Dos platos', icon: '🏗️', xp: 300, target: 100,
    desc: 'Sentadilla de 100 kg estimados: dos discos de 20 por lado más la barra.',
    progress: (s) => s.strengthE1rm?.squat || 0 },
  { id: 'squat-avanzado', name: 'Sentadilla avanzada', icon: '🗿', xp: 700, target: 1,
    desc: 'Llevá la sentadilla al nivel Avanzado de la escala.',
    progress: (s) => ((s.strengthNivel?.squat ?? -1) >= 3 ? 1 : 0) },
  { id: 'bench-bw', name: 'Banca de tu peso', icon: '🛗', xp: 250, target: 1,
    desc: 'Press de banca de una vez tu peso corporal.',
    progress: (s) => ((s.strengthRatios?.bench || 0) >= 1 ? 1 : 0) },
  { id: 'bench-avanzado', name: 'Banca avanzada', icon: '🧨', xp: 700, target: 1,
    desc: 'Llevá el press de banca al nivel Avanzado.',
    progress: (s) => ((s.strengthNivel?.bench ?? -1) >= 3 ? 1 : 0) },
  { id: 'ohp-intermedio', name: 'Press militar pesado', icon: '🎖️', xp: 300, target: 1,
    desc: 'Press militar en nivel Intermedio. Es el movimiento que menos perdona.',
    progress: (s) => ((s.strengthNivel?.ohp ?? -1) >= 2 ? 1 : 0) },
  { id: 'ohp-bw', name: 'Press de tu peso', icon: '👑', xp: 800, target: 1,
    desc: 'Press militar de una vez tu peso corporal, de pie y sin impulso.',
    progress: (s) => ((s.strengthRatios?.ohp || 0) >= 1 ? 1 : 0) },
  { id: 'pullup-10', name: 'Dominada con lastre', icon: '🪝', xp: 250, target: 10,
    desc: 'Una dominada con 10 kg colgando del cinturón.',
    progress: (s) => s.lastreMaximo || 0 },
  { id: 'pullup-30', name: 'Dominada avanzada', icon: '⛓️', xp: 700, target: 30,
    desc: 'Una dominada con 30 kg de lastre: la mitad de tu cuerpo otra vez.',
    progress: (s) => s.lastreMaximo || 0 },
  { id: 'tres-grandes', name: 'Los tres grandes', icon: '🏛️', xp: 800, target: 4,
    desc: 'Sentadilla, banca y press militar sumando cuatro veces tu peso corporal.',
    progress: (s) => s.ratioTresGrandes || 0 },
  { id: 'avanzado-todo', name: 'Avanzado en todo', icon: '🥇', xp: 2000, target: 7,
    desc: 'Los siete movimientos medidos en nivel Avanzado. El más difícil de la lista.',
    progress: (s) => (s.strengthMedidos >= 7 ? s.strengthAvanzados || 0 : 0) },
  { id: 'sesion-15k', name: 'Una tonelada y media', icon: '🧱', xp: 250, target: 15000,
    desc: '15.000 kg movidos en una sola sesión.',
    progress: (s) => s.tonelajeMaxSesion || 0 },
  { id: 'tonnage-1m', name: 'Un millón de kilos', icon: '🏔️', xp: 700, target: 1000000,
    desc: 'Un millón de kilos de tonelaje acumulado.',
    progress: (s) => s.volumes.gym || 0 },
  { id: 'tonnage-5m', name: 'Cinco millones', icon: '🌋', xp: 1500, target: 5000000,
    desc: 'Cinco millones de kilos. Son años de barra.',
    progress: (s) => s.volumes.gym || 0 },
  { id: 'diez-mil-series', name: 'Diez mil series', icon: '🔁', xp: 1000, target: 10000,
    desc: 'Diez mil series de gimnasio acumuladas.',
    progress: (s) => s.totals.gym || 0 },
  { id: 'simetria', name: 'Simetría', icon: '⚖️', xp: 500, target: 1,
    desc: 'Los tres pares de empuje y tirón con menos de 0,3 categorías de diferencia.',
    progress: (s) => (Number.isFinite(s.brechaMaxima) && s.brechaMaxima < 0.3 ? 1 : 0) },
  { id: 'todo-en-rango', name: 'Todo en rango', icon: '📐', xp: 600, target: 4,
    desc: 'Cuatro semanas seguidas con todos los grupos musculares dentro de su rango.',
    progress: (s) => s.semanasTodoEnRango || 0 },
  { id: 'sin-trabarse', name: 'Sin trabarse', icon: '🚂', xp: 600, target: 180,
    desc: 'Seis meses de gimnasio sin que ningún ejercicio pase un mes sin récord.',
    progress: (s) => s.diasSinSequia || 0 },
  { id: 'progresion-limpia', name: 'Progresión limpia', icon: '📶', xp: 400, target: 12,
    desc: 'Doce sesiones seguidas de un mismo ejercicio sin que el 1RM baje.',
    progress: (s) => s.progresionLimpia || 0 },

  // =========================================================================
  // Rachas
  // =========================================================================
  { id: 'streak-200', name: 'Doscientos', icon: '🗓️', xp: 700, target: 200,
    desc: '200 días seguidos de racha.',
    progress: (s) => s.bestDailyStreak },
  { id: 'streak-365', name: 'Año de fuego', icon: '🎆', xp: 1200, target: 365,
    desc: 'Un año entero de racha, sin cortar una sola vez.',
    progress: (s) => s.bestDailyStreak },
  { id: 'streak-500', name: 'Quinientos', icon: '🏔️', xp: 1500, target: 500,
    desc: '500 días seguidos.',
    progress: (s) => s.bestDailyStreak },
  { id: 'streak-1000', name: 'Mil días', icon: '🗿', xp: 3000, target: 1000,
    desc: 'Mil días seguidos. Casi tres años sin fallar.',
    progress: (s) => s.bestDailyStreak },
  { id: 'sin-red-100', name: 'Sin red, tres meses', icon: '🛡️', xp: 600, target: 100,
    desc: '100 días de racha sin gastar un solo escudo.',
    progress: (s) => s.noShieldStreak || 0 },
  { id: 'nunca-en-cero-100', name: 'Nunca en cero', icon: '🌗', xp: 600, target: 100,
    desc: '100 días seguidos sin una sola jornada vacía.',
    progress: (s) => s.sinFaltar || 0 },
  { id: 'perfectos-7', name: 'Semana impecable', icon: '⭐', xp: 300, target: 7,
    desc: 'Siete días perfectos seguidos.',
    progress: (s) => s.perfectStreak || 0 },
  { id: 'perfectos-30', name: 'Mes impecable', icon: '🌟', xp: 1200, target: 30,
    desc: 'Treinta días perfectos seguidos. Todo, todos los días, un mes entero.',
    progress: (s) => s.perfectStreak || 0 },
  { id: 'perfectos-100', name: 'Cien perfectos', icon: '💠', xp: 900, target: 100,
    desc: 'Cien días perfectos acumulados.',
    progress: (s) => s.perfectDays },
  { id: 'invicto', name: 'El invicto', icon: '🏆', xp: 800, target: 13,
    desc: 'Un trimestre cumpliendo a la vez las metas semanales de gimnasio, muay thai y escritura.',
    progress: (s) => s.trimestreInvicto || 0 },

  // =========================================================================
  // Volumen por disciplina
  // =========================================================================
  { id: 'mil-horas', name: 'Mil horas', icon: '⏳', xp: 900, target: 60000,
    desc: 'Mil horas sumando todo lo que medís en minutos.',
    progress: (s) => s.minutosTotales || 0 },
  { id: 'diez-mil-horas', name: 'Diez mil horas', icon: '🧙', xp: 3000, target: 600000,
    desc: 'Diez mil horas. La cifra de la que todos hablan y casi nadie alcanza.',
    progress: (s) => s.minutosTotales || 0 },
  { id: 'piano-500h', name: 'Virtuoso', icon: '🎹', xp: 1200, target: 30000,
    desc: '500 horas de piano.',
    progress: (s) => s.totals.piano || 0 },
  { id: 'data-500h', name: 'Quinientas de datos', icon: '🔬', xp: 1200, target: 30000,
    desc: '500 horas de análisis de datos.',
    progress: (s) => s.totals.datos || 0 },
  { id: 'mt-300', name: 'Trescientas clases', icon: '🥋', xp: 1200, target: 300,
    desc: '300 sesiones de Muay Thai.',
    progress: (s) => s.sessions.muaythai || 0 },
  { id: 'frances-365', name: 'Un año de francés', icon: '🇫🇷', xp: 700, target: 365,
    desc: '365 días con francés registrado.',
    progress: (s) => s.activeDays.frances || 0 },
  { id: 'frances-b2', name: 'B2 real', icon: '🗣️', xp: 800, target: 3,
    desc: 'Llegá al nivel B2 en francés.',
    progress: (s) => s.francesTier || 0 },
  { id: 'write-100', name: 'Cien posts', icon: '📖', xp: 1500, target: 100,
    desc: 'Cien textos publicados: dos años saliendo todas las semanas.',
    progress: (s) => s.totals.substack || 0 },
  { id: 'ruta-40', name: 'Ruta 40', icon: '🛣️', xp: 500, target: 6900000,
    desc: 'Los 5.200 km de la Ruta 40, en pasos.',
    progress: (s) => s.totals.pasos || 0 },
  { id: 'vuelta-al-mundo', name: 'La vuelta al mundo', icon: '🌎', xp: 3000, target: 53000000,
    desc: 'Los 40.075 km de la circunferencia de la Tierra, caminando.',
    progress: (s) => s.totals.pasos || 0 },
  { id: 'steps-30k', name: 'Treinta mil', icon: '🦿', xp: 200, target: 30000,
    desc: '30.000 pasos en un solo día.',
    progress: (s) => s.bests.pasos || 0 },
  { id: 'steps-50k', name: 'Cincuenta mil', icon: '🚀', xp: 600, target: 50000,
    desc: '50.000 pasos en un día: unos 35 km andando.',
    progress: (s) => s.bests.pasos || 0 },

  // =========================================================================
  // Cuerpo
  // =========================================================================
  { id: 'bodyfat-10', name: 'Un dígito', icon: '🔪', xp: 900, target: 1,
    desc: 'Bajar del 10% de grasa corporal.',
    progress: (s) => ((s.bodyFatMin != null && s.bodyFatMin < 10) ? 1 : 0) },
  { id: 'bodyfat-sostenido', name: 'Sostenerlo', icon: '🧊', xp: 700, target: 90,
    desc: 'Noventa días seguidos por debajo de tu meta de grasa corporal.',
    progress: (s) => s.diasBajoMeta || 0 },
  { id: 'recomposicion', name: 'Recomposición', icon: '📉', xp: 600, target: 1,
    desc: 'Bajar grasa y subir fuerza al mismo tiempo en una ventana de ocho semanas.',
    progress: (s) => s.recomposicion || 0 },
  { id: 'cuerpo-52', name: 'Un año medido', icon: '🗓️', xp: 500, target: 52,
    desc: 'Cincuenta y dos mediciones: una por semana durante un año.',
    progress: (s) => s.sessions.cuerpo || 0 },

  // =========================================================================
  // Rareza y momentos
  // =========================================================================
  { id: 'madrugador', name: 'Madrugador', icon: '🌅', xp: 200, target: 10,
    desc: 'Diez días con algo registrado antes de las siete de la mañana.',
    progress: (s) => s.madrugador || 0 },
  { id: 'nocturno', name: 'Nocturno', icon: '🦉', xp: 150, target: 1,
    desc: 'Registrar algo entre la medianoche y las cuatro de la mañana.',
    progress: (s) => s.nocturno || 0 },
  { id: 'navidad', name: 'Ni en Navidad', icon: '🎄', xp: 250, target: 1,
    desc: 'Sumar XP un 25 de diciembre.',
    progress: (s) => s.navidad || 0 },
  { id: 'ano-nuevo', name: 'Primero de enero', icon: '🎇', xp: 250, target: 1,
    desc: 'Entrenar un 1 de enero, cuando nadie entrena.',
    progress: (s) => s.anoNuevo || 0 },
  { id: 'doce-meses', name: 'Los doce meses', icon: '📅', xp: 800, target: 12,
    desc: 'Al menos un día perfecto en doce meses distintos.',
    progress: (s) => s.mesesConPerfecto || 0 },
  { id: 'en-vacaciones-no', name: 'En vacaciones no', icon: '🧗', xp: 400, target: 7,
    desc: 'Siete días perfectos dentro de una pausa declarada, cuando nada te obligaba.',
    progress: (s) => s.diasPerfectosEnPausa || 0 },

  // =========================================================================
  // Meta
  //
  // Los últimos dos cuentan logros, así que se evalúan en una segunda pasada
  // y quedan fuera del conteo: contarse a sí mismos los haría imposibles.
  // =========================================================================
  { id: 'player-30', name: 'Nivel treinta', icon: '🎯', xp: 600, target: 30,
    desc: 'Alcanzá el nivel 30 de jugador.',
    progress: (s) => s.playerLevel },
  { id: 'player-45', name: 'Nivel cuarenta y cinco', icon: '🎖️', xp: 1200, target: 45,
    desc: 'Alcanzá el nivel 45 de jugador.',
    progress: (s) => s.playerLevel },
  { id: 'player-60', name: 'Gengis Kan', icon: '⚔️', xp: 3000, target: 60,
    desc: 'Nivel 60: el final de la escalera de rangos.',
    progress: (s) => s.playerLevel },
  { id: 'coleccionista', name: 'Coleccionista', icon: '🗃️', xp: 500, target: 1, meta: true,
    desc: 'Desbloqueá la mitad de los logros.',
    progress: (s) => ((s.logrosDesbloqueados || 0) >= Math.ceil((s.logrosTotales || 0) / 2) ? 1 : 0) },
  { id: 'completista', name: 'Completista', icon: '💎', xp: 2500, target: 1, meta: true,
    desc: 'Desbloqueá todos los demás logros.',
    progress: (s) => ((s.logrosTotales || 0) > 0 && s.logrosDesbloqueados === s.logrosTotales ? 1 : 0) },
];
