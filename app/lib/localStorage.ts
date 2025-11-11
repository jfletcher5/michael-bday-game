import { Score } from './types';

// LocalStorage keys
const USERNAME_KEY = 'marble_game_username';
const SCORES_KEY = 'marble_game_scores';

/**
 * Get the stored username from localStorage
 * @returns The stored username or empty string if not found
 */
export function getUsername(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(USERNAME_KEY) || '';
}

/**
 * Save username to localStorage
 * @param username - The username to store
 */
export function setUsername(username: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERNAME_KEY, username);
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
