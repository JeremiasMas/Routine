package com.jeremiasmas.rutina

import com.jeremiasmas.rutina.ClimaLogica.Caminata
import com.jeremiasmas.rutina.ClimaLogica.Horario
import com.jeremiasmas.rutina.ClimaLogica.Hora

/**
 * Las notificaciones del clima: cuándo suena cada una y qué dice. Sin nada de
 * Android, para poder probarlo aparte; NotificacionesClima las programa.
 *
 * Tres por día, como mucho, y siempre con qué ponerte:
 * - Día de oficina, media hora antes de salir de casa: lo de la ida, y en el
 *   texto lo que pide la vuelta o el almuerzo ("🧥🌧️ a la vuelta").
 * - Día de oficina, una hora antes de salir de la oficina: lo de la vuelta.
 * - Un rato antes de caminar, si te faltan pasos: cuándo y qué ponerte.
 */
object Avisos {
  /** Cuánto antes de salir de casa para la oficina suena el de la ida. */
  const val ANTES_IDA = 30

  /** Cuánto antes de empezar a caminar. */
  const val ANTES_CAMINATA = 15

  /** Hasta cuánto tarde todavía sirve un aviso: las alarmas pueden atrasarse. */
  const val TOLERANCIA = 45

  /** `clave` es "ida", "vuelta" o "caminata": una de cada una por día. */
  data class Aviso(val clave: String, val minuto: Int, val titulo: String, val texto: String)

  /** Dónde empieza y termina la caminata del plan; null si no hay rato. */
  fun rato(c: Caminata?): Pair<Int, Int>? {
    val otra = c?.otra
    return when {
      c == null -> null
      c.tipo == "habitual" && c.ok && otra == null -> c.inicio to (c.fin ?: (c.inicio + 60))
      c.tipo == "habitual" || c.tipo == "optimo" -> otra?.let { it.desde to it.hasta }
      else -> null
    }
  }

  /**
   * Los avisos de una fecha. `desde` (minutos) es desde cuándo se arma el plan
   * de caminata: ahora si es hoy, 0 si es mañana. `pasos`, los de hoy.
   */
  fun delDia(horas: List<Hora>, h: Horario, fecha: String, desde: Int, pasos: Long?): List<Aviso> {
    val avisos = ArrayList<Aviso>()
    if (ClimaLogica.diaDeSemana(fecha) in h.dias) {
      val ida = h.entrada - h.viaje - ANTES_IDA
      val v = ClimaLogica.vestir(horas, h, fecha, ida, null, fecha)
      if (v.titulo.isNotEmpty()) avisos.add(Aviso("ida", ida, v.titulo, v.aviso.ifEmpty { "Para ir a la oficina" }))
      val vuelta = h.salida - ClimaLogica.AVISO_SALIDA
      val w = ClimaLogica.vestir(horas, h, fecha, vuelta, null, fecha)
      if (w.titulo.isNotEmpty()) avisos.add(Aviso("vuelta", vuelta, w.titulo, "Para volver a casa"))
    }
    val c = ClimaLogica.planCaminata(horas, h, fecha, desde, pasos)
    val r = rato(c)
    if (r != null) {
      val hs = ClimaLogica.tramo(horas, fecha, r.first, r.second)
      val titulo = ClimaLogica.lineaCaminata(c, "Hoy")
      if (hs.isNotEmpty() && titulo.isNotEmpty()) {
        avisos.add(Aviso("caminata", r.first - ANTES_CAMINATA, titulo, ClimaLogica.prenda(hs)))
      }
    }
    return avisos.sortedBy { it.minuto }
  }

  /** Los que tocan ahora: ya llegó su hora, hace poco, y no se mandaron. */
  fun tocan(
    horas: List<Hora>, h: Horario, fecha: String, minutos: Int, pasos: Long?, enviados: Set<String>,
  ): List<Aviso> = delDia(horas, h, fecha, minutos, pasos).filter {
    it.minuto <= minutos && it.minuto > minutos - TOLERANCIA && "$fecha:${it.clave}" !in enviados
  }

  /**
   * Cuándo despertarse para el próximo aviso, hoy o mañana: (fecha, minuto).
   * Uno que ya tocaba y no salió (el pronóstico llegó tarde) es para ahora.
   * Null si no hay ninguno en dos días (un fin de semana sin caminata posible).
   */
  fun proximo(
    horas: List<Hora>, h: Horario, fecha: String, minutos: Int, pasos: Long?, enviados: Set<String>,
  ): Pair<String, Int>? {
    val hoy = delDia(horas, h, fecha, minutos, pasos)
      .firstOrNull { it.minuto > minutos - TOLERANCIA && "$fecha:${it.clave}" !in enviados }
    if (hoy != null) return fecha to maxOf(hoy.minuto, minutos)
    val manana = ClimaLogica.sumarDias(fecha, 1)
    val sig = delDia(horas, h, manana, 0, null).firstOrNull() ?: return null
    return manana to sig.minuto
  }
}
