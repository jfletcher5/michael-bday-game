'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { GameState, Controls } from '../lib/types';
import { getUsername } from '../lib/localStorage';
import { addScoreToFirestore } from '../lib/firestore';
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
  
  // Game metrics
  const [distance, setDistance] = useState(0);

  // Handle distance updates from game canvas
  const handleDistanceUpdate = (newDistance: number) => {
    setDistance(newDistance);
  };

  // Handle game over
  const handleGameOver = () => {
    setGameState('gameOver');
  };

  // Handle finishing game - save score to Firestore
  const handleFinish = async () => {
    setGameState('finished');
    
    // Save score to Firestore
    const username = getUsername() || 'Anonymous';
    
    try {
      await addScoreToFirestore({
        username,
        distance,
        date: new Date().toISOString(),
      });
      console.log('Game completion score saved to Firestore');
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

  // Save score to Firestore leaderboard and navigate
  const handleSaveScore = async () => {
    const username = getUsername() || 'Anonymous';
    
    try {
      // Save score to Firestore
      await addScoreToFirestore({
        username,
        distance,
        date: new Date().toISOString(),
      });
      router.push('/leaderboard');
    } catch (error) {
      console.error('Failed to save score:', error);
      // Still navigate to leaderboard even if save fails
      router.push('/leaderboard');
    }
  };

  // Return to main menu
  const handleReturnToMenu = () => {
    router.push('/');
  };

  // Restart game
  const handleRestart = () => {
    setGameState('playing');
    setDistance(0);
    setControls({
      left: false,
      right: false,
      jump: false,
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* 2D Game Canvas */}
      <GameCanvas
        controls={controls}
        onDistanceUpdate={handleDistanceUpdate}
        onGameOver={handleGameOver}
        onFinish={handleFinish}
        isPlaying={gameState === 'playing'}
        mode="infinite"
        customPlatforms={[]}
      />

      {/* Keyboard Controls Handler */}
      <ControlsComponent
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing'}
      />

      {/* Touch Controls for Tablets/Mobile */}
      <TouchControls
        controls={controls}
        setControls={setControls}
        disabled={gameState !== 'playing'}
      />

      {/* HUD - Display current stats */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-6 py-3 rounded-lg backdrop-blur-sm">
          <div className="text-sm font-semibold">Distance: {distance}m</div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-red-600 mb-4">Game Over!</h2>
            <p className="text-gray-600 mb-6">You fell off the platforms!</p>
            
            <div className="bg-gray-100 rounded-lg p-4 mb-6">
              <div className="text-2xl font-bold text-gray-800 mb-2">
                {distance}m
              </div>
              <div className="text-sm text-gray-600">
                Distance Survived
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSaveScore}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Save Score & View Leaderboard
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
              <div className="text-2xl font-bold text-gray-800 mb-2">
                {distance}m
              </div>
              <div className="text-sm text-gray-600">
                Distance Survived
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
