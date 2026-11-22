// Compare: shared country selection drives the daily-cases chart and the Day-0 (100th case) chart.
import { api } from '../api.js';
import { state, bus, loadCountries } from '../store.js';
import { $, esc, fmtInt, fmtCompact, panelState, panelError, clearPanelState, setLoading, toast, icon } from '../ui.js';
import { createPicker } from '../picker.js';
import { chartsReady, makeChart, baseScales, dateTitle, crosshair, SERIES } from '../charts.js';

const MAX = 8;
let selected = ['US', 'India', 'Brazil', 'Italy', 'Germany', 'United Kingdom'];
const colors = new Map();
let dailyChart = null, t0Chart = null, token = 0, ready = false, queued = [];
const PRESETS = [
  ['Largest outbreaks', ['US', 'India', 'France', 'Germany', 'Brazil', 'Japan']],
  ['First hotspots', ['China', 'Italy', 'Iran', 'Korea', 'Spain', 'US']],
  ['Asia-Pacific', ['Japan', 'Korea', 'Australia', 'New Zealand', 'Singapore', 'India']],
  ['Americas', ['US', 'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Peru']],
];

function colorFor(name) {
  if (!colors.has(name)) { const used = new Set(colors.values()); colors.set(name, SERIES.find((c) => !used.has(c)) || SERIES[0]); }
  return colors.get(name);
}
function releaseColors() { for (const k of [...colors.keys()]) if (!selected.includes(k)) colors.delete(k); }

function renderChips() {
  const el = $('#compare-chips');
  const countHtml = `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
    <span class="small muted">Comparing <b>${selected.length} of ${MAX}</b> countries ${selected.length >= MAX ? '<span style="color:#f59e0b;font-weight:600;">(Max 8 reached — adding another replaces oldest)</span>' : ''}</span>
    ${selected.length ? `<button class="btn btn--soft btn--sm" id="btn-clear-compare" type="button" style="padding:2px 8px;font-size:12px;">Clear all</button>` : ''}
  </div>`;
  el.innerHTML = countHtml + (selected.length
    ? selected.map((n) => `<span class="chip"><i class="chip__dot" style="background:${colorFor(n)}"></i>${esc(n)}<button type="button" data-remove="${esc(n)}" aria-label="Remove ${esc(n)}">${icon('x')}</button></span>`).join('')
    : '<span class="muted small">No countries selected. Type a country name above or click a preset to compare.</span>');
}

async function refresh() {
  const id = ++token, names = selected.slice();
  const p1 = $('#panel-compare'), p2 = $('#panel-t0');
  if (!names.length) {
    for (const p of [p1, p2]) panelState(p, { kind: 'info', title: 'Pick a country to compare', text: 'Add up to eight countries using the field above, or choose a quick selection.' });
    return;
  }
  [p1, p2].forEach((p) => { clearPanelState(p); setLoading(p, true); });
  try {
    const [cmp, t0] = await Promise.all([api.compare(names), api.t0(names), chartsReady()]);
    if (id !== token) return;
    [p1, p2].forEach((p) => setLoading(p, false));
    drawDaily(cmp, names); drawT0(t0, names);
  } catch {
    if (id !== token) return;
    [p1, p2].forEach((p) => panelError(p, refresh, 'this comparison'));
  }
}

const line = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 4.5, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: color, pointHoverBorderWidth: 2.5, tension: 0.25, spanGaps: true });
const tipSort = (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0);

function drawDaily(cmp, names) {
  const datasets = names.filter((n) => cmp.series[n]).map((n) => line(n, cmp.series[n].daily_7d, colorFor(n)));
  dailyChart = makeChart($('#compareCountriesChart'), {
    type: 'line', data: { labels: cmp.dates, datasets },
    options: {
      interaction: { mode: 'index', intersect: false }, scales: baseScales({ dates: true }),
      plugins: { tooltip: { itemSort: tipSort, callbacks: { title: dateTitle, label: (i) => ` ${i.dataset.label}: ${fmtInt(i.parsed.y)}` } } },
    },
    plugins: [crosshair],
  });
}
function drawT0(t0, names) {
  const datasets = names.filter((n) => t0.series[n]).map((n) => line(n, t0.series[n], colorFor(n)));
  t0Chart = makeChart($('#t0Chart'), {
    type: 'line', data: { labels: t0.days, datasets },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { ...baseScales({ yType: 'logarithmic', xTitle: 'Days since the 100th case' }), x: { ...baseScales({ xTitle: 'Days since the 100th case' }).x, ticks: { maxTicksLimit: 10, padding: 8, callback(v) { return this.getLabelForValue(v); } } } },
      plugins: { tooltip: { itemSort: tipSort, callbacks: { title: (it) => `Day ${it[0].label}`, label: (i) => ` ${i.dataset.label}: ${fmtInt(i.parsed.y)}` } } },
    },
    plugins: [crosshair],
  });
}

function add(name) {
  if (selected.includes(name)) return toast(`${name} is already selected`, 1800);
  if (selected.length >= MAX) {
    const dropped = selected.shift();
    selected.push(name);
    releaseColors();
    renderChips();
    refresh();
    toast(`Replaced ${dropped} with ${name} (Max ${MAX})`, 2200);
    return;
  }
  selected.push(name); renderChips(); refresh();
}
function setSelection(names) {
  selected = names.filter((n) => state.byName.has(n)).slice(0, MAX); releaseColors(); renderChips(); refresh();
}

export async function init() {
  await loadCountries().catch(() => {});
  selected = selected.filter((n) => !state.countries.length || state.byName.has(n));
  queued.forEach((n) => { if (!selected.includes(n) && selected.length < MAX) selected.push(n); }); queued = [];
  const input = $('#compare-search');
  createPicker({
    input, list: $('#compare-search-list'), limit: 12, emptyHint: 'Loading countries…',
    getItems: () => state.countries
      .filter((c) => !selected.includes(c.Country))
      .map((c) => ({
        name: c.Country,
        continent: c.Continent,
        hint: c.Continent,
      })),
    onSelect: add,
  });
  $('#compare-presets').innerHTML = PRESETS.map(([label], i) => `<button class="pill" type="button" data-preset="${i}">${esc(label)}</button>`).join('');
  $('#compare-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (b) setSelection(PRESETS[+b.dataset.preset][1]); });
  $('#compare-chips').addEventListener('click', (e) => {
    if (e.target.closest('#btn-clear-compare')) {
      selected = [];
      releaseColors();
      renderChips();
      refresh();
      return;
    }
    const b = e.target.closest('[data-remove]'); if (!b) return;
    selected = selected.filter((n) => n !== b.dataset.remove); releaseColors(); renderChips(); refresh();
  });
  renderChips(); ready = true;
  await refresh();
}
export function enter() { dailyChart?.resize(); t0Chart?.resize(); }
export function leave() {}

bus.on('compare:add', (name) => {
  if (!ready) { queued.push(name); } else add(name);
  if (location.hash !== '#compare') location.hash = '#compare';
});
