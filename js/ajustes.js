/**
 * El índice de Ajustes.
 *
 * La pantalla eran nueve secciones abiertas una debajo de la otra: casi
 * cuatro mil píxeles, con cada explicación a la vista todo el tiempo. Para
 * cambiar el tema había que pasar por delante de cómo se exportan los pasos
 * de Samsung Health.
 *
 * Ahora es un índice: una fila por sección, que se abre al tocarla. Y cada
 * fila dice en qué está esa sección sin abrirla, que es la mitad de las
 * veces lo único que uno venía a mirar: en qué fase estoy, cuándo fue la
 * última copia, cuántas barras marqué.
 *
 * Esto es la parte que se puede probar sin pantalla: qué secciones hay, en
 * qué orden, y qué dice cada una.
 */

import { bodySummary } from './body.js';
import { FASES, faseDe } from './calorias.js';
import { candidatosDeBarra } from './barra.js';
import { tramos, esLibre } from './pausas.js';
import { TEMAS, TEMA_POR_DEFECTO } from './theme.js';
import { formatNumber, plural } from './utils.js';

/**
 * Las secciones, agrupadas por de qué hablan. `soloSi` nombra una condición
 * del dispositivo: el aviso sólo existe adentro de la app de Android.
 */
export const GRUPOS = [
  {
    titulo: 'Tu rutina',
    secciones: [
      { id: 'metas', icono: '🎯', titulo: 'Metas' },
      { id: 'gimnasio', icono: '🏋️', titulo: 'Barras del gimnasio' },
      { id: 'libres', icono: '🌴', titulo: 'Días libres' },
    ],
  },
  {
    titulo: 'Tu cuerpo',
    secciones: [
      { id: 'cuerpo', icono: '📏', titulo: 'Medidas' },
      { id: 'calorias', icono: '🍽️', titulo: 'Calorías' },
      { id: 'pasos', icono: '👟', titulo: 'Pasos' },
    ],
  },
  {
    titulo: 'La app',
    secciones: [
      { id: 'aviso', icono: '🔔', titulo: 'Aviso', soloSi: 'puedeAvisar' },
      { id: 'aspecto', icono: '🎨', titulo: 'Aspecto' },
      { id: 'preferencias', icono: '🔊', titulo: 'Sonidos y festejos' },
      { id: 'datos', icono: '💾', titulo: 'Tus datos' },
    ],
  },
];

/** Todos los ids, en el orden en que se ven. */
export const IDS = GRUPOS.flatMap((g) => g.secciones.map((s) => s.id));

const siNo = (v) => (v ? 'sí' : 'no');

/**
 * Qué dice cada fila cerrada.
 *
 * @param {object} data
 * @param {{hoy:string, diasSinCopia:number|null, copiaVencida:boolean,
 *   enApp:boolean, origenDePasos:string, aviso:object|null}} dispositivo
 *   lo que no sale de los datos sino de dónde corre la app
 * @returns {Record<string, {estado:string, alerta:boolean}>}
 */
export function estadoDeSecciones(data, dispositivo = {}) {
  const s = data?.settings || {};
  const { hoy, diasSinCopia = null, copiaVencida = false, enApp = false, origenDePasos = 'Health Connect', aviso = null } = dispositivo;
  const decir = (estado, alerta = false) => ({ estado, alerta });

  const actividades = (data?.activities || []).length;

  const cuerpo = bodySummary({ weight: s.weight, waist: s.waist, neck: s.neck, hip: s.hip }, s);
  const medidas = [
    cuerpo.height > 0 ? `${formatNumber(cuerpo.height)} cm` : null,
    cuerpo.weight > 0 ? `${formatNumber(cuerpo.weight)} kg` : null,
    cuerpo.fatPct != null ? `${formatNumber(cuerpo.fatPct)}% de grasa` : null,
  ].filter(Boolean);

  const fijas = Number(s.fijoKcal) || 0;

  const barras = candidatosDeBarra(data);
  const deBarra = barras.filter((c) => c.deBarra || c.barra !== null);
  const marcadas = deBarra.filter((c) => c.barra !== null).length;

  // Los días libres que importan son los de hoy en adelante: los que ya
  // pasaron están en la lista de adentro, no en el titular.
  const libres = tramos(data?.pausas);
  const porVenir = hoy ? libres.filter((t) => t.hasta >= hoy).length : libres.length;

  const tema = TEMAS.find((t) => t.id === (s.tema || TEMA_POR_DEFECTO)) || TEMAS[0];

  const hora = aviso?.activo
    ? `${String(aviso.hora ?? 19).padStart(2, '0')}:${String(aviso.minuto ?? 0).padStart(2, '0')}`
    : null;

  return {
    metas: decir(plural(actividades, 'actividad', 'actividades')),
    gimnasio: decir(!deBarra.length ? 'Sin ejercicios con barra'
      : marcadas === 0 ? 'Se anota el total: ninguna marcada'
        : marcadas === deBarra.length ? `Peso por lado en ${marcadas === 1 ? 'el único' : `los ${marcadas}`}`
          : `Peso por lado en ${marcadas} de ${deBarra.length}`),
    libres: decir(hoy && esLibre(data?.pausas, hoy) ? 'Hoy es día libre'
      : porVenir ? plural(porVenir, 'tramo por venir', 'tramos por venir')
        : 'Ninguno por venir'),
    cuerpo: decir(medidas.length ? medidas.join(' · ') : 'Sin medidas todavía'),
    calorias: decir(`${FASES[faseDe(s)].nombre} · ${fijas > 0 ? `${formatNumber(fijas)} kcal fijas` : 'sin comidas fijas'}`),
    pasos: decir(enApp ? `Llegan solos · ${origenDePasos}` : 'Se importan de Samsung Health'),
    aviso: decir(hora ? `Todos los días a las ${hora}` : 'Apagado'),
    aspecto: decir(tema.nombre),
    preferencias: decir(`Sonidos ${siNo(s.sound)} · festejos ${siNo(s.celebrate !== false)}`),
    // La única fila que puede venir en rojo: una copia vencida no puede
    // quedar escondida detrás de un toque.
    datos: copiaVencida
      ? decir(diasSinCopia === Infinity || diasSinCopia === null
        ? 'Nunca exportaste tu progreso'
        : `Hace ${plural(diasSinCopia, 'día', 'días')} que no exportás`, true)
      : decir(diasSinCopia === null || diasSinCopia === Infinity ? 'Sólo en este dispositivo'
        : diasSinCopia === 0 ? 'Copia hecha hoy'
          : `Última copia hace ${plural(diasSinCopia, 'día', 'días')}`),
  };
}
