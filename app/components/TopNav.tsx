'use client';

import { useRouter } from 'next/navigation';
import { User } from '../lib/types';
import { logout } from '../lib/auth';
import { formatPrice } from '../lib/ballTypes';
import { getCurrentSeasonId, getCurrentSeasonConfig } from '../lib/seasons';

interface TopNavProps {
  user: User | null;
  onLogout?: () => void;
  showShopButton?: boolean;
  showSeasonButton?: boolean;
  transparent?: boolean;
}

export default function TopNav({
  user,
  onLogout,
  showShopButton = true,
  showSeasonButton = true,
  transparent = false,
}: TopNavProps) {
  const router = useRouter();

  const handleLogout = () => {
    logout();
    if (onLogout) onLogout();
    router.push('/');
  };

  const handleShop = () => router.push('/shop');
  const handleSeason = () => router.push(`/season/${getCurrentSeasonId()}`);
  const handleAdmin = () => router.push('/admin');
  const seasonConfig = getCurrentSeasonConfig();

  const bgClass = transparent
    ? 'bg-black/30 backdrop-blur-sm'
    : 'bg-white shadow-md';
  const textClass = transparent ? 'text-white' : 'text-gray-800';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-2 sm:p-3">
      <div className="flex justify-between items-center max-w-6xl mx-auto gap-2">
        {/* Left Side - Season & Shop Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {showSeasonButton && seasonConfig && (
            <button
              onClick={handleSeason}
              className={`${bgClass} ${textClass} font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:scale-105 transition-all flex items-center gap-1.5`}
            >
              <span className="text-lg">{seasonConfig.emoji}</span>
              <span className="hidden sm:inline text-sm">Season</span>
            </button>
          )}
          {showShopButton && (
            <button
              onClick={handleShop}
              className={`${bgClass} ${textClass} font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:scale-105 transition-all flex items-center gap-1.5`}
            >
              <span className="text-lg">🛒</span>
              <span className="hidden sm:inline text-sm">Shop</span>
            </button>
          )}
          {user?.isAdmin && (
            <button
              onClick={handleAdmin}
              className={`${bgClass} ${textClass} font-medium min-h-[44px] py-2 px-3 sm:px-4 rounded-lg hover:scale-105 transition-all flex items-center gap-1.5`}
            >
              <span className="text-lg">🛠️</span>
              <span className="hidden sm:inline text-sm">Admin</span>
            </button>
          )}
        </div>

        {/* Right Side - User Stats or Login */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {user ? (
            <>
              {/* Stats Display */}
              <div className={`${bgClass} ${textClass} min-h-[44px] py-2 px-2 sm:px-3 rounded-lg flex items-center gap-2 sm:gap-3 text-xs sm:text-sm`}>
                <div className="flex items-center gap-1">
                  <span className="text-base sm:text-lg">📏</span>
                  <span className="font-medium">{formatPrice(user.totalMeters)}m</span>
                </div>
                <div className={`w-px h-4 ${transparent ? 'bg-white/30' : 'bg-gray-300'} hidden sm:block`} />
                <div className="flex items-center gap-1">
                  <span className="text-base sm:text-lg">🪙</span>
                  <span className="font-medium">{formatPrice(user.totalCoins)}</span>
                </div>
                <div className={`w-px h-4 ${transparent ? 'bg-white/30' : 'bg-gray-300'} hidden sm:block`} />
                <div className="flex items-center gap-1">
                  <span className="text-base sm:text-lg">🔮</span>
                  <span className="font-medium">{user.extraBalls ?? 0}</span>
                </div>
              </div>

              {/* Username & Logout */}
              <div className={`${bgClass} ${textClass} min-h-[44px] py-2 px-2 sm:px-3 rounded-lg flex items-center gap-2`}>
                <span className="font-bold text-xs sm:text-sm">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className={`${transparent ? 'text-red-300 hover:text-red-200' : 'text-red-500 hover:text-red-600'} font-medium text-xs sm:text-sm transition-colors min-h-[44px] flex items-center`}
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className={`${bgClass} ${textClass} font-medium min-h-[44px] py-2 px-4 rounded-lg hover:scale-105 transition-all`}
            >
              Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
