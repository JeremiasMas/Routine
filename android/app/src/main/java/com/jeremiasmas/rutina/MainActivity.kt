package com.jeremiasmas.rutina

import android.annotation.SuppressLint
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * La app es la misma web de siempre metida en un WebView, más un puente que
 * le pasa los pasos que el navegador no puede leer solo.
 *
 * La web se carga de GitHub Pages en vez de venir empaquetada: así cada vez
 * que se actualiza la app web, esta app se actualiza sola. El service worker
 * de la web se encarga de que siga andando sin conexión.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var web: WebView
  private var permisoDado = false
  private var webLista = false
  private var ultimoEnvio: String? = null

  private val pedirPermiso = registerForActivityResult(
    PermissionController.createRequestPermissionResultContract()
  ) { concedidos ->
    permisoDado = concedidos.contains(Pasos.PERMISO)
    refrescar()
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    web = WebView(this)
    setContentView(web)
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.databaseEnabled = true
    web.settings.mediaPlaybackRequiresUserGesture = false
    web.addJavascriptInterface(Puente(), "RutinaNativa")
    web.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView?, url: String?) {
        webLista = true
        ultimoEnvio = null   // página nueva: hay que volver a mandarle los pasos
        refrescar()
      }
    }
    web.loadUrl(WEB)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (web.canGoBack()) web.goBack() else finish()
      }
    })
  }

  override fun onResume() {
    super.onResume()
    // Cada vez que volvés a la app se vuelven a leer los pasos: el conteo lo
    // hace el sistema todo el día, nosotros sólo lo venimos a buscar.
    refrescar()
  }

  private fun refrescar() {
    lifecycleScope.launch {
      permisoDado = Pasos.permisoDado(this@MainActivity)
      val estado = Pasos.estado(this@MainActivity, permisoDado)
      val dias = if (estado == Pasos.Estado.LISTO) {
        try {
          Pasos.porDia(this@MainActivity)
        } catch (e: Exception) {
          emptyMap()
        }
      } else {
        emptyMap()
      }
      enviar(Pasos.comoJson(estado, dias, diagnostico(estado)))
    }
  }

  /** Le pasa los pasos a la web, salvo que sean los mismos de la última vez. */
  private fun enviar(json: String) {
    if (!webLista || json == ultimoEnvio) return
    ultimoEnvio = json
    web.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('rutina-pasos',{detail:$json}))", null
    )
  }

  private fun diagnostico(estado: Pasos.Estado): JSONObject {
    val j = JSONObject()
    j.put("android", Build.VERSION.SDK_INT)
    j.put("telefono", "${Build.MANUFACTURER} ${Build.MODEL}")
    j.put("sdkHealthConnect", HealthConnectClient.getSdkStatus(this))
    j.put("permiso", permisoDado)
    j.put("estado", estado.name.lowercase())
    // El contador del sistema no se usa para el historial —cuenta desde el
    // último reinicio, no por día— pero saber si existe ayuda a diagnosticar.
    val sm = getSystemService(SENSOR_SERVICE) as? SensorManager
    j.put("sensorDePasos", sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
    return j
  }

  /** Lo que la web puede llamar. */
  inner class Puente {

    @JavascriptInterface
    fun disponible(): Boolean = true

    /** Abre la pantalla donde Health Connect pide el permiso de lectura. */
    @JavascriptInterface
    fun pedirPermiso() {
      runOnUiThread {
        if (HealthConnectClient.getSdkStatus(this@MainActivity) ==
          HealthConnectClient.SDK_AVAILABLE
        ) {
          pedirPermiso.launch(setOf(Pasos.PERMISO))
        } else {
          instalarHealthConnect()
        }
      }
    }

    /** Vuelve a leer, por si acabás de caminar y querés verlo ya. */
    @JavascriptInterface
    fun refrescar() {
      runOnUiThread {
        ultimoEnvio = null
        this@MainActivity.refrescar()
      }
    }

    @JavascriptInterface
    fun instalarHealthConnect() {
      runOnUiThread {
        try {
          startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_HEALTH_CONNECT))
              .setPackage("com.android.vending")
          )
        } catch (e: Exception) {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_HEALTH_CONNECT)))
        }
      }
    }
  }

  companion object {
    const val WEB = "https://jeremiasmas.github.io/Routine/"
    const val PLAY_HEALTH_CONNECT =
      "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"
  }
}
