// Shared app state + a tiny event bus. No framework needed.
import { api } from './api.js';

export const state = {
  overview: null,
  countries: [],            // full /api/countries payload
  byName: new Map(),
  ready: null,              // promise for countries
};

const handlers = new Map();
export const bus = {
  on(evt, fn) { (handlers.get(evt) || handlers.set(evt, new Set()).get(evt)).add(fn); return () => handlers.get(evt)?.delete(fn); },
  emit(evt, data) { handlers.get(evt)?.forEach(fn => fn(data)); },
};

/** Load the country list once; everything (search, table, presets) reads from it. */
export function loadCountries() {
  if (!state.ready) {
    state.ready = api.countries().then(list => {
      state.countries = list.slice().sort((a, b) => b.Confirmed - a.Confirmed);
      state.byName = new Map(state.countries.map(c => [c.Country, c]));
      bus.emit('countries', state.countries);
      return state.countries;
    }).catch(err => { state.ready = null; throw err; });
  }
  return state.ready;
}

export function loadOverview() {
  return api.overview().then(o => (state.overview = o));
}
