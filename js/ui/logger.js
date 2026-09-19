// Hojas de registro: número simple, sesión de gimnasio y publicación semanal.
import { el, formatValue, formatNumber, relativeDay, uid } from '../utils.js';
import { openSheet } from './sheet.js';
import { getEntry, setEntry, getState } from '../state.js';
import { previewXp } from '../derive.js';
import { gymVolume, estimatedOneRepMax } from '../xp.js';

/** Abre el registrador correcto para la actividad. */
export function openLogger(activity, dateKey, onSaved) {
  const title = `${activity.icon} ${activity.name} · ${relativeDay(dateKey)}`;
  if (activity.kind === 'gym') return openSheet(title, gymForm(activity, dateKey, onSaved));
  return openSheet(title, numberForm(activity, dateKey, onSaved));
}

function footer(activity, dateKey, getPayload, getValue, onSaved, existing) {
  const preview = el('span', { class: 'xp-preview' });
  const save = el('button', { class: 'btn btn--primary btn--block', style: `--c:${activity.color}` }, 'Guardar');
  const remove = existing
    ? el('button', { class: 'btn btn--danger', onClick: () => { setEntry(dateKey, activity.id, null); onSaved?.(null); } }, 'Borrar')
    : null;

  save.addEventListener('click', () => {
    const payload = getPayload();
    if (!payload) return;
    const events = setEntry(dateKey, activity.id, payload);
    onSaved?.(events, getValue());
  });

  const update = () => {
    const value = getValue();
    const xp = previewXp(getState(), activity, value);
    const goal = Number(activity.goal) || 1;
    preview.innerHTML = value > 0
      ? `Sumás <b>+${xp} XP</b> · ${Math.round((value / goal) * 100)}% de la meta`
      : 'Ingresá un valor para ver la XP que sumás.';
    save.disabled = !(value > 0);
  };
  update();
  return { node: el('div', { class: 'logger' }, preview, el('div', { class: 'btn-row' }, save, remove)), update };
}

/** ---------- Actividades numéricas (min, pasos, XP de Duolingo, posts) ---------- */
function numberForm(activity, dateKey, onSaved) {
  const existing = getEntry(dateKey, activity.id);
  const step = Number(activity.step) || 1;
  const input = el('input', {
    type: 'number', inputmode: 'decimal', min: '0', step: String(step),
    value: existing ? String(existing.value) : '',
    'aria-label': `Valor en ${activity.unit}`,
  });
  const note = el('textarea', { placeholder: 'Nota (opcional): qué hiciste, cómo te sentiste…', rows: '2' });
  if (existing?.note) note.value = existing.note;

  const value = () => Math.max(0, Number(input.value) || 0);
  const ctrl = footer(activity, dateKey,
    () => ({ value: value(), note: note.value.trim() || undefined }),
    value, onSaved, existing);

  const bump = (delta) => { input.value = String(Math.max(0, value() + delta)); ctrl.update(); syncPresets(); };
  const presetButtons = (activity.presets || []).map((p) => el('button', {
    type: 'button', style: `--c:${activity.color}`, dataset: { preset: String(p) },
    onClick: () => { input.value = String(p); ctrl.update(); syncPresets(); },
  }, formatValue(p, activity.unit)));
  const presets = el('div', { class: 'presets' }, presetButtons);
  function syncPresets() {
    presetButtons.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.preset) === value()));
  }
  syncPresets();
  input.addEventListener('input', () => { ctrl.update(); syncPresets(); });

  const st = getState().byActivity.get(activity.id);
  return el('div', { class: 'logger' },
    el('p', { class: 'hint' },
      `Meta: ${formatValue(activity.goal, activity.unit)} = 100 XP.` +
      (st?.streak ? ` Tu racha de ${st.streak} multiplica ×${st.multiplier.toFixed(2)}.` : '')),
    el('div', { class: 'stepper' },
      el('button', { type: 'button', 'aria-label': `Restar ${step}`, onClick: () => bump(-step) }, '−'),
      input,
      el('button', { type: 'button', 'aria-label': `Sumar ${step}`, onClick: () => bump(step) }, '+')),
    presets,
    el('div', { class: 'field' }, el('label', { text: 'Nota' }), note),
    ctrl.node);
}

/** ---------- Sesión de gimnasio: ejercicios con series ---------- */
function gymForm(activity, dateKey, onSaved) {
  const existing = getEntry(dateKey, activity.id);
  const records = getState().byActivity.get(activity.id)?.records || new Map();
  let exercises = existing?.exercises?.length
    ? structuredClone(existing.exercises)
    : [{ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }];

  const list = el('div', {});
  const summary = el('div', { class: 'row' });
  const ctrl = footer(activity, dateKey,
    () => ({ exercises: clean(exercises) }),
    () => gymVolume(clean(exercises)), onSaved, existing);

  function clean(list_) {
    return list_
      .map((ex) => ({
        name: (ex.name || '').trim(),
        sets: (ex.sets || []).filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0)
          .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) })),
      }))
      .filter((ex) => ex.sets.length);
  }

  function refresh() {
    list.innerHTML = '';
    exercises.forEach((ex, i) => list.append(exerciseCard(ex, i)));
    const volume = gymVolume(clean(exercises));
    const sets = clean(exercises).reduce((n, ex) => n + ex.sets.length, 0);
    summary.innerHTML = '';
    summary.append(
      el('div', { class: 'row__main' },
        el('div', { text: `${formatNumber(volume)} kg de tonelaje` }),
        el('div', { class: 'row__sub', text: `${sets} series · meta ${formatNumber(activity.goal)} kg` })),
      el('div', { class: 'row__value', text: `${Math.round((volume / (activity.goal || 1)) * 100)}%` }));
    ctrl.update();
  }

  function exerciseCard(ex, index) {
    const nameInput = el('input', {
      type: 'text', placeholder: 'Ejercicio (ej. Sentadilla)', value: ex.name || '',
      list: 'exercise-names',
    });
    nameInput.addEventListener('input', () => { ex.name = nameInput.value; updateRecordHint(); });

    const recordHint = el('div', { class: 'row__sub' });
    function updateRecordHint() {
      const rec = records.get((ex.name || '').trim().toLowerCase());
      recordHint.textContent = rec
        ? `Tu récord: ${rec.weight} kg × ${rec.reps} (1RM ≈ ${rec.e1rm} kg)`
        : '';
    }
    updateRecordHint();

    const setsWrap = el('div', {});
    const renderSets = () => {
      setsWrap.innerHTML = '';
      ex.sets.forEach((set, si) => {
        const weight = el('input', { type: 'number', inputmode: 'decimal', min: '0', step: '2.5', placeholder: 'kg', value: set.weight ?? '' });
        const reps = el('input', { type: 'number', inputmode: 'numeric', min: '0', step: '1', placeholder: 'reps', value: set.reps ?? '' });
        weight.addEventListener('input', () => { set.weight = weight.value; refreshSummaryOnly(); });
        reps.addEventListener('input', () => { set.reps = reps.value; refreshSummaryOnly(); });
        setsWrap.append(el('div', { class: 'set-row' },
          el('span', { class: 'set-row__n', text: `${si + 1}` }),
          weight, reps,
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Quitar serie ${si + 1}`,
            onClick: () => { ex.sets.splice(si, 1); if (!ex.sets.length) ex.sets.push({ weight: '', reps: '' }); refresh(); } }, '✕')));
      });
    };
    renderSets();

    return el('div', { class: 'exercise' },
      el('div', { class: 'exercise__head' },
        nameInput,
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar ejercicio',
          onClick: () => { exercises.splice(index, 1); if (!exercises.length) exercises.push({ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }); refresh(); } }, '🗑')),
      recordHint,
      el('div', { class: 'set-row', style: 'margin:8px 0 4px' },
        el('span', {}), el('span', { class: 'set-row__n', text: 'peso' }), el('span', { class: 'set-row__n', text: 'reps' }), el('span', {})),
      setsWrap,
      el('button', { class: 'btn btn--ghost', type: 'button', style: 'min-height:38px;padding:0 12px',
        onClick: () => { const last = ex.sets[ex.sets.length - 1]; ex.sets.push({ weight: last?.weight ?? '', reps: last?.reps ?? '' }); refresh(); } }, '+ Serie'));
  }

  function refreshSummaryOnly() {
    const volume = gymVolume(clean(exercises));
    summary.querySelector('.row__main div').textContent = `${formatNumber(volume)} kg de tonelaje`;
    summary.querySelector('.row__value').textContent = `${Math.round((volume / (activity.goal || 1)) * 100)}%`;
    ctrl.update();
  }

  const datalist = el('datalist', { id: 'exercise-names' },
    [...records.values()].map((r) => el('option', { value: r.name })));

  refresh();
  return el('div', { class: 'logger' },
    el('p', { class: 'hint' }, `Cargá peso y repeticiones de cada serie. El tonelaje (peso × reps) da la XP, y superar tu 1RM estimado suma bonus por récord.`),
    datalist,
    list,
    el('button', { class: 'btn btn--block', type: 'button',
      onClick: () => { exercises.push({ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }); refresh(); } }, '+ Ejercicio'),
    summary,
    ctrl.node);
}

export { estimatedOneRepMax };
