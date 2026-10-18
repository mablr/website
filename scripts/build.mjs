import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const versioned = path => `${path}?v=${createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex').slice(0, 16)}`;

await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/logo-3d.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'assets/logo-3d.js',
  legalComments: 'linked',
  define: { LOGO_MESH_URL: JSON.stringify(versioned('assets/logo-mesh.bin')) },
});

// HTML, CSS and JavaScript may be cached separately by browsers and the CDN.
// Change each URL whenever its content changes so releases stay in sync.
const index = new URL('index.html', root);
let html = readFileSync(index, 'utf8');
for (const path of ['assets/styles.css', 'assets/logo-3d.js']) {
  const pattern = new RegExp(`((?:href|src)=")${path.replaceAll('.', '\\.')}[^" ]*(")`, 'g');
  html = html.replace(pattern, `$1${versioned(path)}$2`);
}
writeFileSync(index, html);
