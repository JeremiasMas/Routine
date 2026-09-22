// Los juicios que acompañan a la constancia de cada disciplina.
//
// Vive aparte de la vista porque es texto, no interfaz: así se puede revisar
// sin un navegador, y un test puede exigir que ninguna frase se repita.

/**
 * Qué decirle a cada disciplina sobre su constancia.
 *
 * Una sola frase para todas terminaba diciéndole al francés que no "entrene
 * más fuerte", y repitiendo "eso es constancia de verdad" en cada tarjeta que
 * iba bien. Cada oficio falla distinto y se arregla distinto: el piano sufre
 * los huecos, el gimnasio la semana salteada, un idioma el enfriamiento, y
 * medirse poco no frena el progreso, sólo te deja sin saber si lo hay.
 *
 * Cada entrada tiene cuatro registros: sin fallas, casi sin fallas, con
 * margen y floja.
 */
export const VOZ_CONSTANCIA = {
  datos: {
    todo: 'No fallaste ninguno. Los datos dejaron de ser una tarea y pasaron a ser una rutina.',
    alta: 'Casi no fallás, y acá la continuidad rinde más que la sesión larga: no perdés el hilo del problema.',
    media: 'Los días que se pierden rara vez son por falta de tiempo: es el costo de volver a entrar al problema. Dejá el archivo abierto de un día para el otro.',
    baja: 'Media hora cinco días rinde más que cinco horas un domingo. Cada semana cortada arranca releyendo el problema que ya habías entendido.',
  },
  piano: {
    todo: 'Ni un día sin tocar. Eso es exactamente lo que fija la técnica.',
    alta: 'Tocás casi todos los días que tocaba, que es la única forma de que la mano recuerde sin que la cabeza tenga que pensarlo.',
    media: 'Al piano le duelen los huecos: dos o tres días sin tocar y el pasaje que ya salía vuelve a costar.',
    baja: 'Quince minutos al piano todos los días te dan más que una hora el sábado: el movimiento se consolida entre sesión y sesión, no dentro de una.',
  },
  gym: {
    todo: 'Fuiste todas las veces que tocaba. Con esa frecuencia el estímulo se acumula en vez de reiniciarse.',
    alta: 'Vas casi siempre. La fuerza responde a eso más que a cualquier cambio de rutina.',
    media: 'Te faltan sesiones, y en fuerza la semana salteada no se compensa con más series la siguiente.',
    baja: 'Lo que más te va a mover no es entrenar más pesado, es no saltear la sesión.',
  },
  muaythai: {
    todo: 'No faltaste a ninguna clase. Toda la técnica que se enseñó, la viste.',
    alta: 'Vas a casi todas las clases: así se corrige la técnica, con alguien mirándote.',
    media: 'Faltar a una clase cuesta doble: lo que se enseñó ese día no se repite.',
    baja: 'El muay thai se aprende en el gimnasio, no repasando solo. Cada clase salteada es técnica que nadie te corrigió.',
  },
  pasos: {
    todo: 'Llegaste a la meta todos los días. Caminar ya no es algo que tengas que agendar.',
    alta: 'Casi todos los días llegás, y sin proponértelo demasiado: el movimiento ya está metido en el día.',
    media: 'Los días flojos suelen ser los de escritorio. Una vuelta a media tarde alcanza para darlos vuelta.',
    baja: 'No hace falta salir a caminar una hora: bajarte una parada antes, la escalera y moverte cada par de horas ya te dejan cerca.',
  },
  frances: {
    todo: 'Todos los días tocaste francés. Esa exposición diaria es justo lo que hace que el idioma deje de traducirse en la cabeza.',
    alta: 'Casi todos los días tenés contacto con el idioma, que es lo que lo mantiene vivo de una semana a la otra.',
    media: 'Un idioma se enfría entre sesión y sesión: diez minutos todos los días rinden más que una hora el domingo.',
    baja: 'Lo que más te va a mover no es estudiar más horas seguidas, es tocar el francés todos los días aunque sean cinco minutos.',
  },
  cuerpo: {
    todo: 'Te mediste todas las semanas. Por eso la tendencia que ves es real y no el ruido de un día.',
    alta: 'Te medís casi siempre, y con esa frecuencia la curva ya dice algo.',
    media: 'Con mediciones salteadas cuesta separar un cambio real de la variación normal entre un día y otro.',
    baja: 'Medirte poco no frena el progreso, pero te deja sin saber si lo hay. Una vez por semana, mismo día y misma hora.',
  },
  substack: {
    todo: 'Publicaste todas las semanas. Eso es lo que construye lectores.',
    alta: 'Publicás casi siempre. Al lector la regularidad le importa más que la extensión.',
    media: 'Las semanas en blanco rompen más el hábito del lector que un texto flojo.',
    baja: 'Publicar algo imperfecto a tiempo enseña más que un borrador perfecto que no sale nunca.',
  },
};

export const VOZ_GENERICA = {
  todo: 'No fallaste ninguna. Eso es constancia de verdad.',
  alta: 'Aparecés casi siempre, que es lo que hace la diferencia a la larga.',
  media: 'Hay margen: la mitad de lo que falta se gana apareciendo.',
  baja: 'Lo que más te va a mover no es hacer más por vez, es faltar menos.',
};

/**
 * El comentario que le corresponde a una constancia dada.
 *
 * Cuatro registros: sin fallas, casi sin fallas, con margen y floja. Una
 * disciplina sin voz propia cae en la genérica, que dice lo mismo pero sin
 * nombrar el oficio.
 */
export function juicioDeConstancia(idActividad, cumplidos, total) {
  const voz = VOZ_CONSTANCIA[idActividad] || VOZ_GENERICA;
  const pct = total > 0 ? cumplidos / total : 0;
  const registro = total > 0 && cumplidos === total ? 'todo'
    : pct >= 0.85 ? 'alta'
      : pct >= 0.6 ? 'media'
        : 'baja';
  return voz[registro] || VOZ_GENERICA[registro];
}
