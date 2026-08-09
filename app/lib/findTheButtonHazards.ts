/**
 * Find the Button — hazards: lasers, trapdoors, deadly blocks, and the death plane.
 *
 * All timing is driven by an explicit `timeMs` argument rather than a clock, so
 * every behaviour here is reproducible in a test and the renderer stays the only
 * thing that knows what "now" is.
 */

import {
  VoxelWorld,
  Vec3,
  Block,
  LaserEmitter,
  TrapDoorSpec,
  HazardSet,
  isDeadlyBlock,
} from './findTheButton';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from './findTheButtonPhysics';

/** Fall below this Y and the player dies. Well under any floor. */
export const DEATH_Y = -8;

/** How thick a laser beam is, in blocks — thin enough to duck or step over. */
export const LASER_THICKNESS = 0.25;

export type DeathCause = 'fell' | 'lava' | 'spikes' | 'laser';

/** Whether a laser is firing at this instant. */
export function isLaserOn(laser: LaserEmitter, timeMs: number): boolean {
  const period = laser.onMs + laser.offMs;
  if (period <= 0) return true;
  // Keep the modulo positive even if a phase offset pushes the value negative.
  const t = (((timeMs + laser.phaseMs) % period) + period) % period;
  return t < laser.onMs;
}

/** World-space bounds of a beam, as [min, max]. */
export function laserBounds(laser: LaserEmitter): { min: Vec3; max: Vec3 } {
  const half = LASER_THICKNESS / 2;
  const centreY = laser.origin.y + 0.5;
  const centreOther = (laser.axis === 'x' ? laser.origin.z : laser.origin.x) + 0.5;

  if (laser.axis === 'x') {
    return {
      min: { x: laser.origin.x, y: centreY - half, z: centreOther - half },
      max: { x: laser.origin.x + laser.length, y: centreY + half, z: centreOther + half },
    };
  }
  return {
    min: { x: centreOther - half, y: centreY - half, z: laser.origin.z },
    max: { x: centreOther + half, y: centreY + half, z: laser.origin.z + laser.length },
  };
}

/** Whether the player's box overlaps a firing beam. */
export function playerHitsLaser(
  playerFeet: Vec3,
  laser: LaserEmitter,
  timeMs: number
): boolean {
  if (!isLaserOn(laser, timeMs)) return false;

  const half = PLAYER_WIDTH / 2;
  const { min, max } = laserBounds(laser);

  return (
    playerFeet.x - half < max.x &&
    playerFeet.x + half > min.x &&
    playerFeet.y < max.y &&
    playerFeet.y + PLAYER_HEIGHT > min.y &&
    playerFeet.z - half < max.z &&
    playerFeet.z + half > min.z
  );
}

/**
 * Whether the player is touching lava or spikes.
 *
 * Deadly blocks are solid, so a player who walks onto one lands on top of it
 * and never overlaps it. The scan therefore starts just *below* the feet — you
 * die by standing on lava, not only by being buried in it.
 */
export function playerTouchesDeadlyBlock(
  world: VoxelWorld,
  playerFeet: Vec3
): DeathCause | null {
  const half = PLAYER_WIDTH / 2;
  const minX = Math.floor(playerFeet.x - half);
  const maxX = Math.floor(playerFeet.x + half);
  const minY = Math.floor(playerFeet.y - 0.05);
  const maxY = Math.floor(playerFeet.y + PLAYER_HEIGHT);
  const minZ = Math.floor(playerFeet.z - half);
  const maxZ = Math.floor(playerFeet.z + half);

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const block = world.get(x, y, z);
        if (!isDeadlyBlock(block)) continue;
        return block === Block.Lava ? 'lava' : 'spikes';
      }
    }
  }
  return null;
}

export interface TrapDoorState {
  /** When the player first stepped on it, or null if untouched. */
  steppedAtMs: number | null;
  /** When it opened, or null while still closed. */
  openedAtMs: number | null;
}

export function createTrapDoorStates(specs: TrapDoorSpec[]): TrapDoorState[] {
  return specs.map(() => ({ steppedAtMs: null, openedAtMs: null }));
}

export function isTrapDoorOpen(state: TrapDoorState): boolean {
  return state.openedAtMs !== null;
}

/** Whether the player's feet are on top of any tile of this panel. */
export function isStandingOnTrapDoor(spec: TrapDoorSpec, playerFeet: Vec3): boolean {
  const half = PLAYER_WIDTH / 2;
  const minX = Math.floor(playerFeet.x - half);
  const maxX = Math.floor(playerFeet.x + half);
  const minZ = Math.floor(playerFeet.z - half);
  const maxZ = Math.floor(playerFeet.z + half);
  // The tile directly beneath the player's feet.
  const footY = Math.floor(playerFeet.y - 0.05);

  return spec.tiles.some(
    (tile) =>
      tile.y === footY && tile.x >= minX && tile.x <= maxX && tile.z >= minZ && tile.z <= maxZ
  );
}

/**
 * Advance every trapdoor and write the result into the world.
 *
 * The world is mutated (tiles become Air when open, solid again when reset) so
 * collision needs no special case — an open trapdoor is simply not there.
 * Returns true if any panel changed state, so the renderer can re-sync.
 */
export function stepTrapDoors(
  world: VoxelWorld,
  specs: TrapDoorSpec[],
  states: TrapDoorState[],
  playerFeet: Vec3,
  timeMs: number
): boolean {
  let changed = false;

  specs.forEach((spec, i) => {
    const state = states[i];

    if (state.openedAtMs !== null) {
      // Open — close again once the window elapses, but never under the player,
      // or they would be shoved inside a solid block.
      if (timeMs - state.openedAtMs >= spec.openMs && !isStandingOnTrapDoor(spec, playerFeet)) {
        state.openedAtMs = null;
        state.steppedAtMs = null;
        spec.tiles.forEach((t) => world.set(t.x, t.y, t.z, Block.TrapDoor));
        changed = true;
      }
      return;
    }

    if (state.steppedAtMs === null) {
      if (isStandingOnTrapDoor(spec, playerFeet)) {
        state.steppedAtMs = timeMs;
        changed = true; // starts the shake tell
      }
      return;
    }

    if (timeMs - state.steppedAtMs >= spec.triggerMs) {
      state.openedAtMs = timeMs;
      spec.tiles.forEach((t) => world.set(t.x, t.y, t.z, Block.Air));
      changed = true;
    }
  });

  return changed;
}

/** Whether a stepped-on trapdoor is counting down, for the wobble animation. */
export function isTrapDoorArming(state: TrapDoorState): boolean {
  return state.steppedAtMs !== null && state.openedAtMs === null;
}

/**
 * Everything that can kill the player this frame, in priority order.
 * Returns null when they are fine.
 */
export function checkDeath(
  world: VoxelWorld,
  playerFeet: Vec3,
  hazards: HazardSet,
  timeMs: number
): DeathCause | null {
  if (playerFeet.y < DEATH_Y) return 'fell';

  const touched = playerTouchesDeadlyBlock(world, playerFeet);
  if (touched) return touched;

  for (const laser of hazards.lasers) {
    if (playerHitsLaser(playerFeet, laser, timeMs)) return 'laser';
  }
  return null;
}

export const DEATH_MESSAGES: Record<DeathCause, string> = {
  fell: 'You fell.',
  lava: 'Burned to a crisp.',
  spikes: 'Landed on spikes.',
  laser: 'Sliced by a laser.',
};
