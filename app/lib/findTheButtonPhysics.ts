/**
 * Find the Button — first-person movement and collision (concept spike).
 *
 * Hand-rolled AABB sweep against the voxel grid. The player is an axis-aligned
 * box that never rotates, so each axis can be resolved independently: move on
 * one axis, and if the box now overlaps a solid block, undo that axis and zero
 * its velocity. Resolving X and Z before Y is what lets the player slide along
 * walls and land cleanly on top of blocks.
 *
 * Pure functions — no three.js, no React — so the tricky parts stay testable.
 */

import { VoxelWorld, Vec3 } from './findTheButton';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
/** Camera offset above the player's feet. */
export const EYE_HEIGHT = 1.62;

export const GRAVITY = -28;
export const JUMP_SPEED = 9;
export const WALK_SPEED = 5;
/** Max seconds simulated in one step, so a backgrounded tab cannot tunnel. */
export const MAX_STEP = 0.05;

export interface PlayerState {
  /** Feet position — the centre of the box on X/Z, its base on Y. */
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
}

export interface MoveInput {
  /** -1 back, +1 forward. */
  forward: number;
  /** -1 left, +1 right. */
  right: number;
  jump: boolean;
}

export function createPlayer(spawn: Vec3): PlayerState {
  return {
    position: { ...spawn },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
  };
}

/** Whether the player box centred at (x, y, z) overlaps any solid block. */
export function collides(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const half = PLAYER_WIDTH / 2;
  const minX = Math.floor(x - half);
  const maxX = Math.floor(x + half);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + PLAYER_HEIGHT);
  const minZ = Math.floor(z - half);
  const maxZ = Math.floor(z + half);

  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (world.isSolid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/**
 * Advance the player by `dt` seconds.
 *
 * `yaw` is the camera's heading in radians (0 looks down -Z, matching three.js),
 * used to turn stick/WASD input into world-space movement.
 */
export function stepPlayer(
  world: VoxelWorld,
  state: PlayerState,
  input: MoveInput,
  yaw: number,
  dt: number
): PlayerState {
  const step = Math.min(dt, MAX_STEP);

  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let dx = input.right * cos - input.forward * sin;
  let dz = input.right * sin + input.forward * cos;

  // Normalise so diagonal input is not faster than cardinal input.
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }

  const velocity: Vec3 = {
    x: dx * WALK_SPEED,
    y: state.velocity.y + GRAVITY * step,
    z: dz * WALK_SPEED,
  };

  if (input.jump && state.onGround) {
    velocity.y = JUMP_SPEED;
  }

  let { x, y, z } = state.position;

  // X axis
  const nextX = x + velocity.x * step;
  if (collides(world, nextX, y, z)) {
    velocity.x = 0;
  } else {
    x = nextX;
  }

  // Z axis
  const nextZ = z + velocity.z * step;
  if (collides(world, x, y, nextZ)) {
    velocity.z = 0;
  } else {
    z = nextZ;
  }

  // Y axis — landing on a surface is the only way to regain onGround.
  let onGround = false;
  const nextY = y + velocity.y * step;
  if (collides(world, x, nextY, z)) {
    if (velocity.y < 0) onGround = true;
    velocity.y = 0;
  } else {
    y = nextY;
  }

  return { position: { x, y, z }, velocity, onGround };
}

export interface RayHit {
  /** Block coordinate that was hit. */
  block: Vec3;
  blockId: number;
  distance: number;
}

/**
 * March a ray through the grid and return the first solid block.
 *
 * Fixed-step sampling rather than DDA — at a 0.05 step the shortest block face
 * is 20 samples across, which is ample for pointing at a button, and it keeps
 * the spike short.
 */
export function raycastVoxel(
  world: VoxelWorld,
  origin: Vec3,
  direction: Vec3,
  maxDistance = 6
): RayHit | null {
  const stepSize = 0.05;
  const steps = Math.ceil(maxDistance / stepSize);

  for (let i = 1; i <= steps; i++) {
    const distance = i * stepSize;
    const bx = Math.floor(origin.x + direction.x * distance);
    const by = Math.floor(origin.y + direction.y * distance);
    const bz = Math.floor(origin.z + direction.z * distance);

    if (world.isSolid(bx, by, bz)) {
      return { block: { x: bx, y: by, z: bz }, blockId: world.get(bx, by, bz), distance };
    }
  }
  return null;
}
