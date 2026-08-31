'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { CONCEPTS, getConcept, openDoor, SpawnPoint } from '../lib/findTheButton';
import Minimap, { Pose } from './Minimap';
import LockModal from './LockModal';
import { DeathCause, DEATH_MESSAGES } from '../lib/findTheButtonHazards';
import { NavPill } from '../components/ui';
import type { InteractTarget } from './FindTheButtonCanvas';

// The canvas pulls in three.js — keep it out of the initial page chunk, and out
// of the static-export prerender since it touches WebGL on mount.
const FindTheButtonCanvas = dynamic(() => import('./FindTheButtonCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-slate-900 text-white/70">
      Loading world…
    </div>
  ),
});

/**
 * Find the Button — concept spike.
 *
 * Not the real game yet: this exists to try first-person voxel layouts and get a
 * feel for scale, movement, and how hard the button is to spot. Concepts are
 * swappable from the HUD so layouts can be compared back to back.
 */
export default function FindTheButtonPage() {
  const router = useRouter();
  const [conceptId, setConceptId] = useState(CONCEPTS[0].id);
  /** What the crosshair is aimed at: the button, the lock panel, or nothing. */
  const [target, setTarget] = useState<InteractTarget | null>(null);
  const [found, setFound] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped on every concept switch / retry to restart the run timer. */
  const [runId, setRunId] = useState(0);
  const [deaths, setDeaths] = useState(0);
  /** Last death, shown briefly as a banner then cleared. */
  const [lastDeath, setLastDeath] = useState<{ cause: DeathCause; spawn: string } | null>(null);
  /** Combination lock state: keypad open, door open, and the unlock banner. */
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockSolved, setLockSolved] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const concept = getConcept(conceptId);
  // Rebuild the world when the concept changes AND on retry (runId): a fresh
  // run must re-lock the door and reset sprung trapdoors, not reuse the
  // mutated world from the previous attempt.
  const scene = useMemo(() => {
    void runId;
    return concept.build();
  }, [concept, runId]);

  /** Player pose, written by the 3D frame loop and read by the minimap. */
  const poseRef = useRef<Pose>({ x: 0, y: 0, z: 0, yaw: 0 });

  // Seed the pose from the spawn so the map draws the right floor before the
  // first frame lands — otherwise it slices y=0 and renders an empty basement.
  useEffect(() => {
    const spawn = scene.spawns[0];
    poseRef.current = {
      x: spawn.position.x,
      y: spawn.position.y,
      z: spawn.position.z,
      yaw: spawn.yaw,
    };
  }, [scene]);

  const pressRef = useRef<() => void>(() => {});
  const registerPress = useCallback((fn: () => void) => {
    pressRef.current = fn;
  }, []);

  const handleFound = useCallback(() => {
    setFound(true);
  }, []);

  const handleDeath = useCallback((cause: DeathCause, nextSpawn: SpawnPoint) => {
    setDeaths((n) => n + 1);
    setLastDeath({ cause, spawn: nextSpawn.label });
  }, []);

  // Aiming at the lock panel and pressing E / clicking opens the keypad. The
  // pointer lock is released so the cursor is free to tap the digits.
  const handleLockPress = useCallback(() => {
    setLockModalOpen(true);
    document.exitPointerLock();
  }, []);

  // The keypad submits an attempt; on a match the door tiles become Air (so
  // collision and the minimap open up) and the door meshes hide via lockSolved.
  const handleLockSubmit = useCallback(
    (attempt: string): boolean => {
      const lock = scene.lock;
      if (!lock || attempt !== lock.code) return false;
      openDoor(scene.world, lock);
      setLockSolved(true);
      setLockModalOpen(false);
      setJustUnlocked(true);
      return true;
    },
    [scene]
  );

  // Clear the death banner a couple of seconds after it appears.
  useEffect(() => {
    if (!lastDeath) return;
    const id = setTimeout(() => setLastDeath(null), 2200);
    return () => clearTimeout(id);
  }, [lastDeath]);

  // The unlock banner follows the same brief-then-clear pattern.
  useEffect(() => {
    if (!justUnlocked) return;
    const id = setTimeout(() => setJustUnlocked(false), 2200);
    return () => clearTimeout(id);
  }, [justUnlocked]);

  // Run the timer until the button is pressed. Restarts whenever runId changes.
  useEffect(() => {
    if (found) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => clearInterval(id);
  }, [found, runId]);

  const switchConcept = (id: string) => {
    setConceptId(id);
    setFound(false);
    setTarget(null);
    setElapsed(0);
    setDeaths(0);
    setLastDeath(null);
    setLockModalOpen(false);
    setLockSolved(false);
    setJustUnlocked(false);
    setRunId((n) => n + 1);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 select-none">
      <div
        className="absolute inset-0"
        onPointerDown={() => {
          // Only treat clicks as presses when the pointer is already locked.
          // Otherwise the click that re-locks the pointer after closing the
          // keypad would immediately re-trigger whatever is being aimed at.
          if (document.pointerLockElement) pressRef.current();
        }}
      >
        {/*
          Deliberately NOT keyed on the concept. Keying remounts the Canvas,
          which builds a fresh WebGLRenderer and context every switch; browsers
          cap live contexts, so after a few switches the context is lost and the
          frame loop silently stops. The scene prop drives the reset instead.
        */}
        <FindTheButtonCanvas
          scene={scene}
          poseRef={poseRef}
          onTargetChange={setTarget}
          onFound={handleFound}
          onLockPress={handleLockPress}
          onDeath={handleDeath}
          registerPress={registerPress}
          lockSolved={lockSolved}
          paused={lockModalOpen}
        />
      </div>

      {/* Crosshair — green on the button, amber on the lock panel. */}
      {!found && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={`h-5 w-5 rounded-full border-2 transition-colors ${
              target === 'button'
                ? 'border-green-400 bg-green-400/30'
                : target === 'lock'
                  ? 'border-amber-400 bg-amber-400/30'
                  : 'border-white/70'
            }`}
          />
        </div>
      )}

      {/* Top-left: exit + concept switcher */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
        <NavPill onClick={() => router.push('/')} ariaLabel="Back to game picker">
          <span aria-hidden className="text-base leading-none">←</span>
          <span>Games</span>
        </NavPill>
        <div className="flex flex-col gap-1.5 rounded-2xl bg-black/45 backdrop-blur-md p-2 ring-1 ring-white/20">
          <p className="text-[11px] uppercase tracking-wide text-white/60 px-1.5">Concept</p>
          {CONCEPTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchConcept(c.id)}
              className={`text-left rounded-xl px-3 py-2 text-sm transition-colors ${
                c.id === conceptId
                  ? 'bg-white text-slate-900 font-semibold'
                  : 'text-white/85 hover:bg-white/15'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Top-right: timer + death count */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <div className="rounded-full bg-black/45 backdrop-blur-md px-4 py-2 ring-1 ring-white/20 text-white font-mono text-sm">
          {elapsed.toFixed(1)}s
        </div>
        {deaths > 0 && (
          <div className="rounded-full bg-red-900/60 backdrop-blur-md px-4 py-2 ring-1 ring-red-400/40 text-red-100 font-mono text-sm">
            💀 {deaths}
          </div>
        )}
      </div>

      {/* Death banner — brief, then clears itself. */}
      {lastDeath && !found && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-red-900/35 animate-pop-in" />
          <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 text-center animate-pop-in">
            <p className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg">
              {DEATH_MESSAGES[lastDeath.cause]}
            </p>
            <p className="text-sm text-white/80 mt-2 drop-shadow">
              Respawned at {lastDeath.spawn}
            </p>
          </div>
        </>
      )}

      {/* Bottom-left: top-down map of the level */}
      {!found && (
        <div className="absolute bottom-4 left-3">
          <Minimap scene={scene} poseRef={poseRef} />
        </div>
      )}

      {/* Unlock banner — brief, then clears itself. */}
      {justUnlocked && !found && (
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 text-center animate-pop-in">
          <p className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg">
            Door unlocked!
          </p>
          <p className="text-sm text-white/80 mt-2 drop-shadow">The maze is open.</p>
        </div>
      )}

      {/* Bottom: controls hint — swaps to the lock prompt when aimed at it. */}
      {!found && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/45 backdrop-blur-md px-5 py-2.5 ring-1 ring-white/20 text-white/85 text-xs sm:text-sm text-center">
          {target === 'lock' ? (
            <>
              <b>Click / E</b> try the combination
            </>
          ) : (
            <>
              Click to look around · <b>Arrow keys</b> or <b>WASD</b> move · <b>Space</b> jump ·{' '}
              <b>Click / E</b> press the button · <b>Esc</b> release cursor
            </>
          )}
        </div>
      )}

      {/* Combination lock keypad — opened from the lock panel. */}
      {lockModalOpen && scene.lock && (
        <LockModal
          hint={scene.lock.hint}
          codeLength={scene.lock.code.length}
          onSubmit={handleLockSubmit}
          onClose={() => setLockModalOpen(false)}
        />
      )}

      {/* Win state */}
      {found && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-glow p-8 text-center max-w-sm mx-4 animate-pop-in">
            <p className="text-5xl mb-3" aria-hidden>
              🔴
            </p>
            <h2 className="text-2xl font-extrabold text-gray-800 mb-1">Found it!</h2>
            <p className="text-sm text-gray-600 mb-1">
              {concept.name} in {elapsed.toFixed(1)}s
              {deaths > 0 && ` · ${deaths} death${deaths === 1 ? '' : 's'}`}
            </p>
            <p className="text-xs text-gray-400 mb-5">{concept.description}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => switchConcept(conceptId)}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold min-h-[48px] rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full bg-gray-100 text-gray-800 font-semibold min-h-[48px] rounded-xl hover:bg-gray-200 transition-all"
              >
                Back to games
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
