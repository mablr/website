import * as THREE from 'three';
import outline from './logo-outline.json' with { type: 'json' };

import { polygonProperties } from './logo-math.js';

export const shape = polygonProperties(outline);

// The build creates one implicit surface from the original image silhouette.
// Keep its gradient normals: recomputing triangle normals reintroduces facets.
export function createGeometry(buffer) {
  const header = new Uint32Array(buffer, 0, 4);
  if (header[0] !== 0x4c4f474f || header[3] !== 2) throw new Error('Invalid logo mesh');
  const [, vertices, indices] = header;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 16, vertices * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffer, 16 + vertices * 12, vertices * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, 16 + vertices * 24, indices), 1));
  return geometry;
}
