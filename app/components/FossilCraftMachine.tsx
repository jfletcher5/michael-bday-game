'use client';

/**
 * Fossil Craft Machine — shop panel under Gamepasses (MIE-32).
 * Players pick two fossils, wait 30 real minutes, then claim the crafted ball.
 */

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { claimFossilCraft, startFossilCraft } from '../lib/firestore';
import {
  FOSSIL_BALLS,
  formatCraftTimeLeft,
  formatFossilRecipe,
  getFossilBallById,
  getFossilCraftRemainingMs,
  isFossilCraftComplete,
  listFossilCraftRecipes,
  toggleFossilSelection,
} from '../lib/fossilCraft';
import {
  FOSSIL_TYPE_META,
  FOSSIL_TYPES,
  matchFossilRecipe,
} from '../lib/fossils';
import { getBallTypeById } from '../lib/ballTypes';
import type { FossilTypeId, User } from '../lib/types';

interface FossilCraftMachineProps {
  user: User;
  onUserUpdate: (user: User) => void;
  onMessage: (message: string, tone?: 'success' | 'error') => void;
}

export default function FossilCraftMachine({ user, onUserUpdate, onMessage }: FossilCraftMachineProps) {
  const [selectedA, setSelectedA] = useState<FossilTypeId | null>(null);
  const [selectedB, setSelectedB] = useState<FossilTypeId | null>(null);
  const [loading, setLoading] = useState<'start' | 'claim' | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const craftJob = user.fossilCraftJob ?? null;
  const recipes = useMemo(() => listFossilCraftRecipes(), []);

  // Tick the countdown while a craft is in progress.
  useEffect(() => {
    if (!craftJob) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [craftJob]);

  const matchedBallId = selectedA && selectedB ? matchFossilRecipe(selectedA, selectedB) : null;
  const matchedBall = matchedBallId ? getFossilBallById(matchedBallId) : null;
  const canStart =
    !craftJob &&
    matchedBallId !== null &&
    selectedA !== null &&
    selectedB !== null &&
    (() => {
      const countA = user.fossilInventory?.[selectedA] ?? 0;
      const countB = user.fossilInventory?.[selectedB] ?? 0;
      if (selectedA === selectedB) return countA >= 2;
      return countA >= 1 && countB >= 1;
    })();

  const craftComplete = isFossilCraftComplete(craftJob, nowMs);
  const activeBall = craftJob ? getFossilBallById(craftJob.resultBallId) : null;

  const toggleFossil = (type: FossilTypeId) => {
    if (craftJob) return;
    const next = toggleFossilSelection(
      { selectedA, selectedB },
      type,
      user.fossilInventory,
    );
    setSelectedA(next.selectedA);
    setSelectedB(next.selectedB);
  };

  const handleStartCraft = async () => {
    if (!selectedA || !selectedB || !matchedBallId) return;
    setLoading('start');
    try {
      const updated = await startFossilCraft(user.username, selectedA, selectedB);
      onUserUpdate(updated);
      setSelectedA(null);
      setSelectedB(null);
      onMessage(`Started crafting ${getFossilBallById(matchedBallId)?.name ?? 'ball'}! Check back in 30 minutes.`, 'success');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Failed to start craft', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleClaim = async () => {
    if (!craftJob) return;
    setLoading('claim');
    try {
      const updated = await claimFossilCraft(user.username);
      onUserUpdate(updated);
      const ballName = getBallTypeById(craftJob.resultBallId).name;
      onMessage(`Claimed ${ballName}! It's now in your ball collection.`, 'success');
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Failed to claim craft', 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-glow-sm border-2 border-amber-300 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center mb-4">
        <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-100 to-amber-300 border-2 border-amber-500 flex items-center justify-center text-4xl shadow-lg shrink-0">
          🦴
        </div>
        <div className="text-center sm:text-left">
          <h3 className="text-xl font-black text-gray-900">Fossil Craft Machine</h3>
          <p className="text-sm text-gray-600">
            Combine two fossils into a special event ball. Crafting is free and takes 30 real minutes.
          </p>
        </div>
      </div>

      {/* Active craft */}
      {craftJob && activeBall && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 mb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 shrink-0"
              style={{ backgroundColor: activeBall.color, borderColor: activeBall.strokeColor }}
            >
              {activeBall.imageUrl && (
                <Image src={activeBall.imageUrl} alt={activeBall.name} width={64} height={64} className="w-full h-full object-cover" unoptimized />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold text-gray-900">Crafting {activeBall.name}</p>
              <p className="text-xs text-gray-600">
                Recipe: {formatFossilRecipe(craftJob.fossilA, craftJob.fossilB)}
              </p>
              {!craftComplete ? (
                <p className="text-sm font-semibold text-amber-700 mt-1">
                  Time left: {formatCraftTimeLeft(getFossilCraftRemainingMs(craftJob, nowMs))}
                </p>
              ) : (
                <p className="text-sm font-semibold text-green-700 mt-1">Craft complete!</p>
              )}
            </div>
          </div>
          {craftComplete && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={loading === 'claim'}
              className="w-full mt-4 min-h-[44px] rounded-lg font-bold text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {loading === 'claim' ? 'Claiming...' : 'Claim Ball'}
            </button>
          )}
        </div>
      )}

      {/* Fossil picker — hidden while a craft is running */}
      {!craftJob && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['Slot 1', 'Slot 2'] as const).map((label, index) => {
              const slotType = index === 0 ? selectedA : selectedB;
              const meta = slotType ? FOSSIL_TYPE_META[slotType] : null;
              return (
                <div
                  key={label}
                  className={`flex-1 min-w-[120px] rounded-xl border-2 border-dashed p-2 text-center ${
                    slotType ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                  {meta ? (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Image src={meta.imageSrc} alt={meta.label} width={24} height={24} className="rounded" unoptimized />
                      <span className="text-sm font-bold text-gray-800">{meta.label}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">Tap a fossil</p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your fossils</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {FOSSIL_TYPES.map((type) => {
              const count = user.fossilInventory?.[type] ?? 0;
              const meta = FOSSIL_TYPE_META[type];
              const isSelected = selectedA === type || selectedB === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => count > 0 && toggleFossil(type)}
                  disabled={count <= 0}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                    count <= 0
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : isSelected
                        ? 'border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-200'
                        : 'border-gray-200 bg-white hover:border-amber-300'
                  }`}
                >
                  <Image src={meta.imageSrc} alt={meta.label} width={28} height={28} className="rounded" unoptimized />
                  <span>{meta.label}</span>
                  <span className="font-bold">×{count}</span>
                </button>
              );
            })}
          </div>

          {selectedA && selectedB && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-4 text-center">
              <p className="text-sm text-gray-600 mb-2">
                Selected: {formatFossilRecipe(selectedA, selectedB)}
              </p>
              {matchedBall ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border-2"
                    style={{ backgroundColor: matchedBall.color, borderColor: matchedBall.strokeColor }}
                  >
                    <Image src={matchedBall.imageUrl!} alt={matchedBall.name} width={56} height={56} className="w-full h-full object-cover" unoptimized />
                  </div>
                  <p className="font-bold text-gray-900">{matchedBall.name}</p>
                </div>
              ) : (
                <p className="text-sm text-red-600 font-medium">No recipe for this fossil pair</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleStartCraft}
            disabled={!canStart || loading === 'start'}
            className={`w-full min-h-[44px] rounded-lg font-bold text-sm transition-all ${
              canStart
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {loading === 'start' ? 'Starting craft...' : 'Start Craft (30 min)'}
          </button>
        </>
      )}

      {/* Recipe reference */}
      <details className="mt-4">
        <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700">
          View all recipes
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {recipes.map((recipe) => (
            <li key={recipe.ballId}>
              {formatFossilRecipe(recipe.fossilA, recipe.fossilB)} → {recipe.ballName}
            </li>
          ))}
        </ul>
      </details>

      {/* Owned crafted balls */}
      {FOSSIL_BALLS.some((ball) => user.ownedBalls.includes(ball.id)) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Crafted balls</p>
          <div className="flex flex-wrap gap-2">
            {FOSSIL_BALLS.filter((ball) => user.ownedBalls.includes(ball.id)).map((ball) => (
              <div key={ball.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-800">
                <Image src={ball.imageUrl!} alt={ball.name} width={24} height={24} className="rounded-full" unoptimized />
                {ball.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
