import type { BallType } from './types';

/**
 * Reward granted at a Pro Pass achievement level.
 */
export interface ProPassReward {
  type: 'coins' | 'extraBall' | 'ball';
  amount?: number;
  ballId?: string;
}

/**
 * A single tier within the Pro Pass (June–September 2026).
 */
export interface ProPassLevel {
  meterThreshold: number;
  freeReward: ProPassReward;
  premiumReward: ProPassReward;
}

/**
 * Full configuration for one Pro Pass season (4-month window).
 */
export interface ProPassConfig {
  id: string;
  displayName: string;
  startAtMs: number;
  endAtMs: number;
  premiumCost: number;
  metersPerTier: number;
  levels: ProPassLevel[];
  featuredBall: BallType; // Shown beside UPGRADE (tier-100 Bane Of Thorns)
  emoji: string;
}

// ---------------------------------------------------------------------------
// Pro Pass premium balls — local SVG art, no external image hosts
// ---------------------------------------------------------------------------

const BANE_OCEANS_BALL: BallType = {
  id: 'pro-bane-oceans-2026',
  name: 'Bane Of Oceans',
  price: 0,
  color: '#1e40af',
  strokeColor: '#1e3a8a',
  isDefault: false,
  imageUrl: '/pro-bane-oceans-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 90 premium reward',
};

const BANE_DEAD_BALL: BallType = {
  id: 'pro-bane-dead-2026',
  name: 'Bane Of Dead',
  price: 0,
  color: '#dc2626',
  strokeColor: '#991b1b',
  isDefault: false,
  imageUrl: '/pro-bane-dead-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 95 premium reward',
};

const BANE_THORNS_BALL: BallType = {
  id: 'pro-bane-thorns-2026',
  name: 'Bane Of Thorns',
  price: 0,
  color: '#16a34a',
  strokeColor: '#14532d',
  isDefault: false,
  imageUrl: '/pro-bane-thorns-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 100 premium reward',
};

export const PRO_PASS_BALLS: BallType[] = [
  BANE_OCEANS_BALL,
  BANE_DEAD_BALL,
  BANE_THORNS_BALL,
];

// Premium ball tiers on the top row only.
const PREMIUM_BALL_TIERS: Record<number, BallType> = {
  90: BANE_OCEANS_BALL,
  95: BANE_DEAD_BALL,
  100: BANE_THORNS_BALL,
};

const TOTAL_TIERS = 100;
const METERS_PER_TIER = 2500;
const COIN_REWARD = 200;
const FREE_REVIVE_EVERY = 6;
const PREMIUM_REVIVE_EVERY = 3;

/** Build 100 tiers mirroring season-pass cadence at 2,500m spacing. */
function buildProPassLevels(): ProPassLevel[] {
  const levels: ProPassLevel[] = [];

  for (let i = 1; i <= TOTAL_TIERS; i++) {
    const freeReward: ProPassReward =
      i % FREE_REVIVE_EVERY === 0
        ? { type: 'extraBall', amount: 1 }
        : { type: 'coins', amount: COIN_REWARD };

    let premiumReward: ProPassReward;
    const ballAtTier = PREMIUM_BALL_TIERS[i];
    if (ballAtTier) {
      premiumReward = { type: 'ball', ballId: ballAtTier.id };
    } else if (i % PREMIUM_REVIVE_EVERY === 0) {
      premiumReward = { type: 'extraBall', amount: 1 };
    } else {
      premiumReward = { type: 'coins', amount: COIN_REWARD };
    }

    levels.push({
      meterThreshold: i * METERS_PER_TIER,
      freeReward,
      premiumReward,
    });
  }

  return levels;
}

// Pass opens UTC midnight on deploy day (June 9, 2026) through end of September 2026.
const PRO_PASS_START_AT_MS = Date.UTC(2026, 5, 9, 0, 0, 0, 0);
const PRO_PASS_END_AT_MS = Date.UTC(2026, 8, 30, 23, 59, 59, 999);

export const PRO_PASS_CONFIG: ProPassConfig = {
  id: 'pro-pass-june-sept-2026',
  displayName: 'Pro Pass — June to September 2026',
  startAtMs: PRO_PASS_START_AT_MS,
  endAtMs: PRO_PASS_END_AT_MS,
  premiumCost: 50_000,
  metersPerTier: METERS_PER_TIER,
  featuredBall: BANE_THORNS_BALL,
  emoji: '⚔️',
  levels: buildProPassLevels(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Active Pro Pass config (only one pass for now). */
export function getProPassConfig(): ProPassConfig {
  return PRO_PASS_CONFIG;
}

export function isProPassStarted(nowMs: number = Date.now()): boolean {
  return nowMs >= PRO_PASS_CONFIG.startAtMs;
}

export function isProPassEnded(nowMs: number = Date.now()): boolean {
  return nowMs > PRO_PASS_CONFIG.endAtMs;
}

/** True while meters accrue and premium can still be purchased. */
export function isProPassActive(nowMs: number = Date.now()): boolean {
  return isProPassStarted(nowMs) && !isProPassEnded(nowMs);
}

/** Countdown until pass end (0 when already ended). */
export function getTimeRemainingForProPass(
  config: ProPassConfig = PRO_PASS_CONFIG,
  nowMs: number = Date.now()
): { days: number; hours: number; minutes: number } {
  const diff = Math.max(0, config.endAtMs - nowMs);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

/** Days until the pass opens (0 if already started). */
export function getDaysUntilProPassStart(nowMs: number = Date.now()): number {
  const msUntil = PRO_PASS_CONFIG.startAtMs - nowMs;
  if (msUntil <= 0) return 0;
  return Math.ceil(msUntil / (1000 * 60 * 60 * 24));
}

export function getProPassBallById(ballId: string): BallType | null {
  return PRO_PASS_BALLS.find((ball) => ball.id === ballId) ?? null;
}

/** Pro Pass balls the player owns (for shop inventory display). */
export function getOwnedProPassBalls(ownedBalls: string[]): BallType[] {
  return PRO_PASS_BALLS.filter((ball) => ownedBalls.includes(ball.id));
}

export function formatProPassReward(reward: ProPassReward): string {
  switch (reward.type) {
    case 'coins':
      return `${reward.amount?.toLocaleString()} coins`;
    case 'extraBall':
      return `${reward.amount ?? 1} extra ball`;
    case 'ball': {
      const ball = reward.ballId ? getProPassBallById(reward.ballId) : null;
      return ball ? ball.name : 'Pro Pass Ball';
    }
  }
}

export function proPassRewardEmoji(reward: ProPassReward): string {
  switch (reward.type) {
    case 'coins':
      return '🪙';
    case 'extraBall':
      return '🔮';
    case 'ball':
      return '⚔️';
  }
}
