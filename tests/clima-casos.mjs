// Casos del día a día con el widget que tienen que dar. Los usa el test de la
// web (clima.test.mjs) y sirven de referencia para el de Kotlin: si la lógica
// cambia, estos son los que hay que mirar.

/** Las 24 horas de una fecha; `f(hora)` pisa lo que haga falta. */
export function dia(fecha, f) {
  return Array.from({ length: 24 }, (_, hora) => ({
    t: `${fecha}T${String(hora).padStart(2, '0')}:00`,
    fecha,
    hora,
    temp: 16, hum: 60, aparente: 16, prob: 0, lluvia: 0, codigo: 1, viento: 10, rafagas: 20, uv: 3,
    ...f(hora),
  }));
}

const HORARIO = { dias: [1, 2, 3, 4, 5], entrada: '09:00', salida: '18:00', viaje: 45 };

export const CASOS = [
  {
    nombre: 'mañana fresca y ventosa de oficina: a un porteño lo abrigaría más',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 7 * 60 },
    horas: dia('2026-10-13', (h) => ({ temp: h < 12 ? 9 : 15, viento: 35, rafagas: 50 })),
    widget: { titulo: '🧥 Campera liviana', detalle: 'Hoy: ida 9° · vuelta 15°', caminar: '🚶 Hoy 19–20 h' },
  },
  {
    nombre: 'llueve a la vuelta',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 8 * 60 },
    horas: dia('2026-10-13', (h) => (h >= 17 ? { prob: 80, lluvia: 2 } : {})),
    widget: { titulo: '👔 Manga larga · ☂️', detalle: 'Hoy: ida 16° · vuelta 16°', caminar: '🚶 Hoy mejor no: lluvia' },
  },
  {
    nombre: 'sudestada: el paraguas no sirve',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 7 * 60 },
    horas: dia('2026-10-13', () => ({ temp: 12, prob: 90, lluvia: 4, viento: 45, rafagas: 75 })),
    widget: { titulo: '🧥 Campera liviana · capucha', detalle: 'Hoy: ida 12° · vuelta 12°', caminar: '🚶 Hoy mejor no: lluvia' },
  },
  {
    nombre: 'sábado de calor húmedo: caminar temprano o a la noche',
    horario: HORARIO,
    ahora: { fecha: '2026-10-17', minutos: 9 * 60 },
    horas: dia('2026-10-17', (h) => {
      const temp = h < 10 ? 23 : h < 19 ? 31 : 22;
      return { temp, hum: 75, aparente: temp + 4, uv: h >= 11 && h <= 16 ? 10 : 2 };
    }),
    widget: { titulo: '🥵 Lo más liviano', detalle: 'Hoy: 23° · máx 31°', caminar: '🚶 Hoy 19–20 h' },
  },
  {
    nombre: 'a la noche ya muestra mañana',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 21 * 60 },
    horas: [
      ...dia('2026-10-13', () => ({})),
      ...dia('2026-10-14', (h) => ({ temp: h < 12 ? 5 : 11, prob: h === 8 ? 30 : 0 })),
    ],
    widget: { titulo: '🧥 Campera · ☂️?', detalle: 'Mañana: ida 5° · vuelta 11°', caminar: '🚶 Mañana 19–20 h' },
  },
  {
    nombre: 'después de la oficina el plan es para salir ahora',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 19 * 60 },
    horas: [...dia('2026-10-13', () => ({ temp: 14 })), ...dia('2026-10-14', () => ({}))],
    widget: { titulo: '👔 Manga larga', detalle: 'Hoy: 14° · máx 14°', caminar: '🚶 Hoy 19–20 h' },
  },
  {
    nombre: 'llueve en tu caminata de las 19 y no queda otro rato',
    horario: { ...HORARIO, caminatas: ['07:00', '19:00'] },
    ahora: { fecha: '2026-10-13', minutos: 10 * 60 },
    pasos: 5500,
    horas: dia('2026-10-13', (h) => (h >= 18 ? { prob: 70, lluvia: 1 } : {})),
    widget: { titulo: '👔 Manga larga · ☂️', detalle: 'Hoy: ida 16° · vuelta 16°', caminar: '🚶 19 h: lluvia, no hay otro rato' },
  },
  {
    nombre: 'tu caminata de las 19 con lo que te falta',
    horario: { ...HORARIO, caminatas: ['19:00'] },
    ahora: { fecha: '2026-10-13', minutos: 12 * 60 },
    pasos: 6200,
    horas: dia('2026-10-13', () => ({})),
    widget: { titulo: '👔 Manga larga', detalle: 'Hoy: ida 16° · vuelta 16°', caminar: '🚶 19 h ✓ · faltan 38 min' },
  },
  {
    nombre: 'domingo: el horario óptimo para los pasos que faltan',
    horario: { ...HORARIO, caminatas: ['19:00'] },
    ahora: { fecha: '2026-10-18', minutos: 8 * 60 },
    pasos: 800,
    horas: dia('2026-10-18', (h) => ({ temp: 10 + h * 0.6, uv: h >= 12 && h <= 15 ? 9 : 2 })),
    widget: { titulo: '👔 Manga larga', detalle: 'Hoy: 15° · máx 24°', caminar: '🚶 Hoy 8–10 h · faltan 92 min' },
  },
  {
    nombre: 'a la noche, si faltan pasos, todavía es hoy',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 21 * 60 },
    pasos: 8000,
    horas: [...dia('2026-10-13', () => ({})), ...dia('2026-10-14', () => ({}))],
    widget: { titulo: '👔 Manga larga', detalle: 'Mañana: ida 16° · vuelta 16°', caminar: '🚶 Hoy 21–22 h · faltan 20 min' },
  },
  {
    nombre: 'meta cumplida',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 17 * 60 },
    pasos: 10450,
    horas: dia('2026-10-13', () => ({})),
    widget: { titulo: '👔 Manga larga', detalle: 'Hoy: ida 16° · vuelta 16°', caminar: '🚶 Meta de pasos cumplida ✓' },
  },
  {
    nombre: 'sin pronóstico',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 9 * 60 },
    horas: [],
    widget: { titulo: 'Sin pronóstico', detalle: 'Abrí la app con conexión', caminar: '' },
  },
];
