// Type definitions for the 2D platform scroller game

/**
 * Represents a score entry in the leaderboard
 */
export interface Score {
  username: string;      // Player's username
  distance: number;      // Distance survived (primary ranking)
  date: string;          // ISO date string when score was achieved
}

/**
 * Game state enum for tracking current game status
 */
export type GameState = 'playing' | 'gameOver' | 'finished';

/**
 * Game mode - infinite or custom level
 */
export type GameMode = 'infinite' | 'level';

/**
 * Input controls interface for ball movement (left/right and jump)
 */
export interface Controls {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/**
 * Platform interface for 2D platforms
 */
export interface Platform {
  id: string;           // Unique identifier
  x: number;            // X position (left edge)
  y: number;            // Y position (top edge)
  width: number;        // Platform width
  height: number;       // Platform height (typically constant)
  isFinish?: boolean;   // Whether this is a finish platform
}

/**
 * Bomb interface for obstacles on platforms
 */
export interface Bomb {
  id: string;           // Unique identifier
  x: number;            // X position (center)
  y: number;            // Y position (center)
  radius: number;       // Bomb radius
}

/**
 * Custom level interface
 */
export interface Level {
  id: string;           // Unique identifier
  name: string;         // Level name
  platforms: Platform[]; // Array of platforms in the level
  createdDate: string;  // ISO date string
}

/**
 * Difficulty settings for infinite mode
 */
export interface DifficultySettings {
  platformMinWidth: number;
  platformMaxWidth: number;
  platformGapMin: number;
  platformGapMax: number;
  scrollSpeed: number;
}
