import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'cannon-es';
import { createPhysics, STEP } from '../src/logo-physics.js';
import { shape } from '../src/logo-shape.js';
import { polygonProperties } from '../src/logo-math.js';

const advance = (sim, seconds) => { for (let i = 0; i < seconds / STEP; i++) sim.step(); };
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('starts motionless and stays motionless with zero gravity', () => {
  const sim = createPhysics(8, 6);
  const position = sim.body.position.clone(), rotation = sim.body.quaternion.clone();
  advance(sim, 10);
  assert.deepEqual(sim.body.position, position);
  assert.deepEqual(sim.body.quaternion, rotation);
  assert.equal(sim.body.velocity.length(), 0);
  assert.equal(sim.body.angularVelocity.length(), 0);
});

test('coasts without air resistance after release', () => {
  const sim = createPhysics(100, 100);
  sim.body.wakeUp();
  sim.body.velocity.set(1, 0.3, 0);
  advance(sim, 2);
  close(sim.body.position.x, 2);
  close(sim.body.position.y, 0.6);
  close(sim.body.velocity.x, 1);
});

test('a center grab translates; an off-center grab produces spin', () => {
  const pull = offset => {
    const sim = createPhysics(20, 20);
    const point = sim.body.pointToWorldFrame(offset);
    sim.grab(point);
    for (let i = 0; i < 48; i++) {
      sim.move({ x: point.x + i * 0.012, y: point.y, z: point.z });
      sim.step();
    }
    sim.release();
    return sim;
  };
  const center = pull(new Vec3());
  const edge = pull(new Vec3(0, 0.3, 0.08));
  assert.ok(center.body.position.x > 0.4);
  assert.ok(center.body.angularVelocity.length() < 1e-6);
  assert.ok(edge.body.angularVelocity.length() > 0.5);
  const velocity = edge.body.velocity.clone();
  advance(edge, 0.2);
  assert.ok(edge.body.position.x > 0.3);
  close(edge.body.velocity.x, velocity.x);
});

test('all four walls reflect throws and keep the object on screen', () => {
  for (const [x, y] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    const sim = createPhysics(4, 4);
    sim.body.wakeUp();
    sim.body.velocity.set(x, y, 0);
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      sim.step();
      sim.body.updateAABB();
      const aabb = sim.body.aabb;
      assert.ok(aabb.lowerBound.x >= -2.08 && aabb.upperBound.x <= 2.08);
      assert.ok(aabb.lowerBound.y >= -2.08 && aabb.upperBound.y <= 2.08);
      bounced ||= sim.body.velocity.x * x + sim.body.velocity.y * y < 0;
    }
    assert.ok(bounced, `No reflection for ${x},${y}`);
    assert.ok(sim.body.angularVelocity.length() > 0.01, 'Off-center wall contact should generate torque');
  }
});

test('repeated rapid grabs, cancellations, and corner impacts stay finite', () => {
  const sim = createPhysics(3, 3);
  for (let i = 0; i < 40; i++) {
    const point = sim.body.pointToWorldFrame(new Vec3(0.2, -0.2, 0.05));
    sim.grab(point);
    sim.move({ x: i % 2 ? 100 : -100, y: i % 3 ? 100 : -100, z: point.z });
    advance(sim, 0.12);
    sim.release();
    advance(sim, 0.2);
    for (const v of [...sim.body.position.toArray(), ...sim.body.velocity.toArray(), ...sim.body.quaternion.toArray()]) assert.ok(Number.isFinite(v));
    close(sim.body.position.z, 0);
  }
});

test('resize contains the body and reset removes momentum and joints', () => {
  const sim = createPhysics(10, 10);
  sim.body.position.set(4, 4, 0);
  sim.resize(2.5, 2.5);
  sim.body.updateAABB();
  assert.ok(sim.body.aabb.upperBound.x <= 1.25 + 1e-9);
  assert.ok(sim.body.aabb.upperBound.y <= 1.25 + 1e-9);
  sim.grab(sim.body.position);
  sim.move({ x: 1, y: 1, z: 0 });
  advance(sim, 0.1);
  sim.reset(0, 0);
  assert.equal(sim.dragging, false);
  assert.equal(sim.world.constraints.length, 0);
  assert.equal(sim.body.velocity.length(), 0);
  assert.equal(sim.body.angularVelocity.length(), 0);
});

test('mass uses the silhouette centroid and principal inertia axes', () => {
  const centered = polygonProperties(shape.points);
  close(centered.center.x, 0);
  close(centered.center.y, 0);
  const square = polygonProperties([{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]);
  close(square.center.x, 1);
  close(square.center.y, 1);
  close(square.varianceX, 1 / 3);
  close(square.varianceY, 1 / 3);
});
