'use client';

import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Euler, InstancedMesh, Object3D, Texture, Vector3 } from 'three';

import {
  VoxelWorld,
  Block,
  BLOCK_COLORS,
  Vec3,
  ConceptScene,
  isEmissiveBlock,
} from '../lib/findTheButton';
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
 * First-person controller.
 *
 * Camera rotation is owned by PointerLockControls; this component owns position
 * and feeds the camera each frame from the simulated player box.
 */
function Player({
  scene,
  onTargetChange,
  onPress,
  registerPress,
}: {
  scene: ConceptScene;
  onTargetChange: (targetingButton: boolean) => void;
  onPress: () => void;
  registerPress: (fn: () => void) => void;
}) {
  const camera = useThree((s) => s.camera);
  const playerRef = useRef<PlayerState>(createPlayer(scene.spawn));
  const keysRef = useRef<Record<string, boolean>>({});
  const targetingRef = useRef(false);

  // Reset when the concept changes.
  useEffect(() => {
    playerRef.current = createPlayer(scene.spawn);
    camera.position.set(scene.spawn.x, scene.spawn.y + EYE_HEIGHT, scene.spawn.z);
    // Face into the space rather than at the wall behind the spawn corner.
    camera.rotation.set(0, scene.spawnYaw, 0, 'YXZ');
  }, [scene, camera]);

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

  useFrame((_, delta) => {
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
  registerPress,
}: {
  scene: ConceptScene;
  onTargetChange: (targetingButton: boolean) => void;
  onFound: () => void;
  registerPress: (fn: () => void) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

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
        <Player
          scene={scene}
          onTargetChange={onTargetChange}
          onPress={onFound}
          registerPress={registerPress}
        />
        <PointerLockControls />
      </Canvas>
    </div>
  );
}
