/**
 * Find the Button — procedural block textures (concept spike).
 *
 * Textures are painted onto a canvas at runtime rather than loaded as images:
 * no asset pipeline, nothing extra to ship with the static export, and the
 * patterns stay easy to tweak while we are still deciding how the game looks.
 *
 * Browser-only — these touch `document`, so call them from a client component
 * that is not server-rendered.
 */

import { CanvasTexture, NearestFilter, SRGBColorSpace, Texture } from 'three';

import { Block } from './findTheButton';

/** Texel size of every generated texture. Small and blocky on purpose. */
const SIZE = 32;

/**
 * Deterministic pseudo-random source.
 *
 * Texture noise must look the same on every load — using Math.random would make
 * each session's walls subtly different and any visual comparison meaningless.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

/** Sprinkle per-pixel noise so flat fills do not look like plastic. */
function addNoise(
  ctx: CanvasRenderingContext2D,
  seed: number,
  amount: number,
  alpha = 0.09
): void {
  const random = makeRandom(seed);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const shade = Math.floor((random() - 0.5) * amount);
      ctx.fillStyle = `rgba(${128 + shade}, ${128 + shade}, ${128 + shade}, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const texture = new CanvasTexture(canvas);
  // Nearest filtering keeps the pixel-art look instead of blurring it.
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Running-bond brick — the main exterior wall. */
function brickTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#c8bdb0'; // mortar
  ctx.fillRect(0, 0, SIZE, SIZE);

  const rowHeight = 8;
  const brickWidth = 16;
  const random = makeRandom(1337);

  for (let row = 0; row < SIZE / rowHeight; row++) {
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2;
    for (let x = offset; x < SIZE; x += brickWidth) {
      // Vary each brick slightly so the wall does not read as a repeating stamp.
      const tint = Math.floor(random() * 26);
      ctx.fillStyle = `rgb(${140 + tint}, ${70 + tint / 2}, ${58 + tint / 3})`;
      ctx.fillRect(x + 1, row * rowHeight + 1, brickWidth - 2, rowHeight - 2);
    }
  }
  addNoise(ctx, 99, 40);
  return toTexture(canvas);
}

/** Painted plaster — interior partition walls. */
function plasterTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#ded7c9';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Faint scuffs so large flat walls still have something to catch the eye.
  const random = makeRandom(555);
  ctx.fillStyle = 'rgba(150,140,125,0.18)';
  for (let i = 0; i < 14; i++) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    ctx.fillRect(x, y, 1 + random() * 3, 1);
  }
  addNoise(ctx, 7, 30, 0.07);
  return toTexture(canvas);
}

/** Wooden floorboards. */
function planksTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  const random = makeRandom(2024);
  const plankHeight = 8;

  for (let row = 0; row < SIZE / plankHeight; row++) {
    const tint = Math.floor(random() * 22);
    ctx.fillStyle = `rgb(${150 + tint}, ${104 + tint}, ${58 + tint / 2})`;
    ctx.fillRect(0, row * plankHeight, SIZE, plankHeight);

    // Seam between boards.
    ctx.fillStyle = 'rgba(70,44,20,0.55)';
    ctx.fillRect(0, row * plankHeight + plankHeight - 1, SIZE, 1);

    // Grain streaks.
    ctx.fillStyle = 'rgba(90,58,26,0.25)';
    for (let i = 0; i < 5; i++) {
      const gx = random() * SIZE;
      const gy = row * plankHeight + 1 + random() * (plankHeight - 3);
      ctx.fillRect(gx, gy, 3 + random() * 8, 1);
    }
  }
  addNoise(ctx, 42, 26, 0.06);
  return toTexture(canvas);
}

/** Ceiling tile. */
function tileTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#eceff3';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#c3c9d2';
  ctx.fillRect(0, 0, SIZE, 1);
  ctx.fillRect(0, 0, 1, SIZE);
  ctx.fillRect(0, SIZE / 2 - 1, SIZE, 1);
  ctx.fillRect(SIZE / 2 - 1, 0, 1, SIZE);
  addNoise(ctx, 11, 18, 0.05);
  return toTexture(canvas);
}

/** Riveted metal panel — crates and fixtures. */
function metalTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#79838f';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = 'rgba(40,48,56,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, SIZE - 3, SIZE - 3);

  ctx.fillStyle = '#aab3bd';
  for (const [x, y] of [
    [4, 4],
    [SIZE - 5, 4],
    [4, SIZE - 5],
    [SIZE - 5, SIZE - 5],
  ]) {
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  addNoise(ctx, 3, 34, 0.08);
  return toTexture(canvas);
}

/** Wooden crate with plank banding. */
function crateTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#b07c42';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#6f4a22';
  ctx.fillRect(0, 0, SIZE, 3);
  ctx.fillRect(0, SIZE - 3, SIZE, 3);
  ctx.fillRect(0, 0, 3, SIZE);
  ctx.fillRect(SIZE - 3, 0, 3, SIZE);
  // Diagonal brace.
  ctx.strokeStyle = '#6f4a22';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(3, 3);
  ctx.lineTo(SIZE - 3, SIZE - 3);
  ctx.stroke();
  addNoise(ctx, 88, 30, 0.08);
  return toTexture(canvas);
}

/** Glowing ceiling lamp. */
function lampTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#fff6d5';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#d8cba0';
  ctx.fillRect(0, 0, SIZE, 2);
  ctx.fillRect(0, SIZE - 2, SIZE, 2);
  ctx.fillRect(0, 0, 2, SIZE);
  ctx.fillRect(SIZE - 2, 0, 2, SIZE);
  return toTexture(canvas);
}

/** The goal: a red button on a metal plate. */
function buttonTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#5f6a76';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = '#39424c';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);

  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 3, 0, Math.PI * 2);
  ctx.fillStyle = '#e0332a';
  ctx.fill();

  // Highlight so the button reads as domed rather than flat.
  ctx.beginPath();
  ctx.arc(SIZE / 2 - 3, SIZE / 2 - 3, SIZE / 9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  return toTexture(canvas);
}

/** Molten lava — bright, so it reads as dangerous at a glance. */
function lavaTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#d63a10';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Brighter cracks over a dark crust.
  const random = makeRandom(616);
  ctx.fillStyle = '#7a1f08';
  for (let i = 0; i < 18; i++) {
    ctx.fillRect(random() * SIZE, random() * SIZE, 3 + random() * 6, 2);
  }
  ctx.fillStyle = '#ffb43c';
  for (let i = 0; i < 12; i++) {
    ctx.fillRect(random() * SIZE, random() * SIZE, 2 + random() * 7, 1);
  }
  ctx.fillStyle = '#fff0a8';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(random() * SIZE, random() * SIZE, 2, 1);
  }
  return toTexture(canvas);
}

/** Floor spikes — upward triangles on dark stone. */
function spikesTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#3b3f45';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const spikeWidth = 8;
  for (let x = 0; x < SIZE; x += spikeWidth) {
    ctx.beginPath();
    ctx.moveTo(x + 1, SIZE - 2);
    ctx.lineTo(x + spikeWidth / 2, 3);
    ctx.lineTo(x + spikeWidth - 1, SIZE - 2);
    ctx.closePath();
    ctx.fillStyle = '#c9ced6';
    ctx.fill();
    // Highlight down one edge so the points read as 3D.
    ctx.fillStyle = '#eef1f5';
    ctx.fillRect(x + spikeWidth / 2 - 1, 4, 1, SIZE - 8);
  }
  addNoise(ctx, 71, 26, 0.07);
  return toTexture(canvas);
}

/** Trapdoor panel — hatched metal with hazard stripes. */
function trapDoorTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#8a7b3f';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Diagonal hazard stripes.
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 4;
  for (let i = -SIZE; i < SIZE * 2; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + SIZE, SIZE);
    ctx.stroke();
  }

  // Panel edge and centre seam, so it reads as a hinged door.
  ctx.strokeStyle = '#4a431f';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  ctx.fillStyle = '#4a431f';
  ctx.fillRect(0, SIZE / 2 - 1, SIZE, 2);
  return toTexture(canvas);
}

/** Laser emitter housing. */
function emitterTexture(): Texture {
  const { canvas, ctx } = createCanvas();
  ctx.fillStyle = '#2f353c';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = '#4d565f';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);

  // Glowing lens.
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff4d4d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 10, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd9d9';
  ctx.fill();
  return toTexture(canvas);
}

/** Build every block texture. Call once per scene and dispose on unmount. */
export function createBlockTextures(): Map<number, Texture> {
  return new Map<number, Texture>([
    [Block.Stone, plasterTexture()],
    [Block.Grass, planksTexture()],
    [Block.Wood, crateTexture()],
    [Block.Metal, metalTexture()],
    [Block.Lamp, lampTexture()],
    [Block.Button, buttonTexture()],
    [Block.Brick, brickTexture()],
    [Block.Plaster, plasterTexture()],
    [Block.Planks, planksTexture()],
    [Block.Tile, tileTexture()],
    [Block.Lava, lavaTexture()],
    [Block.Spikes, spikesTexture()],
    [Block.TrapDoor, trapDoorTexture()],
    [Block.Emitter, emitterTexture()],
  ]);
}
