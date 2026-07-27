// Avatar Item Studio helpers — 2D layer composer + texture flatten (MIE-37)

import type { AvatarPartType, AvatarStudioLayer, AvatarStudioProject, AvatarStudioShape } from './types';

/** Square PNG export size for slot UV textures. */
export const AVATAR_STUDIO_TEXTURE_SIZE = 512;

/** Active tool in the 2D composition editor. */
export type AvatarStudioTool = 'select' | 'square' | 'circle' | 'triangle' | 'star' | 'image';

/** Default fill colors cycled when placing new shapes. */
const SHAPE_FILL_PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];

let shapeColorIndex = 0;

function nextShapeFill(): string {
  const color = SHAPE_FILL_PALETTE[shapeColorIndex % SHAPE_FILL_PALETTE.length];
  shapeColorIndex += 1;
  return color;
}

function newLayerId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Blank studio project with no equipped clothing layers — only the target slot metadata. */
export function createBlankProject(
  ownerUsername: string,
  targetPartType: AvatarPartType = 'shirt',
  name = 'Untitled project',
): AvatarStudioProject {
  const now = Date.now();
  const id = `studio-${now}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    ownerUsername,
    name,
    targetPartType,
    layers: [],
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/** Drop a primitive shape centered in the composition canvas. */
export function createShapeLayer(shape: AvatarStudioShape, canvasSize = AVATAR_STUDIO_TEXTURE_SIZE): AvatarStudioLayer {
  const size = canvasSize * 0.25;
  return {
    id: newLayerId(),
    kind: 'shape',
    shape,
    fill: nextShapeFill(),
    x: canvasSize / 2,
    y: canvasSize / 2,
    width: size,
    height: size,
    rotation: 0,
  };
}

/** Read a local image file into a data URL layer for the composition stack. */
export async function createImageLayerFromFile(
  file: File,
  canvasSize = AVATAR_STUDIO_TEXTURE_SIZE,
): Promise<AvatarStudioLayer> {
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: newLayerId(),
    kind: 'image',
    storageUrl: dataUrl,
    x: canvasSize / 2,
    y: canvasSize / 2,
    scale: 1,
    rotation: 0,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

/** Load an image URL (data or HTTPS) for canvas drawing. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image layer'));
    img.src = url;
  });
}

/** Draw a single shape layer onto a 2D canvas context. */
function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: Extract<AvatarStudioLayer, { kind: 'shape' }>): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.fillStyle = layer.fill;

  const w = layer.width;
  const h = layer.height;

  if (layer.shape === 'square') {
    ctx.fillRect(-w / 2, -h / 2, w, h);
  } else if (layer.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (layer.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
  } else if (layer.shape === 'star') {
    const outer = Math.min(w, h) / 2;
    const inner = outer * 0.45;
    const points = 5;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/** Draw an image layer onto the composition canvas. */
async function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Extract<AvatarStudioLayer, { kind: 'image' }>,
): Promise<void> {
  const img = await loadImage(layer.storageUrl);
  const base = Math.min(AVATAR_STUDIO_TEXTURE_SIZE * 0.5, img.width, img.height);
  const w = base * layer.scale;
  const h = (img.height / img.width) * w;

  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Render all layers bottom-to-top onto a canvas for preview and export. */
export async function drawStudioCanvas(
  ctx: CanvasRenderingContext2D,
  layers: AvatarStudioLayer[],
  canvasSize = AVATAR_STUDIO_TEXTURE_SIZE,
  selectedId?: string | null,
): Promise<void> {
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  // Neutral checkerboard so transparent areas are visible while editing.
  const tile = 16;
  for (let y = 0; y < canvasSize; y += tile) {
    for (let x = 0; x < canvasSize; x += tile) {
      ctx.fillStyle = (x / tile + y / tile) % 2 === 0 ? '#e5e7eb' : '#d1d5db';
      ctx.fillRect(x, y, tile, tile);
    }
  }

  for (const layer of layers) {
    if (layer.kind === 'shape') drawShapeLayer(ctx, layer);
    else await drawImageLayer(ctx, layer);
  }

  if (selectedId) {
    const bounds = getLayerBounds(layers.find((l) => l.id === selectedId), canvasSize);
    if (bounds) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.setLineDash([]);
    }
  }
}

/** Flatten the layer stack to a PNG data URL for 3D preview and publish. */
export async function flattenLayersToDataUrl(
  layers: AvatarStudioLayer[],
  canvasSize = AVATAR_STUDIO_TEXTURE_SIZE,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Export without checkerboard — solid white base for UV mapping.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  for (const layer of layers) {
    if (layer.kind === 'shape') drawShapeLayer(ctx, layer);
    else await drawImageLayer(ctx, layer);
  }

  return canvas.toDataURL('image/png');
}

/** Rough axis-aligned bounds for selection handles and hit testing. */
export function getLayerBounds(
  layer: AvatarStudioLayer | undefined,
  canvasSize = AVATAR_STUDIO_TEXTURE_SIZE,
): { x: number; y: number; w: number; h: number } | null {
  if (!layer) return null;

  if (layer.kind === 'shape') {
    return {
      x: layer.x - layer.width / 2,
      y: layer.y - layer.height / 2,
      w: layer.width,
      h: layer.height,
    };
  }

  const size = canvasSize * 0.25 * layer.scale;
  return {
    x: layer.x - size / 2,
    y: layer.y - size / 2,
    w: size,
    h: size,
  };
}

/** Return the topmost layer under a canvas point (for select tool). */
export function hitTestLayers(
  layers: AvatarStudioLayer[],
  px: number,
  py: number,
  canvasSize = AVATAR_STUDIO_TEXTURE_SIZE,
): AvatarStudioLayer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const bounds = getLayerBounds(layers[i], canvasSize);
    if (!bounds) continue;
    if (px >= bounds.x && px <= bounds.x + bounds.w && py >= bounds.y && py <= bounds.y + bounds.h) {
      return layers[i];
    }
  }
  return null;
}

/** Strip the data URL prefix for Cloud Function upload. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
