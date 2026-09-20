/**
 * Contador de pasos a partir del acelerómetro del teléfono.
 *
 * El navegador no expone el podómetro del sistema: lo único que da es la
 * aceleración cruda por `devicemotion`. Caminar deja una firma muy clara en
 * esa señal —un pico por cada pisada, entre 1,5 y 2,5 por segundo—, así que
 * los pasos se detectan buscando esos picos.
 *
 * El detector es una función pura sobre la serie de muestras: no toca el DOM
 * ni el reloj, y por eso se puede probar con señales sintéticas.
 */

/** Dos pisadas nunca están a menos de 250 ms (240 pasos por minuto). */
export const MIN_INTERVALO = 250;
/** Más de 2 s entre picos ya no es una caminata: es otra cosa. */
export const MAX_INTERVALO = 2000;
/**
 * Picos rítmicos seguidos antes de empezar a contar. Levantar el teléfono o
 * acomodarlo en el bolsillo produce uno o dos picos grandes; una caminata
 * produce muchos, parejos. Pedir cuatro descarta lo primero sin perder lo
 * segundo: cuando se llega al cuarto, los cuatro se cuentan juntos.
 */
export const PICOS_PARA_ARRANCAR = 4;
/** Piso del umbral, en m/s². Debajo de esto es ruido del sensor. */
export const UMBRAL_MINIMO = 0.55;

/**
 * Antes de contar nada hay que saber cuánto mide la gravedad en este teléfono.
 * Se promedian las primeras muestras: medio segundo alcanza para más de una
 * zancada, así que el promedio da el valor en reposo aunque ya estés caminando.
 * Las muestras de la calibración no se tiran: se vuelven a procesar con la
 * gravedad ya conocida, para no perder los primeros pasos de la caminata.
 */
export const CALIBRACION_MS = 600;
/**
 * Tope de muestras de calibración. Hay teléfonos que repiten la marca de
 * tiempo del evento; sin este tope la calibración no terminaría nunca y el
 * buffer crecería sin freno.
 */
export const MAX_CALIBRACION = 500;

const TAU_GRAVEDAD = 1.0;    // s — lo que tarda en seguir a la gravedad
const TAU_SUAVE = 0.06;      // s — lo que tarda en seguir al movimiento
const TAU_AMPLITUD = 1.5;    // s — memoria de la amplitud reciente

/**
 * Detector incremental. Se le pasan muestras en orden y va devolviendo
 * cuántos pasos nuevos vio en cada una.
 */
export class Pedometro {
  constructor() {
    this.pasos = 0;
    this.gravedad = null;    // magnitud "en reposo", que incluye los 9,8
    this.buffer = [];        // muestras de la calibración, a la espera
    this.sumaCalibracion = 0;
    this.inicio = null;
    this.suave = 0;          // aceleración dinámica filtrada
    this.arriba = false;     // histéresis: ¿venimos de cruzar el umbral?
    this.picoMax = 0;
    this.picoMin = 0;
    this.ultimoPico = null;
    this.ultimaMuestra = null;
    this.racha = 0;          // picos rítmicos seguidos
    this.pendientes = 0;     // picos vistos pero todavía no contados
  }

  /**
   * Procesa una muestra.
   * @param {number} x @param {number} y @param {number} z aceleración CON gravedad, en m/s².
   * @param {number} t marca de tiempo en ms.
   * @returns {number} pasos nuevos detectados por esta muestra (0, 1 o el arranque).
   */
  push(x, y, z, t) {
    const mag = Math.hypot(x, y, z);
    if (this.gravedad === null) {
      if (this.inicio === null) this.inicio = t;
      this.buffer.push({ mag, t });
      this.sumaCalibracion += mag;
      if (t - this.inicio < CALIBRACION_MS && this.buffer.length < MAX_CALIBRACION) return 0;
      // Ya sabemos cuánto pesa la gravedad: se reproduce lo que pasó mientras
      // tanto, que puede incluir los primeros pasos.
      this.gravedad = this.sumaCalibracion / this.buffer.length;
      const guardadas = this.buffer;
      this.buffer = [];
      let nuevos = 0;
      for (const m of guardadas) nuevos += this._procesar(m.mag, m.t);
      return nuevos;
    }
    return this._procesar(mag, t);
  }

  /** El detector propiamente dicho, con la gravedad ya calibrada. */
  _procesar(mag, t) {
    if (this.ultimaMuestra === null) {
      this.ultimaMuestra = t;
      return 0;
    }
    // El intervalo real entre muestras varía según el teléfono (de 16 a 60 ms),
    // así que los filtros se calculan sobre el tiempo y no sobre el número de
    // muestras: el mismo movimiento se detecta igual a cualquier frecuencia.
    const dt = Math.min(0.25, Math.max(0.001, (t - this.ultimaMuestra) / 1000));
    this.ultimaMuestra = t;

    this.gravedad += (1 - Math.exp(-dt / TAU_GRAVEDAD)) * (mag - this.gravedad);
    const dinamica = mag - this.gravedad;
    this.suave += (1 - Math.exp(-dt / TAU_SUAVE)) * (dinamica - this.suave);

    // Umbral adaptativo: el teléfono en el bolsillo sacude mucho más que en la
    // mano, y un umbral fijo o pierde una cosa o cuenta de más en la otra.
    const decaimiento = Math.exp(-dt / TAU_AMPLITUD);
    this.picoMax = Math.max(this.suave, this.picoMax * decaimiento);
    this.picoMin = Math.min(this.suave, this.picoMin * decaimiento);
    const amplitud = this.picoMax - this.picoMin;
    const umbralAlto = Math.max(UMBRAL_MINIMO, amplitud * 0.30);
    const umbralBajo = umbralAlto * 0.35;

    if (this.arriba) {
      if (this.suave < umbralBajo) this.arriba = false;
      return 0;
    }
    if (this.suave < umbralAlto) return 0;

    // Cruce de subida: un pico.
    this.arriba = true;
    const hueco = this.ultimoPico === null ? Infinity : t - this.ultimoPico;
    if (hueco < MIN_INTERVALO) return 0;   // rebote del mismo pico
    this.ultimoPico = t;

    if (hueco > MAX_INTERVALO) {
      // Se cortó el ritmo: lo que veníamos juntando no era una caminata.
      this.racha = 1;
      this.pendientes = 1;
      return 0;
    }

    this.racha += 1;
    if (this.racha < PICOS_PARA_ARRANCAR) {
      this.pendientes += 1;
      return 0;
    }
    // Al cuarto pico rítmico se cobran los que venían esperando.
    const nuevos = this.pendientes + 1;
    this.pendientes = 0;
    this.pasos += nuevos;
    return nuevos;
  }
}

/** Corre el detector sobre una serie entera. Útil para probarlo. */
export function contarPasos(muestras) {
  const p = new Pedometro();
  for (const m of muestras) p.push(m.x, m.y, m.z, m.t);
  return p.pasos;
}

/** ¿Este navegador puede leer el acelerómetro? */
export function hayAcelerometro() {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

/**
 * iOS exige un permiso pedido desde un gesto del usuario; Android lo da
 * directamente si la página es HTTPS.
 */
export async function pedirPermiso() {
  const DME = typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : null;
  if (DME && typeof DME.requestPermission === 'function') {
    try {
      return (await DME.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}
