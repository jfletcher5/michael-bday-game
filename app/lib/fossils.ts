/**
 * Fossil Exploration constants and helpers (MIE-31).
 * Crafting recipes / 5 event balls are deferred to a follow-up ticket.
 */

import type { FossilTypeId } from './types';

/** Ordered fossil piece types used for spawn tables and inventory UI. */
export const FOSSIL_TYPES: FossilTypeId[] = ['amber', 'bone', 'shell', 'claw', 'fern'];

export const FOSSIL_TYPE_META: Record<
  FossilTypeId,
  { label: string; emoji: string; color: string }
> = {
  amber: { label: 'Amber', emoji: '🟠', color: '#f59e0b' },
  bone: { label: 'Bone', emoji: '🦴', color: '#f5f5f4' },
  shell: { label: 'Shell', emoji: '🐚', color: '#fda4af' },
  claw: { label: 'Claw', emoji: '🦖', color: '#a8a29e' },
  fern: { label: 'Fern', emoji: '🌿', color: '#4ade80' },
};

/** Wide exploration world (camera follows the ball horizontally). */
export const FOSSIL_WORLD_WIDTH = 3200;
export const FOSSIL_WORLD_HEIGHT = 520;
export const FOSSIL_PLATFORM_Y = 400;
export const FOSSIL_PLATFORM_HEIGHT = 24;
/** @deprecated Floating pickup radius — mineables use FOSSIL_MINEABLE_HIT_RADIUS (MIE-34). */
export const FOSSIL_PICKUP_RADIUS = 18;
export const FOSSIL_SPAWN_COUNT = 12;

/** Click/tap hit radius around each mineable center (MIE-34). */
export const FOSSIL_MINEABLE_HIT_RADIUS = 40;

/** Chance a mine attempt awards one random fossil piece (MIE-34). */
export const FOSSIL_MINE_SUCCESS_CHANCE = 0.2;

/** World objects the player clicks to mine for fossils (MIE-34). */
export type MineableKind = 'plant' | 'rock' | 'tree';

export interface MineableNode {
  id: string;
  kind: MineableKind;
  x: number;
  y: number;
  mined: boolean;
}

const MINEABLE_KINDS: MineableKind[] = ['plant', 'rock', 'tree'];

/** Deterministic mineable spawn positions along the long platform (MIE-34). */
export function createMineables(worldWidth: number = FOSSIL_WORLD_WIDTH): MineableNode[] {
  const margin = 180;
  const usable = worldWidth - margin * 2;
  const nodes: MineableNode[] = [];
  for (let i = 0; i < FOSSIL_SPAWN_COUNT; i++) {
    const t = (i + 0.5) / FOSSIL_SPAWN_COUNT;
    const kind = MINEABLE_KINDS[i % MINEABLE_KINDS.length];
    nodes.push({
      id: `mineable-${i}-${kind}`,
      kind,
      x: margin + t * usable,
      y: FOSSIL_PLATFORM_Y - 28,
      mined: false,
    });
  }
  return nodes;
}

/** Pick a random fossil type with equal weight (used on successful mine roll). */
export function pickRandomFossilType(rng: () => number = Math.random): FossilTypeId {
  const index = Math.floor(rng() * FOSSIL_TYPES.length);
  return FOSSIL_TYPES[index];
}

/** Hit-test screen pointer against unmined nodes in world space (MIE-34). */
export function findMineableAtWorldPoint(
  nodes: MineableNode[],
  worldX: number,
  worldY: number,
  hitRadius: number = FOSSIL_MINEABLE_HIT_RADIUS,
): MineableNode | null {
  for (const node of nodes) {
    if (node.mined) continue;
    if (Math.hypot(worldX - node.x, worldY - node.y) <= hitRadius) return node;
  }
  return null;
}

/** Convert canvas client coords to world coords (accounts for camera + zoom). */
export function screenToFossilWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  cameraX: number,
  zoom: number,
): { worldX: number; worldY: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  const width = canvas.width;
  const height = canvas.height;
  // Inverse of render transform: translate(cx,cy) → scale(z) → translate(-cx,-cy) → draw at (wx-camX, wy)
  const worldX = (canvasX - width / 2) / zoom + width / 2 + cameraX;
  const worldY = (canvasY - height / 2) / zoom + height / 2;
  return { worldX, worldY };
}

/** Clamp camera X so the viewport stays inside the exploration world. */
export function clampFossilCameraX(
  ballX: number,
  viewportWidth: number,
  worldWidth: number = FOSSIL_WORLD_WIDTH,
): number {
  const half = viewportWidth / 2;
  const maxX = Math.max(0, worldWidth - viewportWidth);
  return Math.max(0, Math.min(maxX, ballX - half));
}

/** Merge one collected piece into an inventory map (immutable). */
export function addFossilToInventory(
  inventory: Partial<Record<FossilTypeId, number>> | undefined,
  type: FossilTypeId,
  amount = 1,
): Partial<Record<FossilTypeId, number>> {
  const next = { ...(inventory ?? {}) };
  next[type] = (next[type] ?? 0) + amount;
  return next;
}

/** Total pieces across all fossil types (for HUD). */
export function countFossilInventory(
  inventory: Partial<Record<FossilTypeId, number>> | undefined,
): number {
  if (!inventory) return 0;
  return FOSSIL_TYPES.reduce((sum, type) => sum + (inventory[type] ?? 0), 0);
}
