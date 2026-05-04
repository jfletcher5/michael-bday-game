'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getScoresFromFirestore, getVerifiedUsernames } from '../lib/firestore';
import { Score } from '../lib/types';
import { getAvatarUrl } from '../lib/avatars';
import VerifiedBadge from '../components/VerifiedBadge';

// Maximum number of scores shown in the scrollable leaderboard
const MAX_SCORES = 200;

/**
 * Leaderboard Page
 * Displays the top scores from Firestore sorted by distance (descending)
 * in a single scrollable list capped at MAX_SCORES entries.
 */
export default function Leaderboard() {
  const router = useRouter();
  const [scores, setScores] = useState<Score[]>([]);
  const [verifiedSet, setVerifiedSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScores = async () => {
    try {
      setIsLoading(true);
      const result = await getScoresFromFirestore(MAX_SCORES, null);
      setScores(result.scores);
      setError(null);
    } catch (err) {
      console.error('Failed to load scores:', err);
      setError('Failed to load leaderboard. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScores();
    getVerifiedUsernames().then(setVerifiedSet);
  }, []);

  const handleBackToMenu = () => {
    router.push('/');
  };

  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  };

  const getRankStyle = (rank: number): string => {
    if (rank === 1) return 'text-yellow-600 text-xl';
    if (rank === 2) return 'text-gray-500 text-lg';
    if (rank === 3) return 'text-orange-600';
    return 'text-gray-700';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4 py-8">
      <main className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 w-full max-w-2xl mx-2 sm:mx-4 my-auto">
        {/* Page Title */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-1 sm:mb-2">
            Leaderboard
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Top {MAX_SCORES} Players
          </p>
        </div>

        {/* Leaderboard Table */}
        {isLoading && scores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Loading scores...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-2">{error}</p>
            <button
              onClick={loadScores}
              className="text-purple-600 hover:text-purple-700 underline"
            >
              Retry
            </button>
          </div>
        ) : scores.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No scores yet. Be the first to play!
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="py-2 sm:py-3 px-2 sm:px-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-10 sm:w-16">
                      Rank
                    </th>
                    <th className="py-2 sm:py-3 px-2 sm:px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">
                      Player
                    </th>
                    <th className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-gray-700 w-20 sm:w-28">
                      Distance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score, index) => {
                    const rank = index + 1;
                    return (
                      <tr
                        key={index}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition ${
                          rank === 1 ? 'bg-yellow-50' : ''
                        }`}
                      >
                        <td className="py-3 sm:py-4 px-2 sm:px-3">
                          <span className={`font-bold ${getRankStyle(rank)}`}>
                            {getRankDisplay(rank)}
                          </span>
                        </td>
                        <td className="py-3 sm:py-4 px-2 sm:px-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <Image
                              src={getAvatarUrl(score.avatarId)}
                              alt="Player avatar"
                              width={32}
                              height={32}
                              className="rounded-full bg-gray-100 w-8 h-8 sm:w-10 sm:h-10"
                              unoptimized
                            />
                            <span className="font-bold text-gray-800 text-sm sm:text-lg tracking-wide">
                              {score.initials}
                            </span>
                            {verifiedSet.has(score.initials.toUpperCase()) && (
                              <VerifiedBadge size={18} />
                            )}
                          </div>
                        </td>
                        <td className="py-3 sm:py-4 px-2 sm:px-4 text-right font-semibold text-purple-600 text-sm sm:text-lg">
                          {score.distance}m
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={handleBackToMenu}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Back to Menu
          </button>
        </div>
      </main>
    </div>
  );
}
