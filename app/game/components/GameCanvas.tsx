'use client';

import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import { BOSS_ENCOUNTERS } from '@/app/lib/bosses';
import {
  Controls,
  Platform,
  Bomb,
  BossEncounterConfig,
  BossHudState,
  BossArenaSegment,
  BreakableWall,
} from '@/app/lib/types';

interface GameCanvasProps {
  controls: Controls;
  onDistanceUpdate: (distance: number) => void;
  onGameOver: () => void;
  onFinish?: () => void;
  onBossHudUpdate?: (bossHud: BossHudState | null) => void;
  isPlaying: boolean;
  reviveSignalRef?: React.MutableRefObject<boolean>;
  mode: 'infinite' | 'level';
  customPlatforms?: Platform[];
  ballColor?: string;       // Optional custom ball color
  ballStrokeColor?: string; // Optional custom ball stroke color
  ballImageUrl?: string;    // Optional image URL for themed balls
  ballImageFilter?: string; // Optional CSS filter to apply to ball image
}

interface ActiveBossEncounter {
  config: BossEncounterConfig;
  arenaBodies: Matter.Body[];
  arenaSegments: BossArenaSegment[];
  sideWalls: Matter.Body[];
  bossBody: Matter.Body | null;
  bossRadius: number;
  bossHp: number;
  maxBossHp: number;
  state: 'approaching' | 'active' | 'defeating';
  lastBossJumpAt: number;
  nextJumpDelayMs: number;
  lastBossHitAt: number;
  defeatStartedAt: number;
  lastBlinkToggleAt: number;
  isBossVisible: boolean;
}

interface Challenge300State {
  platformCreated: boolean;
  isOnPlatform: boolean;
  wallBroken: boolean;
}

// Core gameplay constants used by physics and rendering.
const BALL_RADIUS = 20;
const PLATFORM_HEIGHT = 20;
// Time (in seconds) for a platform to travel from the bottom of the screen to the top.
// Lower number = faster scroll. This is resolution-independent.
const INITIAL_SCROLL_SECONDS = 4;
const PLATFORM_SPAWN_Y = 100;
const JUMP_FORCE = 0.18;
const BOMB_RADIUS = 15;
const BOMB_SPAWN_CHANCE = 0.3;

// Convert target traversal time into pixels-per-60Hz-frame for a given canvas height.
// At 60 FPS, we need `canvasHeight / (seconds * 60)` pixels per frame.
function scrollSpeedForHeight(canvasHeight: number, seconds: number): number {
  return canvasHeight / (seconds * 60);
}

/**
 * GameCanvas Component
 * Manages the 2D physics simulation and rendering using Matter.js.
 */
export default function GameCanvas({
  controls,
  onDistanceUpdate,
  onGameOver,
  onFinish,
  onBossHudUpdate,
  isPlaying,
  reviveSignalRef,
  mode,
  customPlatforms = [],
  ballColor = '#ff6b6b',
  ballStrokeColor = '#cc0000',
  ballImageUrl,
  ballImageFilter,
}: GameCanvasProps) {
  // Refs for mutable runtime state that should not trigger React re-renders.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const platformsRef = useRef<Matter.Body[]>([]);
  const bombsRef = useRef<Bomb[]>([]);
  const scrollDistanceRef = useRef(0);
  const scrollSpeedRef = useRef(0);
  const originalScrollSpeedRef = useRef(0);
  const controlsRef = useRef(controls);
  const isGroundedRef = useRef(false);
  const hasJumpedRef = useRef(false);
  const lastFrameTimeRef = useRef(0);
  const accumulatorRef = useRef(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const gameLoopRef = useRef<(currentTime: number) => void>(() => {});

  // Boss progression and active encounter runtime state.
  const sortedBossEncountersRef = useRef(
    [...BOSS_ENCOUNTERS].sort((a, b) => a.levelMeters - b.levelMeters)
  );
  const nextBossEncounterIndexRef = useRef(0);
  const activeBossEncounterRef = useRef<ActiveBossEncounter | null>(null);
  const challenge300Ref = useRef<Challenge300State>({
    platformCreated: false,
    isOnPlatform: false,
    wallBroken: false,
  });
  const breakableWallRef = useRef<BreakableWall | null>(null);

  // Ball image state for themed avatars.
  const ballImageRef = useRef<HTMLImageElement | null>(null);
  const ballImageLoadedRef = useRef(false);

  // Callback refs to avoid game-loop recreation when props change.
  const onDistanceUpdateRef = useRef(onDistanceUpdate);
  const onGameOverRef = useRef(onGameOver);
  const onFinishRef = useRef(onFinish);
  const onBossHudUpdateRef = useRef(onBossHudUpdate);

  useEffect(() => {
    onDistanceUpdateRef.current = onDistanceUpdate;
    onGameOverRef.current = onGameOver;
    onFinishRef.current = onFinish;
    onBossHudUpdateRef.current = onBossHudUpdate;
  }, [onDistanceUpdate, onGameOver, onFinish, onBossHudUpdate]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  // Keep boss HUD in sync with the current encounter state.
  const emitBossHud = useCallback((bossHud: BossHudState | null) => {
    if (onBossHudUpdateRef.current) {
      onBossHudUpdateRef.current(bossHud);
    }
  }, []);

  // Load optional ball image whenever selected ball art changes.
  useEffect(() => {
    if (ballImageUrl) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        ballImageRef.current = image;
        ballImageLoadedRef.current = true;
      };
      image.onerror = () => {
        ballImageRef.current = null;
        ballImageLoadedRef.current = false;
      };
      image.src = ballImageUrl;
    } else {
      ballImageRef.current = null;
      ballImageLoadedRef.current = false;
    }
  }, [ballImageUrl]);

  const getDifficultySettings = useCallback((distance: number) => {
    // Difficulty scales smoothly over the first 500m.
    const progressFactor = Math.min(distance / 500, 1);

    return {
      platformMinWidth: 180 - (progressFactor * 80),
      platformMaxWidth: 300 - (progressFactor * 50),
      platformGapMin: 80 + (progressFactor * 70),
      platformGapMax: 120 + (progressFactor * 80),
    };
  }, []);

  const randomInRange = (min: number, max: number) => min + (Math.random() * (max - min));

  const createBombOnPlatform = useCallback((platform: Matter.Body, platformId: string): Bomb | null => {
    // Boss arena platforms intentionally avoid bomb spawning.
    if (platform.label.startsWith('bossArena')) return null;
    if (Math.random() > BOMB_SPAWN_CHANCE) return null;

    return {
      id: `bomb-${platformId}-${Date.now()}`,
      x: platform.position.x,
      y: platform.bounds.min.y - BOMB_RADIUS - 5,
      radius: BOMB_RADIUS,
    };
  }, []);

  const isBodyGroundedOnPlatforms = useCallback((body: Matter.Body, radius: number, contactTolerance = 8) => {
    // Grounding check uses per-platform overlap to support arena holes naturally.
    return Math.abs(body.velocity.y) < 3 && platformsRef.current.some(platform => {
      const bodyBottom = body.position.y + radius;
      const platformTop = platform.bounds.min.y;
      const verticalDistance = Math.abs(bodyBottom - platformTop);
      const bodyLeft = body.position.x - radius;
      const bodyRight = body.position.x + radius;
      const platformLeft = platform.bounds.min.x;
      const platformRight = platform.bounds.max.x;
      const horizontalOverlap = bodyRight > platformLeft && bodyLeft < platformRight;
      return verticalDistance < contactTolerance && horizontalOverlap;
    });
  }, []);

  const spawnBossArenaEncounter = useCallback((encounter: BossEncounterConfig, width: number, height: number) => {
    if (!engineRef.current) return;

    const arenaY = height + encounter.arenaYSpawnOffset;
    const arenaBodies: Matter.Body[] = [];
    const arenaSegments: BossArenaSegment[] = [];

    // Build the arena from multiple fixed platform segments to create holes.
    encounter.arenaSegments.forEach((segmentDef, index) => {
      const segmentWidth = width * segmentDef.widthRatio;
      const segmentCenterX = width * segmentDef.centerXRatio;
      const segmentBody = Matter.Bodies.rectangle(
        segmentCenterX,
        arenaY,
        segmentWidth,
        PLATFORM_HEIGHT,
        {
          isStatic: true,
          label: `bossArena-${encounter.id}-${index}`,
          friction: 0.85,
        }
      );
      arenaBodies.push(segmentBody);
      arenaSegments.push({
        x: segmentCenterX,
        y: arenaY,
        width: segmentWidth,
        height: PLATFORM_HEIGHT,
        label: segmentBody.label,
      });
    });

    Matter.World.add(engineRef.current.world, arenaBodies);
    platformsRef.current.push(...arenaBodies);

    activeBossEncounterRef.current = {
      config: encounter,
      arenaBodies,
      arenaSegments,
      sideWalls: [],
      bossBody: null,
      bossRadius: BALL_RADIUS * encounter.sizeMultiplier,
      bossHp: encounter.hp,
      maxBossHp: encounter.hp,
      state: 'approaching',
      lastBossJumpAt: 0,
      nextJumpDelayMs: randomInRange(encounter.jumpCooldownRangeMs.min, encounter.jumpCooldownRangeMs.max),
      lastBossHitAt: 0,
      defeatStartedAt: 0,
      lastBlinkToggleAt: 0,
      isBossVisible: true,
    };
  }, []);

  const clearPlatformsAboveBossArena = useCallback((encounter: ActiveBossEncounter) => {
    if (!engineRef.current) return;

    const arenaTopY = Math.min(...encounter.arenaBodies.map(platform => platform.position.y));

    // Remove previously generated blue platforms only after the player reaches the boss arena.
    platformsRef.current = platformsRef.current.filter(platform => {
      const isBossArenaPlatform = encounter.arenaBodies.includes(platform);
      const isAboveArena = platform.position.y < arenaTopY;

      if (!isBossArenaPlatform && isAboveArena) {
        Matter.World.remove(engineRef.current!.world, platform);
        return false;
      }

      return true;
    });

    // Clear hazards above the arena so the fight starts on a clean screen.
    bombsRef.current = bombsRef.current.filter(bomb => bomb.y >= arenaTopY);
  }, []);

  const spawnGigaballBoss = useCallback((encounter: ActiveBossEncounter, width: number) => {
    if (!engineRef.current || encounter.bossBody) return;

    // Boss spawns above the center arena segment to start the encounter cleanly.
    const centerSegment = encounter.arenaSegments[Math.floor(encounter.arenaSegments.length / 2)];
    const spawnX = centerSegment ? centerSegment.x : width / 2;
    const spawnY = encounter.arenaBodies[0].bounds.min.y - encounter.bossRadius - 4;
    const bossBody = Matter.Bodies.circle(
      spawnX,
      spawnY,
      encounter.bossRadius,
      {
        label: 'gigaball',
        restitution: 0.25,
        friction: 0.02,
        density: 0.006,
      }
    );

    // Side walls keep boss and player inside the encounter arena bounds.
    const wallThickness = 20;
    const wallHeight = canvasRef.current ? canvasRef.current.height : 900;
    const leftWall = Matter.Bodies.rectangle(
      wallThickness / 2,
      wallHeight / 2,
      wallThickness,
      wallHeight,
      { isStatic: true, label: `bossBoundaryLeft-${encounter.config.id}` }
    );
    const rightWall = Matter.Bodies.rectangle(
      width - (wallThickness / 2),
      wallHeight / 2,
      wallThickness,
      wallHeight,
      { isStatic: true, label: `bossBoundaryRight-${encounter.config.id}` }
    );

    Matter.World.add(engineRef.current.world, [bossBody, leftWall, rightWall]);
    encounter.bossBody = bossBody;
    encounter.sideWalls = [leftWall, rightWall];
    encounter.state = 'active';
    encounter.lastBossJumpAt = Date.now();
    encounter.nextJumpDelayMs = randomInRange(
      encounter.config.jumpCooldownRangeMs.min,
      encounter.config.jumpCooldownRangeMs.max
    );

    emitBossHud({
      visible: true,
      name: encounter.config.name,
      hp: encounter.bossHp,
      maxHp: encounter.maxBossHp,
    });
  }, [emitBossHud]);

  const cleanupEncounterBounds = useCallback((encounter: ActiveBossEncounter) => {
    if (!engineRef.current) return;
    if (encounter.sideWalls.length > 0) {
      Matter.World.remove(engineRef.current.world, encounter.sideWalls);
      encounter.sideWalls = [];
    }
  }, []);

  const spawnThreeHundredChallenge = useCallback((width: number, height: number) => {
    if (!engineRef.current || challenge300Ref.current.platformCreated) return;

    // Re-create the original 300m gate as a non-boss wall-breaking challenge.
    const platformWidth = width * 0.8;
    const platformX = width / 2;
    const platformY = height + 200;
    const challengePlatform = Matter.Bodies.rectangle(
      platformX,
      platformY,
      platformWidth,
      PLATFORM_HEIGHT,
      {
        isStatic: true,
        label: 'challenge300',
        friction: 0.8,
      }
    );

    const wallWidth = 30;
    const wallHeight = 60;
    const wallX = platformX;
    const wallY = platformY - (PLATFORM_HEIGHT / 2) - (wallHeight / 2);
    const wallBody = Matter.Bodies.rectangle(
      wallX,
      wallY,
      wallWidth,
      wallHeight,
      {
        isStatic: true,
        label: 'breakableWall',
        friction: 0.5,
        restitution: 0.3,
      }
    );

    Matter.World.add(engineRef.current.world, [challengePlatform, wallBody]);
    platformsRef.current.push(challengePlatform);
    breakableWallRef.current = {
      body: wallBody,
      x: wallX,
      y: wallY,
      width: wallWidth,
      height: wallHeight,
      hits: 0,
      maxHits: 3,
    };
    challenge300Ref.current = {
      platformCreated: true,
      isOnPlatform: false,
      wallBroken: false,
    };
  }, []);

  const initializeGame = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // Clean up previous engine to prevent memory leaks across restarts.
    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
    }

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 2 },
    });
    engineRef.current = engine;

    // Player ball starts in screen center for predictable early control.
    const ball = Matter.Bodies.circle(width / 2, height / 2, BALL_RADIUS, {
      restitution: 0.3,
      friction: 0.01,
      density: 0.004,
      label: 'ball',
    });
    ballRef.current = ball;
    Matter.World.add(engine.world, ball);

    const initialPlatforms: Matter.Body[] = [];
    if (mode === 'level' && customPlatforms.length > 0) {
      customPlatforms.forEach(platformData => {
        const platform = Matter.Bodies.rectangle(
          platformData.x + platformData.width / 2,
          platformData.y + platformData.height / 2,
          platformData.width,
          platformData.height,
          {
            isStatic: true,
            label: platformData.isFinish ? 'finish' : 'platform',
            friction: 0.8,
          }
        );
        initialPlatforms.push(platform);

        // Finish walls ensure the finish area acts like a small room.
        if (platformData.isFinish) {
          const leftWall = Matter.Bodies.rectangle(
            platformData.x - 2.5,
            platformData.y - 15,
            5,
            30,
            { isStatic: true, label: 'wall', friction: 0.8 }
          );
          const rightWall = Matter.Bodies.rectangle(
            platformData.x + platformData.width + 2.5,
            platformData.y - 15,
            5,
            30,
            { isStatic: true, label: 'wall', friction: 0.8 }
          );
          const backWall = Matter.Bodies.rectangle(
            platformData.x + platformData.width / 2,
            platformData.y - 28,
            platformData.width,
            5,
            { isStatic: true, label: 'wall', friction: 0.8 }
          );
          initialPlatforms.push(leftWall, rightWall, backWall);
        }
      });
    } else {
      // Infinite mode starts with a safe set of random platforms.
      const firstPlatformY = height / 2 + 150;
      const firstPlatform = Matter.Bodies.rectangle(
        width / 2,
        firstPlatformY,
        200,
        PLATFORM_HEIGHT,
        { isStatic: true, label: 'platform', friction: 0.8 }
      );
      initialPlatforms.push(firstPlatform);

      const difficulty = getDifficultySettings(0);
      for (let index = 1; index < 6; index++) {
        const platformWidth = randomInRange(difficulty.platformMinWidth, difficulty.platformMaxWidth);
        const platformX = randomInRange(platformWidth / 2, width - (platformWidth / 2));
        const platformY = firstPlatformY + index * randomInRange(difficulty.platformGapMin, difficulty.platformGapMax);
        const platform = Matter.Bodies.rectangle(
          platformX,
          platformY,
          platformWidth,
          PLATFORM_HEIGHT,
          { isStatic: true, label: 'platform', friction: 0.8 }
        );
        initialPlatforms.push(platform);
      }
    }

    platformsRef.current = initialPlatforms;
    Matter.World.add(engine.world, initialPlatforms);

    // Seed bombs in infinite mode only.
    const initialBombs: Bomb[] = [];
    if (mode === 'infinite') {
      initialPlatforms.forEach((platform, index) => {
        if (index === 0) return;
        const bomb = createBombOnPlatform(platform, `initial-${index}`);
        if (bomb) initialBombs.push(bomb);
      });
    }
    bombsRef.current = initialBombs;

    // Reset dynamic run state.
    scrollDistanceRef.current = 0;
    const initialSpeed = scrollSpeedForHeight(height, INITIAL_SCROLL_SECONDS);
    scrollSpeedRef.current = initialSpeed;
    originalScrollSpeedRef.current = initialSpeed;
    nextBossEncounterIndexRef.current = 0;
    activeBossEncounterRef.current = null;
    challenge300Ref.current = {
      platformCreated: false,
      isOnPlatform: false,
      wallBroken: false,
    };
    breakableWallRef.current = null;
    emitBossHud(null);
    // Cache the 2D rendering context so we don't look it up every frame.
    ctxRef.current = canvas.getContext('2d');
  }, [mode, customPlatforms, getDifficultySettings, createBombOnPlatform, emitBossHud]);

  // Centralized frame scheduling keeps requestAnimationFrame flow consistent.
  const scheduleNextFrame = useCallback(() => {
    animationFrameRef.current = requestAnimationFrame((nextFrameTime) => {
      gameLoopRef.current(nextFrameTime);
    });
  }, []);

  const gameLoop = useCallback((currentTime: number) => {
    try {
      if (!isPlaying || !engineRef.current || !canvasRef.current || !ballRef.current) {
        // Keep looping so startup race conditions do not permanently stall rendering.
        scheduleNextFrame();
        return;
      }

      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!ctx) {
        scheduleNextFrame();
        return;
      }

    const width = canvas.width;
    const height = canvas.height;

    // Handle revival: reposition ball to a safe platform
    if (reviveSignalRef?.current && ballRef.current) {
      const ball = ballRef.current;
      // Find the nearest visible platform to place the ball on
      const visiblePlatforms = platformsRef.current.filter(
        (p) => p.position.y > 0 && p.position.y < height && !p.label.startsWith('wall')
      );
      if (visiblePlatforms.length > 0) {
        // Pick the platform closest to screen center
        const centerY = height / 2;
        const best = visiblePlatforms.reduce((a, b) =>
          Math.abs(a.position.y - centerY) < Math.abs(b.position.y - centerY) ? a : b
        );
        Matter.Body.setPosition(ball, {
          x: best.position.x,
          y: best.bounds.min.y - BALL_RADIUS - 2,
        });
      } else {
        // Fallback: center of screen
        Matter.Body.setPosition(ball, { x: width / 2, y: height / 2 });
      }
      Matter.Body.setVelocity(ball, { x: 0, y: 0 });
      reviveSignalRef.current = false;
    }

    // Fixed-step accumulator: physics runs at a consistent 60Hz regardless of monitor refresh rate.
    const FIXED_DT = 16.67;
    if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = currentTime;
    let elapsed = currentTime - lastFrameTimeRef.current;
    lastFrameTimeRef.current = currentTime;
    // Clamp to avoid spiral-of-death when tab is backgrounded
    if (elapsed > 100) elapsed = FIXED_DT;
    accumulatorRef.current += elapsed;
    while (accumulatorRef.current >= FIXED_DT) {
      Matter.Engine.update(engineRef.current, FIXED_DT);
      accumulatorRef.current -= FIXED_DT;
    }

    // Scale factor for per-frame movement (scrolling, bombs) so speed is
    // consistent regardless of monitor refresh rate. 1.0 = 60 Hz baseline.
    const dtScale = elapsed / FIXED_DT;

    const ball = ballRef.current;
    const currentControls = controlsRef.current;

    if (currentControls.left) Matter.Body.applyForce(ball, ball.position, { x: -0.005, y: 0 });
    if (currentControls.right) Matter.Body.applyForce(ball, ball.position, { x: 0.005, y: 0 });

    isGroundedRef.current = isBodyGroundedOnPlatforms(ball, BALL_RADIUS);
    if (currentControls.jump && isGroundedRef.current && !hasJumpedRef.current) {
      Matter.Body.applyForce(ball, ball.position, { x: 0, y: -JUMP_FORCE });
      hasJumpedRef.current = true;
    }
    if (!currentControls.jump) hasJumpedRef.current = false;

    const activeEncounter = activeBossEncounterRef.current;
    const now = Date.now();

    // Trigger the restored 300m wall challenge before any boss encounters.
    if (mode === 'infinite' && !challenge300Ref.current.platformCreated) {
      const currentDistance = Math.floor(scrollDistanceRef.current / 10);
      if (currentDistance >= 300) {
        spawnThreeHundredChallenge(width, height);
      }
    }

    // Resolve the 300m wall challenge when the player lands on the gold platform.
    if (challenge300Ref.current.platformCreated && !challenge300Ref.current.wallBroken) {
      const challengePlatform = platformsRef.current.find(platform => platform.label === 'challenge300');
      if (challengePlatform) {
        const ballBottom = ball.position.y + BALL_RADIUS;
        const verticalDistance = Math.abs(ballBottom - challengePlatform.bounds.min.y);
        const ballLeft = ball.position.x - BALL_RADIUS;
        const ballRight = ball.position.x + BALL_RADIUS;
        const horizontalOverlap = ballRight > challengePlatform.bounds.min.x && ballLeft < challengePlatform.bounds.max.x;
        const platformInView = challengePlatform.position.y < height;
        const isOnChallengePlatform = verticalDistance < 20 && horizontalOverlap && platformInView && Math.abs(ball.velocity.y) < 10;

        if (isOnChallengePlatform && !challenge300Ref.current.isOnPlatform) {
          originalScrollSpeedRef.current = scrollSpeedRef.current;
          scrollSpeedRef.current = 0;
          challenge300Ref.current.isOnPlatform = true;
        }

        // If player fell off the challenge platform, resume scrolling so they don't softlock.
        if (challenge300Ref.current.isOnPlatform && !isOnChallengePlatform && ball.position.y < challengePlatform.bounds.min.y - 50) {
          scrollSpeedRef.current = originalScrollSpeedRef.current || scrollSpeedForHeight(height, INITIAL_SCROLL_SECONDS);
          challenge300Ref.current.isOnPlatform = false;
        }
      }

      // The wall still breaks by repeatedly colliding with it during the 300m challenge.
      if (breakableWallRef.current) {
        const wall = breakableWallRef.current;
        const wallBody = wall.body;
        const wallCenterX = wallBody.position.x;
        const wallCenterY = wallBody.position.y;
        const wallHalfWidth = wall.width / 2;
        const wallHalfHeight = wall.height / 2;
        const closestX = Math.max(wallCenterX - wallHalfWidth, Math.min(ball.position.x, wallCenterX + wallHalfWidth));
        const closestY = Math.max(wallCenterY - wallHalfHeight, Math.min(ball.position.y, wallCenterY + wallHalfHeight));
        const distanceX = ball.position.x - closestX;
        const distanceY = ball.position.y - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        const isColliding = distanceSquared < ((BALL_RADIUS + 5) * (BALL_RADIUS + 5));
        const hasVelocity = Math.abs(ball.velocity.x) > 1 || Math.abs(ball.velocity.y) > 1;

        if (isColliding && hasVelocity) {
          const lastHitTime = (wallBody.plugin?.lastHitTime as number | undefined) || 0;
          if (now - lastHitTime > 500) {
            wall.hits += 1;
            wallBody.plugin = { ...wallBody.plugin, lastHitTime: now };

            const bounceX = ball.position.x < wallCenterX ? -0.1 : 0.1;
            Matter.Body.applyForce(ball, ball.position, { x: bounceX, y: -0.05 });

            if (wall.hits >= wall.maxHits) {
              Matter.World.remove(engineRef.current.world, wallBody);
              breakableWallRef.current = null;
              challenge300Ref.current.wallBroken = true;
              scrollSpeedRef.current = originalScrollSpeedRef.current || scrollSpeedForHeight(height, INITIAL_SCROLL_SECONDS);
            }
          }
        }
      }
    }

    // Trigger next configured boss encounter by explicit level list.
    if (mode === 'infinite' && !activeEncounter && challenge300Ref.current.wallBroken) {
      const currentDistance = Math.floor(scrollDistanceRef.current / 10);
      const nextEncounter = sortedBossEncountersRef.current[nextBossEncounterIndexRef.current];
      if (nextEncounter && currentDistance >= nextEncounter.levelMeters) {
        spawnBossArenaEncounter(nextEncounter, width, height);
      }
    }

    // Boss encounter state machine: approach -> active -> defeating.
    if (activeEncounter) {
      if (activeEncounter.state === 'approaching') {
        // Stop scrolling once player reaches the arena so combat is stationary.
        const isOnArena = activeEncounter.arenaBodies.some(platform => {
          const ballBottom = ball.position.y + BALL_RADIUS;
          const verticalDistance = Math.abs(ballBottom - platform.bounds.min.y);
          const ballLeft = ball.position.x - BALL_RADIUS;
          const ballRight = ball.position.x + BALL_RADIUS;
          const horizontalOverlap = ballRight > platform.bounds.min.x && ballLeft < platform.bounds.max.x;
          const platformInView = platform.position.y < height;
          return verticalDistance < 20 && horizontalOverlap && platformInView && Math.abs(ball.velocity.y) < 10;
        });

        if (isOnArena) {
          originalScrollSpeedRef.current = scrollSpeedRef.current;
          scrollSpeedRef.current = 0;
          clearPlatformsAboveBossArena(activeEncounter);
          spawnGigaballBoss(activeEncounter, width);
        }
      } else if (activeEncounter.state === 'active' && activeEncounter.bossBody) {
        const boss = activeEncounter.bossBody;

        // Keep boss inside the screen horizontally.
        const clampedX = Math.max(
          activeEncounter.bossRadius + 20,
          Math.min(width - activeEncounter.bossRadius - 20, boss.position.x)
        );
        if (clampedX !== boss.position.x) {
          Matter.Body.setPosition(boss, { x: clampedX, y: boss.position.y });
          Matter.Body.setVelocity(boss, { x: boss.velocity.x * 0.2, y: boss.velocity.y });
        }

        // Teleport boss back to arena if it starts falling through a hole.
        if (boss.position.y > height - activeEncounter.bossRadius) {
          const rescueSegment = activeEncounter.arenaSegments[
            Math.floor(Math.random() * activeEncounter.arenaSegments.length)
          ];
          Matter.Body.setPosition(boss, {
            x: rescueSegment.x,
            y: rescueSegment.y - (PLATFORM_HEIGHT / 2) - activeEncounter.bossRadius - 4,
          });
          Matter.Body.setVelocity(boss, { x: 0, y: 0 });
        }

        // Gigaball uses a larger grounding tolerance so it reliably detects platform contact.
        const bossGrounded = isBodyGroundedOnPlatforms(boss, activeEncounter.bossRadius, 18);
        const cooldownReady = now - activeEncounter.lastBossJumpAt >= activeEncounter.nextJumpDelayMs;
        const stableEnoughForJump = Math.abs(boss.velocity.y) < 1.2;
        if (cooldownReady && (bossGrounded || stableEnoughForJump)) {
          const targetSegment = activeEncounter.arenaSegments[
            Math.floor(Math.random() * activeEncounter.arenaSegments.length)
          ];
          const direction = Math.sign(targetSegment.x - boss.position.x);
          const jumpForce = randomInRange(
            activeEncounter.config.jumpForceRange.min,
            activeEncounter.config.jumpForceRange.max
          );

          // Randomized jump direction and strength creates unpredictable boss movement.
          Matter.Body.applyForce(boss, boss.position, {
            x: direction * 0.01,
            y: -jumpForce,
          });

          activeEncounter.lastBossJumpAt = now;
          activeEncounter.nextJumpDelayMs = randomInRange(
            activeEncounter.config.jumpCooldownRangeMs.min,
            activeEncounter.config.jumpCooldownRangeMs.max
          );
        }

        // Player touching Gigaball reduces boss HP (player takes no damage).
        const bossDistance = Math.hypot(ball.position.x - boss.position.x, ball.position.y - boss.position.y);
        const isTouchingBoss = bossDistance < (BALL_RADIUS + activeEncounter.bossRadius);
        if (isTouchingBoss && now - activeEncounter.lastBossHitAt >= activeEncounter.config.contactDamageCooldownMs) {
          activeEncounter.lastBossHitAt = now;
          activeEncounter.bossHp = Math.max(0, activeEncounter.bossHp - activeEncounter.config.contactDamageAmount);
          emitBossHud({
            visible: true,
            name: activeEncounter.config.name,
            hp: activeEncounter.bossHp,
            maxHp: activeEncounter.maxBossHp,
          });

          const bounceX = Math.sign(boss.position.x - ball.position.x) || 1;
          Matter.Body.applyForce(boss, boss.position, { x: bounceX * 0.05, y: -0.03 });

          if (activeEncounter.bossHp <= 0) {
            activeEncounter.state = 'defeating';
            activeEncounter.defeatStartedAt = now;
            activeEncounter.lastBlinkToggleAt = now;
            activeEncounter.isBossVisible = true;
          }
        }
      } else if (activeEncounter.state === 'defeating' && activeEncounter.bossBody) {
        // Blink animation before boss despawns.
        if (now - activeEncounter.lastBlinkToggleAt >= activeEncounter.config.defeatBlinkIntervalMs) {
          activeEncounter.lastBlinkToggleAt = now;
          activeEncounter.isBossVisible = !activeEncounter.isBossVisible;
        }

        if (now - activeEncounter.defeatStartedAt >= activeEncounter.config.defeatBlinkDurationMs) {
          Matter.World.remove(engineRef.current.world, activeEncounter.bossBody);
          activeEncounter.bossBody = null;
          cleanupEncounterBounds(activeEncounter);
          emitBossHud(null);

          // Resume scrolling and advance to next explicit encounter entry.
          scrollSpeedRef.current = originalScrollSpeedRef.current || scrollSpeedForHeight(height, INITIAL_SCROLL_SECONDS);
          nextBossEncounterIndexRef.current += 1;
          activeBossEncounterRef.current = null;
        }
      }
    }

    // Scroll platforms and bombs while the world is moving.
    // Multiply by dtScale so scroll speed is consistent across refresh rates.
    const frameScroll = scrollSpeedRef.current * dtScale;
    platformsRef.current.forEach(platform => {
      Matter.Body.setPosition(platform, {
        x: platform.position.x,
        y: platform.position.y - frameScroll,
      });

      if (mode === 'level' && platform.label === 'finish') {
        const distanceToFinish = Math.hypot(
          ball.position.x - platform.position.x,
          ball.position.y - platform.position.y
        );
        if (distanceToFinish < 30 && onFinishRef.current) {
          onFinishRef.current();
        }
      }
    });
    bombsRef.current.forEach(bomb => {
      bomb.y -= frameScroll;
    });

    // The 300m wall should scroll with the world until the player reaches the platform.
    if (breakableWallRef.current) {
      const wall = breakableWallRef.current;
      const shouldScrollWall = !challenge300Ref.current.isOnPlatform || challenge300Ref.current.wallBroken;
      if (shouldScrollWall && scrollSpeedRef.current > 0) {
        Matter.Body.setPosition(wall.body, {
          x: wall.body.position.x,
          y: wall.body.position.y - frameScroll,
        });
        wall.y -= frameScroll;
      }
    }

    scrollDistanceRef.current += frameScroll;
    onDistanceUpdateRef.current(Math.floor(scrollDistanceRef.current / 10));

    // Only add/remove random platforms outside active boss fights.
    if (mode === 'infinite') {
      platformsRef.current = platformsRef.current.filter(platform => {
        if (platform.position.y < -PLATFORM_HEIGHT) {
          Matter.World.remove(engineRef.current!.world, platform);
          return false;
        }
        return true;
      });

      bombsRef.current = bombsRef.current.filter(bomb => bomb.y > -BOMB_RADIUS * 2);

      const hasActiveBossFight = !!activeBossEncounterRef.current;
      const hasActiveThreeHundredChallenge = challenge300Ref.current.platformCreated && !challenge300Ref.current.wallBroken;
      if (!hasActiveBossFight && !hasActiveThreeHundredChallenge && platformsRef.current.length > 0) {
        const currentDistance = Math.floor(scrollDistanceRef.current / 10);
        const lowestPlatform = platformsRef.current.reduce((lowest, platform) =>
          platform.position.y > lowest.position.y ? platform : lowest
        , platformsRef.current[0]);

        if (lowestPlatform.position.y < height + PLATFORM_SPAWN_Y) {
          const difficulty = getDifficultySettings(currentDistance);
          const platformWidth = randomInRange(difficulty.platformMinWidth, difficulty.platformMaxWidth);
          const platformX = randomInRange(platformWidth / 2, width - (platformWidth / 2));
          const gap = randomInRange(difficulty.platformGapMin, difficulty.platformGapMax);
          const platformY = lowestPlatform.position.y + gap;

          const newPlatform = Matter.Bodies.rectangle(
            platformX,
            platformY,
            platformWidth,
            PLATFORM_HEIGHT,
            { isStatic: true, label: 'platform', friction: 0.8 }
          );
          platformsRef.current.push(newPlatform);
          Matter.World.add(engineRef.current.world, newPlatform);

          const newBomb = createBombOnPlatform(newPlatform, `platform-${Date.now()}`);
          if (newBomb) bombsRef.current.push(newBomb);
        }
      }
    }

    // Bombs still cause instant game over as before.
    bombsRef.current.forEach(bomb => {
      const distanceToBomb = Math.hypot(ball.position.x - bomb.x, ball.position.y - bomb.y);
      if (distanceToBomb < BALL_RADIUS + bomb.radius) {
        onGameOverRef.current();
      }
    });

    // Falling off-screen is still a lose condition.
    if (ball.position.y < 0 || ball.position.y > height) {
      onGameOverRef.current();
      return;
    }

    // Render: sky background.
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, width, height);

    // Render all platforms, including boss arena segments.
    platformsRef.current.forEach(platform => {
      const vertices = platform.vertices;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let index = 1; index < vertices.length; index++) {
        ctx.lineTo(vertices[index].x, vertices[index].y);
      }
      ctx.closePath();

      if (platform.label === 'challenge300' || platform.label.startsWith('bossArena')) {
        ctx.fillStyle = '#F1C40F';
      } else if (platform.label === 'finish') {
        ctx.fillStyle = '#00ff00';
      } else if (platform.label === 'wall') {
        ctx.fillStyle = '#228b22';
        ctx.globalAlpha = 0.7;
      } else {
        ctx.fillStyle = '#4a90e2';
      }

      ctx.fill();
      ctx.globalAlpha = 1;

      if (platform.label !== 'wall') {
        ctx.strokeStyle = platform.label === 'challenge300' || platform.label.startsWith('bossArena') ? '#C97B00' : '#2c5aa0';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });

    // Draw the 300m breakable wall with damage feedback and hit counter.
    if (breakableWallRef.current) {
      const wall = breakableWallRef.current;
      const wallBody = wall.body;
      const vertices = wallBody.vertices;
      const damageLevel = wall.hits / wall.maxHits;
      const baseColor = damageLevel === 0 ? '#8B4513' : damageLevel < 0.5 ? '#654321' : '#3E2723';

      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let index = 1; index < vertices.length; index++) {
        ctx.lineTo(vertices[index].x, vertices[index].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4E342E';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${wall.hits}/${wall.maxHits}`, wall.x, wallBody.bounds.min.y - 10);
    }

    // Render bombs.
    bombsRef.current.forEach(bomb => {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Render boss (Gigaball) when active and visible.
    const encounterForDraw = activeBossEncounterRef.current;
    if (encounterForDraw?.bossBody && encounterForDraw.isBossVisible) {
      const bossBody = encounterForDraw.bossBody;
      const bossRadius = encounterForDraw.bossRadius;

      ctx.fillStyle = '#7722ff';
      ctx.beginPath();
      ctx.arc(bossBody.position.x, bossBody.position.y, bossRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4b0082';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Render player ball with optional image skin.
    ctx.save();
    ctx.fillStyle = ballColor;
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    if (ballImageRef.current && ballImageLoadedRef.current) {
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const originalFilter = ctx.filter;
      if (ballImageFilter) ctx.filter = ballImageFilter;
      const imageSize = BALL_RADIUS * 2 - 4;
      ctx.drawImage(
        ballImageRef.current,
        ball.position.x - (imageSize / 2),
        ball.position.y - (imageSize / 2),
        imageSize,
        imageSize
      );
      ctx.filter = originalFilter;
    }
    ctx.restore();

    ctx.strokeStyle = ballStrokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();

    // Optional fight banner for readability while boss HUD is visible.
    if (challenge300Ref.current.platformCreated && !challenge300Ref.current.wallBroken) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect((width / 2) - 200, 50, 400, 80);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('300m CHALLENGE!', width / 2, 84);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '18px Arial';
      ctx.fillText('Hit the wall 3 times to break it!', width / 2, 114);
    } else if (encounterForDraw) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect((width / 2) - 180, 50, 360, 60);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${encounterForDraw.config.name} Encounter`, width / 2, 87);
    }

      scheduleNextFrame();
    } catch (error) {
      // Recover from unexpected runtime errors without freezing the canvas.
      console.error('Game loop runtime error:', error);
      scheduleNextFrame();
    }
  }, [
    ballColor,
    ballImageFilter,
    ballStrokeColor,
    clearPlatformsAboveBossArena,
    cleanupEncounterBounds,
    createBombOnPlatform,
    emitBossHud,
    getDifficultySettings,
    isBodyGroundedOnPlatforms,
    isPlaying,
    mode,
    scheduleNextFrame,
    spawnThreeHundredChallenge,
    spawnBossArenaEncounter,
    spawnGigaballBoss,
  ]);

  const handleResize = useCallback(() => {
    // Resize canvas to viewport dimensions. Use visualViewport on mobile
    // to account for browser chrome (URL bar, toolbar).
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevHeight = canvas.height;
    canvas.width = window.innerWidth;
    canvas.height = window.visualViewport?.height ?? window.innerHeight;
    // Scale current scroll speed proportionally so visual speed stays constant.
    if (prevHeight > 0 && scrollSpeedRef.current > 0) {
      const ratio = canvas.height / prevHeight;
      scrollSpeedRef.current *= ratio;
      originalScrollSpeedRef.current *= ratio;
    }
  }, []);

  // Keep a mutable reference so animation frames can call the latest loop logic.
  useEffect(() => {
    gameLoopRef.current = gameLoop;
  }, [gameLoop]);

  useEffect(() => {
    handleResize();
    initializeGame();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      emitBossHud(null);
    };
  }, [emitBossHud, handleResize, initializeGame]);

  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying) {
      // Re-initialize the world if transitioning from stopped (e.g. Play Again).
      // Skip re-init if we're resuming from a revival (reviveSignalRef handles that).
      if (!wasPlayingRef.current && !reviveSignalRef?.current) {
        initializeGame();
      }
      wasPlayingRef.current = true;
      lastFrameTimeRef.current = 0;
      accumulatorRef.current = 0;
      scheduleNextFrame();
    } else {
      wasPlayingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, gameLoop, scheduleNextFrame, initializeGame, reviveSignalRef]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
}

