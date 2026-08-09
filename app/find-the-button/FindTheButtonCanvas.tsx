'use client';

import { useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Euler, Group, InstancedMesh, Mesh, Object3D, Texture, Vector3 } from 'three';

import {
  VoxelWorld,
  Block,
  BLOCK_COLORS,
  Vec3,
  ConceptScene,
  SpawnPoint,
  LaserEmitter,
  isEmissiveBlock,
  isDynamicBlock,
} from '../lib/findTheButton';
import {
  DeathCause,
  TrapDoorState,
  createTrapDoorStates,
  stepTrapDoors,
  isTrapDoorOpen,
  isTrapDoorArming,
  isLaserOn,
  laserBounds,
  checkDeath,
} from '../lib/findTheButtonHazards';
import { createBlockTextures } from '../lib/findTheButtonTextures';
import {
  PlayerState,
  MoveInput,
  createPlayer,
  stepPlayer,
  raycastVoxel,
  EYE_HEIGHT,
} from '../lib/findTheButtonPhysics';

/** Max reach for pressing the button, in blocks. */
const REACH = 5;

/** One InstancedMesh per block type, so each type can carry its own texture. */
function BlockGroup({
  blockId,
  positions,
  texture,
}: {
  blockId: number;
  positions: Vec3[];
  texture?: Texture;
}) {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new Object3D();
    positions.forEach((pos, i) => {
      // Block (x,y,z) spans x..x+1, so its centre sits at +0.5 on each axis.
      dummy.position.set(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);

  const tint = BLOCK_COLORS[blockId] ?? '#ffffff';

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* Lamps ignore lighting so they read as the light source in the room. */}
      {isEmissiveBlock(blockId) ? (
        <meshBasicMaterial map={texture} color={tint} />
      ) : (
        <meshLambertMaterial map={texture} color={tint} />
      )}
    </instancedMesh>
  );
}

/**
 * All visible blocks, grouped by type.
 *
 * Blocks fully enclosed by neighbours are skipped — in a walled interior that
 * removes most of the shell and keeps the instance count in the low thousands.
 */
function Blocks({ world, textures }: { world: VoxelWorld; textures: Map<number, Texture> }) {
  const groups = useMemo(() => {
    const byType = new Map<number, Vec3[]>();
    for (let y = 0; y < world.sizeY; y++) {
      for (let z = 0; z < world.sizeZ; z++) {
        for (let x = 0; x < world.sizeX; x++) {
          const id = world.get(x, y, z);
          if (id === Block.Air) continue;
          // Trapdoors open and close at runtime, so they get their own meshes.
          if (isDynamicBlock(id)) continue;
          if (world.isHidden(x, y, z)) continue;
          const list = byType.get(id);
          if (list) list.push({ x, y, z });
          else byType.set(id, [{ x, y, z }]);
        }
      }
    }
    return [...byType.entries()];
  }, [world]);

  return (
    <>
      {groups.map(([id, positions]) => (
        <BlockGroup key={id} blockId={id} positions={positions} texture={textures.get(id)} />
      ))}
    </>
  );
}

/**
 * Trapdoor panels.
 *
 * Rendered as individual meshes rather than joining the static instanced mesh,
 * because they appear and disappear at runtime. An armed panel (stepped on but
 * not yet dropped) wobbles as a tell that the floor is about to go.
 */
function TrapDoors({
  scene,
  statesRef,
  texture,
}: {
  scene: ConceptScene;
  statesRef: React.RefObject<TrapDoorState[]>;
  texture?: Texture;
}) {
  const groupRefs = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    const states = statesRef.current;
    if (!states) return;

    scene.hazards.trapDoors.forEach((_, i) => {
      const group = groupRefs.current[i];
      const state = states[i];
      if (!group || !state) return;

      group.visible = !isTrapDoorOpen(state);
      // Shake while arming so the player gets a moment of warning.
      group.position.y = isTrapDoorArming(state)
        ? Math.sin(clock.elapsedTime * 40) * 0.05
        : 0;
    });
  });

  return (
    <>
      {scene.hazards.trapDoors.map((spec, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          {spec.tiles.map((tile, j) => (
            <mesh key={j} position={[tile.x + 0.5, tile.y + 0.5, tile.z + 0.5]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshLambertMaterial map={texture} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** Laser beams — thin emissive boxes toggled by each emitter's duty cycle. */
function Lasers({ lasers }: { lasers: LaserEmitter[] }) {
  const meshRefs = useRef<(Mesh | null)[]>([]);

  const geometry = useMemo(
    () =>
      lasers.map((laser) => {
        const { min, max } = laserBounds(laser);
        return {
          size: [max.x - min.x, max.y - min.y, max.z - min.z] as [number, number, number],
          centre: [
            (min.x + max.x) / 2,
            (min.y + max.y) / 2,
            (min.z + max.z) / 2,
          ] as [number, number, number],
        };
      }),
    [lasers]
  );

  useFrame(({ clock }) => {
    const timeMs = clock.elapsedTime * 1000;
    lasers.forEach((laser, i) => {
      const mesh = meshRefs.current[i];
      if (mesh) mesh.visible = isLaserOn(laser, timeMs);
    });
  });

  return (
    <>
      {geometry.map((g, i) => (
        <mesh
          key={i}
          position={g.centre}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
        >
          <boxGeometry args={g.size} />
          {/* Unlit and slightly transparent so beams glow in a dim corridor. */}
          <meshBasicMaterial color="#ff2d2d" transparent opacity={0.75} />
        </mesh>
      ))}
    </>
  );
}

/**
 * First-person controller.
 *
 * Camera rotation is owned by PointerLockControls; this component owns position
 * and feeds the camera each frame from the simulated player box.
 */
function Player({
  scene,
  trapDoorStatesRef,
  onTargetChange,
  onPress,
  onDeath,
  registerPress,
}: {
  scene: ConceptScene;
  trapDoorStatesRef: React.RefObject<TrapDoorState[]>;
  onTargetChange: (targetingButton: boolean) => void;
  onPress: () => void;
  onDeath: (cause: DeathCause, nextSpawn: SpawnPoint) => void;
  registerPress: (fn: () => void) => void;
}) {
  const camera = useThree((s) => s.camera);
  const playerRef = useRef<PlayerState>(createPlayer(scene.spawns[0].position));
  const keysRef = useRef<Record<string, boolean>>({});
  const targetingRef = useRef(false);
  /** Cycles through spawn points so repeated deaths do not replay one route. */
  const spawnIndexRef = useRef(0);
  /** Suppresses repeat death reports while the respawn settles. */
  const deadRef = useRef(false);

  const placeAt = useCallback(
    (spawn: SpawnPoint) => {
      playerRef.current = createPlayer(spawn.position);
      camera.position.set(spawn.position.x, spawn.position.y + EYE_HEIGHT, spawn.position.z);
      // Face into the space rather than at the wall behind the spawn corner.
      camera.rotation.set(0, spawn.yaw, 0, 'YXZ');
      deadRef.current = false;
    },
    [camera]
  );

  // Reset when the concept changes.
  useEffect(() => {
    spawnIndexRef.current = 0;
    placeAt(scene.spawns[0]);
  }, [scene, placeAt]);

  // Pressing is triggered from click (page level) and from KeyE (here), so the
  // handler lives in a ref both paths can reach.
  const pressRef = useRef<() => void>(() => {});
  useEffect(() => {
    pressRef.current = () => {
      if (targetingRef.current) onPress();
    };
    registerPress(() => pressRef.current());
  }, [onPress, registerPress]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      // Stop Space and the arrows from scrolling the page under the canvas.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyE') pressRef.current();
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const timeMs = clock.elapsedTime * 1000;
    const keys = keysRef.current;
    // Arrow keys and WASD both drive movement; left/right strafe, since mouse
    // look owns turning.
    const input: MoveInput = {
      forward: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      right: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      jump: !!keys.Space,
    };

    // Yaw straight off the camera quaternion, in the order three.js uses for
    // first-person cameras (yaw, then pitch, no roll).
    const euler = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');

    playerRef.current = stepPlayer(scene.world, playerRef.current, input, euler.y, delta);
    const { position } = playerRef.current;
    camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);

    // Trapdoors mutate the world (open tiles become Air), so they must run
    // before the death check — otherwise the player is judged against a floor
    // that has already dropped away.
    if (trapDoorStatesRef.current) {
      stepTrapDoors(
        scene.world,
        scene.hazards.trapDoors,
        trapDoorStatesRef.current,
        position,
        timeMs
      );
    }

    if (!deadRef.current) {
      const cause = checkDeath(scene.world, position, scene.hazards, timeMs);
      if (cause) {
        deadRef.current = true;
        spawnIndexRef.current = (spawnIndexRef.current + 1) % scene.spawns.length;
        const next = scene.spawns[spawnIndexRef.current];
        placeAt(next);
        onDeath(cause, next);
        return;
      }
    }

    // Is the crosshair on the button?
    const dir = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const hit = raycastVoxel(
      scene.world,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: dir.x, y: dir.y, z: dir.z },
      REACH
    );
    const targeting = hit?.blockId === Block.Button;
    if (targeting !== targetingRef.current) {
      targetingRef.current = targeting;
      onTargetChange(targeting);
    }
  });

  return null;
}

export default function FindTheButtonCanvas({
  scene,
  onTargetChange,
  onFound,
  onDeath,
  registerPress,
}: {
  scene: ConceptScene;
  onTargetChange: (targetingButton: boolean) => void;
  onFound: () => void;
  onDeath: (cause: DeathCause, nextSpawn: SpawnPoint) => void;
  registerPress: (fn: () => void) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  // Trapdoor state lives in a ref shared by the simulation and the renderer, so
  // the frame loop can mutate it without forcing a React re-render.
  const trapDoorStatesRef = useRef<TrapDoorState[]>(
    createTrapDoorStates(scene.hazards.trapDoors)
  );
  useEffect(() => {
    trapDoorStatesRef.current = createTrapDoorStates(scene.hazards.trapDoors);
  }, [scene]);

  // R3F sizes the drawing buffer from its own observer on the container. If the
  // canvas mounts before layout settles — it arrives via dynamic import — that
  // first measurement can come back empty and the canvas sticks at its 300x150
  // default. Watching the host ourselves and re-broadcasting a resize makes R3F
  // re-measure whenever the real size appears or changes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const nudge = () => window.dispatchEvent(new Event('resize'));
    const observer = new ResizeObserver(nudge);
    observer.observe(el);

    // The observer's first callback can land before R3F has subscribed to
    // window resize, so nudge again once its listener is definitely attached.
    const timers = [setTimeout(nudge, 0), setTimeout(nudge, 250)];

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // Built once per mount and disposed on unmount — GPU textures are not garbage
  // collected with the component.
  const textures = useMemo(() => createBlockTextures(), []);
  useEffect(() => {
    return () => {
      textures.forEach((t) => t.dispose());
    };
  }, [textures]);

  return (
    <div ref={hostRef} className="h-full w-full">
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 200 }}
        onCreated={({ gl }) => gl.setClearColor('#1b1f26')}
      >
        {/* Interior lighting: flat ambient plus a soft key so walls read as rooms
            rather than silhouettes. */}
        <ambientLight intensity={1.1} />
        <hemisphereLight args={['#ffeccf', '#3a3730', 0.6]} />
        <directionalLight position={[12, 30, 8]} intensity={0.5} />
        <Blocks world={scene.world} textures={textures} />
        <TrapDoors
          scene={scene}
          statesRef={trapDoorStatesRef}
          texture={textures.get(Block.TrapDoor)}
        />
        <Lasers lasers={scene.hazards.lasers} />
        <Player
          scene={scene}
          trapDoorStatesRef={trapDoorStatesRef}
          onTargetChange={onTargetChange}
          onPress={onFound}
          onDeath={onDeath}
          registerPress={registerPress}
        />
        <PointerLockControls />
      </Canvas>
    </div>
  );
}
