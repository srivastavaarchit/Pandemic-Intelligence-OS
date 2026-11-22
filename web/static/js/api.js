// Thin client for the FastAPI backend (endpoints unchanged).
const cache = new Map();

export class ApiError extends Error {}

export function getJSON(path, { cached = true, signal } = {}) {
  if (cached && cache.has(path)) return cache.get(path);
  const p = fetch(path, { signal, headers: { Accept: 'application/json' } }).then(async (r) => {
    if (!r.ok) throw new ApiError(`${r.status} ${r.statusText}`);
    return r.json();
  });
  if (cached) { cache.set(path, p); p.catch(() => cache.delete(path)); }
  return p;
}

const q = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const api = {
  overview: () => getJSON('/api/overview'),
  timeline: () => getJSON('/api/timeline?sample_rate=2'),
  countries: () => getJSON('/api/countries'),
  map: () => getJSON('/api/map'),
  country: (name) => getJSON(`/api/country/${encodeURIComponent(name)}`),
  compare: (names) => getJSON(`/api/compare?${q({ names: names.join('|') })}`),
  t0: (names) => getJSON(`/api/t0?${q({ names: names.join('|') })}`),
  socio: (x, y) => getJSON(`/api/socioeconomic?${q({ x_indicator: x, y_indicator: y })}`),
  sir: (params, opts = {}) => getJSON(`/api/simulate-sir?${q(params)}`, { cached: opts.cached ?? false, signal: opts.signal }),
  liveOverview: () => getJSON('/api/live/overview', { cached: false }),
  liveCountries: () => getJSON('/api/live/countries', { cached: true }),
  liveCountry: (name) => getJSON(`/api/live/country/${encodeURIComponent(name)}`, { cached: false }),
};
