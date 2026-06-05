'use client';

import { usePlayerSettings } from './PlayerSettingsProvider';
import { buildMenuGradient } from '../lib/playerSettings';

interface MenuBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared menu-page wrapper that applies the player's 3-color gradient.
 * Used on home, login, shop, season, and settings screens.
 */
export default function MenuBackground({ children, className = '' }: MenuBackgroundProps) {
  const { settings } = usePlayerSettings();

  return (
    <div
      className={className}
      style={{ background: buildMenuGradient(settings.gradientColors) }}
    >
      {children}
    </div>
  );
}
