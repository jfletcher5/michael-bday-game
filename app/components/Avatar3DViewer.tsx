'use client';

import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TextureLoader, SRGBColorSpace, type Group } from 'three';
import type { AvatarItem, AvatarPartType } from '../lib/types';
import {
  DEFAULT_SKIN_COLOR,
  getAvatarFaceOverlayUrl,
  getAvatarPartTextureUrl,
  getEmoteAnimationId,
} from '../lib/avatarItems';

interface Avatar3DViewerProps {
  layers: Partial<Record<AvatarPartType, AvatarItem>>;
  skinColor?: string;
  /** When true, plays the equipped emote rig animation (e.g. wave). */
  emoteActive?: boolean;
  className?: string;
  /** Allow drag/touch orbit — home menu + avatar shop (MIE-18 point #13). */
  enableRotation?: boolean;
  /** Live UGC draft texture applied to a body slot during Gemini preview (MIE-18). */
  draftTexture?: { partType: AvatarPartType; textureUrl: string } | null;
}

/** 1×1 transparent pixel — satisfies useLoader when a slot has no texture yet. */
const PLACEHOLDER_TEXTURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Load a texture for a body-part mesh; skin tint only when no wear textureUrl (MIE-38). */
function PartMesh({
  textureUrl,
  color,
  position,
  size,
}: {
  textureUrl: string | null;
  color: string;
  position: [number, number, number];
  size: [number, number, number];
}) {
  const map = useLoader(TextureLoader, textureUrl ?? PLACEHOLDER_TEXTURE);
  if (textureUrl) map.colorSpace = SRGBColorSpace;

  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} map={textureUrl ? map : undefined} />
    </mesh>
  );
}

/** 2D face expression plane composited on the 3D head (MIE-18). */
function FaceOverlay({ url }: { url: string }) {
  const map = useLoader(TextureLoader, url);
  map.colorSpace = SRGBColorSpace;
  return (
    <mesh position={[0, 1.52, 0.33]}>
      <planeGeometry args={[0.55, 0.55]} />
      <meshBasicMaterial map={map} transparent alphaTest={0.05} />
    </mesh>
  );
}

/**
 * Procedural starter rig — separate 3D body parts with 2D texture maps (MIE-18).
 * Right arm ref drives the wave emote animation.
 */
function AvatarRig({
  layers,
  skinColor,
  emoteActive,
  draftTexture,
}: {
  layers: Partial<Record<AvatarPartType, AvatarItem>>;
  skinColor: string;
  emoteActive: boolean;
  draftTexture?: { partType: AvatarPartType; textureUrl: string } | null;
}) {
  const rightArmRef = useRef<Group>(null);
  const emoteItem = layers.emote;
  const emoteId = emoteActive ? getEmoteAnimationId(emoteItem) : null;
  const faceUrl = getAvatarFaceOverlayUrl(layers.face);

  const textures = useMemo(() => {
    const resolve = (part: AvatarPartType, item?: AvatarItem) => {
      if (draftTexture?.partType === part) return draftTexture.textureUrl;
      return getAvatarPartTextureUrl(item);
    };
    return {
      shirt: resolve('shirt', layers.shirt),
      hair: resolve('hair', layers.hair),
      pants: resolve('pants', layers.pants),
      arm: resolve('arm', layers.arm),
      leg: resolve('leg', layers.leg),
      hand: resolve('hand', layers.hand),
      foot: resolve('foot', layers.foot),
      sock: resolve('sock', layers.sock),
      accessory: resolve('accessory', layers.accessory),
    };
  }, [layers, draftTexture]);

  // Wave emote: right arm lifts and shakes back and forth (MIE-18 point #8).
  useFrame((state) => {
    if (!rightArmRef.current || emoteId !== 'wave') {
      if (rightArmRef.current) {
        rightArmRef.current.rotation.set(0, 0, 0);
      }
      return;
    }
    const t = state.clock.elapsedTime;
    rightArmRef.current.rotation.z = -0.9 + Math.sin(t * 10) * 0.45;
    rightArmRef.current.rotation.x = Math.sin(t * 7) * 0.25;
  });

  return (
    <group position={[0, -0.2, 0]}>
      {/* Head — skin tinted */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.38, 24, 24]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* Hair */}
      <PartMesh textureUrl={textures.hair} color={skinColor} position={[0, 1.82, 0]} size={[0.72, 0.28, 0.5]} />

      {/* Torso / shirt */}
      <PartMesh textureUrl={textures.shirt} color={skinColor} position={[0, 0.85, 0]} size={[0.7, 0.75, 0.38]} />

      {/* Left arm */}
      <PartMesh textureUrl={textures.arm} color={skinColor} position={[-0.52, 0.9, 0]} size={[0.22, 0.55, 0.22]} />

      {/* Right arm — animated for wave emote */}
      <group ref={rightArmRef} position={[0.52, 0.9, 0]}>
        <PartMesh textureUrl={textures.arm} color={skinColor} position={[0, 0, 0]} size={[0.22, 0.55, 0.22]} />
        <PartMesh textureUrl={textures.hand} color={skinColor} position={[0, -0.38, 0]} size={[0.18, 0.18, 0.18]} />
      </group>

      {/* Left hand */}
      <PartMesh textureUrl={textures.hand} color={skinColor} position={[-0.52, 0.55, 0]} size={[0.18, 0.18, 0.18]} />

      {/* Pants */}
      <PartMesh textureUrl={textures.pants} color={skinColor} position={[0, 0.2, 0]} size={[0.62, 0.5, 0.36]} />

      {/* Legs */}
      <PartMesh textureUrl={textures.leg} color={skinColor} position={[-0.18, -0.35, 0]} size={[0.24, 0.55, 0.24]} />
      <PartMesh textureUrl={textures.leg} color={skinColor} position={[0.18, -0.35, 0]} size={[0.24, 0.55, 0.24]} />

      {/* Socks */}
      <PartMesh textureUrl={textures.sock} color={skinColor} position={[-0.18, -0.72, 0]} size={[0.22, 0.22, 0.22]} />
      <PartMesh textureUrl={textures.sock} color={skinColor} position={[0.18, -0.72, 0]} size={[0.22, 0.22, 0.22]} />

      {/* Feet */}
      <PartMesh textureUrl={textures.foot} color={skinColor} position={[-0.18, -0.92, 0.06]} size={[0.26, 0.14, 0.34]} />
      <PartMesh textureUrl={textures.foot} color={skinColor} position={[0.18, -0.92, 0.06]} size={[0.26, 0.14, 0.34]} />

      {/* Accessory (hat/backpack region) */}
      {textures.accessory && (
        <PartMesh textureUrl={textures.accessory} color="#ffffff" position={[0.28, 1.1, -0.1]} size={[0.2, 0.2, 0.2]} />
      )}

      {/* Face expression overlay */}
      {faceUrl && <FaceOverlay url={faceUrl} />}
    </group>
  );
}

function AvatarScene({
  layers,
  skinColor,
  emoteActive,
  enableRotation,
  draftTexture,
}: {
  layers: Partial<Record<AvatarPartType, AvatarItem>>;
  skinColor: string;
  emoteActive: boolean;
  enableRotation: boolean;
  draftTexture?: { partType: AvatarPartType; textureUrl: string } | null;
}) {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} castShadow />
      <directionalLight position={[-2, 2, -3]} intensity={0.35} />
      <Suspense fallback={null}>
        <AvatarRig
          layers={layers}
          skinColor={skinColor}
          emoteActive={emoteActive}
          draftTexture={draftTexture}
        />
      </Suspense>
      {enableRotation && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.6}
          target={[0, 0.6, 0]}
        />
      )}
    </>
  );
}

/**
 * Three.js avatar preview — 3D body parts with 2D textures, free skin tint, manual rotation (MIE-18).
 */
export default function Avatar3DViewer({
  layers,
  skinColor = DEFAULT_SKIN_COLOR,
  emoteActive = false,
  className = '',
  enableRotation = true,
  draftTexture = null,
}: Avatar3DViewerProps) {
  return (
    <div className={`relative w-40 h-64 sm:w-48 sm:h-72 ${className}`}>
      <Canvas
        camera={{ position: [0, 0.8, 3.2], fov: 42 }}
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <AvatarScene
          layers={layers}
          skinColor={skinColor}
          emoteActive={emoteActive}
          enableRotation={enableRotation}
          draftTexture={draftTexture}
        />
      </Canvas>
      {enableRotation && (
        <p className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-gray-400 pointer-events-none">
          Drag to rotate
        </p>
      )}
    </div>
  );
}
