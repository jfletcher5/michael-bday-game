// Authentication utilities for user session management
// Uses localStorage to persist user session across page reloads

import { User } from './types';

// LocalStorage key for current user session
const CURRENT_USER_KEY = 'platform_drop_current_user';

/**
 * Get the currently logged in user from localStorage
 * @returns The User object or null if not logged in
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    if (!stored) return null;
    
    const user = JSON.parse(stored) as User;
    // Validate the user has required fields
    if (user.username && typeof user.totalCoins === 'number') {
      return user;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Set the current user in localStorage (login/update)
 * @param user - The User object to store
 */
export function setCurrentUser(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

/**
 * Clear the current user session (logout)
 */
export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * Check if a user is currently logged in
 * @returns true if a user is logged in
 */
export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Update specific fields of the current user
 * Useful for updating stats without re-fetching from Firestore
 * @param updates - Partial user object with fields to update
 */
export function updateCurrentUser(updates: Partial<User>): void {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  
  const updatedUser = { ...currentUser, ...updates };
  setCurrentUser(updatedUser);
}
