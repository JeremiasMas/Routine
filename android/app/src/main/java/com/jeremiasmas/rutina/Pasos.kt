package com.jeremiasmas.rutina

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period

/**
 * Los pasos salen de Health Connect, que es por donde Samsung Health los
 * comparte. La ventaja sobre contarlos por nuestra cuenta es doble: es el
 * mismo número que ves en Samsung Health, y ya viene resuelto el problema de
 * tener reloj y teléfono contando lo mismo (Health Connect lo deduplica).
 */
object Pasos {

  val PERMISO: String = HealthPermission.getReadPermission(StepsRecord::class)

  /** Cuántos días para atrás se traen. Alcanza para tapar cualquier hueco. */
  const val DIAS = 30

  enum class Estado { LISTO, SIN_PERMISO, SIN_HEALTH_CONNECT, HAY_QUE_ACTUALIZAR }

  fun estado(context: Context, permisoDado: Boolean): Estado = when {
    HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_UNAVAILABLE ->
      Estado.SIN_HEALTH_CONNECT
    HealthConnectClient.getSdkStatus(context) ==
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> Estado.HAY_QUE_ACTUALIZAR
    !permisoDado -> Estado.SIN_PERMISO
    else -> Estado.LISTO
  }

  suspend fun permisoDado(context: Context): Boolean {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return false
    return try {
      HealthConnectClient.getOrCreate(context)
        .permissionController.getGrantedPermissions().contains(PERMISO)
    } catch (e: Exception) {
      false
    }
  }

  /**
   * Total por día de los últimos [DIAS] días, como {"2026-09-20": 9430, ...}.
   * Se pide agregado por período y no registro por registro: así el total del
   * día lo calcula Health Connect, que sabe qué registros se pisan entre sí.
   */
  /**
   * Qué aplicaciones escribieron pasos hoy, y cuánto puso cada una.
   *
   * Health Connect suma lo que escriben todas las apps. Si además de Samsung
   * Health hay otra midiendo lo mismo, el total sale más alto que el que ves
   * en Samsung Health, y la diferencia no se explica sola. Esto la explica.
   */
  suspend fun porOrigen(context: Context): Map<String, Long> {
    val cliente = HealthConnectClient.getOrCreate(context)
    val hoy = LocalDate.now()
    val rango = TimeRangeFilter.between(hoy.atStartOfDay(), LocalDateTime.now())
    val paquetes = cliente.readRecords(
      ReadRecordsRequest(recordType = StepsRecord::class, timeRangeFilter = rango)
    ).records.map { it.metadata.dataOrigin.packageName }.filter { it.isNotBlank() }.toSet()

    val salida = LinkedHashMap<String, Long>()
    for (paquete in paquetes) {
      val total = cliente.aggregate(
        AggregateRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = rango,
          dataOriginFilter = setOf(DataOrigin(paquete)),
        )
      )[StepsRecord.COUNT_TOTAL] ?: continue
      salida[paquete] = total
    }
    return salida
  }

  /**
   * Total por día. Si hay una app elegida se cuenta sólo esa: con dos fuentes
   * midiendo la misma caminata, sumarlas cuenta los pasos dos veces.
   */
  suspend fun porDia(context: Context, soloDe: String? = null): Map<String, Long> {
    val cliente = HealthConnectClient.getOrCreate(context)
    val hoy = LocalDate.now()
    val desde = hoy.minusDays((DIAS - 1).toLong())
    val pedido = AggregateGroupByPeriodRequest(
      metrics = setOf(StepsRecord.COUNT_TOTAL),
      timeRangeFilter = TimeRangeFilter.between(
        desde.atStartOfDay(),
        LocalDateTime.now(),
      ),
      timeRangeSlicer = Period.ofDays(1),
      dataOriginFilter = if (soloDe.isNullOrBlank()) emptySet() else setOf(DataOrigin(soloDe)),
    )
    val salida = LinkedHashMap<String, Long>()
    for (tramo in cliente.aggregateGroupByPeriod(pedido)) {
      val total = tramo.result[StepsRecord.COUNT_TOTAL] ?: continue
      if (total > 0) salida[tramo.startTime.toLocalDate().toString()] = total
    }
    return salida
  }

  /** Lo que la app le manda a la web. */
  fun comoJson(
    estado: Estado,
    dias: Map<String, Long>,
    extra: JSONObject? = null,
    origenes: Map<String, Long> = emptyMap(),
  ): String {
    val json = JSONObject()
    json.put("estado", estado.name.lowercase())
    json.put("fuente", "health-connect")
    json.put("dias", JSONObject().also { d -> dias.forEach { (k, v) -> d.put(k, v) } })
    json.put(
      "origenes",
      JSONArray().also { arr ->
        origenes.entries.sortedByDescending { it.value }.forEach { (paquete, total) ->
          arr.put(JSONObject().put("paquete", paquete).put("pasos", total))
        }
      },
    )
    if (extra != null) json.put("diagnostico", extra)
    return json.toString()
  }

  /** Nombre legible de las apps que suelen escribir pasos. */
  fun nombreDeApp(paquete: String): String = when {
    paquete == "com.sec.android.app.shealth" -> "Samsung Health"
    paquete == "com.google.android.apps.fitness" -> "Google Fit"
    paquete == "com.google.android.apps.healthdata" -> "Health Connect"
    paquete == "com.jeremiasmas.rutina" -> "Esta app"
    paquete.startsWith("com.fitbit") -> "Fitbit"
    paquete.startsWith("com.samsung.android.wear") -> "Reloj Samsung"
    // El contador del propio teléfono viene con un hash pegado al final.
    paquete.startsWith("com.android.healthconnect.phone") -> "Contador del teléfono"
    else -> paquete
  }
}
