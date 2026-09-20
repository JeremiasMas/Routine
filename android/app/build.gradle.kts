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

  buildTypes {
    // Se instala de costado, no por Play Store: el APK de debug alcanza y se
    // firma solo, sin tener que manejar un keystore.
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

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.3")
  // Health Connect: por acá Samsung Health comparte los pasos.
  implementation("androidx.health.connect:connect-client:1.1.0-alpha07")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
