// Panel deslizante (modal) accesible.
import { el } from '../utils.js';

let lastFocus = null;

export function openSheet(title, content, { onClose } = {}) {
  const overlay = document.getElementById('overlay');
  lastFocus = document.activeElement;
  overlay.innerHTML = '';
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'sheet__head' },
      el('h2', { text: title }),
      el('button', { class: 'sheet__close', 'aria-label': 'Cerrar', onClick: close }, '✕')),
    content);
  overlay.append(sheet);
  overlay.hidden = false;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', onKey);
  sheet.querySelector('input, button, select, textarea')?.focus({ preventScroll: true });

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') trap(e, sheet);
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.hidden = true;
    overlay.innerHTML = '';
    lastFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }
  return { close };
}

export function closeSheet() {
  document.getElementById('overlay').hidden = true;
  document.getElementById('overlay').innerHTML = '';
}

function trap(e, root) {
  const nodes = [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
