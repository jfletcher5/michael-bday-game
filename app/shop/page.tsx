'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { purchaseBall, selectBall } from '../lib/firestore';
import { BALL_TYPES, getBallTypeById, isBallOwned, formatPrice } from '../lib/ballTypes';
import { User, BallType } from '../lib/types';

/**
 * Shop Page
 * Displays available ball types for purchase and selection
 * Users can buy new ball types with coins and select their active ball
 */
export default function ShopPage() {
  const router = useRouter();
  
  // User state
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI state
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load user data on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      // Redirect to login if not logged in
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setIsLoading(false);
  }, [router]);

  // Handle ball purchase
  const handlePurchase = async (ball: BallType) => {
    if (!user) return;
    
    setError(null);
    setSuccess(null);
    setPurchaseLoading(ball.id);

    try {
      const updatedUser = await purchaseBall(user.username, ball.id, ball.price);
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      setSuccess(`Successfully purchased ${ball.name}!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purchase';
      setError(message);
    } finally {
      setPurchaseLoading(null);
    }
  };

  // Handle ball selection
  const handleSelect = async (ball: BallType) => {
    if (!user) return;
    
    setError(null);
    setSuccess(null);
    setPurchaseLoading(ball.id);

    try {
      const updatedUser = await selectBall(user.username, ball.id);
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      setSuccess(`${ball.name} is now selected!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select ball';
      setError(message);
    } finally {
      setPurchaseLoading(null);
    }
  };

  // Render ball card
  const renderBallCard = (ball: BallType) => {
    if (!user) return null;
    
    const owned = isBallOwned(ball.id, user.ownedBalls);
    const selected = user.selectedBall === ball.id;
    const canAfford = user.totalCoins >= ball.price;
    const isProcessing = purchaseLoading === ball.id;

    return (
      <div
        key={ball.id}
        className={`relative bg-white rounded-xl shadow-md p-4 border-2 transition-all flex flex-col h-full ${
          selected
            ? 'border-purple-500 ring-2 ring-purple-200'
            : owned
            ? 'border-green-300'
            : 'border-gray-200'
        }`}
      >
        {/* Selected Badge */}
        {selected && (
          <div className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            SELECTED
          </div>
        )}

        {/* Owned Badge */}
        {owned && !selected && (
          <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            OWNED
          </div>
        )}

        {/* Ball Preview */}
        <div className="flex justify-center mb-3">
          <div
            className="w-20 h-20 rounded-full shadow-lg flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor: ball.color,
              border: `3px solid ${ball.strokeColor}`,
            }}
          >
            {ball.imageUrl && (
              <Image
                src={ball.imageUrl}
                alt={ball.name}
                width={56}
                height={56}
                className="w-14 h-14"
                style={ball.imageFilter ? { filter: ball.imageFilter } : undefined}
                unoptimized
              />
            )}
          </div>
        </div>

        {/* Ball Name */}
        <h3 className="text-center font-bold text-gray-800 mb-1">
          {ball.name}
        </h3>

        {/* Description */}
        {ball.description && (
          <p className="text-center text-xs text-gray-500 mb-2 line-clamp-2">
            {ball.description}
          </p>
        )}

        {/* Spacer to push button to bottom */}
        <div className="flex-grow"></div>

        {/* Price */}
        {!owned && (
          <p className={`text-center text-sm font-semibold mb-3 ${canAfford ? 'text-yellow-600' : 'text-red-500'}`}>
            {formatPrice(ball.price)} coins
          </p>
        )}

        {/* Action Button - Always at bottom */}
        {owned ? (
          <button
            onClick={() => handleSelect(ball)}
            disabled={selected || isProcessing}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-all mt-auto ${
              selected
                ? 'bg-purple-100 text-purple-600 cursor-default'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            } disabled:opacity-50`}
          >
            {isProcessing ? 'Selecting...' : selected ? 'Currently Selected' : 'Select'}
          </button>
        ) : (
          <button
            onClick={() => handlePurchase(ball)}
            disabled={!canAfford || isProcessing}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-all mt-auto ${
              canAfford
                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {isProcessing ? 'Purchasing...' : canAfford ? 'Purchase' : 'Not enough coins'}
          </button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push('/')}
            className="bg-white/20 backdrop-blur-sm text-white font-medium py-2 px-4 rounded-lg hover:bg-white/30 transition-all"
          >
            ← Back
          </button>
          
          {/* Coin Balance */}
          <div className="bg-white/20 backdrop-blur-sm text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
            <span className="text-yellow-300 text-xl">🪙</span>
            <span>{formatPrice(user.totalCoins)} coins</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
            Ball Shop
          </h1>
          <p className="text-white/80">
            Purchase and select your ball style
          </p>
        </div>

        {/* How to earn coins - moved to top and smaller */}
        <div className="mb-6 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-center">
          <p className="text-xs text-white/90">
            💡 Earn 20 coins for every 50 meters traveled
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-w-md mx-auto">
            <p className="text-sm text-red-600 text-center">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 max-w-md mx-auto">
            <p className="text-sm text-green-600 text-center">{success}</p>
          </div>
        )}

        {/* Ball Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {BALL_TYPES.map(ball => renderBallCard(ball))}
        </div>
      </div>
    </div>
  );
}
