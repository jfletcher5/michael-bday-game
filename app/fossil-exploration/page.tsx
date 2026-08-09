'use client';

/**
 * Fossil Exploration mode entry (MIE-31, MIE-33).
 * Event-gated: players may only start while Fossil Event is live.
 * A run already in progress may finish after the event expires.
 */

import Image from 'next/image';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import {
  awardFossilPiece,
  getUserData,
  subscribeToActiveEvents,
} from '../lib/firestore';
import { isFossilEventActive } from '../lib/gameEvents';
import {
  FOSSIL_TYPE_META,
  FOSSIL_TYPES,
  countFossilInventory,
} from '../lib/fossils';
import type { Controls, FossilTypeId, GameEvent, User } from '../lib/types';
import { getBallTypeById, getDefaultBallType } from '../lib/ballTypes';
import { usePlayerSettings } from '../components/PlayerSettingsProvider';
import ControlsComponent from '../game/components/Controls';
import TouchControls from '../game/components/TouchControls';
import FossilExplorationCanvas from './FossilExplorationCanvas';
import { DEFAULT_GAME_HREF } from '../lib/games';

type RunState = 'checking' | 'playing' | 'fallen' | 'blocked';

export default function FossilExplorationPage() {
  const router = useRouter();
  const { settings } = usePlayerSettings();
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  const [controls, setControls] = useState<Controls>({ left: false, right: false, jump: false });
  const [runState, setRunState] = useState<RunState>('checking');
  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [statusFossil, setStatusFossil] = useState<FossilTypeId | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sessionFossils, setSessionFossils] = useState(0);
  const restartSignalRef = useRef(false);
  const entryDecidedRef = useRef(false);
  // State (not ref) so HUD can show “event ended” without reading refs during render.
  const [startedWhileLive, setStartedWhileLive] = useState(false);

  useEffect(() => {
    document.body.classList.add('game-page');
    return () => document.body.classList.remove('game-page');
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    // Async refresh only — no sync setState in this effect body.
    getUserData(user.username).then((fresh) => {
      if (fresh) {
        setUser(fresh);
        setCurrentUser(fresh);
      }
    });

    const unsub = subscribeToActiveEvents((evts) => {
      setActiveEvents(evts);
      // Decide entry once from the first Firestore snapshot (MIE-31 event gate).
      if (!entryDecidedRef.current) {
        entryDecidedRef.current = true;
        if (isFossilEventActive(evts)) {
          setStartedWhileLive(true);
          setRunState('playing');
        } else {
          setRunState('blocked');
        }
      }
    });

    return () => unsub();
    // Only re-bind when the logged-in username changes (not every user field refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional username gate
  }, [router, user?.username]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fossilLive = isFossilEventActive(activeEvents, nowMs);

  const handleFossilCollect = useCallback(
    async (type: FossilTypeId) => {
      const current = getCurrentUser();
      if (!current) return;
      try {
        const result = await awardFossilPiece(current.username, type);
        setUser(result.user);
        setCurrentUser(result.user);
        setSessionFossils((n) => n + 1);
        setStatusFossil(type);
        setStatusError(null);
        window.setTimeout(() => setStatusFossil(null), 1800);
      } catch (err) {
        console.error('Failed to award fossil:', err);
        setStatusError('Could not save fossil — try again.');
        window.setTimeout(() => setStatusError(null), 1800);
      }
    },
    [],
  );

  const handleFall = useCallback(() => {
    setRunState('fallen');
  }, []);

  const handleRestart = () => {
    // New runs require the event to still be live.
    if (!isFossilEventActive(activeEvents)) {
      setRunState('blocked');
      return;
    }
    restartSignalRef.current = true;
    setSessionFossils(0);
    setStatusFossil(null);
    setStatusError(null);
    setRunState('playing');
    setControls({ left: false, right: false, jump: false });
  };

  const ballType = user
    ? getBallTypeById(user.selectedBall || 'default')
    : getDefaultBallType();

  const inventoryTotal = countFossilInventory(user?.fossilInventory);

  if (!user || runState === 'checking') {
    return (
      <div className="w-screen h-dvh bg-black flex items-center justify-center text-white">
        Loading…
      </div>
    );
  }

  if (runState === 'blocked') {
    return (
      <div className="w-screen h-dvh bg-emerald-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md text-center shadow-lg">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Fossil Event Not Active</h1>
          <p className="text-gray-600 text-sm mb-4">
            Fossil Exploration is only available while an admin has started the Fossil Event.
          </p>
          <button
            type="button"
            onClick={() => router.push(DEFAULT_GAME_HREF)}
            className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-black">
      <FossilExplorationCanvas
        controls={controls}
        isPlaying={runState === 'playing'}
        zoom={settings.zoom}
        ballColor={ballType.color}
        ballStrokeColor={ballType.strokeColor}
        onFossilCollect={handleFossilCollect}
        onFall={handleFall}
        restartSignalRef={restartSignalRef}
      />

      <ControlsComponent
        controls={controls}
        setControls={setControls}
        disabled={runState !== 'playing'}
      />
      <TouchControls
        controls={controls}
        setControls={setControls}
        disabled={runState !== 'playing'}
      />

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap gap-2 items-start justify-between pointer-events-none">
        <div className="bg-black/70 text-white rounded-xl px-3 py-2 text-sm">
          <p className="font-bold">🦴 Fossil Exploration</p>
          <p className="text-xs text-emerald-200">
            This run: {sessionFossils} · Total saved: {inventoryTotal}
            {!fossilLive && startedWhileLive ? ' · Event ended (finish your run)' : ''}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {FOSSIL_TYPES.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 text-xs bg-white/10 rounded px-1.5 py-0.5"
                title={FOSSIL_TYPE_META[type].label}
              >
                <Image
                  src={FOSSIL_TYPE_META[type].imageSrc}
                  alt={FOSSIL_TYPE_META[type].label}
                  width={20}
                  height={20}
                  className="rounded-sm object-contain"
                  unoptimized
                />
                {user.fossilInventory?.[type] ?? 0}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(DEFAULT_GAME_HREF)}
          className="pointer-events-auto bg-white/90 text-gray-800 font-medium min-h-[40px] px-3 rounded-lg text-sm hover:bg-white"
        >
          Menu
        </button>
      </div>

      {statusFossil && (
        <div
          className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-emerald-700/90 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          aria-live="polite"
        >
          <Image
            src={FOSSIL_TYPE_META[statusFossil].imageSrc}
            alt=""
            width={24}
            height={24}
            className="object-contain"
            unoptimized
          />
          Collected {FOSSIL_TYPE_META[statusFossil].label}!
        </div>
      )}

      {statusError && (
        <div
          className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-red-700/90 text-white px-4 py-2 rounded-xl text-sm font-medium"
          aria-live="polite"
        >
          {statusError}
        </div>
      )}

      {runState === 'fallen' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold mb-2">You Fell!</h2>
            <p className="text-gray-600 text-sm mb-1">Fossils this run: {sessionFossils}</p>
            <p className="text-gray-500 text-xs mb-4">Saved inventory: {inventoryTotal} pieces</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleRestart}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
              >
                Explore Again
              </button>
              <button
                type="button"
                onClick={() => router.push(DEFAULT_GAME_HREF)}
                className="w-full min-h-[44px] rounded-xl bg-gray-100 text-gray-800 font-medium"
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
