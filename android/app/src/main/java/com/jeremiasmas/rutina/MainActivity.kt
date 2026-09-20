package com.jeremiasmas.rutina

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
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
  private var elegirArchivoCallback: ValueCallback<Array<Uri>>? = null
  private var origenElegido: String? = null

  /**
   * Un WebView no abre el selector de archivos por su cuenta: si la app no
   * implementa esto, cualquier <input type="file"> de la web no hace nada.
   * Es lo que rompía importar la copia de seguridad y el ZIP de Samsung.
   */
  private val elegirArchivo = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { resultado ->
    val cb = elegirArchivoCallback
    elegirArchivoCallback = null
    // Si se cancela hay que devolver null igual: sin esto el input queda
    // trabado para siempre y no vuelve a abrir nunca más.
    cb?.onReceiveValue(
      WebChromeClient.FileChooserParams.parseResult(resultado.resultCode, resultado.data)
    )
  }

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

    // Desde Android 15 la app se dibuja de punta a punta por defecto, así que
    // sin esto la web queda abajo de la barra de estado y del gesto de inicio.
    // Se descuentan los márgenes del sistema como padding de la vista.
    WindowCompat.getInsetsController(window, web).isAppearanceLightStatusBars = false
    ViewCompat.setOnApplyWindowInsetsListener(web) { vista, insets ->
      val barras = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      vista.setPadding(barras.left, barras.top, barras.right, barras.bottom)
      insets
    }
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.databaseEnabled = true
    web.settings.mediaPlaybackRequiresUserGesture = false
    web.addJavascriptInterface(Puente(), "RutinaNativa")
    web.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(
        vista: WebView?,
        callback: ValueCallback<Array<Uri>>?,
        params: FileChooserParams?,
      ): Boolean {
        elegirArchivoCallback?.onReceiveValue(null)   // cancelar uno anterior
        elegirArchivoCallback = callback
        return try {
          elegirArchivo.launch(intentDeArchivos(params))
          true
        } catch (e: Exception) {
          elegirArchivoCallback = null
          callback?.onReceiveValue(null)
          false
        }
      }
    }

    web.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView?, url: String?) {
        webLista = true
        // La web no tiene que volver a descontar los márgenes: ya los
        // descontamos acá, y sumarlos dos veces deja un hueco enorme arriba.
        view?.evaluateJavascript("document.documentElement.dataset.insets='nativo'", null)
        ultimoEnvio = null   // página nueva: hay que volver a mandarle los pasos
        refrescar()
      }
    }
    origenElegido = getPreferences(MODE_PRIVATE).getString("origen", null)
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
      var origenes: Map<String, Long> = emptyMap()
      val dias = if (estado == Pasos.Estado.LISTO) {
        try {
          origenes = Pasos.porOrigen(this@MainActivity)
          Pasos.porDia(this@MainActivity, origenElegido)
        } catch (e: Exception) {
          emptyMap()
        }
      } else {
        emptyMap()
      }
      val conNombre = origenes.mapKeys { (paquete, _) ->
        "${Pasos.nombreDeApp(paquete)}\u0000$paquete"
      }
      enviar(Pasos.comoJson(estado, dias, diagnostico(estado), conNombre))
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

  /**
   * El intent que abre el selector. Se aceptan todos los tipos, con los que
   * pide la web como pista, en vez de filtrar por MIME: hay proveedores de
   * archivos que no declaran bien el tipo de un .zip o un .csv y los dejan
   * grises, imposibles de elegir. Mejor mostrar todo que esconder el archivo
   * que se busca.
   */
  private fun intentDeArchivos(params: WebChromeClient.FileChooserParams?): Intent {
    val base = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT)
    val tipos = params?.acceptTypes?.filter { it.isNotBlank() && it.contains('/') }
    base.type = "*/*"
    if (!tipos.isNullOrEmpty()) base.putExtra(Intent.EXTRA_MIME_TYPES, tipos.toTypedArray())
    base.addCategory(Intent.CATEGORY_OPENABLE)
    return base
  }

  private fun diagnostico(estado: Pasos.Estado): JSONObject {
    val j = JSONObject()
    j.put("version", BuildConfig.VERSION_NAME)
    j.put("android", Build.VERSION.SDK_INT)
    j.put("telefono", "${Build.MANUFACTURER} ${Build.MODEL}")
    j.put("sdkHealthConnect", HealthConnectClient.getSdkStatus(this))
    j.put("permiso", permisoDado)
    j.put("estado", estado.name.lowercase())
    // El contador del sistema no se usa para el historial —cuenta desde el
    // último reinicio, no por día— pero saber si existe ayuda a diagnosticar.
    val sm = getSystemService(SENSOR_SERVICE) as? SensorManager
    j.put("sensorDePasos", sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
    j.put("origenElegido", origenElegido ?: "")
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

    /**
     * Guarda un archivo en Descargas. La web exporta con un blob y un
     * <a download>, que en un WebView no descarga nada: adentro de la app la
     * copia de seguridad pasa por acá.
     */
    @JavascriptInterface
    fun guardarArchivo(nombre: String, contenido: String): Boolean {
      return try {
        val destino = escribirEnDescargas(nombre, contenido)
        runOnUiThread {
          Toast.makeText(this@MainActivity, "Guardado en $destino", Toast.LENGTH_LONG).show()
        }
        true
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(this@MainActivity, "No se pudo guardar: ${e.message}", Toast.LENGTH_LONG).show()
        }
        false
      }
    }

    /**
     * Contar sólo lo que escribe una app. Con dos fuentes midiendo la misma
     * caminata, el total sale inflado.
     */
    @JavascriptInterface
    fun usarSoloOrigen(paquete: String?) {
      runOnUiThread {
        origenElegido = paquete?.takeIf { it.isNotBlank() }
        getPreferences(MODE_PRIVATE).edit().putString("origen", origenElegido).apply()
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

  /** Escribe en la carpeta de Descargas y devuelve dónde quedó. */
  private fun escribirEnDescargas(nombre: String, contenido: String): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Desde Android 10 se escribe por MediaStore y no hace falta ningún
      // permiso de almacenamiento.
      val valores = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, nombre)
        put(MediaStore.Downloads.MIME_TYPE, "application/json")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val resolver = contentResolver
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores)
        ?: throw IllegalStateException("Descargas no está disponible")
      resolver.openOutputStream(uri).use { it!!.write(contenido.toByteArray()) }
      valores.clear()
      valores.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, valores, null, null)
      return "Descargas/$nombre"
    }
    val carpeta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    carpeta.mkdirs()
    java.io.File(carpeta, nombre).writeText(contenido)
    return "Descargas/$nombre"
  }

  companion object {
    const val WEB = "https://jeremiasmas.github.io/Routine/"
    const val PLAY_HEALTH_CONNECT =
      "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"
  }
}
