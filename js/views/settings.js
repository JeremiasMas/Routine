// Ajustes: metas, actividades, copia de seguridad.
import { el, formatValue } from '../utils.js';
import {
  getData, getState, updateActivity, updateSettings, addActivity,
  removeActivity, exportData, importData, resetAll,
} from '../state.js';
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
      el('div', { class: 'row__sub', text: `${formatValue(a.goal, a.unit)}${a.streakMode === 'weekly' ? ` · ${a.weeklyTarget}× por semana` : ' · por día'}` })),
    el('span', { class: 'muted', text: '✎' })))));

  root.append(el('div', { style: 'margin-top:10px' },
    el('button', { class: 'btn btn--block', onClick: () => editActivity(null, navigate) }, '+ Agregar actividad')));

  // --- Preferencias ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Preferencias' })));
  root.append(el('div', { class: 'card' },
    toggle('Sonidos', 'Efectos al sumar XP y subir de nivel.', data.settings.sound, (v) => updateSettings({ sound: v })),
    toggle('Celebraciones', 'Confeti y pantalla al subir de nivel.', data.settings.celebrate !== false, (v) => updateSettings({ celebrate: v }))));

  // --- Datos ---
  root.append(el('div', { class: 'section-title' }, el('h2', { text: 'Tus datos' })));
  root.append(el('div', { class: 'card' },
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
    };
    if (isNew) addActivity(patch);
    else updateActivity(a.id, patch);
    closeSheet();
    navigate();
    toast('✅', isNew ? 'Actividad creada.' : 'Meta actualizada.');
  }

  openSheet(isNew ? 'Nueva actividad' : `Editar ${a.name}`, body);
}

function doExport() {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `rutina-rpg-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    el('p', { class: 'hint' }, 'Se borra todo el historial, la XP, los niveles y los logros de este dispositivo. No se puede deshacer. Si no exportaste una copia, hacelo antes.'),
    el('div', { class: 'btn-row', style: 'margin-top:16px' },
      el('button', { class: 'btn btn--block', onClick: () => closeSheet() }, 'Mejor no'),
      el('button', { class: 'btn btn--danger', onClick: () => { resetAll(); closeSheet(); location.hash = '#/'; navigate(); toast('🧹', 'Empezás de cero.'); } }, 'Sí, borrar todo')));
  openSheet('¿Borrar todo el progreso?', body);
}
