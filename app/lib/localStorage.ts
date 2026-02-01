import { Score, PlayerIdentity } from './types';

// LocalStorage keys
const PLAYER_IDENTITY_KEY = 'marble_game_player_identity';
const SCORES_KEY = 'marble_game_scores';

// Legacy key for backwards compatibility
const LEGACY_USERNAME_KEY = 'marble_game_username';

/**
 * Get the stored player identity from localStorage
 * @returns The stored PlayerIdentity or null if not found
 */
export function getPlayerIdentity(): PlayerIdentity | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(PLAYER_IDENTITY_KEY);
    if (!stored) return null;
    
    const identity = JSON.parse(stored) as PlayerIdentity;
    // Validate the identity has required fields
    if (typeof identity.avatarId === 'number' && typeof identity.initials === 'string') {
      return identity;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save player identity to localStorage
 * @param identity - The PlayerIdentity to store
 */
export function setPlayerIdentity(identity: PlayerIdentity): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAYER_IDENTITY_KEY, JSON.stringify(identity));
}

/**
 * Get the stored username from localStorage (legacy support)
 * @returns The stored username or empty string if not found
 * @deprecated Use getPlayerIdentity() instead
 */
export function getUsername(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LEGACY_USERNAME_KEY) || '';
}

/**
 * Save username to localStorage (legacy support)
 * @param username - The username to store
 * @deprecated Use setPlayerIdentity() instead
 */
export function setUsername(username: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LEGACY_USERNAME_KEY, username);
}

/**
 * Get all scores from localStorage, sorted by distance (descending)
 * @returns Array of Score objects, limited to top 10
 */
export function getScores(): Score[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const scoresJson = localStorage.getItem(SCORES_KEY);
    if (!scoresJson) return [];
    
    const scores: Score[] = JSON.parse(scoresJson);
    return sortScores(scores).slice(0, 10);
  } catch (error) {
    console.error('Error reading scores from localStorage:', error);
    return [];
  }
}

/**
 * Add a new score to localStorage
 * Automatically sorts and keeps only top 10 scores
 * @param score - The Score object to add
 */
export function addScore(score: Score): void {
  if (typeof window === 'undefined') return;
  
  try {
    const currentScores = getScores();
    const updatedScores = [...currentScores, score];
    const sortedScores = sortScores(updatedScores).slice(0, 10);
    
    localStorage.setItem(SCORES_KEY, JSON.stringify(sortedScores));
  } catch (error) {
    console.error('Error saving score to localStorage:', error);
  }
}

/**
 * Sort scores by distance (descending - higher is better)
 * @param scores - Array of scores to sort
 * @returns Sorted array of scores
 */
function sortScores(scores: Score[]): Score[] {
  return scores.sort((a, b) => b.distance - a.distance);
}
