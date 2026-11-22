// Accessible country combobox (ARIA 1.2 pattern): filter-as-you-type, arrow keys, Enter, Esc.
import { esc } from './ui.js';

export function createPicker({ input, list, getItems, onSelect, limit = 8, clearOnSelect = true, emptyHint }) {
  let isOpen = false, active = -1, results = [];
  const opt = (i) => `${list.id}-o${i}`;

  function filter(q) {
    const items = getItems();
    q = q.trim().toLowerCase();
    if (!q) return items.slice(0, limit);
    const starts = [], has = [];
    for (const it of items) {
      const n = it.name.toLowerCase();
      if (n.startsWith(q)) starts.push(it); else if (n.includes(q)) has.push(it);
    }
    return [...starts, ...has].slice(0, limit);
  }

  function render() {
    const q = input.value.trim();
    results = filter(input.value);
    if (!results.length) {
      list.innerHTML = `<div class="search__empty">${q ? `No country matches “${esc(q)}”` : esc(emptyHint || 'Nothing to show')}</div>`;
      active = -1;
    } else {
      if (active < 0 || active >= results.length) active = 0;
      list.innerHTML = results.map((r, i) =>
        `<div role="option" id="${opt(i)}" class="search__opt" data-i="${i}" aria-selected="${i === active}" ${r.disabled ? 'aria-disabled="true"' : ''}>
           <span>${esc(r.name)}</span><small>${esc(r.hint ?? r.continent ?? '')}</small></div>`).join('');
    }
    input.setAttribute('aria-activedescendant', active >= 0 && results.length ? opt(active) : '');
  }
  function open() { if (isOpen) return; isOpen = true; list.hidden = false; input.setAttribute('aria-expanded', 'true'); render(); }
  function close() { isOpen = false; list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function move(d) {
    if (!results.length) return;
    active = (active + d + results.length) % results.length;
    render();
    document.getElementById(opt(active))?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const r = results[i]; if (!r || r.disabled) return;
    if (clearOnSelect) input.value = '';
    close(); onSelect(r.name);
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', () => { active = 0; open(); render(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); open(); move(-1); }
    else if (e.key === 'Enter') { if (isOpen && active >= 0) { e.preventDefault(); choose(active); } }
    else if (e.key === 'Escape') { if (isOpen) { e.stopPropagation(); close(); } else input.blur(); }
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault());
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) choose(+o.dataset.i); });
  list.addEventListener('mousemove', (e) => { const o = e.target.closest('[data-i]'); if (o && +o.dataset.i !== active) { active = +o.dataset.i; render(); } });
  return { close, refresh: () => isOpen && render() };
}
