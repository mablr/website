import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { packMesh, unpackMesh, decodeMesh } from '../src/logo-mesh-codec.js';

function sampleMesh() {
  const buffer = new ArrayBuffer(16 + 4 * 24 + 6 * 4);
  new Uint32Array(buffer, 0, 4).set([0x4c4f474f, 4, 6, 2]);
  new Float32Array(buffer, 16, 12).set([0.1, -0.2, 0.3, 0.1, -0.2, -0.3, 1, 0, -0, 1, 0, 0]);
  new Float32Array(buffer, 64, 12).set([0.4, 0.5, 0.6, 0.4, 0.5, -0.6, 0, 1, 0, 0, 1, -0]);
  new Uint32Array(buffer, 112, 6).set([0, 2, 1, 1, 2, 3]);
  return buffer;
}

test('packing preserves every float bit, mirrored signs and triangle order', () => {
  const original = sampleMesh();
  assert.deepEqual(unpackMesh(packMesh(original).buffer), original);
});

test('truncated and invalid packed meshes fail instead of rendering corrupt geometry', () => {
  const packed = packMesh(sampleMesh());
  assert.throws(() => unpackMesh(packed.slice(0, -1).buffer), /Truncated/);
  packed[0] = 0;
  assert.throws(() => unpackMesh(packed.buffer), /Invalid/);
});

test('the compressed asset restores the approved uncompressed logo exactly', async () => {
  const data = readFileSync(new URL('../assets/logo-mesh.bin', import.meta.url));
  const decoded = await decodeMesh(data);
  // Baseline before lossless compression; update only for an intentional shape change.
  assert.equal(createHash('sha256').update(Buffer.from(decoded)).digest('hex'), '214562b0fef7034e0cd54ba969a0792949616f5b4cd9f8d520e9373b33bdb923');
  assert.ok(data.length < 1000000, 'Keep the mesh download below 1 MB');
});
