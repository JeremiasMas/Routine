package com.jeremiasmas.rutina

import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

/**
 * El widget grande: las misiones de hoy en lista y cómo va el día.
 *
 * No calcula nada. Dibuja el resumen que la web dejó en Resumen, porque acá no
 * hay WebView ni acceso al localStorage. Si nunca abriste la app, lo dice en
 * vez de mostrar ceros que parecerían datos.
 *
 * Tocar una misión abre la app en esa actividad. Las que se pueden dar por
 * cumplidas con un valor obvio —minutos, mililitros— traen además un botón que
 * las encola sin abrir nada; la web las aplica cuando volvés.
 *
 * Lo compartido con los widgets chicos —el estado del día, los PendingIntent,
 * refrescarlos a todos— vive en Widgets.
 */
class WidgetRutina : WidgetCompacto() {

  companion object {
    /** Cuántas filas entran antes de resumir el resto en una línea. */
    private const val MAX_FILAS = 6
  }

  override fun construir(c: Context, opciones: Bundle?): RemoteViews {
    val vista = RemoteViews(c.packageName, R.layout.widget)
    vista.removeAllViews(R.id.widget_filas)
    vista.setOnClickPendingIntent(R.id.widget_cabecera, Widgets.abrirApp(c, null))

    val estado = Widgets.estado(c)
    if (estado !is Widgets.Estado.Hoy) {
      val viejo = estado is Widgets.Estado.Viejo
      vista.setTextViewText(
        R.id.widget_titulo,
        c.getString(if (viejo) R.string.widget_viejo_titulo else R.string.widget_vacio_titulo),
      )
      vista.setTextViewText(
        R.id.widget_detalle,
        c.getString(if (viejo) R.string.widget_viejo_detalle else R.string.widget_vacio_detalle),
      )
      vista.setViewVisibility(R.id.widget_filas, View.GONE)
      return vista
    }

    vista.setViewVisibility(R.id.widget_filas, View.VISIBLE)
    val resumen = estado.resumen
    val fecha = estado.fecha
    val hechas = resumen.optInt("hechas")
    val total = resumen.optInt("total")
    val encoladas = Resumen.encoladasDe(c, fecha)

    vista.setTextViewText(
      R.id.widget_titulo,
      if (resumen.optBoolean("perfecto")) c.getString(R.string.widget_perfecto)
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

    val misiones = Widgets.misiones(resumen)
    var puestas = 0
    for (m in misiones) {
      if (puestas >= MAX_FILAS) break
      vista.addView(R.id.widget_filas, fila(c, m, fecha, encoladas))
      puestas += 1
    }
    if (misiones.size > puestas) {
      val resto = RemoteViews(c.packageName, R.layout.widget_mas)
      resto.setTextViewText(R.id.fila_mas, c.getString(R.string.widget_mas, misiones.size - puestas))
      resto.setOnClickPendingIntent(R.id.fila_mas, Widgets.abrirApp(c, null))
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
        hecho -> color(c, R.color.widget_ok)
        encolada -> color(c, R.color.widget_pendiente)
        else -> color(c, R.color.widget_suave)
      },
    )
    fila.setOnClickPendingIntent(R.id.fila_cuerpo, Widgets.abrirApp(c, id))

    // El botón de un toque sólo aparece donde cumplir es un número único y
    // sin ambigüedad. En el gimnasio no existe un valor obvio, y ofrecerlo
    // sería inventar el dato.
    val valor = m.optDouble("unToque", 0.0)
    if (!hecho && !encolada && valor > 0) {
      fila.setViewVisibility(R.id.fila_boton, View.VISIBLE)
      fila.setOnClickPendingIntent(
        R.id.fila_boton,
        Widgets.registrar(c, WidgetRutina::class.java, id, fecha, valor),
      )
    } else {
      fila.setViewVisibility(R.id.fila_boton, View.GONE)
    }
    return fila
  }
}
