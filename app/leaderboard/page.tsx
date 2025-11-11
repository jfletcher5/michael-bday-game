'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getScoresFromFirestore } from '../lib/firestore';
import { Score } from '../lib/types';

/**
 * Leaderboard Page
 * Displays top 5 scores from Firebase Firestore sorted by distance (descending)
 */
export default function Leaderboard() {
  const router = useRouter();
  const [scores, setScores] = useState<Score[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load scores from Firestore on mount
  useEffect(() => {
    async function loadScores() {
      try {
        setIsLoading(true);
        const firestoreScores = await getScoresFromFirestore(5);
        setScores(firestoreScores);
        setError(null);
      } catch (err) {
        console.error('Failed to load scores:', err);
        setError('Failed to load leaderboard. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadScores();
  }, []);

  // Navigate back to main menu
  const handleBackToMenu = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      <main className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🏆 Leaderboard
          </h1>
          <p className="text-gray-600">
            Top 5 Players
          </p>
        </div>

        {/* Leaderboard Table */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            Loading scores...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-2">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="py-3 px-2 text-left text-sm font-semibold text-gray-700">
                    Rank
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">
                    Player
                  </th>
                  <th className="py-3 px-4 text-right text-sm font-semibold text-gray-700">
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score, index) => (
                  <tr 
                    key={index}
                    className={`border-b border-gray-200 hover:bg-gray-50 transition ${
                      index === 0 ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="py-4 px-2">
                      <span className={`font-bold ${
                        index === 0 ? 'text-yellow-600 text-xl' :
                        index === 1 ? 'text-gray-500 text-lg' :
                        index === 2 ? 'text-orange-600' :
                        'text-gray-700'
                      }`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-800">
                      {score.username || 'Anonymous'}
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-purple-600 text-lg">
                      {score.distance}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-8 pt-6 border-t border-gray-200">
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
