package com.jeremiasmas.rutina

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Lo que el widget del clima necesita y no puede sacar de la web: el horario
 * de oficina que elegiste y el último pronóstico.
 *
 * La web los manda cada vez que la abrís (MainActivity.guardarClima). Además el
 * widget baja el pronóstico por su cuenta cada tanto, así sigue al día aunque
 * no abras la app en una semana.
 */
object Clima {

  /** Las mismas URL que clima/js/pronostico.js: Belgrano. */
  const val URL_PRONOSTICO = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=-34.5627&longitude=-58.4566" +
    "&hourly=temperature_2m,relative_humidity_2m,apparent_temperature," +
    "precipitation_probability,precipitation,weather_code," +
    "wind_speed_10m,wind_gusts_10m,uv_index" +
    "&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=4&wind_speed_unit=kmh"

  /** La misma, con cada modelo aparte para la lluvia; si falla, va la de arriba. */
  const val URL_MODELOS = URL_PRONOSTICO + "&models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless"

  val ZONA: ZoneId = ZoneId.of("America/Argentina/Buenos_Aires")

  /**
   * Cada cuánto, como mucho, se baja el pronóstico. El widget se despierta
   * cada media hora: entre medio redibuja con el que ya tiene, que trae las
   * próximas 96 horas.
   */
  private const val CADA_CUANTO_MS = 60 * 60 * 1000L

  private const val PREFS = "clima_widget"
  private const val CLAVE_HORARIO = "horario"
  private const val CLAVE_PRONOSTICO = "pronostico"
  private const val CLAVE_BAJADO = "bajado"
  private const val CLAVE_PASOS = "pasos"
  private const val CLAVE_PASOS_FECHA = "pasos_fecha"

  private fun prefs(c: Context) =
    c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Lo que manda la web. El pronóstico puede venir vacío: entonces no se toca. */
  fun guardar(c: Context, horario: String, pronostico: String) {
    val e = prefs(c).edit().putString(CLAVE_HORARIO, horario)
    if (pronostico.isNotBlank() && horas(pronostico).isNotEmpty()) {
      e.putString(CLAVE_PRONOSTICO, pronostico).putLong(CLAVE_BAJADO, System.currentTimeMillis())
    }
    e.apply()
  }

  /** "09:30" → 570, o null si no se entiende. */
  private fun minutos(hhmm: String?): Int? {
    val partes = hhmm?.split(":") ?: return null
    if (partes.size != 2) return null
    val h = partes[0].toIntOrNull() ?: return null
    val m = partes[1].toIntOrNull() ?: return null
    return if (h in 0..23 && m in 0..59) h * 60 + m else null
  }

  /** El horario que eligió la web, ya normalizado allá. Sin nada, el de siempre. */
  fun horario(c: Context): ClimaLogica.Horario {
    val base = ClimaLogica.Horario.DEFAULT
    val crudo = prefs(c).getString(CLAVE_HORARIO, null) ?: return base
    return try {
      val j = JSONObject(crudo)
      fun diasDe(clave: String, def: Set<Int>): Set<Int> {
        val lista = j.optJSONArray(clave) ?: return def
        return (0 until lista.length()).map { lista.optInt(it, -1) }.filter { it in 0..6 }.toSet()
      }
      val dias = diasDe("dias", base.dias)
      // Un día es de oficina o de home office, no las dos cosas: gana la oficina.
      val remoto = diasDe("remoto", base.remoto) - dias
      val entrada = minutos(j.optString("entrada")) ?: base.entrada
      val salida = minutos(j.optString("salida")) ?: base.salida
      val viaje = j.optInt("viaje", base.viaje).coerceIn(0, 180)
      val listaCaminatas = j.optJSONArray("caminatas")
      val caminatas = if (listaCaminatas == null) emptyList()
      else (0 until listaCaminatas.length()).mapNotNull { minutos(listaCaminatas.optString(it)) }.sorted()
      val meta = j.optInt("meta", ClimaLogica.META_PASOS).takeIf { it in 1000..50000 } ?: ClimaLogica.META_PASOS
      val (ent, sal) = if (salida <= entrada) base.entrada to base.salida else entrada to salida
      // Sin la clave vale el de siempre; null es "no tengo almuerzo libre". Uno
      // que no cae adentro del horario de oficina no es un almuerzo.
      val cargado = if (!j.has("almuerzo")) base.almuerzo
      else j.optJSONObject("almuerzo")?.let { a ->
        val d = minutos(a.optString("desde"))
        val hs = minutos(a.optString("hasta"))
        if (d != null && hs != null) d to hs else null
      }
      val almuerzo = cargado?.takeIf { it.first < it.second && it.first >= ent && it.second <= sal }
      // Sin la lista vale la de siempre; una lista vacía es "no tengo nada fijo".
      val listaOcupados = j.optJSONArray("ocupados")
      val ocupados = if (listaOcupados == null) base.ocupados
      else (0 until listaOcupados.length()).mapNotNull { i ->
        val o = listaOcupados.optJSONObject(i) ?: return@mapNotNull null
        val d = minutos(o.optString("desde"))
        val hs = minutos(o.optString("hasta"))
        val diasO = o.optJSONArray("dias")?.let { arr ->
          (0 until arr.length()).map { arr.optInt(it, -1) }.filter { it in 0..6 }.toSet()
        }.orEmpty()
        if (d == null || hs == null || d >= hs || diasO.isEmpty()) null
        else ClimaLogica.Ocupado(diasO, d, hs)
      }.take(ClimaLogica.MAX_OCUPADOS)
      ClimaLogica.Horario(dias, ent, sal, viaje, caminatas, meta, almuerzo, remoto, ocupados)
    } catch (e: Exception) {
      base
    }
  }

  /** La respuesta de Open-Meteo → horas. Lo que no se entiende se saltea. */
  fun horas(json: String): List<ClimaLogica.Hora> {
    return try {
      val h = JSONObject(json).getJSONObject("hourly")
      val tiempos = h.getJSONArray("time")
      // Con varios modelos, lo de siempre viene como "temperature_2m_best_match".
      fun arreglo(campo: String) = h.optJSONArray(campo) ?: h.optJSONArray("${campo}_best_match")
      val temps = arreglo("temperature_2m") ?: return emptyList()
      fun numONull(campo: String, i: Int): Double? {
        val arr = arreglo(campo) ?: return null
        return if (arr.isNull(i)) null else arr.optDouble(i).takeIf { !it.isNaN() }
      }
      fun num(campo: String, i: Int, def: Double) = numONull(campo, i) ?: def
      val salida = ArrayList<ClimaLogica.Hora>()
      for (i in 0 until tiempos.length()) {
        val t = tiempos.optString(i)
        if (t.length != 16 || temps.isNull(i)) continue
        val temp = temps.optDouble(i)
        val hora = t.substring(11, 13).toIntOrNull() ?: continue
        if (temp.isNaN()) continue
        val (prob, lluvia) = ClimaLogica.consenso(
          num("precipitation_probability", i, 0.0), num("precipitation", i, 0.0),
          ClimaLogica.MODELOS_LLUVIA.map { numONull("precipitation_$it", i) },
        )
        salida.add(
          ClimaLogica.Hora(
            fecha = t.substring(0, 10),
            hora = hora,
            temp = temp,
            hum = num("relative_humidity_2m", i, 60.0),
            aparente = num("apparent_temperature", i, temp),
            prob = prob,
            lluvia = lluvia,
            codigo = num("weather_code", i, 0.0).toInt(),
            viento = num("wind_speed_10m", i, 0.0),
            rafagas = num("wind_gusts_10m", i, 0.0),
            uv = num("uv_index", i, 0.0),
          )
        )
      }
      salida
    } catch (e: Exception) {
      emptyList()
    }
  }

  fun horasGuardadas(c: Context): List<ClimaLogica.Hora> =
    prefs(c).getString(CLAVE_PRONOSTICO, null)?.let { horas(it) } ?: emptyList()

  /**
   * Baja el pronóstico si el guardado tiene más de una hora. Corre en un hilo
   * de fondo: nunca en el principal.
   *
   * @return true si hay uno nuevo
   */
  fun ponerAlDia(c: Context): Boolean {
    val ahora = System.currentTimeMillis()
    val bajado = prefs(c).getLong(CLAVE_BAJADO, 0L)
    // El reloj puede ir para atrás: un "bajado" en el futuro no frena para siempre.
    if (bajado in (ahora - CADA_CUANTO_MS + 1)..ahora) return false
    val json = bajar(URL_MODELOS) ?: bajar(URL_PRONOSTICO) ?: return false
    prefs(c).edit().putString(CLAVE_PRONOSTICO, json).putLong(CLAVE_BAJADO, ahora).apply()
    return true
  }

  /** Baja una URL; null si falla o no trae un pronóstico que sirva. */
  private fun bajar(url: String): String? {
    val json = try {
      val con = URL(url).openConnection() as HttpURLConnection
      con.connectTimeout = 8_000
      con.readTimeout = 8_000
      try {
        if (con.responseCode != 200) return null
        con.inputStream.bufferedReader().use { it.readText() }
      } finally {
        con.disconnect()
      }
    } catch (e: Exception) {
      return null
    }
    return json.takeIf { horas(it).isNotEmpty() }
  }

  /**
   * Los pasos de hoy, leídos de Health Connect por el widget. Una lectura que
   * falla (sin permiso, sin respuesta) no pisa la anterior: devuelve null y
   * queda lo que había.
   */
  fun guardarPasos(c: Context, pasos: Long) {
    prefs(c).edit()
      .putLong(CLAVE_PASOS, pasos)
      .putString(CLAVE_PASOS_FECHA, LocalDateTime.now(ZONA).toLocalDate().toString())
      .apply()
  }

  /** Los pasos de hoy, o null si no hay lectura de hoy: los de ayer no sirven. */
  fun pasosDeHoy(c: Context): Long? {
    val p = prefs(c)
    val fecha = p.getString(CLAVE_PASOS_FECHA, null) ?: return null
    if (fecha != LocalDateTime.now(ZONA).toLocalDate().toString()) return null
    return p.getLong(CLAVE_PASOS, 0L)
  }

  /** Las tres líneas para este momento, con lo que haya guardado. */
  fun lineas(c: Context): ClimaLogica.Lineas {
    val ahora = LocalDateTime.now(ZONA)
    return ClimaLogica.lineas(
      horasGuardadas(c),
      horario(c),
      ahora.toLocalDate().toString(),
      ahora.hour * 60 + ahora.minute,
      pasosDeHoy(c),
    )
  }
}
