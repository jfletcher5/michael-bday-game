// Gamepass catalog — permanent gem purchases (MIE-9).

/** Supported one-time gamepass identifiers stored on users/{username}.gamepasses */
export type GamepassId = 'vip' | 'doubleCash';

export interface GamepassDefinition {
  id: GamepassId;
  name: string;
  description: string;
  gemPrice: number;
  /** Local SVG used on the shop card (offline-safe). */
  imageUrl: string;
}

/** VIP ball id — auto-granted when the VIP gamepass is purchased. */
export const VIP_BALL_ID = 'vip';

/**
 * 2x Cash gem price was unspecified in Michael's ticket; Jon moved MIE-9 to
 * In Progress with the documented default of matching VIP tier pricing.
 */
export const GAMEPASSES: GamepassDefinition[] = [
  {
    id: 'vip',
    name: 'VIP',
    description: 'VIP rank on the leaderboard with a yellow border, plus the exclusive VIP ball.',
    gemPrice: 25_000,
    imageUrl: '/vip-ball.svg',
  },
  {
    id: 'doubleCash',
    name: '2x Cash',
    description: 'Doubles in-run coin milestones — earn 40 coins every 50 meters instead of 20.',
    gemPrice: 25_000,
    imageUrl: '/double-cash-gamepass.svg',
  },
];

export function getGamepassById(id: GamepassId): GamepassDefinition {
  const pass = GAMEPASSES.find((item) => item.id === id);
  if (!pass) throw new Error('Unknown gamepass');
  return pass;
}

/** True when the user owns the VIP entitlement (leaderboard styling + VIP ball). */
export function hasVip(user: { gamepasses?: { vip?: boolean } } | null | undefined): boolean {
  return user?.gamepasses?.vip === true;
}

/** True when in-run coin milestones should be doubled (40 coins per 50m). */
export function hasDoubleCash(user: { gamepasses?: { doubleCash?: boolean } } | null | undefined): boolean {
  return user?.gamepasses?.doubleCash === true;
}

/** Format gem counts for shop labels (e.g. 25,000 or 200K). */
export function formatGems(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  }
  return amount.toLocaleString();
}
