'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { User } from '../../lib/types';
import { getCurrentUser, setCurrentUser } from '../../lib/auth';
import { claimSeasonReward, purchaseSeasonPremium, getUserData, getSeasonConfigWithFallback } from '../../lib/firestore';
import {
  getCurrentSeasonId,
  getTimeRemainingForConfig,
  formatReward,
  rewardEmoji,
  SeasonConfig,
  SeasonReward,
} from '../../lib/seasons';
import { formatPrice } from '../../lib/ballTypes';

export default function SeasonClient() {
  const router = useRouter();
  const params = useParams();
  const month = params.month as string;

  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<SeasonConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });

  useEffect(() => {
    let isCancelled = false;

    async function loadSeasonPage() {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setIsLoading(true);
      setError(null);
      setUser(currentUser);

      // Load config and user in parallel so Firestore-backed rewards don't add
      // an unnecessary waterfall before the page can render.
      const [loadedConfig, freshUser] = await Promise.all([
        getSeasonConfigWithFallback(month),
        getUserData(currentUser.username),
      ]);

      if (isCancelled) return;

      if (freshUser) {
        setUser(freshUser);
        setCurrentUser(freshUser);
      }

      setConfig(loadedConfig);
      setTimeLeft(loadedConfig ? getTimeRemainingForConfig(loadedConfig) : { days: 0, hours: 0, minutes: 0 });
      setIsLoading(false);
    }

    loadSeasonPage().catch((err) => {
      if (isCancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load season');
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [month, router]);

  useEffect(() => {
    if (!config) return;

    // Keep the countdown tied to the loaded config so Firestore date changes
    // are reflected without relying on the local fallback lookup.
    const timer = setInterval(() => setTimeLeft(getTimeRemainingForConfig(config)), 60_000);
    return () => clearInterval(timer);
  }, [config]);

  if (isLoading) return null;

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">No Active Season</h1>
          <p className="text-gray-600 mb-6">There is no season configured for this month.</p>
          <button onClick={() => router.push('/')} className="bg-gray-200 text-gray-800 font-semibold py-2 px-6 rounded-lg hover:bg-gray-300 transition-all">
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  // Season locked: this isn't the current month yet. Show a teaser instead of the full page.
  if (month !== getCurrentSeasonId()) {
    const now = new Date();
    const seasonStart = new Date(config.year, config.month - 1, 1);
    const isPast = seasonStart < now;
    const msUntil = seasonStart.getTime() - now.getTime();
    const daysUntil = Math.max(0, Math.ceil(msUntil / (1000 * 60 * 60 * 24)));

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-3">🔒</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            {config.emoji} {config.displayName}
          </h1>
          {isPast ? (
            <p className="text-gray-500 mb-6">This season has ended.</p>
          ) : (
            <p className="text-gray-600 mb-6">
              Unlocks in <span className="font-bold text-purple-600">{daysUntil}</span> day{daysUntil !== 1 ? 's' : ''}
            </p>
          )}

          {/* Preview of the season ball */}
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="relative">
              <div className="absolute inset-0 -m-2 rounded-full opacity-20" style={{ backgroundColor: config.seasonBall.color }} />
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg grayscale opacity-60"
                style={{
                  backgroundColor: config.seasonBall.color,
                  borderColor: config.seasonBall.strokeColor,
                  borderWidth: '3px',
                  borderStyle: 'solid',
                }}
              >
                {config.seasonBall.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={config.seasonBall.imageUrl} alt="" className="w-12 h-12" />
                )}
              </div>
            </div>
            <p className="text-xs font-medium text-gray-500">Season Ball: {config.seasonBall.name}</p>
          </div>

          <button
            onClick={() => router.push('/')}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold min-h-[48px] py-3 px-6 rounded-lg hover:scale-105 transition-all shadow-lg"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  const sd = user?.seasonData?.seasonId === month ? user.seasonData : null;
  const seasonMeters = sd?.meters ?? 0;
  const premiumUnlocked = sd?.premiumUnlocked ?? false;
  const claimedFree = sd?.claimedFree ?? [];
  const claimedPremium = sd?.claimedPremium ?? [];

  // Determine current tier (next unclaimed level + 1)
  const currentTierIndex = config.levels.findIndex(
    (l, i) => !claimedFree.includes(i) && seasonMeters < l.meterThreshold
  );
  const currentTier = currentTierIndex === -1 ? config.levels.length : currentTierIndex + 1;
  const currentThreshold = currentTierIndex === -1
    ? config.levels[config.levels.length - 1].meterThreshold
    : config.levels[currentTierIndex].meterThreshold;
  const prevThreshold = currentTierIndex > 0 ? config.levels[currentTierIndex - 1].meterThreshold : 0;
  const tierProgress = currentThreshold > prevThreshold
    ? Math.min(100, ((seasonMeters - prevThreshold) / (currentThreshold - prevThreshold)) * 100)
    : 100;

  const handleClaim = async (track: 'free' | 'premium', levelIndex: number) => {
    if (!user) return;
    const key = `${track}-${levelIndex}`;
    setActionLoading(key);
    setError(null);
    setSuccess(null);
    try {
      const updated = await claimSeasonReward(user.username, month, track, levelIndex);
      setUser(updated);
      setCurrentUser(updated);
      const reward = track === 'free' ? config.levels[levelIndex].freeReward : config.levels[levelIndex].premiumReward;
      setSuccess(`Claimed: ${formatReward(reward)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim reward');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlockPremium = async () => {
    if (!user) return;
    setActionLoading('premium-unlock');
    setError(null);
    setSuccess(null);
    try {
      const updated = await purchaseSeasonPremium(user.username, month, config.premiumCost);
      setUser(updated);
      setCurrentUser(updated);
      setSuccess('Premium track unlocked!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock premium');
    } finally {
      setActionLoading(null);
    }
  };

  const getCellState = (track: 'free' | 'premium', levelIndex: number) => {
    const claimed = track === 'free' ? claimedFree : claimedPremium;
    const threshold = config.levels[levelIndex].meterThreshold;
    if (claimed.includes(levelIndex)) return 'claimed';
    if (track === 'premium' && !premiumUnlocked) return 'locked';
    if (seasonMeters >= threshold) return 'claimable';
    return 'pending';
  };

  // Checkbox-style cell matching the wireframe
  const renderCell = (track: 'free' | 'premium', levelIndex: number) => {
    const state = getCellState(track, levelIndex);
    const reward: SeasonReward = track === 'free' ? config.levels[levelIndex].freeReward : config.levels[levelIndex].premiumReward;
    const key = `${track}-${levelIndex}`;
    const loading = actionLoading === key;

    return (
      <div
        key={key}
        onClick={() => {
          if (state === 'claimable' && !loading) handleClaim(track, levelIndex);
        }}
        className={`relative aspect-square flex flex-col items-center justify-center rounded-lg border-2 cursor-default transition-all ${
          state === 'claimed'
            ? 'bg-green-50 border-green-500'
            : state === 'claimable'
            ? 'bg-yellow-50 border-yellow-400 shadow-lg cursor-pointer hover:scale-105'
            : state === 'locked'
            ? 'bg-gray-100 border-gray-300 opacity-50'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        {/* Checkmark for claimed */}
        {state === 'claimed' && (
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {/* Reward icon + label for unclaimed */}
        {state !== 'claimed' && (
          <>
            <span className="text-lg">{rewardEmoji(reward)}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-0.5 text-center leading-tight">
              {formatReward(reward)}
            </span>
          </>
        )}
        {/* Claim pulse */}
        {state === 'claimable' && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
        )}
        {/* Lock icon */}
        {state === 'locked' && (
          <span className="absolute top-0.5 right-0.5 text-[10px]">🔒</span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-2 sm:p-4">
      {/* Top bar */}
      <div className="max-w-4xl mx-auto mb-3 sm:mb-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => router.push('/')}
            className="bg-white/20 backdrop-blur-sm text-white font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:bg-white/30 transition-all text-sm"
          >
            &larr; Back
          </button>
          <h1 className="text-sm sm:text-xl font-bold text-white drop-shadow text-center">
            {config.emoji} {config.displayName}
          </h1>
          <div className="bg-white/20 backdrop-blur-sm text-white min-h-[44px] py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5 text-sm">
            <span className="text-base sm:text-lg">🪙</span>
            <span className="font-bold">{formatPrice(user?.totalCoins ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(error || success) && (
        <div className="max-w-4xl mx-auto mb-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-600">{success}</div>
          )}
        </div>
      )}

      {/* Main card */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-3 sm:p-5">

          {/* Top row: countdown + tier progress — stacks on mobile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4">
            <div className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-3 py-2">
              <span className="text-base">&#9200;</span>
              <span className="font-mono font-bold text-xs sm:text-sm">
                {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <span className="text-xs sm:text-sm font-bold text-gray-700">Tier {currentTier}</span>
              <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                <div className="w-full sm:w-32 h-3 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${tierProgress}%` }}
                  />
                </div>
                <span className="text-[10px] sm:text-xs font-mono text-gray-500 whitespace-nowrap">
                  {formatPrice(seasonMeters)}/{formatPrice(currentThreshold)}m
                </span>
              </div>
            </div>
          </div>

          {/* Season ball + upgrade — horizontal bar on mobile, left column on desktop */}
          <div className="flex flex-col md:flex-row gap-3 sm:gap-4">

            {/* Season ball + Upgrade — row on mobile, column on desktop */}
            <div className="flex md:flex-col items-center justify-center gap-3 md:w-28 md:flex-shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-purple-600 uppercase">Top</span>
                {premiumUnlocked && (
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 -m-3 rounded-full animate-pulse opacity-30" style={{ backgroundColor: config.seasonBall.color }} />
                <div
                  className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg z-10"
                  style={{
                    backgroundColor: config.seasonBall.color,
                    borderColor: config.seasonBall.strokeColor,
                    borderWidth: '3px',
                    borderStyle: 'solid',
                  }}
                >
                  {config.seasonBall.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.seasonBall.imageUrl} alt="" className="w-8 h-8 sm:w-12 sm:h-12" />
                  )}
                </div>
              </div>

              {!premiumUnlocked ? (
                <button
                  onClick={handleUnlockPremium}
                  disabled={actionLoading === 'premium-unlock' || (user?.totalCoins ?? 0) < config.premiumCost}
                  className={`text-xs font-bold min-h-[44px] py-2 px-3 rounded-lg border-2 transition-all ${
                    (user?.totalCoins ?? 0) >= config.premiumCost
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-700 hover:scale-105 shadow-md'
                      : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                  }`}
                >
                  {actionLoading === 'premium-unlock' ? '...' : 'UPGRADE'}
                  <div className="text-[9px] font-normal mt-0.5 opacity-80">
                    {formatPrice(config.premiumCost)} coins
                  </div>
                </button>
              ) : (
                <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded-lg px-2 py-1">
                  UNLOCKED
                </span>
              )}
            </div>

            {/* Achievement grid */}
            <div className="flex-1 min-w-0">
              {/* Threshold labels */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-1">
                {config.levels.map((level, i) => (
                  <div key={i} className="text-center text-[9px] sm:text-[10px] font-bold text-gray-400">
                    {formatPrice(level.meterThreshold)}m
                  </div>
                ))}
              </div>

              {/* Top row (premium) */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-1 sm:mb-2">
                {config.levels.map((_, i) => renderCell('premium', i))}
              </div>

              {/* Bottom row (free) */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2">
                {config.levels.map((_, i) => renderCell('free', i))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
