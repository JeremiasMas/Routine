// Modo caminata: cuenta los pasos con el acelerómetro mientras la app está abierta.
import { el, formatNumber, todayKey } from '../utils.js';
import { openSheet } from './sheet.js';
import { getEntry, setEntry } from '../state.js';
import { Pedometro, hayAcelerometro, pedirPermiso, CALIBRACION_MS } from '../pedometer.js';
import { colorDe } from '../theme.js';

/** Cada cuánto se guardan los pasos contados, por si la app se cierra de golpe. */
const AUTOGUARDADO_MS = 30000;

export function walkDisponible() {
  return hayAcelerometro();
}

/**
 * Abre el panel de caminata. Cuenta hasta que lo cerrás, y va guardando en el
 * día de hoy: si la app se muere en el medio, lo caminado ya está anotado.
 */
export function openWalk(activity, onSaved) {
  const pedometro = new Pedometro();
  let guardados = 0;          // pasos ya escritos en el registro del día
  let arranque = null;        // primera muestra recibida
  let ultimoPaso = null;      // para la cadencia
  let cadencia = 0;
  let wakeLock = null;
  let timer = null;
  let vivo = true;

  const numero = el('b', { class: 'walk__n', text: '0' });
  const estado = el('div', { class: 'walk__estado', text: 'Calibrando el sensor…' });
  const detalle = el('div', { class: 'walk__detalle' });
  const progreso = el('div', { class: 'walk__meta' });
  const aviso = el('p', { class: 'hint', style: 'margin-top:14px' },
    'Dejá la pantalla encendida y la app abierta: el navegador no recibe el acelerómetro en segundo plano. ' +
    'Si bloqueás el teléfono, la cuenta se frena hasta que volvés.');

  const cerrar = el('button', { class: 'btn btn--primary btn--block', style: `--c:${colorDe(activity)}` },
    'Terminar y guardar');

  const cuerpo = el('div', { class: 'walk' },
    el('div', { class: 'walk__display' }, numero, el('span', { class: 'walk__unidad', text: 'pasos' })),
    estado, detalle, progreso, cerrar, aviso);

  const sheet = openSheet(`${activity.icon} Modo caminata`, cuerpo, { onClose: terminar });
  cerrar.addEventListener('click', () => sheet.close());

  arrancar();

  async function arrancar() {
    if (!hayAcelerometro()) {
      estado.textContent = 'Este teléfono no le da el acelerómetro al navegador.';
      return;
    }
    if (!(await pedirPermiso())) {
      estado.textContent = 'Sin permiso para usar el sensor de movimiento.';
      return;
    }
    window.addEventListener('devicemotion', onMotion);
    document.addEventListener('visibilitychange', onVisibilidad);
    timer = setInterval(() => { guardar(); pintar(); }, AUTOGUARDADO_MS);
    pedirWakeLock();
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    const t = performance.now();
    if (arranque === null) arranque = t;
    const nuevos = pedometro.push(a.x, a.y, a.z, t);
    if (nuevos > 0) {
      // Cadencia sobre el último tramo, sólo para que se vea que está vivo.
      if (ultimoPaso !== null) {
        const porMinuto = (60000 * nuevos) / Math.max(1, t - ultimoPaso);
        cadencia = cadencia ? cadencia * 0.7 + porMinuto * 0.3 : porMinuto;
      }
      ultimoPaso = t;
      pintar();
    } else if (pedometro.pasos === 0 && t - arranque > CALIBRACION_MS) {
      pintar();
    }
  }

  function pintar() {
    numero.textContent = formatNumber(pedometro.pasos);
    if (pedometro.pasos === 0) {
      estado.textContent = arranque === null
        ? 'Esperando el sensor…'
        : 'Listo. Guardá el teléfono y empezá a caminar.';
    } else {
      estado.textContent = document.hidden ? 'En pausa: volvé a la app' : 'Contando…';
    }
    detalle.textContent = pedometro.pasos > 0 && cadencia > 0
      ? `${Math.round(cadencia)} pasos por minuto`
      : '';

    // Lo caminado recién, sumado a lo que ya había en el día: lo que importa
    // no es esta caminata sino si hoy llegás a los 10.000.
    const total = (Number(getEntry(todayKey(), activity.id)?.value) || 0)
      + (pedometro.pasos - guardados);
    const meta = Number(activity.goal) || 0;
    progreso.textContent = total >= meta
      ? `Meta cumplida: ${formatNumber(total)} pasos hoy 🎉`
      : `Hoy vas ${formatNumber(total)} de ${formatNumber(meta)}`;
  }

  /** Escribe en el día de hoy sólo lo que todavía no se escribió. */
  function guardar() {
    const delta = pedometro.pasos - guardados;
    if (delta <= 0) return null;
    const hoy = todayKey();
    const actual = Number(getEntry(hoy, activity.id)?.value) || 0;
    guardados = pedometro.pasos;
    return setEntry(hoy, activity.id, { value: actual + delta });
  }

  function terminar() {
    if (!vivo) return;
    vivo = false;
    window.removeEventListener('devicemotion', onMotion);
    document.removeEventListener('visibilitychange', onVisibilidad);
    clearInterval(timer);
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    const events = guardar();
    onSaved?.(events, pedometro.pasos);
  }

  function onVisibilidad() {
    pintar();
    if (!document.hidden) pedirWakeLock();
    else guardar();
  }

  async function pedirWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // Sin wake lock la pantalla se apaga sola y la cuenta se frena; el aviso
      // de arriba ya lo dice, no hace falta molestar con un error.
    }
  }

  return { sheet, pedometro };
}
