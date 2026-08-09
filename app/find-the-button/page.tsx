'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { CONCEPTS, getConcept, SpawnPoint } from '../lib/findTheButton';
import { DeathCause, DEATH_MESSAGES } from '../lib/findTheButtonHazards';
import { NavPill } from '../components/ui';

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
  const [targeting, setTargeting] = useState(false);
  const [found, setFound] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped on every concept switch / retry to restart the run timer. */
  const [runId, setRunId] = useState(0);
  const [deaths, setDeaths] = useState(0);
  /** Last death, shown briefly as a banner then cleared. */
  const [lastDeath, setLastDeath] = useState<{ cause: DeathCause; spawn: string } | null>(null);

  const concept = getConcept(conceptId);
  // Rebuild the world only when the concept changes — not on every render.
  const scene = useMemo(() => concept.build(), [concept]);

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

  // Clear the death banner a couple of seconds after it appears.
  useEffect(() => {
    if (!lastDeath) return;
    const id = setTimeout(() => setLastDeath(null), 2200);
    return () => clearTimeout(id);
  }, [lastDeath]);

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
    setTargeting(false);
    setElapsed(0);
    setDeaths(0);
    setLastDeath(null);
    setRunId((n) => n + 1);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 select-none">
      <div
        className="absolute inset-0"
        onPointerDown={() => pressRef.current()}
      >
        {/*
          Deliberately NOT keyed on the concept. Keying remounts the Canvas,
          which builds a fresh WebGLRenderer and context every switch; browsers
          cap live contexts, so after a few switches the context is lost and the
          frame loop silently stops. The scene prop drives the reset instead.
        */}
        <FindTheButtonCanvas
          scene={scene}
          onTargetChange={setTargeting}
          onFound={handleFound}
          onDeath={handleDeath}
          registerPress={registerPress}
        />
      </div>

      {/* Crosshair — turns green when the button is in reach. */}
      {!found && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={`h-5 w-5 rounded-full border-2 transition-colors ${
              targeting ? 'border-green-400 bg-green-400/30' : 'border-white/70'
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

      {/* Bottom: controls hint */}
      {!found && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/45 backdrop-blur-md px-5 py-2.5 ring-1 ring-white/20 text-white/85 text-xs sm:text-sm text-center">
          Click to look around · <b>Arrow keys</b> or <b>WASD</b> move ·{' '}
          <b>Space</b> jump · <b>Click / E</b> press the button · <b>Esc</b> release cursor
        </div>
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
