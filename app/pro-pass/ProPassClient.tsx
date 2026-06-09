'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '../lib/types';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import {
  claimProPassReward,
  purchaseProPassPremium,
  getUserData,
  getProPassConfigWithFallback,
} from '../lib/firestore';
import {
  getProPassConfig,
  getTimeRemainingForProPass,
  formatProPassReward,
  proPassRewardEmoji,
  getProPassBallById,
  isProPassStarted,
  isProPassEnded,
  getDaysUntilProPassStart,
  type ProPassConfig,
  type ProPassReward,
} from '../lib/proPass';
import { formatPrice } from '../lib/ballTypes';
import MenuBackground from '../components/MenuBackground';

export default function ProPassClient() {
  const router = useRouter();
  const passId = getProPassConfig().id;

  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<ProPassConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 });

  useEffect(() => {
    let isCancelled = false;

    async function loadProPassPage() {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setIsLoading(true);
      setError(null);
      setUser(currentUser);

      const [loadedConfig, freshUser] = await Promise.all([
        getProPassConfigWithFallback(passId),
        getUserData(currentUser.username),
      ]);

      if (isCancelled) return;

      if (freshUser) {
        setUser(freshUser);
        setCurrentUser(freshUser);
      }

      setConfig(loadedConfig);
      setTimeLeft(getTimeRemainingForProPass(loadedConfig));
      setIsLoading(false);
    }

    loadProPassPage().catch((err) => {
      if (isCancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load Pro Pass');
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [passId, router]);

  useEffect(() => {
    if (!config) return;

    const timer = setInterval(() => setTimeLeft(getTimeRemainingForProPass(config)), 60_000);
    return () => clearInterval(timer);
  }, [config]);

  if (isLoading) return null;

  if (!config) {
    return (
      <MenuBackground className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">No Pro Pass</h1>
          <p className="text-gray-600 mb-6">There is no Pro Pass configured right now.</p>
          <button onClick={() => router.push('/')} className="bg-gray-200 text-gray-800 font-semibold py-2 px-6 rounded-lg hover:bg-gray-300 transition-all">
            Back to Menu
          </button>
        </div>
      </MenuBackground>
    );
  }

  // Before the pass opens, show a locked teaser (same pattern as future season months).
  if (!isProPassStarted()) {
    const daysUntil = getDaysUntilProPassStart();

    return (
      <MenuBackground className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-3">🔒</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            {config.emoji} Pro Pass
          </h1>
          <p className="text-gray-600 mb-6">
            Unlocks in <span className="font-bold text-purple-600">{daysUntil}</span> day{daysUntil !== 1 ? 's' : ''}
          </p>

          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="relative">
              <div className="absolute inset-0 -m-2 rounded-full opacity-20" style={{ backgroundColor: config.featuredBall.color }} />
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg grayscale opacity-60 overflow-hidden"
                style={{
                  backgroundColor: config.featuredBall.color,
                  borderColor: config.featuredBall.strokeColor,
                  borderWidth: '3px',
                  borderStyle: 'solid',
                }}
              >
                {config.featuredBall.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={config.featuredBall.imageUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            </div>
            <p className="text-xs font-medium text-gray-500">Featured: {config.featuredBall.name}</p>
          </div>

          <button
            onClick={() => router.push('/')}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold min-h-[48px] py-3 px-6 rounded-lg hover:scale-105 transition-all shadow-lg"
          >
            Back to Menu
          </button>
        </div>
      </MenuBackground>
    );
  }

  const pp = user?.proPassData?.passId === passId ? user.proPassData : null;
  const passMeters = pp?.meters ?? 0;
  const premiumUnlocked = pp?.premiumUnlocked ?? false;
  const claimedFree = pp?.claimedFree ?? [];
  const claimedPremium = pp?.claimedPremium ?? [];
  const passEnded = isProPassEnded();

  const currentTierIndex = config.levels.findIndex(
    (l, i) => !claimedFree.includes(i) && passMeters < l.meterThreshold
  );
  const currentTier = currentTierIndex === -1 ? config.levels.length : currentTierIndex + 1;
  const currentThreshold = currentTierIndex === -1
    ? config.levels[config.levels.length - 1].meterThreshold
    : config.levels[currentTierIndex].meterThreshold;
  const prevThreshold = currentTierIndex > 0 ? config.levels[currentTierIndex - 1].meterThreshold : 0;
  const tierProgress = currentThreshold > prevThreshold
    ? Math.min(100, ((passMeters - prevThreshold) / (currentThreshold - prevThreshold)) * 100)
    : 100;

  const handleClaim = async (track: 'free' | 'premium', levelIndex: number) => {
    if (!user) return;
    const key = `${track}-${levelIndex}`;
    setActionLoading(key);
    setError(null);
    setSuccess(null);
    try {
      const updated = await claimProPassReward(user.username, passId, track, levelIndex);
      setUser(updated);
      setCurrentUser(updated);
      const reward = track === 'free' ? config.levels[levelIndex].freeReward : config.levels[levelIndex].premiumReward;
      setSuccess(`Claimed: ${formatProPassReward(reward)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim reward');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlockPremium = async () => {
    if (!user || passEnded) return;
    setActionLoading('premium-unlock');
    setError(null);
    setSuccess(null);
    try {
      const updated = await purchaseProPassPremium(user.username, passId, config.premiumCost);
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
    if (passMeters >= threshold) return 'claimable';
    return 'pending';
  };

  const renderCell = (track: 'free' | 'premium', levelIndex: number) => {
    const state = getCellState(track, levelIndex);
    const reward: ProPassReward = track === 'free' ? config.levels[levelIndex].freeReward : config.levels[levelIndex].premiumReward;
    const key = `${track}-${levelIndex}`;
    const loading = actionLoading === key;

    return (
      <div
        key={key}
        onClick={() => {
          if (state === 'claimable' && !loading) handleClaim(track, levelIndex);
        }}
        className={`relative aspect-square flex flex-col items-center justify-center rounded-md border-2 cursor-default transition-all ${
          state === 'claimed'
            ? 'bg-green-50 border-green-500'
            : state === 'claimable'
            ? 'bg-yellow-50 border-yellow-400 shadow-lg cursor-pointer hover:scale-105'
            : state === 'locked'
            ? 'bg-gray-100 border-gray-300 opacity-50'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        {state === 'claimed' && (
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {state !== 'claimed' && (
          <>
            {(() => {
              const ball = reward.type === 'ball' && reward.ballId ? getProPassBallById(reward.ballId) : null;
              if (ball?.imageUrl) {
                return (
                  <span
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: ball.color,
                      border: `2px solid ${ball.strokeColor}`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ball.imageUrl} alt={ball.name} className="w-full h-full object-cover" />
                  </span>
                );
              }
              return <span className="text-sm sm:text-base">{proPassRewardEmoji(reward)}</span>;
            })()}
            <span className="text-[8px] sm:text-[9px] font-medium text-gray-600 mt-0.5 text-center leading-tight px-0.5">
              {formatProPassReward(reward)}
            </span>
          </>
        )}
        {state === 'claimable' && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />
        )}
        {state === 'locked' && (
          <span className="absolute top-0 right-0.5 text-[8px]">🔒</span>
        )}
      </div>
    );
  };

  return (
    <MenuBackground className="min-h-screen p-2 sm:p-4">
      <div className="max-w-4xl mx-auto mb-3 sm:mb-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => router.push('/')}
            className="bg-white/20 backdrop-blur-sm text-white font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:bg-white/30 transition-all text-sm"
          >
            &larr; Back
          </button>
          <h1 className="text-sm sm:text-xl font-bold text-white drop-shadow text-center">
            {config.emoji} Pro Pass
          </h1>
          <div className="bg-white/20 backdrop-blur-sm text-white min-h-[44px] py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5 text-sm">
            <span className="text-base sm:text-lg">🪙</span>
            <span className="font-bold">{formatPrice(user?.totalCoins ?? 0)}</span>
          </div>
        </div>
      </div>

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

      {passEnded && (
        <div className="max-w-4xl mx-auto mb-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 text-center">
            Pro Pass has ended — you can still claim earned rewards, but no new meters will accrue.
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-3 sm:p-5">
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
                  {formatPrice(passMeters)}/{formatPrice(currentThreshold)}m
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 sm:gap-4">
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
                <div className="absolute inset-0 -m-3 rounded-full animate-pulse opacity-30" style={{ backgroundColor: config.featuredBall.color }} />
                <div
                  className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg z-10 overflow-hidden"
                  style={{
                    backgroundColor: config.featuredBall.color,
                    borderColor: config.featuredBall.strokeColor,
                    borderWidth: '3px',
                    borderStyle: 'solid',
                  }}
                >
                  {config.featuredBall.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.featuredBall.imageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              </div>

              {!premiumUnlocked ? (
                <button
                  onClick={handleUnlockPremium}
                  disabled={passEnded || actionLoading === 'premium-unlock' || (user?.totalCoins ?? 0) < config.premiumCost}
                  className={`text-xs font-bold min-h-[44px] py-2 px-3 rounded-lg border-2 transition-all ${
                    !passEnded && (user?.totalCoins ?? 0) >= config.premiumCost
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

            {/* 100-tier grid scrolls horizontally on narrow screens */}
            <div className="flex-1 min-w-0">
              <div className="overflow-x-auto -mx-1 px-1 pb-2">
                <div className="inline-block min-w-full">
                  <div className="flex gap-0.5 sm:gap-1 mb-1">
                    {config.levels.map((level, i) => (
                      <div
                        key={i}
                        className="w-9 sm:w-10 flex-shrink-0 text-center text-[8px] sm:text-[9px] font-bold text-gray-400"
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-0.5 sm:gap-1 mb-1">
                    {config.levels.map((level, i) => (
                      <div
                        key={`label-p-${i}`}
                        className="w-9 sm:w-10 flex-shrink-0 text-center text-[7px] sm:text-[8px] font-bold text-gray-400"
                        title={`${formatPrice(level.meterThreshold)}m`}
                      >
                        {level.meterThreshold >= 1000 ? `${Math.round(level.meterThreshold / 1000)}k` : level.meterThreshold}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-0.5 sm:gap-1 mb-1 sm:mb-2">
                    {config.levels.map((_, i) => (
                      <div key={`p-${i}`} className="w-9 sm:w-10 flex-shrink-0">
                        {renderCell('premium', i)}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-0.5 sm:gap-1">
                    {config.levels.map((_, i) => (
                      <div key={`f-${i}`} className="w-9 sm:w-10 flex-shrink-0">
                        {renderCell('free', i)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MenuBackground>
  );
}
