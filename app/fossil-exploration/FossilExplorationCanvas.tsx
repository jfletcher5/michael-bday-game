'use client';

/**
 * Fossil Exploration canvas (MIE-31).
 * One long horizontal platform, no auto-scroll, camera follows the ball.
 * Collect fossils by contact; crafting is deferred to a later ticket.
 */

import { useCallback, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import type { Controls, FossilTypeId } from '../lib/types';
import {
  FOSSIL_PLATFORM_HEIGHT,
  FOSSIL_PLATFORM_Y,
  FOSSIL_PICKUP_RADIUS,
  FOSSIL_TYPE_META,
  FOSSIL_WORLD_HEIGHT,
  FOSSIL_WORLD_WIDTH,
  clampFossilCameraX,
  createFossilPickups,
  type FossilPickup,
} from '../lib/fossils';

const BALL_RADIUS = 20;
const JUMP_FORCE = 0.18;

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
  const pickupsRef = useRef<FossilPickup[]>([]);
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
    pickupsRef.current = createFossilPickups();
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

        for (const pickup of pickupsRef.current) {
          if (pickup.collected) continue;
          const dist = Math.hypot(ball.position.x - pickup.x, ball.position.y - pickup.y);
          if (dist < BALL_RADIUS + FOSSIL_PICKUP_RADIUS) {
            pickup.collected = true;
            onFossilCollectRef.current(pickup.type);
          }
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

        for (const pickup of pickupsRef.current) {
          if (pickup.collected) continue;
          const sx = pickup.x - camX;
          const meta = FOSSIL_TYPE_META[pickup.type];
          ctx.beginPath();
          ctx.arc(sx, pickup.y, FOSSIL_PICKUP_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = meta.color;
          ctx.fill();
          ctx.strokeStyle = '#1f2937';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = '16px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(meta.emoji, sx, pickup.y);
        }

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

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full max-w-4xl mx-auto object-contain relative"
      style={{ display: 'block', zIndex: 1 }}
      aria-label="Fossil Exploration game canvas"
    />
  );
}
