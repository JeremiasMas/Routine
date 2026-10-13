import {
  plan, lineasWidget, sensacion, lluviaEn, normalizarHorario, HORARIO_DEFAULT, DIAS, hora,
  VIENTO_DE_CASA,
} from './logica.js';
import { traer, guardado, horasDe, ahoraEnBA, descripcion, LUGAR } from './pronostico.js';
import { enApp, sincronizar, DESCARGA_APK } from './nativo.js';

const CLAVE_HORARIO = 'clima.horario';
const $ = (sel) => document.querySelector(sel);

function leerHorario() {
  try {
    return normalizarHorario(JSON.parse(localStorage.getItem(CLAVE_HORARIO) || 'null') || HORARIO_DEFAULT);
  } catch {
    return normalizarHorario(HORARIO_DEFAULT);
  }
}

function guardarHorario(h) {
  try { localStorage.setItem(CLAVE_HORARIO, JSON.stringify(h)); } catch { /* modo privado */ }
}

let horario = leerHorario();
let registro = guardado();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

function pintar() {
  const horas = registro ? horasDe(registro.json) : [];
  const ahora = ahoraEnBA();
  const p = horas.length ? plan(horas, horario, ahora) : null;
  const w = lineasWidget(p);

  $('#widget').innerHTML = `
    <div class="w-titulo">${esc(w.titulo)}</div>
    <div class="w-detalle">${esc(w.detalle)}</div>
    ${w.caminar ? `<div class="w-caminar">${esc(w.caminar)}</div>` : ''}`;

  const estado = registro
    ? `${LUGAR.nombre} · actualizado ${hace(registro.bajado)}${registro.fresco === false ? ' · sin conexión' : ''}`
    : 'Bajando el pronóstico…';
  $('#estado').textContent = estado;

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
    items.push(`<li class="suave">Oficina: salís ${hora(p.ida.desde)} h con ${p.ida.temp ?? '–'}°, `
      + `volvés ${hora(p.vuelta.desde)} h con ${p.vuelta.temp ?? '–'}°.</li>`);
  }
  const c = p.caminata;
  if (c?.motivo) items.push(`<li><b>🚶</b> ${esc(c.etiqueta)} no conviene caminar: ${esc(c.motivo)}.</li>`);
  else if (c) items.push(`<li><b>🚶</b> ${esc(c.etiqueta)} el mejor rato para caminar es de ${c.desde} a ${c.hasta} h.</li>`);

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

function pintarAjustes() {
  const dias = [1, 2, 3, 4, 5, 6, 0].map((d) => `
    <label class="dia"><input type="checkbox" value="${d}" ${horario.dias.includes(d) ? 'checked' : ''}>
      <span>${DIAS[d].slice(0, 2)}</span></label>`).join('');
  $('#ajustes').innerHTML = `
    <summary>Horario de oficina</summary>
    <p class="suave">Los días que vas a la oficina. El resto son días libres (o de home office).</p>
    <div class="dias">${dias}</div>
    <div class="campos">
      <label>Entrada <input type="time" id="entrada" value="${horario.entrada}"></label>
      <label>Salida <input type="time" id="salida" value="${horario.salida}"></label>
      <label>Viaje (min) <input type="number" id="viaje" min="0" max="180" step="5" value="${horario.viaje}"></label>
    </div>
    ${enApp() ? '' : `<p class="suave">¿Querés el widget en la pantalla de inicio? <a href="${DESCARGA_APK}">Bajá la app para Android</a>.</p>`}`;

  $('#ajustes').addEventListener('change', () => {
    horario = normalizarHorario({
      dias: [...document.querySelectorAll('.dia input:checked')].map((i) => Number(i.value)),
      entrada: $('#entrada').value,
      salida: $('#salida').value,
      viaje: $('#viaje').value,
    });
    guardarHorario(horario);
    sincronizar(horario, registro?.json);
    pintar();
  });
}

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
  if (document.visibilityState === 'visible' && (!registro || Date.now() - registro.bajado > 20 * 60000)) actualizar();
});
setInterval(pintar, 60000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
