// Map: interactive 3D globe + ranked list.
import { api } from '../api.js';
import { bus } from '../store.js';
import { $, $$, esc, fmtPct, fmtCompact, cfrColor, segment, panelState, clearPanelState, setLoading } from '../ui.js';

let globe = null, data = null, metric = 'cases', inView = false, pending = null, hot = null;
const host = () => $('#globe'), tip = () => $('#globe-tip');

/* ---------- tooltip ---------- */
const tipHTML = (c) => `
  <div class="gtip__head"><span class="gtip__name">${esc(c.country)}</span><span class="tag">${esc(c.continent)}</span></div>
  <dl class="gtip__grid">
    <div><dt>Cases</dt><dd>${fmtCompact(c.confirmed, 2)}</dd></div>
    <div><dt>Deaths</dt><dd>${fmtCompact(c.dead, 2)}</dd></div>
    <div><dt>Fatality rate</dt><dd>${fmtPct(c.mortality)}</dd></div>
    <div><dt>Cases per million</dt><dd>${c.cases_per_mln != null ? fmtCompact(c.cases_per_mln, 0) : '—'}</dd></div>
  </dl>
  <button class="btn btn--primary" type="button" data-country="${esc(c.country)}">Open country history</button>`;

function place(pos) {
  const t = tip(), w = host().clientWidth;
  if (!pos) return;
  t.style.visibility = pos.visible ? 'visible' : 'hidden';
  t.style.left = `${Math.max(132, Math.min(w - 132, pos.x))}px`;
  t.style.top = `${pos.y}px`;
  t.classList.toggle('is-below', pos.y < 230);
}
function showTip(c, pos, pinned) { const t = tip(); t.innerHTML = tipHTML(c); t.classList.toggle('is-pinned', pinned); place(pos); t.classList.add('is-on'); }
function hideTip() { const t = tip(); t.classList.remove('is-on', 'is-pinned'); }

/* ---------- ranked list ---------- */
function renderHot() {
  if (!data) return;
  const cases = metric === 'cases';
  const rows = data.filter((c) => (cases ? c.confirmed : c.cases_per_mln) > 0)
    .sort((a, b) => (cases ? b.confirmed - a.confirmed : b.cases_per_mln - a.cases_per_mln)).slice(0, 14);
  $('#hot-desc').textContent = cases ? 'Largest outbreaks by total cases. Select one to find it on the globe.' : 'Highest case rates per million people. Select one to find it on the globe.';
  $('#hot-list').innerHTML = rows.map((c) => `
    <button class="hot${hot === c.country ? ' is-active' : ''}" type="button" data-hot="${esc(c.country)}" style="--c:${cfrColor(c.mortality)}">
      <i></i><span><b>${esc(c.country)}</b><small>${esc(c.continent)} · ${fmtPct(c.mortality, 1)} fatal</small></span>
      <em>${cases ? fmtCompact(c.confirmed, 1) : fmtCompact(c.cases_per_mln, 0)}</em>
    </button>`).join('');
}

function focusCountry(name) {
  if (!name) return;
  if (globe?.flyTo(name)) return;
  bus.emit('dossier:open', name);
}

/* ---------- lifecycle ---------- */
async function load() {
  const h = host();
  clearPanelState(h); setLoading(h, true);
  try { data = await api.map(); } catch {
    panelState(h, { kind: 'error', title: 'Couldn’t load the map data', text: 'The data service didn’t respond. Make sure the server is running, then try again.', retry: load });
    $('#hot-list').innerHTML = ''; return;
  }
  renderHot();
  try {
    const { createGlobe } = await import('../three/globe.js');
    globe = await createGlobe(h, data, {
      onHover: (c, pos) => { if (globe.hasSelection) return; c ? showTip(c, pos, false) : hideTip(); },
      onSelect: (c, pos) => { hot = c?.country ?? null; renderHot(); c ? showTip(c, pos, true) : hideTip(); },
      onFrame: (pos) => place(pos),
    });
    if (inView) globe.start();
  } catch (err) {
    console.warn('3D globe unavailable', err);
    panelState(h, { kind: 'info', title: '3D view unavailable on this device', text: 'Your browser couldn’t start WebGL. You can still open any country from the list.' });
  }
  setLoading(h, false);
  if (pending) { const p = pending; pending = null; focusCountry(p); }
}

export async function init() {
  segment($('#globe-metric'), (v) => {
    metric = v; globe?.setMetric(v); renderHot();
    $('#globe-size-label').textContent = v === 'cases' ? 'total cases' : 'cases per million people';
  });
  const rot = $('#globe-rotate');
  rot.addEventListener('click', () => { const on = rot.getAttribute('aria-pressed') !== 'true'; rot.setAttribute('aria-pressed', String(on)); globe?.setAutoRotate(on); });
  $('#globe-reset').addEventListener('click', () => { globe?.resetView(); hideTip(); });
  $('#hot-list').addEventListener('click', (e) => { const b = e.target.closest('[data-hot]'); if (b) focusCountry(b.dataset.hot); });
  await load();
}
export function enter() { inView = true; globe?.start(); globe?.resize(); }
export function leave() { inView = false; globe?.stop(); }

bus.on('globe:focus', (name) => { pending = name; if (location.hash !== '#map') location.hash = '#map'; else if (globe) { pending = null; focusCountry(name); } });
