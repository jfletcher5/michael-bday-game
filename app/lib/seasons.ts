import { BallType } from './types';

/**
 * Reward granted at a season achievement level.
 */
export interface SeasonReward {
  type: 'coins' | 'extraBall' | 'ball';
  amount?: number;   // for coins
  ballId?: string;   // for ball rewards
}

/**
 * A single achievement level within a season.
 */
export interface SeasonLevel {
  meterThreshold: number;
  freeReward: SeasonReward;
  premiumReward: SeasonReward;
}

/**
 * Full configuration for one season (one calendar month).
 */
export interface SeasonConfig {
  id: string;             // e.g. "april-2026"
  displayName: string;    // e.g. "April 2026"
  month: number;          // 1-indexed (4 = April)
  year: number;
  premiumCost: number;    // coins to unlock premium track
  levels: SeasonLevel[];  // exactly 5 levels
  seasonBall: BallType;   // the exclusive ball for this season
  emoji: string;          // decorative emoji for UI
}

// ---------------------------------------------------------------------------
// Season definitions
// ---------------------------------------------------------------------------

const APRIL_2026_BALL: BallType = {
  id: 'april-radioactive-2026',
  name: 'Radioactive',
  price: 0,
  color: '#39FF14',
  strokeColor: '#006400',
  isDefault: false,
  imageUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2622.svg',
  description: 'Season exclusive — April 2026',
};

const MAY_2026_BALL: BallType = {
  id: 'may-pokeball-2026',
  name: 'Pok\u00e9ball',
  price: 0,
  color: '#EE1515',
  strokeColor: '#222222',
  isDefault: false,
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Pok%C3%A9_Ball_icon.svg',
  description: 'Season exclusive — May 2026',
};

const JUNE_2026_BALL: BallType = {
  id: 'june-yinyang-2026',
  name: 'Yin Yang',
  price: 0,
  color: '#FFFFFF',
  strokeColor: '#000000',
  isDefault: false,
  imageUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/262f.svg',
  description: 'Season exclusive — June 2026',
};

const STANDARD_LEVELS = (seasonBall: BallType): SeasonLevel[] => [
  {
    meterThreshold: 1000,
    freeReward: { type: 'coins', amount: 200 },
    premiumReward: { type: 'coins', amount: 500 },
  },
  {
    meterThreshold: 2000,
    freeReward: { type: 'coins', amount: 500 },
    premiumReward: { type: 'extraBall', amount: 1 },
  },
  {
    meterThreshold: 3000,
    freeReward: { type: 'coins', amount: 1000 },
    premiumReward: { type: 'coins', amount: 1000 },
  },
  {
    meterThreshold: 4000,
    freeReward: { type: 'coins', amount: 2000 },
    premiumReward: { type: 'coins', amount: 1500 },
  },
  {
    meterThreshold: 5000,
    freeReward: { type: 'coins', amount: 5000 },
    premiumReward: { type: 'ball', ballId: seasonBall.id },
  },
];

export const SEASON_CONFIGS: SeasonConfig[] = [
  {
    id: 'april-2026',
    displayName: 'April 2026',
    month: 4,
    year: 2026,
    premiumCost: 2500,
    emoji: '☢️',
    seasonBall: APRIL_2026_BALL,
    levels: STANDARD_LEVELS(APRIL_2026_BALL),
  },
  {
    id: 'may-2026',
    displayName: 'May 2026',
    month: 5,
    year: 2026,
    premiumCost: 2500,
    emoji: '🔴',
    seasonBall: MAY_2026_BALL,
    levels: STANDARD_LEVELS(MAY_2026_BALL),
  },
  {
    id: 'june-2026',
    displayName: 'June 2026',
    month: 6,
    year: 2026,
    premiumCost: 2500,
    emoji: '☯️',
    seasonBall: JUNE_2026_BALL,
    levels: STANDARD_LEVELS(JUNE_2026_BALL),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Derive a season id like "april-2026" from the current date. */
export function getCurrentSeasonId(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]}-${now.getFullYear()}`;
}

/** Look up a season config by id. */
export function getSeasonConfig(seasonId: string): SeasonConfig | null {
  return SEASON_CONFIGS.find((s) => s.id === seasonId) ?? null;
}

/** Shorthand: config for the current calendar month. */
export function getCurrentSeasonConfig(): SeasonConfig | null {
  return getSeasonConfig(getCurrentSeasonId());
}

/** Days remaining in the season (including today). */
export function getDaysRemaining(seasonId: string): number {
  const config = getSeasonConfig(seasonId);
  if (!config) return 0;

  const now = new Date();
  // First day of the next month (season end boundary).
  const seasonEnd = new Date(config.year, config.month, 1); // month is 1-indexed, Date uses 0-indexed → this is correct (month 4 → May 1)
  const msPerDay = 1000 * 60 * 60 * 24;
  const remaining = Math.ceil((seasonEnd.getTime() - now.getTime()) / msPerDay);
  return Math.max(0, remaining);
}

/** Detailed time remaining: days, hours, minutes. */
export function getTimeRemaining(seasonId: string): { days: number; hours: number; minutes: number } {
  const config = getSeasonConfig(seasonId);
  if (!config) return { days: 0, hours: 0, minutes: 0 };

  const now = new Date();
  const seasonEnd = new Date(config.year, config.month, 1);
  const diff = Math.max(0, seasonEnd.getTime() - now.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

/** Look up a season ball across all configs by ball id. */
export function getSeasonBallById(ballId: string): BallType | null {
  for (const config of SEASON_CONFIGS) {
    if (config.seasonBall.id === ballId) return config.seasonBall;
  }
  return null;
}

/** Get all season balls owned by a user. */
export function getOwnedSeasonBalls(ownedBalls: string[]): BallType[] {
  const result: BallType[] = [];
  for (const config of SEASON_CONFIGS) {
    if (ownedBalls.includes(config.seasonBall.id)) {
      result.push(config.seasonBall);
    }
  }
  return result;
}

/** Human-readable label for a reward. */
export function formatReward(reward: SeasonReward): string {
  switch (reward.type) {
    case 'coins':
      return `${reward.amount?.toLocaleString()} coins`;
    case 'extraBall':
      return `${reward.amount ?? 1} extra ball`;
    case 'ball': {
      const ball = reward.ballId ? getSeasonBallById(reward.ballId) : null;
      return ball ? ball.name : 'Season Ball';
    }
  }
}

/** Emoji icon for a reward type. */
export function rewardEmoji(reward: SeasonReward): string {
  switch (reward.type) {
    case 'coins': return '🪙';
    case 'extraBall': return '🔮';
    case 'ball': return '☢️';
  }
}
