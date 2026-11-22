// Entry point: router, view lifecycle, view transitions.
import './dossier.js';
import { $, $$, initReveal, magnetic, tilt, reduceMotion } from './ui.js';
import { initShell, setActive, sfx } from './shell.js';
import * as overview from './views/overview.js';
import * as map from './views/map.js';
import * as compare from './views/compare.js';
import * as factors from './views/factors.js';
import * as simulator from './views/simulator.js';
import * as countries from './views/countries.js';
import * as lab from './views/lab.js';

const VIEWS = { overview, map, compare, factors, simulator, countries, lab };
const TITLES = { overview: 'Overview', map: 'Map', compare: 'Compare countries', factors: 'Factors', simulator: 'Simulator', countries: 'Countries', lab: 'Virus lab' };
const inited = new Set();
let current = null;

async function show(id, initial) {
  if (id === current) return;
  const prev = current && $(`#view-${current}`), next = $(`#view-${id}`);
  VIEWS[current]?.leave?.();
  current = id;
  const swap = () => { $$('.view').forEach((v) => { v.hidden = v !== next; }); window.scrollTo(0, 0); };

  if (!initial && !reduceMotion() && document.startViewTransition && document.visibilityState === 'visible') {
    try {
      const vt = document.startViewTransition(swap);
      vt.ready.catch(() => {}); vt.finished.catch(() => {});
      await vt.updateCallbackDone;
    } catch { /* transition skipped or aborted */ }
    if (next.hidden) swap();                      // never leave the user on a stale view
  } else {
    swap();
    if (!initial && !reduceMotion()) { next.classList.add('is-entering'); next.addEventListener('animationend', () => next.classList.remove('is-entering'), { once: true }); }
  }
  setActive(id);
  document.title = id === 'overview' ? 'Pandemic Intelligence OS · COVID-19, country by country' : `${TITLES[id]} · Pandemic Intelligence OS`;
  if (!initial) next.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
  initReveal();

  if (!inited.has(id)) {
    inited.add(id);
    try { await VIEWS[id].init?.(); } catch (err) { console.error(`[${id}] init failed`, err); }
  }
  if (current === id) VIEWS[id].enter?.();
}

function route(initial = false) {
  const id = location.hash.replace('#', '').split('?')[0];
  show(id in VIEWS ? id : 'overview', initial);
}

addEventListener('hashchange', () => { sfx.nav(); route(); });
initShell();
$$('[data-magnetic]').forEach((el) => magnetic(el));
$$('[data-tilt]').forEach((el) => tilt(el));
initReveal();
route(true);
