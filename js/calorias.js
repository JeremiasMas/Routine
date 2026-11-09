/**
 * Cuánto gastás en el día, y cuánto te toca comer.
 *
 * Dos números distintos y los dos hacen falta: lo que llevás gastado hasta
 * ahora, y lo que vas a gastar si cumplís todo lo que falta. El segundo es el
 * que sirve a la mañana para decidir qué comprar; el primero es el que se
 * mueve cuando caminás de más.
 *
 * Nada de esto se inventa un dato: el metabolismo sale de tu masa magra, que
 * la app ya mide, y cada actividad se cobra por su MET conocido.
 */
import { massSplit } from './body.js';
import { metaDelDia } from './derive.js';

/**
 * Lo que gasta el cuerpo en reposo absoluto, por Katch-McArdle.
 *
 * Es la fórmula que usa la masa magra en vez de la edad y el sexo, que son
 * justo los dos datos que esta app no tiene. Y para alguien que se mide la
 * composición es además la más precisa: dos personas del mismo peso con
 * distinta grasa no gastan lo mismo.
 */
export function metabolismoBasal(masaMagraKg) {
  const magra = Number(masaMagraKg) || 0;
  if (magra <= 0) return 0;
  return Math.round(370 + 21.6 * magra);
}

/**
 * El gasto de existir sin entrenar: respirar, digerir, trabajar, moverse por
 * la casa. El 1,2 es el factor sedentario de siempre, y es sedentario a
 * propósito: lo que entrenás se suma aparte, medido, en vez de esconderse
 * dentro de un multiplicador.
 */
export const FACTOR_SEDENTARIO = 1.2;

/**
 * Los pasos que ese 1,2 ya incluye.
 *
 * Un día sedentario no son cero pasos: son los que das yendo al baño, a la
 * cocina y hasta el colectivo. Cobrar los diez mil enteros contaría dos veces
 * los primeros tres mil.
 */
export const PASOS_YA_CONTADOS = 3000;

/** Pasos por minuto al caminar, el mismo número que usa el resto de la app. */
export const PASOS_POR_MINUTO = 100;

/** Lo que dura una sesión de gimnasio, por serie anotada. */
export const MINUTOS_POR_SERIE = 1.9;

/**
 * El costo de cada cosa, en METs.
 *
 * Un MET es el gasto en reposo. Se cobra lo que está POR ENCIMA de eso
 * —`met - 1`— porque esa hora ibas a existir igual: la diferencia es lo único
 * que agregó el entrenamiento.
 *
 * Son referencias del compendio de actividad física, no mediciones tuyas.
 * Ubican; no deciden decimales.
 */
export const METS = {
  caminar: 3.3,      // ~5 km/h, que es la cadencia que asume la app
  gym: 5.0,          // pesas con descansos reales, no circuito
  muaythai: 8.0,     // una clase entera, con su calentamiento y sus pausas
};

/** Kilocalorías de una actividad, por encima de lo que gastabas en reposo. */
export function kcalDeActividad(met, minutos, pesoKg) {
  const m = Math.max(0, Number(minutos) || 0);
  const kg = Math.max(0, Number(pesoKg) || 0);
  const exceso = Math.max(0, (Number(met) || 0) - 1);
  // La fórmula de siempre: kcal/min = MET × 3,5 × kg / 200.
  return (exceso * 3.5 * kg * m) / 200;
}

/** Minutos de caminata que representan esos pasos, sin los ya contados. */
export function minutosDePasos(pasos) {
  const extra = Math.max(0, (Number(pasos) || 0) - PASOS_YA_CONTADOS);
  return extra / PASOS_POR_MINUTO;
}

/**
 * Cuánto cuesta una actividad, según lo que esa actividad sea.
 *
 * Piano, francés o análisis de datos no entran: se hacen sentado, y eso ya
 * está adentro del factor sedentario. Cobrarlos sería inventar gasto.
 */
export function kcalDeMision(activity, valor, pesoKg) {
  const v = Math.max(0, Number(valor) || 0);
  if (!activity || v <= 0) return 0;
  if (activity.unit === 'pasos') return kcalDeActividad(METS.caminar, minutosDePasos(v), pesoKg);
  if (activity.kind === 'gym') return kcalDeActividad(METS.gym, v * MINUTOS_POR_SERIE, pesoKg);
  if (activity.id === 'muaythai') return kcalDeActividad(METS.muaythai, v, pesoKg);
  return 0;
}

/** Las fases, y cuánto corren el objetivo respecto del gasto. */
/**
 * Las fases, cuánto corren el objetivo, y cuánta proteína piden.
 *
 * En déficit sube: cuando falta energía, la proteína es lo que decide si lo
 * que perdés es grasa o músculo. Los gramos son por kilo de peso.
 */
/**
 * Qué hacés con el gasto, de más comida a menos.
 *
 * "Recomponer" existe porque entre mantener y bajar había un pozo. Con 400
 * menos bajás grasa rápido y el músculo no se mueve: es un déficit del 17%
 * sobre un gasto como el tuyo, y a esa profundidad el cuerpo no construye.
 * Con 200 el proceso es la mitad de rápido del lado de la grasa y es el
 * único que deja las dos cosas pasando a la vez.
 */
export const FASES = {
  subir: { nombre: 'Ganar músculo', delta: 250, proteina: 1.8, nota: 'Unos 250 más. Algo de grasa viene con el músculo.' },
  mantener: { nombre: 'Mantener', delta: 0, proteina: 1.8, nota: 'Comés lo que gastás.' },
  recomponer: {
    nombre: 'Recomponer', delta: -200, proteina: 2.0,
    nota: 'Unos 200 menos: bajás grasa sin frenar el músculo. Es la mitad de rápido que bajar y la única que hace las dos cosas. La balanza casi no se mueve: lo que se mueve es la cintura.',
  },
  bajar: { nombre: 'Bajar grasa', delta: -400, proteina: 2.0, nota: 'Unos 400 menos: medio kilo de grasa por semana. Rápido para la grasa, caro para el músculo.' },
};
export const FASE_POR_DEFECTO = 'mantener';

export function faseDe(settings) {
  return FASES[settings?.fase] ? settings.fase : FASE_POR_DEFECTO;
}

/**
 * El día entero: lo gastado hasta ahora y lo proyectado si cumplís todo.
 *
 * La proyección toma, de cada misión, lo que ya hiciste o la meta, lo que sea
 * mayor. Por eso caminar de más mueve el número: a los once mil pasos la
 * proyección deja de ser la meta y pasa a ser lo que de verdad caminaste.
 *
 * @param {{masaMagra:number, peso:number, misiones:Array, fase:string}} dia
 */
export function gastoDelDia({ masaMagra = 0, peso = 0, misiones = [], fase = FASE_POR_DEFECTO } = {}) {
  const basal = metabolismoBasal(masaMagra);
  if (!basal || !peso) return null;

  const sedentario = Math.round(basal * FACTOR_SEDENTARIO);
  const partes = [];
  let hecho = 0;
  let proyectado = 0;

  for (const m of misiones) {
    const kHecho = kcalDeMision(m.activity, m.valor, peso);
    // La meta sólo cuenta si todavía no la pasaste. Una misión que hoy no
    // tocaba llega con meta 0: no se puede proyectar un muay thai que depende
    // de si tus compañeros se coparon, pero si lo hiciste, se cobra.
    const kProyectado = kcalDeMision(m.activity, Math.max(m.valor || 0, m.meta || 0), peso);
    hecho += kHecho;
    proyectado += kProyectado;
    if (kProyectado > 0) {
      partes.push({
        id: m.activity.id,
        icon: m.activity.icon,
        nombre: m.activity.name,
        hecho: Math.round(kHecho),
        proyectado: Math.round(kProyectado),
        // Superaste la meta, que no es lo mismo que haberlo hecho sin meta:
        // una misión fuera de agenda llega con meta 0 y cualquier valor la
        // "superaría". El dorado quiere decir "te pasaste", y sólo eso.
        pasada: (m.meta || 0) > 0 && (m.valor || 0) > m.meta,
        fueraDeAgenda: !(m.meta > 0) && (m.valor || 0) > 0,
      });
    }
  }

  const total = sedentario + Math.round(proyectado);
  const { delta } = FASES[fase] || FASES[FASE_POR_DEFECTO];
  return {
    basal,
    sedentario,
    fase,
    delta,
    gastado: sedentario + Math.round(hecho),
    proyectado: total,
    objetivo: Math.max(basal, total + delta),
    partes: partes.sort((a, b) => b.proyectado - a.proyectado),
  };
}

/**
 * Lo que te queda para comer, que es el único número sobre el que actuás.
 *
 * El gasto y el objetivo son el camino; esto es el destino. Si tenés
 * declaradas tus comidas fijas, lo que sale es el presupuesto de la comida
 * variable —el almuerzo—; si no, es el objetivo del día entero.
 */
export function presupuesto(gasto, { fijoKcal = 0, fijoProteina = 0, peso = 0, fase = FASE_POR_DEFECTO } = {}) {
  if (!gasto) return null;
  const porKg = (FASES[fase] || FASES[FASE_POR_DEFECTO]).proteina;
  const metaProteina = Math.round(porKg * (Number(peso) || 0));
  const fijo = Math.max(0, Number(fijoKcal) || 0);
  const fijoProt = Math.max(0, Number(fijoProteina) || 0);
  return {
    // Nunca negativo: un día flojo no puede pedirte que devuelvas comida.
    kcal: Math.max(0, gasto.objetivo - fijo),
    proteina: Math.max(0, metaProteina - fijoProt),
    metaProteina,
    fijoKcal: fijo,
    fijoProteina: fijoProt,
    // Con comidas fijas declaradas el número es el de la comida variable.
    soloVariable: fijo > 0,
  };
}

/** El paquete que la pantalla necesita, sacado del estado derivado. */
export function gastoDesdeElEstado(state, settings = {}, esDeHoy = () => true) {
  const peso = Number(state?.composicion?.weight) || Number(state?.bodyweight) || 0;
  const grasa = state?.composicion?.fatPct;
  const magra = massSplit(peso, grasa)?.lean || 0;
  // Lo que hoy no tocaba pero hiciste también se cobra: la energía que
  // quemaste la quemaste, estuviera o no en la agenda. Un muay thai de sábado
  // son 860 kcal que antes no se veían por ningún lado.
  const misiones = (state?.activities || [])
    .map((a) => {
      const dia = state.byActivity.get(a.id)?.byDate.get(state.today);
      const valor = dia?.value || 0;
      const agendada = esDeHoy(a);
      if (!agendada && valor <= 0) return null;
      return {
        activity: a,
        valor,
        // Sin agenda no hay nada que proyectar: cuenta sólo lo hecho.
        // Con agenda, la meta del día de verdad: la plantilla que toca y la
        // descarga si estás en una. Antes caía en a.goal —30 series genéricas—
        // hasta que registrabas algo, y eso proyectaba 124 kcal de más por día
        // en la semana en que entrenás la mitad.
        meta: agendada
          ? (dia?.goal || metaDelDia(a, state.today, { descargas: state.descargas, pesoCorporal: peso }))
          : 0,
      };
    })
    .filter(Boolean);
  return gastoDelDia({ masaMagra: magra, peso, misiones, fase: faseDe(settings) });
}

/** Lo que vale un kilo de grasa corporal. */
export const KCAL_POR_KG_GRASA = 7700;

/**
 * Mínimos para que la cuenta signifique algo, y un techo para que conteste
 * la pregunta correcta.
 *
 * `maxDias` es el que importa y no es un detalle: la pregunta es "¿lo que
 * estoy comiendo AHORA hace lo que la app promete?", no "¿qué pasó desde que
 * instalé esto?". Sin techo, una medición de hace dos meses —de antes de
 * cambiar de fase, de antes de cargar las comidas fijas— arrastra la
 * pendiente y la app dice que estás subiendo de peso cuando hace tres
 * semanas que bajás.
 */
export const CALIBRACION = { dias: 21, maxDias: 42, mediciones: 3, margen: 80 };

/**
 * Tu balanza contra el cálculo de la app.
 *
 * Todo lo que esta app dice que gastás sale de un modelo: un metabolismo
 * basal por fórmula, un factor sedentario de tabla y un MET por actividad.
 * Son referencias de población, no mediciones tuyas. El muay thai, que es la
 * actividad más grande del día, es también la más floja del cálculo.
 *
 * Pero hay un instrumento que sí te mide a vos, y la app ya lo tiene: el peso
 * en el tiempo. Si comiste lo que la app te pidió y el peso no se movió como
 * debía, el que está mal es el modelo, y esto dice en cuánto.
 *
 * No se compara la primera medición contra la última —dos puntos y cualquiera
 * de los dos puede ser un día de agua— sino la pendiente de todas por mínimos
 * cuadrados.
 *
 * Supone que comiste lo que la app te dijo. Si no, lo que mide es tu comida y
 * no el modelo, y por eso la vista lo aclara en vez de dar un veredicto.
 *
 * @param {Array<{date:string, weight:number}>} mediciones  en orden cronológico
 * @param {number} deltaAsumido  el delta de la fase: -200, -400, 0…
 * @param {(a:string,b:string)=>number} diasEntre
 */
export function calibracion(mediciones, deltaAsumido, diasEntre) {
  const todos = (mediciones || [])
    .filter((m) => Number(m?.weight) > 0 && m.date)
    .map((m) => ({ date: m.date, peso: Number(m.weight) }));
  if (todos.length < CALIBRACION.mediciones) return null;

  // Sólo la ventana reciente: lo de hace dos meses contesta otra pregunta.
  const ultima = todos[todos.length - 1].date;
  const puntos = todos.filter((p) => diasEntre(p.date, ultima) <= CALIBRACION.maxDias);
  if (puntos.length < CALIBRACION.mediciones) return null;

  const base = puntos[0].date;
  const xs = puntos.map((p) => diasEntre(base, p.date));
  const dias = xs[xs.length - 1];
  if (dias < CALIBRACION.dias) return null;

  // Pendiente por mínimos cuadrados: kg por día.
  const n = puntos.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = puntos.reduce((a, p) => a + p.peso, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (puntos[i].peso - my);
    den += (xs[i] - mx) ** 2;
  }
  if (!den) return null;
  const kgPorDia = num / den;

  // Un kilo perdido es un kilo de grasa: el balance diario que lo explica.
  const medido = Math.round(kgPorDia * KCAL_POR_KG_GRASA);
  const asumido = Math.round(Number(deltaAsumido) || 0);
  const diferencia = medido - asumido;
  return {
    dias,
    mediciones: n,
    kgPorSemana: Math.round(kgPorDia * 7 * 100) / 100,
    medido,
    asumido,
    diferencia,
    // Dentro del margen el modelo no se distingue de la realidad, y mover
    // números por 50 kcal es perseguir ruido de agua y de cinta.
    coincide: Math.abs(diferencia) <= CALIBRACION.margen,
    // Positivo: perdés menos de lo previsto, o sea gastás menos (o comés más).
    gastoReal: -diferencia,
  };
}
