// A procedural coronavirus "specimen" lit like a studio product render.
// Porcelain envelope, 68 instanced spike proteins, a pleated surgical mask, and droplets the mask can block.
import * as THREE from 'three';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';

const R = 2.0;                       // envelope radius
const SPIKES = 68;
const MASK_R = 2.9;                  // mask hovers just beyond the spike tips
const PALETTE = ['#ff4a2b', '#2d5bff', '#14a06e', '#f2a31b', '#7c4dff'];

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function fibonacci(n) {
  const pts = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    pts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return pts;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(21,24,31,0.55)'); grd.addColorStop(0.45, 'rgba(21,24,31,0.2)'); grd.addColorStop(1, 'rgba(21,24,31,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Pleated surgical mask as a parametric patch on a sphere of radius MASK_R. */
function buildMask() {
  const cols = 44, rows = 18, azHalf = 0.64, elHalf = 0.33, elC = -0.16;
  const pos = [], idx = [];
  const point = (u, v, bulge = true) => {
    const taper = 0.8 + 0.2 * v;                                     // narrower at the chin
    const az = (u - 0.5) * 2 * azHalf * taper, el = elC + (v - 0.5) * 2 * elHalf;
    const edge = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    const r = MASK_R + (bulge ? 0.05 * Math.sin(v * Math.PI * 5.0 + 0.4) * Math.min(1, edge * 3.5) + 0.07 * edge : 0);
    return new THREE.Vector3(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
  };
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const p = point(i / cols, j / rows); pos.push(p.x, p.y, p.z); }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x8fbaff, roughness: 0.78, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xe4eeff),
    side: THREE.DoubleSide, transparent: true, emissive: 0x2d5bff, emissiveIntensity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);

  // white binding around the edge
  const edge = [];
  for (let i = 0; i <= cols; i += 2) edge.push(point(i / cols, 0, false));
  for (let j = 0; j <= rows; j += 2) edge.push(point(1, j / rows, false));
  for (let i = cols; i >= 0; i -= 2) edge.push(point(i / cols, 1, false));
  for (let j = rows; j >= 0; j -= 2) edge.push(point(0, j / rows, false));
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true, 'centripetal'), 240, 0.026, 8, true),
    new THREE.MeshPhysicalMaterial({ color: 0xf4f7ff, roughness: 0.55, transparent: true }));

  // ear loops running round the back
  const loop = (sign) => {
    const start = point(sign < 0 ? 0 : 1, 0.5, false), pts = [start];
    const a0 = Math.atan2(start.x, start.z);
    for (let k = 1; k <= 14; k++) {
      const az = a0 + sign * (k / 14) * (Math.PI - Math.abs(a0));
      const el = elC + 0.03 * Math.sin((k / 14) * Math.PI);
      pts.push(new THREE.Vector3(MASK_R * Math.cos(el) * Math.sin(az), MASK_R * Math.sin(el), MASK_R * Math.cos(el) * Math.cos(az)));
    }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.017, 6, false),
      new THREE.MeshPhysicalMaterial({ color: 0xdfe9ff, roughness: 0.6, transparent: true }));
  };
  const group = new THREE.Group();
  group.add(mesh, rim, loop(1), loop(-1));
  group.visible = false;
  group.userData.mats = [mat, rim.material, group.children[2].material, group.children[3].material];
  return group;
}

export function createVirion(container, { zoom = false, parallax = false } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'pan-y';
  container.append(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(4, 6, 7);
  const rim = new THREE.DirectionalLight(0xc6d6ff, 1.2); rim.position.set(-6, 2, -5);
  scene.add(key, rim);

  const rand = rng(7);
  const virus = new THREE.Group(); scene.add(virus);

  /* envelope */
  const coreGeo = new THREE.SphereGeometry(R, 96, 64);
  { const p = coreGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.y * 2.7) * Math.sin(v.z * 3.3 + 0.7);
      v.multiplyScalar(R * (1 + 0.016 * n)); p.setXYZ(i, v.x, v.y, v.z);
    }
    coreGeo.computeVertexNormals(); }
  const coreMat = new THREE.MeshPhysicalMaterial({ color: 0xf3f5f8, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.9, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xdbe5ff), emissive: 0x7a96ff, emissiveIntensity: 0 });
  const core = new THREE.Mesh(coreGeo, coreMat); virus.add(core);

  /* small surface proteins */
  const bumpGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const bumps = new THREE.InstancedMesh(bumpGeo, new THREE.MeshPhysicalMaterial({ color: 0xdde2ea, roughness: 0.5, clearcoat: 0.3 }), 460);
  { const d = new THREE.Object3D(), pts = fibonacci(460), up = new THREE.Vector3(0, 1, 0);
    pts.forEach((p, i) => {
      p.x += (rand() - 0.5) * 0.05; p.y += (rand() - 0.5) * 0.05; p.z += (rand() - 0.5) * 0.05; p.normalize();
      d.position.copy(p).multiplyScalar(R * 0.995); d.quaternion.setFromUnitVectors(up, p);
      d.scale.set(1, 0.65 + rand() * 0.4, 1); d.updateMatrix(); bumps.setMatrixAt(i, d.matrix);
    });
    virus.add(bumps); }

  /* spikes: stalk + crowned head */
  const stalkGeo = new THREE.CylinderGeometry(0.046, 0.084, 0.44, 14, 1); stalkGeo.translate(0, 0.22, 0);
  const headPts = [[0, 0], [0.05, 0], [0.085, 0.04], [0.14, 0.1], [0.19, 0.19], [0.2, 0.27], [0.16, 0.33], [0.09, 0.345], [0.045, 0.32], [0, 0.305]].map(([x, y]) => new THREE.Vector2(x, y));
  const headGeo = new THREE.LatheGeometry(headPts, 28);
  const stalkMat = new THREE.MeshPhysicalMaterial({ color: 0xe9ecf1, roughness: 0.45, clearcoat: 0.4, emissive: 0xffffff, emissiveIntensity: 0 });
  const headMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(PALETTE[0]), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.14, emissive: new THREE.Color(PALETTE[0]), emissiveIntensity: 0 });
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, SPIKES);
  const heads = new THREE.InstancedMesh(headGeo, headMat, SPIKES);
  virus.add(stalks, heads);
  const dirs = fibonacci(SPIKES), up = new THREE.Vector3(0, 1, 0);
  const spike = dirs.map((dir) => ({ dir, q: new THREE.Quaternion().setFromUnitVectors(up, dir), len: 0.92 + rand() * 0.18, ph: rand() * Math.PI * 2 }));
  const dummy = new THREE.Object3D();
  function layoutSpikes(t, pulseAmt) {
    for (let i = 0; i < SPIKES; i++) {
      const s = spike[i], b = 1 + pulseAmt * 0.09 * Math.sin(t * 2.3 + s.ph);
      const baseR = R - 0.04, L = s.len * b;
      dummy.quaternion.copy(s.q);
      dummy.position.copy(s.dir).multiplyScalar(baseR); dummy.scale.set(1, L, 1); dummy.updateMatrix(); stalks.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(s.dir).multiplyScalar(baseR + 0.44 * L); dummy.scale.setScalar(0.96 + (L - 0.92) * 0.2); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    }
    stalks.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }

  /* mask */
  const mask = buildMask(); virus.add(mask);

  /* droplets */
  const N = 190;
  const pPos = new Float32Array(N * 3), pT = new Float32Array(N), pS = new Float32Array(N);
  const pd = Array.from({ length: N }, () => ({ dir: new THREE.Vector3(), speed: 0, blocked: false }));
  const spawn = (p, first) => {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    p.dir.set(s * Math.cos(a), u, s * Math.sin(a)); p.speed = 0.1 + rand() * 0.18;
    const az = Math.atan2(p.dir.x, p.dir.z), el = Math.asin(p.dir.y);
    p.blocked = Math.abs(az) < 0.66 && Math.abs(el + 0.16) < 0.36;
    return first ? rand() : 0;
  };
  const pt = pd.map((p) => spawn(p, true));
  for (let i = 0; i < N; i++) { pT[i] = pt[i]; pS[i] = 4 + rand() * 7; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aT', new THREE.BufferAttribute(pT, 1));
  pGeo.setAttribute('aS', new THREE.BufferAttribute(pS, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPx: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(0xff4a2b) } },
    vertexShader: `attribute float aT; attribute float aS; uniform float uPx; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aS * uPx * (17.0 / -mv.z); vA = smoothstep(0.0,0.1,aT) * (1.0 - smoothstep(0.5,1.0,aT)); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5,0.08,d) * vA * 0.8; gl_FragColor = vec4(uColor, a); }`,
  });
  const droplets = new THREE.Points(pGeo, pMat); droplets.frustumCulled = false; virus.add(droplets);

  /* contact shadow */
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -3.55; scene.add(shadow);

  /* ---------- state ---------- */
  let running = false, raf = 0, last = 0, time = 0;
  let rotY = -0.5, rotX = 0.12, velY = 0, velX = 0, dragging = false, idleFor = 3;
  let maskTarget = 0, maskAmt = 0, pulseOn = !reduced, pulseAmt = pulseOn ? 1 : 0;
  let zoomF = 1, zoomTarget = 1, px = 0, py = 0, baseZ = 17;
  const hl = { target: { mask: 0, spikes: 0, core: 0 }, cur: { mask: 0, spikes: 0, core: 0 } };
  const headTarget = new THREE.Color(PALETTE[0]); let palIdx = 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; baseZ = 17 / Math.min(1, camera.aspect * 1.08);
    camera.updateProjectionMatrix(); frame(0);
  }

  function frame(dt) {
    time += dt;
    const ease = (k) => 1 - Math.exp(-dt * k);
    // rotation: drag inertia → idle auto-turn → optional pointer parallax
    if (!dragging) {
      rotY += velY; rotX += velX; velY *= 0.94; velX *= 0.94;
      idleFor += dt;
      if (!reduced && idleFor > 1.6) rotY += dt * 0.28;
      rotX += (clamp(rotX, -0.7, 0.7) - rotX) * 0.2;
    }
    const tx = parallax && !reduced ? py * 0.16 : 0, ty = parallax && !reduced ? px * 0.22 : 0;
    virus.rotation.y = rotY + ty; virus.rotation.x = rotX + tx;
    const bob = reduced ? 0 : Math.sin(time * 0.9) * 0.14;
    virus.position.y = bob; shadow.scale.setScalar(1 - bob * 0.18); shadow.material.opacity = 0.5 - bob * 0.2;

    zoomF += (zoomTarget - zoomF) * ease(8);
    camera.position.set(0, 0.5, baseZ * zoomF); camera.lookAt(0, -0.1, 0);

    pulseAmt += ((pulseOn ? 1 : 0) - pulseAmt) * ease(4);
    layoutSpikes(time, pulseAmt);

    // mask slides in from beyond the spike field
    maskAmt += (maskTarget - maskAmt) * ease(5);
    mask.visible = maskAmt > 0.01;
    mask.scale.setScalar(1 + (1 - maskAmt) * 0.45);
    mask.userData.mats.forEach((m) => { m.opacity = clamp(maskAmt * 1.5, 0, 1); });

    // droplets
    const maskOn = maskAmt > 0.6;
    for (let i = 0; i < N; i++) {
      const p = pd[i];
      let t = pT[i] + dt * p.speed;
      if (t >= 1) t = spawn(p, false);
      let r = 2.12 + t * 3.4;
      if (maskOn && p.blocked && r > MASK_R - 0.04) { r = MASK_R - 0.04; if (t < 0.62) t = 0.62; }
      pT[i] = t; pPos[i * 3] = p.dir.x * r; pPos[i * 3 + 1] = p.dir.y * r; pPos[i * 3 + 2] = p.dir.z * r;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aT.needsUpdate = true;

    // highlight + colour mutation
    for (const k of Object.keys(hl.cur)) hl.cur[k] += (hl.target[k] - hl.cur[k]) * ease(7);
    const beat = 0.65 + 0.35 * Math.sin(time * 4);
    coreMat.emissiveIntensity = 0.28 * hl.cur.core * beat;
    headMat.emissiveIntensity = 0.55 * hl.cur.spikes * beat; stalkMat.emissiveIntensity = 0.12 * hl.cur.spikes * beat;
    mask.userData.mats[0].emissiveIntensity = 0.4 * hl.cur.mask * beat;
    headMat.color.lerp(headTarget, ease(5)); headMat.emissive.copy(headMat.color);

    renderer.render(scene, camera);
  }

  // Adaptive quality: if frames run slow (weak GPU / software rendering), drop resolution, then skip frames.
  let ema = 0.016, slow = 0, level = 0, tick = 0;
  function loop(now) {
    if (!running) return;
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    ema = ema * 0.9 + raw * 0.1;
    if (level < 2 && ema > 0.05 && ++slow > 24) {
      slow = 0; level++;
      if (level === 1) { renderer.setPixelRatio(1); pMat.uniforms.uPx.value = 1; resize(); }
    } else if (ema <= 0.05) slow = 0;
    raf = requestAnimationFrame(loop);
    if (level === 2 && (++tick & 1)) return;
    frame(level === 2 ? Math.min(0.05, dt * 2) : dt);
  }

  /* ---------- input ---------- */
  const pointers = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e);
    if (pointers.size === 1) { dragging = true; velX = velY = 0; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      pointers.set(e.pointerId, e);
      if (pointers.size === 1) {
        const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY;
        velY = dx * 0.0042; velX = dy * 0.0036; rotY += dx * 0.0072; rotX = clamp(rotX + dy * 0.006, -0.7, 0.7); idleFor = 0;
      } else if (pointers.size === 2 && zoom) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        zoomTarget = clamp(zoomTarget * (pinch / d), 0.55, 1.7); pinch = d;
      }
    }
  });
  const release = (e) => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; idleFor = 0; } };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  if (zoom) canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomTarget = clamp(zoomTarget * (1 + e.deltaY * 0.0012), 0.55, 1.7); }, { passive: false });
  const onWinMove = (e) => { px = (e.clientX / innerWidth - 0.5) * 2; py = (e.clientY / innerHeight - 0.5) * 2; };
  if (parallax) addEventListener('pointermove', onWinMove, { passive: true });

  const ro = new ResizeObserver(resize); ro.observe(container);
  resize();

  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    setMask(on) { maskTarget = on ? 1 : 0; if (!running) { for (let i = 0; i < 40; i++) frame(0.03); } },
    setPulse(on) { pulseOn = !!on; },
    mutate() { palIdx = (palIdx + 1) % PALETTE.length; headTarget.set(PALETTE[palIdx]); return PALETTE[palIdx]; },
    get color() { return PALETTE[palIdx]; },
    highlight(part) { for (const k of Object.keys(hl.target)) hl.target[k] = k === part ? 1 : 0; },
    resize,
    dispose() { this.stop(); ro.disconnect(); removeEventListener('pointermove', onWinMove); renderer.dispose(); canvas.remove(); },
  };
}
