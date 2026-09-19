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
 * Rutina del gimnasio. Cargarla desde una plantilla evita tipear 14 ejercicios,
 * y las series planificadas son la meta de la sesión: completarlas = 100 XP.
 *  - day: día de la semana en que toca (0 = domingo)
 *  - bw: ejercicio de peso corporal (el peso es carga EXTRA, puede ir vacío)
 */
export const GYM_TEMPLATES = [
  {
    id: 'espalda-biceps',
    day: 1,
    name: 'Espalda / Bíceps + Abs',
    short: 'Espalda · Bíceps',
    exercises: [
      { name: 'Dominadas agarre ancho', bw: true },
      { name: 'Remo bajo cerrado' },
      { name: 'Remo con barra al pecho' },
      { name: 'Pullover' },
      { name: 'Bíceps en polea' },
      { name: 'Face pulls' },
      { name: 'Standing cable crunch' },
      { name: 'Elevaciones de piernas en paralelas', bw: true },
      { name: 'Weighted crunch' },
      { name: 'Russian twist' },
    ],
  },
  {
    id: 'hombros-triceps',
    day: 3,
    name: 'Hombros / Tríceps / Antebrazos',
    short: 'Hombros · Tríceps',
    exercises: [
      { name: 'Vuelo lateral con mancuerna vertical' },
      { name: 'Vuelo lateral con mancuerna horizontal' },
      { name: 'Vuelo posterior' },
      { name: 'Pullover en camilla inclinada' },
      { name: 'Encogimientos de trapecio' },
      { name: 'Press militar' },
      { name: 'Arnold con polea' },
      { name: 'Tríceps supino' },
      { name: 'Tríceps con soga' },
      { name: 'Tríceps trasnuca' },
      { name: 'French press' },
      { name: 'Dumbbell standing pronation wrist' },
      { name: 'Dumbbell over bench palms up curl' },
      { name: 'Dumbbell standing wrist curl' },
    ],
  },
  {
    id: 'pecho-piernas',
    day: 5,
    name: 'Pecho / Piernas',
    short: 'Pecho · Piernas',
    exercises: [
      { name: 'Pecho plano' },
      { name: 'Pecho inclinado' },
      { name: 'Aperturas inclinadas' },
      { name: 'Sentadilla con barra' },
      { name: 'Sillón de cuádriceps' },
      { name: 'Camilla de isquiotibiales' },
      { name: 'Peso muerto rumano' },
      { name: 'Sillón de abductores' },
      { name: 'Elevaciones de talón' },
    ],
  },
];

/** Series y repeticiones por defecto de cada ejercicio de la rutina. */
export const DEFAULT_SETS = 3;
export const DEFAULT_REP_RANGE = '10-15';

export function templateById(id) {
  return GYM_TEMPLATES.find((t) => t.id === id) || null;
}

/** Plantilla que toca en un día de la semana (0 = domingo). */
export function templateForDay(weekday) {
  return GYM_TEMPLATES.find((t) => t.day === weekday) || null;
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
export const PLAYER_TITLES = [
  { min: 1, name: 'Aspirante' },
  { min: 5, name: 'Iniciado' },
  { min: 10, name: 'Disciplinado' },
  { min: 18, name: 'Imparable' },
  { min: 28, name: 'Veterano' },
  { min: 40, name: 'Campeón' },
  { min: 55, name: 'Mito viviente' },
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
  { id: 'player-10', name: 'Doble dígito', icon: '🏆', xp: 200, target: 10,
    desc: 'Alcanzá el nivel 10 de jugador.',
    progress: (s) => s.playerLevel },
];
