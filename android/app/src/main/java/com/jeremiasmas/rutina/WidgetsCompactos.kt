package com.jeremiasmas.rutina

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.max
import kotlin.math.min

/**
 * Lo que todos los widgets comparten.
 *
 * Ninguno calcula nada: dibujan el resumen que la web deja escrito en Resumen,
 * porque acá no hay WebView ni acceso al localStorage. Lo que cambia entre uno
 * y otro es qué parte de ese resumen se mira y cómo se muestra.
 */
object Widgets {

  const val ACCION_REGISTRAR = "com.jeremiasmas.rutina.REGISTRAR"
  const val EXTRA_ACTIVIDAD = "actividad"
  const val EXTRA_FECHA = "fecha"
  const val EXTRA_VALOR = "valor"

  /** Lo apagado que se ve un ícono de una misión que todavía falta. */
  const val ALFA_PENDIENTE = 0.32f

  /** Qué hay para mostrar hoy. */
  sealed class Estado {
    /** Nunca abriste la app: no hay nada, y decirlo es mejor que mostrar ceros. */
    object SinDatos : Estado()

    /**
     * El resumen quedó de ayer. A medianoche nadie lo actualiza hasta que
     * abras la app, y mostrar las misiones de ayer como las de hoy haría creer
     * que ya cumpliste cosas que no empezaste.
     */
    object Viejo : Estado()

    data class Hoy(val resumen: JSONObject, val fecha: String) : Estado()
  }

  fun estado(c: Context): Estado {
    val resumen = Resumen.leer(c) ?: return Estado.SinDatos
    val fecha = resumen.optString("fecha")
    if (fecha != LocalDate.now().toString()) return Estado.Viejo
    return Estado.Hoy(resumen, fecha)
  }

  /** Las misiones tal como vienen: lo que falta primero. */
  fun misiones(resumen: JSONObject): List<JSONObject> {
    val lista = resumen.optJSONArray("misiones") ?: return emptyList()
    return (0 until lista.length()).mapNotNull { lista.optJSONObject(it) }
  }

  /**
   * Las mismas, en el orden fijo del día. Un widget que le da un anillo o una
   * posición a cada disciplina no puede reordenarlas al ir cumpliendo: el
   * ícono tiene que estar siempre en el mismo lugar.
   */
  fun misionesEnOrden(resumen: JSONObject): List<JSONObject> =
    misiones(resumen).sortedBy { it.optInt("orden", 0) }

  /** Abre la app, opcionalmente derecho en una actividad. */
  fun abrirApp(c: Context, actividadId: String?): PendingIntent {
    val intent = Intent(c, MainActivity::class.java)
      .setAction(Intent.ACTION_MAIN)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    if (!actividadId.isNullOrEmpty()) {
      intent.putExtra(MainActivity.EXTRA_RUTA, "#/actividad/$actividadId")
    }
    return PendingIntent.getActivity(
      c,
      ("abrir:" + (actividadId ?: "")).hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /**
   * Encola la meta del día sin abrir nada. Vuelve al mismo widget que lo pidió,
   * que es el que tiene el receiver declarado para esta acción.
   */
  fun registrar(c: Context, destino: Class<*>, id: String, fecha: String, valor: Double): PendingIntent {
    val intent = Intent(c, destino)
      .setAction(ACCION_REGISTRAR)
      .putExtra(EXTRA_ACTIVIDAD, id)
      .putExtra(EXTRA_FECHA, fecha)
      .putExtra(EXTRA_VALOR, valor)
    return PendingIntent.getBroadcast(
      c,
      "registrar:${destino.simpleName}:$id:$fecha".hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /** Lo que dejó anotado un botón de un toque. La web decide si corresponde. */
  fun encolarDesdeIntent(c: Context, intent: Intent) {
    val actividad = intent.getStringExtra(EXTRA_ACTIVIDAD).orEmpty()
    val fecha = intent.getStringExtra(EXTRA_FECHA).orEmpty()
    val valor = intent.getDoubleExtra(EXTRA_VALOR, 0.0)
    if (actividad.isNotEmpty() && fecha.isNotEmpty() && valor > 0) {
      Resumen.encolar(c, actividad, fecha, valor)
    }
  }

  /**
   * Todos los widgets que existen. Se pueden poner varios a la vez, así que
   * cuando algo cambia hay que redibujarlos todos: el que no se actualiza
   * queda mostrando lo de antes sin que nada falle.
   */
  private fun proveedores(): List<WidgetCompacto> = listOf(
    WidgetRutina(), WidgetAnillo(), WidgetAnillos(), WidgetTira(), WidgetFoco(), WidgetBarra(),
  )

  fun refrescarTodos(c: Context) {
    for (w in proveedores()) w.redibujar(c)
  }

  /** El ancho y el alto que el lanzador le dio a este widget, en dp. */
  fun anchoDp(opciones: Bundle?): Int =
    opciones?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0

  fun altoDp(opciones: Bundle?): Int =
    opciones?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
}

/**
 * El andamiaje repetido de un widget: dibujarse al actualizarse, al cambiar de
 * tamaño y cuando la app avisa que algo cambió.
 */
abstract class WidgetCompacto : AppWidgetProvider() {

  /** El dibujo entero. `opciones` trae el tamaño, o null si todavía no se sabe. */
  abstract fun construir(c: Context, opciones: Bundle?): RemoteViews

  override fun onUpdate(c: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, construir(c, manager.getAppWidgetOptions(id)))
  }

  override fun onAppWidgetOptionsChanged(
    c: Context,
    manager: AppWidgetManager,
    id: Int,
    nuevas: Bundle,
  ) {
    super.onAppWidgetOptionsChanged(c, manager, id, nuevas)
    manager.updateAppWidget(id, construir(c, nuevas))
  }

  override fun onReceive(c: Context, intent: Intent) {
    super.onReceive(c, intent)
    if (intent.action == Widgets.ACCION_REGISTRAR) {
      Widgets.encolarDesdeIntent(c, intent)
      Widgets.refrescarTodos(c)
    }
  }

  /** Vuelve a dibujar todas las copias de ESTE widget que estén puestas. */
  fun redibujar(c: Context) {
    val manager = AppWidgetManager.getInstance(c)
    val ids = manager.getAppWidgetIds(ComponentName(c, javaClass))
    for (id in ids) manager.updateAppWidget(id, construir(c, manager.getAppWidgetOptions(id)))
  }

  /** El cartel que reemplaza al contenido cuando no hay nada honesto que mostrar. */
  protected fun aviso(c: Context, layout: Int, texto: String): RemoteViews {
    val vista = RemoteViews(c.packageName, layout)
    vista.setViewVisibility(R.id.compacto_contenido, View.GONE)
    vista.setViewVisibility(R.id.compacto_aviso, View.VISIBLE)
    vista.setTextViewText(R.id.compacto_aviso, texto)
    vista.setOnClickPendingIntent(R.id.compacto_aviso, Widgets.abrirApp(c, null))
    return vista
  }

  /**
   * El esqueleto común: si no hay día que mostrar devuelve el cartel, y si lo
   * hay deja la vista lista para que cada widget la llene.
   */
  protected fun conElDia(
    c: Context,
    layout: Int,
    llenar: (RemoteViews, JSONObject, String) -> Unit,
  ): RemoteViews = when (val estado = Widgets.estado(c)) {
    is Widgets.Estado.SinDatos -> aviso(c, layout, c.getString(R.string.widget_compacto_vacio))
    is Widgets.Estado.Viejo -> aviso(c, layout, c.getString(R.string.widget_compacto_viejo))
    is Widgets.Estado.Hoy ->
      if (Widgets.misiones(estado.resumen).isEmpty()) {
        aviso(c, layout, c.getString(R.string.widget_compacto_sin_misiones))
      } else {
        RemoteViews(c.packageName, layout).also { vista ->
          vista.setViewVisibility(R.id.compacto_aviso, View.GONE)
          vista.setViewVisibility(R.id.compacto_contenido, View.VISIBLE)
          llenar(vista, estado.resumen, estado.fecha)
        }
      }
  }

  protected fun color(c: Context, id: Int): Int = c.resources.getColor(id, null)
}

// ---------------------------------------------------------------------------
// Los anillos
// ---------------------------------------------------------------------------

/** Cuántas filas de disciplinas entran al lado del anillo. */
private fun filasQueEntran(opciones: Bundle?): Int {
  val alto = Widgets.altoDp(opciones)
  if (alto <= 0) return 3
  return ((alto - 8) / 14).coerceIn(1, 6)
}

/** El lado del anillo: lo más grande que entre sin tocar los bordes. */
private fun ladoDelAnillo(opciones: Bundle?): Float {
  val alto = Widgets.altoDp(opciones)
  if (alto <= 0) return 46f
  return (alto - 16).coerceIn(32, 72).toFloat()
}

/** Una disciplina al lado del anillo: el ícono la nombra y el número la mide. */
private fun filaDeDisciplina(c: Context, m: JSONObject, colorTexto: Int): RemoteViews {
  val fila = RemoteViews(c.packageName, R.layout.widget_compacto_fila)
  fila.setTextViewText(R.id.compacta_icono, m.optString("icono"))
  fila.setTextViewText(R.id.compacta_texto, m.optString("texto"))
  fila.setTextColor(R.id.compacta_texto, colorTexto)
  fila.setOnClickPendingIntent(R.id.fila_compacta, Widgets.abrirApp(c, m.optString("id")))
  return fila
}

/**
 * Un anillo con el día entero y, al lado, lo que falta.
 *
 * El anillo contesta "cuánto llevo"; las filas contestan "de qué", que es lo
 * que un número solo no dice.
 */
class WidgetAnillo : WidgetCompacto() {

  override fun construir(c: Context, opciones: Bundle?): RemoteViews =
    conElDia(c, R.layout.widget_compacto_anillo) { vista, resumen, _ ->
      val hechas = resumen.optInt("hechas")
      val total = resumen.optInt("total")
      val perfecto = resumen.optBoolean("perfecto")
      val tinte = color(c, if (perfecto) R.color.widget_ok else R.color.widget_acento)

      vista.setImageViewBitmap(
        R.id.anillo_imagen,
        Dibujo.anillos(
          c,
          ladoDelAnillo(opciones),
          listOf(Dibujo.Arco(if (total > 0) hechas.toFloat() / total else 0f, tinte)),
          c.getString(R.string.widget_cuenta, hechas, total),
          color(c, R.color.widget_texto),
        ),
      )
      vista.setOnClickPendingIntent(R.id.anillo_imagen, Widgets.abrirApp(c, null))

      // Lo que falta primero: el widget es para lo que queda por hacer.
      vista.removeAllViews(R.id.anillo_filas)
      for (m in Widgets.misiones(resumen).take(filasQueEntran(opciones))) {
        val tono = if (m.optBoolean("hecho")) R.color.widget_ok else R.color.widget_suave
        vista.addView(R.id.anillo_filas, filaDeDisciplina(c, m, color(c, tono)))
      }
    }
}

/**
 * Anillos concéntricos, uno por disciplina que toca hoy.
 *
 * Lo mínimo que puede decir el día entero: cada aro es una disciplina y cuánto
 * llevás de su meta. Sin fondo, sin números y sin nombres — se apoya sobre el
 * fondo de pantalla como el widget de salud del teléfono.
 *
 * Las puramente semanales —la medición, escribir— no entran, porque no son de
 * hoy: eso ya lo resuelve el resumen, que trae nada más lo que toca.
 *
 * El orden es el fijo del día, no el de lo que falta: un aro que cambia de
 * disciplina según cómo venís no se puede leer de reojo, y acá no hay un
 * nombre al lado que lo aclare.
 */
class WidgetAnillos : WidgetCompacto() {

  companion object {
    /** Más grande deja de ser un detalle de la pantalla y pasa a ser el tema. */
    private const val LADO_MAX = 76
    private const val LADO_MIN = 28

    /** Aire contra los bordes de la celda. */
    private const val MARGEN = 6

    /**
     * Cuánto se aclara el aro de más adentro respecto del de afuera. Con una
     * paleta cálida, seis aros del mismo tono serían una mancha.
     */
    private const val ESCALON_TOTAL = 0.55f
  }

  override fun construir(c: Context, opciones: Bundle?): RemoteViews =
    conElDia(c, R.layout.widget_compacto_anillos) { vista, resumen, _ ->
      val delDia = Widgets.misionesEnOrden(resumen)
      val respaldo = color(c, R.color.widget_acento)
      val ultimo = max(1, delDia.size - 1)

      vista.setImageViewBitmap(
        R.id.anillos_imagen,
        Dibujo.anillos(
          c,
          ladoDeLosAnillos(opciones),
          delDia.mapIndexed { i, m ->
            Dibujo.Arco(
              m.optDouble("pct", 0.0).toFloat(),
              Dibujo.aclarar(Dibujo.color(m.optString("color"), respaldo), ESCALON_TOTAL * i / ultimo),
            )
          },
        ),
      )
      vista.setOnClickPendingIntent(R.id.anillos_imagen, Widgets.abrirApp(c, null))
    }

  /** Lo más grande que entre en la celda, sin pasarse. */
  private fun ladoDeLosAnillos(opciones: Bundle?): Float {
    val ancho = Widgets.anchoDp(opciones).takeIf { it > 0 } ?: LADO_MAX
    val alto = Widgets.altoDp(opciones).takeIf { it > 0 } ?: LADO_MAX
    return min(min(ancho, alto) - MARGEN, LADO_MAX).coerceAtLeast(LADO_MIN).toFloat()
  }
}

// ---------------------------------------------------------------------------
// La tira
// ---------------------------------------------------------------------------

/**
 * Un ícono por misión, apagado el que falta.
 *
 * Es el más barato de leer: no hay que interpretar un número ni un arco, se
 * cuentan los apagados.
 */
class WidgetTira : WidgetCompacto() {

  override fun construir(c: Context, opciones: Bundle?): RemoteViews =
    conElDia(c, R.layout.widget_compacto_tira) { vista, resumen, _ ->
      vista.removeAllViews(R.id.tira_iconos)
      for (m in Widgets.misionesEnOrden(resumen)) {
        val icono = RemoteViews(c.packageName, R.layout.widget_compacto_icono)
        icono.setTextViewText(R.id.tira_icono, m.optString("icono"))
        // Los emoji no se tiñen con setTextColor: lo que los apaga es el alfa.
        icono.setFloat(R.id.tira_icono, "setAlpha", if (m.optBoolean("hecho")) 1f else Widgets.ALFA_PENDIENTE)
        icono.setOnClickPendingIntent(R.id.tira_icono, Widgets.abrirApp(c, m.optString("id")))
        vista.addView(R.id.tira_iconos, icono)
      }

      val hechas = resumen.optInt("hechas")
      val total = resumen.optInt("total")
      vista.setTextViewText(R.id.tira_cuenta, c.getString(R.string.widget_cuenta, hechas, total))
      vista.setTextColor(
        R.id.tira_cuenta,
        color(c, if (resumen.optBoolean("perfecto")) R.color.widget_ok else R.color.widget_texto),
      )
      vista.setTextViewText(R.id.tira_racha, c.getString(R.string.widget_racha_corta, resumen.optInt("racha")))
      vista.setOnClickPendingIntent(R.id.tira_cuenta, Widgets.abrirApp(c, null))
    }
}

// ---------------------------------------------------------------------------
// El foco
// ---------------------------------------------------------------------------

/**
 * Una sola misión: la primera que falta.
 *
 * No resume el día, dice qué hacer ahora. Es el único que cabe entero en un
 * vistazo de medio segundo.
 */
class WidgetFoco : WidgetCompacto() {

  override fun construir(c: Context, opciones: Bundle?): RemoteViews =
    conElDia(c, R.layout.widget_compacto_foco) { vista, resumen, fecha ->
      val encoladas = Resumen.encoladasDe(c, fecha)
      val pendiente = Widgets.misiones(resumen).firstOrNull { !it.optBoolean("hecho") }

      if (pendiente == null) {
        vista.setTextViewText(R.id.foco_nombre, c.getString(R.string.widget_todo_hecho))
        vista.setTextViewText(
          R.id.foco_detalle,
          c.getString(R.string.widget_detalle, resumen.optInt("xp"), resumen.optInt("racha"), resumen.optString("rango")),
        )
        vista.setViewVisibility(R.id.foco_boton, View.GONE)
        vista.setOnClickPendingIntent(R.id.foco_cuerpo, Widgets.abrirApp(c, null))
        return@conElDia
      }

      val id = pendiente.optString("id")
      val encolada = encoladas.contains(id)
      vista.setTextViewText(R.id.foco_nombre, "${pendiente.optString("icono")} ${pendiente.optString("nombre")}")
      vista.setTextViewText(
        R.id.foco_detalle,
        if (encolada) c.getString(R.string.widget_encolada) else pendiente.optString("texto"),
      )
      vista.setTextColor(
        R.id.foco_detalle,
        color(c, if (encolada) R.color.widget_pendiente else R.color.widget_suave),
      )
      vista.setOnClickPendingIntent(R.id.foco_cuerpo, Widgets.abrirApp(c, id))

      // El botón sólo donde cumplir es un número obvio. En el gimnasio no
      // existe, y ofrecerlo sería inventar el dato.
      val valor = pendiente.optDouble("unToque", 0.0)
      if (!encolada && valor > 0) {
        vista.setViewVisibility(R.id.foco_boton, View.VISIBLE)
        vista.setOnClickPendingIntent(
          R.id.foco_boton,
          Widgets.registrar(c, WidgetFoco::class.java, id, fecha, valor),
        )
      } else {
        vista.setViewVisibility(R.id.foco_boton, View.GONE)
      }
    }
}

// ---------------------------------------------------------------------------
// La barra
// ---------------------------------------------------------------------------

/** Cuánto va del día, en una barra ancha y baja. */
class WidgetBarra : WidgetCompacto() {

  companion object {
    private const val ALTO_BARRA = 8f
    private const val ANCHO_POR_DEFECTO = 250
  }

  override fun construir(c: Context, opciones: Bundle?): RemoteViews =
    conElDia(c, R.layout.widget_compacto_barra) { vista, resumen, _ ->
      val hechas = resumen.optInt("hechas")
      val total = resumen.optInt("total")
      val perfecto = resumen.optBoolean("perfecto")

      vista.setTextViewText(R.id.barra_titulo, c.getString(R.string.widget_barra_titulo, hechas, total))
      vista.setTextViewText(R.id.barra_xp, c.getString(R.string.widget_xp, resumen.optInt("xp")))

      val ancho = Widgets.anchoDp(opciones).takeIf { it > 0 } ?: ANCHO_POR_DEFECTO
      vista.setImageViewBitmap(
        R.id.barra_imagen,
        Dibujo.barra(
          c,
          (ancho - 20).coerceAtLeast(80).toFloat(),
          ALTO_BARRA,
          if (total > 0) hechas.toFloat() / total else 0f,
          color(c, if (perfecto) R.color.widget_ok else R.color.widget_acento),
        ),
      )

      val faltan = Widgets.misionesEnOrden(resumen).filter { !it.optBoolean("hecho") }
      vista.setTextViewText(
        R.id.barra_falta,
        if (faltan.isEmpty()) c.getString(R.string.widget_todo_hecho)
        else c.getString(R.string.widget_falta, faltan.joinToString(" ") { it.optString("icono") }),
      )
      vista.setOnClickPendingIntent(R.id.barra_titulo, Widgets.abrirApp(c, null))
      vista.setOnClickPendingIntent(R.id.barra_imagen, Widgets.abrirApp(c, null))
    }
}
