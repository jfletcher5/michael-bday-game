// Convert Firestore level documents into GameCanvas props (MIE-19).

import type { LevelDocument, Platform, Bomb, LevelScrollDirection } from './types';

/** Build Matter.js platform list from a saved level, including finish line. */
export function levelDocumentToPlatforms(level: LevelDocument): Platform[] {
  const platforms: Platform[] = level.platforms.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    width: p.width * (p.scale || 1),
    height: p.height * (p.scale || 1),
    isFinish: p.isFinish,
  }));

  if (level.ballSpawner) {
    platforms.unshift({
      id: 'spawner-platform',
      x: level.ballSpawner.x - 60,
      y: level.ballSpawner.y + 20,
      width: 120,
      height: 16,
    });
  }

  return platforms;
}

export function levelDocumentToBombs(level: LevelDocument): Bomb[] {
  return level.bombs.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    radius: 14 * (b.scale ?? 1),
  }));
}

/** Scroll vector sign for GameCanvas level mode. */
export function scrollDirectionMultiplier(dir: LevelScrollDirection): { x: number; y: number } {
  switch (dir) {
    case 'up':
      return { x: 0, y: -1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'down':
    default:
      return { x: 0, y: 1 };
  }
}
