// Ajustes: metas, actividades, copia de seguridad.
import { el, formatValue, formatNumber, shortDate, weekdayShort, scheduleLabel, todayKey } from '../utils.js';
import {
  getData, getState, updateActivity, updateSettings, addActivity,
  removeActivity, exportData, importData, resetAll, bulkSetEntries,
  diasSinBackup, backupVencido, markExported, DIAS_SIN_BACKUP,
} from '../state.js';
import { parseStepsCsv, diffSteps, elegirArchivosDePasos } from '../steps-import.js';
import { enApp, nativo, mensajeDeEstado, pedirPermiso, instalarHealthConnect, refrescar as refrescarNativo, guardarArchivo, capacidades } from '../native.js';
import { listarEntradas, extraerTextos } from '../zip.js';
import { waterGoalMl, bodySummary } from '../body.js';
import { stat } from '../ui/components.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { toast } from '../ui/feedback.js';

export function render({ navigate }) {
  const data = getData();
  const state = getState();
  const root = el('div', {});

  // --- Metas por actividad ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Tus metas' }), el('small', { text: 'cumplirlas = 100 XP' })));
  root.append(el('div', { class: 'list' }, data.activities.map((a) => el('button', {
    class: 'row', style: 'width:100%;text-align:left',
    onClick: () => editActivity(a, navigate),
  },
    el('span', { style: 'font-size:1.3rem', text: a.icon }),
    el('div', { class: 'row__main' },
      el('div', { text: a.name }),
      el('div', { class: 'row__sub', text: `${formatValue(a.goal, a.unit)} · ${a.streakMode === 'weekly' ? `${a.weeklyTarget}× por semana` : scheduleLabel(a.days)}` })),
    el('span', { class: 'muted', text: '✎' })))));

  root.append(el('div', { style: 'margin-top:10px' },
    el('button', { class: 'btn btn--block', onClick: () => editActivity(null, navigate) }, '+ Agregar actividad')));

  // --- Perfil corporal ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Tu cuerpo' }), el('small', { text: 'alimenta los cálculos' })));
  const estatura = el('input', { type: 'number', min: '100', max: '230', step: '0.5', value: String(data.settings.height || 160) });
  const formula = el('select', {},
    el('option', { value: '3', selected: (data.settings.bodyFormula || '3') === '3' }, 'Cintura, cuello y estatura'),
    el('option', { value: '4', selected: data.settings.bodyFormula === '4' }, 'Cintura, cuello, cadera y estatura'));
  const guardarPerfil = () => {
    updateSettings({ height: Math.max(100, Number(estatura.value) || 160), bodyFormula: formula.value });
    navigate();
    toast('✅', 'Perfil actualizado.');
  };
  estatura.addEventListener('change', guardarPerfil);
  formula.addEventListener('change', guardarPerfil);
  root.append(el('div', { class: 'card' },
    el('div', { class: 'field' }, el('label', { text: 'Estatura (cm)' }), estatura),
    el('div', { class: 'field' }, el('label', { text: 'Fórmula de grasa corporal' }), formula),
    (() => {
      const linea = bodySummary(
        { weight: data.settings.weight, waist: data.settings.waist, neck: data.settings.neck, hip: data.settings.hip },
        data.settings,
      );
      return linea.fatPct != null
        ? el('p', { class: 'hint' },
            `Línea de base: ${formatNumber(linea.waist)} cm de cintura y ${formatNumber(linea.neck)} de cuello con ${formatNumber(linea.weight)} kg dan ` +
            `${formatNumber(linea.fatPct)}% de grasa (${formatNumber(linea.mass.fat)} kg) y ${formatNumber(linea.mass.lean)} kg de masa magra.`)
        : null;
    })(),
    el('p', { class: 'hint', style: 'margin-top:8px' },
      `Método de circunferencias de la Marina de EE.UU. La versión de 3 medidas es la que se usa para hombres; la de 4, que suma la cadera, para mujeres. ` +
      `Con ${formatNumber(data.settings.weight || 61.5)} kg la meta de agua es ${formatValue(waterGoalMl(data.settings.weight || 61.5), 'ml')} por día y se actualiza sola cada vez que te medís.`)));

  // --- Pasos desde Samsung Health ---
  root.append(el('div', { class: 'section-title' },
    el('h2', { text: 'Pasos' }), el('small', { text: 'Samsung Health' })));

  // Adentro de la app de Android los pasos llegan solos por Health Connect.
  if (enApp()) root.append(tarjetaNativa(navigate));

  root.append(el('div', { class: 'card' },
    el('p', { class: 'hint' },
      'Samsung Health no tiene una conexión en vivo para aplicaciones web: su SDK es solo para apps Android del programa de socios, y Health Connect no se puede leer desde el navegador. Lo que sí funciona es traer los datos de su exportación oficial, que podés repetir cuando quieras.'),
    el('ol', { class: 'hint', style: 'margin:10px 0 0;padding-left:18px;line-height:1.7' },
      el('li', {}, 'Samsung Health → ⚙ Ajustes → ', el('b', {}, 'Descargar datos personales'), '.'),
      el('li', {}, 'Elegí acá el ', el('b', {}, 'ZIP tal cual te llega'), ': la app busca sola el archivo de pasos adentro. (También acepta un CSV suelto.)')),
    el('div', { class: 'btn-row', style: 'margin-top:12px' },
      el('button', { class: 'btn btn--primary', style: '--c:#34d399', onClick: () => importarPasos(navigate) }, '⬆ Importar pasos (ZIP o CSV)')),
    el('p', { class: 'hint', style: 'margin-top:12px' },
      'Para una caminata suelta hay otro camino, sin esperar la exportación: el ',
      el('b', {}, 'modo caminata'), ' en la pantalla de Pasos cuenta con el acelerómetro del teléfono ',
      'mientras tenés la app abierta. Sirve para la caminata del día, no para el total: ',
      'el navegador no recibe el sensor con la pantalla apagada.')));

  // --- Preferencias ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Preferencias' })));
  root.append(el('div', { class: 'card' },
    toggle('Sonidos', 'Efectos al sumar XP y subir de nivel.', data.settings.sound, (v) => updateSettings({ sound: v })),
    toggle('Celebraciones', 'Confeti y pantalla al subir de nivel.', data.settings.celebrate !== false, (v) => updateSettings({ celebrate: v }))));

  // --- Datos ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Tus datos' })));
  root.append(el('div', { class: 'card' },
    (() => {
      const dias = diasSinBackup();
      if (dias === null) return null;
      if (!backupVencido()) {
        return el('p', { class: 'hint', style: 'color:var(--ok)' },
          dias === 0 ? '✓ Copia de seguridad hecha hoy.' : `✓ Última copia hace ${dias} ${dias === 1 ? 'día' : 'días'}.`);
      }
      return el('div', { class: 'row', style: 'border-color:color-mix(in srgb, var(--danger) 45%, var(--line));background:rgba(251,113,133,.08);margin-bottom:10px' },
        el('span', { style: 'font-size:1.3rem' }, '⚠️'),
        el('div', { class: 'row__main' },
          el('div', { style: 'font-weight:650', text: dias === Infinity ? 'Nunca exportaste tu progreso' : `Hace ${dias} días que no exportás` }),
          el('div', { class: 'row__sub', text: 'Si se borran los datos de este navegador, se pierde todo.' })));
    })(),
    el('p', { class: 'hint' }, 'Todo se guarda solamente en este dispositivo, en el navegador. Exportá de vez en cuando para no perder el progreso si borrás los datos del navegador o cambiás de teléfono.'),
    el('div', { class: 'btn-row', style: 'margin-top:12px' },
      el('button', { class: 'btn', onClick: doExport }, '⬇ Exportar'),
      el('button', { class: 'btn', onClick: doImport }, '⬆ Importar'),
      el('button', { class: 'btn btn--danger', onClick: () => doReset(navigate) }, 'Borrar todo'))));

  root.append(el('p', { class: 'hint', style: 'margin-top:18px;text-align:center' },
    `Rutina RPG · ${state.activities.length} disciplinas · ${Object.keys(data.entries).length} días registrados`));

  return root;
}

function toggle(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, role: 'switch', 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'switch' },
    el('div', {}, el('div', { class: 'switch__label', text: label }), el('div', { class: 'switch__hint', text: hint })),
    input);
}

function editActivity(activity, navigate) {
  const isNew = !activity;
  const a = activity || { name: '', icon: '🎯', color: '#22d3ee', unit: 'min', goal: 30, step: 5, streakMode: 'daily', weeklyTarget: 3 };
  const f = {};
  const field = (key, label, attrs = {}) => {
    f[key] = el('input', { value: a[key] ?? '', ...attrs });
    return el('div', { class: 'field' }, el('label', { text: label }), f[key]);
  };

  const mode = el('select', {},
    el('option', { value: 'daily', selected: a.streakMode !== 'weekly' }, 'Todos los días'),
    el('option', { value: 'weekly', selected: a.streakMode === 'weekly' }, 'X veces por semana'));
  const weeklyTarget = el('input', { type: 'number', min: '1', max: '7', value: String(a.weeklyTarget || 3) });
  const weeklyField = el('div', { class: 'field', style: a.streakMode === 'weekly' ? '' : 'display:none' },
    el('label', { text: 'Veces por semana' }), weeklyTarget);
  mode.addEventListener('change', () => { weeklyField.style.display = mode.value === 'weekly' ? '' : 'none'; });

  // Días en que toca: los libres no rompen la racha.
  const diasSel = new Set(a.days || []);
  const diaBtns = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const btn = el('button', {
      type: 'button', class: `presets-day${diasSel.has(d) ? ' is-active' : ''}`,
      style: `--c:${a.color}`, 'aria-pressed': diasSel.has(d) ? 'true' : 'false',
      onClick: () => {
        if (diasSel.has(d)) diasSel.delete(d); else diasSel.add(d);
        btn.classList.toggle('is-active', diasSel.has(d));
        btn.setAttribute('aria-pressed', diasSel.has(d) ? 'true' : 'false');
      },
    }, weekdayShort(d));
    return btn;
  });
  const diasField = el('div', { class: 'field' },
    el('label', { text: 'Días en que toca' }),
    el('div', { class: 'presets' }, diaBtns),
    el('p', { class: 'hint' }, 'Sin ninguno marcado se espera todos los días. Los días libres no rompen la racha, y si hacés de más igual suma.'));

  const body = el('div', {},
    el('p', { class: 'hint', style: 'margin-bottom:12px' }, 'La meta es la vara de 100 XP: si la subís, cada registro rinde menos; si la bajás, rinde más. Tu XP acumulada se recalcula sola.'),
    el('div', { class: 'field-row' },
      field('icon', 'Emoji', { maxlength: '4' }),
      field('color', 'Color', { type: 'color' })),
    field('name', 'Nombre'),
    el('div', { class: 'field-row' },
      field('goal', 'Meta diaria', { type: 'number', min: '1', step: 'any', inputmode: 'decimal' }),
      field('unit', 'Unidad')),
    el('div', { class: 'field' }, el('label', { text: 'Frecuencia esperada' }), mode),
    weeklyField,
    diasField,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn--primary btn--block', onClick: save }, isNew ? 'Crear actividad' : 'Guardar'),
      !isNew && !['datos', 'piano', 'gym', 'muaythai', 'pasos', 'duolingo', 'substack'].includes(a.id)
        ? el('button', { class: 'btn btn--danger', onClick: () => { removeActivity(a.id); closeSheet(); navigate(); } }, 'Eliminar')
        : null));

  function save() {
    const patch = {
      name: f.name.value.trim() || a.name || 'Nueva actividad',
      icon: f.icon.value.trim() || '🎯',
      color: f.color.value || a.color,
      unit: f.unit.value.trim() || 'min',
      goal: Math.max(1, Number(f.goal.value) || 1),
      streakMode: mode.value,
      weeklyTarget: Math.max(1, Number(weeklyTarget.value) || 1),
      days: [...diasSel].sort(),
    };
    if (isNew) addActivity(patch);
    else updateActivity(a.id, patch);
    closeSheet();
    navigate();
    toast('✅', isNew ? 'Actividad creada.' : 'Meta actualizada.');
  }

  openSheet(isNew ? 'Nueva actividad' : `Editar ${a.name}`, body);
}

/** Importa pasos de uno o más CSV, mostrando antes qué va a cambiar. */
function importarPasos(navigate) {
  const input = el('input', { type: 'file', accept: '.zip,.csv,text/csv,application/zip', multiple: true });
  input.addEventListener('change', async () => {
    const archivos = [...(input.files || [])];
    if (!archivos.length) return;

    const porDia = new Map();
    const errores = [];
    let descartadas = 0;
    /** Un ZIP puede traer varios CSV; un CSV suelto es uno solo. */
    async function textosDe(archivo) {
      if (!/\.zip$/i.test(archivo.name)) return [{ name: archivo.name, text: await archivo.text() }];
      const buffer = await archivo.arrayBuffer();
      // Primero se eligen los nombres y recién después se descomprime: un
      // export trae miles de archivos y no tiene sentido abrirlos todos.
      const nombres = listarEntradas(buffer).filter((e) => !e.name.endsWith('/')).map((e) => e.name);
      const elegidos = new Set(elegirArchivosDePasos(nombres));
      if (!elegidos.size) throw new Error('no encontré ningún archivo de pasos adentro del ZIP');
      return extraerTextos(buffer, (n) => elegidos.has(n));
    }

    for (const archivo of archivos) {
      try {
        for (const { name, text } of await textosDe(archivo)) {
          const r = parseStepsCsv(text);
          if (r.error) { errores.push(`${name.split('/').pop()}: ${r.error}`); continue; }
          descartadas += r.skipped;
          for (const { date, steps } of r.days) porDia.set(date, Math.max(porDia.get(date) || 0, steps));
        }
      } catch (err) {
        errores.push(`${archivo.name}: ${err.message}`);
      }
    }

    const dias = [...porDia.entries()].map(([date, steps]) => ({ date, steps }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!dias.length) {
      openSheet('No se pudo importar', el('div', {},
        el('p', { class: 'hint' }, errores.join(' · ') || 'No encontré días con pasos en esos archivos.'),
        el('button', { class: 'btn btn--block', style: 'margin-top:14px', onClick: closeSheet }, 'Entendido')));
      return;
    }

    const cambios = diffSteps(dias, getData().entries);
    const muestra = dias.length > 6 ? [...dias.slice(0, 3), null, ...dias.slice(-3)] : dias;
    openSheet('Revisá antes de importar', el('div', {},
      el('div', { class: 'stat-grid' },
        stat(cambios.total, 'Días'),
        stat(cambios.nuevos, 'Nuevos'),
        stat(cambios.cambiados, 'Se pisan'),
        stat(cambios.iguales, 'Ya estaban')),
      el('div', { class: 'section-title' },
        el('h2', { text: 'Qué se va a cargar' }),
        el('small', { text: `${shortDate(dias[0].date)} – ${shortDate(dias[dias.length - 1].date)}` })),
      el('div', { class: 'list' }, muestra.map((d) => d === null
        ? el('div', { class: 'row', style: 'justify-content:center;color:var(--muted)' }, '⋯')
        : el('div', { class: 'row' },
            el('div', { class: 'row__main', text: shortDate(d.date) }),
            el('div', { class: 'row__value', text: formatNumber(d.steps) })))),
      descartadas ? el('p', { class: 'hint', style: 'margin-top:10px', text: `Se descartaron ${descartadas} filas que no tenían fecha o número de pasos válidos.` }) : null,
      errores.length ? el('p', { class: 'hint', style: 'margin-top:10px;color:var(--danger)', text: errores.join(' · ') }) : null,
      cambios.cambiados
        ? el('p', { class: 'hint', style: 'margin-top:10px' }, `Ojo: ${cambios.cambiados} ${cambios.cambiados === 1 ? 'día ya tenía' : 'días ya tenían'} pasos cargados a mano y se van a reemplazar por los de Samsung Health.`)
        : null,
      el('div', { class: 'btn-row', style: 'margin-top:16px' },
        el('button', { class: 'btn btn--primary btn--block', style: '--c:#34d399',
          onClick: () => {
            bulkSetEntries('pasos', dias.map((d) => ({ date: d.date, value: d.steps, source: 'samsung-health' })));
            closeSheet();
            navigate();
            toast('👟', `<b>${cambios.total} días</b> de pasos importados.`, 4000);
          } }, `Importar ${cambios.total} días`),
        el('button', { class: 'btn', onClick: closeSheet }, 'Cancelar'))));
  });
  input.click();
}

function doExport() {
  const nombre = `rutina-rpg-${new Date().toISOString().slice(0, 10)}.json`;
  // Adentro de la app de Android el blob no descarga nada: lo guarda la app.
  if (guardarArchivo(nombre, exportData())) {
    markExported();
    toast('⬇', 'Copia guardada en Descargas.');
    return;
  }
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: nombre });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported();
  toast('⬇', 'Copia de seguridad descargada.');
}

function doImport() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      importData(await file.text());
      toast('⬆', 'Progreso restaurado.');
      location.hash = '#/';
    } catch (err) {
      toast('⚠️', `No se pudo importar: ${err.message}`, 5000);
    }
  });
  input.click();
}

function doReset(navigate) {
  const body = el('div', {},
    el('p', { class: 'hint' }, 'Se borra todo lo que registraste en la app: XP, niveles, rachas y logros de este dispositivo. No se puede deshacer, así que si no exportaste una copia, hacelo antes. El historial previo a la app (las clases de muay thai desde 2025) se vuelve a cargar, porque no depende de lo que hagas acá.'),
    el('div', { class: 'btn-row', style: 'margin-top:16px' },
      el('button', { class: 'btn btn--block', onClick: () => closeSheet() }, 'Mejor no'),
      el('button', { class: 'btn btn--danger', onClick: () => { resetAll(); closeSheet(); location.hash = '#/'; navigate(); toast('🧹', 'Empezás de cero.'); } }, 'Sí, borrar todo')));
  openSheet('¿Borrar todo el progreso?', body);
}


/**
 * Estado del puente con Health Connect. Sólo aparece adentro de la app de
 * Android: en Chrome no hay puente que mostrar.
 */
function tarjetaNativa(navigate) {
  const msg = mensajeDeEstado(nativo.estado);
  const dias = Object.keys(nativo.dias || {}).length;
  const hoy = nativo.dias?.[todayKey()];

  const card = el('div', { class: 'card' },
    el('div', { style: 'display:flex;align-items:center;gap:10px' },
      el('span', { style: 'font-size:1.3rem', text: msg.ok ? '✅' : '⚠️' }),
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { style: 'font-weight:700', text: 'Health Connect' }),
        el('div', { class: 'hint', text: msg.texto }))));

  if (msg.ok) {
    card.append(el('p', { class: 'hint', style: 'margin-top:10px' },
      hoy != null
        ? `Hoy llevás ${formatNumber(hoy)} pasos según Samsung Health. `
        : 'Todavía no hay pasos registrados hoy. ',
      dias > 0 ? `Se sincronizan los últimos ${dias} días con datos, cada vez que abrís la app.` : ''));
    card.append(el('div', { class: 'btn-row', style: 'margin-top:12px' },
      el('button', { class: 'btn', onClick: () => refrescarNativo() }, '🔄 Volver a leer')));
  } else if (msg.accion) {
    card.append(el('div', { class: 'btn-row', style: 'margin-top:12px' },
      el('button', { class: 'btn btn--primary', style: '--c:#34d399',
        onClick: () => (msg.accion === 'permiso' ? pedirPermiso() : instalarHealthConnect()) },
        msg.boton)));
  }

  if (nativo.diagnostico) {
    const d = nativo.diagnostico;
    card.append(el('details', { style: 'margin-top:12px' },
      el('summary', { class: 'hint', style: 'cursor:pointer', text: 'Diagnóstico' }),
      el('div', { class: 'hint', style: 'margin-top:8px;line-height:1.7' },
        el('div', { text: `App: versión ${d.version || '—'}` }),
        el('div', { text: `Teléfono: ${d.telefono || '—'} (Android API ${d.android || '—'})` }),
        el('div', { text: `Health Connect: estado ${d.sdkHealthConnect}` }),
        el('div', { text: `Permiso de pasos: ${d.permiso ? 'concedido' : 'falta'}` }),
        el('div', { text: `Sensor de pasos del sistema: ${d.sensorDePasos ? 'sí' : 'no'}` }),
        el('div', { text: `Días recibidos: ${dias}` }),
        (() => {
          const c = capacidades();
          return el('div', { text: `WebView: Chrome ${c.chrome || '—'} · ZIP ${c.zip ? 'sí' : 'NO'} · guardar ${c.guardar ? 'sí' : 'NO'}` });
        })())));
  }

  return card;
}
