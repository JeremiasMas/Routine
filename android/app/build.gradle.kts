plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.jeremiasmas.rutina"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.jeremiasmas.rutina"
    minSdk = 26
    targetSdk = 35
    // CI los pisa con el número de build, así se sabe qué versión tenés.
    versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
    versionName = (project.findProperty("versionName") as String?) ?: "1.0-local"
  }

  buildFeatures {
    buildConfig = true
  }

  /**
   * La clave con la que se firma, versionada a propósito.
   *
   * Para Android la firma ES la identidad de la app: una actualización tiene
   * que venir firmada con la misma clave que la instalada, o el instalador
   * corta con INSTALL_FAILED_UPDATE_INCOMPATIBLE —en pantalla, el genérico
   * "La app no se instaló"— y hay que desinstalar antes.
   *
   * Sin esto Gradle usaba ~/.android/debug.keystore, que en un runner de CI no
   * existe y se crea en el momento. Los parámetros son siempre los mismos pero
   * la clave es aleatoria, así que cada build salía firmado por una identidad
   * distinta y ninguno podía actualizar a ninguno. Desinstalar borra el
   * localStorage del WebView, o sea el historial entero: la molestia era lo
   * de menos.
   *
   * La contraseña es la de debug de toda la vida y está a la vista. No es un
   * secreto: esta app no se publica en ninguna tienda, y lo único que la clave
   * decide es qué APK puede actualizar a cuál en este teléfono.
   */
  signingConfigs {
    getByName("debug") {
      storeFile = file("debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    // Se instala de costado, no por Play Store: el APK de debug alcanza. Lo
    // firma la clave de acá arriba, que es siempre la misma.
    getByName("debug") {
      isMinifyEnabled = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
}

/**
 * Una copia de la web adentro del APK.
 *
 * La app carga la web de GitHub Pages para actualizarse sola, pero sin
 * conexión esa carga falla y el WebView muestra su pantalla de error: el
 * service worker no llega a intervenir en la navegación principal. Esta copia
 * es el respaldo, y se sirve en el mismo origen para no perder el
 * localStorage, que es donde viven todos los datos.
 */
val copiarWeb = tasks.register<Copy>("copiarWeb") {
  val raiz = rootProject.projectDir.parentFile
  from(raiz) {
    include("index.html", "manifest.webmanifest", "sw.js")
    include("css/**", "js/**", "icons/**")
  }
  into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.named("preBuild") { dependsOn(copiarWeb) }

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  // WebViewAssetLoader: sirve los archivos del APK bajo el mismo dominio que
  // la web, así el origen no cambia y los datos siguen siendo los mismos.
  implementation("androidx.webkit:webkit:1.12.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.3")
  // Health Connect: por acá Samsung Health comparte los pasos.
  implementation("androidx.health.connect:connect-client:1.1.0-alpha07")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
