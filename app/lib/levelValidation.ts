/**
 * Client-side publish/save validation for user-created levels (MIE-19).
 */

import type { LevelDocument } from './types';
import { LEVEL_WORLD_HEIGHT, LEVEL_WORLD_WIDTH, MAX_LEVEL_SPIKES } from './levelWorld';

export interface LevelValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a level before saving or publishing. */
export function validateLevelDocument(level: LevelDocument, requirePublishable = false): LevelValidationResult {
  const errors: string[] = [];

  if (!level.name.trim()) {
    errors.push('Level name is required.');
  }

  if (!level.ballSpawner) {
    errors.push('Place exactly one Ball Spawner.');
  }

  if (level.platforms.length < 1) {
    errors.push('Add at least one platform.');
  }

  if (requirePublishable || level.visibility === 'public') {
    const finishCount = level.platforms.filter((p) => p.isFinish).length;
    if (finishCount < 1) {
      errors.push('Mark at least one platform as the finish line before publishing.');
    }
  }

  if (level.platforms.length > 100) {
    errors.push('Too many platforms (max 100).');
  }

  if (level.bombs.length > 50) {
    errors.push('Too many bombs (max 50).');
  }

  const spikeCount = level.spikes?.length ?? 0;
  if (spikeCount > MAX_LEVEL_SPIKES) {
    errors.push(`Too many spikes (max ${MAX_LEVEL_SPIKES}).`);
  }

  for (const p of level.platforms) {
    if (p.x < -200 || p.y < -200 || p.x > LEVEL_WORLD_WIDTH + 200 || p.y > LEVEL_WORLD_HEIGHT + 400) {
      errors.push('One or more platforms are far outside the level bounds.');
      break;
    }
  }

  for (const s of level.spikes ?? []) {
    if (s.x < -200 || s.y < -200 || s.x > LEVEL_WORLD_WIDTH + 200 || s.y > LEVEL_WORLD_HEIGHT + 400) {
      errors.push('One or more spikes are far outside the level bounds.');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
