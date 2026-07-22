/**
 * Unit tests for Fossil Exploration helpers (MIE-31).
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addFossilToInventory,
  clampFossilCameraX,
  countFossilInventory,
  createMineables,
  findMineableAtWorldPoint,
  FOSSIL_CRAFT_RECIPES,
  FOSSIL_MINE_SUCCESS_CHANCE,
  FOSSIL_SPAWN_COUNT,
  FOSSIL_TYPE_META,
  FOSSIL_TYPES,
  FOSSIL_WORLD_WIDTH,
  fossilPairKey,
  matchFossilRecipe,
  pickRandomFossilType,
} from './fossils';
import { isEventTypeLive, isFossilEventActive } from './gameEvents';
import type { GameEvent } from './types';
import {
  levelDocumentToSpikes,
  normalizeLevelDocument,
  LEVEL_SPIKE_WIDTH,
} from './levelWorld';
import { validateLevelDocument } from './levelValidation';

describe('fossils helpers', () => {
  it('creates a deterministic spawn table of mineables (MIE-34)', () => {
    const a = createMineables();
    const b = createMineables();
    assert.equal(a.length, FOSSIL_SPAWN_COUNT);
    assert.deepEqual(
      a.map((n) => ({ id: n.id, kind: n.kind, x: n.x })),
      b.map((n) => ({ id: n.id, kind: n.kind, x: n.x })),
    );
    assert.ok(a.every((n) => ['plant', 'rock', 'tree'].includes(n.kind)));
    assert.ok(a.every((n) => !n.mined));
    assert.ok(a.every((n) => n.x > 0 && n.x < FOSSIL_WORLD_WIDTH));
  });

  it('finds unmined nodes at world point and ignores mined nodes', () => {
    const nodes = createMineables();
    const target = nodes[0];
    const hit = findMineableAtWorldPoint(nodes, target.x, target.y);
    assert.equal(hit?.id, target.id);
    target.mined = true;
    assert.equal(findMineableAtWorldPoint(nodes, target.x, target.y), null);
  });

  it('pickRandomFossilType returns valid types from rng', () => {
    assert.equal(pickRandomFossilType(() => 0), FOSSIL_TYPES[0]);
    assert.equal(pickRandomFossilType(() => 0.99), FOSSIL_TYPES[FOSSIL_TYPES.length - 1]);
  });

  it('mine success chance is 20%', () => {
    assert.equal(FOSSIL_MINE_SUCCESS_CHANCE, 0.2);
  });

  it('clamps camera so the viewport stays in world bounds', () => {
    assert.equal(clampFossilCameraX(0, 900), 0);
    assert.equal(clampFossilCameraX(FOSSIL_WORLD_WIDTH, 900), FOSSIL_WORLD_WIDTH - 900);
    assert.ok(clampFossilCameraX(1600, 900) > 0);
    assert.ok(clampFossilCameraX(1600, 900) < FOSSIL_WORLD_WIDTH - 900 + 1);
  });

  it('merges fossil inventory immutably', () => {
    const next = addFossilToInventory({ amber: 1 }, 'bone');
    assert.deepEqual(next, { amber: 1, bone: 1 });
    assert.equal(countFossilInventory(next), 2);
    assert.equal(countFossilInventory(undefined), 0);
  });

  it('exposes fossil artwork paths for each type (MIE-33)', () => {
    for (const type of FOSSIL_TYPES) {
      assert.match(FOSSIL_TYPE_META[type].imageSrc, /^\/fossils\/[a-z]+\.png$/);
    }
  });
});

describe('fossil craft recipes (MIE-33)', () => {
  it('encodes all five Michael recipes', () => {
    assert.equal(matchFossilRecipe('amber', 'amber'), 'deadility');
    assert.equal(matchFossilRecipe('amber', 'shell'), 'rockylity');
    assert.equal(matchFossilRecipe('fern', 'bone'), 'swimtility');
    assert.equal(matchFossilRecipe('bone', 'claw'), 'ancienty');
    assert.equal(matchFossilRecipe('fern', 'amber'), 'fossility');
    assert.equal(Object.keys(FOSSIL_CRAFT_RECIPES).length, 5);
  });

  it('treats fossil order as irrelevant', () => {
    assert.equal(matchFossilRecipe('shell', 'amber'), 'rockylity');
    assert.equal(matchFossilRecipe('bone', 'fern'), 'swimtility');
    assert.equal(fossilPairKey('amber', 'shell'), fossilPairKey('shell', 'amber'));
  });

  it('requires two amber for Deadility', () => {
    assert.equal(matchFossilRecipe('amber', 'amber'), 'deadility');
    assert.equal(matchFossilRecipe('amber', 'bone'), null);
  });

  it('returns null for invalid fossil pairs', () => {
    assert.equal(matchFossilRecipe('claw', 'claw'), null);
    assert.equal(matchFossilRecipe('shell', 'fern'), null);
    assert.equal(matchFossilRecipe('claw', 'fern'), null);
  });
});

describe('gameEvents helpers', () => {
  const base: GameEvent = {
    id: 'e1',
    type: 'fossil',
    startAtMs: 1_000,
    durationSec: 60,
    createdBy: 'ADM',
    createdAtMs: 0,
  };

  it('detects live fossil event windows', () => {
    assert.equal(isFossilEventActive([base], 1_500), true);
    assert.equal(isFossilEventActive([base], 500), false);
    assert.equal(isFossilEventActive([base], 1_000 + 60_000), false);
    assert.equal(isEventTypeLive([base], 'aurora', 1_500), false);
  });
});

describe('spike level round-trip (MIE-30)', () => {
  it('normalizes spikes and converts to runtime props', () => {
    const doc = normalizeLevelDocument('lvl1', {
      name: 'Spike Test',
      authorUsername: 'TST',
      visibility: 'private',
      platforms: [{ id: 'p1', x: 100, y: 200, width: 120, height: 16 }],
      bombs: [],
      spikes: [{ id: 's1', x: 140, y: 200, width: LEVEL_SPIKE_WIDTH, scale: 1 }],
      ballSpawner: { x: 100, y: 180 },
      screenScroll: 'down',
      skyColor: '#112233',
    });
    assert.ok(doc);
    assert.equal(doc!.spikes?.length, 1);
    const runtime = levelDocumentToSpikes(doc!);
    assert.equal(runtime[0].id, 's1');
    assert.equal(runtime[0].width, LEVEL_SPIKE_WIDTH);

    const validation = validateLevelDocument(doc!);
    assert.equal(validation.valid, true);
  });

  it('rejects too many spikes', () => {
    const spikes = Array.from({ length: 51 }, (_, i) => ({
      id: `s${i}`,
      x: 10,
      y: 10,
      width: 80,
      scale: 1,
    }));
    const doc = normalizeLevelDocument('lvl2', {
      name: 'Too Many',
      authorUsername: 'TST',
      platforms: [{ id: 'p1', x: 0, y: 0, width: 100, height: 16 }],
      bombs: [],
      spikes,
      ballSpawner: { x: 0, y: 0 },
    });
    // normalize slices to max 50
    assert.equal(doc!.spikes?.length, 50);
    const over = {
      ...doc!,
      spikes: spikes,
    };
    const validation = validateLevelDocument(over);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('spikes')));
  });
});
