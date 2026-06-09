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
 * A single achievement level within the Pro Pass (100 tiers).
 */
export interface ProPassLevel {
  meterThreshold: number;
  freeReward: ProPassReward;
  premiumReward: ProPassReward;
}

/**
 * Full configuration for one Pro Pass season (June → September window).
 */
export interface ProPassConfig {
  id: string;
  displayName: string;
  startAtMs: number;
  endAtMs: number;
  premiumCost: number;
  metersPerTier: number;
  levels: ProPassLevel[];
  emoji: string;
}

// ---------------------------------------------------------------------------
// Pro Pass exclusive balls (top-row rewards at tiers 90 / 95 / 100)
// ---------------------------------------------------------------------------

export const PRO_BANE_OCEANS_BALL: BallType = {
  id: 'pro-bane-oceans-2026',
  name: 'Bane Of Oceans',
  price: 0,
  color: '#1e88e5',
  strokeColor: '#0d47a1',
  isDefault: false,
  imageUrl: '/pro-bane-oceans-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 90',
};

export const PRO_BANE_DEAD_BALL: BallType = {
  id: 'pro-bane-dead-2026',
  name: 'Bane Of Dead',
  price: 0,
  color: '#e53935',
  strokeColor: '#7f0000',
  isDefault: false,
  imageUrl: '/pro-bane-dead-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 95',
};

export const PRO_BANE_THORNS_BALL: BallType = {
  id: 'pro-bane-thorns-2026',
  name: 'Bane Of Thorns',
  price: 0,
  color: '#43a047',
  strokeColor: '#1b5e20',
  isDefault: false,
  imageUrl: '/pro-bane-thorns-ball.svg',
  imageCover: true,
  description: 'Pro Pass exclusive — tier 100',
};

/** All Pro Pass premium balls in tier order. */
export const PRO_PASS_BALLS: BallType[] = [
  PRO_BANE_OCEANS_BALL,
  PRO_BANE_DEAD_BALL,
  PRO_BANE_THORNS_BALL,
];

// Premium ball tiers on the top row (1-indexed tier numbers).
const PREMIUM_BALL_TIERS: Record<number, BallType> = {
  90: PRO_BANE_OCEANS_BALL,
  95: PRO_BANE_DEAD_BALL,
  100: PRO_BANE_THORNS_BALL,
};

const TOTAL_TIERS = 100;
const METERS_PER_TIER = 2500;
const COIN_REWARD = 200;
const FREE_REVIVE_EVERY = 6;
const PREMIUM_REVIVE_EVERY = 3;
const PREMIUM_COST = 50_000;

// Pass opens at deploy-day UTC midnight (June 9, 2026) and ends last moment of September 2026.
const PASS_START_AT_MS = Date.UTC(2026, 5, 9, 0, 0, 0, 0);
const PASS_END_AT_MS = Date.UTC(2026, 8, 30, 23, 59, 59, 999);

/** Build 100-tier reward tables mirroring the monthly season pass cadence. */
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

export const PRO_PASS_CONFIG: ProPassConfig = {
  id: 'pro-pass-june-sept-2026',
  displayName: 'Pro Pass — June to September 2026',
  startAtMs: PASS_START_AT_MS,
  endAtMs: PASS_END_AT_MS,
  premiumCost: PREMIUM_COST,
  metersPerTier: METERS_PER_TIER,
  levels: buildProPassLevels(),
  emoji: '⚔️',
};

/** Active Pro Pass config (single 4-month pass for now). */
export function getProPassConfig(): ProPassConfig {
  return PRO_PASS_CONFIG;
}

/** Whether the pass window is currently open for meter accrual and premium purchase. */
export function isProPassActive(nowMs: number = Date.now()): boolean {
  const config = getProPassConfig();
  return nowMs >= config.startAtMs && nowMs <= config.endAtMs;
}

/** Whether the pass has not started yet. */
export function isProPassUpcoming(nowMs: number = Date.now()): boolean {
  return nowMs < getProPassConfig().startAtMs;
}

/** Whether the pass window has fully ended. */
export function isProPassEnded(nowMs: number = Date.now()): boolean {
  return nowMs > getProPassConfig().endAtMs;
}

/** Countdown until pass end (or zeros when already ended). */
export function getTimeRemainingForProPass(
  config: ProPassConfig = getProPassConfig(),
  nowMs: number = Date.now()
): { days: number; hours: number; minutes: number } {
  const diff = Math.max(0, config.endAtMs - nowMs);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes };
}

/** Look up a Pro Pass ball by id. */
export function getProPassBallById(ballId: string): BallType | null {
  return PRO_PASS_BALLS.find((b) => b.id === ballId) ?? null;
}

/** Get all Pro Pass balls owned by a user. */
export function getOwnedProPassBalls(ownedBalls: string[]): BallType[] {
  return PRO_PASS_BALLS.filter((ball) => ownedBalls.includes(ball.id));
}

/** Human-readable label for a reward. */
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

/** Emoji icon for a reward type. */
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
