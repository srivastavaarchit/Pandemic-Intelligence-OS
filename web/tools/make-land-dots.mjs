// Regenerates static/js/three/land-dots.json (the dotted continents on the 3D globe).
// Only needed if you want a different dot density. Run from a folder where you have installed:
//   npm i world-atlas@2 topojson-client d3-geo
// then:  node make-land-dots.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
const topo = JSON.parse(readFileSync('node_modules/world-atlas/land-110m.json','utf8'));
const land = feature(topo, topo.objects.land);
const step = 1.3;               // degrees between dot rows
const rows = [];
let total = 0;
for (let lat = -88; lat <= 88; lat += step) {
  const circ = Math.max(Math.cos(lat*Math.PI/180), 0.05);
  const lonStep = step / circ;
  const n = Math.max(1, Math.round(360 / lonStep));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const lon = -180 + (i + (rows.length % 2 ? 0.5 : 0)) * (360 / n);
    if (geoContains(land, [lon, lat])) pts.push(Math.round(lon * 10));
  }
  if (pts.length) { rows.push([Math.round(lat * 10), ...pts]); total += pts.length; }
}
writeFileSync(new URL('../static/js/three/land-dots.json', import.meta.url).pathname, JSON.stringify(rows));
console.log('rows', rows.length, 'dots', total);
