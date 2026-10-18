# Mablr website

Static site. Serve this directory with `python3 -m http.server 8765`.

## 3D logo

Drag with a mouse, pen, or touch. The logo starts still, has no gravity or air
resistance, and retains momentum on release. Off-center grabs create torque;
the viewport edges are slightly inelastic walls. Use **Reset logo**, **Escape**,
or double-click to return it to rest. Arrow keys push a focused logo; Enter or
Space resets it.

The body moves in the page plane and rotates around all three axes. Its geometry
is one continuous implicit surface derived from the original image's silhouette,
with gradient normals and no separate cap or bevel. A convex collision envelope
approximates the rounded surface; the only obstacles are flat walls. Mass and
principal inertia axes use the silhouette. Extreme pointer jumps are limited for
stability. The simulation sleeps at rest and pauses in a hidden document.

One opaque, clear-coated yellow `MeshPhysicalMaterial` is lit by two fixed studio
softboxes and a soft ambient fill. Reflections and shading come from the curved
surface normals. There are no photographed highlights, custom fragment shaders,
pose-dependent material changes, or transparency blends. The original image is
the silhouette reference and loading fallback, not a lighting texture.

### Source and builds

- `src/logo-physics.js`: Cannon simulation and input joints.
- `src/logo-shape.js`: mesh loading and silhouette mass properties.
- `src/logo-math.js`: shared geometry math and thickness.
- `src/logo-material.js`: standard material and fixed studio lighting.
- `src/logo-3d.js`: rendering, placement, pointer and keyboard input.

After editing JavaScript, CSS, or generated assets:

```sh
npm ci
npm run build
npm test
```

To regenerate the shape after changing the original image or surface profile:

```sh
# Python with Pillow and NumPy is needed only for source-image extraction.
python3 scripts/extract-logo-field.py
npm run build:mesh
npm run build
npm test
```

The build fingerprints CSS, JavaScript and mesh URLs to prevent stale cached assets
from being mixed with a new page. Commit the updated `index.html` with each build.

The extractor produces `scripts/logo-field.json`.
The mesh generator produces the silhouette and `assets/logo-mesh.bin`. Commit
these generated assets, the JavaScript bundle and its license notice alongside
the source. GitHub Pages serves them directly, without a runtime CDN or build
service. The original image remains available if JavaScript, WebGL, or asset
loading fails. Third-party licenses are in `THIRD_PARTY_LICENSES.txt`.
