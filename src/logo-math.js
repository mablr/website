// Shared geometry math for mesh generation, collision and screen projection.
export const halfThickness = 0.09;

export function polygonProperties(points) {
  let area2 = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
    xx += (a.x * a.x + a.x * b.x + b.x * b.x) * cross;
    yy += (a.y * a.y + a.y * b.y + b.y * b.y) * cross;
    xy += (2 * a.x * a.y + a.x * b.y + b.x * a.y + 2 * b.x * b.y) * cross;
  });
  cx /= 3 * area2;
  cy /= 3 * area2;
  const varianceX = xx / (6 * area2) - cx * cx;
  const varianceY = yy / (6 * area2) - cy * cy;
  const covariance = xy / (12 * area2) - cx * cy;
  // Put the body in its principal mass frame so Cannon's diagonal inertia is valid.
  const angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    center: { x: cx, y: cy }, angle,
    varianceX: c * c * varianceX + 2 * c * s * covariance + s * s * varianceY,
    varianceY: s * s * varianceX - 2 * c * s * covariance + c * c * varianceY,
    points: points.map(p => ({ x: c * (p.x - cx) + s * (p.y - cy), y: -s * (p.x - cx) + c * (p.y - cy) })),
  };
}

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = list => {
    const hull = [];
    for (const p of list) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
