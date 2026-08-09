import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VoxelWorld, Block, CONCEPTS } from './findTheButton';
import {
  createPlayer,
  collides,
  stepPlayer,
  raycastVoxel,
  JUMP_SPEED,
  WALK_SPEED,
} from './findTheButtonPhysics';

/** Flat stone floor at y=0, open air above. */
function flatWorld(): VoxelWorld {
  const world = new VoxelWorld(16, 8, 16);
  world.fill(0, 0, 0, 15, 0, 15, Block.Stone);
  return world;
}

const NO_INPUT = { forward: 0, right: 0, jump: false };

test('collides detects the floor and open air', () => {
  const world = flatWorld();
  assert.equal(collides(world, 8, 1, 8), false, 'standing on the floor is clear');
  assert.equal(collides(world, 8, 0.5, 8), true, 'sunk into the floor overlaps');
});

test('gravity settles the player onto the floor instead of falling through', () => {
  const world = flatWorld();
  let player = createPlayer({ x: 8, y: 5, z: 8 });

  for (let i = 0; i < 200; i++) {
    player = stepPlayer(world, player, NO_INPUT, 0, 1 / 60);
  }

  assert.ok(player.onGround, 'player ends up grounded');
  assert.ok(player.position.y >= 1, `player rests on top of the floor, got y=${player.position.y}`);
  assert.ok(player.position.y < 1.2, `player does not hover, got y=${player.position.y}`);
});

test('walking into a wall stops horizontal movement but does not stop the player', () => {
  const world = flatWorld();
  world.fill(10, 1, 0, 10, 4, 15, Block.Stone); // wall across x=10

  let player = createPlayer({ x: 8, y: 1, z: 8 });
  for (let i = 0; i < 120; i++) {
    // Yaw of -PI/2 points forward at +X, straight into the wall.
    player = stepPlayer(world, player, { forward: 1, right: 0, jump: false }, -Math.PI / 2, 1 / 60);
  }

  assert.ok(player.position.x < 10, `player stays outside the wall, got x=${player.position.x}`);
  assert.ok(player.position.x > 9, `player reaches the wall, got x=${player.position.x}`);
});

test('a grounded player jumps and an airborne player cannot', () => {
  const world = flatWorld();
  let player = createPlayer({ x: 8, y: 1, z: 8 });
  player = stepPlayer(world, player, NO_INPUT, 0, 1 / 60); // settle onto the floor
  assert.ok(player.onGround);

  player = stepPlayer(world, player, { forward: 0, right: 0, jump: true }, 0, 1 / 60);
  assert.ok(player.velocity.y > 0, 'jump imparts upward velocity');
  assert.ok(player.velocity.y <= JUMP_SPEED);

  const airborne = stepPlayer(world, player, { forward: 0, right: 0, jump: true }, 0, 1 / 60);
  assert.ok(airborne.velocity.y < player.velocity.y, 'no second jump while airborne');
});

test('diagonal input is not faster than cardinal input', () => {
  const world = flatWorld();
  const start = createPlayer({ x: 8, y: 1, z: 8 });

  const diagonal = stepPlayer(world, start, { forward: 1, right: 1, jump: false }, 0, 1 / 60);
  const speed = Math.hypot(diagonal.velocity.x, diagonal.velocity.z);

  assert.ok(
    Math.abs(speed - WALK_SPEED) < 1e-6,
    `diagonal speed should equal walk speed, got ${speed}`
  );
});

test('raycast finds the button block ahead and misses when aimed away', () => {
  const world = flatWorld();
  world.set(12, 2, 8, Block.Button);

  const origin = { x: 8, y: 2.5, z: 8.5 };
  const hit = raycastVoxel(world, origin, { x: 1, y: 0, z: 0 }, 6);
  assert.ok(hit, 'ray hits something');
  assert.equal(hit.blockId, Block.Button);
  assert.deepEqual(hit.block, { x: 12, y: 2, z: 8 });

  const miss = raycastVoxel(world, origin, { x: -1, y: 0, z: 0 }, 6);
  assert.equal(miss, null, 'ray aimed away hits nothing');
});

// Every concept must be playable: spawn in open air, land on something, and
// place a button that is reachable. Catches level-gen regressions cheaply.
for (const concept of CONCEPTS) {
  test(`concept "${concept.name}" is playable`, () => {
    const { world, spawn, button } = concept.build();

    assert.equal(
      collides(world, spawn.x, spawn.y, spawn.z),
      false,
      'spawn must not be inside a solid block'
    );

    assert.equal(
      world.get(button.x, button.y, button.z),
      Block.Button,
      'button block is placed where the concept says it is'
    );

    const neighbours = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    assert.ok(
      neighbours.some(([dx, dy, dz]) => !world.isSolid(button.x + dx, button.y + dy, button.z + dz)),
      'button has an exposed face, so it can be seen and pressed'
    );

    let player = createPlayer(spawn);
    for (let i = 0; i < 300; i++) {
      player = stepPlayer(world, player, NO_INPUT, 0, 1 / 60);
    }
    assert.ok(player.onGround, 'player lands rather than falling out of the world');
  });
}
