package com.jeremiasmas.rutina

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * El widget del clima: qué ponerte, si llevar paraguas y cuándo caminar. Tres
 * líneas y nada más.
 *
 * A diferencia de los de Rutina, este sí calcula: con el pronóstico guardado y
 * la hora de ahora arma las líneas con ClimaLogica, la misma lógica de la web.
 * Cada media hora se redibuja (el plan cambia con la hora aunque el pronóstico
 * sea el mismo) y, si pasó una hora, de paso baja uno nuevo.
 */
class WidgetClima : AppWidgetProvider() {

  companion object {
    const val EXTRA_HORARIO = "horario"
    const val EXTRA_PRONOSTICO = "pronostico"

    fun redibujar(c: Context) {
      val manager = AppWidgetManager.getInstance(c)
      val ids = manager.getAppWidgetIds(ComponentName(c, WidgetClima::class.java))
      if (ids.isEmpty()) return
      val vista = construir(c)
      for (id in ids) manager.updateAppWidget(id, vista)
    }

    fun construir(c: Context): RemoteViews {
      val l = Clima.lineas(c)
      val vista = RemoteViews(c.packageName, R.layout.widget_clima)
      vista.setTextViewText(R.id.clima_titulo, l.titulo)
      vista.setTextViewText(R.id.clima_detalle, l.detalle)
      vista.setTextViewText(R.id.clima_caminar, l.caminar)
      vista.setViewVisibility(R.id.clima_caminar, if (l.caminar.isEmpty()) View.GONE else View.VISIBLE)
      vista.setOnClickPendingIntent(R.id.clima_raiz, Widgets.abrirApp(c, null))
      return vista
    }
  }

  override fun onUpdate(c: Context, manager: AppWidgetManager, ids: IntArray) {
    // Primero con lo que hay, así nunca queda en blanco mientras baja.
    val vista = construir(c)
    for (id in ids) manager.updateAppWidget(id, vista)
  }

  override fun onReceive(c: Context, intent: Intent) {
    super.onReceive(c, intent)
    when (intent.action) {
      // La web avisa que cambió el horario o que bajó un pronóstico.
      MainActivity.ACCION_CLIMA -> {
        Clima.guardar(
          c,
          intent.getStringExtra(EXTRA_HORARIO).orEmpty(),
          intent.getStringExtra(EXTRA_PRONOSTICO).orEmpty(),
        )
        redibujar(c)
      }
      AppWidgetManager.ACTION_APPWIDGET_UPDATE -> {
        val pendiente = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
          try {
            if (Clima.ponerAlDia(c)) redibujar(c)
          } finally {
            pendiente.finish()
          }
        }
      }
    }
  }
}
