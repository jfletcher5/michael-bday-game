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
  createFossilPickups,
  FOSSIL_SPAWN_COUNT,
  FOSSIL_TYPES,
  FOSSIL_WORLD_WIDTH,
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
  it('creates a deterministic spawn table of fossils', () => {
    const a = createFossilPickups();
    const b = createFossilPickups();
    assert.equal(a.length, FOSSIL_SPAWN_COUNT);
    assert.deepEqual(
      a.map((p) => ({ id: p.id, type: p.type, x: p.x })),
      b.map((p) => ({ id: p.id, type: p.type, x: p.x })),
    );
    assert.ok(a.every((p) => FOSSIL_TYPES.includes(p.type)));
    assert.ok(a.every((p) => p.x > 0 && p.x < FOSSIL_WORLD_WIDTH));
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
