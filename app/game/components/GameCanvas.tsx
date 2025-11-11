'use client';

import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import { Controls, Platform, Bomb } from '@/app/lib/types';

interface GameCanvasProps {
  controls: Controls;
  onDistanceUpdate: (distance: number) => void;
  onGameOver: () => void;
  onFinish?: () => void;
  isPlaying: boolean;
  mode: 'infinite' | 'level';
  customPlatforms?: Platform[];
}

/**
 * GameCanvas Component
 * Manages the 2D physics simulation and rendering using Matter.js
 */
export default function GameCanvas({
  controls,
  onDistanceUpdate,
  onGameOver,
  onFinish,
  isPlaying,
  mode,
  customPlatforms = [],
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const platformsRef = useRef<Matter.Body[]>([]);
  const scrollDistanceRef = useRef(0);
  const scrollSpeedRef = useRef(1);
  // Animation frame ID for cleanup - undefined until requestAnimationFrame is called
  const animationFrameRef = useRef<number | undefined>(undefined);
  // Track if ball is grounded (touching a platform) for jumping
  const isGroundedRef = useRef(false);
  // Track if jump was just pressed to prevent multiple jumps from one key press
  const hasJumpedRef = useRef(false);
  // Track bombs on platforms
  const bombsRef = useRef<Bomb[]>([]);
  // Use ref for controls to prevent re-initialization
  const controlsRef = useRef(controls);
  // Track last frame time for delta calculation
  const lastFrameTimeRef = useRef<number>(0);

  // Constants
  const BALL_RADIUS = 20;
  const PLATFORM_HEIGHT = 20;
  const INITIAL_SCROLL_SPEED = 2; // Fixed starting speed for all machines (slowed down from 4)
  const SPEED_INCREASE_RATE = 0.002; // Gradual acceleration rate
  const MAX_SCROLL_SPEED = 10; // Cap maximum speed
  const PLATFORM_SPAWN_Y = 100; // Distance below screen to spawn platforms
  const JUMP_FORCE = 0.18; // Upward impulse force for jumping
  const BOMB_RADIUS = 15; // Bomb size
  const BOMB_SPAWN_CHANCE = 0.3; // 30% chance to spawn bomb on a platform
  
  // Store callbacks in refs to prevent re-creation
  const onDistanceUpdateRef = useRef(onDistanceUpdate);
  const onGameOverRef = useRef(onGameOver);
  const onFinishRef = useRef(onFinish);
  
  // Update refs when callbacks change
  useEffect(() => {
    onDistanceUpdateRef.current = onDistanceUpdate;
    onGameOverRef.current = onGameOver;
    onFinishRef.current = onFinish;
  }, [onDistanceUpdate, onGameOver, onFinish]);
  
  // Update controls ref when controls prop changes
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);
  
  /**
   * Calculate difficulty settings based on distance
   * Starts easy with wide platforms and small gaps
   * Gradually gets harder as distance increases
   */
  const getDifficultySettings = useCallback((distance: number) => {
    // Start with easy settings, gradually increase difficulty
    const progressFactor = Math.min(distance / 500, 1); // Max difficulty at 500m
    
    return {
      platformMinWidth: 180 - (progressFactor * 80), // 180 -> 100
      platformMaxWidth: 300 - (progressFactor * 50),  // 300 -> 250
      platformGapMin: 80 + (progressFactor * 70),     // 80 -> 150
      platformGapMax: 120 + (progressFactor * 80),    // 120 -> 200
    };
  }, []);

  /**
   * Create a bomb on a platform
   * @param platform - The Matter.js platform body
   * @returns Bomb object or null if not spawned
   */
  const createBombOnPlatform = useCallback((platform: Matter.Body, platformId: string): Bomb | null => {
    // Random chance to spawn bomb
    if (Math.random() > BOMB_SPAWN_CHANCE) return null;
    
    // Place bomb on center of platform
    const platformCenterX = platform.position.x;
    const platformTop = platform.bounds.min.y;
    
    return {
      id: `bomb-${platformId}-${Date.now()}`,
      x: platformCenterX,
      y: platformTop - BOMB_RADIUS - 5, // Place on top of platform
      radius: BOMB_RADIUS
    };
  }, [BOMB_RADIUS, BOMB_SPAWN_CHANCE]);

  /**
   * Initialize Matter.js engine and create initial game objects
   */
  const initializeGame = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // Create engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1 }
    });
    engineRef.current = engine;

    // Create ball at middle of screen (centered vertically)
    const ball = Matter.Bodies.circle(
      width / 2,
      height / 2,
      BALL_RADIUS,
      {
        restitution: 0.3, // Slight bounce
        friction: 0.01,
        density: 0.004,
        label: 'ball',
      }
    );
    ballRef.current = ball;
    Matter.World.add(engine.world, ball);

    // Create initial platforms based on mode
    const initialPlatforms: Matter.Body[] = [];
    
    if (mode === 'level' && customPlatforms.length > 0) {
      // Level mode: create platforms from custom layout
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
        
        // Add walls for finish platforms
        if (platformData.isFinish) {
          // Left wall
          const leftWall = Matter.Bodies.rectangle(
            platformData.x - 2.5,
            platformData.y - 15,
            5,
            30,
            {
              isStatic: true,
              label: 'wall',
              friction: 0.8,
            }
          );
          initialPlatforms.push(leftWall);
          
          // Right wall
          const rightWall = Matter.Bodies.rectangle(
            platformData.x + platformData.width + 2.5,
            platformData.y - 15,
            5,
            30,
            {
              isStatic: true,
              label: 'wall',
              friction: 0.8,
            }
          );
          initialPlatforms.push(rightWall);
          
          // Back wall
          const backWall = Matter.Bodies.rectangle(
            platformData.x + platformData.width / 2,
            platformData.y - 28,
            platformData.width,
            5,
            {
              isStatic: true,
              label: 'wall',
              friction: 0.8,
            }
          );
          initialPlatforms.push(backWall);
        }
      });
    } else {
      // Infinite mode: generate random platforms
      // First platform directly below ball (centered vertically)
      const firstPlatformY = height / 2 + 150; // Platform positioned below the centered ball
      const firstPlatform = Matter.Bodies.rectangle(
        width / 2,
        firstPlatformY,
        200,
        PLATFORM_HEIGHT,
        {
          isStatic: true,
          label: 'platform',
          friction: 0.8,
        }
      );
      initialPlatforms.push(firstPlatform);

      // Add more platforms going down (start with easy difficulty)
      const difficulty = getDifficultySettings(0);
      for (let i = 1; i < 6; i++) {
        const platformWidth = Math.random() * (difficulty.platformMaxWidth - difficulty.platformMinWidth) + difficulty.platformMinWidth;
        const platformX = Math.random() * (width - platformWidth) + platformWidth / 2;
        const platformY = firstPlatformY + i * (difficulty.platformGapMin + Math.random() * (difficulty.platformGapMax - difficulty.platformGapMin));
        
        const platform = Matter.Bodies.rectangle(
          platformX,
          platformY,
          platformWidth,
          PLATFORM_HEIGHT,
          {
            isStatic: true,
            label: 'platform',
            friction: 0.8,
          }
        );
        initialPlatforms.push(platform);
      }
    }

    platformsRef.current = initialPlatforms;
    Matter.World.add(engine.world, initialPlatforms);

    // Create initial bombs on platforms (only in infinite mode)
    const initialBombs: Bomb[] = [];
    if (mode === 'infinite') {
      initialPlatforms.forEach((platform, index) => {
        if (index > 0) { // Don't put bomb on first platform
          const bomb = createBombOnPlatform(platform, `initial-${index}`);
          if (bomb) {
            initialBombs.push(bomb);
          }
        }
      });
    }
    bombsRef.current = initialBombs;

    scrollDistanceRef.current = 0;
    scrollSpeedRef.current = INITIAL_SCROLL_SPEED;
  }, [createBombOnPlatform]);

  /**
   * Game loop - updates physics and renders
   */
  const gameLoop = useCallback((currentTime: number) => {
    if (!isPlaying || !engineRef.current || !canvasRef.current || !ballRef.current) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const width = canvas.width;
    const height = canvas.height;

    // Calculate delta time for frame-rate independent physics
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = currentTime;
    }
    const deltaTime = currentTime - lastFrameTimeRef.current;
    lastFrameTimeRef.current = currentTime;
    
    // Clamp delta time to prevent huge jumps (max 50ms = 20 FPS minimum)
    const clampedDelta = Math.min(deltaTime, 50);
    
    // Use fixed timestep for consistent physics (16.67ms = 60 FPS)
    const fixedDelta = 16.67;

    // Update physics with fixed timestep
    Matter.Engine.update(engineRef.current, fixedDelta);

    // Apply horizontal force to ball based on controls (use ref to avoid re-renders)
    // Reduced force to match slower scroll speed (was 0.015, now 0.005)
    const ball = ballRef.current;
    const currentControls = controlsRef.current;
    
    if (currentControls.left) {
      Matter.Body.applyForce(ball, ball.position, { x: -0.005, y: 0 });
    }
    if (currentControls.right) {
      Matter.Body.applyForce(ball, ball.position, { x: 0.005, y: 0 });
    }

    // Check if ball is grounded by detecting platforms below it
    // Ball is grounded if velocity is very small and there's a platform nearby
    const isCurrentlyGrounded = Math.abs(ball.velocity.y) < 3 && platformsRef.current.some(platform => {
      // Check if ball is close to top of platform
      const ballBottom = ball.position.y + BALL_RADIUS;
      const platformTop = platform.bounds.min.y;
      const verticalDistance = Math.abs(ballBottom - platformTop);
      
      // Check horizontal overlap
      const ballLeft = ball.position.x - BALL_RADIUS;
      const ballRight = ball.position.x + BALL_RADIUS;
      const platformLeft = platform.bounds.min.x;
      const platformRight = platform.bounds.max.x;
      const horizontalOverlap = ballRight > platformLeft && ballLeft < platformRight;
      
      return verticalDistance < 8 && horizontalOverlap;
    });
    
    isGroundedRef.current = isCurrentlyGrounded;

    // Handle jumping - only when grounded and jump key is pressed
    if (currentControls.jump && isGroundedRef.current && !hasJumpedRef.current) {
      // Apply small upward impulse for jump
      Matter.Body.applyForce(ball, ball.position, { x: 0, y: -JUMP_FORCE });
      hasJumpedRef.current = true;
    }

    // Reset jump flag when key is released
    if (!currentControls.jump) {
      hasJumpedRef.current = false;
    }

    // Scroll platforms upward and move bombs with them
    platformsRef.current.forEach(platform => {
      Matter.Body.setPosition(platform, {
        x: platform.position.x,
        y: platform.position.y - scrollSpeedRef.current,
      });
      
      // Check if ball reached finish platform in level mode
      if (mode === 'level' && platform.label === 'finish') {
        const distance = Math.sqrt(
          Math.pow(ball.position.x - platform.position.x, 2) +
          Math.pow(ball.position.y - platform.position.y, 2)
        );
        
        if (distance < 30 && onFinishRef.current) {
          onFinishRef.current();
        }
      }
    });

    // Move bombs with platforms
    bombsRef.current.forEach(bomb => {
      bomb.y -= scrollSpeedRef.current;
    });

    // Update scroll distance (speed stays constant)
    scrollDistanceRef.current += scrollSpeedRef.current;
    // Keep scroll speed constant - no acceleration
    scrollSpeedRef.current = INITIAL_SCROLL_SPEED;
    onDistanceUpdateRef.current(Math.floor(scrollDistanceRef.current / 10));

    // Only manage platforms dynamically in infinite mode
    if (mode === 'infinite') {
      // Remove platforms that scrolled off screen (above) and their associated bombs
      const platformIdsToRemove: number[] = [];
      platformsRef.current = platformsRef.current.filter((platform, index) => {
        if (platform.position.y < -PLATFORM_HEIGHT) {
          Matter.World.remove(engineRef.current!.world, platform);
          platformIdsToRemove.push(index);
          return false;
        }
        return true;
      });

      // Remove bombs that scrolled off screen
      bombsRef.current = bombsRef.current.filter(bomb => bomb.y > -BOMB_RADIUS * 2);

      // Spawn new platforms at bottom (with dynamic difficulty)
      const lowestPlatform = platformsRef.current.reduce((lowest, p) => 
        p.position.y > lowest.position.y ? p : lowest
      , platformsRef.current[0]);

      if (lowestPlatform && lowestPlatform.position.y < height + PLATFORM_SPAWN_Y) {
        const currentDistance = Math.floor(scrollDistanceRef.current / 10);
        const difficulty = getDifficultySettings(currentDistance);
        
        const platformWidth = Math.random() * (difficulty.platformMaxWidth - difficulty.platformMinWidth) + difficulty.platformMinWidth;
        const platformX = Math.random() * (width - platformWidth) + platformWidth / 2;
        const gap = difficulty.platformGapMin + Math.random() * (difficulty.platformGapMax - difficulty.platformGapMin);
        const platformY = lowestPlatform.position.y + gap;
        
        const newPlatform = Matter.Bodies.rectangle(
          platformX,
          platformY,
          platformWidth,
          PLATFORM_HEIGHT,
          {
            isStatic: true,
            label: 'platform',
            friction: 0.8,
          }
        );
        
        platformsRef.current.push(newPlatform);
        Matter.World.add(engineRef.current!.world, newPlatform);

        // Maybe spawn a bomb on the new platform
        const newBomb = createBombOnPlatform(newPlatform, `platform-${Date.now()}`);
        if (newBomb) {
          bombsRef.current.push(newBomb);
        }
      }
    }

    // Check collision between ball and bombs
    bombsRef.current.forEach(bomb => {
      const distance = Math.sqrt(
        Math.pow(ball.position.x - bomb.x, 2) +
        Math.pow(ball.position.y - bomb.y, 2)
      );
      
      // If ball touches bomb, game over!
      if (distance < BALL_RADIUS + bomb.radius) {
        onGameOverRef.current();
        return;
      }
    });

    // Check lose conditions
    if (ball.position.y < 0 || ball.position.y > height) {
      onGameOverRef.current();
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#87CEEB'; // Sky blue background
    ctx.fillRect(0, 0, width, height);

    // Draw platforms
    platformsRef.current.forEach(platform => {
      const vertices = platform.vertices;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();
      
      // Color based on type
      if (platform.label === 'finish') {
        ctx.fillStyle = '#00ff00';
      } else if (platform.label === 'wall') {
        ctx.fillStyle = '#228b22';
        ctx.globalAlpha = 0.7;
      } else {
        ctx.fillStyle = '#4a90e2';
      }
      
      ctx.fill();
      ctx.globalAlpha = 1;
      
      // Draw platform outline
      if (platform.label !== 'wall') {
        ctx.strokeStyle = platform.label === 'finish' ? '#006400' : '#2c5aa0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw bombs
    bombsRef.current.forEach(bomb => {
      // Draw bomb body (black circle)
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      
      // Bomb outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw fuse
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bomb.x, bomb.y - bomb.radius);
      ctx.lineTo(bomb.x - 3, bomb.y - bomb.radius - 8);
      ctx.stroke();
      
      // Draw spark at end of fuse (animated)
      const sparkOffset = Math.sin(Date.now() / 100) * 2;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(bomb.x - 3, bomb.y - bomb.radius - 8 + sparkOffset, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner highlight on bomb
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.arc(bomb.x - 5, bomb.y - 5, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ball
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    
    // Ball outline
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Continue loop
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [isPlaying, mode, getDifficultySettings, createBombOnPlatform, BALL_RADIUS]);

  /**
   * Handle canvas resize
   */
  const handleResize = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  // Initialize game on mount
  useEffect(() => {
    handleResize();
    initializeGame();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [initializeGame, handleResize]);

  // Start/stop game loop based on isPlaying
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = 0; // Reset frame time when starting
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, gameLoop]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
}

