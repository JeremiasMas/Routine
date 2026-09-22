package com.jeremiasmas.rutina

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

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
