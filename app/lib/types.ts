// Type definitions for the 2D platform scroller game

/**
 * Represents a score entry in the leaderboard
 */
export interface Score {
  avatarId: number;      // Selected avatar (1-9)
  initials: string;      // 3-letter initials (e.g., "ABC")
  distance: number;      // Distance survived (primary ranking)
  date: string;          // ISO date string when score was achieved
}

/**
 * Player identity for localStorage storage
 */
export interface PlayerIdentity {
  avatarId: number;      // Selected avatar (1-9)
  initials: string;      // 3-letter initials (e.g., "ABC")
}

/**
 * User account stored in Firestore
 */
export interface User {
  username: string;      // 3-letter initials (unique identifier)
  password: string;      // User's password
  totalMeters: number;   // Cumulative distance traveled across all games
  totalCoins: number;    // Cumulative coins collected
  ownedBalls: string[];  // Array of owned ball type IDs
  selectedBall: string;  // Currently selected ball type ID
  avatarId: number;      // Selected avatar (1-9)
  createdAt: string;     // ISO date string when account was created
}

/**
 * Ball type configuration for shop and gameplay
 */
export interface BallType {
  id: string;            // Unique identifier for the ball type
  name: string;          // Display name
  price: number;         // Cost in coins (0 for default)
  color: string;         // Primary color (hex)
  strokeColor: string;   // Outline color (hex)
  isDefault: boolean;    // Whether this is the free default ball
  imageUrl?: string;     // Optional image URL for themed balls (Twemoji SVG)
  imageFilter?: string;  // Optional CSS filter to apply to the image (e.g., for color tinting)
  description?: string;  // Optional description for the shop
}

/**
 * Login credentials for authentication
 */
export interface LoginCredentials {
  username: string;      // 3-letter initials
  password: string;      // User's password
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
 * Breakable wall interface for the 300m challenge
 */
export interface BreakableWall {
  body: any;            // Matter.js body reference
  x: number;            // X position (center)
  y: number;            // Y position (center)
  width: number;        // Wall width
  height: number;       // Wall height
  hits: number;         // Number of times the ball has hit it (0-3)
  maxHits: number;      // Maximum hits before breaking (3)
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
