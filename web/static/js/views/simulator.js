// Simulator: SIR model via the API, with a "no action" baseline to make flattening visible.
import { api } from '../api.js';
import { $, $$, fmtInt, panelError, clearPanelState, setLoading, setRange } from '../ui.js';
import { chartsReady, makeChart, baseScales, crosshair, vMarker, fillGradient, C } from '../charts.js';

const PRESETS = { none: { red: 0 }, early: { day: 30, red: 40 }, late: { day: 90, red: 40 }, strong: { day: 30, red: 70 } };
let chart = null, timer = 0, ctl = null, first = true, token = 0;
const els = () => ({ r0: $('#sir-r0'), inf: $('#sir-infectious-days'), day: $('#sir-lockdown-day'), red: $('#sir-reduction') });

function paintLabels() {
  const e = els();
  $('#sir-r0-val').textContent = (+e.r0.value).toFixed(1);
  $('#sir-infectious-days-val').textContent = e.inf.value;
  $('#sir-lockdown-day-val').textContent = e.day.value;
  $('#sir-reduction-val').textContent = `${e.red.value}%`;
  Object.values(e).forEach(setRange);
  const day = +e.day.value, red = +e.red.value;
  const match = red === 0 ? 'none' : Object.entries(PRESETS).find(([k, p]) => k !== 'none' && p.day === day && p.red === red)?.[0];
  $$('#sir-presets [data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === match)));
}

async function run() {
  const e = els(), panel = $('#panel-sir'), id = ++token;
  ctl?.abort(); ctl = new AbortController();
  const p = { r0: +e.r0.value, infectious_days: +e.inf.value, simulation_days: 180, lockdown_day: +e.day.value, lockdown_reduction: +e.red.value };
  if (first) setLoading(panel, true);
  try {
    const [cur, base] = await Promise.all([
      api.sir(p, { signal: ctl.signal }),
      p.lockdown_reduction > 0 ? api.sir({ ...p, lockdown_reduction: 0 }, { cached: true, signal: ctl.signal }) : null,
      chartsReady(),
    ]);
    if (id !== token) return;
    first = false; clearPanelState(panel); setLoading(panel, false);
    draw(cur, base, p); summarize(cur, base, p);
  } catch (err) {
    if (err.name === 'AbortError' || id !== token) return;
    panelError(panel, run, 'the simulation');
  }
}

function draw(cur, base, p) {
  const t = cur.trajectory, acting = p.lockdown_reduction > 0;
  const capVal = (cur.parameters.population || 1000000) * 0.05; // 5% healthcare capacity threshold
  const ds = [
    { label: 'Susceptible', data: t.susceptible, borderColor: C.shield, backgroundColor: C.shield, order: 4 },
    { label: 'Infected', data: t.infected, borderColor: C.signal, ...fillGradient(C.signal, 0.22), order: 1 },
    { label: 'Recovered', data: t.recovered, borderColor: C.recover, backgroundColor: C.recover, order: 5 },
    { label: 'Hospital capacity', data: t.days.map(() => capVal), borderColor: '#e67e22', backgroundColor: '#e67e22', borderDash: [5, 4], borderWidth: 1.8, pointRadius: 0, order: 2 },
    { label: 'Infected with no action', data: base ? base.trajectory.infected : [], borderColor: C.ink4, backgroundColor: C.ink4, borderDash: [6, 5], hidden: !acting, order: 3 },
  ].map((d) => ({ pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.4, tension: 0.2, ...d }));
  $('.chart-legend span:last-child').style.display = acting ? '' : 'none';
  if (!chart) {
    chart = makeChart($('#sirSimulationChart'), {
      type: 'line', data: { labels: t.days, datasets: ds },
      options: {
        animation: { duration: 350 }, interaction: { mode: 'index', intersect: false },
        scales: (() => { const sc = baseScales({ xTitle: 'Days since the first case' }); sc.x.ticks = { padding: 8, maxRotation: 0, autoSkip: false, callback: (v) => (v % 30 === 0 ? v : '') }; return sc; })(),
        plugins: { vMarker: { enabled: acting, index: p.lockdown_day, label: 'Action starts' }, tooltip: { itemSort: (a, b) => b.parsed.y - a.parsed.y, callbacks: { title: (i) => `Day ${i[0].label}`, label: (i) => ` ${i.dataset.label}: ${fmtInt(i.parsed.y)}` } } },
      },
      plugins: [crosshair, vMarker],
    });
  } else {
    chart.data.labels = t.days; chart.data.datasets.forEach((d, i) => { d.data = ds[i].data; d.hidden = ds[i].hidden; });
    chart.options.plugins.vMarker = { enabled: acting, index: p.lockdown_day, label: 'Action starts' };
    chart.update();
  }
  $('#sirSimulationChart').setAttribute('aria-label', `Epidemic simulation: infections peak on day ${cur.summary.peak_day} at ${cur.summary.peak_infected_pct.toFixed(1)}% of the population`);
}

function summarize(cur, base, p) {
  const s = cur.summary, r = cur.parameters.effective_r0_after_lockdown;
  $('#sir-peak-day').textContent = `Day ${s.peak_day}`;
  $('#sir-peak-load').textContent = `${s.peak_infected_pct.toFixed(1)}%`;
  $('#sir-peak-count').textContent = `${fmtInt(s.peak_infected)} people at once`;
  $('#sir-attack-rate').textContent = `${s.total_attack_rate_pct.toFixed(1)}%`;
  const re = $('#sir-effective-r0'); re.textContent = r.toFixed(2); re.style.color = r < 1 ? 'var(--recover)' : '';
  $('#sir-r-note').textContent = r < 1 ? 'below 1, so the epidemic shrinks' : r < 1.005 ? 'exactly 1, so cases hold steady' : 'above 1, so it still grows';
  const box = $('#sir-delta'), text = box.querySelector('span');
  if (!base) { box.hidden = true; return; }
  const b = base.summary, cut = ((b.peak_infected - s.peak_infected) / b.peak_infected) * 100, delay = s.peak_day - b.peak_day;
  box.hidden = false;
  text.textContent = cut < 1
    ? (b.peak_day < p.lockdown_day ? `Acting on day ${p.lockdown_day} is too late to change the peak: infections had already passed their highest point on day ${b.peak_day}.` : 'This plan barely changes the peak. Try acting earlier or cutting transmission further.')
    : cut >= 99
      ? `Compared with no action, this plan stops the epidemic before it takes off. The share of people ever infected falls from ${b.total_attack_rate_pct.toFixed(0)}% to ${s.total_attack_rate_pct.toFixed(1)}%.`
      : `Compared with no action, this plan lowers the peak by ${Math.round(cut)}%${delay > 0 ? ` and delays it by ${delay} days` : ''}. The share of people ever infected falls from ${b.total_attack_rate_pct.toFixed(0)}% to ${s.total_attack_rate_pct.toFixed(0)}%.`;
}

export async function init() {
  const e = els();
  Object.values(e).forEach((el) => el.addEventListener('input', () => { paintLabels(); clearTimeout(timer); timer = setTimeout(run, 140); }));
  $('#sir-presets').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-preset]'); if (!b) return;
    const p = PRESETS[b.dataset.preset];
    if (p.day != null) e.day.value = p.day;
    e.red.value = p.red; paintLabels(); run();
  });
  paintLabels();
  await run();
}
export function enter() { chart?.resize(); }
export function leave() {}
