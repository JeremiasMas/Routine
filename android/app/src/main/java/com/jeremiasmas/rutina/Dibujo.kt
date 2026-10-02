package com.jeremiasmas.rutina

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import kotlin.math.max
import kotlin.math.min

/**
 * Anillos y barras para los widgets.
 *
 * Un widget no dibuja: RemoteViews sólo sabe poner texto, visibilidad y
 * colores en vistas que ya existen, y no hay ninguna que haga un arco. Así
 * que el anillo se pinta acá en un Bitmap y se manda con setImageViewBitmap.
 *
 * Todo entra en dp y sale en píxeles de esta pantalla: un tamaño fijo en px
 * se vería diminuto en un teléfono denso y gigante en uno viejo.
 */
object Dibujo {

  /** Un arco del anillo: cuánto va cumplido y de qué color. */
  data class Arco(val pct: Float, val color: Int)

  /** Lo que queda del anillo sin cumplir, en el mismo color pero apagado. */
  private const val ALFA_PISTA = 46

  /** Qué parte del radio ocupa el trazo. Más fino se pierde de lejos. */
  private const val GROSOR = 0.17f

  /** Cuánto se separa un anillo del de adentro. */
  private const val SEPARACION = 1.55f

  private fun px(c: Context, dp: Float) = dp * c.resources.displayMetrics.density

  /** Un color de la web ("#38bdf8") o el de respaldo si viene cualquier cosa. */
  fun color(crudo: String?, respaldo: Int): Int {
    val texto = crudo?.trim().orEmpty()
    if (!texto.startsWith("#")) return respaldo
    return try {
      Color.parseColor(texto)
    } catch (e: IllegalArgumentException) {
      respaldo
    }
  }

  /**
   * El mismo color, un poco más claro.
   *
   * En los temas cálidos toda la paleta es roja y naranja: tres anillos
   * concéntricos con los colores tal cual quedarían indistinguibles. Aclarar
   * cada uno un escalón los separa sin perder de qué disciplina es cada cual,
   * y sobre un fondo negro aclarar se ve mejor que oscurecer.
   *
   * @param parte de 0 (igual) a 1 (blanco)
   */
  fun aclarar(color: Int, parte: Float): Int {
    val p = min(1f, max(0f, parte))
    val mezcla = { canal: Int -> (canal + (255 - canal) * p).toInt().coerceIn(0, 255) }
    return Color.argb(Color.alpha(color), mezcla(Color.red(color)), mezcla(Color.green(color)), mezcla(Color.blue(color)))
  }

  /**
   * Uno o varios anillos concéntricos, el primero por fuera.
   *
   * @param ladoDp el lado del cuadrado, en dp
   * @param arcos  de afuera hacia adentro
   * @param centro texto en el medio, o null
   * @param colorCentro color de ese texto
   */
  fun anillos(
    c: Context,
    ladoDp: Float,
    arcos: List<Arco>,
    centro: String? = null,
    colorCentro: Int = Color.WHITE,
  ): Bitmap {
    val lado = max(1f, px(c, ladoDp))
    val bitmap = Bitmap.createBitmap(lado.toInt(), lado.toInt(), Bitmap.Config.ARGB_8888)
    val lienzo = Canvas(bitmap)

    val pincel = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
    }

    // Con varios anillos cada trazo tiene que ser más fino para que entren los
    // tres sin comerse el agujero del medio.
    val grosor = lado * GROSOR / if (arcos.size > 1) 1.9f else 1f
    pincel.strokeWidth = grosor
    val centroXY = lado / 2f

    for ((i, arco) in arcos.withIndex()) {
      // Cada anillo hacia adentro: el grosor propio más un respiro. El píxel
      // de más es para que el suavizado del borde no quede cortado.
      val radio = centroXY - grosor / 2f - 1f - i * grosor * SEPARACION
      if (radio <= grosor) break
      val caja = RectF(centroXY - radio, centroXY - radio, centroXY + radio, centroXY + radio)

      pincel.color = arco.color
      pincel.alpha = ALFA_PISTA
      lienzo.drawCircle(centroXY, centroXY, radio, pincel)

      val pct = min(1f, max(0f, arco.pct))
      if (pct <= 0f) continue
      pincel.color = arco.color
      pincel.alpha = 255
      // Arranca arriba y gira como un reloj, que es como se lee un progreso.
      lienzo.drawArc(caja, -90f, pct * 360f, false, pincel)
    }

    if (!centro.isNullOrEmpty()) {
      val texto = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorCentro
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        textSize = lado * if (centro.length > 3) 0.21f else 0.26f
      }
      // baseline, no centro: drawText apoya el texto en la línea de base.
      val alto = (texto.descent() + texto.ascent()) / 2f
      lienzo.drawText(centro, centroXY, centroXY - alto, texto)
    }
    return bitmap
  }

  /** Una barra redondeada que se llena de izquierda a derecha. */
  fun barra(c: Context, anchoDp: Float, altoDp: Float, pct: Float, colorRelleno: Int): Bitmap {
    val ancho = max(1f, px(c, anchoDp))
    val alto = max(1f, px(c, altoDp))
    val bitmap = Bitmap.createBitmap(ancho.toInt(), alto.toInt(), Bitmap.Config.ARGB_8888)
    val lienzo = Canvas(bitmap)
    val radio = alto / 2f

    val pincel = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colorRelleno }
    pincel.alpha = ALFA_PISTA
    lienzo.drawRoundRect(RectF(0f, 0f, ancho, alto), radio, radio, pincel)

    val parte = min(1f, max(0f, pct))
    if (parte > 0f) {
      pincel.alpha = 255
      // Nunca más angosto que un círculo: con 2% quedaría una astilla.
      val hasta = max(alto, ancho * parte)
      lienzo.drawRoundRect(RectF(0f, 0f, hasta, alto), radio, radio, pincel)
    }
    return bitmap
  }
}
