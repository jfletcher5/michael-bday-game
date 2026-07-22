'use client';

/**
 * Fossil Exploration canvas (MIE-31, MIE-34).
 * One long horizontal platform, no auto-scroll, camera follows the ball.
 * Mine plants/rocks/trees by click/tap for a 20% fossil drop chance.
 */

import { useCallback, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import type { Controls, FossilTypeId } from '../lib/types';
import {
  FOSSIL_MINE_SUCCESS_CHANCE,
  FOSSIL_PLATFORM_HEIGHT,
  FOSSIL_PLATFORM_Y,
  FOSSIL_SPRITE_SIZE,
  FOSSIL_TYPE_META,
  FOSSIL_TYPES,
  FOSSIL_WORLD_HEIGHT,
  FOSSIL_WORLD_WIDTH,
  clampFossilCameraX,
  createMineables,
  findMineableAtWorldPoint,
  pickRandomFossilType,
  screenToFossilWorld,
  type MineableKind,
  type MineableNode,
} from '../lib/fossils';

const BALL_RADIUS = 20;
const JUMP_FORCE = 0.18;
/** How long a mined fossil sprite floats above the node (MIE-33). */
const FOSSIL_POPUP_MS = 1400;

interface FossilWorldPopup {
  id: number;
  type: FossilTypeId;
  x: number;
  y: number;
  startMs: number;
}

interface FossilExplorationCanvasProps {
  controls: Controls;
  isPlaying: boolean;
  zoom?: number;
  ballColor?: string;
  ballStrokeColor?: string;
  onFossilCollect: (type: FossilTypeId) => void;
  onFall: () => void;
  /** Restart signal — when true, reset world once then clear via callback. */
  restartSignalRef?: React.MutableRefObject<boolean>;
}

/** Draw fossil artwork at world position; emoji circle fallback if sprite not loaded (MIE-33). */
function drawFossilSprite(
  ctx: CanvasRenderingContext2D,
  type: FossilTypeId,
  sx: number,
  sy: number,
  size: number,
  images: Partial<Record<FossilTypeId, HTMLImageElement>>,
  alpha = 1,
) {
  const meta = FOSSIL_TYPE_META[type];
  const img = images[type];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (img?.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, sx - size / 2, sy - size / 2, size, size);
  } else {
    // Fallback when artwork is still loading or failed to fetch.
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.round(size * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.emoji, sx, sy);
  }
  ctx.restore();
}

/** Draw a mineable silhouette on the platform (MIE-34). */
function drawMineable(ctx: CanvasRenderingContext2D, kind: MineableKind, sx: number, sy: number) {
  switch (kind) {
    case 'rock': {
      ctx.fillStyle = '#6b7280';
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 22, sy + 6);
      ctx.lineTo(sx - 14, sy - 18);
      ctx.lineTo(sx + 4, sy - 24);
      ctx.lineTo(sx + 20, sy - 10);
      ctx.lineTo(sx + 16, sy + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'plant': {
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 10);
      ctx.quadraticCurveTo(sx - 4, sy - 6, sx, sy - 22);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(sx - 12, sy - 10, 10, 6, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + 12, sy - 12, 10, 6, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx, sy - 20, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tree': {
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(sx - 5, sy - 8, 10, 22);
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 38);
      ctx.lineTo(sx - 22, sy - 6);
      ctx.lineTo(sx + 22, sy - 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 22, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

export default function FossilExplorationCanvas({
  controls,
  isPlaying,
  zoom = 1,
  ballColor = '#ff6b6b',
  ballStrokeColor = '#cc0000',
  onFossilCollect,
  onFall,
  restartSignalRef,
}: FossilExplorationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const mineablesRef = useRef<MineableNode[]>([]);
  const fossilImagesRef = useRef<Partial<Record<FossilTypeId, HTMLImageElement>>>({});
  const fossilPopupsRef = useRef<FossilWorldPopup[]>([]);
  const popupIdRef = useRef(0);
  const cameraXRef = useRef(0);
  const controlsRef = useRef(controls);
  const hasJumpedRef = useRef(false);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef(0);
  const onFossilCollectRef = useRef(onFossilCollect);
  const onFallRef = useRef(onFall);
  const zoomRef = useRef(zoom);
  const fallSentRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const ballColorRef = useRef(ballColor);
  const ballStrokeColorRef = useRef(ballStrokeColor);
  // Stable loop pointer so RAF can always call the latest logic (lint-safe).
  const gameLoopRef = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);
  useEffect(() => {
    onFossilCollectRef.current = onFossilCollect;
  }, [onFossilCollect]);
  useEffect(() => {
    onFallRef.current = onFall;
  }, [onFall]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    ballColorRef.current = ballColor;
    ballStrokeColorRef.current = ballStrokeColor;
  }, [ballColor, ballStrokeColor]);

  // Preload Michael's fossil sprites for world popups (MIE-33).
  useEffect(() => {
    for (const type of FOSSIL_TYPES) {
      const img = new Image();
      img.src = FOSSIL_TYPE_META[type].imageSrc;
      fossilImagesRef.current[type] = img;
    }
  }, []);

  /** Attempt to mine the node under the pointer; 20% roll awards a random fossil (MIE-34). */
  const handleMinePointer = useCallback((clientX: number, clientY: number) => {
    if (!isPlayingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { worldX, worldY } = screenToFossilWorld(
      clientX,
      clientY,
      canvas,
      cameraXRef.current,
      zoomRef.current,
    );
    const node = findMineableAtWorldPoint(mineablesRef.current, worldX, worldY);
    if (!node) return;

    node.mined = true;
    if (Math.random() < FOSSIL_MINE_SUCCESS_CHANCE) {
      const fossilType = pickRandomFossilType();
      fossilPopupsRef.current.push({
        id: popupIdRef.current++,
        type: fossilType,
        x: node.x,
        y: node.y - 12,
        startMs: performance.now(),
      });
      onFossilCollectRef.current(fossilType);
    }
  }, []);

  const initializeWorld = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = Math.min(window.innerWidth, 900);
    canvas.height = FOSSIL_WORLD_HEIGHT;

    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
    }

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.6 } });
    engineRef.current = engine;

    const ball = Matter.Bodies.circle(160, FOSSIL_PLATFORM_Y - BALL_RADIUS - 4, BALL_RADIUS, {
      restitution: 0.25,
      friction: 0.02,
      density: 0.004,
      label: 'ball',
    });
    ballRef.current = ball;

    const platform = Matter.Bodies.rectangle(
      FOSSIL_WORLD_WIDTH / 2,
      FOSSIL_PLATFORM_Y + FOSSIL_PLATFORM_HEIGHT / 2,
      FOSSIL_WORLD_WIDTH,
      FOSSIL_PLATFORM_HEIGHT,
      { isStatic: true, friction: 0.9, label: 'platform' },
    );

    Matter.World.add(engine.world, [ball, platform]);
    mineablesRef.current = createMineables();
    fossilPopupsRef.current = [];
    cameraXRef.current = 0;
    fallSentRef.current = false;
    lastFrameTimeRef.current = 0;
  }, []);

  useEffect(() => {
    gameLoopRef.current = (now: number) => {
      try {
        if (!isPlayingRef.current || !engineRef.current || !canvasRef.current || !ballRef.current) {
          animationFrameRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
          return;
        }

        if (restartSignalRef?.current) {
          initializeWorld();
          restartSignalRef.current = false;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
          return;
        }

        const FIXED_DT = 16.67;
        if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = now;
        let elapsed = now - lastFrameTimeRef.current;
        lastFrameTimeRef.current = now;
        if (elapsed > 100) elapsed = FIXED_DT;

        Matter.Engine.update(engineRef.current, FIXED_DT);

        const ball = ballRef.current;
        const c = controlsRef.current;
        if (c.left) Matter.Body.applyForce(ball, ball.position, { x: -0.006, y: 0 });
        if (c.right) Matter.Body.applyForce(ball, ball.position, { x: 0.006, y: 0 });

        const platformTop = FOSSIL_PLATFORM_Y;
        const grounded =
          Math.abs(ball.velocity.y) < 3 &&
          Math.abs(ball.position.y + BALL_RADIUS - platformTop) < 10 &&
          ball.position.x > 0 &&
          ball.position.x < FOSSIL_WORLD_WIDTH;
        if (c.jump && grounded && !hasJumpedRef.current) {
          Matter.Body.applyForce(ball, ball.position, { x: 0, y: -JUMP_FORCE });
          hasJumpedRef.current = true;
        }
        if (!c.jump) hasJumpedRef.current = false;

        if (ball.position.x < BALL_RADIUS) {
          Matter.Body.setPosition(ball, { x: BALL_RADIUS, y: ball.position.y });
          Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
        }
        if (ball.position.x > FOSSIL_WORLD_WIDTH - BALL_RADIUS) {
          Matter.Body.setPosition(ball, {
            x: FOSSIL_WORLD_WIDTH - BALL_RADIUS,
            y: ball.position.y,
          });
          Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
        }

        if (ball.position.y > FOSSIL_WORLD_HEIGHT + 40 && !fallSentRef.current) {
          fallSentRef.current = true;
          onFallRef.current();
        }

        cameraXRef.current = clampFossilCameraX(ball.position.x, canvas.width, FOSSIL_WORLD_WIDTH);
        const camX = cameraXRef.current;
        const z = zoomRef.current;
        const height = canvas.height;
        const width = canvas.width;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(z, z);
        ctx.translate(-width / 2, -height / 2);

        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#0f3d2e');
        sky.addColorStop(0.5, '#1a5c3a');
        sky.addColorStop(1, '#0b291c');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 18; i++) {
          const wx = i * 180 + 40;
          const sx = wx - camX * 0.4;
          if (sx < -80 || sx > width + 80) continue;
          ctx.fillStyle = '#3e2723';
          ctx.fillRect(sx, height * 0.45, 16, height * 0.55);
          ctx.fillStyle = '#1b5e20';
          ctx.beginPath();
          ctx.ellipse(sx + 8, height * 0.42, 42, 32, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(76, 175, 80, 0.65)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 20; i++) {
          const wx = 60 + i * 150;
          const sx = wx - camX * 0.7;
          if (sx < -20 || sx > width + 20) continue;
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.quadraticCurveTo(sx + 18, height * 0.25, sx - 10, height * 0.4);
          ctx.stroke();
        }

        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(-camX, FOSSIL_PLATFORM_Y, FOSSIL_WORLD_WIDTH, FOSSIL_PLATFORM_HEIGHT);
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 3;
        ctx.strokeRect(-camX, FOSSIL_PLATFORM_Y, FOSSIL_WORLD_WIDTH, FOSSIL_PLATFORM_HEIGHT);

        for (const node of mineablesRef.current) {
          if (node.mined) continue;
          const sx = node.x - camX;
          drawMineable(ctx, node.kind, sx, node.y);
        }

        // Floating fossil sprites when a mine awards a piece (MIE-33 world pickup art).
        const nowPopup = performance.now();
        fossilPopupsRef.current = fossilPopupsRef.current.filter((popup) => {
          const t = (nowPopup - popup.startMs) / FOSSIL_POPUP_MS;
          if (t >= 1) return false;
          const sx = popup.x - camX;
          const sy = popup.y - t * 28;
          const alpha = 1 - t * 0.35;
          drawFossilSprite(
            ctx,
            popup.type,
            sx,
            sy,
            FOSSIL_SPRITE_SIZE,
            fossilImagesRef.current,
            alpha,
          );
          return true;
        });

        const bx = ball.position.x - camX;
        const by = ball.position.y;
        ctx.fillStyle = ballColorRef.current;
        ctx.beginPath();
        ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ballStrokeColorRef.current;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        animationFrameRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
      } catch (err) {
        console.error('Fossil exploration loop error:', err);
        animationFrameRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
      }
    };
  }, [initializeWorld, restartSignalRef]);

  useEffect(() => {
    initializeWorld();
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.min(window.innerWidth, 900);
      canvas.height = FOSSIL_WORLD_HEIGHT;
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (engineRef.current) {
        Matter.World.clear(engineRef.current.world, false);
        Matter.Engine.clear(engineRef.current);
      }
    };
  }, [initializeWorld]);

  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = 0;
      animationFrameRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  // Pointer/tap mining on canvas (MIE-34) — separate from movement touch zones.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      handleMinePointer(e.clientX, e.clientY);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [handleMinePointer]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full max-w-4xl mx-auto object-contain relative"
      style={{ display: 'block', zIndex: 1 }}
      aria-label="Fossil Exploration game canvas"
    />
  );
}
