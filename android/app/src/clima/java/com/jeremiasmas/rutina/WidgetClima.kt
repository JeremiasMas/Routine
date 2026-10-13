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
import kotlinx.coroutines.withTimeoutOrNull

/**
 * El widget del clima: qué ponerte, si llevar paraguas y cuándo caminar. Dos
 * líneas de texto y nada más.
 *
 * A diferencia de los de Rutina, este sí calcula: con el pronóstico guardado y
 * la hora de ahora arma las líneas con ClimaLogica, la misma lógica de la web.
 * Cada media hora se redibuja (el plan cambia con la hora aunque el pronóstico
 * sea el mismo), lee los pasos de hoy de Health Connect para saber cuánto te
 * falta caminar y, si pasó una hora, baja un pronóstico nuevo.
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
        ponerAlDia(c)
      }
      AppWidgetManager.ACTION_APPWIDGET_UPDATE -> ponerAlDia(c)
    }
  }

  /** Pasos y pronóstico, en segundo plano, y redibuja con lo que haya. */
  private fun ponerAlDia(c: Context) {
    val pendiente = goAsync()
    CoroutineScope(Dispatchers.IO).launch {
      try {
        // Con un tope: un proveedor de Health Connect que no contesta no
        // puede dejar colgado el receptor hasta que Android lo mate.
        val pasos = withTimeoutOrNull(8_000L) { Pasos.hoy(c, Pasos.origen(c)) }
        if (pasos != null) Clima.guardarPasos(c, pasos)
        Clima.ponerAlDia(c)
        redibujar(c)
      } finally {
        pendiente.finish()
      }
    }
  }
}
