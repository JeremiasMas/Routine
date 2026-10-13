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
import java.time.LocalDate
import java.util.Calendar

/**
 * Los recordatorios de Ataraxia, como notificaciones del teléfono.
 *
 * La web no puede avisar con la app cerrada, así que guarda acá cuándo
 * quiere cada aviso y la app lo programa con AlarmManager. Cada alarma es de
 * una sola vez: cuando suena, muestra la notificación y programa la próxima.
 * Así nunca quedan dos programadas del mismo tipo.
 *
 * Las alarmas son inexactas a propósito: pueden llegar unos minutos tarde,
 * pero no necesitan el permiso de alarmas exactas, que Android pide
 * justificar.
 *
 * El código vive en main, pero el receptor sólo se declara en el manifiesto
 * de Ataraxia: en Rutina nada lo llama y nunca se programa nada.
 */
object Recordatorio {

  /**
   * Cada recordatorio con su lugar propio: preferencias, alarma y
   * notificación separadas, así uno nunca pisa al otro. El de peso conserva
   * los nombres de cuando era el único, para no perder lo ya configurado.
   */
  enum class Tipo(
    val clave: String,
    val prefs: String,
    val codigo: Int,
    val notificacion: Int,
    val canal: String,
    val nombreCanal: String,
    val titulo: String,
    val texto: String,
    val diaPorDefecto: Int,
    val horaPorDefecto: Int,
    val minutoPorDefecto: Int,
  ) {
    PESO(
      "peso", "recordatorio_peso", 0, 1001, "recordatorio_peso", "Recordatorio de peso",
      "⚖️ Hoy toca pesarte", "A la mañana y en ayunas, para comparar siempre igual.",
      1, 8, 0,
    ),
    // Diario: el día es -1. Si ese día ya completó el semáforo, no suena.
    SEMAFORO(
      "semaforo", "recordatorio_semaforo", 1, 1002, "recordatorio_semaforo",
      "Recordatorio del semáforo",
      "🚦 ¿Cómo comiste hoy?", "Anotá el semáforo de comidas antes de dormir.",
      -1, 21, 30,
    );

    companion object {
      fun de(clave: String?): Tipo? = values().firstOrNull { it.clave == clave }
    }
  }

  const val ACCION = "com.jeremiasmas.rutina.RECORDATORIO_PESO"
  const val EXTRA_TIPO = "tipo"

  /** `dia` como en JavaScript: 0 = domingo, 1 = lunes; -1 = todos los días. */
  data class Config(val activo: Boolean, val dia: Int, val hora: Int, val minuto: Int)

  private fun prefs(c: Context, tipo: Tipo) =
    c.applicationContext.getSharedPreferences(tipo.prefs, Context.MODE_PRIVATE)

  fun leer(c: Context, tipo: Tipo): Config {
    val p = prefs(c, tipo)
    return Config(
      p.getBoolean("activo", false),
      p.getInt("dia", tipo.diaPorDefecto),
      p.getInt("hora", tipo.horaPorDefecto),
      p.getInt("minuto", tipo.minutoPorDefecto),
    )
  }

  fun guardar(c: Context, tipo: Tipo, config: Config) {
    prefs(c, tipo).edit()
      .putBoolean("activo", config.activo)
      .putInt("dia", if (tipo.diaPorDefecto < 0) -1 else config.dia.coerceIn(0, 6))
      .putInt("hora", config.hora.coerceIn(0, 23))
      .putInt("minuto", config.minuto.coerceIn(0, 59))
      .apply()
    programar(c, tipo)
  }

  /**
   * La web avisa qué día ya hizo lo que el recordatorio pide (por ejemplo,
   * completó el semáforo). Ese día la notificación no suena. Una fecha vacía
   * lo deshace, si después borró algo.
   */
  fun marcarHecho(c: Context, tipo: Tipo, fecha: String) {
    prefs(c, tipo).edit().putString("hecho", fecha).apply()
  }

  private fun hechoHoy(c: Context, tipo: Tipo): Boolean =
    prefs(c, tipo).getString("hecho", "") == LocalDate.now().toString()

  fun permisoDado(c: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(c, android.Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED

  fun comoJson(c: Context, tipo: Tipo): String {
    val config = leer(c, tipo)
    return JSONObject()
      .put("tipo", tipo.clave)
      .put("activo", config.activo)
      .put("dia", config.dia)
      .put("hora", config.hora)
      .put("minuto", config.minuto)
      .put("permiso", permisoDado(c))
      .toString()
  }

  private fun intentDeAlarma(c: Context, tipo: Tipo): PendingIntent = PendingIntent.getBroadcast(
    c,
    tipo.codigo,
    Intent(c, RecordatorioReceptor::class.java)
      .setAction(ACCION)
      .putExtra(EXTRA_TIPO, tipo.clave),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  /**
   * Programa la próxima, o la cancela si el recordatorio está apagado.
   * `desde` deja correr el reloj: recién sonada la de hoy, se busca la
   * próxima a partir de un rato después, para no volver a programar la misma.
   */
  fun programar(c: Context, tipo: Tipo, desde: Long = System.currentTimeMillis()) {
    val alarmas = c.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = intentDeAlarma(c, tipo)
    alarmas.cancel(pi)
    val config = leer(c, tipo)
    if (!config.activo) return
    alarmas.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, proxima(desde, config), pi)
  }

  fun programarTodos(c: Context) {
    Tipo.values().forEach { programar(c, it) }
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
    if (config.dia < 0) {
      // Todos los días: hoy si todavía no pasó la hora, si no mañana.
      if (cal.timeInMillis <= ahora) cal.add(Calendar.DAY_OF_YEAR, 1)
      return cal.timeInMillis
    }
    // Calendar cuenta los días desde el domingo = 1; JavaScript desde el 0.
    val objetivo = config.dia + 1
    var dias = (objetivo - cal.get(Calendar.DAY_OF_WEEK) + 7) % 7
    if (dias == 0 && cal.timeInMillis <= ahora) dias = 7
    cal.add(Calendar.DAY_OF_YEAR, dias)
    return cal.timeInMillis
  }

  fun mostrar(c: Context, tipo: Tipo) {
    if (!permisoDado(c) || hechoHoy(c, tipo)) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(tipo.canal, tipo.nombreCanal, NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val abrir = PendingIntent.getActivity(
      c,
      tipo.codigo,
      Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val aviso = NotificationCompat.Builder(c, tipo.canal)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(tipo.titulo)
      .setContentText(tipo.texto)
      .setContentIntent(abrir)
      .setAutoCancel(true)
      .build()
    nm.notify(tipo.notificacion, aviso)
  }
}

/**
 * Suena una alarma: muestra su aviso y programa el próximo. También se
 * despierta al reiniciar el teléfono o actualizar la app, que es cuando
 * Android borra las alarmas programadas, y entonces las vuelve a poner todas.
 */
class RecordatorioReceptor : BroadcastReceiver() {
  override fun onReceive(c: Context, intent: Intent) {
    if (intent.action == Recordatorio.ACCION) {
      // Las alarmas de antes de que hubiera varios tipos no traen el extra.
      val tipo = Recordatorio.Tipo.de(intent.getStringExtra(Recordatorio.EXTRA_TIPO))
        ?: Recordatorio.Tipo.PESO
      Recordatorio.mostrar(c, tipo)
      Recordatorio.programar(c, tipo, System.currentTimeMillis() + 60 * 60 * 1000L)
    } else {
      Recordatorio.programarTodos(c)
    }
  }
}
