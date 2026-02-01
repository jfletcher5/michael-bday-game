'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { GameState, Controls, PlayerIdentity, User } from '../lib/types';
import { startGameSession, submitScoreViaFunction, updateUserStats, GameSession } from '../lib/firestore';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { getBallTypeById, getDefaultBallType } from '../lib/ballTypes';
import ControlsComponent from './components/Controls';
import TouchControls from './components/TouchControls';
import GameCanvas from './components/GameCanvas';

/**
 * Game Page Component
 * Wraps the actual game in Suspense for useSearchParams
 */
export default function GamePage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
      <Game />
    </Suspense>
  );
}

/**
 * Game Component
 * Main game page with 2D platform scroller - infinite mode
 * Uses Cloud Functions for secure score submission with anti-cheat validation
 */
function Game() {
  const router = useRouter();
  
  // Game state
  const [gameState, setGameState] = useState<GameState>('playing');
  const [controls, setControls] = useState<Controls>({
    left: false,
    right: false,
    jump: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Game metrics
  const [distance, setDistance] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  
  // Player identity (loaded from localStorage)
  const playerIdentityRef = useRef<PlayerIdentity | null>(null);
  
  // Current user (if logged in)
  const currentUserRef = useRef<User | null>(null);
  
  // Track last distance milestone for coin calculation (every 50m = 20 coins)
  const lastCoinMilestoneRef = useRef(0);
  
  // Game session for anti-cheat (from Cloud Function) - REQUIRED for score submission
  const gameSessionRef = useRef<GameSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true); // Track session initialization state

  // Load player identity and start game session on mount
  // Cloud Functions are REQUIRED - no fallback to prevent cheating
  // Login is REQUIRED - no guest mode
  useEffect(() => {
    const user = getCurrentUser();
    
    // Require login to play
    if (!user) {
      router.push('/login');
      return;
    }
    
    currentUserRef.current = user;
    // Use user's avatar and initials for player identity
    playerIdentityRef.current = {
      avatarId: user.avatarId,
      initials: user.username,
    };
    
    // Start a secure game session via Cloud Function
    // This is REQUIRED for anti-cheat protection
    const initSession = async () => {
      setSessionLoading(true); // Mark as loading
      try {
        const session = await startGameSession();
        gameSessionRef.current = session;
        setSessionError(null);
        console.log('Game session initialized via Cloud Function');
      } catch (error) {
        console.error('Failed to initialize game session (Cloud Functions required):', error);
        setSessionError('Unable to start secure game session. Score submission will be disabled.');
        gameSessionRef.current = null;
      } finally {
        setSessionLoading(false); // Mark as done loading (success or failure)
      }
    };
    
    initSession();
  }, [router]);
  
  // Get the selected ball type for the current user
  const getSelectedBallType = () => {
    const user = currentUserRef.current;
    if (user && user.selectedBall) {
      return getBallTypeById(user.selectedBall);
    }
    return getDefaultBallType();
  };

  // Handle distance updates from game canvas
  // Also calculates coins earned (20 coins per 50 meters)
  const handleDistanceUpdate = (newDistance: number) => {
    setDistance(newDistance);
    
    // Calculate coins: 20 coins for every 50 meters
    const newMilestone = Math.floor(newDistance / 50);
    if (newMilestone > lastCoinMilestoneRef.current) {
      const milestonesReached = newMilestone - lastCoinMilestoneRef.current;
      const newCoins = milestonesReached * 20;
      setCoinsEarned(prev => prev + newCoins);
      lastCoinMilestoneRef.current = newMilestone;
    }
  };

  // Handle game over
  const handleGameOver = () => {
    setGameState('gameOver');
  };

  // Get player identity - user must be logged in
  const getIdentity = (): PlayerIdentity => {
    if (playerIdentityRef.current) {
      return playerIdentityRef.current;
    }
    // Fallback should not happen if login check works, but provide defaults
    return { avatarId: 1, initials: 'AAA' };
  };

  // Handle finishing game - save score via Cloud Function ONLY (anti-cheat protection)
  const handleFinish = async () => {
    setGameState('finished');
    
    const identity = getIdentity();
    const session = gameSessionRef.current;
    const user = currentUserRef.current;
    
    // Update user stats if logged in
    if (user) {
      try {
        const updatedUser = await updateUserStats(user.username, distance, coinsEarned);
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          console.log(`Stats updated: +${distance}m, +${coinsEarned} coins`);
        }
      } catch (error) {
        console.error('Failed to update user stats:', error);
      }
    }
    
    if (!session) {
      console.error('Cannot save score: Game session not initialized. Cloud Functions required.');
      return;
    }
    
    try {
      await submitScoreViaFunction(session, {
        avatarId: identity.avatarId,
        initials: identity.initials,
        distance,
        date: new Date().toISOString(),
      });
      console.log('Game completion score saved via Cloud Function');
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

  // Save score via Cloud Function ONLY (anti-cheat protection required)
  const handleSaveScore = async () => {
    const identity = getIdentity();
    const session = gameSessionRef.current;
    const user = currentUserRef.current;
    
    setIsSubmitting(true);
    
    // Update user stats if logged in
    if (user) {
      try {
        const updatedUser = await updateUserStats(user.username, distance, coinsEarned);
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          console.log(`Stats updated: +${distance}m, +${coinsEarned} coins`);
        }
      } catch (error) {
        console.error('Failed to update user stats:', error);
      }
    }
    
    // Require valid game session - no fallback to prevent cheating
    if (!session) {
      console.error('Cannot save score: Game session not initialized. Cloud Functions required.');
      alert('Unable to save score: Secure game session not available. Please ensure Cloud Functions are deployed.');
      router.push('/leaderboard');
      return;
    }
    
    try {
      // Submit score via Cloud Function with anti-cheat validation
      await submitScoreViaFunction(session, {
        avatarId: identity.avatarId,
        initials: identity.initials,
        distance,
        date: new Date().toISOString(),
      });
      console.log('Score saved via Cloud Function with anti-cheat validation');
      router.push('/leaderboard');
    } catch (error) {
      console.error('Failed to save score:', error);
      alert('Failed to save score. Please try again.');
      // Still navigate to leaderboard even if save fails
      router.push('/leaderboard');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Return to main menu
  const handleReturnToMenu = () => {
    router.push('/');
  };

  // Restart game - also reinitialize session for new game
  const handleRestart = async () => {
    setGameState('playing');
    setDistance(0);
    setCoinsEarned(0);
    lastCoinMilestoneRef.current = 0;
    setControls({
      left: false,
      right: false,
      jump: false,
    });
    
    // Reinitialize game session for the new game
    setSessionLoading(true);
    try {
      const session = await startGameSession();
      gameSessionRef.current = session;
      setSessionError(null);
      console.log('Game session reinitialized for new game');
    } catch (error) {
      console.error('Failed to reinitialize game session:', error);
      setSessionError('Unable to start secure game session. Score submission will be disabled.');
      gameSessionRef.current = null;
    } finally {
      setSessionLoading(false);
    }
  };
  
  // Get the current ball type for rendering
  const ballType = getSelectedBallType();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Loading overlay - show while session is initializing */}
      {sessionLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-white text-xl font-semibold mb-4">Initializing secure game session...</div>
            <div className="text-gray-400 text-sm">Please wait</div>
          </div>
        </div>
      )}
      
      {/* 2D Game Canvas */}
      <GameCanvas
        controls={controls}
        onDistanceUpdate={handleDistanceUpdate}
        onGameOver={handleGameOver}
        onFinish={handleFinish}
        isPlaying={gameState === 'playing' && !sessionLoading}
        mode="infinite"
        customPlatforms={[]}
        ballColor={ballType.color}
        ballStrokeColor={ballType.strokeColor}
        ballImageUrl={ballType.imageUrl}
        ballImageFilter={ballType.imageFilter}
      />

      {/* Keyboard Controls Handler */}
      <ControlsComponent
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing' || sessionLoading}
      />

      {/* Touch Controls for Tablets/Mobile */}
      <TouchControls
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing' || sessionLoading}
      />

      {/* HUD - Display current stats */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-6 py-3 rounded-lg backdrop-blur-sm">
          <div className="text-sm font-semibold">Distance: {distance}m</div>
          <div className="text-sm font-semibold flex items-center gap-1 mt-1">
            <span className="text-yellow-300">🪙</span> {coinsEarned} coins
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-red-600 mb-4">Game Over!</h2>
            <p className="text-gray-600 mb-6">You fell off the platforms!</p>
            
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">
                    {distance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {coinsEarned}
                  </div>
                  <div className="text-sm text-gray-600">
                    Coins Earned
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* Show error if session failed to initialize */}
              {sessionError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                  <p className="text-sm text-red-600">{sessionError}</p>
                </div>
              )}
              <button
                onClick={handleSaveScore}
                disabled={isSubmitting || !gameSessionRef.current || sessionLoading}
                className={`w-full font-semibold py-3 px-6 rounded-lg transition-all transform shadow-lg ${
                  isSubmitting || !gameSessionRef.current || sessionLoading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 hover:scale-105'
                }`}
              >
                {isSubmitting ? 'Saving...' : sessionLoading ? 'Initializing Session...' : !gameSessionRef.current ? 'Score Saving Unavailable' : 'Save Score & View Leaderboard'}
              </button>
              <button
                onClick={handleReturnToMenu}
                disabled={isSubmitting}
                className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300 disabled:opacity-50"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Complete Modal */}
      {gameState === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-green-600 mb-4">🎉 Great Run!</h2>
            <p className="text-gray-600 mb-2">Amazing performance!</p>
            <p className="text-sm text-green-600 mb-6">✓ Score saved to leaderboard</p>
            
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">
                    {distance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {coinsEarned}
                  </div>
                  <div className="text-sm text-gray-600">
                    Coins Earned
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/leaderboard')}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
              >
                View Leaderboard
              </button>
              <button
                onClick={handleReturnToMenu}
                className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions overlay (shown briefly at start) */}
      {gameState === 'playing' && distance < 5 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-black/70 text-white px-8 py-4 rounded-lg backdrop-blur-sm text-center pointer-events-none">
          <p className="text-xl font-semibold">Use arrow keys to move and jump!</p>
          <p className="text-sm mt-2">Land on platforms and survive as long as you can</p>
        </div>
      )}
    </div>
  );
}
