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

  /** Qué parte del lado ocupa el trazo cuando hay un solo anillo. */
  private const val GROSOR = 0.17f

  /** Y qué parte de su franja cuando son varios. El resto es el aire entre ellos. */
  private const val PARTE_DE_LA_FRANJA = 0.62f

  /**
   * Qué parte del radio queda libre en el medio.
   *
   * Sin esto, repartir el radio entre seis aros deja al de más adentro con el
   * tamaño de un punto: deja de leerse como un aro. El hueco le saca a todos
   * un poco de grosor y le devuelve al último su forma.
   */
  private const val HUECO = 0.22f

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
   * Anillos concéntricos, el primero por fuera.
   *
   * El radio se reparte en una franja por anillo, así que entran los que sean
   * sin que el de adentro se cierre sobre sí mismo. El trazo nunca pasa del
   * grosor de un anillo solo: si no, con uno quedaría un disco en vez de un aro.
   *
   * @param ladoDp el lado del cuadrado, en dp
   * @param arcos  de afuera hacia adentro
   * @param centro texto en el medio, o null
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
    val medio = lado / 2f
    // El píxel de más es para que el suavizado del borde no quede cortado.
    val radioMax = medio - 1f
    val franja = radioMax * (1f - HUECO) / max(1, arcos.size)
    val grosor = min(franja * PARTE_DE_LA_FRANJA, lado * GROSOR)
    pincel.strokeWidth = grosor

    for ((i, arco) in arcos.withIndex()) {
      val radio = radioMax - franja * i - grosor / 2f
      if (radio <= 0f) break

      pincel.color = arco.color
      pincel.alpha = ALFA_PISTA
      lienzo.drawCircle(medio, medio, radio, pincel)

      val parte = min(1f, max(0f, arco.pct))
      if (parte <= 0f) continue
      pincel.alpha = 255
      val caja = RectF(medio - radio, medio - radio, medio + radio, medio + radio)
      // Arranca arriba y gira como un reloj, que es como se lee un progreso.
      lienzo.drawArc(caja, -90f, parte * 360f, false, pincel)
    }

    if (!centro.isNullOrEmpty()) {
      val texto = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorCentro
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        textSize = lado * if (centro.length > 3) 0.21f else 0.26f
      }
      // baseline, no centro: drawText apoya el texto en la línea de base.
      lienzo.drawText(centro, medio, medio - (texto.descent() + texto.ascent()) / 2f, texto)
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
