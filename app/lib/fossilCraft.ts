/**
 * Fossil Craft Machine helpers (MIE-32).
 * Players combine two fossils into one event ball after a 30-minute real-time craft.
 */

import type { BallType, FossilBallId, FossilCraftJob, FossilTypeId } from './types';
import { FOSSIL_TYPE_META, FOSSIL_TYPES, matchFossilRecipe } from './fossils';

/** Real-time craft duration — continues while logged out (MIE-32). */
export const FOSSIL_CRAFT_DURATION_MS = 30 * 60 * 1000;

/** Crafted fossil-event balls — shop/craft-only, not coin-purchasable (MIE-32). */
export const FOSSIL_BALLS: BallType[] = [
  {
    id: 'deadility',
    name: 'Deadility',
    price: 0,
    color: '#3f3f46',
    strokeColor: '#18181b',
    isDefault: false,
    imageUrl: '/fossil-balls/deadility.svg',
    imageCover: true,
    description: 'Crafted from two Amber fossils. Ancient and ominous!',
  },
  {
    id: 'rockylity',
    name: 'Rockylity',
    price: 0,
    color: '#78716c',
    strokeColor: '#44403c',
    isDefault: false,
    imageUrl: '/fossil-balls/rockylity.svg',
    imageCover: true,
    description: 'Crafted from Amber + Shell fossils. Rocky and rugged!',
  },
  {
    id: 'swimtility',
    name: 'Swimtility',
    price: 0,
    color: '#0ea5e9',
    strokeColor: '#0369a1',
    isDefault: false,
    imageUrl: '/fossil-balls/swimtility.svg',
    imageCover: true,
    description: 'Crafted from Fern + Bone fossils. Made for prehistoric waters!',
  },
  {
    id: 'ancienty',
    name: 'Ancienty',
    price: 0,
    color: '#a16207',
    strokeColor: '#713f12',
    isDefault: false,
    imageUrl: '/fossil-balls/ancienty.svg',
    imageCover: true,
    description: 'Crafted from Bone + Claw fossils. A relic from the dawn of time!',
  },
  {
    id: 'fossility',
    name: 'Fossility',
    price: 0,
    color: '#65a30d',
    strokeColor: '#3f6212',
    isDefault: false,
    imageUrl: '/fossil-balls/fossility.svg',
    imageCover: true,
    description: 'Crafted from Fern + Amber fossils. The classic fossil ball!',
  },
];

const FOSSIL_BALL_BY_ID = new Map(FOSSIL_BALLS.map((ball) => [ball.id, ball]));

export function getFossilBallById(ballId: string): BallType | undefined {
  return FOSSIL_BALL_BY_ID.get(ballId as FossilBallId);
}

/** Craft slot selection state for the Fossil Craft Machine UI. */
export interface FossilCraftSelection {
  selectedA: FossilTypeId | null;
  selectedB: FossilTypeId | null;
}

/**
 * Toggle a fossil type in the craft machine selection (MIE-39).
 * Same-type pairs need two inventory copies — second tap fills slot B instead of deselecting.
 */
export function toggleFossilSelection(
  current: FossilCraftSelection,
  type: FossilTypeId,
  inventory: Partial<Record<FossilTypeId, number>> | undefined,
): FossilCraftSelection {
  const { selectedA, selectedB } = current;
  const count = inventory?.[type] ?? 0;

  if (selectedA === type) {
    // Second tap on same type: fill slot B when player has 2+ copies (Amber + Amber).
    if (!selectedB && count >= 2) {
      return { selectedA: type, selectedB: type };
    }
    // Both slots hold this type — clear the pair.
    if (selectedB === type) {
      return { selectedA: null, selectedB: null };
    }
    // Mixed pair — deselect slot A only.
    return { selectedA: null, selectedB };
  }

  if (selectedB === type) {
    return { selectedA, selectedB: null };
  }

  if (!selectedA) {
    return { selectedA: type, selectedB: null };
  }
  if (!selectedB) {
    return { selectedA, selectedB: type };
  }
  // Both slots full — replace slot B.
  return { selectedA, selectedB: type };
}

/** Human-readable recipe label for the craft machine UI. */
export function formatFossilRecipe(fossilA: FossilTypeId, fossilB: FossilTypeId): string {
  const metaA = FOSSIL_TYPE_META[fossilA];
  const metaB = FOSSIL_TYPE_META[fossilB];
  return `${metaA.label} + ${metaB.label}`;
}

/** True when the player holds at least one of each fossil type. */
export function hasFossilsForCraft(
  inventory: Partial<Record<FossilTypeId, number>> | undefined,
  fossilA: FossilTypeId,
  fossilB: FossilTypeId,
): boolean {
  const countA = inventory?.[fossilA] ?? 0;
  const countB = inventory?.[fossilB] ?? 0;
  if (fossilA === fossilB) return countA >= 2;
  return countA >= 1 && countB >= 1;
}

/** Build a craft job from two fossils — caller must validate recipe + inventory. */
export function createFossilCraftJob(
  fossilA: FossilTypeId,
  fossilB: FossilTypeId,
  nowMs: number = Date.now(),
): FossilCraftJob {
  const resultBallId = matchFossilRecipe(fossilA, fossilB);
  if (!resultBallId) throw new Error('Invalid fossil recipe');
  return {
    fossilA,
    fossilB,
    resultBallId,
    startedAtMs: nowMs,
    endsAtMs: nowMs + FOSSIL_CRAFT_DURATION_MS,
  };
}

/** Deduct the two fossils used to start a craft (immutable inventory copy). */
export function deductFossilsForCraft(
  inventory: Partial<Record<FossilTypeId, number>> | undefined,
  fossilA: FossilTypeId,
  fossilB: FossilTypeId,
): Partial<Record<FossilTypeId, number>> {
  const next = { ...(inventory ?? {}) };
  next[fossilA] = (next[fossilA] ?? 0) - 1;
  next[fossilB] = (next[fossilB] ?? 0) - 1;
  if (next[fossilA]! <= 0) delete next[fossilA];
  if (next[fossilB]! <= 0) delete next[fossilB];
  return next;
}

/** Craft timer helpers — completion is based on wall-clock endsAtMs (MIE-32). */
export function isFossilCraftComplete(job: FossilCraftJob | null | undefined, nowMs: number): boolean {
  if (!job) return false;
  return nowMs >= job.endsAtMs;
}

export function getFossilCraftRemainingMs(job: FossilCraftJob, nowMs: number): number {
  return Math.max(0, job.endsAtMs - nowMs);
}

/** mm:ss countdown for the craft machine HUD. */
export function formatCraftTimeLeft(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** List recipes with labels for the craft machine reference panel. */
export function listFossilCraftRecipes(): Array<{
  fossilA: FossilTypeId;
  fossilB: FossilTypeId;
  ballId: FossilBallId;
  ballName: string;
}> {
  const seen = new Set<string>();
  const rows: Array<{
    fossilA: FossilTypeId;
    fossilB: FossilTypeId;
    ballId: FossilBallId;
    ballName: string;
  }> = [];

  for (const fossilA of FOSSIL_TYPES) {
    for (const fossilB of FOSSIL_TYPES) {
      const key = [fossilA, fossilB].sort().join('+');
      if (seen.has(key)) continue;
      const ballId = matchFossilRecipe(fossilA, fossilB);
      if (!ballId) continue;
      seen.add(key);
      rows.push({
        fossilA,
        fossilB,
        ballId,
        ballName: getFossilBallById(ballId)?.name ?? ballId,
      });
    }
  }

  return rows;
}
