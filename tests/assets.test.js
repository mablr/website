import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const versioned = path => `${path}?v=${createHash('sha256').update(read(path)).digest('hex').slice(0, 16)}`;

test('published asset references match their content to prevent mixed cached releases', () => {
  const html = read('index.html').toString();
  assert.ok(html.includes(`href="${versioned('assets/styles.css')}"`), 'Rebuild after changing CSS');
  assert.ok(html.includes(`src="${versioned('assets/logo-3d.js')}"`), 'Rebuild after changing JavaScript');
  assert.ok(read('assets/logo-3d.js').toString().includes(versioned('assets/logo-mesh.bin')), 'Rebuild after changing the mesh');
});
