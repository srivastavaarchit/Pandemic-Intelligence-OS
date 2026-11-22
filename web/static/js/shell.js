// App chrome: nav indicator, mobile menu, country search, guide popover, sound toggle, shortcuts.
import { $, $$, toast, celebrate, reduceMotion } from './ui.js';
import { createPicker } from './picker.js';
import { state, bus, loadCountries, loadOverview } from './store.js';
import { fmtMonthYear } from './ui.js';

/* ---------- optional interface sounds (off by default) ---------- */
export const sfx = (() => {
  let on = false, ctx = null;
  try { on = localStorage.getItem('pios-sound') === '1'; } catch {}
  const play = (f = 520, d = 0.07, v = 0.045, type = 'sine') => {
    if (!on) return;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d);
    } catch {}
  };
  return {
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem('pios-sound', on ? '1' : '0'); } catch {} if (on) play(660, 0.12); return on; },
    nav: () => play(520), tap: () => play(440, 0.05), open: () => play(620, 0.09), close: () => play(380, 0.08),
  };
})();

/* ---------- nav pill + active state ---------- */
export function setActive(id) {
  $$('.nav__link, .sheet__link').forEach((a) => { a.dataset.view === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  placePill(id);
  updateGuideContext(id);
}
let activeId = 'overview';
function placePill(id = activeId) {
  activeId = id;
  const link = $(`.nav__link[data-view="${id}"]`), pill = $('#nav-pill');
  if (!link || !link.offsetWidth) { pill.classList.remove('is-on'); return; }
  pill.style.setProperty('--x', `${link.offsetLeft}px`);
  pill.style.setProperty('--w', `${link.offsetWidth}px`);
  pill.classList.add('is-on');
}

/* ---------- guide ---------- */
const HERE = {
  overview: 'You’re on the Overview. Scroll for waves, the hardest-hit countries and continents. On the wave chart, switch between Daily and Cumulative, Linear and Log.',
  map: 'You’re on the Map. Drag to rotate, scroll to zoom, then select a bubble, or pick a country from the list to fly to it.',
  compare: 'You’re comparing countries. Add up to eight, or use a quick selection. Both charts update together.',
  factors: 'You’re on Factors. Change either menu in the sentence to test another relationship, then read the plain-language verdict.',
  simulator: 'You’re on the Simulator. Pick a scenario or drag a slider. The dashed line shows what would happen with no action.',
  countries: 'You’re on Countries. Select a column heading to sort, use the pills to filter by continent, and open any row for its history.',
  lab: 'You’re in the Virus lab. Drag the model, turn the mask on, and select a part on the right to highlight it.',
};
const TIPS = [
  'Wear your mask snugly over nose and mouth.',
  'Wash your hands for at least 20 seconds with soap.',
  'Fresh air helps. Open a window when you’re indoors with others.',
  'Staying home when you’re sick protects people around you.',
  'Keep vaccines and boosters up to date.',
  'Cover coughs and sneezes with your elbow.',
];
let tipIdx = 0;
function updateGuideContext(id) { const el = $('#guide-here'); if (el) el.textContent = HERE[id] || HERE.overview; }

function initGuide() {
  const fab = $('#guide-fab'), guide = $('#guide');
  try { if (localStorage.getItem('pios-guide-seen')) fab.removeAttribute('data-new'); } catch {}
  const open = () => {
    guide.hidden = false; guide.classList.remove('is-closing');
    fab.setAttribute('aria-expanded', 'true'); fab.setAttribute('aria-label', 'Close quick guide'); fab.removeAttribute('data-new'); fab.querySelector('use').setAttribute('href', '#i-x');
    try { localStorage.setItem('pios-guide-seen', '1'); } catch {}
    sfx.open(); $('#guide-close').focus({ preventScroll: true });
  };
  const close = (returnFocus = true) => {
    if (guide.hidden) return;
    const done = () => { guide.hidden = true; guide.classList.remove('is-closing'); };
    fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-label', 'Open quick guide'); fab.querySelector('use').setAttribute('href', '#i-circle-help');
    sfx.close();
    if (reduceMotion()) done(); else { guide.classList.add('is-closing'); setTimeout(done, 200); }
    if (returnFocus) fab.focus({ preventScroll: true });
  };
  fab.addEventListener('click', () => (guide.hidden ? open() : close()));
  $('#guide-close').addEventListener('click', () => close());
  const nextTip = () => { tipIdx = (tipIdx + 1) % TIPS.length; $('#guide-tip').textContent = TIPS[tipIdx]; };
  $('#guide-tip-btn').addEventListener('click', nextTip);
  $('#guide-mascot').addEventListener('click', () => { celebrate(); nextTip(); });
  $('#guide-tip').textContent = TIPS[0];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !guide.hidden && !document.querySelector('dialog[open]')) close();
  });
  bus.on('overview', (o) => { const r = $('#guide-range'); if (r) r.textContent = `${fmtMonthYear(o.start_date)} to ${fmtMonthYear(o.end_date)}`; });
}

/* ---------- search + menu ---------- */
function initSearch() {
  const menu = $('#menu');
  const items = () => state.countries.map((c) => ({ name: c.Country, continent: c.Continent }));
  const wire = (inputSel, listSel, beforeSelect) => {
    const input = $(inputSel), list = $(listSel);
    if (!input) return;
    const p = createPicker({
      input, list, getItems: items, emptyHint: 'Loading countries…',
      onSelect: (name) => { beforeSelect?.(); input.blur(); bus.emit('dossier:open', name); },
    });
    bus.on('countries', () => p.refresh());
  };
  wire('#nav-search', '#nav-search-list');
  wire('#sheet-search', '#sheet-search-list', () => menu.close());

  $('#btn-menu').addEventListener('click', () => { sfx.open(); menu.showModal(); });
  menu.addEventListener('click', (e) => { if (e.target.closest('[data-close-menu]') || e.target === menu) menu.close(); });
  matchMedia('(min-width: 1241px)').addEventListener('change', (m) => { if (m.matches && menu.open) menu.close(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    const nav = $('#nav-search');
    if (nav.offsetParent) nav.focus(); else { $('#btn-menu').click(); setTimeout(() => $('#sheet-search').focus(), 60); }
  });
}

/* ---------- sound toggle ---------- */
function initSound() {
  const btn = $('#btn-sound');
  const paint = () => {
    btn.setAttribute('aria-pressed', String(sfx.on));
    btn.setAttribute('aria-label', `Interface sounds: ${sfx.on ? 'on' : 'off'}`);
    btn.querySelector('use').setAttribute('href', sfx.on ? '#i-volume-2' : '#i-volume-x');
  };
  paint();
  btn.addEventListener('click', () => { sfx.toggle(); paint(); toast(sfx.on ? 'Interface sounds on' : 'Interface sounds off', 1600); });
  document.addEventListener('click', (e) => { if (e.target.closest('.nav__link, .seg button, .pill, .btn')) sfx.tap(); });
}

export function setApiStatus(ok) {
  const d = $('#hero-dot'); if (d) d.dataset.state = ok ? 'ok' : 'err';
}

export function initShell() {
  initSearch(); initGuide(); initSound();
  addEventListener('resize', () => placePill());
  document.fonts?.ready.then(() => placePill());
  loadOverview().then((o) => bus.emit('overview', o)).catch(() => {});
  loadCountries().catch(() => toast('Couldn’t reach the data service. Is the server running?', 5000));
}
