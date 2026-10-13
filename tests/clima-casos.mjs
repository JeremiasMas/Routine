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
    widget: { titulo: '🧥 Campera liviana', detalle: 'Hoy: ida 9° · vuelta 15°', caminar: '🚶 Caminar hoy 19–22 h' },
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
    widget: { titulo: '🥵 Lo más liviano', detalle: 'Hoy: 23° · máx 31°', caminar: '🚶 Caminar hoy 19–22 h' },
  },
  {
    nombre: 'a la noche ya muestra mañana',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 21 * 60 },
    horas: [
      ...dia('2026-10-13', () => ({})),
      ...dia('2026-10-14', (h) => ({ temp: h < 12 ? 5 : 11, prob: h === 8 ? 30 : 0 })),
    ],
    widget: { titulo: '🧥 Campera · ☂️?', detalle: 'Mañana: ida 5° · vuelta 11°', caminar: '🚶 Caminar mañana 19–22 h' },
  },
  {
    nombre: 'después de la oficina el plan es para salir ahora',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 19 * 60 },
    horas: [...dia('2026-10-13', () => ({ temp: 14 })), ...dia('2026-10-14', () => ({}))],
    widget: { titulo: '👔 Manga larga', detalle: 'Hoy: 14° · máx 14°', caminar: '🚶 Caminar hoy 19–22 h' },
  },
  {
    nombre: 'sin pronóstico',
    horario: HORARIO,
    ahora: { fecha: '2026-10-13', minutos: 9 * 60 },
    horas: [],
    widget: { titulo: 'Sin pronóstico', detalle: 'Abrí la app con conexión', caminar: '' },
  },
];
