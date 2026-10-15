package com.jeremiasmas.rutina

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * Las notificaciones del clima: qué ponerte antes de salir y cuándo caminar.
 * Qué dice cada una y cuándo lo decide Avisos; acá se programan.
 *
 * Una sola alarma a la vez, como los recordatorios de Ataraxia: cuando suena
 * baja pronóstico y pasos, muestra lo que toca y programa la próxima. Si
 * cambia el horario o llega un pronóstico nuevo, se reprograma. Las alarmas
 * son inexactas: pueden llegar unos minutos tarde, pero no piden el permiso
 * de alarmas exactas.
 */
object NotificacionesClima {
  const val ACCION_AVISO = "com.jeremiasmas.rutina.CLIMA_AVISO"

  private const val PREFS = "clima_avisos"
  private const val CLAVE_ENVIADOS = "enviados"
  private const val CANAL = "clima"
  private const val CODIGO_ALARMA = 3000

  /** Sin ningún aviso a la vista, vuelve a mirar mañana a esta hora. */
  private const val REPASO = 6 * 60

  private fun prefs(c: Context) = c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** "2026-10-15:ida" de los avisos ya mostrados; los de otros días se tiran. */
  private fun enviados(c: Context): Set<String> {
    val hoy = LocalDate.now(Clima.ZONA)
    val vigentes = setOf(hoy.toString(), hoy.plusDays(1).toString())
    return prefs(c).getStringSet(CLAVE_ENVIADOS, emptySet()).orEmpty()
      .filter { it.substringBefore(':') in vigentes }.toSet()
  }

  private fun marcar(c: Context, claves: Collection<String>) {
    prefs(c).edit().putStringSet(CLAVE_ENVIADOS, enviados(c) + claves).apply()
  }

  private fun alarma(c: Context): PendingIntent = PendingIntent.getBroadcast(
    c,
    CODIGO_ALARMA,
    Intent(c, NotificacionesClimaReceptor::class.java).setAction(ACCION_AVISO),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  /** Programa la alarma del próximo aviso con lo que haya guardado. */
  fun programar(c: Context) {
    val alarmas = c.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val ahora = LocalDateTime.now(Clima.ZONA)
    val fecha = ahora.toLocalDate().toString()
    val horas = Clima.horasGuardadas(c)
    val prox = if (horas.isEmpty()) null else Avisos.proximo(
      horas, Clima.horario(c), fecha, ahora.hour * 60 + ahora.minute, Clima.pasosDeHoy(c), enviados(c),
    )
    val (dia, minuto) = prox ?: (ClimaLogica.sumarDias(fecha, 1) to REPASO)
    val cuando = LocalDate.parse(dia).atStartOfDay(Clima.ZONA).plusMinutes(minuto.toLong())
    alarmas.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando.toInstant().toEpochMilli(), alarma(c))
  }

  /** Muestra lo que toca ahora y lo marca, para no repetirlo. */
  fun mostrarLosQueTocan(c: Context) {
    val ahora = LocalDateTime.now(Clima.ZONA)
    val fecha = ahora.toLocalDate().toString()
    val horas = Clima.horasGuardadas(c)
    if (horas.isEmpty()) return
    val tocan = Avisos.tocan(
      horas, Clima.horario(c), fecha, ahora.hour * 60 + ahora.minute, Clima.pasosDeHoy(c), enviados(c),
    )
    if (tocan.isEmpty()) return
    // Marcados aunque no haya permiso: si no, la alarma volvería enseguida.
    marcar(c, tocan.map { "$fecha:${it.clave}" })
    if (!Recordatorio.permisoDado(c)) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CANAL, "Qué ponerte y cuándo caminar", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val abrir = PendingIntent.getActivity(
      c,
      CODIGO_ALARMA,
      Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    for (aviso in tocan) {
      nm.notify(
        // Uno por clave: el de la vuelta no tapa al de la ida, y al día
        // siguiente el nuevo reemplaza al viejo.
        CODIGO_ALARMA + listOf("ida", "vuelta", "caminata").indexOf(aviso.clave) + 1,
        NotificationCompat.Builder(c, CANAL)
          .setSmallIcon(android.R.drawable.ic_popup_reminder)
          .setContentTitle(aviso.titulo)
          .setContentText(aviso.texto)
          .setContentIntent(abrir)
          .setAutoCancel(true)
          .build(),
      )
    }
  }
}

/**
 * Lo que despierta a las notificaciones: la alarma, la web cuando cambia el
 * horario o baja un pronóstico, y el teléfono al reiniciarse o actualizar la
 * app (que es cuando Android borra las alarmas).
 */
class NotificacionesClimaReceptor : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) {
    when (intent.action) {
      MainActivity.ACCION_CLIMA -> {
        Clima.guardar(c, intent.getStringExtra("horario").orEmpty(), intent.getStringExtra("pronostico").orEmpty())
        NotificacionesClima.programar(c)
      }
      NotificacionesClima.ACCION_AVISO -> {
        val pendiente = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
          try {
            // Pasos y pronóstico frescos antes de decir nada. Con un tope: un
            // Health Connect que no contesta no puede colgar el receptor.
            val pasos = withTimeoutOrNull(8_000L) { Pasos.hoy(c, Pasos.origen(c)) }
            if (pasos != null) Clima.guardarPasos(c, pasos)
            Clima.ponerAlDia(c)
            NotificacionesClima.mostrarLosQueTocan(c)
          } finally {
            NotificacionesClima.programar(c)
            pendiente.finish()
          }
        }
      }
      else -> NotificacionesClima.programar(c)
    }
  }
}
