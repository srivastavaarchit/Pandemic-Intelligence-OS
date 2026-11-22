# Pandemic Intelligence OS — web app

A COVID-19 explorer: global waves, a 3D globe, country comparison, socioeconomic factors,
an epidemic simulator and a 3D virus lab. FastAPI backend, static frontend, **no build step**.

## Run it

```bash
pip install -r ../requirements.txt     # fastapi, uvicorn, pandas, numpy, scipy
python web/server.py                   # from the project root (covid19-pandemic-analysis/)
# open http://localhost:8000      API docs: http://localhost:8000/docs
```

Everything the page needs (fonts, Three.js, Chart.js, icons, map data) is served from `static/`,
so the app also works offline.

## Pages

| Route | What it is |
|---|---|
| `#overview` | Hero with a 3D virion and the real global curve, headline numbers, wave chart, rankings, continents |
| `#map` | 3D globe: bubble area = cases (or cases per million), colour = fatality rate |
| `#compare` | Up to 8 countries: daily cases and the "days since the 100th case" chart |
| `#factors` | Correlation between World Bank indicators and outcomes, with a plain-language verdict |
| `#simulator` | SIR model with scenarios and a "no action" baseline |
| `#countries` | Sortable, filterable table; every row opens a country dossier |
| `#lab` | Interactive 3D coronavirus: mask, pulse, colour, anatomy highlights, mascots |

Shortcuts: `/` jumps to any country, `Esc` closes any panel. The **?** button (bottom right) opens a
context-aware quick guide.

## Structure

```
static/
  index.html          markup for all views, dialog, guide, icon sprite
  styles.css          design system: tokens, components, views, responsive, reduced motion
  js/
    main.js           router, view lifecycle, view transitions
    shell.js          nav pill, menu sheet, search, guide, sound toggle
    dossier.js        country dialog          picker.js   accessible combobox
    api.js store.js   API client, shared state + event bus
    charts.js ui.js   Chart.js theme/plugins, small UI helpers
    views/*.js        one module per page
    three/virion.js   procedural 3D virus      three/globe.js   3D globe
    three/land-dots.json   offline land mask for the globe
  vendor/             three, Chart.js, canvas-confetti (pinned, self-hosted)
  fonts/              Bricolage Grotesque + Manrope (variable, OFL)
  img/                spiky.webp, shield.webp (cut-outs of your mascots); originals untouched
tools/make-land-dots.mjs   optional: regenerate the globe's dot grid
_original_ui/         your previous index.html / app.js / styles.css (not served; for reference)
```

### Design tokens (see top of `styles.css`)

Signal `#ff4a2b` = cases / contagion · Shield `#2d5bff` = protection · Ink `#15181f` = deaths.
Display type is Bricolage Grotesque, interface type is Manrope. Light theme only.

## Notes

* **Data fix.** `features/make_world_bank.py` divided by 10⁶ instead of multiplying, so every
  `… per mln` value was 10¹² too small (the old UI rounded them all to 0). The script is fixed and
  `data/processed/world_bank.csv` was rescaled. The original is saved as `_original_ui/world_bank.csv.orig`.
  Correlations (r, R², p) are unaffected because they are scale-invariant.
* **Backend.** `server.py` only gained gzip middleware (the 3D library is ~700 KB raw, ~170 KB gzipped).
  No endpoint changed.
* **Performance.** 3D scenes run only while visible, cap pixel ratio, and drop resolution / skip frames
  automatically on slow GPUs. `prefers-reduced-motion` turns off auto-rotation, the intro, counters and
  confetti. Without WebGL the app falls back to a static image and the list-based map.
* **Compare limitation.** Countries whose names contain a comma (e.g. "Korea, North") can't be sent to
  `/api/compare`, which takes a comma-separated list, so the picker marks them "Not supported".
* **Sounds** are off by default (toggle in the top bar; the choice is remembered).

## Third-party

three.js (MIT) · Chart.js (MIT) · canvas-confetti (ISC) · Lucide icons (ISC) ·
Natural Earth land via world-atlas (public domain) · Bricolage Grotesque and Manrope (SIL OFL).
