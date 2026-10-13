import {
  plan, lineasWidget, sensacion, lluviaEn, normalizarHorario, HORARIO_DEFAULT, DIAS, hora,
  VIENTO_DE_CASA, PASOS_POR_MINUTO, diaDeSemana, minutos, MAX_OCUPADOS,
} from './logica.js';
import { traer, guardado, horasDe, ahoraEnBA, descripcion, LUGAR } from './pronostico.js';
import {
  enApp, sincronizar, DESCARGA_APK, escucharPasos, pedirPermiso, instalarHealthConnect,
  refrescarPasos, usarSoloOrigen,
} from './nativo.js';

const CLAVE_HORARIO = 'clima.horario';
const CLAVE_PASOS = 'clima.pasos';
const CLAVE_ORIGEN = 'clima.origen';
const $ = (sel) => document.querySelector(sel);

function leer(clave, def) {
  try {
    return JSON.parse(localStorage.getItem(clave) || 'null') ?? def;
  } catch {
    return def;
  }
}

function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* modo privado */ }
}

/**
 * Un horario guardado antes de que existiera el almuerzo es el de prueba (lunes
 * a viernes, 45 minutos de viaje): se reemplaza por tu semana real y sólo se
 * conservan tus caminatas y tu meta.
 */
function horarioGuardado() {
  const crudo = leer(CLAVE_HORARIO, null);
  if (crudo && 'almuerzo' in crudo) return normalizarHorario(crudo);
  return normalizarHorario({ caminatas: crudo?.caminatas, meta: crudo?.meta });
}

let horario = horarioGuardado();
let registro = guardado();

/**
 * Los pasos de hoy. Adentro de la app llegan de Health Connect; en el
 * navegador los cargás a mano. Lo cargado a mano vale sólo el día que lo
 * cargaste.
 */
const hc = { estado: null, pasos: null, origenes: [] };
function pasosDeHoy() {
  if (hc.pasos != null) return hc.pasos;
  const manual = leer(CLAVE_PASOS, null);
  return manual?.fecha === ahoraEnBA().fecha ? manual.pasos : null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const miles = (n) => Math.round(n).toLocaleString('es-AR');

function hace(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

function iconoHora(h) {
  const ll = lluviaEn(h);
  if (ll === 'tormenta') return '⛈️';
  if (ll === 'lluvia') return '🌧️';
  if (ll === 'quizas') return '🌦️';
  if (h.codigo === 0 || h.codigo === 1) return h.hora >= 7 && h.hora < 20 ? '☀️' : '🌙';
  if (h.codigo <= 3) return '⛅';
  return '☁️';
}

/** Cómo está el tiempo en un tramo, en pocas palabras: "17°, sentís 15°". */
function clima(horas, fecha, desde, hasta) {
  const tramo = horas.filter((x) => x.fecha === fecha && x.hora >= desde && x.hora < hasta);
  if (!tramo.length) return '';
  const t = Math.round(tramo.reduce((s, x) => s + x.temp, 0) / tramo.length);
  const s = Math.round(tramo.reduce((a, x) => a + sensacion(x), 0) / tramo.length);
  return t === s ? `${t}°` : `${t}°, sentís ${s}°`;
}

/** El renglón de la caminata, explicado. */
function textoCaminata(c, horas) {
  if (!c) return null;
  if (c.cumplida) return '<b>🚶</b> Ya llegaste a la meta de pasos. Si salís, que sea por gusto.';
  const dia = c.etiqueta.toLowerCase();
  const finde = [0, 6].includes(diaDeSemana(c.fecha));
  const rato = (v) => `de ${hora(v.desde)} a ${hora(v.hasta)} h `
    + `(${clima(horas, c.fecha, Math.floor(v.desde / 60), Math.ceil(v.hasta / 60))})`;
  if (c.tipo === 'habitual') {
    const tuya = c.almuerzo
      ? `Tu caminata del almuerzo (${hora(c.inicio)} a ${hora(minutos(horario.almuerzo.hasta))} h)`
      : `Tu caminata de las ${hora(c.inicio)} h`;
    const h0 = Math.floor(c.inicio / 60);
    if (c.ok && c.otra) {
      return `<b>🚶</b> ${tuya} viene bien (${clima(horas, c.fecha, h0, h0 + 1)}), `
        + `pero ${dia} conviene más salir ${rato(c.otra)}.`;
    }
    if (c.ok) return `<b>🚶</b> ${tuya} viene bien: ${clima(horas, c.fecha, h0, h0 + 1)}, sin lluvia.`;
    return c.otra
      ? `<b>🚶</b> ${tuya} choca con ${c.motivo}. Mejor salí ${rato(c.otra)}.`
      : `<b>🚶</b> ${tuya} choca con ${c.motivo}, y ${dia} no queda otro rato bueno afuera.`;
  }
  if (c.tipo === 'optimo') {
    const cuando = finde ? `Es fin de semana: el horario óptimo ${dia === 'hoy' ? 'de hoy' : 'de mañana'}`
      : `El mejor rato ${dia === 'hoy' ? 'de hoy' : 'de mañana'}`;
    return `<b>🚶</b> ${cuando} para caminar es ${rato(c)}.`;
  }
  return `<b>🚶</b> ${c.etiqueta} no conviene caminar afuera: ${c.motivo}.`;
}

function textoPasos(p, c) {
  const hoy = pasosDeHoy();
  if (hoy == null) return null;
  const meta = horario.meta;
  if (hoy >= meta) return `<b>👟</b> Llevás ${miles(hoy)} pasos: meta de ${miles(meta)} cumplida.`;
  const faltan = meta - hoy;
  const min = Math.ceil(faltan / PASOS_POR_MINUTO);
  let txt = `<b>👟</b> Llevás ${miles(hoy)} de ${miles(meta)} pasos. Te faltan ${miles(faltan)}: `
    + `unos <b>${min} min</b> caminando.`;
  if (c?.tipo === 'habitual' && c.quedan > 1) {
    txt += ` Repartidos en tus ${c.quedan} caminatas que quedan, ${Math.ceil(min / c.quedan)} min cada una.`;
  }
  return txt;
}

function pintar() {
  const horas = registro ? horasDe(registro.json) : [];
  const ahora = ahoraEnBA();
  const p = horas.length ? plan(horas, horario, ahora, pasosDeHoy()) : null;
  const w = lineasWidget(p);

  $('#widget').innerHTML = `
    <div class="w-titulo">${esc(w.titulo)}</div>
    <div class="w-detalle">${esc(w.detalle)}</div>
    ${w.caminar ? `<div class="w-caminar">${esc(w.caminar)}</div>` : ''}`;

  const estado = registro
    ? `${LUGAR.nombre} · actualizado ${hace(registro.bajado)}${registro.fresco === false ? ' · sin conexión' : ''}`
    : 'Bajando el pronóstico…';
  $('#estado').textContent = estado;
  pintarPasos();

  if (!p) {
    $('#detalle').innerHTML = '';
    return;
  }

  const items = [];
  items.push(`<li><b>${esc(p.ropa.icono)} ${esc(p.ropa.corto)}.</b> ${esc(p.ropa.detalle)}</li>`);
  if (p.portena.id !== p.ropa.id) {
    items.push(`<li class="suave">Un porteño iría con ${esc(p.portena.corto.toLowerCase())}. `
      + `Vos venís de Río Grande: el viento de menos de ${VIENTO_DE_CASA} km/h ni lo contás.</li>`);
  }
  items.push(`<li><b>${p.paraguas.nivel === 'no' ? '🌂' : '☂️'}</b> ${esc(p.paraguas.texto)}</li>`);
  if (p.nota) items.push(`<li>${esc(p.nota)}</li>`);
  if (p.oficina) {
    items.push(`<li class="suave">Oficina: salís de casa a las ${hora(p.ida.desde)} h con ${p.ida.temp ?? '–'}°; `
      + `a la vuelta tomás el colectivo a las ${hora(p.vuelta.desde)} h con ${p.vuelta.temp ?? '–'}° `
      + `y llegás a las ${hora(p.vuelta.desde + horario.viaje)} h.</li>`);
  }
  if (p.casa) {
    items.push(`<li class="suave">Home office: la ropa es para salir al almuerzo, de ${hora(minutos(horario.almuerzo.desde))} `
      + `a ${hora(minutos(horario.almuerzo.hasta))} h (${p.temp}°).</li>`);
  }
  const pasos = textoPasos(p, p.caminata);
  if (pasos) items.push(`<li>${pasos}</li>`);
  const camina = textoCaminata(p.caminata, horas);
  if (camina) items.push(`<li>${camina}</li>`);

  const desde = horas.findIndex((h) => h.fecha === ahora.fecha && h.hora === Math.floor(ahora.minutos / 60));
  const proximas = horas.slice(Math.max(0, desde), Math.max(0, desde) + 14);
  const tira = proximas.map((h) => `
    <div class="hora">
      <span class="h">${h.hora}</span>
      <span class="i">${iconoHora(h)}</span>
      <span class="t">${Math.round(h.temp)}°</span>
      <span class="s" title="Lo que sentís vos">${Math.round(sensacion(h))}°</span>
      <span class="p">${h.prob >= 10 ? `${h.prob}%` : ''}</span>
    </div>`).join('');

  $('#detalle').innerHTML = `
    <h2>${esc(p.etiqueta)} · ${esc(descripcion(proximas[0]?.codigo ?? 0))}</h2>
    <ul class="consejos">${items.join('')}</ul>
    <div class="tira" aria-label="Próximas horas">${tira}</div>
    <p class="leyenda">Arriba la temperatura; abajo, en gris, lo que sentís vos.</p>`;
}

/** De dónde salen los pasos: Health Connect en la app, a mano en el navegador. */
function pintarPasos() {
  const caja = $('#pasos');
  // Se redibuja cada minuto: no hay que borrarte lo que estás escribiendo.
  if (caja.contains(document.activeElement)) return;
  if (enApp()) {
    if (hc.estado === 'listo') {
      const varias = hc.origenes.length > 1;
      const elegido = leer(CLAVE_ORIGEN, '');
      caja.innerHTML = varias ? `
        <label class="suave">Contar los pasos de
          <select id="origen">
            <option value="">todas las apps (pueden sumarse dos veces)</option>
            ${hc.origenes.map((o) => `<option value="${esc(o.paquete)}" ${o.paquete === elegido ? 'selected' : ''}>${esc(o.nombre)} · ${miles(o.pasos)}</option>`).join('')}
          </select>
        </label>` : '';
      return;
    }
    const sinHc = hc.estado === 'sin_health_connect' || hc.estado === 'hay_que_actualizar';
    caja.innerHTML = hc.estado == null ? '' : `
      <p class="suave">Para saber cuánto te falta caminar, la app necesita leer tus pasos de Health Connect.</p>
      <button type="button" class="boton" id="permiso">${sinHc ? 'Instalar Health Connect' : 'Dar permiso para leer los pasos'}</button>`;
    return;
  }
  const manual = leer(CLAVE_PASOS, null);
  const valor = manual?.fecha === ahoraEnBA().fecha ? manual.pasos : '';
  caja.innerHTML = `
    <label class="pasos-manual">👟 Pasos de hoy
      <input type="number" id="pasos-hoy" inputmode="numeric" min="0" step="100" value="${valor}" placeholder="los de tu contador">
    </label>`;
}

const chips = (clase, elegidos) => [1, 2, 3, 4, 5, 6, 0].map((d) => `
    <label class="dia"><input type="checkbox" class="${clase}" value="${d}" ${elegidos.includes(d) ? 'checked' : ''}>
      <span>${DIAS[d].slice(0, 2)}</span></label>`).join('');

/** Una fila de "ocupado": qué es, qué días y de qué hora a qué hora. */
function filaOcupado(o = { nombre: '', dias: [], desde: '', hasta: '' }) {
  return `
    <div class="ocupado">
      <div class="ocupado-arriba">
        <input type="text" class="oc-nombre" maxlength="30" placeholder="Qué es (K1, gimnasio…)" value="${esc(o.nombre)}">
        <button type="button" class="quitar" aria-label="Quitar">✕</button>
      </div>
      <div class="dias dias-chicos">${chips('oc-dia', o.dias)}</div>
      <div class="campos">
        <label>desde <input type="time" class="oc-desde" value="${o.desde}"></label>
        <label>hasta <input type="time" class="oc-hasta" value="${o.hasta}"></label>
      </div>
    </div>`;
}

/** Lee lo que hay en pantalla, lo guarda y se lo pasa al widget. */
function guardarAjustes() {
  horario = normalizarHorario({
    dias: [...document.querySelectorAll('.dia-oficina:checked')].map((i) => Number(i.value)),
    remoto: [...document.querySelectorAll('.dia-remoto:checked')].map((i) => Number(i.value)),
    entrada: $('#entrada').value,
    salida: $('#salida').value,
    viaje: $('#viaje').value,
    almuerzo: $('#almuerzo-desde').value && $('#almuerzo-hasta').value
      ? { desde: $('#almuerzo-desde').value, hasta: $('#almuerzo-hasta').value }
      : null,
    caminatas: [...document.querySelectorAll('.caminata')].map((i) => i.value).filter(Boolean),
    meta: $('#meta').value,
    // Una fila a medio cargar (sin días o sin horas) queda en pantalla pero
    // no cuenta hasta que esté completa.
    ocupados: [...document.querySelectorAll('.ocupado')].map((f) => ({
      nombre: f.querySelector('.oc-nombre').value,
      dias: [...f.querySelectorAll('.oc-dia:checked')].map((i) => Number(i.value)),
      desde: f.querySelector('.oc-desde').value,
      hasta: f.querySelector('.oc-hasta').value,
    })),
  });
  escribir(CLAVE_HORARIO, horario);
  sincronizar(horario, registro?.json);
  pintar();
}

function pintarAjustes() {
  const caminatas = [0, 1, 2].map((i) => `
      <label>Caminata ${i + 1} <input type="time" class="caminata" value="${horario.caminatas[i] ?? ''}"></label>`).join('');
  $('#ajustes').innerHTML = `
    <summary>Horarios y meta</summary>
    <h3>Trabajo</h3>
    <p class="suave">Los días que vas a la oficina, en colectivo:</p>
    <div class="dias">${chips('dia-oficina', horario.dias)}</div>
    <p class="suave">Los de home office, mismo horario y sin viaje:</p>
    <div class="dias">${chips('dia-remoto', horario.remoto)}</div>
    <div class="campos">
      <label>Entrada <input type="time" id="entrada" value="${horario.entrada}"></label>
      <label>Salida <input type="time" id="salida" value="${horario.salida}"></label>
      <label>Viaje (min) <input type="number" id="viaje" min="0" max="180" step="5" value="${horario.viaje}"></label>
    </div>
    <p class="suave">Entrada y salida son las de la oficina: con el viaje, la app sabe a qué hora salís de casa y
      a qué hora volvés.</p>
    <div class="campos">
      <label>Almuerzo desde <input type="time" id="almuerzo-desde" value="${horario.almuerzo?.desde ?? ''}"></label>
      <label>hasta <input type="time" id="almuerzo-hasta" value="${horario.almuerzo?.hasta ?? ''}"></label>
    </div>
    <p class="suave">Los días de trabajo, el almuerzo es tu rato para caminar. Vacío si no salís.</p>
    <h3>Tus caminatas de lunes a viernes</h3>
    <p class="suave">A qué hora salís a caminar. La app revisa si el clima acompaña y, si no, te propone otro
      horario. Los fines de semana te da directamente el óptimo. Dejá vacías las que no uses.</p>
    <div class="campos">${caminatas}</div>
    <div class="campos">
      <label>Meta de pasos <input type="number" id="meta" min="1000" max="50000" step="500" value="${horario.meta}"></label>
    </div>
    <h3>Ocupado</h3>
    <p class="suave">Lo fijo de cada semana. Ahí la app nunca te propone caminar.</p>
    <div id="ocupados">${horario.ocupados.map(filaOcupado).join('')}</div>
    <button type="button" class="boton boton-suave" id="agregar-ocupado">Agregar</button>
    ${enApp() ? '' : `<p class="suave">¿Querés el widget en la pantalla de inicio? <a href="${DESCARGA_APK}">Bajá la app para Android</a>.</p>`}`;

  $('#ajustes').addEventListener('change', (e) => {
    // Un día es de oficina o de home office: marcar uno desmarca el otro.
    if (e.target.matches('.dia-oficina, .dia-remoto') && e.target.checked) {
      const otro = e.target.classList.contains('dia-oficina') ? 'dia-remoto' : 'dia-oficina';
      document.querySelector(`.${otro}[value="${e.target.value}"]`).checked = false;
    }
    guardarAjustes();
  });

  $('#ajustes').addEventListener('click', (e) => {
    if (e.target.id === 'agregar-ocupado') {
      if (document.querySelectorAll('.ocupado').length >= MAX_OCUPADOS) return;
      $('#ocupados').insertAdjacentHTML('beforeend', filaOcupado());
      $('#ocupados .ocupado:last-child .oc-nombre').focus();
    } else if (e.target.classList.contains('quitar')) {
      e.target.closest('.ocupado').remove();
      guardarAjustes();
    }
  });
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'pasos-hoy') {
    const n = Math.round(Number(e.target.value));
    escribir(CLAVE_PASOS, Number.isFinite(n) && n >= 0 && e.target.value !== '' ? { fecha: ahoraEnBA().fecha, pasos: n } : null);
    pintar();
  } else if (e.target.id === 'origen') {
    escribir(CLAVE_ORIGEN, e.target.value);
    usarSoloOrigen(e.target.value);
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id !== 'permiso') return;
  if (hc.estado === 'sin_health_connect' || hc.estado === 'hay_que_actualizar') instalarHealthConnect();
  else pedirPermiso();
});

escucharPasos(() => ahoraEnBA().fecha, (datos) => {
  Object.assign(hc, datos);
  // Lo que se ve en la app y lo que dibuja el widget tienen que coincidir: el
  // widget vuelve a leer los pasos cuando recibe esto.
  sincronizar(horario, null);
  pintar();
});

async function actualizar() {
  try {
    registro = await traer();
  } catch {
    $('#estado').textContent = 'No se pudo bajar el pronóstico. Probá con conexión.';
    return;
  }
  sincronizar(horario, registro.json);
  pintar();
}

pintarAjustes();
pintar();
actualizar();
// Al volver a la app después de un rato, el pronóstico se renueva solo.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  refrescarPasos();
  if (!registro || Date.now() - registro.bajado > 20 * 60000) actualizar();
});
setInterval(pintar, 60000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
