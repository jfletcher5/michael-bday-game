import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Block, CONCEPTS, openDoor } from './findTheButton';
import { collides } from './findTheButtonPhysics';

/**
 * Combination-lock consistency.
 *
 * A lock is a promise the level makes to the player: the panel they aim at is
 * a real LockPanel block, the door tiles are real Door blocks, and the code is
 * enterable on a numeric keypad. These tests keep level-gen honest.
 */

const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

for (const concept of CONCEPTS) {
  const { lock } = concept.build();
  if (!lock) continue;

  test(`concept "${concept.name}" has a consistent lock`, () => {
    const { world, lock: spec } = concept.build();

    assert.match(spec.code, /^\d{3,}$/, 'code is at least 3 digits, all numeric');
    assert.ok(spec.hint.length > 0, 'a hint is shown on the keypad');
    assert.ok(spec.doorTiles.length > 0, 'the lock controls at least one door tile');

    assert.equal(
      world.get(spec.panel.x, spec.panel.y, spec.panel.z),
      Block.LockPanel,
      'panel block is placed where the spec says it is'
    );

    // The panel needs an exposed face or the player can never aim at it.
    assert.ok(
      NEIGHBOURS.some(
        ([dx, dy, dz]) => !world.isSolid(spec.panel.x + dx, spec.panel.y + dy, spec.panel.z + dz)
      ),
      'lock panel has an exposed face'
    );

    for (const tile of spec.doorTiles) {
      assert.equal(
        world.get(tile.x, tile.y, tile.z),
        Block.Door,
        `door tile at ${tile.x},${tile.y},${tile.z} is a Door block`
      );
    }
  });
}

test('openDoor removes the door tiles so the doorway no longer blocks movement', () => {
  const concept = CONCEPTS.find((c) => c.build().lock);
  assert.ok(concept, 'at least one concept has a combination lock');

  const { world, lock } = concept.build();
  assert.ok(lock);

  // Closed: the first door tile is solid to stand in.
  const first = lock.doorTiles[0];
  assert.equal(collides(world, first.x + 0.5, first.y, first.z + 0.5), true);

  openDoor(world, lock);

  for (const tile of lock.doorTiles) {
    assert.equal(world.get(tile.x, tile.y, tile.z), Block.Air, 'tile becomes Air');
  }
  assert.equal(
    collides(world, first.x + 0.5, first.y, first.z + 0.5),
    false,
    'doorway is passable once open'
  );
});
