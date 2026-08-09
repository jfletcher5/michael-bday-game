/**
 * Game registry for the root picker screen.
 *
 * Every playable game in this app gets one entry here. The picker at `/` renders
 * this list, so adding a game is a single entry plus its route — no picker edits.
 *
 * Games share the player account and economy: one login, one coin/gem balance,
 * one avatar. Per-game separation (leaderboards, stats) is keyed by `id`.
 */

export type GameStatus = 'live' | 'coming-soon';

export interface GameDefinition {
  /** Stable key. Used for per-game leaderboard/stat scoping — never rename. */
  id: string;
  title: string;
  tagline: string;
  /** Menu route for this game (its own main menu, not the play surface). */
  href: string;
  emoji: string;
  /** Tailwind gradient classes for the picker card's banner. */
  gradient: string;
  status: GameStatus;
}

export const GAMES: GameDefinition[] = [
  {
    id: 'platform-drop',
    title: 'Platform Drop',
    tagline: 'Survive the rising platforms!',
    href: '/platform-drop',
    emoji: '🟣',
    gradient: 'from-purple-600 to-pink-600',
    status: 'live',
  },
  {
    id: 'find-the-button',
    title: 'Find the Button',
    tagline: 'First-person block world. Hunt down the button.',
    href: '/find-the-button',
    emoji: '🔴',
    gradient: 'from-sky-600 to-indigo-700',
    status: 'live',
  },
];

/** Route of the default game, used as the post-login landing target. */
export const DEFAULT_GAME_HREF = '/platform-drop';

export function getGameById(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export function getLiveGames(): GameDefinition[] {
  return GAMES.filter((g) => g.status === 'live');
}
