package com.jeremiasmas.rutina

import java.time.LocalDate
import kotlin.math.max

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

  /** `dias` como en JavaScript: 0 = domingo. Horas en minutos desde la medianoche. */
  data class Horario(val dias: Set<Int>, val entrada: Int, val salida: Int, val viaje: Int) {
    companion object {
      val DEFAULT = Horario(setOf(1, 2, 3, 4, 5), 9 * 60, 18 * 60, 45)
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

  /** Un rato para caminar, o el motivo por el que no hay ninguno. */
  data class Caminata(val desde: Int, val hasta: Int, val motivo: String?)

  fun caminata(horas: List<Hora>, fecha: String, h: Horario, desdeMin: Int, oficina: Boolean): Caminata? {
    val ocupadoDesde = h.entrada - h.viaje
    val ocupadoHasta = h.salida + h.viaje
    val candidatas = horas.filter {
      it.fecha == fecha && it.hora >= CAMINATA_DESDE && it.hora < CAMINATA_HASTA &&
        it.hora * 60 >= desdeMin - 59 &&
        !(oficina && it.hora * 60 < ocupadoHasta && it.hora * 60 + 60 > ocupadoDesde)
    }
    if (candidatas.isEmpty()) return null

    var mejor: IntArray? = null
    var actual: IntArray? = null
    for (x in candidatas) {
      if (apta(x)) {
        val a = actual
        actual = if (a != null && x.hora == a[1]) intArrayOf(a[0], a[1] + 1) else intArrayOf(x.hora, x.hora + 1)
        val m = mejor
        if (m == null || actual[1] - actual[0] > m[1] - m[0]) mejor = actual.copyOf()
      } else {
        actual = null
      }
    }
    mejor?.let { return Caminata(it[0], it[1], null) }

    // Nada apto: el motivo que más se repite, y entre dos empatados el primero.
    val cuenta = LinkedHashMap<String, Int>()
    for (x in candidatas) {
      val m = motivoDe(x)
      cuenta[m] = (cuenta[m] ?: 0) + 1
    }
    var motivo: String? = null
    for ((m, n) in cuenta) if (motivo == null || n > (cuenta[motivo] ?: 0)) motivo = m
    return Caminata(0, 0, motivo)
  }

  fun diaDeSemana(fecha: String): Int = LocalDate.parse(fecha).dayOfWeek.value % 7

  fun sumarDias(fecha: String, n: Long): String = LocalDate.parse(fecha).plusDays(n).toString()

  private fun redondo(n: Double): Long = Math.round(n)

  /** Las tres líneas, para una fecha ("2026-10-13") y minutos de Buenos Aires. */
  fun lineas(horas: List<Hora>, h: Horario, fechaHoy: String, minutosAhora: Int): Lineas {
    val sinDatos = Lineas("Sin pronóstico", "Abrí la app con conexión", "")
    val manana = minutosAhora >= HORA_DE_MANANA * 60
    val fecha = if (manana) sumarDias(fechaHoy, 1) else fechaHoy
    val etiqueta = if (manana) "Mañana" else "Hoy"
    val desde = if (manana) 0 else minutosAhora
    val oficina = diaDeSemana(fecha) in h.dias && (manana || minutosAhora < h.salida + h.viaje)

    var ida = emptyList<Hora>()
    var vuelta = emptyList<Hora>()
    val salir: List<Hora>
    if (oficina) {
      ida = tramo(horas, fecha, h.entrada - h.viaje, h.entrada)
      vuelta = tramo(horas, fecha, h.salida, h.salida + h.viaje)
      salir = ida + vuelta
    } else {
      val inicio = if (manana) 10 * 60 else minutosAhora
      salir = tramo(horas, fecha, inicio, inicio + 4 * 60)
    }
    if (salir.isEmpty()) return sinDatos

    val ropa = ropaPara(salir.minOf { sensacion(it) })
    val icono = when (paraguas(salir)) {
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

    var c = caminata(horas, fecha, h, desde, diaDeSemana(fecha) in h.dias)
    var etiquetaCaminata = etiqueta
    if (c == null && !manana) {
      val otra = sumarDias(fecha, 1)
      etiquetaCaminata = "Mañana"
      c = caminata(horas, otra, h, 0, diaDeSemana(otra) in h.dias)
    }
    val caminar = when {
      c == null -> ""
      c.motivo != null -> "🚶 $etiquetaCaminata mejor no: ${c.motivo}"
      else -> "🚶 Caminar ${etiquetaCaminata.lowercase()} ${c.desde}–${c.hasta} h"
    }
    return Lineas(titulo, detalle, caminar)
  }
}
