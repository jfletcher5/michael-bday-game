'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUsername, setUsername } from './lib/localStorage';

/**
 * Main Menu Page
 * Allows user to enter username, start game, or view leaderboard
 */
export default function Home() {
  const router = useRouter();
  const [username, setUsernameState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load username from localStorage on mount
  useEffect(() => {
    const storedUsername = getUsername();
    setUsernameState(storedUsername);
    setIsLoading(false);
  }, []);

  // Handle username change
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsernameState(e.target.value);
  };

  // Start game
  const handleStartGame = () => {
    if (username.trim()) {
      setUsername(username.trim());
    }
    router.push('/game?mode=infinite');
  };

  // Navigate to leaderboard
  const handleViewLeaderboard = () => {
    router.push('/leaderboard');
  };

  if (isLoading) {
    return null; // Prevent flash of empty username
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
      <main className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        {/* Game Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Platform Drop
          </h1>
          <p className="text-gray-600">
            Survive the rising platforms!
          </p>
        </div>

        {/* Username Input */}
        <div className="mb-6">
          <label 
            htmlFor="username" 
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Enter Your Name
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="Your name"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
            maxLength={20}
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleStartGame}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Start Game
          </button>

          <button
            onClick={handleViewLeaderboard}
            className="w-full bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-lg hover:bg-gray-300 transition-all transform hover:scale-105"
          >
            View Leaderboard
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            How to Play:
          </h2>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Use left/right arrow keys to move</li>
            <li>• Press up arrow to jump over gaps</li>
            <li>• Land on platforms scrolling up from below</li>
            <li>• Don't fall off the screen (top or bottom)</li>
            <li>• Platforms get faster as you survive longer!</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
