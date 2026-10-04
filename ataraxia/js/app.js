// La interfaz: tres pantallas (Hoy, Progreso, Ajustes) y la rutina guiada.
import {
  claveDe, fechaDe, sumarDias, diaSemana, estadoInicial, normalizar, derivar,
  metaPasos, comidasActivas, ejercicioDelDia, COMIDAS, COLORES, TIPOS_PASOS, BONUS_PLENO,
  TIPOS_EJERCICIO, MINUTOS_EJERCICIO, sesionesDeLaSemana,
} from './logica.js';
import { FILOSOFOS } from './filosofos.js';
import { RUTINA_POSTURA, duracionRutina } from './postura.js';

const CLAVE_GUARDADO = 'ataraxia';

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ETIQUETA_TIPO = { alta: 'Día largo', suave: 'Día suave', libre: 'Día libre' };

/* -------------------------------------------------------------------------
   Estado y guardado
   ------------------------------------------------------------------------- */

let estado = cargar();
let vista = 'hoy';
let diaVisto = claveDe();

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE_GUARDADO);
    return crudo ? normalizar(JSON.parse(crudo)) : estadoInicial();
  } catch {
    return estadoInicial();
  }
}

function guardar() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(estado));
  } catch {
    aviso('No se pudo guardar en este dispositivo.');
  }
}

/** Cambia el día visto y vuelve a dibujar, celebrando si subió de nivel. */
function cambiar(fn) {
  const antes = derivar(estado, claveDe());
  fn();
  guardar();
  const despues = derivar(estado, claveDe());
  dibujar(despues);
  if (despues.nivel.nivel > antes.nivel.nivel) {
    celebrar(`¡Nivel ${despues.nivel.nivel}! Ahora sos ${despues.filosofo.nombre}`);
  } else if (despues.dia(diaVisto).pleno && !antes.dia(diaVisto).pleno) {
    celebrar(`Día pleno ✨ +${BONUS_PLENO} XP`);
  }
  const nuevos = despues.logros.filter((l) => l.hecho && !antes.logros.find((a) => a.id === l.id).hecho);
  for (const l of nuevos) aviso(`${l.icono} Logro: ${l.nombre}`);
}

function diaEditable(clave) {
  if (!estado.dias[clave]) estado.dias[clave] = {};
  return estado.dias[clave];
}

/* -------------------------------------------------------------------------
   Utilidades de formato
   ------------------------------------------------------------------------- */

const miles = new Intl.NumberFormat('es-AR');
const fmt = (n) => miles.format(Math.round(n));

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function nombreDelDia(clave) {
  const hoy = claveDe();
  if (clave === hoy) return 'Hoy';
  if (clave === sumarDias(hoy, -1)) return 'Ayer';
  const f = fechaDe(clave);
  return `${DIAS_LARGOS[f.getDay()]} ${f.getDate()}`;
}

function fechaLarga(clave) {
  const f = fechaDe(clave);
  return `${DIAS_LARGOS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

function saludo() {
  const h = new Date().getHours();
  const parte = h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  return estado.nombre ? `${parte}, ${esc(estado.nombre)}` : parte;
}

function anillo(pct, contenido, clase = '') {
  const r = 26;
  const c = 2 * Math.PI * r;
  const lleno = Math.max(0, Math.min(1, pct));
  return `<div class="anillo ${clase}">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" class="anillo-fondo"/>
      <circle cx="32" cy="32" r="${r}" class="anillo-lleno"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - lleno)).toFixed(1)}"/>
    </svg>
    <div class="anillo-centro">${contenido}</div>
  </div>`;
}

/* -------------------------------------------------------------------------
   Dibujo
   ------------------------------------------------------------------------- */

const $vista = document.getElementById('vista');
const $arriba = document.getElementById('arriba');
const $pestanas = document.getElementById('pestanas');

function dibujar(d = derivar(estado, claveDe())) {
  $arriba.innerHTML = cabecera(d);
  $pestanas.innerHTML = pestanas();
  if (vista === 'hoy') $vista.innerHTML = pantallaHoy(d);
  else if (vista === 'progreso') $vista.innerHTML = pantallaProgreso(d);
  else $vista.innerHTML = pantallaAjustes();
}

function cabecera(d) {
  const { nivel, filosofo } = d;
  return `
    <div class="jugadora">
      ${anillo(nivel.pct, `<b>${nivel.nivel}</b>`, 'anillo-nivel')}
      <div class="jugadora-texto">
        <div class="saludo">${saludo()}</div>
        <div class="titulo">${esc(filosofo.nombre)}</div>
        <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="${nivel.necesita}"
          aria-valuenow="${nivel.enNivel}" aria-label="XP del nivel"><i style="width:${(nivel.pct * 100).toFixed(1)}%"></i></div>
        <div class="chico">${fmt(nivel.enNivel)} / ${fmt(nivel.necesita)} XP · nivel ${nivel.nivel}</div>
      </div>
    </div>`;
}

function pestanas() {
  const items = [
    ['hoy', '☀️', 'Hoy'],
    ['progreso', '📈', 'Progreso'],
    ['ajustes', '⚙️', 'Ajustes'],
  ];
  return items.map(([id, ic, txt]) => `
    <button class="pestana ${vista === id ? 'activa' : ''}" data-accion="vista" data-valor="${id}"
      ${vista === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${txt}</button>`).join('');
}

/* ---- Hoy ---------------------------------------------------------------- */

function pantallaHoy(d) {
  const r = d.dia(diaVisto);
  const esHoy = diaVisto === claveDe();
  return `
    <div class="navegador">
      <button class="icono-btn" data-accion="dia" data-valor="-1" aria-label="Día anterior">‹</button>
      <div class="navegador-dia">
        <b>${nombreDelDia(diaVisto)}</b>
        <span class="chico">${fechaLarga(diaVisto)} · ${fmt(r.xp)} XP</span>
      </div>
      <button class="icono-btn" data-accion="dia" data-valor="1" aria-label="Día siguiente" ${esHoy ? 'disabled' : ''}>›</button>
    </div>
    ${r.pleno ? '<div class="pleno">✨ Día pleno: todo lo que tocaba, cumplido</div>' : ''}
    ${tarjetaPasos(r, d)}
    ${tarjetaComidas(r)}
    ${tarjetaEjercicio(r)}
    ${tarjetaPostura(r)}
  `;
}

function tarjetaPasos(r, d) {
  const { meta, pasos } = r;
  const libre = meta.tipo === 'libre';
  const pct = libre ? (pasos ? 1 : 0) : pasos / meta.meta;
  const faltan = Math.max(0, meta.meta - pasos);
  const estadoTxt = libre
    ? 'Hoy no hay meta: lo que camines suma igual.'
    : r.ok.pasos ? '¡Meta cumplida!' : `Faltan ${fmt(faltan)} pasos`;
  const opciones = TIPOS_PASOS.map((t) => `
    <button class="segmento ${meta.tipo === t ? 'activo' : ''}" data-accion="tipo-pasos" data-valor="${t}">
      ${t === 'libre' ? 'Libre' : fmt(t === 'alta' ? estado.config.pasos.alta : estado.config.pasos.suave)}
    </button>`).join('');
  return `
    <section class="tarjeta" aria-labelledby="t-pasos">
      <header class="tarjeta-cab">
        <h2 id="t-pasos">👟 Pasos</h2>
        <span class="pildora ${r.ok.pasos ? 'ok' : ''}">${ETIQUETA_TIPO[meta.tipo]}${meta.cambiada ? ' · cambiado' : ''}</span>
      </header>
      <div class="pasos-cuerpo">
        ${anillo(pct, `<b>${fmt(pasos)}</b><small>${libre ? 'pasos' : `de ${fmt(meta.meta)}`}</small>`, 'anillo-pasos')}
        <div class="pasos-lado">
          <p class="estado-txt">${estadoTxt}</p>
          <div class="segmentos" role="group" aria-label="Meta de este día">${opciones}</div>
          <p class="chico">Racha: ${d.rachas.pasos} ${d.rachas.pasos === 1 ? 'día' : 'días'} 🔥</p>
        </div>
      </div>
      <form class="pasos-form" data-form="pasos">
        <label class="sr" for="in-pasos">Pasos del día</label>
        <input id="in-pasos" name="pasos" type="number" inputmode="numeric" min="0" max="200000"
          step="1" placeholder="Total del día" value="${pasos || ''}">
        <button class="btn primario" type="submit">Guardar</button>
      </form>
      <div class="sumas">
        ${[500, 1000, 2000, 5000].map((n) => `<button class="btn suave" data-accion="sumar-pasos" data-valor="${n}">+${fmt(n)}</button>`).join('')}
      </div>
    </section>`;
}

function tarjetaComidas(r) {
  const s = r.semaforo;
  const marcadas = estado.dias[diaVisto]?.comidas || {};
  const activas = comidasActivas(estado);
  if (!activas.length) {
    return `<section class="tarjeta"><h2>🚦 Semáforo de comidas</h2>
      <p class="chico">No hay comidas elegidas. Activalas en Ajustes.</p></section>`;
  }
  const filas = activas.map((c) => {
    const actual = marcadas[c.id];
    const botones = ['rojo', 'amarillo', 'verde'].map((color) => `
      <button class="luz luz-${color} ${actual === color ? 'encendida' : ''}"
        data-accion="comida" data-comida="${c.id}" data-valor="${color}"
        aria-pressed="${actual === color}" aria-label="${c.nombre}: ${COLORES[color].nombre}"></button>`).join('');
    return `<div class="comida">
      <span class="comida-nombre"><span aria-hidden="true">${c.icono}</span> ${c.nombre}</span>
      <div class="semaforo" role="group" aria-label="${c.nombre}">${botones}</div>
    </div>`;
  }).join('');
  let resumen = `${s.registradas} de ${s.total} anotadas`;
  if (s.completo) {
    resumen = r.ok.comidas
      ? (s.verde === s.total ? '¡Todo en verde! 🟢' : 'Buen día de comidas ✓')
      : 'Mañana es otro día. Anotarlo ya es un paso.';
  }
  return `
    <section class="tarjeta" aria-labelledby="t-comidas">
      <header class="tarjeta-cab">
        <h2 id="t-comidas">🚦 Semáforo de comidas</h2>
        <span class="pildora ${r.ok.comidas ? 'ok' : ''}">${s.xp} XP</span>
      </header>
      <p class="chico">¿Cómo comiste? Tocá un color; tocalo de nuevo para borrarlo.</p>
      ${filas}
      <p class="estado-txt">${resumen}</p>
    </section>`;
}

function duracion(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : h === 1 ? '1 hora' : `${h} horas`;
}

function tarjetaEjercicio(r) {
  const { dias, minimo, maximo } = estado.config.ejercicio;
  const meta = dias.length;
  const hechas = sesionesDeLaSemana(estado, diaVisto, claveDe());
  const ses = r.ejercicio;
  const puntos = Array.from({ length: Math.max(meta, hechas) }, (_, i) =>
    `<i class="${i < hechas ? 'lleno' : ''} ${i >= meta ? 'extra' : ''}"></i>`).join('');
  const chips = TIPOS_EJERCICIO.map((t) => `
    <button class="ej-chip ${ses?.tipo === t.id ? 'activo' : ''}" data-accion="ejercicio-tipo" data-valor="${t.id}"
      aria-pressed="${ses?.tipo === t.id}"><span aria-hidden="true">${t.icono}</span>${t.nombre}</button>`).join('');
  const minutos = MINUTOS_EJERCICIO.map((m) => `
    <button class="segmento ${ses?.minutos === m ? 'activo' : ''}" data-accion="ejercicio-min" data-valor="${m}">${m}′</button>`).join('');
  const queDias = [1, 2, 3, 4, 5, 6, 0].filter((d) => dias.includes(d)).map((d) => DIAS_LARGOS[d]);
  const rango = minimo === maximo ? duracion(minimo) : `${duracion(minimo)} a ${duracion(maximo)}`;
  const hoyTxt = r.toca.ejercicio
    ? `${diaVisto === claveDe() ? 'Hoy' : 'Este día'} toca: ${rango}.`
    : `${diaVisto === claveDe() ? 'Hoy' : 'Este día'} no toca, pero si hacés, suma.`;
  let estadoTxt = meta
    ? (hechas >= meta ? '¡Semana cumplida!' : `${hechas} de ${meta} esta semana`)
    : 'Sin días elegidos';
  if (ses) {
    estadoTxt = ses.completa
      ? `${duracion(ses.minutos)} · +${ses.xp} XP`
      : `${duracion(ses.minutos)} · para que cuente, desde ${duracion(minimo)}`;
  }
  return `
    <section class="tarjeta" aria-labelledby="t-ejercicio">
      <header class="tarjeta-cab">
        <h2 id="t-ejercicio">💪 Ejercicio en casa</h2>
        <span class="pildora ${meta && hechas >= meta ? 'ok' : ''}">${hechas} de ${meta} esta semana</span>
      </header>
      <div class="sesiones" aria-hidden="true">${puntos}</div>
      <p class="estado-txt">${hoyTxt}</p>
      <p class="chico">${queDias.length ? `Los ${queDias.join(' y ')}. Si un día se complica, otro de la misma semana también vale.` : 'Elegí los días en Ajustes.'}</p>
      <div class="ej-chips">${chips}</div>
      <p class="chico">¿Cuánto duró?</p>
      <div class="segmentos" role="group" aria-label="Duración">${minutos}</div>
      <p class="estado-txt">${estadoTxt}</p>
      ${ses ? '<p class="chico">Tocá el tipo de nuevo para borrar la sesión.</p>' : ''}
    </section>`;
}

function tarjetaPostura(r) {
  const p = r.postura;
  const hechos = new Set(estado.dias[diaVisto]?.postura || []);
  const minutos = Math.round(duracionRutina() / 60);
  const items = RUTINA_POSTURA.map((e) => `
    <li>
      <label class="check">
        <input type="checkbox" data-accion="ejercicio" data-valor="${e.id}" ${hechos.has(e.id) ? 'checked' : ''}>
        <span class="check-caja" aria-hidden="true"></span>
        <span class="check-txt"><b>${e.icono} ${e.nombre}</b><small>${e.para} · ${e.segundos} s</small></span>
      </label>
    </li>`).join('');
  return `
    <section class="tarjeta" aria-labelledby="t-postura">
      <header class="tarjeta-cab">
        <h2 id="t-postura">🧘‍♀️ Postura</h2>
        <span class="pildora ${p.completa ? 'ok' : ''}">${r.toca.postura || p.hechos ? `${p.hechos}/${p.total}` : 'Hoy no toca'}</span>
      </header>
      <p class="chico">Seis ejercicios, unos ${minutos} minutos. Si algo duele, salteálo.</p>
      <button class="btn primario ancho" data-accion="rutina">${p.completa ? 'Repetir la rutina guiada' : p.hechos ? 'Seguir con la rutina guiada' : 'Empezar la rutina guiada'} ▶</button>
      <ul class="lista-ejercicios">${items}</ul>
    </section>`;
}

/* ---- Progreso ----------------------------------------------------------- */

function pantallaProgreso(d) {
  const hoy = claveDe();
  const { totales, rachas, mejores } = d;
  const racha = (ic, nombre, act, mejor, semanas = false) => `
    <div class="racha">
      <span class="racha-ic" aria-hidden="true">${ic}</span>
      <b>${act}</b>
      <span>${nombre}</span>
      <small>mejor: ${mejor} ${semanas ? 'sem.' : (mejor === 1 ? 'día' : 'días')}</small>
    </div>`;

  // Pasos de las últimas dos semanas, con la meta de cada día marcada.
  const dias14 = [];
  for (let i = 13; i >= 0; i -= 1) dias14.push(d.dia(sumarDias(hoy, -i)));
  const tope = Math.max(...dias14.map((x) => Math.max(x.pasos, x.meta.tipo === 'libre' ? 0 : x.meta.meta)), 1);
  const barras = dias14.map((x) => {
    const alto = (x.pasos / tope) * 100;
    const metaAlto = x.meta.tipo === 'libre' ? null : (x.meta.meta / tope) * 100;
    return `<div class="col" title="${fechaLarga(x.clave)}: ${fmt(x.pasos)} pasos">
      <div class="col-zona">
        ${metaAlto != null ? `<i class="col-meta" style="bottom:${metaAlto.toFixed(1)}%"></i>` : ''}
        <i class="col-barra ${x.ok.pasos ? 'ok' : ''}" style="height:${alto.toFixed(1)}%"></i>
      </div>
      <span>${DIAS_CORTOS[diaSemana(x.clave)]}</span>
    </div>`;
  }).join('');

  // Semáforo de la semana: una columna por día, una fila por comida.
  const activas = comidasActivas(estado);
  const dias7 = [];
  for (let i = 6; i >= 0; i -= 1) dias7.push(sumarDias(hoy, -i));
  const rejilla = `
    <div class="rejilla" style="--cols:${dias7.length}">
      <span></span>
      ${dias7.map((k) => `<span class="rejilla-dia">${DIAS_CORTOS[diaSemana(k)]}</span>`).join('')}
      ${activas.map((c) => `
        <span class="rejilla-comida" title="${c.nombre}">${c.icono}</span>
        ${dias7.map((k) => {
          const color = estado.dias[k]?.comidas?.[c.id];
          return `<i class="punto ${COLORES[color] ? `punto-${color}` : ''}" title="${c.nombre}, ${fechaLarga(k)}"></i>`;
        }).join('')}`).join('')}
    </div>`;

  const logros = d.logros.map((l) => `
    <div class="logro ${l.hecho ? 'hecho' : ''}" title="${esc(l.desc)}">
      <span class="logro-ic" aria-hidden="true">${l.icono}</span>
      <b>${l.nombre}</b>
      <small>${l.desc}</small>
      ${l.hecho ? '' : `<div class="barra fina"><i style="width:${((l.actual / l.meta) * 100).toFixed(1)}%"></i></div>`}
    </div>`).join('');

  const escalera = FILOSOFOS.map((f) => {
    const clase = f.nivel < d.nivel.nivel ? 'pasado' : f.nivel === d.nivel.nivel ? 'actual' : 'futuro';
    return `<li class="${clase}"><span class="esc-nivel">${f.nivel}</span>
      <div><b>${f.nombre}</b><small>${f.nota}</small></div></li>`;
  }).join('');

  return `
    <section class="tarjeta destacada">
      <p class="chico">Nivel ${d.nivel.nivel}</p>
      <h2 class="grande">${esc(d.filosofo.nombre)}</h2>
      <p class="cita">“${esc(d.filosofo.nota)}”</p>
      ${d.nivel.nivel < FILOSOFOS.length
        ? `<p class="chico">Te faltan ${fmt(d.nivel.necesita - d.nivel.enNivel)} XP para llegar a ${esc(d.siguiente.nombre)}.</p>`
        : '<p class="chico">Llegaste al final de la escalera.</p>'}
    </section>

    <section class="tarjeta">
      <h2>🔥 Rachas</h2>
      <div class="rachas">
        ${racha('👟', 'pasos', rachas.pasos, mejores.pasos)}
        ${racha('🚦', 'comidas', rachas.comidas, mejores.comidas)}
        ${racha('🧘‍♀️', 'postura', rachas.postura, mejores.postura)}
        ${racha('💪', 'ejercicio', rachas.ejercicio, mejores.ejercicio, true)}
        ${racha('✨', 'plenos', rachas.plenos, mejores.plenos)}
      </div>
      <p class="chico">Los días libres de pasos y los días sin postura no cortan la racha. La del ejercicio se cuenta en semanas cumplidas.</p>
    </section>

    <section class="tarjeta">
      <h2>👟 Últimas dos semanas</h2>
      <div class="columnas">${barras}</div>
      <p class="chico">La rayita es la meta de ese día. En total: ${fmt(totales.pasos)} pasos.</p>
    </section>

    <section class="tarjeta">
      <h2>🚦 La semana en colores</h2>
      ${activas.length ? rejilla : '<p class="chico">No hay comidas elegidas.</p>'}
      <p class="chico">${fmt(totales.verdes)} verdes · ${fmt(totales.comidas - totales.verdes - totales.rojas)} amarillas · ${fmt(totales.rojas)} rojas en total.</p>
    </section>

    <section class="tarjeta">
      <h2>🏅 Logros <span class="chico">${d.logros.filter((l) => l.hecho).length}/${d.logros.length}</span></h2>
      <div class="logros">${logros}</div>
    </section>

    <section class="tarjeta">
      <h2>🏛️ La escalera de filósofos</h2>
      <p class="chico">Un filósofo por nivel, en el orden en que nacieron.</p>
      <ol class="escalera">${escalera}</ol>
    </section>`;
}

/* ---- Ajustes ------------------------------------------------------------ */

function pantallaAjustes() {
  const { pasos, postura } = estado.config;
  const plan = pasos.plan.map((tipo, i) => ({ tipo, i }));
  // La semana empieza el lunes, que es como se piensa.
  const semana = [...plan.slice(1), plan[0]];
  const chipsPlan = semana.map(({ tipo, i }) => `
    <button class="dia-chip tipo-${tipo}" data-accion="plan" data-valor="${i}"
      aria-label="${DIAS_LARGOS[i]}: ${ETIQUETA_TIPO[tipo]}">
      <b>${DIAS_CORTOS[i]}</b><small>${tipo === 'libre' ? '—' : `${Math.round((tipo === 'alta' ? pasos.alta : pasos.suave) / 1000)}k`}</small>
    </button>`).join('');
  const ej = estado.config.ejercicio;
  const chipsEjercicio = [1, 2, 3, 4, 5, 6, 0].map((i) => `
    <button class="dia-chip ${ej.dias.includes(i) ? 'tipo-alta' : 'tipo-libre'}" data-accion="ejercicio-dia" data-valor="${i}"
      aria-pressed="${ej.dias.includes(i)}" aria-label="${DIAS_LARGOS[i]}">
      <b>${DIAS_CORTOS[i]}</b><small>${ej.dias.includes(i) ? '✓' : '—'}</small>
    </button>`).join('');
  const chipsPostura = [1, 2, 3, 4, 5, 6, 0].map((i) => `
    <button class="dia-chip ${postura.dias.includes(i) ? 'tipo-alta' : 'tipo-libre'}" data-accion="postura-dia" data-valor="${i}"
      aria-pressed="${postura.dias.includes(i)}" aria-label="${DIAS_LARGOS[i]}">
      <b>${DIAS_CORTOS[i]}</b><small>${postura.dias.includes(i) ? '✓' : '—'}</small>
    </button>`).join('');
  const comidas = COMIDAS.map((c) => `
    <label class="interruptor">
      <span>${c.icono} ${c.nombre}</span>
      <input type="checkbox" data-accion="comida-activa" data-valor="${c.id}" ${estado.config.comidas.includes(c.id) ? 'checked' : ''}>
    </label>`).join('');

  return `
    <section class="tarjeta">
      <h2>🙋‍♀️ Tu nombre</h2>
      <form class="pasos-form" data-form="nombre">
        <label class="sr" for="in-nombre">Nombre</label>
        <input id="in-nombre" name="nombre" type="text" maxlength="30" placeholder="Para saludarte" value="${esc(estado.nombre)}">
        <button class="btn primario" type="submit">Guardar</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>👟 Pasos</h2>
      <p class="chico">Las dos metas que usás. Cumplir cualquiera de las dos vale lo mismo: 100 XP.</p>
      <form class="metas" data-form="metas">
        <label>Día largo<input name="alta" type="number" inputmode="numeric" min="500" step="500" value="${pasos.alta}"></label>
        <label>Día suave<input name="suave" type="number" inputmode="numeric" min="500" step="500" value="${pasos.suave}"></label>
        <button class="btn primario" type="submit">Guardar</button>
      </form>
      <p class="chico">Qué días hacés cada una. Tocá un día para cambiarlo: largo → suave → libre.</p>
      <div class="semana">${chipsPlan}</div>
      <p class="leyenda"><i class="tipo-alta"></i> largo <i class="tipo-suave"></i> suave <i class="tipo-libre"></i> libre</p>
      <p class="chico">Un día puntual también se cambia desde Hoy, sin tocar el plan.</p>
    </section>

    <section class="tarjeta">
      <h2>🚦 Comidas del semáforo</h2>
      ${comidas}
    </section>

    <section class="tarjeta">
      <h2>💪 Ejercicio en casa</h2>
      <p class="chico">Qué días toca. La semana se cumple con tantas sesiones como días marcados, aunque cambies alguno de lugar.</p>
      <div class="semana">${chipsEjercicio}</div>
      <p class="chico">Cuánto dura una sesión. Llegar al mínimo cumple; hasta el máximo suma un poco más.</p>
      <form class="metas" data-form="ejercicio">
        <label>Mínimo (min)<input name="minimo" type="number" inputmode="numeric" min="5" max="240" step="5" value="${ej.minimo}"></label>
        <label>Máximo (min)<input name="maximo" type="number" inputmode="numeric" min="5" max="300" step="5" value="${ej.maximo}"></label>
        <button class="btn primario" type="submit">Guardar</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>🧘‍♀️ Días de postura</h2>
      <div class="semana">${chipsPostura}</div>
      <p class="chico">Los días apagados la rutina no se pide, pero si la hacés, suma.</p>
    </section>

    <section class="tarjeta">
      <h2>💾 Copia de seguridad</h2>
      <p class="chico">Todo vive sólo en este teléfono. Bajate una copia de vez en cuando.</p>
      <div class="fila-btn">
        <button class="btn suave" data-accion="exportar">Exportar</button>
        <label class="btn suave">Importar<input type="file" accept="application/json,.json" data-accion="importar" hidden></label>
      </div>
      <button class="btn peligro ancho" data-accion="borrar">Borrar todo</button>
    </section>
    <p class="pie">Ataraxia · la calma que da hacer lo que uno se propuso.</p>`;
}

/* -------------------------------------------------------------------------
   Acciones
   ------------------------------------------------------------------------- */

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el || el.tagName === 'INPUT') return;
  const { accion, valor } = el.dataset;

  if (accion === 'vista') {
    vista = valor;
    if (vista === 'hoy') diaVisto = claveDe();
    dibujar();
    window.scrollTo(0, 0);
  } else if (accion === 'dia') {
    const nuevo = sumarDias(diaVisto, Number(valor));
    if (nuevo <= claveDe()) { diaVisto = nuevo; dibujar(); }
  } else if (accion === 'tipo-pasos') {
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      const delPlan = estado.config.pasos.plan[diaSemana(diaVisto)];
      if (valor === delPlan) delete dia.tipoPasos;
      else dia.tipoPasos = valor;
    });
  } else if (accion === 'sumar-pasos') {
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      dia.pasos = Math.min(200000, (dia.pasos || 0) + Number(valor));
    });
  } else if (accion === 'comida') {
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      dia.comidas = dia.comidas || {};
      if (dia.comidas[el.dataset.comida] === valor) delete dia.comidas[el.dataset.comida];
      else dia.comidas[el.dataset.comida] = valor;
    });
  } else if (accion === 'rutina') {
    abrirRutina();
  } else if (accion === 'plan') {
    cambiar(() => {
      const i = Number(valor);
      const plan = estado.config.pasos.plan;
      plan[i] = TIPOS_PASOS[(TIPOS_PASOS.indexOf(plan[i]) + 1) % TIPOS_PASOS.length];
    });
  } else if (accion === 'ejercicio-tipo') {
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      const actual = ejercicioDelDia(estado, diaVisto);
      if (actual?.tipo === valor) delete dia.ejercicio;
      else dia.ejercicio = { tipo: valor, minutos: actual?.minutos || estado.config.ejercicio.minimo };
    });
  } else if (accion === 'ejercicio-min') {
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      const actual = ejercicioDelDia(estado, diaVisto);
      dia.ejercicio = { tipo: actual?.tipo || 'otro', minutos: Number(valor) };
    });
  } else if (accion === 'ejercicio-dia') {
    cambiar(() => {
      const i = Number(valor);
      const dias = estado.config.ejercicio.dias;
      estado.config.ejercicio.dias = dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i];
    });
  } else if (accion === 'postura-dia') {
    cambiar(() => {
      const i = Number(valor);
      const dias = estado.config.postura.dias;
      estado.config.postura.dias = dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i];
    });
  } else if (accion === 'exportar') {
    exportar();
  } else if (accion === 'borrar') {
    if (confirm('¿Borrar todo el historial y los ajustes? No se puede deshacer.')) {
      estado = estadoInicial();
      guardar();
      dibujar();
      aviso('Listo, empezás de cero.');
    }
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const { accion, valor } = el.dataset || {};
  if (accion === 'ejercicio') {
    cambiar(() => marcarEjercicio(diaVisto, valor, el.checked));
  } else if (accion === 'comida-activa') {
    cambiar(() => {
      const set = new Set(estado.config.comidas);
      if (el.checked) set.add(valor); else set.delete(valor);
      estado.config.comidas = COMIDAS.map((c) => c.id).filter((id) => set.has(id));
    });
  } else if (accion === 'importar' && el.files?.[0]) {
    importar(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const datos = new FormData(form);
  if (form.dataset.form === 'pasos') {
    const n = Math.round(Number(datos.get('pasos')));
    if (!Number.isFinite(n) || n < 0 || n > 200000) { aviso('Ese número no parece de pasos.'); return; }
    cambiar(() => {
      const dia = diaEditable(diaVisto);
      if (n) dia.pasos = n; else delete dia.pasos;
    });
    aviso('Pasos guardados');
  } else if (form.dataset.form === 'metas') {
    const alta = Math.round(Number(datos.get('alta')));
    const suave = Math.round(Number(datos.get('suave')));
    if (!(alta >= 500 && suave >= 500 && alta <= 100000 && suave <= 100000)) {
      aviso('Las metas tienen que estar entre 500 y 100.000.');
      return;
    }
    cambiar(() => { estado.config.pasos.alta = alta; estado.config.pasos.suave = suave; });
    aviso('Metas guardadas');
  } else if (form.dataset.form === 'ejercicio') {
    const minimo = Math.round(Number(datos.get('minimo')));
    const maximo = Math.round(Number(datos.get('maximo')));
    if (!(minimo >= 5 && minimo <= 240 && maximo >= minimo && maximo <= 300)) {
      aviso('El mínimo va de 5 a 240 minutos y el máximo no puede ser menor.');
      return;
    }
    cambiar(() => { estado.config.ejercicio.minimo = minimo; estado.config.ejercicio.maximo = maximo; });
    aviso('Duración guardada');
  } else if (form.dataset.form === 'nombre') {
    cambiar(() => { estado.nombre = String(datos.get('nombre') || '').trim().slice(0, 30); });
    aviso('Guardado');
  }
});

function marcarEjercicio(clave, id, hecho) {
  const dia = diaEditable(clave);
  const set = new Set(dia.postura || []);
  if (hecho) set.add(id); else set.delete(id);
  dia.postura = RUTINA_POSTURA.map((e) => e.id).filter((x) => set.has(x));
}

/* -------------------------------------------------------------------------
   Rutina guiada: un ejercicio por vez con cuenta regresiva.
   ------------------------------------------------------------------------- */

const $capa = document.getElementById('capa');
let rutina = null;

function abrirRutina() {
  const hechos = new Set(estado.dias[diaVisto]?.postura || []);
  // Arranca por el primero que falte; si ya estaba todo, desde el principio.
  let i = RUTINA_POSTURA.findIndex((e) => !hechos.has(e.id));
  if (i < 0) i = 0;
  rutina = { i, resta: RUTINA_POSTURA[i].segundos, pausa: false, timer: null, clave: diaVisto };
  $capa.hidden = false;
  document.body.classList.add('sin-scroll');
  dibujarRutina();
  rutina.timer = setInterval(tic, 1000);
}

function cerrarRutina() {
  if (!rutina) return;
  clearInterval(rutina.timer);
  rutina = null;
  $capa.hidden = true;
  $capa.innerHTML = '';
  document.body.classList.remove('sin-scroll');
}

function tic() {
  if (!rutina || rutina.pausa) return;
  rutina.resta -= 1;
  if (rutina.resta <= 0) siguienteEjercicio(true);
  else dibujarRutina();
}

function siguienteEjercicio(completado) {
  const e = RUTINA_POSTURA[rutina.i];
  if (completado) {
    const clave = rutina.clave;
    cambiar(() => marcarEjercicio(clave, e.id, true));
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }
  if (rutina.i >= RUTINA_POSTURA.length - 1) {
    const completa = RUTINA_POSTURA.every((x) => (estado.dias[rutina.clave]?.postura || []).includes(x.id));
    cerrarRutina();
    if (completa) celebrar('Rutina de postura completa 🧘‍♀️');
    return;
  }
  rutina.i += 1;
  rutina.resta = RUTINA_POSTURA[rutina.i].segundos;
  dibujarRutina();
}

function dibujarRutina() {
  const e = RUTINA_POSTURA[rutina.i];
  const pct = 1 - rutina.resta / e.segundos;
  const puntos = RUTINA_POSTURA.map((_, j) => `<i class="${j < rutina.i ? 'listo' : j === rutina.i ? 'ahora' : ''}"></i>`).join('');
  $capa.innerHTML = `
    <div class="guia" role="dialog" aria-modal="true" aria-labelledby="guia-titulo">
      <button class="icono-btn guia-cerrar" data-guia="cerrar" aria-label="Cerrar">✕</button>
      <div class="guia-puntos">${puntos}</div>
      <p class="chico">${rutina.i + 1} de ${RUTINA_POSTURA.length} · ${esc(e.para)}</p>
      <div class="guia-icono" aria-hidden="true">${e.icono}</div>
      <h2 id="guia-titulo">${esc(e.nombre)}</h2>
      ${anillo(pct, `<b>${rutina.resta}</b><small>seg</small>`, 'anillo-guia')}
      <p class="guia-como">${esc(e.como)}</p>
      <div class="fila-btn">
        <button class="btn suave" data-guia="pausa">${rutina.pausa ? 'Seguir' : 'Pausa'}</button>
        <button class="btn suave" data-guia="saltar">Saltear</button>
        <button class="btn primario" data-guia="listo">Listo ✓</button>
      </div>
    </div>`;
}

$capa.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-guia]');
  if (!el || !rutina) return;
  const que = el.dataset.guia;
  if (que === 'cerrar') cerrarRutina();
  else if (que === 'pausa') { rutina.pausa = !rutina.pausa; dibujarRutina(); }
  else if (que === 'saltar') siguienteEjercicio(false);
  else if (que === 'listo') siguienteEjercicio(true);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && rutina) cerrarRutina();
});

/* -------------------------------------------------------------------------
   Copias
   ------------------------------------------------------------------------- */

function exportar() {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ataraxia-${claveDe()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importar(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const datos = JSON.parse(lector.result);
      if (!datos || typeof datos !== 'object' || !datos.dias) throw new Error('formato');
      if (!confirm('¿Reemplazar lo que hay en este teléfono por la copia?')) return;
      estado = normalizar(datos);
      guardar();
      dibujar();
      aviso('Copia restaurada');
    } catch {
      aviso('Ese archivo no es una copia de Ataraxia.');
    }
  };
  lector.readAsText(archivo);
}

/* -------------------------------------------------------------------------
   Avisos y celebraciones
   ------------------------------------------------------------------------- */

const $avisos = document.getElementById('avisos');

function aviso(texto) {
  const el = document.createElement('div');
  el.className = 'aviso';
  el.textContent = texto;
  $avisos.appendChild(el);
  setTimeout(() => el.classList.add('fuera'), 2600);
  setTimeout(() => el.remove(), 3100);
}

function celebrar(texto) {
  aviso(texto);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const capa = document.createElement('div');
  capa.className = 'chispas';
  capa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i += 1) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.setProperty('--h', `${190 + Math.random() * 50}`);
    capa.appendChild(s);
  }
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 2200);
}

/* -------------------------------------------------------------------------
   Arranque
   ------------------------------------------------------------------------- */

// Si la app queda abierta y pasa la medianoche, "Hoy" tiene que ser el día nuevo.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (vista === 'hoy' && !rutina) { diaVisto = claveDe(); dibujar(); }
});

dibujar();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
