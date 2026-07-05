/**
 * Shared virtual level world — Studio and GameCanvas use the same coordinate space (MIE-19).
 */

import type {
  LevelDocument,
  LevelPlatformObject,
  LevelBombObject,
  Platform,
  Bomb,
  LevelScrollDirection,
} from './types';

/** Fixed virtual world size used by the editor and level play mode. */
export const LEVEL_WORLD_WIDTH = 900;
export const LEVEL_WORLD_HEIGHT = 520;

/** Consistent bomb radius for editor preview and gameplay hitboxes. */
export const LEVEL_BOMB_RADIUS = 14;

/** Default platform height in the editor. */
export const DEFAULT_PLATFORM_HEIGHT = 16;
export const DEFAULT_PLATFORM_WIDTH = 120;

/** Generated start platform under the ball spawner (visible in Studio + play). */
export const SPAWNER_PLATFORM_WIDTH = 120;
export const SPAWNER_PLATFORM_HEIGHT = 16;
export const SPAWNER_PLATFORM_ID = 'spawner-platform';

export type LevelEditorTool = 'select' | 'platform' | 'bomb' | 'spawner' | 'pan';

export type SelectedObject =
  | { kind: 'platform'; id: string }
  | { kind: 'bomb'; id: string }
  | { kind: 'spawner' }
  | null;

/** Build the implicit start platform shown under the ball spawner. */
export function getSpawnerPlatform(spawner: { x: number; y: number }): LevelPlatformObject {
  return {
    id: SPAWNER_PLATFORM_ID,
    x: spawner.x - SPAWNER_PLATFORM_WIDTH / 2,
    y: spawner.y + 20,
    width: SPAWNER_PLATFORM_WIDTH,
    height: SPAWNER_PLATFORM_HEIGHT,
    rotation: 0,
    scale: 1,
    isFinish: false,
  };
}

/** All drawable platforms including the generated spawner platform. */
export function getAllLevelPlatforms(level: LevelDocument): LevelPlatformObject[] {
  const platforms = [...level.platforms];
  if (level.ballSpawner) {
    platforms.unshift(getSpawnerPlatform(level.ballSpawner));
  }
  return platforms;
}

/** Map editor canvas pixel coords to virtual world coords. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  pan: { x: number; y: number },
): { x: number; y: number } {
  const scaleX = canvasWidth / LEVEL_WORLD_WIDTH;
  const scaleY = canvasHeight / LEVEL_WORLD_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (canvasWidth - LEVEL_WORLD_WIDTH * scale) / 2;
  const offsetY = (canvasHeight - LEVEL_WORLD_HEIGHT * scale) / 2;
  return {
    x: (screenX - offsetX - pan.x) / scale,
    y: (screenY - offsetY - pan.y) / scale,
  };
}

/** Convert world coords to canvas pixel coords for drawing. */
export function worldToScreen(
  worldX: number,
  worldY: number,
  canvasWidth: number,
  canvasHeight: number,
  pan: { x: number; y: number },
): { x: number; y: number } {
  const scaleX = canvasWidth / LEVEL_WORLD_WIDTH;
  const scaleY = canvasHeight / LEVEL_WORLD_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (canvasWidth - LEVEL_WORLD_WIDTH * scale) / 2;
  const offsetY = (canvasHeight - LEVEL_WORLD_HEIGHT * scale) / 2;
  return {
    x: worldX * scale + offsetX + pan.x,
    y: worldY * scale + offsetY + pan.y,
  };
}

export function getEditorScale(canvasWidth: number, canvasHeight: number): number {
  return Math.min(canvasWidth / LEVEL_WORLD_WIDTH, canvasHeight / LEVEL_WORLD_HEIGHT);
}

/** Hit-test platforms (top-left coords) in world space. */
export function hitTestPlatform(
  platforms: LevelPlatformObject[],
  wx: number,
  wy: number,
): LevelPlatformObject | null {
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    const w = p.width * (p.scale || 1);
    const h = p.height * (p.scale || 1);
    if (wx >= p.x && wx <= p.x + w && wy >= p.y && wy <= p.y + h) {
      return p;
    }
  }
  return null;
}

/** Hit-test bombs by center + radius. */
export function hitTestBomb(bombs: LevelBombObject[], wx: number, wy: number): LevelBombObject | null {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    const r = LEVEL_BOMB_RADIUS * (b.scale ?? 1);
    if (Math.hypot(wx - b.x, wy - b.y) <= r + 4) return b;
  }
  return null;
}

export function hitTestSpawner(spawner: { x: number; y: number } | null, wx: number, wy: number): boolean {
  if (!spawner) return false;
  return Math.hypot(wx - spawner.x, wy - spawner.y) <= 18;
}

/** Scroll vector for GameCanvas level mode. */
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

/** Convert saved level objects into GameCanvas platform props (world coordinates). */
export function levelDocumentToPlatforms(level: LevelDocument): Platform[] {
  return getAllLevelPlatforms(level).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    width: p.width * (p.scale || 1),
    height: p.height * (p.scale || 1),
    isFinish: p.isFinish,
    rotation: p.rotation ?? 0,
  }));
}

export function levelDocumentToBombs(level: LevelDocument): Bomb[] {
  return level.bombs.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    radius: LEVEL_BOMB_RADIUS * (b.scale ?? 1),
  }));
}

/** Strip runtime-only id from Firestore payload bodies. */
export function levelToFirestoreBody(level: LevelDocument): Omit<LevelDocument, 'id'> {
  const { id: _id, ...body } = level;
  return body;
}

/** Normalize a Firestore level document at read time. */
export function normalizeLevelDocument(id: string, raw: Record<string, unknown>): LevelDocument | null {
  if (raw.archived === true) return null;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 40) : 'Untitled Level';
  const description = typeof raw.description === 'string' ? raw.description.slice(0, 200) : '';
  const authorUsername = typeof raw.authorUsername === 'string' ? raw.authorUsername : '';
  const visibility = raw.visibility === 'public' ? 'public' : 'private';
  const screenScroll = (['up', 'down', 'left', 'right'] as const).includes(raw.screenScroll as LevelScrollDirection)
    ? (raw.screenScroll as LevelScrollDirection)
    : 'down';
  const skyColor = typeof raw.skyColor === 'string' ? raw.skyColor : '#1a1a2e';
  const createdAtMs = typeof raw.createdAtMs === 'number' ? raw.createdAtMs : Date.now();
  const updatedAtMs = typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : createdAtMs;
  const playCount = typeof raw.playCount === 'number' ? raw.playCount : 0;

  let ballSpawner: { x: number; y: number } | null = null;
  if (raw.ballSpawner && typeof raw.ballSpawner === 'object') {
    const s = raw.ballSpawner as { x?: unknown; y?: unknown };
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      ballSpawner = { x: s.x, y: s.y };
    }
  }

  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .slice(0, 100)
        .map((p, idx) => ({
          id: typeof p.id === 'string' ? p.id : `platform-${idx}`,
          x: typeof p.x === 'number' ? p.x : 0,
          y: typeof p.y === 'number' ? p.y : 0,
          width: typeof p.width === 'number' ? p.width : DEFAULT_PLATFORM_WIDTH,
          height: typeof p.height === 'number' ? p.height : DEFAULT_PLATFORM_HEIGHT,
          rotation: typeof p.rotation === 'number' ? p.rotation : 0,
          scale: typeof p.scale === 'number' ? Math.min(3, Math.max(0.5, p.scale)) : 1,
          isFinish: p.isFinish === true,
        }))
    : [];

  const bombs = Array.isArray(raw.bombs)
    ? raw.bombs
        .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
        .slice(0, 50)
        .map((b, idx) => ({
          id: typeof b.id === 'string' ? b.id : `bomb-${idx}`,
          x: typeof b.x === 'number' ? b.x : 0,
          y: typeof b.y === 'number' ? b.y : 0,
          rotation: typeof b.rotation === 'number' ? b.rotation : 0,
          scale: typeof b.scale === 'number' ? Math.min(3, Math.max(0.5, b.scale)) : 1,
        }))
    : [];

  if (!authorUsername) return null;

  return {
    id,
    name,
    description,
    authorUsername,
    visibility,
    createdAtMs,
    updatedAtMs,
    playCount,
    screenScroll,
    skyColor,
    ballSpawner,
    platforms: platforms.filter((p) => p.id !== SPAWNER_PLATFORM_ID),
    bombs,
    archived: raw.archived === true,
  };
}
