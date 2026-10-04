/**
 * Mini rutina de postura: seis minutos, de pie o sentada, sin elementos.
 *
 * Apunta a lo que deja el día frente a una pantalla o un teléfono: la cabeza
 * adelantada, los hombros cerrados y la espalda alta encorvada. Cada ejercicio
 * trabaja una de esas tres cosas. Ninguno debería doler: si algo duele, se
 * saltea.
 */
export const RUTINA_POSTURA = [
  {
    id: 'menton',
    nombre: 'Retracción de mentón',
    icono: '🙂',
    segundos: 45,
    como: 'Mirando al frente, llevá el mentón hacia atrás como haciendo papada, sin bajar la cabeza. Sostené 3 segundos y soltá. 10 veces.',
    para: 'La cabeza adelantada',
  },
  {
    id: 'hombros',
    nombre: 'Círculos de hombros',
    icono: '🔄',
    segundos: 30,
    como: 'Subí los hombros a las orejas, llevalos hacia atrás y bajalos despacio. Círculos lentos, siempre hacia atrás.',
    para: 'Los hombros cerrados',
  },
  {
    id: 'angeles',
    nombre: 'Ángeles en la pared',
    icono: '👼',
    segundos: 60,
    como: 'Espalda, cabeza y glúteos contra la pared. Brazos en "W" apoyados, deslizalos hacia arriba hasta la "Y" y volvé. Lento, 10 veces.',
    para: 'La espalda alta',
  },
  {
    id: 'puerta',
    nombre: 'Pecho en el marco de la puerta',
    icono: '🚪',
    segundos: 60,
    como: 'Antebrazo apoyado en el marco, codo a la altura del hombro. Girá el cuerpo hacia el otro lado hasta sentir estirar el pecho. 30 segundos por lado.',
    para: 'Los hombros cerrados',
  },
  {
    id: 'gato',
    nombre: 'Gato y vaca',
    icono: '🐈',
    segundos: 60,
    como: 'En cuatro apoyos: al exhalar redondeá la espalda mirando el ombligo; al inhalar hundila y mirá adelante. Con la respiración, sin apurar.',
    para: 'La espalda alta',
  },
  {
    id: 'escapulas',
    nombre: 'Juntar escápulas',
    icono: '🪽',
    segundos: 45,
    como: 'Sentada derecha, juntá las escápulas como apretando un lápiz entre ellas, sin subir los hombros. 5 segundos y soltá. 8 veces.',
    para: 'Los hombros cerrados',
  },
];

/** Duración total de la rutina, en segundos. */
export function duracionRutina(rutina = RUTINA_POSTURA) {
  return rutina.reduce((s, e) => s + e.segundos, 0);
}
