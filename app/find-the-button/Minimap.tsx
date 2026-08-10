'use client';

import { useEffect, useRef } from 'react';

import { Block, ConceptScene } from '../lib/findTheButton';
import { isLaserOn } from '../lib/findTheButtonHazards';

/** Player pose, written every frame by the 3D scene and read here. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Rendered size of the map in CSS pixels. */
const MAP_SIZE = 168;
/** Redraw rate — the map does not need to keep up with the render loop. */
const FPS = 15;

const COLORS = {
  outside: 'rgba(0,0,0,0)',
  open: '#20262e',
  wall: '#79828f',
  lava: '#d63a10',
  spikes: '#b9c0c9',
  trapDoor: '#8a7b3f',
  hole: '#0b0d10',
  button: '#ff4b3e',
  player: '#ffffff',
  laser: '#ff2d2d',
};

/**
 * Top-down minimap.
 *
 * Draws a horizontal slice of the world at the player's own height, so in a
 * multi-storey level you see the floor you are standing on rather than a
 * flattened composite of all of them. Walls come from head height; the floor
 * beneath each cell decides whether it reads as solid ground, lava, or a hole.
 */
export default function Minimap({
  scene,
  poseRef,
}: {
  scene: ConceptScene;
  poseRef: React.RefObject<Pose>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { world } = scene;
    // Fit the level into the map box, preserving aspect.
    const scale = MAP_SIZE / Math.max(world.sizeX, world.sizeZ);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;

    let raf = 0;
    let lastDraw = 0;

    const draw = (timeMs: number) => {
      raf = requestAnimationFrame(draw);
      if (timeMs - lastDraw < 1000 / FPS) return;
      lastDraw = timeMs;

      const pose = poseRef.current;
      if (!pose) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Slice at the player's height: feet level for the floor, head level for walls.
      const feetY = Math.floor(pose.y);
      const headY = feetY + 1;

      for (let z = 0; z < world.sizeZ; z++) {
        for (let x = 0; x < world.sizeX; x++) {
          const wall = world.get(x, headY, z);
          const floor = world.get(x, feetY - 1, z);

          let color: string;
          if (wall !== Block.Air) {
            color = wall === Block.Lava ? COLORS.lava : COLORS.wall;
          } else if (floor === Block.Lava) {
            color = COLORS.lava;
          } else if (floor === Block.Spikes) {
            color = COLORS.spikes;
          } else if (floor === Block.TrapDoor) {
            color = COLORS.trapDoor;
          } else if (floor === Block.Air) {
            color = COLORS.hole;
          } else {
            color = COLORS.open;
          }

          ctx.fillStyle = color;
          // +1 on the size avoids hairline seams between cells at fractional scale.
          ctx.fillRect(x * scale, z * scale, scale + 0.5, scale + 0.5);
        }
      }

      // Lasers, only while firing.
      ctx.strokeStyle = COLORS.laser;
      ctx.lineWidth = Math.max(1, scale * 0.4);
      for (const laser of scene.hazards.lasers) {
        if (!isLaserOn(laser, timeMs)) continue;
        // Only beams on the player's storey are relevant.
        if (Math.abs(laser.origin.y - feetY) > 2) continue;
        ctx.beginPath();
        ctx.moveTo((laser.origin.x + 0.5) * scale, (laser.origin.z + 0.5) * scale);
        if (laser.axis === 'x') {
          ctx.lineTo((laser.origin.x + laser.length + 0.5) * scale, (laser.origin.z + 0.5) * scale);
        } else {
          ctx.lineTo((laser.origin.x + 0.5) * scale, (laser.origin.z + laser.length + 0.5) * scale);
        }
        ctx.stroke();
      }

      // The button — pulses so it stands out against the level colours.
      const pulse = 0.6 + 0.4 * Math.sin(timeMs / 260);
      ctx.fillStyle = COLORS.button;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(
        (scene.button.x + 0.5) * scale,
        (scene.button.z + 0.5) * scale,
        Math.max(2.5, scale * 0.7),
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 1;

      // Player: a triangle pointing the way the camera faces. Yaw 0 looks down
      // -Z, which is up on the map.
      const px = (pose.x + 0.0) * scale;
      const pz = (pose.z + 0.0) * scale;
      const r = Math.max(3.5, scale * 0.9);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-pose.yaw);
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.66, r * 0.7);
      ctx.lineTo(0, r * 0.3);
      ctx.lineTo(-r * 0.66, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [scene, poseRef]);

  return (
    <div className="rounded-2xl bg-black/45 backdrop-blur-md p-2 ring-1 ring-white/20">
      <canvas
        ref={canvasRef}
        style={{ width: MAP_SIZE, height: MAP_SIZE }}
        className="block rounded-lg"
        aria-label="Top-down map of the level"
      />
      <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-white/60">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-white" /> you
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.button }} />{' '}
          button
        </span>
      </div>
    </div>
  );
}
