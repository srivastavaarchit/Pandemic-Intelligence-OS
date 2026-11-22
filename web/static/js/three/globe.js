// A dotted 3D globe with one bubble per country (area = cases, colour = fatality rate).
// Land comes from an offline dot grid (land-dots.json) so no map tiles are needed.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { cfrColor } from '../ui.js';

const toVec = (lat, lng, r = 1) => {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};
const Z = new THREE.Vector3(0, 0, 1);

export async function createGlobe(container, data, { onHover, onSelect, onFrame } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dotRows = await fetch('/static/js/three/land-dots.json').then((r) => r.json());

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const home = toVec(20, 12).normalize();
  camera.position.copy(home).multiplyScalar(5.0);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.07, minDistance: 1.6, maxDistance: 6.6, zoomSpeed: 0.7, autoRotate: !reduced, autoRotateSpeed: 0.5 });

  /* ocean: soft studio shading in view space */
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vN; void main(){
      vec3 n = normalize(vN);
      float key = dot(n, normalize(vec3(-0.45, 0.6, 0.66))) * 0.5 + 0.5;
      float rim = pow(1.0 - max(n.z, 0.0), 2.4);
      vec3 col = mix(vec3(0.885, 0.905, 0.945), vec3(1.0), key);
      col = mix(col, vec3(0.78, 0.82, 0.90), rim * 0.85);
      gl_FragColor = vec4(col, 1.0); }`,
  })));

  /* soft halo */
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float a = pow(clamp(0.62 + dot(normalize(vN), vec3(0.0,0.0,1.0)), 0.0, 1.0), 3.0) * 0.5; gl_FragColor = vec4(0.62, 0.70, 0.88, a); }',
  })));

  /* graticule */
  const gl = [];
  const seg = (a, b) => gl.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -60; lat <= 60; lat += 30) for (let l = 0; l < 360; l += 4) seg(toVec(lat, l, 1.0006), toVec(lat, l + 4, 1.0006));
  for (let lng = -180; lng < 180; lng += 30) for (let la = -84; la < 84; la += 4) seg(toVec(la, lng, 1.0006), toVec(la + 4, lng, 1.0006));
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
  scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x9aa4b6, transparent: true, opacity: 0.28 })));

  /* land dots */
  const total = dotRows.reduce((s, r) => s + r.length - 1, 0);
  const land = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0074, 7), new THREE.MeshBasicMaterial({ color: 0xb2bac8 }), total);
  { const d = new THREE.Object3D(); let k = 0;
    for (const row of dotRows) {
      const lat = row[0] / 10;
      for (let i = 1; i < row.length; i++) {
        const n = toVec(lat, row[i] / 10).normalize();
        d.position.copy(n).multiplyScalar(1.0014); d.quaternion.setFromUnitVectors(Z, n); d.updateMatrix(); land.setMatrixAt(k++, d.matrix);
      }
    }
    scene.add(land); }

  /* bubbles */
  const bubbles = data.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((item) => {
    const n = toVec(item.lat, item.lng).normalize(), color = cfrColor(item.mortality);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.62), transparent: true, opacity: 0.9, depthWrite: false }));
    for (const m of [disc, ring]) { m.quaternion.setFromUnitVectors(Z, n); scene.add(m); }
    disc.position.copy(n).multiplyScalar(1.0045); ring.position.copy(n).multiplyScalar(1.0048);
    return { item, n, disc, ring, r: 0.01, rt: 0.01 };
  });
  const byName = new Map(bubbles.map((b) => [b.item.country, b]));
  const beacon = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), new THREE.MeshBasicMaterial({ color: 0x15181f, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
  beacon.renderOrder = 999; scene.add(beacon);

  let metric = 'cases';
  function setMetric(m) {
    metric = m;
    const val = (b) => (m === 'cases' ? b.item.confirmed : b.item.cases_per_mln);
    const max = Math.max(...bubbles.map((b) => val(b) || 0));
    for (const b of bubbles) { const v = val(b); b.rt = v > 0 ? 0.012 + 0.072 * Math.sqrt(v / max) : 0.0075; b.muted = !(v > 0); }
    [...bubbles].sort((a, b) => b.rt - a.rt).forEach((b, i) => { b.disc.renderOrder = 10 + i * 2; b.ring.renderOrder = 11 + i * 2; });
  }
  setMetric('cases'); bubbles.forEach((b) => { b.r = b.rt; });

  /* ---------- picking (screen space) ---------- */
  const v3 = new THREE.Vector3(), size = { w: 1, h: 1 };
  function project(b) {
    v3.copy(b.n).multiplyScalar(1.0045);
    const facing = v3.dot(camera.position) > 1.0045 * 1.0045;
    const dist = camera.position.distanceTo(v3);
    v3.project(camera);
    const pxPerUnit = (size.h / 2) / (Math.tan((camera.fov * Math.PI) / 360) * dist);
    return { x: (v3.x * 0.5 + 0.5) * size.w, y: (-v3.y * 0.5 + 0.5) * size.h, visible: facing, rpx: b.r * pxPerUnit };
  }
  function pick(x, y) {
    let best = null, bd = Infinity;
    for (const b of bubbles) {
      const p = project(b); if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y), lim = Math.max(p.rpx * 1.1, 9);
      if (d <= lim && d / lim < bd) { bd = d / lim; best = b; }
    }
    return best;
  }

  let hovered = null, selected = null, flight = null, userAuto = !reduced, running = false, raf = 0, last = 0, time = 0;
  const ptr = { x: 0, y: 0, down: 0, t: 0, moved: false };
  canvas.addEventListener('pointerdown', (e) => { ptr.down = 1; ptr.x = e.offsetX; ptr.y = e.offsetY; ptr.t = performance.now(); ptr.moved = false; flight = null; controls.autoRotate = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (ptr.down) { if (Math.hypot(e.offsetX - ptr.x, e.offsetY - ptr.y) > 5) ptr.moved = true; return; }
    const b = pick(e.offsetX, e.offsetY);
    if (b !== hovered) { hovered = b; canvas.classList.toggle('is-pick', !!b); onHover?.(b?.item || null, b ? project(b) : null); }
  });
  canvas.addEventListener('pointerup', (e) => {
    ptr.down = 0;
    if (!ptr.moved && performance.now() - ptr.t < 500) { const b = pick(e.offsetX, e.offsetY); select(b?.item || null); }
  });
  canvas.addEventListener('pointerleave', () => { ptr.down = 0; if (hovered) { hovered = null; canvas.classList.remove('is-pick'); onHover?.(null, null); } if (userAuto && !selected) controls.autoRotate = true; });
  canvas.addEventListener('pointerenter', () => { controls.autoRotate = false; });

  function select(item) {
    selected = item ? byName.get(item.country) || null : null;
    beacon.material.opacity = 0;
    onSelect?.(selected?.item || null, selected ? project(selected) : null);
  }
  function flyTo(nameOrItem, dist = 2.5) {
    const b = typeof nameOrItem === 'string' ? byName.get(nameOrItem) : byName.get(nameOrItem.country);
    if (!b) return false;
    controls.autoRotate = false;
    const from = camera.position.clone(), fd = from.length();
    flight = { qa: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), b.n.clone()), from: from.normalize(), fd, td: Math.min(fd, dist), t: 0, dur: reduced ? 0.01 : 1.1 };
    select(b.item);
    return true;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    size.w = w; size.h = h; renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 36 : 28; camera.updateProjectionMatrix(); frame(0);
  }

  function frame(dt) {
    time += dt;
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      const q = new THREE.Quaternion().slerp(flight.qa, e);
      camera.position.copy(flight.from).applyQuaternion(q).multiplyScalar(flight.fd + (flight.td - flight.fd) * e);
      if (flight.t >= 1) flight = null;
    }
    controls.rotateSpeed = 0.22 + 0.34 * Math.min(1, (camera.position.length() - 1.6) / 3);
    controls.update();
    const k = 1 - Math.exp(-dt * 10);
    for (const b of bubbles) {
      b.r += (b.rt - b.r) * k;
      const hot = b === hovered || b === selected, s = b.r * (hot ? 1.2 : 1);
      b.disc.scale.setScalar(s); b.ring.scale.setScalar(s);
      b.disc.material.opacity = b.muted ? 0.3 : hot ? 0.82 : 0.6;
    }
    if (selected) {
      const p = (time * 0.9) % 1;
      beacon.position.copy(selected.n).multiplyScalar(1.006); beacon.quaternion.copy(selected.disc.quaternion);
      beacon.scale.setScalar(selected.r * (1.3 + p * 1.7)); beacon.material.opacity = (1 - p) * 0.5;
      onFrame?.(project(selected));
    }
    renderer.render(scene, camera);
  }
  let ema = 0.016, slow = 0, level = 0, tick = 0;
  function loop(now) {
    if (!running) return;
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    ema = ema * 0.9 + raw * 0.1;
    if (level < 2 && ema > 0.05 && ++slow > 24) { slow = 0; level++; if (level === 1) { renderer.setPixelRatio(1); resize(); } } else if (ema <= 0.05) slow = 0;
    raf = requestAnimationFrame(loop);
    if (level === 2 && (++tick & 1)) return;
    frame(level === 2 ? Math.min(0.05, dt * 2) : dt);
  }

  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  return {
    items: bubbles.map((b) => b.item),
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize, setMetric, flyTo, select,
    setAutoRotate(on) { userAuto = on; controls.autoRotate = on && !selected; },
    resetView() { select(null); const from = camera.position.clone(); flight = { qa: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), home), from: from.normalize(), fd: camera.position.length(), td: 5.0, t: 0, dur: reduced ? 0.01 : 1 }; },
    get hasSelection() { return !!selected; },
    dispose() { this.stop(); ro.disconnect(); controls.dispose(); renderer.dispose(); canvas.remove(); },
  };
}
