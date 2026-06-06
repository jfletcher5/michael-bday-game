'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { purchaseBall, selectBall, getUserData, subscribeToActiveShopOffers } from '../lib/firestore';
import { BALL_TYPES, getBallTypeById, isBallOwned, formatPrice } from '../lib/ballTypes';
import { getOwnedSeasonBalls } from '../lib/seasons';
import { User, BallType, ShopOffer } from '../lib/types';
import MenuBackground from '../components/MenuBackground';

function formatOfferTimeLeft(endsAtMs: number, now: number): string {
  const diff = Math.max(0, endsAtMs - now);
  const minutes = Math.ceil(diff / (1000 * 60));
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

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
  const [shopOffers, setShopOffers] = useState<ShopOffer[]>([]);
  const [now, setNow] = useState(Date.now());

  // Load user data on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setIsLoading(false);

    // Refresh from Firestore so coins/owned balls are up to date across devices.
    getUserData(currentUser.username).then((fresh) => {
      if (fresh) {
        setUser(fresh);
        setCurrentUser(fresh);
      }
    });
  }, [router]);

  useEffect(() => {
    const unsub = subscribeToActiveShopOffers(setShopOffers);
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  // Handle offer purchase with the sale price while reusing permanent ball ownership.
  const handleOfferPurchase = async (offer: ShopOffer) => {
    if (!user) return;

    const ball = getBallTypeById(offer.itemId);
    if (Date.now() >= offer.endsAtMs) {
      setShopOffers((current) => current.filter((item) => item.id !== offer.id));
      setError('That offer has expired.');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setPurchaseLoading(`offer-${offer.id}`);

    try {
      const updatedUser = await purchaseBall(user.username, ball.id, offer.price);
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      setSuccess(`Successfully purchased ${ball.name} for ${formatPrice(offer.price)} coins!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purchase offer';
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
                width={80}
                height={80}
                className={ball.imageCover ? 'w-full h-full object-cover' : 'w-14 h-14'}
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
            className={`w-full min-h-[44px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-all mt-auto ${
              selected
                ? 'bg-purple-100 text-purple-600 cursor-default'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            } disabled:opacity-50`}
          >
            {isProcessing ? 'Selecting...' : selected ? 'Selected' : 'Select'}
          </button>
        ) : (
          <button
            onClick={() => handlePurchase(ball)}
            disabled={!canAfford || isProcessing}
            className={`w-full min-h-[44px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-all mt-auto ${
              canAfford
                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {isProcessing ? 'Purchasing...' : canAfford ? 'Purchase' : 'Not enough'}
          </button>
        )}
      </div>
    );
  };

  const renderOfferCard = (offer: ShopOffer) => {
    if (!user) return null;

    const ball = getBallTypeById(offer.itemId);
    const owned = isBallOwned(ball.id, user.ownedBalls);
    const selected = user.selectedBall === ball.id;
    const canAfford = user.totalCoins >= offer.price;
    const isExpired = now >= offer.endsAtMs;
    const isProcessing = purchaseLoading === `offer-${offer.id}` || purchaseLoading === ball.id;
    const percentOff = ball.price > offer.price && ball.price > 0
      ? Math.max(1, Math.round(((ball.price - offer.price) / ball.price) * 100))
      : null;

    return (
      <div
        key={offer.id}
        className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-amber-50 via-white to-orange-50 shadow-xl flex flex-col min-h-[260px] ${
          selected ? 'border-purple-500 ring-2 ring-purple-200' : owned ? 'border-green-300' : 'border-amber-300'
        }`}
      >
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 text-white text-center font-black text-lg py-2 tracking-wide">
          {formatOfferTimeLeft(offer.endsAtMs, now)}
        </div>

        <div className="absolute top-10 right-3 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow">
          {percentOff ? `${percentOff}% OFF` : 'SPECIAL OFFER'}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-8 pb-4">
          <div
            className="w-24 h-24 rounded-full shadow-lg flex items-center justify-center overflow-hidden mb-3"
            style={{
              backgroundColor: ball.color,
              border: `4px solid ${ball.strokeColor}`,
            }}
          >
            {ball.imageUrl && (
              <Image
                src={ball.imageUrl}
                alt={ball.name}
                width={96}
                height={96}
                className={ball.imageCover ? 'w-full h-full object-cover' : 'w-16 h-16'}
                style={ball.imageFilter ? { filter: ball.imageFilter } : undefined}
                unoptimized
              />
            )}
          </div>

          <h3 className="text-center font-black text-gray-900 text-lg">{ball.name}</h3>
          {ball.description && (
            <p className="text-center text-xs text-gray-500 mt-1 line-clamp-2">{ball.description}</p>
          )}
        </div>

        <div className="bg-white/80 border-t border-amber-200 p-3">
          {!owned && (
            <div className="text-center mb-2">
              <span className="text-yellow-600 font-black text-lg">{formatPrice(offer.price)} coins</span>
              {percentOff && (
                <span className="ml-2 text-xs text-gray-400 line-through">{formatPrice(ball.price)}</span>
              )}
            </div>
          )}

          {owned ? (
            <button
              onClick={() => handleSelect(ball)}
              disabled={selected || isProcessing}
              className={`w-full min-h-[44px] py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
                selected
                  ? 'bg-purple-100 text-purple-600 cursor-default'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
              } disabled:opacity-50`}
            >
              {isProcessing ? 'Selecting...' : selected ? 'Selected' : 'Owned - Select'}
            </button>
          ) : (
            <button
              onClick={() => handleOfferPurchase(offer)}
              disabled={!canAfford || isProcessing || isExpired}
              className={`w-full min-h-[44px] py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
                canAfford && !isExpired
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              } disabled:opacity-50`}
            >
              {isProcessing ? 'Purchasing...' : isExpired ? 'Expired' : canAfford ? 'Buy Offer' : 'Not enough'}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <MenuBackground className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </MenuBackground>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  // The subscription is realtime, but this render filter removes offers exactly
  // when the local countdown ticks past the end time.
  const visibleOffers = shopOffers.filter((offer) => offer.startAtMs <= now && now < offer.endsAtMs);

  return (
    <MenuBackground className="min-h-screen p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <button
            onClick={() => router.push('/')}
            className="bg-white/20 backdrop-blur-sm text-white font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:bg-white/30 transition-all text-sm"
          >
            &larr; Back
          </button>

          {/* Coin Balance */}
          <div className="bg-white/20 backdrop-blur-sm text-white font-bold min-h-[44px] py-2 px-3 sm:px-4 rounded-lg flex items-center gap-2 text-sm">
            <span className="text-yellow-300 text-lg sm:text-xl">🪙</span>
            <span>{formatPrice(user.totalCoins)} coins</span>
          </div>
        </div>

        {/* Page Title */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 sm:mb-2 drop-shadow-lg">
            Ball Shop
          </h1>
          <p className="text-white/80 text-sm sm:text-base">
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
          {BALL_TYPES.map(ball => renderBallCard(ball))}
          {/* Season-exclusive balls (only shown if owned) */}
          {user && getOwnedSeasonBalls(user.ownedBalls).map(ball => (
            <div key={ball.id} className="relative">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10 whitespace-nowrap">
                SEASON EXCLUSIVE
              </div>
              {renderBallCard(ball)}
            </div>
          ))}
        </div>

        {visibleOffers.length > 0 && (
          <section className="mt-8">
            <div className="text-center mb-4">
              <h2 className="text-2xl sm:text-3xl font-black text-white drop-shadow-lg">
                Shop Offers
              </h2>
              <p className="text-white/80 text-sm">Limited-time restocks picked by admins</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {visibleOffers.map((offer) => renderOfferCard(offer))}
            </div>
          </section>
        )}
      </div>
    </MenuBackground>
  );
}
