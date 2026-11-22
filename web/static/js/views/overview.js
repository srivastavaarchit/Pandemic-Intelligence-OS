// Overview: hero (3D virion + live curve), headline ledger, waves chart, rankings, continents.
import { api } from '../api.js';
import { loadOverview, bus } from '../store.js';
import { $, $$, esc, fmtInt, fmtPct, fmtDate, fmtMonthYear, fmtCompact, compactParts, countUp, onVisible, panelError, clearPanelState, setLoading, segment, reduceMotion, icon } from '../ui.js';
import { chartsReady, makeChart, baseScales, dateTitle, crosshair, peakLabel, fillGradient, rgba, C, CONTINENT_COLORS } from '../charts.js';
import { setApiStatus } from '../shell.js';

let virion = null, inView = false, heroVisible = true, overviewData = null, timeline = null, wavesChart = null;
const mode = { type: 'daily', scale: 'linear' };

/* ---------- hero ---------- */
function startIntro() {
  const hero = $('#hero');
  const go = () => requestAnimationFrame(() => hero.classList.add('is-in'));
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))]).then(go);
}

function syncVirion() { if (virion) (inView && heroVisible ? virion.start() : virion.stop()); }

async function initHeroVirion() {
  const host = $('#hero-virion');
  try {
    const { createVirion } = await import('../three/virion.js');
    virion = createVirion(host, { zoom: false, parallax: true });
    host.classList.add('is-ready');
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; syncVirion(); }, { threshold: 0.05 }).observe(host);
    syncVirion();
    const btn = $('#hero-mask-btn');
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('span').textContent = on ? 'Take off the mask' : 'Put on a mask';
      virion.setMask(on);
    });
  } catch (err) {
    console.warn('3D unavailable, showing static image', err);
    host.innerHTML = '<div class="virion-fallback"><img src="/static/img/spiky.webp" alt="" width="520" height="520"></div>';
    host.classList.add('is-ready');
    $('#hero-mask-btn').hidden = true;
  }
}

function renderCurve(t) {
  const v = t.daily_confirmed_7d, n = v.length, max = Math.max(...v);
  const W = 1000, H = 300, top = H * 0.32, base = H - 34;   // bottom band is reserved for the axis labels
  const X = (i) => (i / (n - 1)) * W, Y = (val) => base - (val / max) * (base - top);
  const d = v.map((val, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(val).toFixed(1)}`).join('');
  $('#curve-line').setAttribute('d', d);
  $('#curve-area').setAttribute('d', `${d}L${W},${base}L0,${base}Z`);
  $('#curve-start').textContent = fmtMonthYear(t.dates[0]);
  $('#curve-end').textContent = fmtMonthYear(t.dates[n - 1]);

  // three tallest, well-separated peaks
  const peaks = [];
  for (let i = 3; i < n - 3; i++) {
    const w = v.slice(Math.max(0, i - 14), i + 15);
    if (v[i] === Math.max(...w) && v[i] > max * 0.15) peaks.push(i);
  }
  const top3 = peaks.sort((a, b) => v[b] - v[a]).slice(0, 3);
  const host = $('#curve-annots');
  host.innerHTML = top3.map((i, rank) => `
    <div class="annot ${rank ? 'annot--minor' : ''}" data-x="${(X(i) / W) * 100}" style="left:${(X(i) / W) * 100}%;top:${(Y(v[i]) / H) * 100}%">
      <div class="annot__card"><strong>${fmtCompact(v[i], 1)} a day</strong><span>${fmtMonthYear(t.dates[i])}</span></div>
      <i class="annot__stem"></i><i class="annot__dot"></i></div>`).join('');
  revealCurve($$('.annot', host));
}

function revealCurve(annots) {
  const rect = $('#curve-reveal-rect');
  if (reduceMotion()) { rect.setAttribute('width', 1000); annots.forEach((a) => a.classList.add('is-on')); return; }
  const start = performance.now() + 650, dur = 2900;
  const tick = (now) => {
    const p = Math.min(1, Math.max(0, (now - start) / dur));
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const w = e * 1000; rect.setAttribute('width', w);
    annots.forEach((a) => { if (+a.dataset.x * 10 <= w) a.classList.add('is-on'); });
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- ledger ---------- */
function renderLedger(o) {
  // The true value is always in the DOM; the count-up is only a flourish when the ledger scrolls into view.
  const fill = (sel, to, fmt) => { const el = $(sel); el.classList.remove('skeleton'); el.innerHTML = fmt(to); onVisible(el.closest('.stat'), () => countUp(el, to, fmt)); };
  const c = compactParts(o.total_confirmed, 1), d = compactParts(o.total_dead, 2);
  fill('#kpi-total-confirmed', +c.v, (v) => `${v.toFixed(1)}<small>${c.u}</small>`);
  fill('#kpi-total-deaths', +d.v, (v) => `${v.toFixed(2)}<small>${d.u}</small>`);
  fill('#kpi-mortality-rate', o.mortality_rate, (v) => `${v.toFixed(2)}<small>%</small>`);
  const [y, m, day] = o.peak_day.date.split('-').map(Number);
  const pk = $('#kpi-peak-date'); pk.classList.remove('skeleton');
  pk.innerHTML = `${day} ${fmtDate(o.peak_day.date).split(' ')[1]}<small>${y}</small>`;
  $('#kpi-peak-cases').textContent = `${fmtInt(o.peak_day.cases)} new cases reported that day.`;
  $('#kpi-cases-note').textContent = `Reported by ${o.total_countries} countries and territories over ${fmtInt(o.total_days)} days.`;
  $('#hero-meta').textContent = `Johns Hopkins CSSE data, ${fmtDate(o.start_date)} to ${fmtDate(o.end_date)}`;
}

/* ---------- rankings & continents ---------- */
function renderRank(kind = 'cases') {
  const o = overviewData; if (!o) return;
  const cases = kind === 'cases', rows = cases ? o.top_confirmed : o.top_mortality;
  const max = Math.max(...rows.map((r) => (cases ? r.Confirmed : r.Mortality)));
  $('#rank-desc').textContent = cases ? 'The ten countries with the most confirmed cases. Select one for its full history.' : 'Highest fatality rates among countries with more than 5,000 cases.';
  $('#rank-list').className = `rank ${cases ? '' : 'rank--cfr'}`;
  $('#rank-list').innerHTML = rows.map((r, i) => `
    <button class="rank__row" type="button" data-country="${esc(r.Country)}">
      <span class="rank__i num">${i + 1}</span>
      <span class="rank__name">${esc(r.Country)}</span>
      <span class="rank__bar"><i style="--w:${((cases ? r.Confirmed : r.Mortality) / max) * 100}%;animation-delay:${i * 45}ms"></i></span>
      <span class="rank__val"><b>${cases ? fmtCompact(r.Confirmed, 1) : fmtPct(r.Mortality, 1)}</b><small>${cases ? `${fmtPct(r.Mortality)} fatal` : `${fmtCompact(r.Confirmed, 1)} cases`}</small></span>
    </button>`).join('');
}

function renderContinents(o) {
  const list = o.continents.slice().sort((a, b) => b.Confirmed - a.Confirmed);
  const total = list.reduce((s, c) => s + c.Confirmed, 0);
  const label = (n) => (n === 'Other' ? 'Other territories' : n);
  $('#cont-strip').innerHTML = list.map((c) => `<i data-cont="${esc(c.Continent)}" style="--f:${c.Confirmed / total};--c:${CONTINENT_COLORS[c.Continent] || C.ink4}" title="${esc(label(c.Continent))}: ${(c.Confirmed / total * 100).toFixed(1)}%"></i>`).join('');
  $('#cont-list').innerHTML = list.map((c) => `
    <div class="cont" data-cont="${esc(c.Continent)}" style="--c:${CONTINENT_COLORS[c.Continent] || C.ink4}">
      <span class="cont__sw"></span>
      <span class="cont__name">${esc(label(c.Continent))}<small>${c.Countries} ${c.Countries === 1 ? 'country' : 'countries'} · ${fmtCompact(c.Confirmed, 1)} cases</small></span>
      <span class="cont__share">${(c.Confirmed / total * 100).toFixed(1)}%</span>
      <span class="cont__cfr">${fmtPct(c.Mortality)} fatal</span>
    </div>`).join('');
  const panel = $('#panel-cont'), strip = $('#cont-strip');
  const hot = (name, on) => { strip.classList.toggle('is-hot', on); $$('[data-cont]', panel).forEach((el) => el.classList.toggle('is-hot', on && el.dataset.cont === name)); };
  panel.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-cont]'); if (el) hot(el.dataset.cont, true); });
  panel.addEventListener('pointerout', (e) => { if (e.target.closest('[data-cont]')) hot('', false); });
}

/* ---------- waves chart ---------- */
async function renderWaves() {
  const panel = $('#panel-timeline');
  if (!timeline) return;
  await chartsReady();
  const t = timeline, cum = mode.type === 'cumulative', log = mode.scale === 'log';
  const f = (a) => (log ? a.map((v) => (v > 0 ? v : null)) : a);
  const line = (data, color, extra = {}) => ({ type: 'line', data: f(data), borderColor: color, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: color, pointHoverBorderWidth: 2.5, tension: 0.25, spanGaps: true, ...extra });
  const datasets = cum
    ? [line(t.confirmed, C.signal, { label: 'Confirmed cases', ...fillGradient(C.signal, 0.22) }), line(t.deaths || t.dead, C.ink, { label: 'Deaths', ...(log ? {} : fillGradient(C.ink, 0.12)) })]
    : [{ type: 'bar', label: 'Reported that day', data: f(t.daily_confirmed), backgroundColor: rgba(C.signal, 0.2), hoverBackgroundColor: rgba(C.signal, 0.5), barPercentage: 1, categoryPercentage: 1, borderWidth: 0, order: 2 },
       line(t.daily_confirmed_7d, C.signal, { label: '7-day average', order: 1 })];
  let legend = $('#waves-legend');
  if (!legend) { legend = document.createElement('div'); legend.id = 'waves-legend'; legend.className = 'chart-legend'; legend.setAttribute('aria-hidden', 'true'); $('.chart-box', panel).before(legend); }
  legend.innerHTML = cum
    ? `<span><i style="--c:var(--signal)"></i>Confirmed cases</span><span><i style="--c:var(--ink)"></i>Deaths</span>`
    : `<span><i style="--c:rgba(255,74,43,.35)"></i>Reported that day</span><span><i style="--c:var(--signal)"></i>7-day average</span>`;
  const scales = baseScales({ yType: log ? 'logarithmic' : 'linear', dates: true });
  if (log) scales.y.min = 1;
  wavesChart = makeChart($('#globalTimelineChart'), {
    type: cum ? 'line' : 'bar', data: { labels: t.dates, datasets },
    options: {
      interaction: { mode: 'index', intersect: false }, scales,
      plugins: { peakLabel: { enabled: !cum && !log, dataset: 1 }, tooltip: { callbacks: { title: dateTitle, label: (i) => ` ${i.dataset.label}: ${fmtInt(i.parsed.y)}` } } },
    },
    plugins: [crosshair, peakLabel],
  });
  const ds = $('#globalTimelineChart');
  const peak = Math.max(...t.daily_confirmed_7d);
  ds.setAttribute('aria-label', cum ? 'Cumulative confirmed cases and deaths worldwide' : `New cases per day worldwide, 7-day average, peaking at ${fmtCompact(peak, 1)} a day`);
}

/* ---------- lifecycle ---------- */
async function load() {
  setLoading($('#panel-timeline'), true);
  const [ov, tl] = await Promise.allSettled([loadOverview(), api.timeline()]);
  setApiStatus(ov.status === 'fulfilled');
  if (ov.status === 'fulfilled') {
    overviewData = ov.value; bus.emit('overview', overviewData);
    ['#panel-rank', '#panel-cont'].forEach((s) => clearPanelState($(s)));
    renderLedger(overviewData); renderRank($('#rank-mode [aria-checked="true"]').dataset.value); renderContinents(overviewData);
  } else {
    ['#panel-rank', '#panel-cont'].forEach((s) => panelError($(s), load, 'these rankings'));
    ['#kpi-total-confirmed', '#kpi-total-deaths', '#kpi-mortality-rate', '#kpi-peak-date'].forEach((s) => { const e = $(s); e.classList.remove('skeleton'); e.textContent = '—'; });
    $('#hero-meta').textContent = 'Data service unavailable. Start the server and refresh.';
  }
  const panel = $('#panel-timeline');
  if (tl.status === 'fulfilled') {
    timeline = tl.value; clearPanelState(panel); setLoading(panel, false);
    renderCurve(timeline); renderWaves();
  } else {
    panelError(panel, load, 'the timeline');
    $('#hero-curve').hidden = true;
  }
}

let isLive = false, liveData = null;

async function toggleLiveSync() {
  const btn = $('#btn-live-sync'), txt = $('#live-sync-text'), dot = $('#live-dot');
  if (!isLive) {
    txt.textContent = 'Syncing...';
    try {
      if (!liveData) liveData = await api.liveOverview();
      isLive = true;
      txt.textContent = 'Live Feed Active';
      btn.style.background = 'rgba(16, 185, 129, 0.12)';
      btn.style.borderColor = '#10b981';
      dot.style.background = '#10b981';

      const c = compactParts(liveData.total_confirmed, 1), d = compactParts(liveData.total_dead, 2);
      $('#kpi-total-confirmed').innerHTML = `${(+c.v).toFixed(1)}<small>${c.u}</small>`;
      $('#kpi-total-deaths').innerHTML = `${(+d.v).toFixed(2)}<small>${d.u}</small>`;
      $('#kpi-mortality-rate').innerHTML = `${liveData.mortality_rate.toFixed(2)}<small>%</small>`;
      $('#kpi-cases-note').textContent = `Live registry from WHO / Disease.sh (${fmtInt(liveData.active_cases)} active cases worldwide, ${fmtCompact(liveData.total_tests, 1)} tests).`;
      $('#hero-meta').innerHTML = `<b style="color:#10b981">● LIVE STREAM</b> — Real-time Public Health Registry (${fmtInt(liveData.total_countries)} territories, updated: ${new Date(liveData.updated).toLocaleTimeString()})`;
    } catch (err) {
      console.error('Live sync failed:', err);
      txt.textContent = 'Live Sync Failed';
      setTimeout(() => { txt.textContent = 'Live 2026 Sync'; }, 3000);
    }
  } else {
    isLive = false;
    txt.textContent = 'Live 2026 Sync';
    btn.style.background = '';
    btn.style.borderColor = '';
    if (overviewData) renderLedger(overviewData);
  }
}

export async function init() {
  startIntro();
  initHeroVirion();
  $('#btn-live-sync')?.addEventListener('click', toggleLiveSync);
  segment($('#timeline-mode'), (v) => { mode.type = v; renderWaves(); });
  segment($('#timeline-scale'), (v) => { mode.scale = v; renderWaves(); });
  segment($('#rank-mode'), renderRank);
  await load();
}
export function enter() { inView = true; syncVirion(); wavesChart?.resize(); }
export function leave() { inView = false; syncVirion(); }
