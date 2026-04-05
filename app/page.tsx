'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, setCurrentUser as persistCurrentUser } from './lib/auth';
import { getUserData } from './lib/firestore';
import { User } from './lib/types';
import { AVATAR_OPTIONS, getAvatarUrl } from './lib/avatars';
import { getCurrentSeasonConfig, getCurrentSeasonId, getDaysRemaining, formatReward } from './lib/seasons';
import { formatPrice } from './lib/ballTypes';
import TopNav from './components/TopNav';

/**
 * Main Menu Page
 * Allows user to select avatar and enter initials, start game, or view leaderboard
 */
export default function Home() {
  const router = useRouter();
  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load player identity and user data on mount
  useEffect(() => {
    const user = getCurrentUser();

    if (!user) {
      router.push('/login');
      return;
    }

    // Show the cached user immediately so the page renders fast...
    setCurrentUser(user);
    setSelectedAvatarId(user.avatarId);
    setIsLoading(false);

    // ...then refresh from Firestore so stats stay in sync across devices/domains.
    getUserData(user.username).then((fresh) => {
      if (fresh) {
        setCurrentUser(fresh);
        persistCurrentUser(fresh);
      }
    });
  }, [router]);
  
  // Handle logout - redirect to login
  const handleLogout = () => {
    setCurrentUser(null);
    router.push('/login');
  };

  // Check if player can start game (must be logged in and have avatar selected)
  const canStartGame = currentUser !== null && selectedAvatarId !== null;

  // Start game
  const handleStartGame = () => {
    if (canStartGame && currentUser) {
      // User is logged in, game will use their user data
      router.push('/game?mode=infinite');
    }
  };

  // Navigate to leaderboard
  const handleViewLeaderboard = () => {
    router.push('/leaderboard');
  };

  if (isLoading) {
    return null; // Prevent flash of empty state
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center md:justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4 py-20 sm:py-24">
      {/* Top Navigation */}
      <TopNav user={currentUser} onLogout={handleLogout} transparent />
      
      <main className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 w-full max-w-md md:max-w-4xl mx-2 sm:mx-4 my-auto">
        {/* Game Title */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-1 sm:mb-2">
            Platform Drop
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Survive the rising platforms!
          </p>
        </div>

        {/* Two Column Layout: Character Select (Left) | Everything Else (Right) */}
        <div className="flex flex-col md:flex-row md:gap-8">
          {/* LEFT COLUMN: Character Selection Only */}
          <div className="mb-4 sm:mb-6 md:mb-0 md:w-1/2">
            <label className="block text-sm font-medium text-gray-700 mb-2 sm:mb-3">
              Choose Your Character
            </label>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar.id}
                  onClick={() => setSelectedAvatarId(avatar.id)}
                  className={`relative p-2 sm:p-3 rounded-xl transition-all transform hover:scale-105 min-h-[60px] ${
                    selectedAvatarId === avatar.id
                      ? 'bg-purple-100 ring-2 ring-purple-500 shadow-md'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  aria-label={`Select ${avatar.name}`}
                >
                  <Image
                    src={getAvatarUrl(avatar.id)}
                    alt={avatar.name}
                    width={64}
                    height={64}
                    className="w-full h-auto rounded-lg"
                    unoptimized
                  />
                  <span className="block text-[10px] sm:text-xs text-gray-600 mt-1 font-medium">
                    {avatar.name}
                  </span>
                  {selectedAvatarId === avatar.id && (
                    <div className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: Username Display, Buttons, and Instructions */}
          <div className="md:w-1/2 flex flex-col">
            {/* Username Display (Read-only) */}
            {currentUser && (
              <div className="mb-6">
                <label 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Username
                </label>
                <div className="w-full px-4 py-3 md:py-4 bg-gray-100 border border-gray-300 rounded-lg text-center text-xl md:text-2xl font-bold tracking-widest uppercase text-gray-700">
                  {currentUser.username}
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Logged in as {currentUser.username}
                </p>
              </div>
            )}

            {/* Season Badge */}
            {(() => {
              const seasonConfig = getCurrentSeasonConfig();
              if (!seasonConfig) return null;
              const currentSeasonId = getCurrentSeasonId();
              const seasonMeters = currentUser?.seasonData?.seasonId === currentSeasonId
                ? currentUser.seasonData.meters
                : 0;
              const daysLeft = getDaysRemaining(currentSeasonId);
              return (
                <button
                  onClick={() => router.push(`/season/${currentSeasonId}`)}
                  className="w-full mb-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-3 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{seasonConfig.emoji}</span>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{seasonConfig.displayName} Season</p>
                        <p className="text-xs text-gray-500">{formatPrice(seasonMeters)}m this season</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-600 font-medium">{daysLeft}d left</p>
                      <p className="text-xs text-gray-400">View →</p>
                    </div>
                  </div>
                </button>
              );
            })()}

            {/* Action Buttons */}
            <div className="space-y-3 mb-4 sm:mb-6">
              <button
                onClick={handleStartGame}
                disabled={!canStartGame}
                className={`w-full font-semibold min-h-[48px] py-3 px-6 rounded-lg transition-all transform shadow-lg text-sm sm:text-base ${
                  canStartGame
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 hover:scale-105'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {canStartGame ? 'Start Game' : 'Select Character'}
              </button>

              <button
                onClick={handleViewLeaderboard}
                className="w-full bg-gray-200 text-gray-800 font-semibold min-h-[48px] py-3 px-6 rounded-lg hover:bg-gray-300 transition-all transform hover:scale-105 text-sm sm:text-base"
              >
                View Leaderboard
              </button>
            </div>

            {/* Instructions - hidden on very small screens */}
            <div className="pt-3 sm:pt-4 border-t border-gray-200 hidden sm:block">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                How to Play:
              </h2>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Use left/right arrow keys to move</li>
                <li>• Press up arrow to jump over gaps</li>
                <li>• Land on platforms scrolling up from below</li>
                <li>• Don't fall off the screen!</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
