import * as CANNON from 'cannon-es';
import { shape } from './logo-shape.js';
import { halfThickness, convexHull } from './logo-math.js';

export const STEP = 1 / 120;

export function createPhysics(width, height) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0), allowSleep: true });
  world.solver.iterations = 20;
  world.solver.tolerance = 1e-8;
  world.defaultContactMaterial.friction = 0.12;
  world.defaultContactMaterial.restitution = 0.82;
  world.defaultContactMaterial.contactEquationStiffness = 1e8;
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  // Only infinite page walls collide with this body. A convex envelope preserves
  // the silhouette's extreme contact points without filling the rendered notch.
  const hull = convexHull(shape.points);
  const n = hull.length;
  const vertices = [-halfThickness, halfThickness].flatMap(z => hull.map(p => new CANNON.Vec3(p.x, p.y, z)));
  const faces = [Array.from({ length: n }, (_, i) => n - i - 1), Array.from({ length: n }, (_, i) => n + i)];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, j + n, i + n]);
  }
  const body = new CANNON.Body({
    mass: 1, shape: new CANNON.ConvexPolyhedron({ vertices, faces }),
    linearDamping: 0, angularDamping: 0,
    linearFactor: new CANNON.Vec3(1, 1, 0),
    sleepSpeedLimit: 0.008, sleepTimeLimit: 0.6,
  });
  // Approximate the rounded body as a uniform solid silhouette centered on its
  // area centroid, rather than using the collision envelope's bounding box.
  const thicknessVariance = (2 * halfThickness) ** 2 / 12;
  body.inertia.set(shape.varianceY + thicknessVariance, shape.varianceX + thicknessVariance, shape.varianceX + shape.varianceY);
  body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
  body.updateInertiaWorld(true);
  world.addBody(body);
  const cursor = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0, collisionFilterMask: 0 });
  world.addBody(cursor);
  const walls = Array.from({ length: 4 }, () => {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    world.addBody(wall);
    return wall;
  });
  walls[0].quaternion.setFromEuler(0, Math.PI / 2, 0);
  walls[1].quaternion.setFromEuler(0, -Math.PI / 2, 0);
  walls[2].quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  walls[3].quaternion.setFromEuler(Math.PI / 2, 0, 0);
  let joint = null;
  let bounds = { width, height };

  function resize(w, h) {
    bounds = { width: w, height: h };
    walls[0].position.set(-w / 2, 0, 0);
    walls[1].position.set(w / 2, 0, 0);
    walls[2].position.set(0, -h / 2, 0);
    walls[3].position.set(0, h / 2, 0);
    walls.forEach(wall => { wall.aabbNeedsUpdate = true; });
    contain();
  }

  function contain(slack = 0) {
    body.updateAABB();
    const { lowerBound: lo, upperBound: hi } = body.aabb;
    // Safety projection for viewport shrink and very fast pointer motion. Normal
    // wall response (including contact torque) is handled by the impulse solver.
    for (const [axis, size] of [['x', bounds.width], ['y', bounds.height]]) {
      if (lo[axis] < -size / 2 - slack) {
        body.position[axis] += -size / 2 - lo[axis];
        if (body.velocity[axis] < 0) body.velocity[axis] *= -0.82;
      } else if (hi[axis] > size / 2 + slack) {
        body.position[axis] -= hi[axis] - size / 2;
        if (body.velocity[axis] > 0) body.velocity[axis] *= -0.82;
      }
    }
    body.aabbNeedsUpdate = true;
  }

  function release() {
    if (joint) world.removeConstraint(joint);
    joint = null;
  }

  function grab(point) {
    release();
    body.wakeUp();
    const pivot = body.pointToLocalFrame(new CANNON.Vec3(point.x, point.y, point.z));
    cursor.position.copy(point);
    cursor.velocity.setZero();
    joint = new CANNON.PointToPointConstraint(body, pivot, cursor, new CANNON.Vec3(), 70);
    joint.collideConnected = false;
    for (const equation of joint.equations) equation.setSpookParams(1800, 5, STEP);
    world.addConstraint(joint);
  }

  function move(point) {
    cursor.position.set(
      Math.max(-bounds.width / 2, Math.min(bounds.width / 2, point.x)),
      Math.max(-bounds.height / 2, Math.min(bounds.height / 2, point.y)),
      point.z,
    );
    body.wakeUp();
  }

  function step() {
    // Limit pathological pointer teleports before integration, not normal throws.
    const speed = body.velocity.length();
    if (speed > 8) body.velocity.scale(8 / speed, body.velocity);
    const spin = body.angularVelocity.length();
    if (spin > 18) body.angularVelocity.scale(18 / spin, body.angularVelocity);
    world.step(STEP);
    body.position.z = 0;
    body.velocity.z = 0;
    contain(0.08);
  }

  function reset(x, y) {
    release();
    body.position.set(x, y, 0);
    // Start square to the camera, preserving the original silhouette.
    // Depth becomes visible naturally when the user rotates it.
    body.quaternion.setFromEuler(0, 0, shape.angle);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.force.setZero();
    body.torque.setZero();
    body.updateInertiaWorld(true);
    body.sleep();
    contain();
  }

  resize(width, height);
  reset(0, 0);
  return { world, body, vertices, resize, grab, move, release, step, reset, contain, get dragging() { return joint !== null; } };
}
