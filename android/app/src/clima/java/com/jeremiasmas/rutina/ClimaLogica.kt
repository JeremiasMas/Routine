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
  const val MM_LLOVIZNA = 0.1
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
  /** El fin de semana se busca sol para la vitamina D: UV entre estos dos. */
  const val UV_VITAMINA_MIN = 3.0
  const val UV_VITAMINA_MAX = 6.0
  const val FACTOR_SOL = 1.5
  const val MEJORA = 4.0
  const val DURACION_SIN_PASOS = 60
  const val DURACION_MIN = 20
  const val DURACION_MAX = 120
  const val MAX_OCUPADOS = 8
  const val AVISO_SALIDA = 60

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
    /** El almuerzo libre de los días de trabajo, [desde, hasta) en minutos, o null. */
    val almuerzo: Pair<Int, Int>? = null,
    /** Los días de home office: mismo horario, sin viaje. */
    val remoto: Set<Int> = emptySet(),
    /** Lo fijo de cada semana (K1, gimnasio): ahí no se camina. */
    val ocupados: List<Ocupado> = emptyList(),
  ) {
    companion object {
      /**
       * Tu semana, igual que HORARIO_DEFAULT en la web: oficina martes a
       * jueves de 9 a 18, una hora de colectivo, home office lunes y viernes,
       * almuerzo de 13 a 14:30.
       */
      val DEFAULT = Horario(
        setOf(2, 3, 4), 9 * 60, 18 * 60, 60,
        almuerzo = 13 * 60 to 14 * 60 + 30, remoto = setOf(1, 5),
        ocupados = listOf(
          Ocupado(setOf(2, 4), 20 * 60 + 30, 22 * 60),   // K1
          Ocupado(setOf(3), 19 * 60, 20 * 60),           // Gimnasio
          Ocupado(setOf(5), 18 * 60, 20 * 60),           // Gimnasio
        ),
      )
    }
  }

  /** Un bloque fijo de la semana, [desde, hasta) en minutos, los `dias` que toca. */
  data class Ocupado(val dias: Set<Int>, val desde: Int, val hasta: Int)

  /** ¿Choca [desde, hasta) con algo fijo de ese día de la semana? */
  private fun ocupado(h: Horario, dia: Int, desde: Int, hasta: Int): Boolean =
    h.ocupados.any { dia in it.dias && desde < it.hasta && hasta > it.desde }

  /** Las dos líneas del widget: qué ponerte y cuándo caminar. */
  /**
   * Las líneas del widget: qué ponerte (vacía si no estás por salir), un
   * aviso para la vuelta (vacío casi siempre) y cuándo caminar.
   */
  data class Lineas(val titulo: String, val aviso: String, val caminar: String)

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
    h.lluvia >= MM_LLUEVE || (h.prob >= PROB_LLUEVE && h.lluvia >= MM_LLOVIZNA) -> "lluvia"
    h.prob >= PROB_QUIZAS || h.lluvia >= MM_LLOVIZNA -> "quizas"
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

  /** Como penalidad en la web: el fin de semana el sol se busca en vez de sumar. */
  fun penalidad(h: Hora, finde: Boolean = false): Double {
    val sol = if (!finde) h.uv / 2
    else if (h.uv < UV_VITAMINA_MIN) (UV_VITAMINA_MIN - h.uv) * FACTOR_SOL
    else if (h.uv > UV_VITAMINA_MAX) (h.uv - UV_VITAMINA_MAX) * FACTOR_SOL
    else 0.0
    return abs(sensacion(h) - CAMINATA_IDEAL) + h.prob / 10 + sol + max(0.0, h.rafagas - 40) / 5
  }

  /** ¿Hay sol para la vitamina D en todas estas horas? */
  fun conSol(horas: List<Hora>): Boolean = horas.isNotEmpty() && horas.all { it.uv >= UV_VITAMINA_MIN }

  private fun libres(horas: List<Hora>, fecha: String, h: Horario, desdeMin: Int, trabaja: Boolean, viaje: Int): List<Hora> {
    val ocupadoDesde = h.entrada - viaje
    val ocupadoHasta = h.salida + viaje
    val almD = h.almuerzo?.first ?: -1
    val almH = h.almuerzo?.second ?: -1
    val dia = diaDeSemana(fecha)
    return horas.filter {
      it.fecha == fecha && it.hora >= CAMINATA_DESDE && it.hora < CAMINATA_HASTA &&
        it.hora * 60 >= desdeMin - 59 &&
        !(trabaja && it.hora * 60 < ocupadoHasta && it.hora * 60 + 60 > ocupadoDesde &&
          !(it.hora * 60 >= almD && it.hora * 60 < almH)) &&
        !ocupado(h, dia, it.hora * 60, it.hora * 60 + 60)
    }
  }

  /** Un tramo de horas enteras, en minutos y recortado al almuerzo si cae en él. */
  private fun recortar(v: Ventana, h: Horario, trabaja: Boolean, viaje: Int): Ventana {
    val desde = v.desde * 60
    val hasta = v.hasta * 60
    val alm = h.almuerzo
    if (!trabaja || alm == null) return Ventana(desde, hasta, v.penal)
    val ocupadoDesde = h.entrada - viaje
    val ocupadoHasta = h.salida + viaje
    if (!(desde < ocupadoHasta && hasta > ocupadoDesde)) return Ventana(desde, hasta, v.penal)
    return Ventana(max(desde, alm.first), min(hasta, alm.second), v.penal)
  }

  /**
   * Un tramo [desde, hasta) y su penalidad promedio: en horas al salir de
   * ventanaOptima, en minutos una vez recortado.
   */
  data class Ventana(val desde: Int, val hasta: Int, val penal: Double)

  fun ventanaOptima(candidatas: List<Hora>, n: Int, finde: Boolean = false): Ventana? {
    for (k in n downTo 1) {
      var mejor: Ventana? = null
      var mejorSuma = 0.0
      for (i in 0..candidatas.size - k) {
        var suma = 0.0
        var sirve = true
        for (j in 0 until k) {
          val x = candidatas[i + j]
          if (x.hora != candidatas[i].hora + j || !apta(x)) { sirve = false; break }
          suma += penalidad(x, finde)
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
    /** Un óptimo de fin de semana con sol para la vitamina D. */
    val sol: Boolean = false,
    /** Cuándo termina el almuerzo, si la caminata es la del almuerzo. */
    val fin: Int? = null,
  )

  private fun entre(n: Int, minimo: Int, maximo: Int) = min(maximo, max(minimo, n))

  fun planCaminata(horas: List<Hora>, h: Horario, fecha: String, desdeMin: Int, pasos: Long?): Caminata? {
    val dia = diaDeSemana(fecha)
    val faltan = if (pasos == null) null else max(0L, h.meta - pasos)
    if (faltan == 0L) return Caminata("cumplida")
    val faltanMin = faltan?.let { ceil(it.toDouble() / PASOS_POR_MINUTO).toInt() }
    val oficina = dia in h.dias
    val trabaja = oficina || dia in h.remoto
    val viaje = if (oficina) h.viaje else 0
    val candidatas = libres(horas, fecha, h, desdeMin, trabaja, viaje)
    val almD = if (trabaja) h.almuerzo?.first else null

    val semana = dia in 1..5
    val finde = !semana
    val habituales = (if (semana) h.caminatas else emptyList()).toMutableList()
    if (almD != null && almD !in habituales) habituales.add(almD)
    habituales.sort()
    // Una caminata que arranca adentro de algo fijo no es una caminata.
    val pendientes = habituales.filter { it >= desdeMin - 30 && !ocupado(h, dia, it, it + 1) }
    if (pendientes.isNotEmpty()) {
      val inicio = pendientes[0]
      val almuerzo = inicio == almD
      val fin = if (almuerzo) h.almuerzo?.second else null
      var dur = if (faltanMin == null) DURACION_SIN_PASOS
      else entre(ceil(faltanMin.toDouble() / pendientes.size).toInt(), DURACION_MIN, DURACION_MAX)
      if (almuerzo) dur = min(dur, h.almuerzo!!.second - inicio)
      val tuyo = horas.filter { it.fecha == fecha && it.hora * 60 < inicio + dur && it.hora * 60 + 60 > inicio }
      if (tuyo.isNotEmpty()) {
        val mejor = ventanaOptima(candidatas, entre(ceil(dur / 60.0).toInt(), 1, 2), finde)?.let { recortar(it, h, trabaja, viaje) }
        val malas = tuyo.filter { !apta(it) }
        if (malas.isEmpty()) {
          var prom = 0.0
          for (x in tuyo) prom += penalidad(x, finde)
          prom /= tuyo.size
          // Otro rato sólo si es claramente mejor y no se pisa con el tuyo.
          val hastaTuyo = fin ?: (inicio + dur)
          val pisa = mejor != null && mejor.desde < hastaTuyo && mejor.hasta > inicio
          val otra = mejor != null && !pisa && mejor.penal + MEJORA <= prom
          return Caminata("habitual", inicio, almuerzo, true, null, if (otra) mejor else null, faltanMin, fin = fin)
        }
        return Caminata("habitual", inicio, almuerzo, false, motivoDe(malas[0]), mejor, faltanMin, fin = fin)
      }
    }

    if (candidatas.isEmpty()) return null
    val n = if (faltanMin == null) 1 else entre(ceil(faltanMin / 60.0).toInt(), 1, 2)
    val mejor = ventanaOptima(candidatas, n, finde)
    if (mejor != null) {
      val sol = finde && conSol(candidatas.filter { it.hora >= mejor.desde && it.hora < mejor.hasta })
      return Caminata("optimo", otra = recortar(mejor, h, trabaja, viaje), minutos = faltanMin, sol = sol)
    }
    return Caminata("nada", motivo = motivoComun(candidatas), minutos = faltanMin)
  }

  /** 570 → "9:30"; las horas en punto, sin minutos: 540 → "9". */
  fun hora(min: Int): String {
    val h = (min / 60) % 24
    val m = min % 60
    return if (m != 0) "$h:${m.toString().padStart(2, '0')}" else "$h"
  }

  /**
   * La tercera línea, igual que lineaCaminata en la web. Con lluviaAlmuerzo
   * el aviso ya dice "🌧️ al almuerzo" y no se repite el motivo.
   */
  fun lineaCaminata(c: Caminata?, etiqueta: String, lluviaAlmuerzo: Boolean = false): String {
    if (c == null) return ""
    // Con la meta cumplida no hay nada que decir: el widget queda en una línea.
    if (c.tipo == "cumplida") return ""
    val falta = if (c.minutos != null) " · faltan ${c.minutos} min" else ""
    fun rato(v: Ventana) = "${hora(v.desde)}–${hora(v.hasta)} h"
    val camina = if (etiqueta == "Mañana") "Mañana caminá" else "Caminá"
    val otra = c.otra
    return when (c.tipo) {
      "habitual" -> {
        val tuyo = if (c.almuerzo) "${hora(c.inicio)}–${hora(c.fin ?: c.inicio)} h" else "${hora(c.inicio)} h"
        val cuando = if (c.almuerzo) "al almuerzo" else "a las ${hora(c.inicio)}"
        if (c.ok) {
          if (otra != null) "$camina ${rato(otra)}, mejor que $cuando" else "$camina $tuyo$falta"
        } else if (lluviaAlmuerzo && c.almuerzo && (c.motivo == "lluvia" || c.motivo == "tormenta")) {
          if (otra != null) "$camina ${rato(otra)}" else "$etiqueta no hay otro rato para caminar"
        } else {
          val previo = if (etiqueta == "Mañana") "Mañana: " else ""
          val motivo = c.motivo.orEmpty().let { if (previo.isEmpty()) it.replaceFirstChar { ch -> ch.uppercase() } else it }
          if (otra != null) "$previo$motivo $cuando, caminá ${rato(otra)}"
          else "$previo$motivo $cuando, no hay otro rato"
        }
      }
      "optimo" -> "$camina ${rato(otra!!)}${if (c.sol) " al sol" else ""}$falta"
      else -> "$etiqueta mejor no caminar: ${c.motivo}"
    }
  }

  fun diaDeSemana(fecha: String): Int = LocalDate.parse(fecha).dayOfWeek.value % 7

  fun sumarDias(fecha: String, n: Long): String = LocalDate.parse(fecha).plusDays(n).toString()

  /** Las dos líneas, para una fecha ("2026-10-13") y minutos de Buenos Aires. */
  fun lineas(horas: List<Hora>, h: Horario, fechaHoy: String, minutosAhora: Int, pasos: Long? = null): Lineas {
    val sinDatos = Lineas("Sin pronóstico", "", "Abrí la app con conexión")
    val manana = minutosAhora >= HORA_DE_MANANA * 60
    val fecha = if (manana) sumarDias(fechaHoy, 1) else fechaHoy
    val oficina = diaDeSemana(fecha) in h.dias && (manana || minutosAhora < h.salida + h.viaje)
    val remoto = diaDeSemana(fecha) in h.remoto
    // En home office la única salida del horario de trabajo es el almuerzo.
    val alm = h.almuerzo
    val casa = remoto && alm != null && (manana || minutosAhora < alm.second)

    val salir: List<Hora>
    if (oficina) {
      salir = tramo(horas, fecha, h.entrada - h.viaje, h.entrada) + tramo(horas, fecha, h.salida, h.salida + h.viaje)
    } else if (casa) {
      salir = tramo(horas, fecha, alm.first, alm.second)
    } else {
      var inicio = if (manana) 10 * 60 else minutosAhora
      if (remoto && !manana && minutosAhora < h.salida) inicio = h.salida
      salir = tramo(horas, fecha, inicio, inicio + 4 * 60)
    }
    // Sin horas para salir no hay pronóstico que mostrar (como plan() en la
    // web). Qué ponerte lo decide vestir, más abajo.
    if (salir.isEmpty()) return sinDatos

    // La caminata es de hoy mientras te falten pasos y quede algún rato, aunque
    // ya sea de noche; si no, la de mañana (que todavía no tiene pasos).
    var c: Caminata? = null
    var etiquetaCaminata = "Hoy"
    var fechaCaminata = fechaHoy
    if (!manana || (pasos != null && pasos < h.meta)) {
      c = planCaminata(horas, h, fechaHoy, minutosAhora, pasos)
    }
    if (c == null) {
      etiquetaCaminata = "Mañana"
      fechaCaminata = sumarDias(fechaHoy, 1)
      c = planCaminata(horas, h, fechaCaminata, 0, null)
    }
    val v = vestir(horas, h, fechaHoy, minutosAhora, c, fechaCaminata)
    return Lineas(v.titulo, v.aviso, lineaCaminata(c, etiquetaCaminata, v.lluviaAlmuerzo))
  }

  private fun rangoParaguas(nivel: String) = when (nivel) {
    "quizas" -> 1
    "si" -> 2
    "capucha" -> 3
    else -> 0
  }

  // Paraguas en emoji, que ahorra renglón: 🌂 por las dudas, ☔ va a llover.
  // Con ráfagas no hay emoji que diga "capucha", así que va escrito.
  private fun textoParaguas(nivel: String) = when (nivel) {
    "quizas" -> " 🌂"
    "si" -> " ☔"
    "capucha" -> " · capucha"
    else -> ""
  }

  private fun emojiLluvia(nivel: String) = when (nivel) {
    "quizas" -> "🌦️"
    "si", "capucha" -> "🌧️"
    else -> ""
  }

  /** "Campera liviana ☔" para un tramo de horas. */
  private fun prenda(hs: List<Hora>) = ropaPara(hs.minOf { sensacion(it) }).corto + textoParaguas(paraguas(hs))

  data class Vestir(val titulo: String, val aviso: String, val lluviaAlmuerzo: Boolean = false)

  /**
   * Qué ponerte, sólo cuando estás por salir; como vestir en la web.
   * Título y aviso vacíos cuando no hay ninguna salida cerca.
   */
  fun vestir(
    horas: List<Hora>, h: Horario, fechaHoy: String, minutosAhora: Int,
    caminata: Caminata?, fechaCaminata: String,
  ): Vestir {
    val nada = Vestir("", "")
    val manana = minutosAhora >= HORA_DE_MANANA * 60
    val fecha = if (manana) sumarDias(fechaHoy, 1) else fechaHoy
    val min = if (manana) -1 else minutosAhora
    val pendiente = { x: Hora -> x.hora * 60 + 60 > min }
    val dia = diaDeSemana(fecha)

    if (dia in h.dias) {
      val ida = tramo(horas, fecha, h.entrada - h.viaje, h.entrada)
      val vuelta = tramo(horas, fecha, h.salida, h.salida + h.viaje)
      if (min < h.entrada) {
        val base = if (ida.any(pendiente)) ida.filter(pendiente) else ida
        if (base.isEmpty()) return nada
        val ropaIda = ropaPara(base.minOf { sensacion(it) })
        val nivelIda = paraguas(base)
        // El paraguas se decide al salir de casa: va arriba si hace falta en
        // cualquier momento del día, y abajo, corto, cuándo llueve.
        val alm = h.almuerzo?.let { tramo(horas, fecha, it.first, it.second) }?.takeIf { it.isNotEmpty() }
        val vue = vuelta.takeIf { it.isNotEmpty() }
        val nivelAlm = alm?.let { paraguas(it) }
        val nivelVue = vue?.let { paraguas(it) }
        val peor = listOfNotNull(nivelAlm, nivelVue).fold(nivelIda) { n, x -> if (rangoParaguas(x) > rangoParaguas(n)) x else n }
        // Abajo, lo justo: "🌧️ al almuerzo", "🧥🌧️ a la vuelta".
        val llueve = { nivel: String? -> rangoParaguas(peor) > rangoParaguas(nivelIda) && nivel == peor }
        val enVuelta = ArrayList<String>()
        if (vue != null) {
          val ropaVuelta = ropaPara(vue.minOf { sensacion(it) })
          if (ropaVuelta.hasta < ropaIda.hasta) enVuelta.add("🧥")
        }
        val aviso = if (llueve(nivelAlm) && llueve(nivelVue) && enVuelta.isEmpty()) {
          "${emojiLluvia(peor)} al almuerzo y a la vuelta"
        } else {
          if (llueve(nivelVue)) enVuelta.add(emojiLluvia(peor))
          val partes = ArrayList<String>()
          if (llueve(nivelAlm)) partes.add("${emojiLluvia(peor)} al almuerzo")
          if (enVuelta.isNotEmpty()) partes.add("${enVuelta.joinToString("")} a la vuelta")
          partes.joinToString(" · ")
        }
        // Si el aviso ya dice que llueve al almuerzo, la caminata no lo repite.
        val lluviaAlmuerzo = llueve(nivelAlm) && fechaCaminata == fecha
        return Vestir(ropaIda.corto + textoParaguas(peor), aviso, lluviaAlmuerzo)
      }
      if (min >= h.salida - AVISO_SALIDA && min < h.salida + h.viaje && vuelta.isNotEmpty()) {
        val base = if (vuelta.any(pendiente)) vuelta.filter(pendiente) else vuelta
        return Vestir(prenda(base), "")
      }
      return nada
    }

    if (dia in h.remoto) {
      val c = if (fechaCaminata == fecha) caminata else null
      val rato: Pair<Int, Int>? = when {
        c == null -> null
        c.tipo == "habitual" && c.ok -> c.inicio to (c.fin ?: (c.inicio + 60))
        c.tipo == "habitual" -> c.otra?.let { it.desde to it.hasta }
        c.tipo == "optimo" -> c.otra?.let { it.desde to it.hasta }
        else -> null
      }
      if (rato == null) return nada
      val hs = tramo(horas, fecha, rato.first, rato.second).filter(pendiente)
      return if (hs.isEmpty()) nada else Vestir(prenda(hs), "")
    }

    val inicio = if (manana) 10 * 60 else minutosAhora
    val hs = tramo(horas, fecha, inicio, inicio + 4 * 60)
    return if (hs.isEmpty()) nada else Vestir(prenda(hs), "")
  }
}
