/**
 * Find the Button — voxel world model (concept spike).
 *
 * A block world is a flat Uint8Array of block ids addressed as [x, y, z].
 * Y is up. Positions are in block units; block (x,y,z) occupies the cube from
 * (x, y, z) to (x+1, y+1, z+1) in world space.
 *
 * This module is pure data + generation so it stays testable and reusable when
 * the spike becomes the real game.
 */

export const enum Block {
  Air = 0,
  Stone = 1,
  Grass = 2,
  Wood = 3,
  Metal = 4,
  Lamp = 5,
  Button = 6,
}

/** Face colors used by the instanced renderer, indexed by block id. */
export const BLOCK_COLORS: Record<number, string> = {
  [Block.Stone]: '#8d8d97',
  [Block.Grass]: '#5aa459',
  [Block.Wood]: '#a9743f',
  [Block.Metal]: '#6b7a8f',
  [Block.Lamp]: '#ffe9a3',
  [Block.Button]: '#e2483d',
};

/** Blocks that do not stop movement. */
export function isSolidBlock(block: number): boolean {
  return block !== Block.Air;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class VoxelWorld {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  private readonly data: Uint8Array;

  constructor(sizeX: number, sizeY: number, sizeZ: number) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.data = new Uint8Array(sizeX * sizeY * sizeZ);
  }

  private index(x: number, y: number, z: number): number {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ
    );
  }

  /** Out-of-bounds reads return Air above the world and Stone below the floor. */
  get(x: number, y: number, z: number): number {
    if (y < 0) return Block.Stone;
    if (!this.inBounds(x, y, z)) return Block.Air;
    return this.data[this.index(x, y, z)];
  }

  set(x: number, y: number, z: number, block: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = block;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return isSolidBlock(this.get(x, y, z));
  }

  /** Whether every neighbour is solid, meaning this block is never visible. */
  isHidden(x: number, y: number, z: number): boolean {
    return (
      this.isSolid(x + 1, y, z) &&
      this.isSolid(x - 1, y, z) &&
      this.isSolid(x, y + 1, z) &&
      this.isSolid(x, y - 1, z) &&
      this.isSolid(x, y, z + 1) &&
      this.isSolid(x, y, z - 1)
    );
  }

  fill(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    block: number
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          this.set(x, y, z, block);
        }
      }
    }
  }

  /** Hollow box: walls, floor, and ceiling of the given extent. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    block: number
  ): void {
    this.fill(x0, y0, z0, x1, y1, z1, block);
    this.fill(x0 + 1, y0 + 1, z0 + 1, x1 - 1, y1 - 1, z1 - 1, Block.Air);
  }
}

export interface ConceptScene {
  world: VoxelWorld;
  /** Player feet position at spawn. */
  spawn: Vec3;
  /** Block coordinate of the goal button. */
  button: Vec3;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  build: () => ConceptScene;
}

/** Concept A — one open room, button tucked behind pillars. */
function buildRoom(): ConceptScene {
  const world = new VoxelWorld(24, 8, 24);
  world.box(0, 0, 0, 23, 7, 23, Block.Stone);
  world.fill(1, 0, 1, 22, 0, 22, Block.Grass);

  // Pillars that break sightlines so the button is not visible from spawn.
  for (const [px, pz] of [
    [6, 6],
    [6, 17],
    [17, 6],
    [17, 17],
    [12, 11],
  ]) {
    world.fill(px, 1, pz, px + 1, 6, pz + 1, Block.Wood);
  }

  world.set(4, 3, 12, Block.Lamp);
  world.set(19, 3, 12, Block.Lamp);

  const button = { x: 22, y: 2, z: 20 };
  world.set(button.x, button.y, button.z, Block.Button);
  return { world, spawn: { x: 3.5, y: 1, z: 3.5 }, button };
}

/** Concept B — grid maze; button sits in a dead end. */
function buildMaze(): ConceptScene {
  const world = new VoxelWorld(25, 6, 25);
  world.fill(0, 0, 0, 24, 0, 24, Block.Stone);
  world.fill(0, 1, 0, 24, 4, 24, Block.Stone);

  // Carve a simple grid of corridors, then knock out random connectors so the
  // layout is not a perfect lattice.
  for (let x = 1; x < 24; x += 2) {
    world.fill(x, 1, 1, x, 3, 23, Block.Air);
  }
  for (let z = 1; z < 24; z += 4) {
    world.fill(1, 1, z, 23, 3, z, Block.Air);
  }
  world.fill(0, 5, 0, 24, 5, 24, Block.Stone);

  for (let x = 3; x < 22; x += 6) {
    world.set(x, 3, 5, Block.Lamp);
    world.set(x, 3, 17, Block.Lamp);
  }

  const button = { x: 23, y: 2, z: 21 };
  world.fill(21, 1, 21, 23, 3, 21, Block.Air);
  world.set(button.x, button.y, button.z, Block.Button);
  return { world, spawn: { x: 1.5, y: 1, z: 1.5 }, button };
}

/** Concept C — stacked platforms; button requires climbing. */
function buildPlatforms(): ConceptScene {
  const world = new VoxelWorld(20, 16, 20);
  world.fill(0, 0, 0, 19, 0, 19, Block.Grass);

  const tiers: [number, number, number, number, number][] = [
    [2, 3, 2, 8, 8],
    [11, 6, 3, 17, 9],
    [4, 9, 10, 10, 16],
    [12, 12, 12, 17, 17],
  ];
  for (const [x0, y, z0, x1, z1] of tiers) {
    world.fill(x0, y, z0, x1, y, z1, Block.Wood);
  }

  // Stone steps up to the first tier so the spike is traversable without jumping puzzles.
  for (let i = 0; i < 3; i++) {
    world.fill(1 + i, 1 + i, 1, 1 + i, 1 + i, 3, Block.Stone);
  }
  world.set(6, 4, 5, Block.Lamp);
  world.set(14, 7, 6, Block.Lamp);
  world.set(7, 10, 13, Block.Lamp);

  const button = { x: 14, y: 13, z: 14 };
  world.set(button.x, button.y, button.z, Block.Button);
  // Spawn on open floor, away from the steps at x=1..3 — spawning inside them
  // wedges the player in a solid block.
  return { world, spawn: { x: 12.5, y: 1, z: 1.5 }, button };
}

export const CONCEPTS: Concept[] = [
  {
    id: 'room',
    name: 'Open Room',
    description: 'One big room. Pillars break sightlines so the button hides in plain view.',
    build: buildRoom,
  },
  {
    id: 'maze',
    name: 'Corridor Maze',
    description: 'Tight grid corridors. The button waits in a dead end.',
    build: buildMaze,
  },
  {
    id: 'platforms',
    name: 'Platform Climb',
    description: 'Stacked tiers. The button is high up — vertical search instead of flat.',
    build: buildPlatforms,
  },
];

export function getConcept(id: string): Concept {
  return CONCEPTS.find((c) => c.id === id) ?? CONCEPTS[0];
}
