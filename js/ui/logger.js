// Hojas de registro: número simple, sesión de gimnasio y publicación semanal.
import { el, formatValue, formatNumber, relativeDay, uid, keyToDate } from '../utils.js';
import { openSheet } from './sheet.js';
import { getEntry, setEntry, getState } from '../state.js';
import { previewXp, completedSets, goalFor } from '../derive.js';
import { gymVolume, estimatedOneRepMax } from '../xp.js';
import {
  GYM_TEMPLATES, templateById, templateForDay,
  DEFAULT_SETS, DEFAULT_REP_RANGE,
} from '../config.js';

/** Abre el registrador correcto para la actividad. */
export function openLogger(activity, dateKey, onSaved) {
  const title = `${activity.icon} ${activity.name} · ${relativeDay(dateKey)}`;
  if (activity.kind === 'gym') return openSheet(title, gymForm(activity, dateKey, onSaved));
  return openSheet(title, numberForm(activity, dateKey, onSaved));
}

function footer(activity, dateKey, getPayload, getValue, onSaved, existing, getContext = () => null) {
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
    const context = getContext();
    const xp = previewXp(getState(), activity, value, context);
    const goal = goalFor(activity, context);
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

/** ---------- Sesión de gimnasio: rutina del día con series ---------- */
function gymForm(activity, dateKey, onSaved) {
  const existing = getEntry(dateKey, activity.id);
  const gymState = getState().byActivity.get(activity.id);
  const records = gymState?.records || new Map();
  const lastSets = gymState?.lastSets || new Map();
  const lastByTemplate = gymState?.lastByTemplate || new Map();

  // Si no hay nada cargado, se propone la rutina que toca ese día de la semana.
  const sugerida = templateForDay(keyToDate(dateKey).getDay());
  let templateId = existing?.templateId ?? sugerida?.id ?? null;
  let exercises = [];

  /** Series precargadas con lo último que levantaste en ese ejercicio. */
  function seedSets(name, count = DEFAULT_SETS) {
    const previas = lastSets.get((name || '').trim().toLowerCase());
    return Array.from({ length: count }, (_, i) => ({
      weight: previas?.[i]?.weight ?? previas?.[previas.length - 1]?.weight ?? '',
      reps: '',
      target: previas?.[i]?.reps ?? null,
    }));
  }

  function loadTemplate(id, { keepExisting = false } = {}) {
    templateId = id;
    if (keepExisting && existing?.exercises?.length) {
      exercises = structuredClone(existing.exercises).map((ex) => ({ ...ex, id: uid() }));
      return;
    }
    const template = templateById(id);
    const base = template?.exercises?.length
      ? template.exercises
      : (lastByTemplate.get(id) || []); // el Día 4 aprende de la última vez
    exercises = base.length
      ? base.map((ex) => ({ id: uid(), name: ex.name, bw: ex.bw, sets: seedSets(ex.name) }))
      : [{ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }];
  }
  loadTemplate(templateId, { keepExisting: true });

  const list = el('div', {});
  const summary = el('div', { class: 'row' });
  const ctrl = footer(activity, dateKey,
    () => ({ templateId, exercises: clean(exercises) }),
    () => completedSets(clean(exercises)),
    onSaved, existing,
    () => ({ templateId }));

  function clean(input) {
    return input
      .map((ex) => ({
        name: (ex.name || '').trim(),
        sets: (ex.sets || [])
          .filter((s) => Number(s.reps) > 0)
          .map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) })),
      }))
      .filter((ex) => ex.name && ex.sets.length);
  }

  // --- Selector de rutina ---
  const chips = el('div', { class: 'presets', style: 'margin-bottom:12px' },
    GYM_TEMPLATES.map((t) => el('button', {
      type: 'button', dataset: { tpl: t.id }, style: `--c:${activity.color}`,
      onClick: () => { loadTemplate(t.id); refresh(); },
    }, t.short)),
    el('button', {
      type: 'button', dataset: { tpl: 'libre' }, style: `--c:${activity.color}`,
      onClick: () => { loadTemplate(null); refresh(); },
    }, 'Libre'));

  function syncChips() {
    for (const b of chips.querySelectorAll('button')) {
      b.classList.toggle('is-active', b.dataset.tpl === (templateId || 'libre'));
    }
  }

  function refresh() {
    list.innerHTML = '';
    exercises.forEach((ex, i) => list.append(exerciseCard(ex, i)));
    syncChips();
    updateSummary();
  }

  function updateSummary() {
    const limpio = clean(exercises);
    const hechas = completedSets(limpio);
    const meta = goalFor(activity, { templateId });
    const volumen = gymVolume(limpio);
    summary.innerHTML = '';
    summary.append(
      el('div', { class: 'row__main' },
        el('div', { text: `${hechas} de ${meta} series` }),
        el('div', { class: 'row__sub', text: `${formatNumber(volumen)} kg de tonelaje` })),
      el('div', { class: 'row__value', text: `${Math.round((hechas / meta) * 100)}%` }));
    ctrl.update();
  }

  /** Un ejercicio está listo cuando todas sus series tienen repeticiones. */
  function isComplete(ex) {
    return (ex.sets || []).length > 0 && ex.sets.every((s) => Number(s.reps) > 0);
  }

  function exerciseCard(ex, index) {
    const rec = records.get((ex.name || '').trim().toLowerCase());
    const head = ex.name
      ? el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:600;font-size:.92rem', text: ex.name }),
          el('div', { class: 'row__sub' },
            rec ? `Récord: ${rec.weight} kg × ${rec.reps}` : `${DEFAULT_SETS}×${DEFAULT_REP_RANGE}`))
      : (() => {
          const input = el('input', { type: 'text', placeholder: 'Ejercicio', list: 'exercise-names', value: '' });
          input.addEventListener('input', () => { ex.name = input.value; updateSummary(); });
          return input;
        })();

    const setsWrap = el('div', {});
    const renderSets = () => {
      setsWrap.innerHTML = '';
      ex.sets.forEach((set, si) => {
        const weight = el('input', {
          type: 'number', inputmode: 'decimal', min: '0', step: '2.5',
          placeholder: ex.bw ? '+kg' : 'kg', value: set.weight ?? '',
        });
        const reps = el('input', {
          type: 'number', inputmode: 'numeric', min: '0', step: '1',
          placeholder: set.target ? String(set.target) : 'reps', value: set.reps ?? '',
        });
        weight.addEventListener('input', () => { set.weight = weight.value; updateSummary(); });
        reps.addEventListener('input', () => { set.reps = reps.value; updateSummary(); });
        // Al terminar el ejercicio se pliega solo: durante el entrenamiento
        // querés ver lo que falta, no lo que ya hiciste.
        reps.addEventListener('change', () => { if (isComplete(ex)) collapse(true); });
        setsWrap.append(el('div', { class: 'set-row' },
          el('span', { class: 'set-row__n', text: `${si + 1}` }),
          weight, reps,
          el('button', {
            class: 'icon-btn', type: 'button', 'aria-label': `Quitar serie ${si + 1}`,
            onClick: () => { ex.sets.splice(si, 1); if (!ex.sets.length) ex.sets.push({ weight: '', reps: '' }); refresh(); },
          }, '✕')));
      });
    };
    renderSets();

    const resumen = el('div', { class: 'exercise__summary' });
    const card = el('div', { class: 'exercise' },
      el('div', { class: 'exercise__head' },
        head,
        el('button', {
          class: 'icon-btn', type: 'button', 'aria-label': `Quitar ${ex.name || 'ejercicio'}`,
          onClick: () => { exercises.splice(index, 1); if (!exercises.length) exercises.push({ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }); refresh(); },
        }, '🗑')),
      resumen,
      el('div', { class: 'exercise__body' },
        el('div', { class: 'set-row', style: 'margin:8px 0 4px' },
          el('span', {}),
          el('span', { class: 'set-row__n', text: ex.bw ? 'peso extra' : 'peso' }),
          el('span', { class: 'set-row__n', text: 'reps' }),
          el('span', {})),
        setsWrap,
        el('button', {
          class: 'btn btn--ghost', type: 'button', style: 'min-height:34px;padding:0 12px;font-size:.82rem',
          onClick: () => { const last = ex.sets[ex.sets.length - 1]; ex.sets.push({ weight: last?.weight ?? '', reps: '' }); refresh(); },
        }, '+ Serie')));

    function collapse(on) {
      card.classList.toggle('is-collapsed', on);
      if (!on) return;
      const hechas = ex.sets.filter((x) => Number(x.reps) > 0);
      const pesos = [...new Set(hechas.map((x) => Number(x.weight) || 0))];
      const carga = pesos.length === 1
        ? (pesos[0] > 0 ? `${pesos[0]} kg` : 'peso corporal')
        : `${Math.min(...pesos)}–${Math.max(...pesos)} kg`;
      resumen.textContent = `✓ ${hechas.length} series · ${carga} × ${hechas.map((x) => x.reps).join(', ')}`;
    }
    // Tocar el encabezado vuelve a abrirlo para corregir.
    card.querySelector('.exercise__head').addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn') || e.target.tagName === 'INPUT') return;
      collapse(!card.classList.contains('is-collapsed'));
    });
    if (isComplete(ex)) collapse(true);
    return card;
  }

  const datalist = el('datalist', { id: 'exercise-names' },
    [...records.values()].map((r) => el('option', { value: r.name })));

  refresh();
  return el('div', { class: 'logger' },
    el('p', { class: 'hint' },
      sugerida && !existing
        ? `Hoy toca ${sugerida.name}. Los pesos vienen precargados con lo último que levantaste: corregí lo que cambió y anotá las reps.`
        : 'Elegí la rutina y cargá las reps de cada serie. Completarla entera son 100 XP.'),
    chips,
    datalist,
    list,
    el('button', {
      class: 'btn btn--block', type: 'button',
      onClick: () => { exercises.push({ id: uid(), name: '', sets: [{ weight: '', reps: '' }] }); refresh(); },
    }, '+ Ejercicio'),
    summary,
    ctrl.node);
}

export { estimatedOneRepMax };
