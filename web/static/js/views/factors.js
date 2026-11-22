// Factors: regression scatter between a socioeconomic indicator and an outcome, one dataset per continent.
import { api } from '../api.js';
import { $, esc, fmtInt, fmtCompact, fmtMoney, panelError, clearPanelState, setLoading } from '../ui.js';
import { chartsReady, makeChart, baseScales, C, CONTINENT_COLORS, rgba } from '../charts.js';

const LABEL = {
  'Cases per mln': 'cases per million', 'Dead per mln': 'deaths per million', 'Mortality %': 'fatality rate',
  'Rural population %': 'rural population share', 'GDP per capita': 'GDP per capita', 'GDP Healthcare %': 'health spending (% of GDP)', 'Life expectancy': 'life expectancy',
};
const TICK = {
  'GDP per capita': (v) => `$${fmtCompact(v, 0)}`, 'Rural population %': (v) => `${v}%`, 'GDP Healthcare %': (v) => `${v}%`, 'Life expectancy': (v) => v,
  'Cases per mln': (v) => fmtCompact(v, 0), 'Dead per mln': (v) => fmtCompact(v, 0), 'Mortality %': (v) => `${v}%`,
};
const SHOW = {
  'GDP per capita': fmtMoney, 'Rural population %': (v) => `${v.toFixed(1)}%`, 'GDP Healthcare %': (v) => `${v.toFixed(1)}% of GDP`, 'Life expectancy': (v) => `${v.toFixed(1)} years`,
  'Cases per mln': fmtInt, 'Dead per mln': fmtInt, 'Mortality %': (v) => `${v.toFixed(2)}%`,
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const minus = (n, d) => n.toFixed(d).replace('-', '−');
let chart = null, token = 0, hidden = new Set();

function verdict(d, x, y) {
  const r = d.correlation_r, a = Math.abs(r);
  const strength = a < 0.2 ? 'very weak' : a < 0.4 ? 'weak' : a < 0.6 ? 'moderate' : a < 0.8 ? 'strong' : 'very strong';
  if (d.p_value >= 0.05) return `<b>No reliable relationship.</b> Across these countries, ${LABEL[x]} says little about ${LABEL[y]}; any pattern could easily be chance.`;
  return `<b>${cap(strength)} ${r < 0 ? 'negative' : 'positive'} relationship.</b> Countries with a higher ${LABEL[x]} tended to report ${r < 0 ? 'lower' : 'higher'} ${LABEL[y]}. The factor accounts for about ${Math.round(d.r_squared * 100)}% of the differences between countries.`;
}

function legend(conts) {
  const el = $('#socio-legend');
  el.innerHTML = conts.map((c) => `<button class="pill" type="button" data-cont="${esc(c)}" aria-pressed="${!hidden.has(c)}" style="--c:${CONTINENT_COLORS[c] || C.ink4}"><i></i>${esc(c)}</button>`).join('')
    + '<span class="muted small" style="align-self:center;margin-left:6px">Point size shows total cases</span>';
}

function draw(d, x, y) {
  const groups = {};
  d.points.forEach((p) => (groups[p.continent] ||= []).push(p));
  const conts = Object.keys(groups).sort(), maxC = Math.max(...d.points.map((p) => p.confirmed));
  const rad = (c) => 3.5 + 9 * Math.sqrt(c / maxC);
  const xs = d.points.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const datasets = conts.map((c) => ({
    type: 'scatter', label: c, hidden: hidden.has(c),
    data: groups[c].map((p) => ({ x: p.x, y: p.y, country: p.country, confirmed: p.confirmed })),
    backgroundColor: rgba(CONTINENT_COLORS[c] || C.ink4, 0.72), borderColor: '#fff', borderWidth: 1.2,
    pointRadius: (ctx) => rad(ctx.raw?.confirmed ?? 0), pointHoverRadius: (ctx) => rad(ctx.raw?.confirmed ?? 0) + 3, order: 1,
  }));
  datasets.push({ type: 'line', label: 'Trend', data: [{ x: x0, y: d.slope * x0 + d.intercept }, { x: x1, y: d.slope * x1 + d.intercept }], borderColor: C.ink, borderDash: [7, 6], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, order: 0, hidden: false });
  const sc = baseScales({ yFmt: TICK[y], xTitle: cap(LABEL[x]), yTitle: cap(LABEL[y]) });
  sc.x = { ...sc.x, type: 'linear', grid: { color: C.grid }, ticks: { padding: 8, maxTicksLimit: 8, callback: (v) => TICK[x](v) } };
  sc.y.beginAtZero = y !== 'Mortality %' ? true : true;
  chart = makeChart($('#socioeconomicScatterChart'), {
    type: 'scatter', data: { datasets },
    options: {
      scales: sc, interaction: { mode: 'nearest', intersect: true },
      plugins: { tooltip: { filter: (i) => i.dataset.label !== 'Trend', callbacks: {
        title: (it) => it[0].raw.country,
        label: (i) => [` ${cap(LABEL[x])}: ${SHOW[x](i.raw.x)}`, ` ${cap(LABEL[y])}: ${SHOW[y](i.raw.y)}`, ` Total cases: ${fmtInt(i.raw.confirmed)}`],
      } } },
    },
  });
  legend(conts);
  $('#socioeconomicScatterChart').setAttribute('aria-label', `Scatter plot of ${LABEL[y]} against ${LABEL[x]} for ${d.points.length} countries`);
}

async function refresh() {
  const panel = $('#panel-socio'), x = $('#socio-x').value, y = $('#socio-y').value, id = ++token;
  clearPanelState(panel); setLoading(panel, true);
  try {
    const [d] = await Promise.all([api.socio(x, y), chartsReady()]);
    if (id !== token) return;
    setLoading(panel, false);
    $('#socio-r').textContent = minus(d.correlation_r, 2);
    $('#socio-r2').textContent = d.r_squared.toFixed(2);
    $('#socio-p').textContent = d.p_value < 0.001 ? '< 0.001' : d.p_value.toFixed(3);
    $('#socio-verdict').innerHTML = verdict(d, x, y);
    draw(d, x, y);
  } catch { if (id === token) panelError(panel, refresh, 'this analysis'); }
}

export async function init() {
  $('#socio-x').addEventListener('change', () => { hidden.clear(); refresh(); });
  $('#socio-y').addEventListener('change', () => { hidden.clear(); refresh(); });
  $('#socio-legend').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cont]'); if (!b || !chart) return;
    const c = b.dataset.cont, i = chart.data.datasets.findIndex((d) => d.label === c);
    hidden.has(c) ? hidden.delete(c) : hidden.add(c);
    b.setAttribute('aria-pressed', String(!hidden.has(c)));
    chart.setDatasetVisibility(i, !hidden.has(c)); chart.update();
  });
  await refresh();
}
export function enter() { chart?.resize(); }
export function leave() {}
