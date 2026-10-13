package com.jeremiasmas.rutina

import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * Las tres líneas del widget del clima.
 *
 * Es la misma lógica que clima/js/logica.js, escrita de nuevo porque el widget
 * corre sin WebView: con la app cerrada no hay JavaScript que la calcule. Sólo
 * está lo que el widget muestra; los textos largos quedan en la web.
 *
 * Un test compara las constantes de los dos archivos. Si tocás un número acá,
 * tocalo allá.
 *
 * No usa nada de Android a propósito: así se puede compilar y probar en la
 * JVM contra los mismos casos que la web.
 */
object ClimaLogica {

  const val VIENTO_DE_CASA = 20.0
  const val FACTOR_VIENTO = 0.1
  const val HUMEDAD_FRIO = 85.0
  const val CASTIGO_HUMEDAD = 1.0
  const val TEMP_FRIO_HUMEDO = 15.0
  const val TEMP_CALOR = 22.0

  const val PROB_LLUEVE = 50.0
  const val PROB_QUIZAS = 25.0
  const val MM_LLUEVE = 0.3
  const val RAFAGAS_PARAGUAS = 55.0

  const val CAMINATA_MIN = -3.0
  const val CAMINATA_MAX = 27.0
  const val CAMINATA_RAFAGAS = 60.0
  const val CAMINATA_UV = 8.0
  const val CAMINATA_DESDE = 7
  const val CAMINATA_HASTA = 22
  const val HORA_DE_MANANA = 20

  const val META_PASOS = 10000
  const val PASOS_POR_MINUTO = 100
  const val CAMINATA_IDEAL = 15.0
  const val MEJORA = 4.0
  const val DURACION_SIN_PASOS = 60
  const val DURACION_MIN = 20
  const val DURACION_MAX = 120

  private val TORMENTA = setOf(95, 96, 99)

  /** Los mismos niveles que ROPA en la web: cada uno vale hasta `hasta`, sin incluir. */
  data class Ropa(val hasta: Double, val icono: String, val corto: String)

  val ROPA = listOf(
    Ropa(3.0, "🧣", "Abrigo completo"),
    Ropa(7.0, "🧥", "Campera"),
    Ropa(13.0, "🧥", "Campera liviana"),
    Ropa(19.0, "👔", "Manga larga"),
    Ropa(25.0, "👕", "Remera"),
    Ropa(Double.POSITIVE_INFINITY, "🥵", "Lo más liviano"),
  )

  data class Hora(
    val fecha: String,
    val hora: Int,
    val temp: Double,
    val hum: Double,
    val aparente: Double,
    val prob: Double,
    val lluvia: Double,
    val codigo: Int,
    val viento: Double,
    val rafagas: Double,
    val uv: Double,
  )

  /**
   * `dias` como en JavaScript: 0 = domingo. Horas en minutos desde la
   * medianoche; `caminatas` son tus horarios de lunes a viernes, ordenados.
   */
  data class Horario(
    val dias: Set<Int>,
    val entrada: Int,
    val salida: Int,
    val viaje: Int,
    val caminatas: List<Int> = emptyList(),
    val meta: Int = META_PASOS,
    /** El almuerzo libre de los días de oficina, [desde, hasta) en minutos, o null. */
    val almuerzo: Pair<Int, Int>? = null,
  ) {
    companion object {
      /**
       * Tu semana, igual que HORARIO_DEFAULT en la web: oficina martes a
       * jueves de 9 a 18, una hora de colectivo, almuerzo de 13 a 14:30.
       */
      val DEFAULT = Horario(setOf(2, 3, 4), 9 * 60, 18 * 60, 60, almuerzo = 13 * 60 to 14 * 60 + 30)
    }
  }

  data class Lineas(val titulo: String, val detalle: String, val caminar: String)

  private fun redondear(n: Double): Double = Math.round(n * 10) / 10.0

  fun sensacion(h: Hora): Double {
    if (h.temp >= TEMP_CALOR) return redondear(max(h.temp, h.aparente))
    var s = h.temp - max(0.0, h.viento - VIENTO_DE_CASA) * FACTOR_VIENTO
    if (h.hum >= HUMEDAD_FRIO && h.temp < TEMP_FRIO_HUMEDO) s -= CASTIGO_HUMEDAD
    return redondear(s)
  }

  fun ropaPara(s: Double): Ropa = ROPA.firstOrNull { s < it.hasta } ?: ROPA.last()

  /** "tormenta", "lluvia", "quizas" o null. */
  fun lluviaEn(h: Hora): String? = when {
    h.codigo in TORMENTA -> "tormenta"
    h.prob >= PROB_LLUEVE || h.lluvia >= MM_LLUEVE -> "lluvia"
    h.prob >= PROB_QUIZAS -> "quizas"
    else -> null
  }

  /** "no", "quizas", "si" o "capucha". */
  fun paraguas(horas: List<Hora>): String {
    val estados = horas.map { lluviaEn(it) }
    if (estados.any { it == "lluvia" || it == "tormenta" }) {
      val rafagas = horas.maxOfOrNull { it.rafagas } ?: 0.0
      return if (rafagas >= RAFAGAS_PARAGUAS) "capucha" else "si"
    }
    return if ("quizas" in estados) "quizas" else "no"
  }

  fun tramo(horas: List<Hora>, fecha: String, desde: Int, hasta: Int): List<Hora> =
    horas.filter { it.fecha == fecha && it.hora * 60 < hasta && it.hora * 60 + 60 > desde }

  private fun apta(h: Hora): Boolean {
    val s = sensacion(h)
    return lluviaEn(h) == null && s >= CAMINATA_MIN && s <= CAMINATA_MAX &&
      h.rafagas < CAMINATA_RAFAGAS && h.uv < CAMINATA_UV
  }

  private fun motivoDe(h: Hora): String {
    val ll = lluviaEn(h)
    return when {
      ll == "tormenta" -> "tormenta"
      ll != null -> "lluvia"
      sensacion(h) > CAMINATA_MAX -> "calor"
      h.rafagas >= CAMINATA_RAFAGAS -> "viento"
      h.uv >= CAMINATA_UV -> "sol fuerte"
      else -> "frío"
    }
  }

  fun penalidad(h: Hora): Double =
    abs(sensacion(h) - CAMINATA_IDEAL) + h.prob / 10 + h.uv / 2 + max(0.0, h.rafagas - 40) / 5

  private fun libres(horas: List<Hora>, fecha: String, h: Horario, desdeMin: Int, oficina: Boolean): List<Hora> {
    val ocupadoDesde = h.entrada - h.viaje
    val ocupadoHasta = h.salida + h.viaje
    val almD = h.almuerzo?.first ?: -1
    val almH = h.almuerzo?.second ?: -1
    return horas.filter {
      it.fecha == fecha && it.hora >= CAMINATA_DESDE && it.hora < CAMINATA_HASTA &&
        it.hora * 60 >= desdeMin - 59 &&
        !(oficina && it.hora * 60 < ocupadoHasta && it.hora * 60 + 60 > ocupadoDesde &&
          !(it.hora * 60 >= almD && it.hora * 60 < almH))
    }
  }

  /** Un tramo de horas enteras, en minutos y recortado al almuerzo si cae en él. */
  private fun recortar(v: Ventana, h: Horario, oficina: Boolean): Ventana {
    val desde = v.desde * 60
    val hasta = v.hasta * 60
    val alm = h.almuerzo
    if (!oficina || alm == null) return Ventana(desde, hasta, v.penal)
    val ocupadoDesde = h.entrada - h.viaje
    val ocupadoHasta = h.salida + h.viaje
    if (!(desde < ocupadoHasta && hasta > ocupadoDesde)) return Ventana(desde, hasta, v.penal)
    return Ventana(max(desde, alm.first), min(hasta, alm.second), v.penal)
  }

  /**
   * Un tramo [desde, hasta) y su penalidad promedio: en horas al salir de
   * ventanaOptima, en minutos una vez recortado.
   */
  data class Ventana(val desde: Int, val hasta: Int, val penal: Double)

  fun ventanaOptima(candidatas: List<Hora>, n: Int): Ventana? {
    for (k in n downTo 1) {
      var mejor: Ventana? = null
      var mejorSuma = 0.0
      for (i in 0..candidatas.size - k) {
        var suma = 0.0
        var sirve = true
        for (j in 0 until k) {
          val x = candidatas[i + j]
          if (x.hora != candidatas[i].hora + j || !apta(x)) { sirve = false; break }
          suma += penalidad(x)
        }
        if (sirve && (mejor == null || suma < mejorSuma)) {
          mejor = Ventana(candidatas[i].hora, candidatas[i].hora + k, 0.0)
          mejorSuma = suma
        }
      }
      if (mejor != null) return mejor.copy(penal = mejorSuma / k)
    }
    return null
  }

  private fun motivoComun(candidatas: List<Hora>): String? {
    val cuenta = LinkedHashMap<String, Int>()
    for (x in candidatas) {
      val m = motivoDe(x)
      cuenta[m] = (cuenta[m] ?: 0) + 1
    }
    var motivo: String? = null
    for ((m, n) in cuenta) if (motivo == null || n > (cuenta[motivo] ?: 0)) motivo = m
    return motivo
  }

  /**
   * La caminata de una fecha, como planCaminata en la web. `tipo` es
   * "cumplida", "habitual", "optimo" o "nada" (no hay rato: ver `motivo`).
   */
  data class Caminata(
    val tipo: String,
    val inicio: Int = 0,
    val almuerzo: Boolean = false,
    val ok: Boolean = false,
    val motivo: String? = null,
    val otra: Ventana? = null,
    val minutos: Int? = null,
  )

  private fun entre(n: Int, minimo: Int, maximo: Int) = min(maximo, max(minimo, n))

  fun planCaminata(horas: List<Hora>, h: Horario, fecha: String, desdeMin: Int, pasos: Long?): Caminata? {
    val dia = diaDeSemana(fecha)
    val faltan = if (pasos == null) null else max(0L, h.meta - pasos)
    if (faltan == 0L) return Caminata("cumplida")
    val faltanMin = faltan?.let { ceil(it.toDouble() / PASOS_POR_MINUTO).toInt() }
    val oficina = dia in h.dias
    val candidatas = libres(horas, fecha, h, desdeMin, oficina)
    val almD = if (oficina) h.almuerzo?.first else null

    val semana = dia in 1..5
    val habituales = (if (semana) h.caminatas else emptyList()).toMutableList()
    if (almD != null && almD !in habituales) habituales.add(almD)
    habituales.sort()
    val pendientes = habituales.filter { it >= desdeMin - 30 }
    if (pendientes.isNotEmpty()) {
      val inicio = pendientes[0]
      val almuerzo = inicio == almD
      var dur = if (faltanMin == null) DURACION_SIN_PASOS
      else entre(ceil(faltanMin.toDouble() / pendientes.size).toInt(), DURACION_MIN, DURACION_MAX)
      if (almuerzo) dur = min(dur, h.almuerzo!!.second - inicio)
      val tuyo = horas.filter { it.fecha == fecha && it.hora * 60 < inicio + dur && it.hora * 60 + 60 > inicio }
      if (tuyo.isNotEmpty()) {
        val mejor = ventanaOptima(candidatas, entre(ceil(dur / 60.0).toInt(), 1, 2))?.let { recortar(it, h, oficina) }
        val malas = tuyo.filter { !apta(it) }
        if (malas.isEmpty()) {
          var prom = 0.0
          for (x in tuyo) prom += penalidad(x)
          prom /= tuyo.size
          val otra = mejor != null && mejor.desde != (inicio / 60) * 60 && mejor.penal + MEJORA <= prom
          return Caminata("habitual", inicio, almuerzo, true, null, if (otra) mejor else null, faltanMin)
        }
        return Caminata("habitual", inicio, almuerzo, false, motivoDe(malas[0]), mejor, faltanMin)
      }
    }

    if (candidatas.isEmpty()) return null
    val n = if (faltanMin == null) 1 else entre(ceil(faltanMin / 60.0).toInt(), 1, 2)
    val mejor = ventanaOptima(candidatas, n)
    if (mejor != null) return Caminata("optimo", otra = recortar(mejor, h, oficina), minutos = faltanMin)
    return Caminata("nada", motivo = motivoComun(candidatas), minutos = faltanMin)
  }

  /** 570 → "9:30"; las horas en punto, sin minutos: 540 → "9". */
  fun hora(min: Int): String {
    val h = (min / 60) % 24
    val m = min % 60
    return if (m != 0) "$h:${m.toString().padStart(2, '0')}" else "$h"
  }

  /** La tercera línea, igual que lineaCaminata en la web. */
  fun lineaCaminata(c: Caminata?, etiqueta: String): String {
    if (c == null) return ""
    if (c.tipo == "cumplida") return "🚶 Meta de pasos cumplida ✓"
    val falta = if (c.minutos != null) " · faltan ${c.minutos} min" else ""
    fun rato(v: Ventana) = "${hora(v.desde)}–${hora(v.hasta)} h"
    val otra = c.otra
    return when (c.tipo) {
      "habitual" -> {
        val cuando = if (c.almuerzo) {
          if (etiqueta == "Mañana") "Mañana almuerzo" else "Almuerzo"
        } else {
          "${if (etiqueta == "Mañana") "Mañana " else ""}${hora(c.inicio)} h"
        }
        if (c.ok) {
          if (otra != null) "🚶 $cuando ok, mejor ${rato(otra)}" else "🚶 $cuando ✓$falta"
        } else {
          if (otra != null) "🚶 $cuando: ${c.motivo} → ${rato(otra)}" else "🚶 $cuando: ${c.motivo}, no hay otro rato"
        }
      }
      "optimo" -> "🚶 $etiqueta ${rato(otra!!)}$falta"
      else -> "🚶 $etiqueta mejor no: ${c.motivo}"
    }
  }

  fun diaDeSemana(fecha: String): Int = LocalDate.parse(fecha).dayOfWeek.value % 7

  fun sumarDias(fecha: String, n: Long): String = LocalDate.parse(fecha).plusDays(n).toString()

  private fun redondo(n: Double): Long = Math.round(n)

  /** Las tres líneas, para una fecha ("2026-10-13") y minutos de Buenos Aires. */
  fun lineas(horas: List<Hora>, h: Horario, fechaHoy: String, minutosAhora: Int, pasos: Long? = null): Lineas {
    val sinDatos = Lineas("Sin pronóstico", "Abrí la app con conexión", "")
    val manana = minutosAhora >= HORA_DE_MANANA * 60
    val fecha = if (manana) sumarDias(fechaHoy, 1) else fechaHoy
    val etiqueta = if (manana) "Mañana" else "Hoy"
    val oficina = diaDeSemana(fecha) in h.dias && (manana || minutosAhora < h.salida + h.viaje)

    var ida = emptyList<Hora>()
    var vuelta = emptyList<Hora>()
    var almuerzo = emptyList<Hora>()
    val salir: List<Hora>
    if (oficina) {
      ida = tramo(horas, fecha, h.entrada - h.viaje, h.entrada)
      vuelta = tramo(horas, fecha, h.salida, h.salida + h.viaje)
      salir = ida + vuelta
      // Al almuerzo también salís: si llueve a esa hora, el paraguas va.
      h.almuerzo?.let { almuerzo = tramo(horas, fecha, it.first, it.second) }
    } else {
      val inicio = if (manana) 10 * 60 else minutosAhora
      salir = tramo(horas, fecha, inicio, inicio + 4 * 60)
    }
    if (salir.isEmpty()) return sinDatos

    val ropa = ropaPara(salir.minOf { sensacion(it) })
    val icono = when (paraguas(salir + almuerzo)) {
      "quizas" -> " · ☂️?"
      "si" -> " · ☂️"
      "capucha" -> " · capucha"
      else -> ""
    }
    val titulo = "${ropa.icono} ${ropa.corto}$icono"

    val minima = { hs: List<Hora> -> if (hs.isEmpty()) "–" else redondo(hs.minOf { it.temp }).toString() }
    val detalle = if (oficina) {
      "$etiqueta: ida ${minima(ida)}° · vuelta ${minima(vuelta)}°"
    } else {
      val maxima = redondo(horas.filter { it.fecha == fecha }.maxOf { it.temp })
      "$etiqueta: ${redondo(salir[0].temp)}° · máx $maxima°"
    }

    // La caminata es de hoy mientras te falten pasos y quede algún rato, aunque
    // ya sea de noche; si no, la de mañana (que todavía no tiene pasos).
    var c: Caminata? = null
    var etiquetaCaminata = "Hoy"
    if (!manana || (pasos != null && pasos < h.meta)) {
      c = planCaminata(horas, h, fechaHoy, minutosAhora, pasos)
    }
    if (c == null) {
      etiquetaCaminata = "Mañana"
      c = planCaminata(horas, h, sumarDias(fechaHoy, 1), 0, null)
    }
    val caminar = lineaCaminata(c, etiquetaCaminata)
    return Lineas(titulo, detalle, caminar)
  }
}
