package com.jeremiasmas.rutina

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
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
  suspend fun porDia(context: Context): Map<String, Long> {
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
    )
    val salida = LinkedHashMap<String, Long>()
    for (tramo in cliente.aggregateGroupByPeriod(pedido)) {
      val total = tramo.result[StepsRecord.COUNT_TOTAL] ?: continue
      if (total > 0) salida[tramo.startTime.toLocalDate().toString()] = total
    }
    return salida
  }

  /** Lo que la app le manda a la web. */
  fun comoJson(estado: Estado, dias: Map<String, Long>, extra: JSONObject? = null): String {
    val json = JSONObject()
    json.put("estado", estado.name.lowercase())
    json.put("fuente", "health-connect")
    json.put("dias", JSONObject().also { d -> dias.forEach { (k, v) -> d.put(k, v) } })
    if (extra != null) json.put("diagnostico", extra)
    return json.toString()
  }
}
