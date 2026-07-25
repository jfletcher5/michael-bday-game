/**
 * Unit tests for Fossil Craft Machine helpers (MIE-32).
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFossilCraftJob,
  deductFossilsForCraft,
  formatCraftTimeLeft,
  FOSSIL_CRAFT_DURATION_MS,
  getFossilCraftRemainingMs,
  hasFossilsForCraft,
  isFossilCraftComplete,
  listFossilCraftRecipes,
  toggleFossilSelection,
} from './fossilCraft';

describe('fossil craft helpers (MIE-32)', () => {
  it('uses a 30-minute real-time craft duration', () => {
    assert.equal(FOSSIL_CRAFT_DURATION_MS, 30 * 60 * 1000);
  });

  it('creates a craft job with endsAtMs 30 minutes after start', () => {
    const now = 1_000_000;
    const job = createFossilCraftJob('amber', 'fern', now);
    assert.equal(job.fossilA, 'amber');
    assert.equal(job.fossilB, 'fern');
    assert.equal(job.resultBallId, 'fossility');
    assert.equal(job.startedAtMs, now);
    assert.equal(job.endsAtMs, now + FOSSIL_CRAFT_DURATION_MS);
  });

  it('rejects invalid fossil pairs when creating a job', () => {
    assert.throws(() => createFossilCraftJob('claw', 'claw'), /Invalid fossil recipe/);
  });

  it('deducts fossils immutably — same type needs two copies', () => {
    const next = deductFossilsForCraft({ amber: 2 }, 'amber', 'amber');
    assert.deepEqual(next, {});
    const mixed = deductFossilsForCraft({ amber: 1, shell: 2 }, 'amber', 'shell');
    assert.deepEqual(mixed, { shell: 1 });
  });

  it('checks inventory for craft requirements', () => {
    assert.equal(hasFossilsForCraft({ amber: 2 }, 'amber', 'amber'), true);
    assert.equal(hasFossilsForCraft({ amber: 1 }, 'amber', 'amber'), false);
    assert.equal(hasFossilsForCraft({ amber: 1, shell: 1 }, 'amber', 'shell'), true);
    assert.equal(hasFossilsForCraft({ amber: 1 }, 'amber', 'shell'), false);
  });

  it('detects craft completion from wall-clock endsAtMs', () => {
    const job = createFossilCraftJob('bone', 'claw', 0);
    assert.equal(isFossilCraftComplete(job, job.endsAtMs - 1), false);
    assert.equal(isFossilCraftComplete(job, job.endsAtMs), true);
    assert.equal(getFossilCraftRemainingMs(job, 0), FOSSIL_CRAFT_DURATION_MS);
  });

  it('formats countdown as mm:ss', () => {
    assert.equal(formatCraftTimeLeft(151_000), '2:31');
    assert.equal(formatCraftTimeLeft(0), '0:00');
  });

  it('lists all five craft recipes', () => {
    const recipes = listFossilCraftRecipes();
    assert.equal(recipes.length, 5);
    assert.ok(recipes.some((r) => r.ballId === 'deadility'));
    assert.ok(recipes.some((r) => r.ballId === 'fossility'));
  });
});

describe('fossil craft selection toggle (MIE-39)', () => {
  it('fills slot B when tapping the same fossil twice with 2+ copies', () => {
    const next = toggleFossilSelection(
      { selectedA: 'amber', selectedB: null },
      'amber',
      { amber: 2 },
    );
    assert.deepEqual(next, { selectedA: 'amber', selectedB: 'amber' });
  });

  it('deselects slot A when only one copy is available', () => {
    const next = toggleFossilSelection(
      { selectedA: 'amber', selectedB: null },
      'amber',
      { amber: 1 },
    );
    assert.deepEqual(next, { selectedA: null, selectedB: null });
  });

  it('clears both slots when tapping a fully selected same-type pair', () => {
    const next = toggleFossilSelection(
      { selectedA: 'amber', selectedB: 'amber' },
      'amber',
      { amber: 2 },
    );
    assert.deepEqual(next, { selectedA: null, selectedB: null });
  });

  it('deselects slot A in a mixed pair when tapping slot A fossil again', () => {
    const next = toggleFossilSelection(
      { selectedA: 'amber', selectedB: 'shell' },
      'amber',
      { amber: 1, shell: 1 },
    );
    assert.deepEqual(next, { selectedA: null, selectedB: 'shell' });
  });

  it('deselects slot B when tapping slot B fossil', () => {
    const next = toggleFossilSelection(
      { selectedA: 'amber', selectedB: 'shell' },
      'shell',
      { amber: 1, shell: 1 },
    );
    assert.deepEqual(next, { selectedA: 'amber', selectedB: null });
  });

  it('fills empty slot A on first tap', () => {
    const next = toggleFossilSelection(
      { selectedA: null, selectedB: null },
      'fern',
      { fern: 3 },
    );
    assert.deepEqual(next, { selectedA: 'fern', selectedB: null });
  });
});
