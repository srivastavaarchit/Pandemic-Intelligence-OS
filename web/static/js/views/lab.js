// Virus lab: interactive 3D model, anatomy highlights, and the mascot cards.
import { $, $$, celebrate, toast, tilt, esc } from '../ui.js';

let virion = null, inView = false, locked = null, hovered = null;
const sync = () => virion && (inView ? virion.start() : virion.stop());
const paint = () => virion?.highlight(hovered || locked);

export async function init() {
  const host = $('#lab-virion');
  $$('#view-lab [data-tilt]').forEach(tilt);
  $$('[data-cheer]').forEach((b) => b.addEventListener('click', () => { toast(b.dataset.cheer, 2200); celebrate(); }));
  $('#btn-celebrate').addEventListener('click', celebrate);

  try {
    const { createVirion } = await import('../three/virion.js');
    virion = createVirion(host, { zoom: true });
  } catch (err) {
    console.warn('3D unavailable', err);
    host.innerHTML = '<div class="virion-fallback"><img src="/static/img/spiky.webp" alt="" width="420" height="420"></div>';
    $('.lab__tools').hidden = true; $('.lab__hint').hidden = true;
    $$('.part').forEach((p) => { p.disabled = true; });
    return;
  }
  sync();

  const maskBtn = $('#lab-mask'), pulseBtn = $('#lab-pulse');
  const setMask = (on) => { maskBtn.setAttribute('aria-pressed', String(on)); maskBtn.querySelector('span').textContent = `Mask: ${on ? 'on' : 'off'}`; virion.setMask(on); };
  maskBtn.addEventListener('click', () => setMask(maskBtn.getAttribute('aria-pressed') !== 'true'));
  pulseBtn.addEventListener('click', () => {
    const on = pulseBtn.getAttribute('aria-pressed') !== 'true';
    pulseBtn.setAttribute('aria-pressed', String(on)); pulseBtn.querySelector('span').textContent = `Pulse: ${on ? 'on' : 'off'}`; virion.setPulse(on);
  });
  $('#lab-mutate').addEventListener('click', () => { $('#lab-swatch').style.setProperty('--sw', virion.mutate()); });
  $('#lab-swatch').style.setProperty('--sw', virion.color);

  $$('.part').forEach((p) => {
    const part = p.dataset.part;
    p.addEventListener('pointerenter', () => { hovered = part; paint(); });
    p.addEventListener('pointerleave', () => { hovered = null; paint(); });
    p.addEventListener('focus', () => { hovered = part; paint(); });
    p.addEventListener('blur', () => { hovered = null; paint(); });
    p.addEventListener('click', () => {
      locked = locked === part ? null : part;
      $$('.part').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.part === locked)));
      if (part === 'mask' && locked) setMask(true);
      paint();
    });
  });
}
export function enter() { inView = true; sync(); virion?.resize(); }
export function leave() { inView = false; sync(); }
