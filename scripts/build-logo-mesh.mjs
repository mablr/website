import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { polygonProperties, halfThickness } from '../src/logo-math.js';

const field = JSON.parse(readFileSync(new URL('./logo-field.json', import.meta.url)));
const { resolution: n, span, origin, distance } = field;
const zSpan = 0.6;
const shoulderRadius = 0.035;

// Trace the same zero contour that the solid uses, for its mass and collider.
const segments = [];
for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
  const corners = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  const crossings = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge], b = corners[(edge + 1) % 4];
    const da = distance[a[1] * n + a[0]], db = distance[b[1] * n + b[0]];
    if ((da > 0) === (db > 0)) continue;
    const t = da / (da - db);
    crossings.push({ x: origin[0] + (a[0] + t * (b[0] - a[0])) * span / n, y: origin[1] + (a[1] + t * (b[1] - a[1])) * span / n });
  }
  if (crossings.length === 2) segments.push(crossings);
  else if (crossings.length) throw new Error('Ambiguous silhouette contour');
}
const pointKey = p => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
const neighbors = new Map();
for (const [a,b] of segments) for (const [p,q] of [[a,b],[b,a]]) {
  const key = pointKey(p);
  if (!neighbors.has(key)) neighbors.set(key, []);
  neighbors.get(key).push(q);
}
const outline = [segments[0][0]];
let previous = null;
for (;;) {
  const current = outline.at(-1);
  const next = neighbors.get(pointKey(current)).find(p => pointKey(p) !== previous);
  if (!next) throw new Error('Open silhouette');
  if (pointKey(next) === pointKey(outline[0])) break;
  previous = pointKey(current);
  outline.push(next);
  if (outline.length > segments.length + 1) throw new Error('Contour traversal failed');
}
writeFileSync(new URL('../src/logo-outline.json', import.meta.url), JSON.stringify(outline) + '\n');
const shape = polygonProperties(outline);
const c = Math.cos(shape.angle), s = Math.sin(shape.angle);
const material = new THREE.MeshBasicMaterial();
const surface = new MarchingCubes(n, material, false, false, 300000);
surface.isolation = 0;
for (let z = 0; z < n; z++) {
  const height = (z / n - 0.5) * zSpan;
  for (let i = 0; i < n * n; i++) {
    // A single implicit surface, with a vertical tangent at the silhouette.
    // There are no separate caps, bevel rings, or overlapping patches.
    surface.field[z * n * n + i] = 1 - (height / halfThickness) ** 2 - Math.exp(-distance[i] / shoulderRadius);
  }
}
surface.update();
if (surface.count / 3 >= 300000) throw new Error('Mesh exceeded allocated capacity');
const positions = new Float32Array(surface.count * 3);
const normals = new Float32Array(surface.count * 3);
for (let i = 0; i < surface.count; i++) {
  const offset = i * 3;
  const x = origin[0] + (surface.positionArray[offset] + 1) * span / 2;
  const y = origin[1] + (surface.positionArray[offset + 1] + 1) * span / 2;
  const z = surface.positionArray[offset + 2] * zSpan / 2;
  const dx = x - shape.center.x, dy = y - shape.center.y;
  positions.set([c * dx + s * dy, -s * dx + c * dy, z], offset);
  // Transform the field gradient with the inverse transpose of the scale.
  const nx = surface.normalArray[offset] / span;
  const ny = surface.normalArray[offset + 1] / span;
  const nz = surface.normalArray[offset + 2] / zSpan;
  const normal = new THREE.Vector3(c * nx + s * ny, -s * nx + c * ny, nz).normalize();
  normals.set(normal.toArray(), offset);
}
const raw = new THREE.BufferGeometry();
raw.setAttribute('position', new THREE.BufferAttribute(positions, 3));
raw.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
const mesh = mergeVertices(raw, 1e-6);
// Packed float32 positions/normals, followed by uint32 triangle indices.
const count = mesh.getAttribute('position').count;
const header = new Uint32Array([0x4c4f474f, count, mesh.index.count, 2]);
const data = new Float32Array(count * 6);
data.set(mesh.getAttribute('position').array, 0);
data.set(mesh.getAttribute('normal').array, count * 3);
writeFileSync(new URL('../assets/logo-mesh.bin', import.meta.url), Buffer.concat([
  Buffer.from(header.buffer), Buffer.from(data.buffer), Buffer.from(new Uint32Array(mesh.index.array).buffer),
]));
console.log(`Logo mesh: ${count} vertices, ${mesh.index.count / 3} triangles`);
mesh.dispose(); raw.dispose(); surface.geometry.dispose(); material.dispose();
