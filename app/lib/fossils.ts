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
export const FOSSIL_PICKUP_RADIUS = 18;
export const FOSSIL_SPAWN_COUNT = 12;

export interface FossilPickup {
  id: string;
  type: FossilTypeId;
  x: number;
  y: number;
  collected: boolean;
}

/** Deterministic fossil spawn positions along the long platform. */
export function createFossilPickups(worldWidth: number = FOSSIL_WORLD_WIDTH): FossilPickup[] {
  const margin = 180;
  const usable = worldWidth - margin * 2;
  const pickups: FossilPickup[] = [];
  for (let i = 0; i < FOSSIL_SPAWN_COUNT; i++) {
    const t = (i + 0.5) / FOSSIL_SPAWN_COUNT;
    const type = FOSSIL_TYPES[i % FOSSIL_TYPES.length];
    pickups.push({
      id: `fossil-${i}-${type}`,
      type,
      x: margin + t * usable,
      y: FOSSIL_PLATFORM_Y - FOSSIL_PICKUP_RADIUS - 8,
      collected: false,
    });
  }
  return pickups;
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
