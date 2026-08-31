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
  Lava = 11,
  Spikes = 12,
  TrapDoor = 13,
  Emitter = 14,
  Door = 15,
  LockPanel = 16,
}

/** Blocks that kill on contact. */
export function isDeadlyBlock(block: number): boolean {
  return block === Block.Lava || block === Block.Spikes;
}

/**
 * Trapdoor and door tiles are rendered separately from the static block mesh
 * because they open at runtime, so the static mesh must skip them.
 */
export function isDynamicBlock(block: number): boolean {
  return block === Block.TrapDoor || block === Block.Door;
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
  [Block.Lava]: '#ffffff',
  [Block.Spikes]: '#ffffff',
  [Block.TrapDoor]: '#ffffff',
  [Block.Emitter]: '#ffffff',
  [Block.Door]: '#ffffff',
  [Block.LockPanel]: '#ffffff',
};

/** Blocks that should render at full brightness rather than take lighting. */
export function isEmissiveBlock(block: number): boolean {
  return block === Block.Lamp || block === Block.Lava;
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

  /**
   * Out-of-bounds reads return Air.
   *
   * Nothing below y=0 either — a hole in the floor has to be a real hole, so
   * falling through one keeps going until the death plane catches it.
   */
  get(x: number, y: number, z: number): number {
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

export interface SpawnPoint {
  /** Player feet position. */
  position: Vec3;
  /**
   * Camera heading in radians. Yaw 0 looks down -Z (three.js convention), so PI
   * faces +Z. Set this so the player starts looking into the space instead of
   * at the wall behind them.
   */
  yaw: number;
  /** Shown on the HUD after a respawn so the player knows where they landed. */
  label: string;
}

/**
 * A blinking laser beam.
 *
 * The beam runs from `origin` along one axis for `length` blocks at a fixed
 * height. It cycles on for `onMs` then off for `offMs`; `phaseMs` shifts the
 * cycle so a row of emitters can fire in sequence rather than in unison.
 */
export interface LaserEmitter {
  origin: Vec3;
  axis: 'x' | 'z';
  length: number;
  onMs: number;
  offMs: number;
  phaseMs: number;
}

/**
 * A floor tile that drops away underfoot.
 *
 * Solid until the player stands on it, then opens after `triggerMs` and stays
 * open for `openMs` before resetting — so a wrong route is recoverable rather
 * than permanently sealing the level.
 */
export interface TrapDoorSpec {
  /** Tiles that open together as one panel. */
  tiles: Vec3[];
  triggerMs: number;
  openMs: number;
}

export interface HazardSet {
  lasers: LaserEmitter[];
  trapDoors: TrapDoorSpec[];
}

export const NO_HAZARDS: HazardSet = { lasers: [], trapDoors: [] };

/**
 * A combination lock gating a door.
 *
 * `code` is the digit string the player must enter on the keypad. `doorTiles`
 * are the Door blocks that open when the code is accepted; `panel` is the
 * LockPanel block the player aims at to bring up the keypad. `hint` is shown
 * on the keypad so the puzzle is solvable without leaving the level.
 */
export interface LockSpec {
  code: string;
  doorTiles: Vec3[];
  panel: Vec3;
  hint: string;
}

export interface ConceptScene {
  world: VoxelWorld;
  /**
   * Where the player can start. More than one means respawns move you around
   * the level instead of always resetting to the same corner.
   */
  spawns: SpawnPoint[];
  hazards: HazardSet;
  /** Block coordinate of the goal button. */
  button: Vec3;
  /** Combination lock gating the route to the button, if the level has one. */
  lock?: LockSpec;
}

/**
 * Open a lock's door: every door tile becomes Air, so collision, rendering,
 * and pathfinding all treat the doorway as open from that moment on.
 */
export function openDoor(world: VoxelWorld, lock: LockSpec): void {
  lock.doorTiles.forEach((t) => world.set(t.x, t.y, t.z, Block.Air));
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

  return {
    world,
    spawns: [
      { position: { x: 3.5, y: 1, z: 3.5 }, yaw: Math.PI, label: 'Front-left room' },
      { position: { x: 24.5, y: 1, z: 3.5 }, yaw: Math.PI, label: 'Front-right room' },
      { position: { x: 3.5, y: 1, z: 24.5 }, yaw: 0, label: 'Back-left room' },
    ],
    hazards: NO_HAZARDS,
    button,
  };
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
  return {
    world,
    spawns: [{ position: { x: 3.5, y: 1, z: 3.5 }, yaw: Math.PI, label: 'Corner' }],
    hazards: NO_HAZARDS,
    button,
  };
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
  return {
    world,
    spawns: [{ position: { x: 1.5, y: 1, z: 1.5 }, yaw: Math.PI, label: 'Maze entrance' }],
    hazards: NO_HAZARDS,
    button,
  };
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
  return {
    world,
    spawns: [{ position: { x: 12.5, y: 1, z: 1.5 }, yaw: Math.PI, label: 'Ground floor' }],
    hazards: NO_HAZARDS,
    button,
  };
}

// ---------------------------------------------------------------------------
// Expansive concepts — larger levels built around hazards and multiple spawns.
// ---------------------------------------------------------------------------

/**
 * Expansive Interior — "The Facility".
 *
 * A 44x44 building on two levels: a ring corridor patrolled by sweeping lasers,
 * side offices, a central atrium open to a basement, and a server room where
 * the button hides. Trapdoors sit in the corridor floor over the basement, so
 * the fast route is also the one that drops you.
 */
function buildFacility(): ConceptScene {
  const W = 44;
  const H = 14;
  const D = 44;
  const world = new VoxelWorld(W, H, D);

  const groundY = 4; // basement floor is y=0, ground floor slab at y=4
  const wallTop = groundY + 4;

  // Basement: lava pools at the bottom, so falling through anything hurts.
  world.fill(0, 0, 0, W - 1, 0, D - 1, Block.Stone);
  world.fill(6, 0, 6, 18, 0, 18, Block.Lava);
  world.fill(26, 0, 26, 38, 0, 38, Block.Lava);
  world.fill(1, 1, 1, W - 2, 1, D - 2, Block.Air);

  // Ground slab, then carve the atrium open to the basement below.
  world.fill(0, groundY, 0, W - 1, groundY, D - 1, Block.Tile);
  world.fill(18, groundY, 18, 25, groundY, 25, Block.Air);

  // Outer shell and ceiling.
  world.fill(0, groundY + 1, 0, W - 1, wallTop, 0, Block.Brick);
  world.fill(0, groundY + 1, D - 1, W - 1, wallTop, D - 1, Block.Brick);
  world.fill(0, groundY + 1, 0, 0, wallTop, D - 1, Block.Brick);
  world.fill(W - 1, groundY + 1, 0, W - 1, wallTop, D - 1, Block.Brick);
  world.fill(0, wallTop + 1, 0, W - 1, wallTop + 1, D - 1, Block.Tile);

  // Inner ring wall, forming a corridor between it and the outer wall.
  world.fill(8, groundY + 1, 8, 35, wallTop, 8, Block.Plaster);
  world.fill(8, groundY + 1, 35, 35, wallTop, 35, Block.Plaster);
  world.fill(8, groundY + 1, 8, 8, wallTop, 35, Block.Plaster);
  world.fill(35, groundY + 1, 8, 35, wallTop, 35, Block.Plaster);

  // Four doorways into the interior.
  world.fill(20, groundY + 1, 8, 23, groundY + 3, 8, Block.Air);
  world.fill(20, groundY + 1, 35, 23, groundY + 3, 35, Block.Air);
  world.fill(8, groundY + 1, 20, 8, groundY + 3, 23, Block.Air);
  world.fill(35, groundY + 1, 20, 35, groundY + 3, 23, Block.Air);

  // Interior partitions making a server room in the north-east quadrant.
  world.fill(24, groundY + 1, 9, 24, wallTop, 16, Block.Metal);
  world.fill(25, groundY + 1, 16, 34, wallTop, 16, Block.Metal);
  world.fill(28, groundY + 1, 16, 30, groundY + 3, 16, Block.Air); // server room door

  // Server racks — cover, and something to look behind.
  for (let rx = 27; rx <= 33; rx += 3) {
    world.fill(rx, groundY + 1, 10, rx, groundY + 3, 14, Block.Metal);
  }

  // Spike pits in the corridor corners.
  world.fill(3, groundY, 3, 5, groundY, 5, Block.Spikes);
  world.fill(38, groundY, 38, 40, groundY, 40, Block.Spikes);

  // Lighting.
  for (const [lx, lz] of [
    [4, 21],
    [21, 4],
    [39, 21],
    [21, 39],
    [30, 12],
    [12, 30],
  ]) {
    world.set(lx, wallTop, lz, Block.Lamp);
  }

  // Laser emitter housings, so the beams read as coming from something.
  const lasers: LaserEmitter[] = [];
  const addLaser = (
    origin: Vec3,
    axis: 'x' | 'z',
    length: number,
    phaseMs: number,
    onMs = 1800,
    offMs = 1400
  ) => {
    lasers.push({ origin, axis, length, onMs, offMs, phaseMs });
    world.set(origin.x, origin.y, origin.z, Block.Emitter);
    if (axis === 'x') world.set(origin.x + length, origin.y, origin.z, Block.Emitter);
    else world.set(origin.x, origin.y, origin.z + length, Block.Emitter);
  };

  // Corridor sweeps — staggered phases so there is always a gap somewhere.
  addLaser({ x: 1, y: groundY + 1, z: 4 }, 'x', 5, 0);
  addLaser({ x: 1, y: groundY + 1, z: 12 }, 'x', 5, 900);
  addLaser({ x: 1, y: groundY + 2, z: 28 }, 'x', 5, 1800);
  addLaser({ x: 37, y: groundY + 1, z: 16 }, 'x', 5, 500);
  addLaser({ x: 37, y: groundY + 2, z: 30 }, 'x', 5, 1300);
  addLaser({ x: 12, y: groundY + 1, z: 37 }, 'z', 5, 400);
  addLaser({ x: 28, y: groundY + 2, z: 37 }, 'z', 5, 1600);
  // Server room approach — the last obstacle before the button.
  addLaser({ x: 25, y: groundY + 1, z: 9 }, 'z', 6, 0, 2200, 1100);

  // Trapdoors in the corridor floor, dropping into the basement lava.
  const trapDoors: TrapDoorSpec[] = [
    {
      tiles: [
        { x: 14, y: groundY, z: 4 },
        { x: 15, y: groundY, z: 4 },
        { x: 14, y: groundY, z: 5 },
        { x: 15, y: groundY, z: 5 },
      ],
      triggerMs: 420,
      openMs: 4000,
    },
    {
      tiles: [
        { x: 39, y: groundY, z: 14 },
        { x: 39, y: groundY, z: 15 },
        { x: 40, y: groundY, z: 14 },
        { x: 40, y: groundY, z: 15 },
      ],
      triggerMs: 420,
      openMs: 4000,
    },
    {
      tiles: [
        { x: 21, y: groundY, z: 30 },
        { x: 22, y: groundY, z: 30 },
        { x: 21, y: groundY, z: 31 },
        { x: 22, y: groundY, z: 31 },
      ],
      triggerMs: 300,
      openMs: 4000,
    },
  ];
  trapDoors.forEach((spec) =>
    spec.tiles.forEach((t) => world.set(t.x, t.y, t.z, Block.TrapDoor))
  );

  const button = { x: 34, y: groundY + 2, z: 10 };
  world.set(button.x, button.y, button.z, Block.Button);

  return {
    world,
    spawns: [
      { position: { x: 3.5, y: groundY + 1, z: 21.5 }, yaw: -Math.PI / 2, label: 'West corridor' },
      { position: { x: 21.5, y: groundY + 1, z: 3.5 }, yaw: Math.PI, label: 'North corridor' },
      { position: { x: 40.5, y: groundY + 1, z: 21.5 }, yaw: Math.PI / 2, label: 'East corridor' },
      { position: { x: 21.5, y: groundY + 1, z: 40.5 }, yaw: 0, label: 'South corridor' },
    ],
    hazards: { lasers, trapDoors },
    button,
  };
}

/**
 * Expansive Maze — "The Catacombs".
 *
 * A 41x41 maze carved with a randomised depth-first walk, so the layout is a
 * real maze rather than a lattice. Lava channels flood some corridors, holes
 * drop into a pit below, and beams cover several junctions. The button sits at
 * the maze's furthest reachable cell from the entrance.
 */
function buildCatacombs(): ConceptScene {
  const cells = 20; // maze is cells x cells, each cell 2 blocks + wall
  const W = cells * 2 + 1;
  const D = cells * 2 + 1;
  const H = 8;
  const world = new VoxelWorld(W, H, D);

  // Solid rock, then carve.
  world.fill(0, 0, 0, W - 1, 0, D - 1, Block.Stone);
  world.fill(0, 1, 0, W - 1, 4, D - 1, Block.Stone);
  world.fill(0, 5, 0, W - 1, 5, D - 1, Block.Brick);

  // Deterministic maze carve — a fixed seed keeps the level identical run to run.
  let seed = 20260809;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };

  const visited = new Set<string>();
  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
  const carve = (cx: number, cz: number) => {
    world.fill(cx * 2 + 1, 1, cz * 2 + 1, cx * 2 + 1, 3, cz * 2 + 1, Block.Air);
  };

  // Iterative DFS — recursion would blow the stack on a large grid.
  const stack: { cx: number; cz: number }[] = [{ cx: 0, cz: 0 }];
  visited.add(cellKey(0, 0));
  carve(0, 0);

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];
    // Shuffle so each junction picks a different order.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    const next = dirs
      .map((d) => ({ cx: cur.cx + d.dx, cz: cur.cz + d.dz, d }))
      .find(
        (n) =>
          n.cx >= 0 && n.cz >= 0 && n.cx < cells && n.cz < cells && !visited.has(cellKey(n.cx, n.cz))
      );

    if (!next) {
      stack.pop();
      continue;
    }

    visited.add(cellKey(next.cx, next.cz));
    carve(next.cx, next.cz);
    // Knock out the wall between the two cells.
    const wallX = cur.cx * 2 + 1 + next.d.dx;
    const wallZ = cur.cz * 2 + 1 + next.d.dz;
    world.fill(wallX, 1, wallZ, wallX, 3, wallZ, Block.Air);
    stack.push({ cx: next.cx, cz: next.cz });
  }

  // Braid a few dead ends into loops so it is not purely a tree.
  for (let i = 0; i < 40; i++) {
    const cx = 1 + Math.floor(random() * (cells - 2));
    const cz = 1 + Math.floor(random() * (cells - 2));
    const horizontal = random() < 0.5;
    const wx = cx * 2 + 1 + (horizontal ? 1 : 0);
    const wz = cz * 2 + 1 + (horizontal ? 0 : 1);
    world.fill(wx, 1, wz, wx, 3, wz, Block.Air);
  }

  // Lava channels along a few corridors.
  const lavaSpots: [number, number][] = [
    [9, 5],
    [23, 11],
    [15, 27],
    [31, 19],
    [7, 33],
    [33, 31],
  ];
  for (const [lx, lz] of lavaSpots) {
    if (!world.isSolid(lx, 1, lz)) world.set(lx, 0, lz, Block.Lava);
    if (!world.isSolid(lx + 2, 1, lz)) world.set(lx + 2, 0, lz, Block.Lava);
  }

  // Holes straight through the floor into nothing.
  const holes: [number, number][] = [
    [13, 13],
    [27, 7],
    [11, 29],
    [29, 27],
    [19, 21],
  ];
  for (const [hx, hz] of holes) {
    if (!world.isSolid(hx, 1, hz)) world.set(hx, 0, hz, Block.Air);
  }

  // Lamps scattered so corridors are navigable but not evenly lit.
  for (let i = 0; i < 26; i++) {
    const lx = 1 + Math.floor(random() * (W - 2));
    const lz = 1 + Math.floor(random() * (D - 2));
    if (!world.isSolid(lx, 3, lz)) world.set(lx, 4, lz, Block.Lamp);
  }

  // Beams across a handful of junctions.
  const lasers: LaserEmitter[] = [];
  const junctions: [number, number, 'x' | 'z'][] = [
    [5, 9, 'x'],
    [17, 15, 'z'],
    [25, 25, 'x'],
    [9, 23, 'z'],
    [33, 13, 'x'],
    [21, 33, 'z'],
  ];
  junctions.forEach(([jx, jz, axis], i) => {
    lasers.push({
      origin: { x: jx, y: 1, z: jz },
      axis,
      length: 3,
      onMs: 1500,
      offMs: 1500,
      phaseMs: i * 380,
    });
  });

  // The button goes in the cell furthest from the entrance, by corridor distance.
  const startCell = { cx: 0, cz: 0 };
  const dist = new Map<string, number>([[cellKey(0, 0), 0]]);
  const queue: { cx: number; cz: number }[] = [startCell];
  let furthest = startCell;

  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cellKey(cur.cx, cur.cz))!;
    if (d > (dist.get(cellKey(furthest.cx, furthest.cz)) ?? 0)) furthest = cur;

    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.cx + dx;
      const nz = cur.cz + dz;
      if (nx < 0 || nz < 0 || nx >= cells || nz >= cells) continue;
      if (dist.has(cellKey(nx, nz))) continue;
      // Passable only if the wall between them was carved out.
      if (world.isSolid(cur.cx * 2 + 1 + dx, 1, cur.cz * 2 + 1 + dz)) continue;
      dist.set(cellKey(nx, nz), d + 1);
      queue.push({ cx: nx, cz: nz });
    }
  }

  const button = { x: furthest.cx * 2 + 1, y: 2, z: furthest.cz * 2 + 1 };
  world.set(button.x, button.y, button.z, Block.Button);
  // Make sure the button tile has floor under it rather than one of the holes.
  world.set(button.x, 0, button.z, Block.Stone);

  return {
    world,
    spawns: [
      // Corridors are carved on odd coordinates (cell c sits at 2c+1), so every
      // spawn must land on an odd block or it starts inside a wall.
      { position: { x: 1.5, y: 1, z: 1.5 }, yaw: Math.PI, label: 'North-west entrance' },
      { position: { x: (cells - 1) * 2 + 1.5, y: 1, z: 1.5 }, yaw: Math.PI, label: 'North-east entrance' },
      { position: { x: 1.5, y: 1, z: (cells - 1) * 2 + 1.5 }, yaw: 0, label: 'South-west entrance' },
    ],
    hazards: { lasers, trapDoors: [] },
    button,
  };
}

/**
 * Expansive Platforms — "The Spire".
 *
 * A tall shaft climbed by jumping between islands. There is no floor: miss a
 * jump and you fall past every tier to the death plane. Trapdoor platforms give
 * way if you linger, and beams cut across the gaps at the higher tiers.
 */
function buildSpire(): ConceptScene {
  const W = 34;
  // Tall enough for the summit: topY = 3 + tiers*4 = 47, plus wall and lamp above.
  const H = 56;
  const D = 34;
  const world = new VoxelWorld(W, H, D);

  // Ground ring only — the middle is open all the way down.
  world.fill(0, 0, 0, W - 1, 0, D - 1, Block.Stone);
  world.fill(5, 0, 5, W - 6, 0, D - 6, Block.Air);
  world.fill(8, 0, 8, W - 9, 0, D - 9, Block.Lava);

  const lasers: LaserEmitter[] = [];
  const trapDoors: TrapDoorSpec[] = [];

  // Spiral of islands climbing the shaft.
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const y = 3 + i * 4;
    const angle = i * 1.15;
    const radius = 11;
    const cx = Math.round(W / 2 + Math.cos(angle) * radius);
    const cz = Math.round(D / 2 + Math.sin(angle) * radius);

    // Alternate solid islands and trapdoor islands.
    const isTrap = i > 1 && i % 3 === 2;
    const material = isTrap ? Block.TrapDoor : i % 2 === 0 ? Block.Wood : Block.Metal;
    const half = isTrap ? 1 : 2;

    const tiles: Vec3[] = [];
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        world.set(cx + dx, y, cz + dz, material);
        if (isTrap) tiles.push({ x: cx + dx, y, z: cz + dz });
      }
    }
    if (isTrap) trapDoors.push({ tiles, triggerMs: 550, openMs: 5000 });

    // A stepping stone between tiers so the climb is possible without sprinting.
    const midAngle = angle + 0.575;
    const mx = Math.round(W / 2 + Math.cos(midAngle) * radius);
    const mz = Math.round(D / 2 + Math.sin(midAngle) * radius);
    if (i < tiers - 1) {
      world.fill(mx - 1, y + 2, mz - 1, mx + 1, y + 2, mz + 1, Block.Stone);
    }

    world.set(cx, y + 3, cz, Block.Lamp);

    // Beams guarding the upper half of the climb.
    if (i >= 5) {
      lasers.push({
        origin: { x: cx - 4, y: y + 1, z: cz },
        axis: 'x',
        length: 8,
        onMs: 1600,
        offMs: 1700,
        phaseMs: i * 420,
      });
    }
  }

  // Summit platform with the button.
  const topY = 3 + tiers * 4;
  const cx = Math.round(W / 2);
  const cz = Math.round(D / 2);
  world.fill(cx - 3, topY, cz - 3, cx + 3, topY, cz + 3, Block.Tile);
  world.fill(cx - 3, topY + 1, cz - 3, cx - 3, topY + 3, cz + 3, Block.Brick);
  world.set(cx, topY + 4, cz, Block.Lamp);

  const button = { x: cx - 3, y: topY + 2, z: cz };
  world.set(button.x, button.y, button.z, Block.Button);

  return {
    world,
    spawns: [
      { position: { x: 2.5, y: 1, z: 16.5 }, yaw: -Math.PI / 2, label: 'Base, west ledge' },
      { position: { x: 16.5, y: 1, z: 2.5 }, yaw: Math.PI, label: 'Base, north ledge' },
      { position: { x: W - 2.5, y: 1, z: 16.5 }, yaw: Math.PI / 2, label: 'Base, east ledge' },
    ],
    hazards: { lasers, trapDoors },
    button,
  };
}

/**
 * The Vault — locked in a small counting room.
 *
 * The only way out is a combination-locked door, and the code is the room
 * itself: count the crates, the ceiling lamps, and the metal benches. Beyond
 * the door is a large generated maze with the button at its furthest cell.
 * No hazards — the puzzle and the navigation are the challenge.
 */
function buildVault(): ConceptScene {
  // Maze grid: each cell is a 1-block corridor on odd coordinates with walls on
  // even ones, so the maze region is (2*cells+1) blocks per side.
  const cellsX = 13; // corridor columns at x = 1,3,...,25; boundary walls x=0,26
  const cellsZ = 12; // corridor rows at z = 1,3,...,23; boundary walls z=0,24
  const W = cellsX * 2 + 1; // 27
  const H = 7;

  // The start room hangs off the maze's south side, behind the door wall.
  const roomX0 = 10; // interior x = 10..16
  const roomX1 = 16;
  const roomZ0 = 27; // interior z = 27..33
  const roomZ1 = 33;
  const D = roomZ1 + 2; // 35 — one block of wall past the room's south face
  const world = new VoxelWorld(W, H, D);

  // Everything starts as solid rock; rooms and corridors are carved out.
  world.fill(0, 0, 0, W - 1, 0, D - 1, Block.Stone); // floor slab
  world.fill(0, 1, 0, W - 1, 4, D - 1, Block.Stone); // rock
  world.fill(0, 5, 0, W - 1, 5, D - 1, Block.Tile); // ceiling

  // --- Maze: deterministic depth-first carve (fixed seed, same layout every run).
  let seed = 20260831;
  const random = () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };

  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
  const carveCell = (cx: number, cz: number) => {
    world.fill(cx * 2 + 1, 1, cz * 2 + 1, cx * 2 + 1, 3, cz * 2 + 1, Block.Air);
  };

  const visited = new Set<string>();
  const stack: { cx: number; cz: number }[] = [{ cx: 0, cz: 0 }];
  visited.add(cellKey(0, 0));
  carveCell(0, 0);

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];
    // Shuffle so each junction picks a different order.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    const next = dirs
      .map((d) => ({ cx: cur.cx + d.dx, cz: cur.cz + d.dz, d }))
      .find(
        (n) =>
          n.cx >= 0 && n.cz >= 0 && n.cx < cellsX && n.cz < cellsZ && !visited.has(cellKey(n.cx, n.cz))
      );

    if (!next) {
      stack.pop();
      continue;
    }

    visited.add(cellKey(next.cx, next.cz));
    carveCell(next.cx, next.cz);
    // Knock out the wall between the two cells.
    const wallX = cur.cx * 2 + 1 + next.d.dx;
    const wallZ = cur.cz * 2 + 1 + next.d.dz;
    world.fill(wallX, 1, wallZ, wallX, 3, wallZ, Block.Air);
    stack.push({ cx: next.cx, cz: next.cz });
  }

  // Braid a few dead ends into loops so the maze is not a pure tree. Interior
  // cells only — the boundary walls stay sealed except for the door connector.
  for (let i = 0; i < 24; i++) {
    const cx = 1 + Math.floor(random() * (cellsX - 2));
    const cz = 1 + Math.floor(random() * (cellsZ - 2));
    const horizontal = random() < 0.5;
    const wx = cx * 2 + 1 + (horizontal ? 1 : 0);
    const wz = cz * 2 + 1 + (horizontal ? 0 : 1);
    world.fill(wx, 1, wz, wx, 3, wz, Block.Air);
  }

  // Ceiling lamps scattered through the maze corridors so it is navigable.
  let mazeLamps = 0;
  while (mazeLamps < 14) {
    const lx = 1 + Math.floor(random() * (W - 2));
    const lz = 1 + Math.floor(random() * (cellsZ * 2 - 1)); // stay inside the maze rows
    if (!world.isSolid(lx, 1, lz)) {
      world.set(lx, 4, lz, Block.Lamp);
      mazeLamps++;
    }
  }

  // --- Start room: a 7x7 counting room with a plank floor.
  world.fill(roomX0, 1, roomZ0, roomX1, 3, roomZ1, Block.Air);
  world.fill(roomX0, 0, roomZ0, roomX1, 0, roomZ1, Block.Planks);

  // The clue objects. Counts are the code, in the order given by the hint:
  // crates (4), ceiling lamps (2), metal benches (3). Single blocks each, so
  // counting is unambiguous — and none sit on the walk line from the spawn to
  // the door (x = 12..13).
  for (const [cx, cz] of [
    [11, 28],
    [15, 28],
    [11, 32],
    [16, 31],
  ]) {
    world.set(cx, 1, cz, Block.Wood);
  }
  for (const [lx, lz] of [
    [12, 29],
    [15, 31],
  ]) {
    world.set(lx, 4, lz, Block.Lamp);
  }
  for (const [mx, mz] of [
    [10, 29],
    [16, 29],
    [14, 33],
  ]) {
    world.set(mx, 1, mz, Block.Metal);
  }

  // --- Door: a 2-wide, 3-high gate in the wall between the room and the maze.
  // The passage is carved through all three wall rows, then the middle row is
  // filled with Door blocks so the gate sits inside a short corridor.
  const doorX0 = 12;
  const doorX1 = 13;
  world.fill(doorX0, 1, 24, doorX1, 3, 26, Block.Air);
  const doorTiles: Vec3[] = [];
  for (let dx = doorX0; dx <= doorX1; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      world.set(dx, dy, 25, Block.Door);
      doorTiles.push({ x: dx, y: dy, z: 25 });
    }
  }

  // Lock panel embedded in the room's north wall, directly beside the doorway,
  // with room air in front of it so the player can aim at it.
  const panel = { x: 14, y: 2, z: 26 };
  world.set(panel.x, panel.y, panel.z, Block.LockPanel);

  // The button goes in the maze cell furthest from the cell the door passage
  // joins (x=13, z=23 → cell 6,11), measured by corridor distance.
  const startCell = { cx: 6, cz: 11 };
  const dist = new Map<string, number>([[cellKey(startCell.cx, startCell.cz), 0]]);
  const queue: { cx: number; cz: number }[] = [startCell];
  let furthest = startCell;

  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cellKey(cur.cx, cur.cz))!;
    if (d > (dist.get(cellKey(furthest.cx, furthest.cz)) ?? 0)) furthest = cur;

    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.cx + dx;
      const nz = cur.cz + dz;
      if (nx < 0 || nz < 0 || nx >= cellsX || nz >= cellsZ) continue;
      if (dist.has(cellKey(nx, nz))) continue;
      // Passable only if the wall between the two cells was carved out.
      if (world.isSolid(cur.cx * 2 + 1 + dx, 1, cur.cz * 2 + 1 + dz)) continue;
      dist.set(cellKey(nx, nz), d + 1);
      queue.push({ cx: nx, cz: nz });
    }
  }

  const button = { x: furthest.cx * 2 + 1, y: 2, z: furthest.cz * 2 + 1 };
  world.set(button.x, button.y, button.z, Block.Button);

  return {
    world,
    spawns: [
      // Yaw 0 faces -Z: straight at the door and the lock panel.
      { position: { x: 13.5, y: 1, z: 30.5 }, yaw: 0, label: 'Counting room' },
    ],
    hazards: NO_HAZARDS,
    button,
    lock: {
      code: '423',
      doorTiles,
      panel,
      hint: 'Three numbers open the way. Count what is in this room: crates, then ceiling lamps, then metal benches.',
    },
  };
}

export const CONCEPTS: Concept[] = [
  {
    id: 'vault',
    name: 'The Vault',
    description:
      'Locked in a counting room. Crack the combination to open the door, then search the maze beyond for the button.',
    build: buildVault,
  },
  {
    id: 'facility',
    name: 'The Facility',
    description:
      'Two-level building. Laser-swept ring corridor, trapdoors over a lava basement, button in the server room.',
    build: buildFacility,
  },
  {
    id: 'catacombs',
    name: 'The Catacombs',
    description:
      'A real generated maze with lava channels, holes in the floor, and beams across junctions. Button at the furthest cell.',
    build: buildCatacombs,
  },
  {
    id: 'spire',
    name: 'The Spire',
    description:
      'Climb a spiral of islands over an open drop. Trapdoor platforms and beams across the gaps. No floor to catch you.',
    build: buildSpire,
  },
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
