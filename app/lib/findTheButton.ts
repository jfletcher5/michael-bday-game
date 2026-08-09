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
  Brick = 7,
  Plaster = 8,
  Planks = 9,
  Tile = 10,
}

/**
 * Tint applied on top of each block's texture. Kept near-white for textured
 * blocks so the painted detail shows through unmodified.
 */
export const BLOCK_COLORS: Record<number, string> = {
  [Block.Stone]: '#8d8d97',
  [Block.Grass]: '#5aa459',
  [Block.Wood]: '#a9743f',
  [Block.Metal]: '#6b7a8f',
  [Block.Lamp]: '#ffe9a3',
  [Block.Button]: '#e2483d',
  [Block.Brick]: '#ffffff',
  [Block.Plaster]: '#ffffff',
  [Block.Planks]: '#ffffff',
  [Block.Tile]: '#ffffff',
};

/** Blocks that should render at full brightness rather than take lighting. */
export function isEmissiveBlock(block: number): boolean {
  return block === Block.Lamp;
}

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
  /**
   * Camera heading at spawn, in radians. Yaw 0 looks down -Z (three.js
   * convention), so PI faces +Z. Set this so the player starts looking into the
   * space instead of at the wall behind them.
   */
  spawnYaw: number;
  /** Block coordinate of the goal button. */
  button: Vec3;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  build: () => ConceptScene;
}

/**
 * Concept — a furnished interior: four rooms off a cross-shaped partition,
 * connected by doorways. Textured brick outer walls, plaster partitions, plank
 * floor, tiled ceiling. The button is mounted on a back wall behind crates.
 */
function buildInterior(): ConceptScene {
  const W = 28;
  const H = 7;
  const D = 28;
  const world = new VoxelWorld(W, H, D);

  const wallTop = H - 2; // walls run y=1..5, ceiling sits at y=6

  world.fill(0, 0, 0, W - 1, 0, D - 1, Block.Planks);
  world.fill(0, H - 1, 0, W - 1, H - 1, D - 1, Block.Tile);

  // Outer shell.
  world.fill(0, 1, 0, W - 1, wallTop, 0, Block.Brick);
  world.fill(0, 1, D - 1, W - 1, wallTop, D - 1, Block.Brick);
  world.fill(0, 1, 0, 0, wallTop, D - 1, Block.Brick);
  world.fill(W - 1, 1, 0, W - 1, wallTop, D - 1, Block.Brick);

  // Cross partition splitting the floor into four rooms.
  world.fill(13, 1, 1, 13, wallTop, D - 2, Block.Plaster);
  world.fill(1, 1, 13, W - 2, wallTop, 13, Block.Plaster);

  // Doorways — two blocks wide, three high, so they read as openings not holes.
  world.fill(13, 1, 5, 13, 3, 6, Block.Air);
  world.fill(13, 1, 20, 13, 3, 21, Block.Air);
  world.fill(5, 1, 13, 6, 3, 13, Block.Air);
  world.fill(20, 1, 13, 21, 3, 13, Block.Air);

  // Ceiling lamps, one per room.
  for (const [lx, lz] of [
    [6, 6],
    [20, 6],
    [6, 20],
    [20, 20],
  ]) {
    world.set(lx, wallTop, lz, Block.Lamp);
  }

  // Furniture: stacked crates and a metal bench, giving each room a silhouette
  // and something to break line of sight.
  world.fill(3, 1, 8, 4, 2, 9, Block.Wood);
  world.fill(9, 1, 3, 10, 1, 4, Block.Wood);
  world.fill(18, 1, 4, 20, 1, 4, Block.Metal);
  world.fill(23, 1, 8, 24, 2, 8, Block.Wood);
  world.fill(4, 1, 17, 5, 1, 19, Block.Metal);
  world.fill(8, 1, 23, 9, 2, 24, Block.Wood);

  // Back-right room: crates screen the button from the doorway.
  world.fill(21, 1, 24, 22, 2, 26, Block.Wood);
  world.fill(25, 1, 22, 26, 2, 22, Block.Wood);

  const button = { x: 24, y: 2, z: 26 };
  world.set(button.x, button.y, button.z, Block.Button);

  return { world, spawn: { x: 3.5, y: 1, z: 3.5 }, spawnYaw: Math.PI, button };
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
  return { world, spawn: { x: 3.5, y: 1, z: 3.5 }, spawnYaw: Math.PI, button };
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
  return { world, spawn: { x: 1.5, y: 1, z: 1.5 }, spawnYaw: Math.PI, button };
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
  return { world, spawn: { x: 12.5, y: 1, z: 1.5 }, spawnYaw: Math.PI, button };
}

export const CONCEPTS: Concept[] = [
  {
    id: 'interior',
    name: 'Interior',
    description: 'Four textured rooms off a central partition. The button hides behind crates.',
    build: buildInterior,
  },
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
