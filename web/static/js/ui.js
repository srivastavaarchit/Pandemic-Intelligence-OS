// Small UI utilities shared by every view.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = () => matchMedia('(pointer: coarse)').matches;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString('en-US') : '—');
export const fmtPct = (n, d = 2) => (isNum(n) ? `${n.toFixed(d)}%` : '—');
export const fmtMoney = (n) => (isNum(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

/** 676569428 → { v: "676.6", u: "M" } */
export function compactParts(n, digits = 1) {
  const a = Math.abs(n);
  if (a >= 1e9) return { v: (n / 1e9).toFixed(digits), u: 'B' };
  if (a >= 1e6) return { v: (n / 1e6).toFixed(digits), u: 'M' };
  if (a >= 1e3) return { v: (n / 1e3).toFixed(a >= 1e5 ? 0 : digits), u: 'K' };
  return { v: String(Math.round(n)), u: '' };
}
export const fmtCompact = (n, digits = 1) => { if (!isNum(n)) return '—'; const p = compactParts(n, digits); return p.v + p.u; };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const fmtMonthYear = (iso) => { const [y, m] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------- scroll reveal ---------- */
let revealIO;
export function initReveal() {
  if (reduceMotion() || !('IntersectionObserver' in window)) { $$('[data-reveal]').forEach((el) => el.classList.add('is-in')); return; }
  revealIO ||= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal]:not(.is-in)').forEach((el) => revealIO.observe(el));
}

/** Run cb once when el first becomes visible. */
export function onVisible(el, cb) {
  if (!('IntersectionObserver' in window)) return cb();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); cb(); } }, { threshold: 0.2 });
  io.observe(el);
}

/** Count a number up; fmt(v) returns innerHTML. */
export function countUp(el, to, fmt, ms = 1400) {
  if (reduceMotion()) { el.innerHTML = fmt(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 4);
    el.innerHTML = fmt(to * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- pointer effects (fine pointers only) ---------- */
export function tilt(stage) {
  const img = stage.querySelector('img');
  if (!img || coarsePointer() || reduceMotion()) return;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    img.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 12}deg) scale(1.03)`;
  });
  stage.addEventListener('pointerleave', () => { img.style.transform = ''; });
}

export function magnetic(el, strength = 0.28) {
  if (coarsePointer() || reduceMotion()) return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * strength}px, ${dy * strength * 1.2}px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}

/* ---------- toasts ---------- */
export function toast(msg, ms = 3000) {
  const host = $('#toasts'); if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  host.append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); }, ms);
}

/* ---------- panel loading / error states ---------- */
export function setLoading(panel, on) {
  const v = panel?.querySelector(':scope > .loading-veil');
  if (v) v.hidden = !on;
}
export function clearPanelState(panel) {
  panel.querySelectorAll(':scope > [data-panel-state]').forEach((n) => n.remove());
  panel.querySelectorAll(':scope > .chart-box, :scope > [data-hide-on-state]').forEach((n) => { n.hidden = false; });
}
export function panelState(panel, { kind = 'error', title, text, retry, retryLabel = 'Try again' }) {
  clearPanelState(panel);
  setLoading(panel, false);
  panel.querySelectorAll(':scope > .chart-box, :scope > [data-hide-on-state]').forEach((n) => { n.hidden = true; });
  const el = document.createElement('div');
  el.className = `state state--${kind}`; el.dataset.panelState = '';
  el.innerHTML = `<div class="state__icon">${icon(kind === 'error' ? 'triangle-alert' : 'info')}</div>
    <div class="state__title">${esc(title)}</div><p class="state__text">${esc(text || '')}</p>
    ${retry ? `<button class="btn btn--soft btn--sm" type="button">${icon('refresh-cw')}${esc(retryLabel)}</button>` : ''}`;
  if (retry) el.querySelector('button').addEventListener('click', retry);
  panel.append(el);
}
export const panelError = (panel, retry, what = 'this data') => panelState(panel, {
  kind: 'error', title: `Couldn’t load ${what}`,
  text: 'The data service didn’t respond. Make sure the server is running (python web/server.py), then try again.', retry,
});

/* ---------- misc ---------- */
const loaded = new Map();
export function lazyScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
  loaded.set(src, p); return p;
}

export async function celebrate() {
  if (reduceMotion()) { toast('Thank you, health workers!'); return; }
  try {
    await lazyScript('/static/vendor/confetti.browser.js');
    const colors = ['#ff4a2b', '#2d5bff', '#14a06e', '#f2a31b', '#15181f'];
    window.confetti({ particleCount: 90, spread: 78, origin: { y: 0.72 }, colors, scalar: 0.95 });
    setTimeout(() => window.confetti({ particleCount: 60, spread: 110, startVelocity: 28, origin: { y: 0.7 }, colors }), 220);
  } catch { toast('Thank you, health workers!'); }
}

export function setRange(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
}

/** Radiogroup helper for .seg controls. */
export function segment(root, onChange) {
  const btns = $$('button[role="radio"]', root);
  const set = (value, silent) => {
    btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
    if (!silent) onChange(value);
  };
  root.addEventListener('click', (e) => { const b = e.target.closest('button[role="radio"]'); if (b) set(b.dataset.value); });
  root.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    n.focus(); set(n.dataset.value);
  });
  return { set, get: () => btns.find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.value };
}

/** Case-fatality-rate bands shared by the globe, legend and list. */
export const cfrColor = (m) => (m < 1.5 ? '#ffb49b' : m <= 3 ? '#ff5a36' : '#a3122b');
