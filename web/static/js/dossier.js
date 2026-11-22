// Country dossier dialog (native <dialog>: focus trap, Esc, inert background for free).
import { api } from './api.js';
import { state, bus } from './store.js';
import { $, esc, fmtInt, fmtPct, fmtMoney, fmtCompact, icon, reduceMotion, segment } from './ui.js';
import { chartsReady, makeChart, baseScales, dateTitle, crosshair, fillGradient, C } from './charts.js';

const dlg = $('#dossier'), body = $('#dossier-body'), nameEl = $('#dossier-name'), subEl = $('#dossier-sub');
let current = null, chart = null, token = 0, lastFocus = null, lastDossierData = null;

export function closeDossier() {
  if (!dlg.open) return;
  if (reduceMotion()) { dlg.close(); return; }
  dlg.classList.add('is-closing');
  const done = () => { dlg.classList.remove('is-closing'); dlg.close(); };
  dlg.addEventListener('animationend', done, { once: true });
  setTimeout(() => dlg.classList.contains('is-closing') && done(), 320);
}

export async function openCountry(name) {
  if (!name) return;
  lastFocus = document.activeElement;
  const id = ++token;
  current = name;
  nameEl.textContent = name; subEl.innerHTML = '';
  body.innerHTML = skeleton();
  if (!dlg.open) dlg.showModal();
  try {
    const d = await api.country(name);
    if (id !== token) return;
    render(d);
  } catch {
    if (id !== token) return;
    body.innerHTML = `<div class="state state--error"><div class="state__icon">${icon('triangle-alert')}</div>
      <div class="state__title">Couldn’t load ${esc(name)}</div><p class="state__text">The data service didn’t respond.</p>
      <button class="btn btn--soft btn--sm" type="button" data-retry>${icon('refresh-cw')}Try again</button></div>`;
    body.querySelector('[data-retry]').onclick = () => openCountry(name);
  }
}

const skeleton = () => `<dl class="facts">${'<div class="fact"><dt class="skeleton">Label</dt><dd class="skeleton" style="width:80%">0000</dd></div>'.repeat(4)}</dl>
  <div class="skeleton" style="height:260px;margin-top:24px;border-radius:14px"></div>`;

async function render(d) {
  lastDossierData = d;
  const s = d.stats, n = state.countries.length || 198;
  subEl.innerHTML = `<span class="tag">${esc(s.continent)}</span>${s.country_code ? `<span class="tag">${esc(s.country_code)}</span>` : ''}`;
  const ctx = [
    ['GDP per capita', fmtMoney(s.gdp_per_capita)], ['Health spending', s.health_gdp_pct != null ? fmtPct(s.health_gdp_pct, 1) + ' of GDP' : '—'],
    ['Life expectancy', s.life_expectancy != null ? `${s.life_expectancy.toFixed(1)} years` : '—'], ['Rural population', s.rural_pct != null ? fmtPct(s.rural_pct, 1) : '—'],
  ];
  body.innerHTML = `
    <dl class="facts">
      <div class="fact"><dt><i style="background:var(--signal)"></i>Confirmed</dt><dd>${fmtCompact(s.confirmed, 2)}</dd><dd class="fact__note">#${s.rank_confirmed} of ${n}</dd></div>
      <div class="fact"><dt><i style="background:var(--ink)"></i>Deaths</dt><dd>${fmtCompact(s.dead, 2)}</dd><dd class="fact__note">#${s.rank_dead} of ${n}</dd></div>
      <div class="fact"><dt>Fatality rate</dt><dd>${fmtPct(s.mortality)}</dd><dd class="fact__note">#${s.rank_mortality} of ${n}</dd></div>
      <div class="fact"><dt>Cases per million</dt><dd>${s.cases_per_mln != null ? fmtCompact(s.cases_per_mln, 0) : '—'}</dd><dd class="fact__note">${s.dead_per_mln != null ? fmtInt(s.dead_per_mln) + ' deaths per million' : 'No population data'}</dd></div>
    </dl>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <h3 class="h3">History</h3>
        <div class="seg" role="radiogroup" aria-label="History chart" id="dossier-mode">
          <button type="button" role="radio" aria-checked="true" data-value="daily">New cases per day</button>
          <button type="button" role="radio" aria-checked="false" data-value="total">Total cases</button>
        </div>
      </div>
      <div class="chart-box"><canvas id="dossier-chart" role="img" aria-label="${esc(s.country)} cases over time"></canvas></div>
    </div>
    <dl class="ctx">${ctx.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div id="dossier-live-box" style="margin-top:16px;padding:12px 16px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);display:none;"></div>
    <div class="dossier__actions">
      <button class="btn btn--primary btn--sm" type="button" data-act="compare">${icon('git-compare')}Compare with other countries</button>
      <button class="btn btn--ghost btn--sm" type="button" data-act="globe">${icon('globe')}Show on globe</button>
    </div>`;

  api.liveCountry(s.country).then((lc) => {
    const box = $('#dossier-live-box');
    if (!box || !lc) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${lc.flag ? `<img src="${esc(lc.flag)}" alt="" style="width:24px;height:16px;object-fit:cover;border-radius:2px;box-shadow:0 0 2px rgba(0,0,0,0.2);">` : ''}
          <strong style="color:#059669;font-size:13px;display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;background:#10b981;border-radius:50%;display:inline-block;"></span>Live 2026 Registry</strong>
        </div>
        <div style="display:flex;gap:16px;font-size:12px;color:var(--ink-2);flex-wrap:wrap;">
          <span>Active: <b>${fmtInt(lc.active || 0)}</b></span>
          <span>Tests: <b>${fmtCompact(lc.tests || 0, 1)}</b></span>
          <span>Pop: <b>${fmtCompact(lc.population || 0, 1)}</b></span>
        </div>
      </div>
    `;
  }).catch(() => {});
  const draw = async (mode) => {
    await chartsReady();
    const t = d.timeline, total = mode === 'total';
    const data = total ? t.confirmed : t.daily_confirmed_7d;
    chart = makeChart($('#dossier-chart'), {
      type: 'line',
      data: { labels: t.dates, datasets: [{ label: total ? 'Total cases' : 'New cases (7-day avg)', data, borderColor: C.signal, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, ...fillGradient(C.signal, 0.25) }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: baseScales({ dates: true }),
        plugins: { tooltip: { callbacks: { title: dateTitle, label: (i) => ` ${i.dataset.label}: ${fmtInt(i.parsed.y)}` } } },
      },
      plugins: [crosshair],
    });
  };
  draw('daily');
  segment($('#dossier-mode'), draw);
}

dlg.addEventListener('click', (e) => {
  if (e.target === dlg) return closeDossier();                       // backdrop
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'compare') { bus.emit('compare:add', current); closeDossier(); }
  if (act === 'globe') { bus.emit('globe:focus', current); closeDossier(); }
});
$('#dossier-close').addEventListener('click', closeDossier);
$('#dossier-export-btn')?.addEventListener('click', () => {
  if (!lastDossierData) return;
  const t = lastDossierData.timeline, s = lastDossierData.stats;
  const lines = ['Date,Confirmed,Deaths,Daily_Confirmed,Daily_Confirmed_7d'];
  for (let i = 0; i < t.dates.length; i++) {
    lines.push(`${t.dates[i]},${t.confirmed[i] ?? 0},${t.dead[i] ?? 0},${t.daily_confirmed[i] ?? 0},${t.daily_confirmed_7d[i] ?? 0}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${s.country.replace(/[^a-zA-Z0-9_-]/g, '_')}_history.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDossier(); });
dlg.addEventListener('close', () => { chart?.destroy(); chart = null; token++; lastFocus?.focus?.(); });

// Anything with data-country opens a dossier (event delegation: names with quotes are safe).
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-country]');
  if (el && !el.closest('dialog.dossier')) { e.preventDefault(); openCountry(el.dataset.country); }
});
bus.on('dossier:open', openCountry);
