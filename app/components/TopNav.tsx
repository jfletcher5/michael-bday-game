'use client';

import { useRouter } from 'next/navigation';
import { User } from '../lib/types';
import { logout } from '../lib/auth';
import { formatPrice } from '../lib/ballTypes';

interface TopNavProps {
  user: User | null;
  onLogout?: () => void;
  showShopButton?: boolean;
  transparent?: boolean;
}

/**
 * Top Navigation Component
 * Displays shop button (left) and user stats with logout (right)
 * Shows login button if user is not logged in
 */
export default function TopNav({
  user,
  onLogout,
  showShopButton = true,
  transparent = false,
}: TopNavProps) {
  const router = useRouter();

  // Handle logout
  const handleLogout = () => {
    logout();
    if (onLogout) {
      onLogout();
    }
    router.push('/');
  };

  // Handle login navigation
  const handleLogin = () => {
    router.push('/login');
  };

  // Handle shop navigation
  const handleShop = () => {
    router.push('/shop');
  };

  const bgClass = transparent
    ? 'bg-black/30 backdrop-blur-sm'
    : 'bg-white shadow-md';
  
  const textClass = transparent ? 'text-white' : 'text-gray-800';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-3">
      <div className="flex justify-between items-center max-w-6xl mx-auto">
        {/* Left Side - Shop Button */}
        <div>
          {showShopButton && (
            <button
              onClick={handleShop}
              className={`${bgClass} ${textClass} font-medium py-2 px-4 rounded-lg hover:scale-105 transition-all flex items-center gap-2`}
            >
              <span className="text-lg">🛒</span>
              <span className="hidden sm:inline">Shop</span>
            </button>
          )}
        </div>

        {/* Right Side - User Stats or Login */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {/* Stats Display */}
              <div className={`${bgClass} ${textClass} py-2 px-3 rounded-lg flex items-center gap-3 text-sm`}>
                {/* Total Meters */}
                <div className="flex items-center gap-1">
                  <span className="text-lg">📏</span>
                  <span className="font-medium">{formatPrice(user.totalMeters)}m</span>
                </div>
                
                {/* Divider */}
                <div className={`w-px h-4 ${transparent ? 'bg-white/30' : 'bg-gray-300'}`} />
                
                {/* Total Coins */}
                <div className="flex items-center gap-1">
                  <span className="text-lg">🪙</span>
                  <span className="font-medium">{formatPrice(user.totalCoins)}</span>
                </div>
              </div>

              {/* Username & Logout */}
              <div className={`${bgClass} ${textClass} py-2 px-3 rounded-lg flex items-center gap-2`}>
                <span className="font-bold">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className={`${transparent ? 'text-red-300 hover:text-red-200' : 'text-red-500 hover:text-red-600'} font-medium text-sm transition-colors`}
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            /* Login Button */
            <button
              onClick={handleLogin}
              className={`${bgClass} ${textClass} font-medium py-2 px-4 rounded-lg hover:scale-105 transition-all`}
            >
              Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
