import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VoxelWorld,
  Block,
  CONCEPTS,
  LaserEmitter,
  TrapDoorSpec,
} from './findTheButton';
import { collides, createPlayer, stepPlayer } from './findTheButtonPhysics';
import {
  DEATH_Y,
  isLaserOn,
  playerHitsLaser,
  playerTouchesDeadlyBlock,
  createTrapDoorStates,
  stepTrapDoors,
  isTrapDoorOpen,
  isTrapDoorArming,
  checkDeath,
} from './findTheButtonHazards';

function flatWorld(): VoxelWorld {
  const world = new VoxelWorld(16, 8, 16);
  world.fill(0, 0, 0, 15, 0, 15, Block.Stone);
  return world;
}

const NO_INPUT = { forward: 0, right: 0, jump: false };

const beam: LaserEmitter = {
  origin: { x: 4, y: 1, z: 8 },
  axis: 'x',
  length: 6,
  onMs: 1000,
  offMs: 1000,
  phaseMs: 0,
};

test('laser duty cycle turns on and off, and phase offsets it', () => {
  assert.equal(isLaserOn(beam, 0), true, 'on at the start of the cycle');
  assert.equal(isLaserOn(beam, 999), true);
  assert.equal(isLaserOn(beam, 1000), false, 'off for the second half');
  assert.equal(isLaserOn(beam, 1999), false);
  assert.equal(isLaserOn(beam, 2000), true, 'cycle repeats');

  // A half-period phase shift inverts the pattern, which is how staggered
  // corridors keep a gap open somewhere.
  const shifted = { ...beam, phaseMs: 1000 };
  assert.equal(isLaserOn(shifted, 0), false);
  assert.equal(isLaserOn(shifted, 1000), true);
});

test('a negative phase offset still produces a valid cycle', () => {
  const shifted = { ...beam, phaseMs: -500 };
  // Must not throw or produce NaN from a negative modulo.
  assert.equal(typeof isLaserOn(shifted, 0), 'boolean');
  assert.equal(isLaserOn(shifted, 500), true);
});

test('a laser only kills while firing, and only where the beam is', () => {
  const inBeam = { x: 6, y: 1, z: 8.5 };
  assert.equal(playerHitsLaser(inBeam, beam, 0), true, 'standing in a firing beam');
  assert.equal(playerHitsLaser(inBeam, beam, 1200), false, 'same spot while it is off');

  const pastEnd = { x: 12, y: 1, z: 8.5 };
  assert.equal(playerHitsLaser(pastEnd, beam, 0), false, 'beyond the beam length');

  const wrongLane = { x: 6, y: 1, z: 12.5 };
  assert.equal(playerHitsLaser(wrongLane, beam, 0), false, 'in a different lane');
});

test('a high beam can be walked under only if it clears the player', () => {
  // Player is 1.8 tall, so a beam at y=1 (centre 1.5) catches someone standing
  // on the floor at y=1, but one four blocks up does not.
  const feet = { x: 6, y: 1, z: 8.5 };
  assert.equal(playerHitsLaser(feet, beam, 0), true);

  const high = { ...beam, origin: { x: 4, y: 5, z: 8 } };
  assert.equal(playerHitsLaser(feet, high, 0), false, 'beam well above head height misses');
});

test('lava and spikes kill on contact, plain blocks do not', () => {
  const world = flatWorld();
  world.set(5, 0, 5, Block.Lava);
  world.set(9, 0, 9, Block.Spikes);

  assert.equal(playerTouchesDeadlyBlock(world, { x: 5.5, y: 0, z: 5.5 }), 'lava');
  assert.equal(playerTouchesDeadlyBlock(world, { x: 9.5, y: 0, z: 9.5 }), 'spikes');
  assert.equal(playerTouchesDeadlyBlock(world, { x: 2.5, y: 1, z: 2.5 }), null);
});

// Deadly blocks are solid, so the player lands on top of them rather than
// inside. Checking only for overlap let you stand on a lava field unharmed.
test('standing on top of lava or spikes is fatal', () => {
  const world = flatWorld();
  world.set(5, 0, 5, Block.Lava);
  world.set(9, 0, 9, Block.Spikes);

  // Feet at y=1 rest on top of the block at y=0.
  assert.equal(playerTouchesDeadlyBlock(world, { x: 5.5, y: 1, z: 5.5 }), 'lava');
  assert.equal(playerTouchesDeadlyBlock(world, { x: 9.5, y: 1, z: 9.5 }), 'spikes');

  // Standing on ordinary stone is still safe.
  assert.equal(playerTouchesDeadlyBlock(world, { x: 2.5, y: 1, z: 2.5 }), null);
});

test('a player who walks onto a lava field dies', () => {
  const world = new VoxelWorld(16, 8, 16);
  world.fill(0, 0, 0, 15, 0, 15, Block.Stone);
  world.fill(6, 0, 0, 15, 0, 15, Block.Lava); // lava from x=6 east
  const hazards = { lasers: [], trapDoors: [] };

  let player = createPlayer({ x: 2.5, y: 1, z: 8.5 });
  let died: string | null = null;

  for (let frame = 0; frame < 200; frame++) {
    // Yaw -PI/2 walks toward +X, straight onto the lava.
    player = stepPlayer(world, player, { forward: 1, right: 0, jump: false }, -Math.PI / 2, 1 / 60);
    died = checkDeath(world, player.position, hazards, frame * 16);
    if (died) break;
  }

  assert.equal(died, 'lava', 'walking onto lava kills rather than letting you stroll across it');
});

test('falling past the death plane is fatal', () => {
  const world = flatWorld();
  const hazards = { lasers: [], trapDoors: [] };

  assert.equal(checkDeath(world, { x: 8, y: 1, z: 8 }, hazards, 0), null);
  assert.equal(checkDeath(world, { x: 8, y: DEATH_Y - 1, z: 8 }, hazards, 0), 'fell');
});

test('a trapdoor opens under a standing player and lets them through', () => {
  const world = flatWorld();
  const spec: TrapDoorSpec = {
    tiles: [
      { x: 8, y: 0, z: 8 },
      { x: 9, y: 0, z: 8 },
    ],
    triggerMs: 500,
    openMs: 3000,
  };
  spec.tiles.forEach((t) => world.set(t.x, t.y, t.z, Block.TrapDoor));

  const states = createTrapDoorStates([spec]);
  const standing = { x: 8.5, y: 1, z: 8.5 };

  // Blocks the player at first.
  assert.equal(collides(world, 8.5, 0.5, 8.5), true, 'closed trapdoor is solid');

  stepTrapDoors(world, [spec], states, standing, 0);
  assert.equal(isTrapDoorArming(states[0]), true, 'stepping on it starts the countdown');
  assert.equal(isTrapDoorOpen(states[0]), false, 'but it has not opened yet');

  stepTrapDoors(world, [spec], states, standing, 400);
  assert.equal(isTrapDoorOpen(states[0]), false, 'still closed before the trigger delay');

  stepTrapDoors(world, [spec], states, standing, 600);
  assert.equal(isTrapDoorOpen(states[0]), true, 'opens once the delay elapses');
  assert.equal(world.get(8, 0, 8), Block.Air, 'tile is removed from the world');
  assert.equal(collides(world, 8.5, 0.5, 8.5), false, 'player now falls through');
});

test('a trapdoor never closes back on top of the player standing in it', () => {
  const world = flatWorld();
  const spec: TrapDoorSpec = {
    tiles: [{ x: 8, y: 0, z: 8 }],
    triggerMs: 100,
    openMs: 500,
  };
  world.set(8, 0, 8, Block.TrapDoor);

  const states = createTrapDoorStates([spec]);
  const standing = { x: 8.5, y: 1, z: 8.5 };

  stepTrapDoors(world, [spec], states, standing, 0);
  stepTrapDoors(world, [spec], states, standing, 200);
  assert.equal(isTrapDoorOpen(states[0]), true);

  // Long past the reset window, but the player is still on the tile.
  stepTrapDoors(world, [spec], states, standing, 5000);
  assert.equal(isTrapDoorOpen(states[0]), true, 'stays open while occupied');

  // Once they move away it resets.
  stepTrapDoors(world, [spec], states, { x: 2.5, y: 1, z: 2.5 }, 6000);
  assert.equal(isTrapDoorOpen(states[0]), false, 'resets once clear');
  assert.equal(world.get(8, 0, 8), Block.TrapDoor, 'tile is restored');
});

test('a player standing on an opening trapdoor actually falls', () => {
  const world = flatWorld();
  const spec: TrapDoorSpec = {
    tiles: [
      { x: 8, y: 0, z: 8 },
      { x: 9, y: 0, z: 8 },
      { x: 8, y: 0, z: 9 },
      { x: 9, y: 0, z: 9 },
    ],
    triggerMs: 200,
    openMs: 5000,
  };
  spec.tiles.forEach((t) => world.set(t.x, t.y, t.z, Block.TrapDoor));

  const states = createTrapDoorStates([spec]);
  let player = createPlayer({ x: 8.5, y: 1, z: 8.5 });
  const hazards = { lasers: [], trapDoors: [spec] };

  let died: string | null = null;
  for (let frame = 0; frame < 200; frame++) {
    const timeMs = frame * (1000 / 60);
    stepTrapDoors(world, [spec], states, player.position, timeMs);
    player = stepPlayer(world, player, NO_INPUT, 0, 1 / 60);
    died = checkDeath(world, player.position, hazards, timeMs);
    if (died) break;
  }

  assert.equal(died, 'fell', 'the trapdoor drops the player past the death plane');
});

// Hazards must not make a level impossible: every concept needs a route from at
// least one spawn to the button that never crosses lava, spikes, or a hole.
//
// Caveat: this walk moves freely on Y, so it proves the button is *connected*
// and not sealed off by hazards — it does not prove every gap is jumpable. For
// The Spire in particular, only playing it confirms the climb works.
for (const concept of CONCEPTS) {
  test(`concept "${concept.name}" has a safe route to the button`, () => {
    const { world, spawns, button } = concept.build();

    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const reachedFrom = spawns.map((spawn) => {
      const start = {
        x: Math.floor(spawn.position.x),
        y: Math.floor(spawn.position.y),
        z: Math.floor(spawn.position.z),
      };
      const seen = new Set([key(start.x, start.y, start.z)]);
      const queue = [start];
      let found = false;

      while (queue.length) {
        const cur = queue.shift()!;
        if (
          Math.abs(cur.x - button.x) + Math.abs(cur.y - button.y) + Math.abs(cur.z - button.z) <= 2
        ) {
          found = true;
          break;
        }

        for (const [dx, dy, dz] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
          [0, 1, 0],
          [0, -1, 0],
        ]) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const nz = cur.z + dz;
          if (!world.inBounds(nx, ny, nz)) continue;
          const k = key(nx, ny, nz);
          if (seen.has(k)) continue;
          if (collides(world, nx + 0.5, ny, nz + 0.5)) continue;
          // Never route through a cell whose floor is deadly or missing.
          const floor = world.get(nx, ny - 1, nz);
          if (floor === Block.Lava || floor === Block.Spikes) continue;
          seen.add(k);
          queue.push({ x: nx, y: ny, z: nz });
        }
      }
      return found;
    });

    assert.ok(
      reachedFrom.some(Boolean),
      `at least one spawn must reach the button without crossing a hazard (reached: ${reachedFrom})`
    );
  });
}
