package com.jeremiasmas.rutina

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import java.time.LocalDate

/**
 * El widget de la pantalla de inicio: las misiones de hoy y cómo va el día.
 *
 * No calcula nada. Dibuja el resumen que la web dejó en Resumen, porque acá no
 * hay WebView ni acceso al localStorage. Si nunca abriste la app, lo dice en
 * vez de mostrar ceros que parecerían datos.
 *
 * Tocar una misión abre la app en esa actividad. Las que se pueden dar por
 * cumplidas con un valor obvio —minutos, mililitros— traen además un botón que
 * las encola sin abrir nada; la web las aplica cuando volvés.
 */
class WidgetRutina : AppWidgetProvider() {

  override fun onUpdate(c: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, construir(c))
  }

  override fun onReceive(c: Context, intent: Intent) {
    super.onReceive(c, intent)
    if (intent.action == ACCION_REGISTRAR) {
      val actividad = intent.getStringExtra(EXTRA_ACTIVIDAD).orEmpty()
      val fecha = intent.getStringExtra(EXTRA_FECHA).orEmpty()
      val valor = intent.getDoubleExtra(EXTRA_VALOR, 0.0)
      if (actividad.isNotEmpty() && fecha.isNotEmpty() && valor > 0) {
        Resumen.encolar(c, actividad, fecha, valor)
      }
      refrescar(c)
    }
  }

  companion object {

    const val ACCION_REGISTRAR = "com.jeremiasmas.rutina.REGISTRAR"
    const val EXTRA_ACTIVIDAD = "actividad"
    const val EXTRA_FECHA = "fecha"
    const val EXTRA_VALOR = "valor"

    /** Cuántas filas entran antes de resumir el resto en una línea. */
    private const val MAX_FILAS = 6

    /** Vuelve a dibujar todos los widgets puestos en la pantalla. */
    fun refrescar(c: Context) {
      val manager = AppWidgetManager.getInstance(c)
      val ids = manager.getAppWidgetIds(ComponentName(c, WidgetRutina::class.java))
      if (ids.isEmpty()) return
      val vista = construir(c)
      for (id in ids) manager.updateAppWidget(id, vista)
    }

    private fun construir(c: Context): RemoteViews {
      val vista = RemoteViews(c.packageName, R.layout.widget)
      vista.removeAllViews(R.id.widget_filas)
      vista.setOnClickPendingIntent(R.id.widget_cabecera, abrirApp(c, null))

      val resumen = Resumen.leer(c)
      if (resumen == null) {
        vista.setTextViewText(R.id.widget_titulo, c.getString(R.string.widget_vacio_titulo))
        vista.setTextViewText(R.id.widget_detalle, c.getString(R.string.widget_vacio_detalle))
        vista.setViewVisibility(R.id.widget_filas, View.GONE)
        return vista
      }
      vista.setViewVisibility(R.id.widget_filas, View.VISIBLE)

      val fecha = resumen.optString("fecha")

      // A medianoche el resumen queda viejo y nadie lo actualiza hasta que
      // abras la app. Mostrar las misiones de ayer como si fueran las de hoy
      // sería peor que decir que no están: el widget diría que ya cumpliste
      // cosas que todavía no empezaste.
      if (fecha != LocalDate.now().toString()) {
        vista.setTextViewText(R.id.widget_titulo, c.getString(R.string.widget_viejo_titulo))
        vista.setTextViewText(R.id.widget_detalle, c.getString(R.string.widget_viejo_detalle))
        vista.setViewVisibility(R.id.widget_filas, View.GONE)
        return vista
      }

      val hechas = resumen.optInt("hechas")
      val total = resumen.optInt("total")
      val perfecto = resumen.optBoolean("perfecto")
      val encoladas = Resumen.encoladasDe(c, fecha)

      vista.setTextViewText(
        R.id.widget_titulo,
        if (perfecto) c.getString(R.string.widget_perfecto)
        else c.getString(R.string.widget_progreso, hechas, total),
      )
      vista.setTextViewText(
        R.id.widget_detalle,
        c.getString(
          R.string.widget_detalle,
          resumen.optInt("xp"),
          resumen.optInt("racha"),
          resumen.optString("rango"),
        ),
      )

      val misiones = resumen.optJSONArray("misiones")
      val cuantas = misiones?.length() ?: 0
      var puestas = 0
      for (i in 0 until cuantas) {
        if (puestas >= MAX_FILAS) break
        val m = misiones?.optJSONObject(i) ?: continue
        vista.addView(R.id.widget_filas, fila(c, m, fecha, encoladas))
        puestas += 1
      }
      if (cuantas > puestas) {
        val resto = RemoteViews(c.packageName, R.layout.widget_mas)
        resto.setTextViewText(R.id.fila_mas, c.getString(R.string.widget_mas, cuantas - puestas))
        resto.setOnClickPendingIntent(R.id.fila_mas, abrirApp(c, null))
        vista.addView(R.id.widget_filas, resto)
      }
      return vista
    }

    private fun fila(
      c: Context,
      m: org.json.JSONObject,
      fecha: String,
      encoladas: Set<String>,
    ): RemoteViews {
      val id = m.optString("id")
      val hecho = m.optBoolean("hecho")
      val encolada = encoladas.contains(id)
      val fila = RemoteViews(c.packageName, R.layout.widget_fila)

      fila.setTextViewText(R.id.fila_icono, m.optString("icono"))
      fila.setTextViewText(R.id.fila_nombre, m.optString("nombre"))
      fila.setTextViewText(
        R.id.fila_valor,
        when {
          hecho -> c.getString(R.string.widget_hecho)
          encolada -> c.getString(R.string.widget_encolada)
          else -> m.optString("texto")
        },
      )
      fila.setTextColor(
        R.id.fila_valor,
        when {
          hecho -> c.resources.getColor(R.color.widget_ok, null)
          encolada -> c.resources.getColor(R.color.widget_pendiente, null)
          else -> c.resources.getColor(R.color.widget_suave, null)
        },
      )
      fila.setOnClickPendingIntent(R.id.fila_cuerpo, abrirApp(c, id))

      // El botón de un toque sólo aparece donde cumplir es un número único y
      // sin ambigüedad. En el gimnasio no existe un valor obvio, y ofrecerlo
      // sería inventar el dato.
      val valor = m.optDouble("unToque", 0.0)
      if (!hecho && !encolada && valor > 0) {
        fila.setViewVisibility(R.id.fila_boton, View.VISIBLE)
        fila.setOnClickPendingIntent(R.id.fila_boton, registrar(c, id, fecha, valor))
      } else {
        fila.setViewVisibility(R.id.fila_boton, View.GONE)
      }
      return fila
    }

    /** Abre la app, opcionalmente derecho en una actividad. */
    private fun abrirApp(c: Context, actividadId: String?): PendingIntent {
      val intent = Intent(c, MainActivity::class.java)
        .setAction(Intent.ACTION_MAIN)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      if (!actividadId.isNullOrEmpty()) {
        intent.putExtra(MainActivity.EXTRA_RUTA, "#/actividad/$actividadId")
      }
      return PendingIntent.getActivity(
        c,
        ("abrir:" + (actividadId ?: "")).hashCode(),
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }

    /** Encola la meta del día sin abrir nada. */
    private fun registrar(c: Context, id: String, fecha: String, valor: Double): PendingIntent {
      val intent = Intent(c, WidgetRutina::class.java)
        .setAction(ACCION_REGISTRAR)
        .putExtra(EXTRA_ACTIVIDAD, id)
        .putExtra(EXTRA_FECHA, fecha)
        .putExtra(EXTRA_VALOR, valor)
      return PendingIntent.getBroadcast(
        c,
        "registrar:$id:$fecha".hashCode(),
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
  }
}
