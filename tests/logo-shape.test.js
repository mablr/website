import test from 'node:test';
import { decodeMesh } from '../src/logo-mesh-codec.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGeometry } from '../src/logo-shape.js';
import { halfThickness } from '../src/logo-math.js';

test('rounded front, back and shoulders join into a closed surface without cracks', async () => {
  const data = readFileSync(new URL('../assets/logo-mesh.bin', import.meta.url));
  const geometry = createGeometry(await decodeMesh(data));
  const index = geometry.index.array;
  const positions = geometry.getAttribute('position');
  const edges = new Map();
  for (let i = 0; i < index.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = index[i + j], b = index[i + (j + 1) % 3];
      assert.notEqual(a, b, 'Degenerate triangle');
      const key = [Math.min(a, b), Math.max(a, b)].join(',');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const count of edges.values()) assert.equal(count, 2, 'Open or non-manifold seam');
  for (const value of positions.array) assert.ok(Number.isFinite(value));
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.max.z <= halfThickness + 1e-6);
  assert.ok(geometry.boundingBox.min.z >= -halfThickness - 1e-6);
  assert.ok(geometry.boundingBox.max.z > 0.08, 'Front is curved outward');
  assert.ok(geometry.boundingBox.min.z < -0.08, 'Back is curved outward');
  geometry.dispose();
});

test('the surface has continuous unit normals for physical lighting', async () => {
  const data = readFileSync(new URL('../assets/logo-mesh.bin', import.meta.url));
  const geometry = createGeometry(await decodeMesh(data));
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-6);
  }
  geometry.dispose();
});
