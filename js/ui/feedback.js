// Avisos, celebraciones, confeti y sonido sintetizado (sin archivos externos).
import { el } from '../utils.js';
import { getData } from '../state.js';

let audioCtx = null;

function beep(notes) {
  if (!getData().settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    notes.forEach(([freq, at, dur = 0.12], i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = i % 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.14, audioCtx.currentTime + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + at + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + at);
      osc.stop(audioCtx.currentTime + at + dur + 0.02);
    });
  } catch { /* el audio es opcional */ }
}

export const sounds = {
  xp: () => beep([[660, 0, 0.08], [880, 0.06, 0.1]]),
  levelUp: () => beep([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.28]]),
  award: () => beep([[784, 0, 0.1], [988, 0.08, 0.1], [1319, 0.18, 0.3]]),
};

export function toast(icon, html, ms = 3200) {
  const host = document.getElementById('toasts');
  const node = el('div', { class: 'toast' },
    el('span', { class: 'toast__icon', text: icon }),
    el('span', { html }));
  host.append(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 320);
  }, ms);
}

let confettiRunning = false;
export function confetti(colors = ['#7dd3fc', '#a78bfa', '#fbbf24', '#34d399', '#fb7185']) {
  const canvas = document.getElementById('confetti');
  if (!canvas || confettiRunning) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (getData().settings.celebrate === false) return;
  confettiRunning = true;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: 110 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.4,
    w: 5 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    vy: 2 + Math.random() * 3.4,
    vx: -1.2 + Math.random() * 2.4,
    rot: Math.random() * Math.PI,
    vr: -0.16 + Math.random() * 0.32,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const started = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < innerHeight + 30) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - (now - started) / 2600);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive && now - started < 2600) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); confettiRunning = false; }
  })(started);
}
