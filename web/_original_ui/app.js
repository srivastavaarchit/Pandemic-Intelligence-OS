// Pandemic Intelligence OS - Master Frontend Engine with 3D WebGL & Cartoon Mascot Lab
const API_BASE = '/api';

// Audio FX synthesizer for futuristic UI tactile feedback
class SoundFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  beep(freq = 600, duration = 0.04, type = 'sine') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }
  happyChime() {
    if (!this.enabled) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.08, 'triangle'), i * 70);
    });
  }
}
const sfx = new SoundFX();

// Global App State
const state = {
  overview: null,
  allCountries: [],
  selectedContinent: 'all',
  map: null,
  mapMarkers: [],
  selectedCompareCountries: ['US', 'India', 'Brazil', 'United Kingdom', 'Germany'],
  selectedT0Countries: ['US', 'India', 'Brazil', 'Italy', 'Germany', 'Korea'],
  three: {
    scene: null,
    camera: null,
    renderer: null,
    virusGroup: null,
    spikes: [],
    maskMesh: null,
    maskVisible: true,
    pulsing: true,
    currentColorIndex: 0,
    colors: [0x00f2fe, 0xff3366, 0x10b981, 0xf59e0b, 0xa855f7]
  },
  charts: {
    timeline: null,
    compare: null,
    t0: null,
    socio: null,
    sir: null,
    continentDonut: null
  }
};

// Utilities
function formatNumber(num) {
  if (num === null || num === undefined) return 'N/A';
  return Number(num).toLocaleString('en-US');
}

function formatCompact(num) {
  if (num === null || num === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(num);
}

function animateCounter(elemId, target, suffix = '') {
  const el = document.getElementById(elemId);
  if (!el) return;
  const start = 0;
  const duration = 1200;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(start + (target - start) * ease);
    el.innerText = current.toLocaleString('en-US') + suffix;
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.innerText = target.toLocaleString('en-US') + suffix;
    }
  }
  requestAnimationFrame(update);
}

// Initialization on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventListeners();
  await loadOverview();
  await initMap();
  await loadTimelineChart();
  await loadLeaderboard();
  await loadCompareChart();
  await loadT0Chart();
  await loadSocioeconomicChart();
  runSirSimulation();
  initThreeDCorona();
  setupCartoonMascot();
});

// Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      sfx.beep(700, 0.05);
      const targetView = tab.dataset.target;

      tabs.forEach(t => t.classList.remove('active', 'border-cyan-400', 'text-cyan-400'));
      tab.classList.add('active', 'border-cyan-400', 'text-cyan-400');

      sections.forEach(sec => {
        if (sec.id === targetView) {
          sec.classList.remove('hidden');
          sec.classList.add('animate-fadeIn');
        } else {
          sec.classList.add('hidden');
        }
      });

      if (targetView === 'section-map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 200);
      }
      if (targetView === 'section-3d' && state.three.renderer) {
        setTimeout(() => resizeThree(), 100);
      }
    });
  });
}

function setupEventListeners() {
  const soundBtn = document.getElementById('btn-sound-toggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      sfx.enabled = !sfx.enabled;
      soundBtn.innerHTML = sfx.enabled 
        ? '<i class="fa-solid fa-volume-high text-cyan-400"></i>' 
        : '<i class="fa-solid fa-volume-xmark text-slate-500"></i>';
    });
  }

  const searchInput = document.getElementById('global-country-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = searchInput.value.trim();
        if (val) openCountryModal(val);
      }
    });
  }

  const timelineMode = document.getElementById('timeline-mode-toggle');
  if (timelineMode) {
    timelineMode.addEventListener('change', () => {
      sfx.beep(550, 0.04);
      loadTimelineChart();
    });
  }

  const timelineScale = document.getElementById('timeline-scale-toggle');
  if (timelineScale) {
    timelineScale.addEventListener('change', () => {
      sfx.beep(550, 0.04);
      loadTimelineChart();
    });
  }

  const xSelect = document.getElementById('socio-x-indicator');
  const ySelect = document.getElementById('socio-y-indicator');
  if (xSelect && ySelect) {
    xSelect.addEventListener('change', () => { sfx.beep(500, 0.04); loadSocioeconomicChart(); });
    ySelect.addEventListener('change', () => { sfx.beep(500, 0.04); loadSocioeconomicChart(); });
  }

  const sirInputs = ['sir-r0', 'sir-infectious-days', 'sir-lockdown-day', 'sir-reduction'];
  sirInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        document.getElementById(`${id}-val`).innerText = el.value;
        runSirSimulation();
      });
    }
  });

  const filterPills = document.querySelectorAll('.continent-filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      sfx.beep(650, 0.04);
      filterPills.forEach(p => p.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40'));
      pill.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
      state.selectedContinent = pill.dataset.continent;
      loadLeaderboard();
    });
  });

  const tableSearch = document.getElementById('table-search-input');
  if (tableSearch) {
    tableSearch.addEventListener('input', (e) => {
      filterTableRows(e.target.value.toLowerCase());
    });
  }
}

// -------------------------------------------------------------
// 🌟 3D INTERACTIVE THREE.JS CORONAVIRUS WITH SURGICAL MASK
// -------------------------------------------------------------
function initThreeDCorona() {
  const container = document.getElementById('three-canvas-container');
  if (!container || typeof THREE === 'undefined') return;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 480;

  // Scene & Camera
  const scene = new THREE.Scene();
  state.three.scene = scene;

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.z = 7.5;
  state.three.camera = camera;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  state.three.renderer = renderer;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x00f2fe, 2, 50);
  pointLight1.position.set(5, 5, 5);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff3366, 1.8, 50);
  pointLight2.position.set(-5, -5, -3);
  scene.add(pointLight2);

  // Virus Master Group
  const virusGroup = new THREE.Group();
  scene.add(virusGroup);
  state.three.virusGroup = virusGroup;

  // 1. Core Sphere
  const coreGeo = new THREE.IcosahedronGeometry(2.0, 4);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0f2744,
    roughness: 0.35,
    metalness: 0.2,
    wireframe: false,
    emissive: 0x06152a
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  virusGroup.add(coreMesh);
  state.three.coreMesh = coreMesh;

  // Core Wireframe Glow
  const wireGeo = new THREE.IcosahedronGeometry(2.02, 3);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe,
    wireframe: true,
    transparent: true,
    opacity: 0.35
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  virusGroup.add(wireMesh);

  // 2. 3D Spike Glycoproteins (S-Proteins)
  const spikeCount = 68;
  const spikes = [];
  const spikeStemGeo = new THREE.CylinderGeometry(0.045, 0.08, 0.75, 8);
  const spikeHeadGeo = new THREE.SphereGeometry(0.16, 12, 12);

  const phi = Math.PI * (3 - Math.sqrt(5)); // Golden spiral distribution
  for (let i = 0; i < spikeCount; i++) {
    const y = 1 - (i / (spikeCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i;

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const dir = new THREE.Vector3(x, y, z).normalize();

    const spikeGroup = new THREE.Group();

    // Stem
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x00f2fe,
      roughness: 0.4,
      metalness: 0.3
    });
    const stem = new THREE.Mesh(spikeStemGeo, stemMat);
    stem.position.y = 0.375;
    spikeGroup.add(stem);

    // Crown head
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xff3366,
      emissive: 0x440818,
      roughness: 0.2
    });
    const head = new THREE.Mesh(spikeHeadGeo, headMat);
    head.position.y = 0.75;
    spikeGroup.add(head);

    // Align spike to point outward
    spikeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spikeGroup.position.copy(dir.clone().multiplyScalar(1.95));

    virusGroup.add(spikeGroup);
    spikes.push({
      group: spikeGroup,
      baseDist: 1.95,
      dir: dir,
      phase: Math.random() * Math.PI * 2
    });
  }
  state.three.spikes = spikes;

  // 3. 3D Protective Surgical Face Mask
  const maskGroup = new THREE.Group();

  // Mask fabric curve
  const maskGeo = new THREE.CylinderGeometry(2.18, 2.18, 1.25, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3);
  const maskMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  const maskMesh = new THREE.Mesh(maskGeo, maskMat);
  maskMesh.rotation.y = Math.PI / 2;
  maskGroup.add(maskMesh);

  // Top white binding rim
  const rimGeo = new THREE.TorusGeometry(2.18, 0.035, 8, 32, (2 * Math.PI) / 3);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const topRim = new THREE.Mesh(rimGeo, rimMat);
  topRim.rotation.x = Math.PI / 2;
  topRim.rotation.z = Math.PI / 6;
  topRim.position.y = 0.62;
  maskGroup.add(topRim);

  const bottomRim = topRim.clone();
  bottomRim.position.y = -0.62;
  maskGroup.add(bottomRim);

  // Mask Straps (Ear loops)
  const strapGeo = new THREE.TorusGeometry(1.6, 0.025, 8, 32);
  const strapMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strapLeft = new THREE.Mesh(strapGeo, strapMat);
  strapLeft.position.set(-1.4, 0, -0.4);
  strapLeft.rotation.y = Math.PI / 4;
  maskGroup.add(strapLeft);

  const strapRight = strapLeft.clone();
  strapRight.position.x = 1.4;
  strapRight.rotation.y = -Math.PI / 4;
  maskGroup.add(strapRight);

  virusGroup.add(maskGroup);
  state.three.maskMesh = maskGroup;

  // 4. Orbiting Particle Dust Cloud
  const particleGeo = new THREE.BufferGeometry();
  const particleCount = 200;
  const posArray = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 14;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.04,
    color: 0x00f2fe,
    transparent: true,
    opacity: 0.6
  });
  const particleSystem = new THREE.Points(particleGeo, particleMat);
  scene.add(particleSystem);
  state.three.particleSystem = particleSystem;

  // Mouse Interactivity
  let isDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let targetRotation = { x: 0.2, y: 0.4 };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevMousePos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMousePos.x;
    const deltaY = e.clientY - prevMousePos.y;
    targetRotation.y += deltaX * 0.008;
    targetRotation.x += deltaY * 0.008;
    prevMousePos = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.z = Math.max(4.5, Math.min(12, camera.position.z + e.deltaY * 0.005));
  }, { passive: false });

  // Animation Loop
  let clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // Smooth inertia rotation
    virusGroup.rotation.y += (targetRotation.y - virusGroup.rotation.y) * 0.08 + 0.003;
    virusGroup.rotation.x += (targetRotation.x - virusGroup.rotation.x) * 0.08;

    // Orbit particles
    particleSystem.rotation.y = time * 0.04;

    // Pulse Spikes
    if (state.three.pulsing) {
      spikes.forEach((s) => {
        const offset = Math.sin(time * 3 + s.phase) * 0.08;
        s.group.position.copy(s.dir.clone().multiplyScalar(s.baseDist + offset));
      });
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', resizeThree);
}

function resizeThree() {
  const container = document.getElementById('three-canvas-container');
  if (!container || !state.three.renderer || !state.three.camera) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  state.three.camera.aspect = width / height;
  state.three.camera.updateProjectionMatrix();
  state.three.renderer.setSize(width, height);
}

// 3D Controls
function toggleThreeMask() {
  sfx.beep(850, 0.05);
  state.three.maskVisible = !state.three.maskVisible;
  if (state.three.maskMesh) {
    state.three.maskMesh.visible = state.three.maskVisible;
  }
  const btn = document.getElementById('btn-toggle-mask-3d');
  if (btn) {
    btn.innerHTML = state.three.maskVisible 
      ? '<i class="fa-solid fa-head-side-mask"></i> 3D Mask: ON'
      : '<i class="fa-solid fa-face-smile"></i> 3D Mask: OFF';
  }
}

function toggleThreePulse() {
  sfx.beep(720, 0.04);
  state.three.pulsing = !state.three.pulsing;
  const btn = document.getElementById('btn-toggle-pulse-3d');
  if (btn) {
    btn.innerHTML = state.three.pulsing 
      ? '<i class="fa-solid fa-heart-pulse text-rose-400"></i> Pulse: ACTIVE'
      : '<i class="fa-solid fa-pause text-slate-400"></i> Pulse: PAUSED';
  }
}

function mutateThreeColor() {
  sfx.beep(950, 0.05);
  state.three.currentColorIndex = (state.three.currentColorIndex + 1) % state.three.colors.length;
  const nextColor = state.three.colors[state.three.currentColorIndex];
  if (state.three.spikes) {
    state.three.spikes.forEach(s => {
      s.group.children[1].material.color.setHex(nextColor);
    });
  }
}

// -------------------------------------------------------------
// 🎭 CARTOON MASCOT COMPANION ("DR. SPIKY") & BIO-SAFETY LAB
// -------------------------------------------------------------
const mascotTips = [
  "Wear your mask snugly over nose & mouth! 😷",
  "Wash hands with soap for at least 20 seconds! 🧼",
  "Physical distancing keeps the reproduction number R₀ < 1.0! 📉",
  "Good ventilation disperses respiratory aerosols! 💨",
  "Sanitize high-touch surfaces regularly! ✨",
  "Vaccines train your antibodies to neutralize viral spikes! 🛡️"
];

function setupCartoonMascot() {
  const mascotElem = document.getElementById('floating-mascot');
  if (!mascotElem) return;

  mascotElem.addEventListener('click', () => {
    sfx.happyChime();
    mascotElem.classList.remove('mascot-wobble');
    void mascotElem.offsetWidth; // trigger reflow
    mascotElem.classList.add('mascot-wobble');

    // Confetti
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.85, x: 0.9 }
      });
    }

    // Change speech bubble text
    const bubble = document.getElementById('mascot-speech-text');
    if (bubble) {
      const nextTip = mascotTips[Math.floor(Math.random() * mascotTips.length)];
      bubble.innerText = nextTip;
    }
  });
}

function triggerMascotCheer() {
  sfx.happyChime();
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 90,
      origin: { y: 0.6 }
    });
  }
}

// -------------------------------------------------------------
// 1. OVERVIEW & KPIS
// -------------------------------------------------------------
async function loadOverview() {
  try {
    const res = await fetch(`${API_BASE}/overview`);
    const data = await res.json();
    state.overview = data;

    animateCounter('kpi-total-confirmed', data.total_confirmed);
    animateCounter('kpi-total-deaths', data.total_dead);
    animateCounter('kpi-mortality-rate', data.mortality_rate, '%');
    
    document.getElementById('kpi-peak-date').innerText = data.peak_day.date;
    document.getElementById('kpi-peak-cases').innerText = `+${formatNumber(data.peak_day.cases)} new`;

    document.getElementById('archive-status-badge').innerText = 
      `ARCHIVE: ${data.total_days} DAYS · ${data.total_countries} COUNTRIES · ${data.start_date} TO ${data.end_date}`;

    renderContinentDonut(data.continents);
    renderTopEpicenters(data.top_confirmed);
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

function renderContinentDonut(continents) {
  const ctx = document.getElementById('continentDonutChart');
  if (!ctx) return;

  const labels = continents.map(c => c.Continent);
  const data = continents.map(c => c.Confirmed);
  const colors = [
    'rgba(0, 242, 254, 0.85)',
    'rgba(59, 130, 246, 0.85)',
    'rgba(168, 85, 247, 0.85)',
    'rgba(245, 158, 11, 0.85)',
    'rgba(255, 51, 102, 0.85)',
    'rgba(16, 185, 129, 0.85)',
    'rgba(148, 163, 184, 0.85)'
  ];

  if (state.charts.continentDonut) state.charts.continentDonut.destroy();

  state.charts.continentDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: '#060913',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatNumber(ctx.raw)} (${((ctx.raw / state.overview.total_confirmed) * 100).toFixed(1)}%)`
          }
        }
      },
      cutout: '68%'
    }
  });
}

function renderTopEpicenters(topCountries) {
  const container = document.getElementById('top-epicenters-list');
  if (!container) return;

  const maxConfirmed = topCountries[0].Confirmed;
  container.innerHTML = topCountries.slice(0, 5).map((c, i) => {
    const pct = ((c.Confirmed / maxConfirmed) * 100).toFixed(0);
    return `
      <div class="cursor-pointer p-2.5 rounded-lg hover:bg-white/5 transition flex items-center justify-between" onclick="openCountryModal('${c.Country}')">
        <div class="flex items-center gap-3 w-1/3">
          <span class="font-mono text-xs text-slate-500 w-4">#${i + 1}</span>
          <span class="font-semibold text-slate-200 text-sm truncate">${c.Country}</span>
        </div>
        <div class="flex-1 mx-3">
          <div class="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="text-right w-24">
          <div class="font-mono text-xs font-semibold text-slate-200">${formatCompact(c.Confirmed)}</div>
          <div class="text-[10px] text-rose-400">${c.Mortality}% CFR</div>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 2. GEOSPATIAL MAP (LEAFLET)
// -------------------------------------------------------------
async function initMap() {
  const mapElem = document.getElementById('world-map');
  if (!mapElem) return;

  state.map = L.map('world-map', {
    center: [25, 10],
    zoom: 2.2,
    minZoom: 1.8,
    maxZoom: 7,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(state.map);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  try {
    const res = await fetch(`${API_BASE}/map`);
    const points = await res.json();

    points.forEach(p => {
      const radius = Math.max(4, Math.min(35, Math.sqrt(p.confirmed) / 1000));
      
      let color = '#00f2fe';
      if (p.mortality > 3.0) color = '#ff3366';
      else if (p.mortality > 1.5) color = '#f59e0b';

      const circle = L.circleMarker([p.lat, p.lng], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.55
      }).addTo(state.map);

      const popupContent = `
        <div class="p-2 space-y-2 font-sans min-w-[200px]">
          <div class="flex justify-between items-center border-b border-slate-700/60 pb-1.5">
            <span class="font-bold text-base text-cyan-300 font-syne">${p.country}</span>
            <span class="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">${p.continent}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-slate-400">Total Cases:</span>
              <p class="font-mono font-bold text-slate-100">${formatNumber(p.confirmed)}</p>
            </div>
            <div>
              <span class="text-slate-400">Fatalities:</span>
              <p class="font-mono font-bold text-rose-400">${formatNumber(p.dead)}</p>
            </div>
            <div>
              <span class="text-slate-400">Fatality Rate:</span>
              <p class="font-mono font-bold text-amber-400">${p.mortality}%</p>
            </div>
            <div>
              <span class="text-slate-400">Per Million:</span>
              <p class="font-mono font-bold text-emerald-400">${p.cases_per_mln ? formatNumber(Math.round(p.cases_per_mln)) : 'N/A'}</p>
            </div>
          </div>
          <button onclick="openCountryModal('${p.country}')" class="w-full mt-2 text-center py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded transition font-mono">
            Open Dossier & Timeline →
          </button>
        </div>
      `;

      circle.bindPopup(popupContent);
      state.mapMarkers.push(circle);
    });
  } catch (err) {
    console.error('Failed to load map data:', err);
  }
}

// -------------------------------------------------------------
// 3. GLOBAL TIMELINE CHART
// -------------------------------------------------------------
async function loadTimelineChart() {
  const ctx = document.getElementById('globalTimelineChart');
  if (!ctx) return;

  const isDaily = document.getElementById('timeline-mode-toggle').value === 'daily';
  const isLog = document.getElementById('timeline-scale-toggle').value === 'log';

  try {
    const res = await fetch(`${API_BASE}/timeline?sample_rate=2`);
    const data = await res.json();

    if (state.charts.timeline) state.charts.timeline.destroy();

    const datasets = isDaily ? [
      {
        label: 'Daily Reported New Cases',
        data: data.daily_confirmed,
        backgroundColor: 'rgba(0, 242, 254, 0.25)',
        borderColor: 'rgba(0, 242, 254, 0.4)',
        borderWidth: 1,
        type: 'bar',
        order: 2
      },
      {
        label: '7-Day Smoothed Trend',
        data: data.daily_confirmed_7d,
        borderColor: '#ff3366',
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 0,
        type: 'line',
        order: 1
      }
    ] : [
      {
        label: 'Cumulative Confirmed Cases',
        data: data.confirmed,
        borderColor: '#00f2fe',
        backgroundColor: 'rgba(0, 242, 254, 0.08)',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2.5
      },
      {
        label: 'Cumulative Fatalities',
        data: data.deaths,
        borderColor: '#ff3366',
        backgroundColor: 'rgba(255, 51, 102, 0.08)',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2.5
      }
    ];

    state.charts.timeline = new Chart(ctx, {
      data: {
        labels: data.dates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', maxTicksLimit: 12 }
          },
          y: {
            type: isLog ? 'logarithmic' : 'linear',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { 
              color: '#64748b',
              callback: (val) => formatCompact(val)
            }
          }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatNumber(ctx.raw)}`
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load timeline chart:', err);
  }
}

// -------------------------------------------------------------
// 4. MULTI-COUNTRY COMPARISON BENCH
// -------------------------------------------------------------
async function loadCompareChart() {
  const ctx = document.getElementById('compareCountriesChart');
  if (!ctx) return;

  const names = state.selectedCompareCountries.join(',');
  try {
    const res = await fetch(`${API_BASE}/compare?names=${encodeURIComponent(names)}`);
    const data = await res.json();

    const colors = ['#00f2fe', '#3b82f6', '#ff3366', '#f59e0b', '#10b981', '#a855f7'];
    const datasets = [];

    let cIdx = 0;
    for (const [country, series] of Object.entries(data.series)) {
      datasets.push({
        label: country,
        data: series.daily_7d,
        borderColor: colors[cIdx % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0
      });
      cIdx++;
    }

    if (state.charts.compare) state.charts.compare.destroy();

    state.charts.compare = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.dates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', maxTicksLimit: 10 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v) => formatCompact(v) } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });

    renderCountryChips('compare-chips-container', state.selectedCompareCountries, (removed) => {
      state.selectedCompareCountries = state.selectedCompareCountries.filter(c => c !== removed);
      loadCompareChart();
    });
  } catch (err) {
    console.error('Failed to load comparison chart:', err);
  }
}

function renderCountryChips(containerId, list, onRemove) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = list.map(c => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-200">
      ${c}
      <button onclick="window.__removeChip('${containerId}', '${c}')" class="text-slate-400 hover:text-rose-400 ml-1">×</button>
    </span>
  `).join('');

  window.__removeChip = (cId, cName) => {
    onRemove(cName);
  };
}

function addCompareCountry() {
  const select = document.getElementById('compare-country-select');
  if (!select) return;
  const val = select.value;
  if (val && !state.selectedCompareCountries.includes(val)) {
    sfx.beep(750, 0.04);
    state.selectedCompareCountries.push(val);
    loadCompareChart();
  }
}

// -------------------------------------------------------------
// 5. T0 ALIGNED CURVE FLATTENING DYNAMICS
// -------------------------------------------------------------
async function loadT0Chart() {
  const ctx = document.getElementById('t0Chart');
  if (!ctx) return;

  const names = state.selectedT0Countries.join(',');
  try {
    const res = await fetch(`${API_BASE}/t0?names=${encodeURIComponent(names)}`);
    const data = await res.json();

    const colors = ['#00f2fe', '#3b82f6', '#ff3366', '#f59e0b', '#10b981', '#a855f7'];
    const datasets = [];

    let cIdx = 0;
    for (const [country, vals] of Object.entries(data.series)) {
      datasets.push({
        label: country,
        data: vals,
        borderColor: colors[cIdx % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 0
      });
      cIdx++;
    }

    if (state.charts.t0) state.charts.t0.destroy();

    state.charts.t0 = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.days.map(d => `Day ${d}`),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            title: { display: true, text: 'Days Since 100th Case (T0)', color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' }, 
            ticks: { color: '#64748b', maxTicksLimit: 12 } 
          },
          y: { 
            type: 'logarithmic',
            title: { display: true, text: 'Confirmed Cases (Log Scale)', color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' }, 
            ticks: { color: '#64748b', callback: (v) => formatCompact(v) } 
          }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load T0 chart:', err);
  }
}

// -------------------------------------------------------------
// 6. WORLD BANK SOCIOECONOMIC CORRELATION SCATTER
// -------------------------------------------------------------
async function loadSocioeconomicChart() {
  const ctx = document.getElementById('socioeconomicScatterChart');
  if (!ctx) return;

  const xInd = document.getElementById('socio-x-indicator').value;
  const yInd = document.getElementById('socio-y-indicator').value;

  try {
    const res = await fetch(`${API_BASE}/socioeconomic?x_indicator=${encodeURIComponent(xInd)}&y_indicator=${encodeURIComponent(yInd)}`);
    const data = await res.json();

    document.getElementById('socio-r-val').innerText = `r = ${data.correlation_r}`;
    document.getElementById('socio-r2-val').innerText = `R² = ${data.r_squared}`;
    document.getElementById('socio-p-val').innerText = `p = ${data.p_value}`;

    const continentColors = {
      'Asia': '#00f2fe',
      'Europe': '#3b82f6',
      'North America': '#a855f7',
      'South America': '#ff3366',
      'Africa': '#f59e0b',
      'Oceania': '#10b981'
    };

    const scatterPoints = data.points.map(p => ({
      x: p.x,
      y: p.y,
      country: p.country,
      continent: p.continent
    }));

    const minX = Math.min(...data.points.map(p => p.x));
    const maxX = Math.max(...data.points.map(p => p.x));
    const trendline = [
      { x: minX, y: data.slope * minX + data.intercept },
      { x: maxX, y: data.slope * maxX + data.intercept }
    ];

    if (state.charts.socio) state.charts.socio.destroy();

    state.charts.socio = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Countries',
            data: scatterPoints,
            backgroundColor: (ctx) => {
              const pt = ctx.raw;
              return pt ? (continentColors[pt.continent] || '#94a3b8') : '#00f2fe';
            },
            pointRadius: 6,
            pointHoverRadius: 9
          },
          {
            label: `Trendline (y = ${data.slope}x + ${data.intercept})`,
            data: trendline,
            type: 'line',
            borderColor: 'rgba(255, 51, 102, 0.75)',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            title: { display: true, text: data.x_label, color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b' }
          },
          y: { 
            title: { display: true, text: data.y_label, color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b' }
          }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pt = ctx.raw;
                if (!pt.country) return ctx.dataset.label;
                return ` ${pt.country} (${pt.continent}): X=${formatNumber(pt.x)}, Y=${formatNumber(pt.y)}`;
              }
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load socioeconomic chart:', err);
  }
}

// -------------------------------------------------------------
// 7. SIR EPIDEMIOLOGICAL SIMULATOR
// -------------------------------------------------------------
async function runSirSimulation() {
  const ctx = document.getElementById('sirSimulationChart');
  if (!ctx) return;

  const r0 = document.getElementById('sir-r0').value;
  const infectiousDays = document.getElementById('sir-infectious-days').value;
  const lockdownDay = document.getElementById('sir-lockdown-day').value;
  const reduction = document.getElementById('sir-reduction').value;

  try {
    const url = `${API_BASE}/simulate-sir?r0=${r0}&infectious_days=${infectiousDays}&lockdown_day=${lockdownDay}&lockdown_reduction=${reduction}&population=1000000`;
    const res = await fetch(url);
    const data = await res.json();

    document.getElementById('sir-peak-day').innerText = `Day ${data.summary.peak_day}`;
    document.getElementById('sir-peak-load').innerText = `${data.summary.peak_infected_pct}% (${formatCompact(data.summary.peak_infected)})`;
    document.getElementById('sir-attack-rate').innerText = `${data.summary.total_attack_rate_pct}%`;
    document.getElementById('sir-effective-r0').innerText = data.parameters.effective_r0_after_lockdown;

    if (state.charts.sir) state.charts.sir.destroy();

    state.charts.sir = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.trajectory.days.map(d => `Day ${d}`),
        datasets: [
          {
            label: 'Susceptible (S)',
            data: data.trajectory.susceptible,
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 0
          },
          {
            label: 'Infected Active (I)',
            data: data.trajectory.infected,
            borderColor: '#ff3366',
            backgroundColor: 'rgba(255, 51, 102, 0.15)',
            fill: true,
            borderWidth: 2.5,
            tension: 0.2,
            pointRadius: 0
          },
          {
            label: 'Recovered / Immune (R)',
            data: data.trajectory.recovered,
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', maxTicksLimit: 12 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v) => formatCompact(v) } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatNumber(ctx.raw)}`
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to run SIR simulation:', err);
  }
}

// -------------------------------------------------------------
// 8. LEADERBOARD TABLE
// -------------------------------------------------------------
async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  if (!tbody) return;

  const url = `${API_BASE}/countries?continent=${encodeURIComponent(state.selectedContinent)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    state.allCountries = data;

    populateCompareDropdown(data);
    renderTableRows(data);
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
}

function renderTableRows(countries) {
  const tbody = document.getElementById('leaderboard-tbody');
  if (!tbody) return;

  tbody.innerHTML = countries.map((c, i) => `
    <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition cursor-pointer text-xs" onclick="openCountryModal('${c.Country}')">
      <td class="py-3 px-4 font-mono text-slate-500">#${i + 1}</td>
      <td class="py-3 px-4 font-semibold text-slate-200">
        <div class="flex items-center gap-2">
          <span class="font-syne font-bold">${c.Country}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">${c.Continent}</span>
        </div>
      </td>
      <td class="py-3 px-4 text-right font-mono text-slate-200 font-bold">${formatNumber(c.Confirmed)}</td>
      <td class="py-3 px-4 text-right font-mono text-rose-400 font-bold">${formatNumber(c.Dead)}</td>
      <td class="py-3 px-4 text-right font-mono text-amber-300">${c.Mortality}%</td>
      <td class="py-3 px-4 text-right font-mono text-cyan-300">${c['Cases per mln'] ? formatNumber(Math.round(c['Cases per mln'])) : '—'}</td>
      <td class="py-3 px-4 text-right font-mono text-slate-400">${c['GDP per capita'] ? '$' + formatNumber(Math.round(c['GDP per capita'])) : '—'}</td>
      <td class="py-3 px-4 text-center">
        <button class="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition font-mono">Dossier →</button>
      </td>
    </tr>
  `).join('');
}

function filterTableRows(query) {
  const filtered = state.allCountries.filter(c => 
    c.Country.toLowerCase().includes(query) || 
    c.Continent.toLowerCase().includes(query)
  );
  renderTableRows(filtered);
}

function populateCompareDropdown(countries) {
  const select = document.getElementById('compare-country-select');
  if (!select || select.children.length > 1) return;

  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.Country;
    opt.innerText = `${c.Country} (${c.Continent})`;
    select.appendChild(opt);
  });
}

// -------------------------------------------------------------
// 9. COUNTRY DOSSIER MODAL
// -------------------------------------------------------------
async function openCountryModal(countryName) {
  sfx.beep(800, 0.05);
  const modal = document.getElementById('country-modal');
  if (!modal) return;

  try {
    const res = await fetch(`${API_BASE}/country/${encodeURIComponent(countryName)}`);
    if (!res.ok) {
      alert(`Country '${countryName}' not found.`);
      return;
    }
    const data = await res.json();
    const s = data.stats;

    document.getElementById('modal-country-name').innerText = s.country;
    document.getElementById('modal-country-sub').innerText = `${s.continent} · ISO: ${s.country_code || 'N/A'}`;
    
    document.getElementById('modal-confirmed').innerText = formatNumber(s.confirmed);
    document.getElementById('modal-confirmed-rank').innerText = `Global Rank #${s.rank_confirmed}`;
    
    document.getElementById('modal-deaths').innerText = formatNumber(s.dead);
    document.getElementById('modal-deaths-rank').innerText = `Global Rank #${s.rank_dead}`;

    document.getElementById('modal-cfr').innerText = `${s.mortality}%`;
    document.getElementById('modal-cfr-rank').innerText = `Mortality Rank #${s.rank_mortality}`;

    document.getElementById('modal-cases-per-mln').innerText = s.cases_per_mln ? formatNumber(Math.round(s.cases_per_mln)) : 'N/A';
    document.getElementById('modal-gdp').innerText = s.gdp_per_capita ? `$${formatNumber(Math.round(s.gdp_per_capita))}` : 'N/A';
    document.getElementById('modal-health-gdp').innerText = s.health_gdp_pct ? `${s.health_gdp_pct}%` : 'N/A';
    document.getElementById('modal-life-exp').innerText = s.life_expectancy ? `${s.life_expectancy.toFixed(1)} yrs` : 'N/A';
    document.getElementById('modal-rural-pct').innerText = s.rural_pct ? `${s.rural_pct.toFixed(1)}%` : 'N/A';

    renderCountryModalChart(data.timeline);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } catch (err) {
    console.error('Failed to load country modal:', err);
  }
}

function closeCountryModal() {
  sfx.beep(400, 0.04);
  const modal = document.getElementById('country-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

let countryChartInstance = null;
function renderCountryModalChart(timeline) {
  const ctx = document.getElementById('modalCountryTimelineChart');
  if (!ctx) return;

  if (countryChartInstance) countryChartInstance.destroy();

  countryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeline.dates,
      datasets: [
        {
          label: 'Cumulative Confirmed',
          data: timeline.confirmed,
          borderColor: '#00f2fe',
          backgroundColor: 'rgba(0, 242, 254, 0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: '7-Day Smoothed Daily Wave',
          data: timeline.daily_confirmed_7d,
          borderColor: '#ff3366',
          backgroundColor: 'transparent',
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', maxTicksLimit: 8 } },
        y: { 
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          ticks: { color: '#64748b', callback: (v) => formatCompact(v) } 
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#ff3366', callback: (v) => formatCompact(v) }
        }
      },
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      }
    }
  });
}
