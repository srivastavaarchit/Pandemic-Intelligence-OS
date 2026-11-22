// Countries: sortable, filterable table; a row opens the dossier.
import { state, loadCountries } from '../store.js';
import { $, $$, esc, fmtInt, fmtPct, fmtMoney, isNum, icon } from '../ui.js';

const q = { sort: 'Confirmed', dir: -1, continent: 'all', text: '' };
let timer = 0;

const cmp = (key, dir) => (a, b) => {
  const x = a[key], y = b[key];
  if (key === 'Country') return dir * String(x).localeCompare(String(y));
  const nx = isNum(x), ny = isNum(y);
  if (!nx || !ny) return nx === ny ? 0 : nx ? -1 : 1;           // empty values always last
  return dir * (x - y);
};

function render() {
  const all = state.countries, text = q.text.trim().toLowerCase();
  const rows = all.filter((c) => (q.continent === 'all' || c.Continent === q.continent) && (!text || c.Country.toLowerCase().includes(text))).sort(cmp(q.sort, q.dir));
  const max = Math.max(...all.map((c) => c.Confirmed));
  $('#leaderboard-tbody').innerHTML = rows.length ? rows.map((c, i) => `
    <tr data-country="${esc(c.Country)}">
      <td>${i + 1}</td>
      <td><button class="cname" type="button" data-country="${esc(c.Country)}">${esc(c.Country)}</button></td>
      <td><div class="cell-bar">${fmtInt(c.Confirmed)}<i style="--w:${(c.Confirmed / max) * 100}%"></i></div></td>
      <td class="hide-sm">${fmtInt(c.Dead)}</td>
      <td>${fmtPct(c.Mortality)}</td>
      <td class="hide-sm ${isNum(c['Cases per mln']) ? '' : 'dim'}">${isNum(c['Cases per mln']) ? fmtInt(c['Cases per mln']) : '—'}</td>
      <td class="hide-sm ${isNum(c['GDP per capita']) ? '' : 'dim'}">${fmtMoney(c['GDP per capita'])}</td>
    </tr>`).join('')
    : `<tr><td colspan="7"><div class="state"><div class="state__icon">${icon('search')}</div><div class="state__title">No countries match</div>
        <p class="state__text">Nothing found${text ? ` for “${esc(q.text.trim())}”` : ''}${q.continent !== 'all' ? ` in ${esc(q.continent)}` : ''}.</p>
        <button class="btn btn--soft btn--sm" type="button" data-clear>Clear filters</button></div></td></tr>`;
  $('#tbl-count').textContent = `Showing ${rows.length} of ${all.length} countries and territories`;
  $$('#tbl thead th[data-sort]').forEach((th) => th.setAttribute('aria-sort', th.dataset.sort === q.sort ? (q.dir > 0 ? 'ascending' : 'descending') : 'none'));
}

function skeleton() {
  $('#leaderboard-tbody').innerHTML = Array.from({ length: 9 }, () => `<tr><td colspan="7"><div class="skeleton" style="height:22px"></div></td></tr>`).join('');
}

function exportCSV() {
  const all = state.countries, text = q.text.trim().toLowerCase();
  const rows = all.filter((c) => (q.continent === 'all' || c.Continent === q.continent) && (!text || c.Country.toLowerCase().includes(text))).sort(cmp(q.sort, q.dir));
  const headers = ['Country', 'Continent', 'Confirmed_Cases', 'Deaths', 'Fatality_Rate_Pct', 'Cases_Per_Million', 'GDP_Per_Capita'];
  const lines = [headers.join(',')];
  rows.forEach((c) => {
    lines.push([
      `"${c.Country.replace(/"/g, '""')}"`,
      `"${(c.Continent || '').replace(/"/g, '""')}"`,
      c.Confirmed ?? 0,
      c.Dead ?? 0,
      c.Mortality ?? 0,
      c['Cases per mln'] ?? '',
      c['GDP per capita'] ?? ''
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `covid19_countries_${q.continent}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function init() {
  skeleton();
  $('#btn-export-csv')?.addEventListener('click', exportCSV);
  $('#tbl thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]'); if (!th) return;
    const key = th.dataset.sort;
    if (q.sort === key) q.dir *= -1; else { q.sort = key; q.dir = key === 'Country' ? 1 : -1; }
    render();
  });
  $('#tbl-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-continent]'); if (!b) return;
    q.continent = b.dataset.continent;
    $$('#tbl-filters .pill').forEach((p) => p.setAttribute('aria-pressed', String(p === b)));
    render();
  });
  $('#table-search-input').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { q.text = e.target.value; render(); }, 80); });
  $('#leaderboard-tbody').addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear]')) return;
    q.text = ''; q.continent = 'all'; $('#table-search-input').value = '';
    $$('#tbl-filters .pill').forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.continent === 'all')));
    render();
  });
  try {
    await loadCountries();
    $('#countries-lede').textContent = `All ${state.countries.length} countries and territories in the dataset. Sort any column, filter by continent, or open a row for the full history.`;
    render();
  } catch {
    $('#leaderboard-tbody').innerHTML = `<tr><td colspan="7"><div class="state state--error"><div class="state__icon">${icon('triangle-alert')}</div><div class="state__title">Couldn’t load the countries</div>
      <p class="state__text">The data service didn’t respond. Make sure the server is running (python web/server.py).</p><button class="btn btn--soft btn--sm" type="button" data-retry>${icon('refresh-cw')}Try again</button></div></td></tr>`;
    $('#leaderboard-tbody').querySelector('[data-retry]').onclick = () => { skeleton(); init2(); };
  }
}
async function init2() { try { await loadCountries(); render(); } catch { /* keep error */ } }
export function enter() {}
export function leave() {}
