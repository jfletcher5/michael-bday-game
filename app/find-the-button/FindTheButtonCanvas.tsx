'use client';

import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Color, Euler, InstancedMesh, Object3D, Vector3 } from 'three';

import { VoxelWorld, Block, BLOCK_COLORS, Vec3, ConceptScene } from '../lib/findTheButton';
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

/**
 * All visible blocks in one InstancedMesh.
 *
 * Blocks fully enclosed by neighbours are skipped — in a solid-walled room that
 * removes most of the interior and keeps the instance count in the low thousands.
 */
function Blocks({ world }: { world: VoxelWorld }) {
  const meshRef = useRef<InstancedMesh>(null);

  const instances = useMemo(() => {
    const out: { pos: Vec3; color: string }[] = [];
    for (let y = 0; y < world.sizeY; y++) {
      for (let z = 0; z < world.sizeZ; z++) {
        for (let x = 0; x < world.sizeX; x++) {
          const id = world.get(x, y, z);
          if (id === Block.Air) continue;
          if (world.isHidden(x, y, z)) continue;
          out.push({ pos: { x, y, z }, color: BLOCK_COLORS[id] ?? '#ffffff' });
        }
      }
    }
    return out;
  }, [world]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new Object3D();
    const color = new Color();
    instances.forEach((inst, i) => {
      // Block (x,y,z) spans x..x+1, so its centre sits at +0.5 on each axis.
      dummy.position.set(inst.pos.x + 0.5, inst.pos.y + 0.5, inst.pos.z + 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(inst.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instances.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
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
      if (e.code === 'Space') e.preventDefault();
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
    const input: MoveInput = {
      forward: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
      right: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
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
  return (
    <Canvas
      shadows
      camera={{ fov: 75, near: 0.1, far: 200 }}
      onCreated={({ gl }) => gl.setClearColor('#8ec5ff')}
    >
      <fog attach="fog" args={['#8ec5ff', 20, 70]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[20, 40, 15]} intensity={1.1} castShadow />
      <Blocks world={scene.world} />
      <Player
        scene={scene}
        onTargetChange={onTargetChange}
        onPress={onFound}
        registerPress={registerPress}
      />
      <PointerLockControls />
    </Canvas>
  );
}
