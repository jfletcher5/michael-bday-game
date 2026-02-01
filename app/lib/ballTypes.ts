// Ball type configurations for the shop and gameplay
// Each ball type has a unique visual style that can be purchased with coins
// Uses Twemoji (Twitter's open-source emoji library) for themed ball images

import { BallType } from './types';

/**
 * Twemoji CDN base URL for SVG images
 * License: CC-BY 4.0 (graphics) and MIT (code)
 * https://github.com/twitter/twemoji
 */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg';

/**
 * Available ball types in the game
 * - 1 default (free) ball
 * - 5 purchasable themed ball types with images
 */
export const BALL_TYPES: BallType[] = [
  {
    id: 'default',
    name: 'Classic Red',
    price: 0,
    color: '#ff6b6b',
    strokeColor: '#cc0000',
    isDefault: true,
    description: 'The classic red ball. Simple but reliable!',
  },
  {
    id: 'angel',
    name: 'Angel Ball',
    price: 1000,
    color: '#f8f9fa',
    strokeColor: '#ffd700',
    isDefault: false,
    imageUrl: `${TWEMOJI_BASE}/1f47c.svg`, // 👼 Baby Angel
    description: 'A heavenly ball with wings and a halo. Pure and graceful!',
  },
  {
    id: 'devil',
    name: 'Devil Ball',
    price: 1000,
    color: '#9c27b0',
    strokeColor: '#6a1b9a',
    isDefault: false,
    imageUrl: `${TWEMOJI_BASE}/1f608.svg`, // 😈 Smiling Face with Horns
    description: 'A mischievous ball with horns. Devilishly fun!',
  },
  {
    id: 'lunar',
    name: 'Lunar Ball',
    price: 2000,
    color: '#000000',
    strokeColor: '#4a148c',
    isDefault: false,
    imageUrl: `${TWEMOJI_BASE}/1f319.svg`, // 🌙 Crescent Moon
    imageFilter: 'brightness(0.5) sepia(1) hue-rotate(250deg) saturate(2)', // Purple tint filter
    description: 'A mystical moon ball. Glows with lunar energy!',
  },
  {
    id: 'solar',
    name: 'Solar Ball',
    price: 3500,
    color: '#ff9800',
    strokeColor: '#f57c00',
    isDefault: false,
    imageUrl: `${TWEMOJI_BASE}/2600.svg`, // ☀️ Sun
    description: 'A blazing sun ball. Radiates fiery power!',
  },
  {
    id: 'marshmallow',
    name: 'Marshmallow Ball',
    price: 1000000,
    color: '#fce4ec',
    strokeColor: '#f8bbd9',
    isDefault: false,
    imageUrl: `${TWEMOJI_BASE}/2601.svg`, // ☁️ Cloud (fluffy like a marshmallow)
    description: 'The legendary marshmallow ball. Soft, sweet, and extremely rare!',
  },
];

/**
 * Get ball type by ID
 * @param ballId - The ball type ID
 * @returns The BallType or the default ball if not found
 */
export function getBallTypeById(ballId: string): BallType {
  return BALL_TYPES.find(b => b.id === ballId) || BALL_TYPES[0];
}

/**
 * Get the default ball type
 * @returns The default BallType
 */
export function getDefaultBallType(): BallType {
  return BALL_TYPES.find(b => b.isDefault) || BALL_TYPES[0];
}

/**
 * Check if a ball type is owned by the user
 * @param ballId - The ball type ID to check
 * @param ownedBalls - Array of owned ball IDs
 * @returns true if owned or if it's the default ball
 */
export function isBallOwned(ballId: string, ownedBalls: string[]): boolean {
  const ballType = getBallTypeById(ballId);
  return ballType.isDefault || ownedBalls.includes(ballId);
}

/**
 * Format price for display (adds commas and handles large numbers)
 * @param price - The price in coins
 * @returns Formatted price string (e.g., "1,000" or "1M")
 */
export function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `${(price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1)}M`;
  }
  return price.toLocaleString();
}
