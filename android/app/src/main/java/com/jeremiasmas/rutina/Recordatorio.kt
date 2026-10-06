package com.jeremiasmas.rutina

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Calendar

/**
 * El recordatorio semanal para pesarse, como notificación del teléfono.
 *
 * La web no puede avisar con la app cerrada, así que guarda acá cuándo
 * quiere el aviso y la app lo programa con AlarmManager. La alarma es de una
 * sola vez: cuando suena, muestra la notificación y programa la de la semana
 * siguiente. Así nunca quedan dos programadas.
 *
 * La alarma es inexacta a propósito: puede llegar unos minutos tarde, pero no
 * necesita el permiso de alarmas exactas, que Android pide justificar.
 *
 * El código vive en main, pero el receptor sólo se declara en el manifiesto
 * de Ataraxia: en Rutina nada lo llama y nunca se programa nada.
 */
object Recordatorio {

  private const val PREFS = "recordatorio_peso"
  const val CANAL = "recordatorio_peso"
  private const val ID_NOTIFICACION = 1001
  const val ACCION = "com.jeremiasmas.rutina.RECORDATORIO_PESO"

  data class Config(val activo: Boolean, val dia: Int, val hora: Int, val minuto: Int)

  private fun prefs(c: Context) =
    c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun leer(c: Context): Config {
    val p = prefs(c)
    return Config(
      p.getBoolean("activo", false),
      p.getInt("dia", 1),
      p.getInt("hora", 8),
      p.getInt("minuto", 0),
    )
  }

  /** `dia` como en JavaScript: 0 = domingo, 1 = lunes. */
  fun guardar(c: Context, config: Config) {
    prefs(c).edit()
      .putBoolean("activo", config.activo)
      .putInt("dia", config.dia.coerceIn(0, 6))
      .putInt("hora", config.hora.coerceIn(0, 23))
      .putInt("minuto", config.minuto.coerceIn(0, 59))
      .apply()
    programar(c)
  }

  fun permisoDado(c: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(c, android.Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED

  fun comoJson(c: Context): String {
    val config = leer(c)
    return JSONObject()
      .put("activo", config.activo)
      .put("dia", config.dia)
      .put("hora", config.hora)
      .put("minuto", config.minuto)
      .put("permiso", permisoDado(c))
      .toString()
  }

  private fun intentDeAlarma(c: Context): PendingIntent = PendingIntent.getBroadcast(
    c,
    0,
    Intent(c, RecordatorioReceptor::class.java).setAction(ACCION),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  /**
   * Programa la próxima, o la cancela si el recordatorio está apagado.
   * `desde` deja correr el reloj: recién sonada la de hoy, se busca la
   * próxima a partir de un rato después, para no volver a programar la misma.
   */
  fun programar(c: Context, desde: Long = System.currentTimeMillis()) {
    val alarmas = c.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = intentDeAlarma(c)
    alarmas.cancel(pi)
    val config = leer(c)
    if (!config.activo) return
    alarmas.setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      proxima(desde, config),
      pi,
    )
  }

  /** El próximo momento que cae en ese día y esa hora, siempre en el futuro. */
  fun proxima(ahora: Long, config: Config): Long {
    val cal = Calendar.getInstance().apply {
      timeInMillis = ahora
      set(Calendar.HOUR_OF_DAY, config.hora)
      set(Calendar.MINUTE, config.minuto)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    // Calendar cuenta los días desde el domingo = 1; JavaScript desde el 0.
    val objetivo = config.dia + 1
    var dias = (objetivo - cal.get(Calendar.DAY_OF_WEEK) + 7) % 7
    if (dias == 0 && cal.timeInMillis <= ahora) dias = 7
    cal.add(Calendar.DAY_OF_YEAR, dias)
    return cal.timeInMillis
  }

  fun mostrar(c: Context) {
    if (!permisoDado(c)) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CANAL, "Recordatorio de peso", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val abrir = PendingIntent.getActivity(
      c,
      0,
      Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val aviso = NotificationCompat.Builder(c, CANAL)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle("⚖️ Hoy toca pesarte")
      .setContentText("A la mañana y en ayunas, para comparar siempre igual.")
      .setContentIntent(abrir)
      .setAutoCancel(true)
      .build()
    nm.notify(ID_NOTIFICACION, aviso)
  }
}

/**
 * Suena la alarma: muestra el aviso y programa el de la semana que viene.
 * También se despierta al reiniciar el teléfono o actualizar la app, que es
 * cuando Android borra las alarmas programadas.
 */
class RecordatorioReceptor : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) {
    if (intent.action == Recordatorio.ACCION) {
      Recordatorio.mostrar(c)
      Recordatorio.programar(c, System.currentTimeMillis() + 60 * 60 * 1000L)
    } else {
      Recordatorio.programar(c)
    }
  }
}
