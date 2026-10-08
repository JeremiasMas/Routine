package com.jeremiasmas.rutina

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale

/**
 * Lo que la app y el widget se dejan escrito.
 *
 * El widget corre en otro proceso: no tiene WebView, no puede abrir el
 * localStorage de la web y no sabe nada de la lógica de la app. Todo lo que
 * muestra sale de acá, de un JSON chico que la web escribe cada vez que algo
 * cambia.
 *
 * Y al revés: lo que tocás en el widget con la app cerrada se encola acá y la
 * web lo aplica la próxima vez que abrís. Cada registro guarda su propia
 * fecha, así que un toque del martes aplicado el jueves queda en el martes.
 */
object Resumen {

  private const val PREFS = "rutina_widget"
  private const val CLAVE_RESUMEN = "resumen"
  private const val CLAVE_PENDIENTES = "pendientes"

  private fun prefs(c: Context) =
    c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** El resumen que dejó la web, o null si todavía no abriste la app nunca. */
  fun leer(c: Context): JSONObject? {
    val crudo = prefs(c).getString(CLAVE_RESUMEN, null) ?: return null
    return try {
      JSONObject(crudo)
    } catch (e: Exception) {
      null
    }
  }

  fun guardar(c: Context, json: String) {
    prefs(c).edit().putString(CLAVE_RESUMEN, json).apply()
  }

  /**
   * Encola un registro hecho desde el widget.
   *
   * No se valida acá si corresponde o no: eso lo decide la web, que es la que
   * sabe si ya había algo cargado ese día. Acá sólo se anota qué tocaste.
   */
  fun encolar(c: Context, actividad: String, fecha: String, valor: Double) {
    val lista = pendientes(c)
    val item = JSONObject()
    item.put("actividad", actividad)
    item.put("fecha", fecha)
    item.put("valor", valor)
    lista.put(item)
    prefs(c).edit().putString(CLAVE_PENDIENTES, lista.toString()).apply()
  }

  fun pendientes(c: Context): JSONArray {
    val crudo = prefs(c).getString(CLAVE_PENDIENTES, null) ?: return JSONArray()
    return try {
      JSONArray(crudo)
    } catch (e: Exception) {
      JSONArray()
    }
  }

  fun limpiarPendientes(c: Context) {
    prefs(c).edit().remove(CLAVE_PENDIENTES).apply()
  }

  /**
   * Mete los pasos de hoy en el resumen guardado, sin pasar por la web.
   *
   * Los pasos se acumulan solos todo el día, pero el resumen lo escribe la
   * web: con la app cerrada el anillo quedaba clavado en el número de la
   * última vez que entraste. Health Connect se lee en Kotlin, así que acá se
   * corrige esa misión sola.
   *
   * Lo que NO se toca: xp, nivel, racha y rango. Eso lo calcula el motor de la
   * web sobre el localStorage, que desde este proceso no existe. Quedan como
   * en la última apertura, y es mejor que inventarlos: el XP de los pasos
   * recién se acredita cuando abrís, igual que antes.
   *
   * La misión no guarda el valor crudo —sólo `pct` y `texto`—, así que el
   * valor se rearma desde pct × meta. Devuelve true si algo cambió, para no
   * redibujar seis widgets al vicio.
   */
  fun conPasosDeHoy(c: Context, pasos: Long): Boolean {
    val resumen = leer(c) ?: return false
    if (resumen.optString("fecha") != LocalDate.now().toString()) return false
    val misiones = resumen.optJSONArray("misiones") ?: return false

    var mision: JSONObject? = null
    for (i in 0 until misiones.length()) {
      val m = misiones.optJSONObject(i) ?: continue
      if (m.optString("id") == "pasos") { mision = m; break }
    }
    val pasosHoy = mision ?: return false

    val meta = pasosHoy.optDouble("meta", 0.0)
    val antes = pasosHoy.optDouble("pct", 0.0) * meta
    // Sólo para arriba: los pasos de un día no bajan, y un cero de una lectura
    // a medias no tiene por qué borrar lo que la web ya había escrito.
    if (meta <= 0 || pasos <= antes + 0.5) return false

    val hecho = pasos >= meta
    pasosHoy.put("pct", (pasos / meta).coerceIn(0.0, 1.0))
    pasosHoy.put("hecho", hecho)
    pasosHoy.put(
      "texto",
      if (hecho) conUnidad(pasos, pasosHoy.optString("unidad"))
      else "${miles(pasos)} / ${conUnidad(meta, pasosHoy.optString("unidad"))}",
    )
    if (hecho) pasosHoy.put("unToque", 0)

    var hechas = 0
    for (i in 0 until misiones.length()) {
      if (misiones.optJSONObject(i)?.optBoolean("hecho") == true) hechas += 1
    }
    val total = resumen.optInt("total")
    resumen.put("hechas", hechas)
    resumen.put("perfecto", total > 0 && hechas == total)

    guardar(c, resumen.toString())
    return true
  }

  /** Como formatNumber de la web: separador de miles, coma decimal. */
  private fun miles(n: Double): String =
    java.text.NumberFormat.getNumberInstance(Locale("es", "AR")).apply {
      maximumFractionDigits = 1
    }.format(n)

  private fun miles(n: Long): String = miles(n.toDouble())

  /** Como formatValue para una unidad que no es ml ni min, que es el caso de pasos. */
  private fun conUnidad(n: Double, unidad: String): String =
    if (unidad.isBlank()) miles(n) else "${miles(n)} $unidad"

  private fun conUnidad(n: Long, unidad: String): String = conUnidad(n.toDouble(), unidad)

  /**
   * Qué actividades están encoladas para una fecha. El widget las marca
   * distinto de las cumplidas: todavía no son XP, son una promesa.
   */
  fun encoladasDe(c: Context, fecha: String): Set<String> {
    val lista = pendientes(c)
    val ids = mutableSetOf<String>()
    for (i in 0 until lista.length()) {
      val item = lista.optJSONObject(i) ?: continue
      if (item.optString("fecha") == fecha) ids.add(item.optString("actividad"))
    }
    return ids
  }
}
