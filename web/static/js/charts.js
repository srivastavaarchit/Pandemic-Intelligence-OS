// Chart.js theme + helpers. Chart.js is loaded globally from /static/vendor/chart.umd.js.
import { fmtCompact, fmtMonthYear, fmtDate, reduceMotion } from './ui.js';

export const C = {
  signal: '#ff4a2b', shield: '#2d5bff', recover: '#14a06e', ink: '#15181f',
  ink3: '#5a6371', ink4: '#8b93a1', grid: 'rgba(21,24,31,0.07)',
};
export const SERIES = ['#2d5bff', '#ff4a2b', '#14a06e', '#f2a31b', '#7c4dff', '#00a3b4', '#e5399b', '#5a6371'];
export const CONTINENT_COLORS = {
  Asia: '#2d5bff', Europe: '#7c4dff', 'North America': '#ff4a2b', 'South America': '#f2a31b',
  Africa: '#14a06e', Oceania: '#00a3b4', Other: '#8b93a1',
};

export const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

let ready;
export function chartsReady() {
  ready ||= new Promise((res) => {
    const go = () => {
      if (window.Chart) { theme(); res(window.Chart); } else setTimeout(go, 30);
    };
    go();
  });
  return ready;
}

function theme() {
  const D = Chart.defaults;
  D.font.family = '"Manrope", ui-sans-serif, system-ui, sans-serif';
  D.font.size = 12; D.font.weight = 600; D.color = C.ink3;
  D.maintainAspectRatio = false; D.responsive = true;
  D.animation = reduceMotion() ? false : { duration: 800, easing: 'easeOutQuart' };
  D.plugins.legend.display = false;
  const t = D.plugins.tooltip;
  Object.assign(t, {
    backgroundColor: '#15181f', titleColor: '#ffffff', bodyColor: '#e5e8ee', borderWidth: 0,
    padding: { x: 14, y: 11 }, cornerRadius: 12, boxPadding: 6, usePointStyle: true, caretSize: 0,
    titleFont: { weight: '800', size: 12 }, bodyFont: { weight: '600', size: 12 }, titleMarginBottom: 6,
  });
  D.datasets.line.borderCapStyle = 'round';
  Chart.register(gradientFill);
}

/** Create (or recreate) a chart on a canvas. */
export function makeChart(canvas, config) {
  window.Chart.getChart(canvas)?.destroy();
  return new window.Chart(canvas, config);
}

/** Spread into a line dataset to get a vertical fade under it. The gradientFill plugin paints it from the
 *  line's own path, so Chart.js never has to animate a gradient colour (which breaks its colour interpolation). */
export const fillGradient = (color, top = 0.28) => ({ gradient: { color, top } });
export const gradientFill = {
  id: 'gradientFill',
  beforeDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index], a = chart.chartArea;
    if (!ds?.gradient || !a || !chart.isDatasetVisible(args.index)) return;
    const pts = args.meta.data.filter((p) => !p.skip && Number.isFinite(p.y));
    if (pts.length < 2) return;
    const { ctx } = chart;
    ctx.save();
    ctx.beginPath(); args.meta.dataset.path(ctx);
    ctx.lineTo(pts[pts.length - 1].x, a.bottom); ctx.lineTo(pts[0].x, a.bottom); ctx.closePath();
    const g = ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, rgba(ds.gradient.color, ds.gradient.top)); g.addColorStop(1, rgba(ds.gradient.color, 0));
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
  },
};

/** Axis defaults shared by line charts. */
export const baseScales = ({ yType = 'linear', yTitle, yFmt = (v) => fmtCompact(v, 0), xTitle, dates = false } = {}) => ({
  x: {
    grid: { display: false }, border: { color: 'rgba(21,24,31,0.12)' },
    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, padding: 8, ...(dates ? { callback: monthTick } : {}) },
    title: xTitle ? { display: true, text: xTitle, color: C.ink3, font: { weight: '700' }, padding: { top: 8 } } : undefined,
  },
  y: {
    type: yType, beginAtZero: yType === 'linear', border: { display: false }, grid: { color: C.grid },
    ticks: { padding: 10, callback: (v) => yFmt(v), maxTicksLimit: 6 },
    title: yTitle ? { display: true, text: yTitle, color: C.ink3, font: { weight: '700' } } : undefined,
  },
});

/** Category axis that stores ISO dates but prints "Mar 2021". */
export const monthTick = function (v) { return fmtMonthYear(this.getLabelForValue(v)); };
export const dateTitle = (items) => fmtDate(items[0].label);

/* ---------- plugins ---------- */
export const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const a = chart.tooltip?._active;
    if (!a?.length) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    ctx.save(); ctx.strokeStyle = 'rgba(21,24,31,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(a[0].element.x, top); ctx.lineTo(a[0].element.x, bottom); ctx.stroke(); ctx.restore();
  },
};

/** Labels the highest point of one dataset. */
export const peakLabel = {
  id: 'peakLabel',
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts?.enabled) return;
    const meta = chart.getDatasetMeta(opts.dataset ?? 0);
    const data = chart.data.datasets[opts.dataset ?? 0].data;
    let mi = -1, mv = -Infinity;
    data.forEach((v, i) => { if (v > mv) { mv = v; mi = i; } });
    const el = meta.data[mi]; if (!el) return;
    const { ctx, chartArea } = chart;
    const text = `${fmtCompact(mv, 1)} a day · ${fmtDate(chart.data.labels[mi])}`;
    ctx.save();
    ctx.font = '700 12px Manrope, sans-serif';
    const w = ctx.measureText(text).width + 22, h = 28;
    let x = el.x - w / 2; x = Math.max(chartArea.left, Math.min(x, chartArea.right - w));
    const y = Math.max(chartArea.top - 6, el.y - h - 14);
    ctx.fillStyle = '#15181f'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 11, y + h / 2 + 0.5);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = C.signal; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(el.x, el.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
};

/** Dashed vertical marker at a category index (used by the simulator). */
export const vMarker = {
  id: 'vMarker',
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts?.enabled) return;
    const x = chart.scales.x.getPixelForValue(opts.index);
    const { ctx, chartArea: { top, bottom, right } } = chart;
    if (!Number.isFinite(x)) return;
    ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.25; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 12px Manrope, sans-serif';
    const text = opts.label, w = ctx.measureText(text).width + 20, h = 26;
    const bx = Math.min(x + 8, right - w);
    ctx.fillStyle = '#15181f'; ctx.beginPath(); ctx.roundRect(bx, top + 4, w, h, 13); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 10, top + 4 + h / 2 + 0.5);
    ctx.restore();
  },
};
