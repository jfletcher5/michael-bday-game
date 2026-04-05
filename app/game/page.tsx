'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { BossHudState, GameState, Controls, PlayerIdentity, User } from '../lib/types';
import { startGameSession, submitScoreViaFunction, updateUserStats, useExtraBall, GameSession } from '../lib/firestore';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { getBallTypeById, getDefaultBallType } from '../lib/ballTypes';
import ControlsComponent from './components/Controls';
import TouchControls from './components/TouchControls';
import GameCanvas from './components/GameCanvas';

// Stable empty platforms array prevents GameCanvas re-init loops in infinite mode.
const EMPTY_CUSTOM_PLATFORMS: [] = [];

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
  
  // Game metrics — refs hold the live values; state is throttled for HUD display.
  const distanceRef = useRef(0);
  const coinsEarnedRef = useRef(0);
  const [displayDistance, setDisplayDistance] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [bossHud, setBossHud] = useState<BossHudState | null>(null);
  const hudTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Player identity (loaded from localStorage)
  const playerIdentityRef = useRef<PlayerIdentity | null>(null);

  // Current user (if logged in)
  const currentUserRef = useRef<User | null>(null);

  // Track last distance milestone for coin calculation (every 50m = 20 coins)
  const lastCoinMilestoneRef = useRef(0);
  
  // Extra ball revival: signal to GameCanvas to reposition ball
  const reviveSignalRef = useRef(false);

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
  
  // Throttle HUD state updates to ~4 times per second instead of every frame.
  useEffect(() => {
    if (gameState === 'playing') {
      hudTimerRef.current = setInterval(() => {
        setDisplayDistance(distanceRef.current);
        setDisplayCoins(coinsEarnedRef.current);
      }, 250);
    } else {
      // Flush final values when game ends.
      setDisplayDistance(distanceRef.current);
      setDisplayCoins(coinsEarnedRef.current);
      if (hudTimerRef.current) {
        clearInterval(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    }
    return () => {
      if (hudTimerRef.current) {
        clearInterval(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    };
  }, [gameState]);

  // Get the selected ball type for the current user
  const getSelectedBallType = () => {
    const user = currentUserRef.current;
    if (user && user.selectedBall) {
      return getBallTypeById(user.selectedBall);
    }
    return getDefaultBallType();
  };

  // Handle distance updates from game canvas — stores in refs (no re-render).
  // Coins are derived from distance milestones.
  const handleDistanceUpdate = useCallback((newDistance: number) => {
    distanceRef.current = newDistance;

    // Calculate coins: 20 coins for every 50 meters
    const newMilestone = Math.floor(newDistance / 50);
    if (newMilestone > lastCoinMilestoneRef.current) {
      const milestonesReached = newMilestone - lastCoinMilestoneRef.current;
      const newCoins = milestonesReached * 20;
      coinsEarnedRef.current += newCoins;
      lastCoinMilestoneRef.current = newMilestone;
    }
  }, []);

  // Handle game over — check for extra balls, then auto-save stats and score
  const handleGameOver = async () => {
    // Hide boss UI immediately when the run ends.
    setBossHud(null);
    // Flush latest values for display
    setDisplayDistance(distanceRef.current);
    setDisplayCoins(coinsEarnedRef.current);

    const extraBalls = currentUserRef.current?.extraBalls ?? 0;
    if (extraBalls > 0) {
      setGameState('revivePrompt');
      return;
    }

    setGameState('gameOver');

    // Auto-save stats and score in the background
    const user = currentUserRef.current;
    const session = gameSessionRef.current;
    const identity = getIdentity();

    if (user) {
      try {
        const updatedUser = await updateUserStats(user.username, distanceRef.current, coinsEarnedRef.current);
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
        }
      } catch (error) {
        console.error('Failed to auto-save user stats:', error);
      }
    }

    if (session) {
      try {
        await submitScoreViaFunction(session, {
          avatarId: identity.avatarId,
          initials: identity.initials,
          distance: distanceRef.current,
          date: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to auto-save score:', error);
      }
    }
  };

  // Handle revival with an extra ball
  const handleRevive = async () => {
    const user = currentUserRef.current;
    if (!user) return;
    try {
      const updated = await useExtraBall(user.username);
      currentUserRef.current = updated;
      setCurrentUser(updated);
      reviveSignalRef.current = true;
      setGameState('playing');
    } catch (err) {
      console.error('Failed to use extra ball:', err);
      setGameState('gameOver');
    }
  };

  // Decline revival — auto-save and proceed to game over
  const handleDeclineRevive = async () => {
    setGameState('gameOver');

    const user = currentUserRef.current;
    const session = gameSessionRef.current;
    const identity = getIdentity();

    if (user) {
      try {
        const updatedUser = await updateUserStats(user.username, distanceRef.current, coinsEarnedRef.current);
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
        }
      } catch (error) {
        console.error('Failed to auto-save user stats:', error);
      }
    }

    if (session) {
      try {
        await submitScoreViaFunction(session, {
          avatarId: identity.avatarId,
          initials: identity.initials,
          distance: distanceRef.current,
          date: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to auto-save score:', error);
      }
    }
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
    // Hide boss UI when transitioning to completion flow.
    setBossHud(null);
    setGameState('finished');
    
    const identity = getIdentity();
    const session = gameSessionRef.current;
    const user = currentUserRef.current;
    
    // Update user stats if logged in
    if (user) {
      try {
        const updatedUser = await updateUserStats(user.username, distanceRef.current, coinsEarnedRef.current);
        if (updatedUser) {
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          console.log(`Stats updated: +${distanceRef.current}m, +${coinsEarnedRef.current} coins`);
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
        distance: distanceRef.current,
        date: new Date().toISOString(),
      });
      console.log('Game completion score saved via Cloud Function');
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

  // Return to main menu
  const handleReturnToMenu = () => {
    router.push('/');
  };

  // Restart game - also reinitialize session for new game
  const handleRestart = async () => {
    setGameState('playing');
    distanceRef.current = 0;
    coinsEarnedRef.current = 0;
    setDisplayDistance(0);
    setDisplayCoins(0);
    reviveSignalRef.current = false;
    // Reset any prior boss meter for the new run.
    setBossHud(null);
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
    <div className="relative w-screen h-dvh overflow-hidden bg-black">
      {/* Loading overlay - show while session is initializing */}
      {sessionLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-white text-base sm:text-xl font-semibold mb-4 px-4">Initializing secure game session...</div>
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
        onBossHudUpdate={setBossHud}
        isPlaying={gameState === 'playing' && !sessionLoading}
        reviveSignalRef={reviveSignalRef}
        mode="infinite"
        customPlatforms={EMPTY_CUSTOM_PLATFORMS}
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
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 bg-black/50 text-white px-3 py-2 sm:px-6 sm:py-3 rounded-lg backdrop-blur-sm">
          <div className="text-xs sm:text-sm font-semibold">Distance: {displayDistance}m</div>
          <div className="text-xs sm:text-sm font-semibold flex items-center gap-1 mt-0.5 sm:mt-1">
            <span className="text-yellow-300">🪙</span> {displayCoins} coins
          </div>
        </div>
      )}

      {/* Boss Health Meter - shown only during active boss encounters */}
      {gameState === 'playing' && bossHud?.visible && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[min(560px,70vw)] rounded-xl border border-white/30 bg-black/60 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-white text-sm font-semibold">
            <span>{bossHud.name}</span>
            <span>{bossHud.hp}/{bossHud.maxHp} HP</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 transition-all duration-150"
              style={{ width: `${Math.max(0, Math.min(100, (bossHud.hp / Math.max(1, bossHud.maxHp)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Extra Ball Revival Prompt */}
      {gameState === 'revivePrompt' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-purple-600 mb-2">🔮 Use Extra Ball?</h2>
            <p className="text-gray-600 mb-2">You have <span className="font-bold text-purple-600">{currentUserRef.current?.extraBalls ?? 0}</span> extra ball{(currentUserRef.current?.extraBalls ?? 0) !== 1 ? 's' : ''}</p>
            <p className="text-sm text-gray-500 mb-6">Revive and continue from where you left off!</p>

            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">{displayDistance}m</div>
                  <div className="text-sm text-gray-600">Distance</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
                  </div>
                  <div className="text-sm text-gray-600">Coins Earned</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleRevive}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
              >
                🔮 Revive! (1 Extra Ball)
              </button>
              <button
                onClick={handleDeclineRevive}
                className="w-full bg-white text-gray-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition-all border border-gray-300"
              >
                No, End Game
              </button>
            </div>
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
                    {displayDistance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
                  </div>
                  <div className="text-sm text-gray-600">
                    Coins Earned
                  </div>
                </div>
              </div>
            </div>

            <p className="text-sm text-green-600 mb-4">Score saved automatically</p>

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
                    {displayDistance}m
                  </div>
                  <div className="text-sm text-gray-600">
                    Distance
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
                    <span>🪙</span> {displayCoins}
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
      {gameState === 'playing' && displayDistance < 5 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-black/70 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-lg backdrop-blur-sm text-center pointer-events-none max-w-[90vw]">
          <p className="text-sm sm:text-xl font-semibold">Use arrow keys to move and jump!</p>
          <p className="text-xs sm:text-sm mt-1 sm:mt-2">Land on platforms and survive as long as you can</p>
        </div>
      )}
    </div>
  );
}
