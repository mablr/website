"""Extract the original silhouette; run with Python + Pillow + NumPy.

This is asset preparation, not image retouching. The original logo stays intact.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
image = Image.open(ROOT / 'assets/logo.webp').convert('RGBA')
w, h = image.size
resolution = 192
span = 1.15
origin = [-0.075, -h / w / 2 - span / 2]
# Grid sample coordinates are shared with the marching-cubes generator.
x = (origin[0] + np.arange(resolution) * span / resolution) * w
y = -(origin[1] + np.arange(resolution) * span / resolution) * w
alpha = np.array(image)[:, :, 3]
padding = 12
inside = np.pad(alpha >= 128, padding)

# Exact squared Euclidean distance transform, one dimension at a time.
def edt_line(f):
    n = len(f)
    v = np.zeros(n, dtype=int)
    z = np.empty(n + 1)
    result = np.empty(n)
    k = 0
    z[0], z[1] = -np.inf, np.inf
    for q in range(1, n):
        s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k])
        while s <= z[k]:
            k -= 1
            s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k])
        k += 1
        v[k], z[k], z[k+1] = q, s, np.inf
    k = 0
    for q in range(n):
        while z[k+1] < q:
            k += 1
        result[q] = (q-v[k])**2 + f[v[k]]
    return result

def edt(mask):
    a = np.where(mask, 0., 1e9)
    for row in range(a.shape[0]):
        a[row] = edt_line(a[row])
    for column in range(a.shape[1]):
        a[:, column] = edt_line(a[:, column])
    return np.sqrt(a)

signed = (edt(~inside) - edt(inside)) / w
kernel = np.array([1, 4, 6, 4, 1]) / 16
for axis in [0, 1]:
    signed = np.apply_along_axis(lambda a: np.convolve(np.pad(a, (2, 2), mode='edge'), kernel, mode='valid'), axis, signed)
# Sample the full-resolution distance field, instead of tracing a low-resolution
# binary mask. This retains the original subpixel silhouette at the mesh grid.
sampled = np.empty((resolution, resolution))
for j, sy in enumerate(y):
    for i, sx in enumerate(x):
        gx, gy = sx + padding, sy + padding
        ix, iy = int(np.floor(gx)), int(np.floor(gy))
        if ix < 0 or iy < 0 or ix >= signed.shape[1]-1 or iy >= signed.shape[0]-1:
            sampled[j, i] = -0.03
        else:
            tx, ty = gx-ix, gy-iy
            sampled[j, i] = ((1-ty)*((1-tx)*signed[iy,ix]+tx*signed[iy,ix+1])
                            +ty*((1-tx)*signed[iy+1,ix]+tx*signed[iy+1,ix+1]))
# Preserve the silhouette's soft outer edge when converting it to a solid.
signed = sampled + 0.004
(ROOT / 'scripts/logo-field.json').write_text(json.dumps({
    'resolution': resolution, 'span': span, 'origin': origin,
    'distance': np.round(signed, 7).ravel().tolist(),
}, separators=(',', ':')) + '\n')

print('Extracted silhouette from assets/logo.webp')
