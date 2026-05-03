// Type definitions for the 2D platform scroller game
import type Matter from 'matter-js';

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
  extraBalls: number;    // Count of extra-ball revival items
  seasonData: SeasonData | null; // Current season progress (null if never interacted)
  verified?: boolean;    // True for users granted a verified badge in the leaderboard
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
  imageCover?: boolean;  // If true, the image fills the ball preview (object-cover) instead of sitting inset
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
 * Season progress stored on the user document
 */
export interface SeasonData {
  seasonId: string;          // e.g. "april-2026"
  meters: number;            // meters accumulated this season
  premiumUnlocked: boolean;  // whether player paid for premium track
  claimedFree: number[];     // level indices (0-4) already claimed on free track
  claimedPremium: number[];  // level indices (0-4) already claimed on premium track
}

/**
 * Game state enum for tracking current game status
 */
export type GameState = 'playing' | 'revivePrompt' | 'gameOver' | 'finished';

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
  body: Matter.Body;    // Matter.js body reference
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

/**
 * A single solid arena segment used to build boss platforms with holes.
 */
export interface BossArenaSegment {
  x: number;               // Segment center X
  y: number;               // Segment center Y
  width: number;           // Segment width
  height: number;          // Segment height
  label?: string;          // Optional label for debugging/rendering
}

/**
 * Boss encounter configuration for a specific distance milestone.
 */
export interface BossEncounterConfig {
  id: string;                              // Unique encounter id
  levelMeters: number;                     // Distance where encounter appears
  bossId: string;                          // Boss identifier
  name: string;                            // Boss display name
  hp: number;                              // Max HP for this encounter
  contactDamageAmount: number;             // HP removed each time the player touches the boss
  sizeMultiplier: number;                  // Boss size relative to player ball
  arenaYSpawnOffset: number;               // Spawn offset below screen while scrolling
  arenaSegments: Array<{
    widthRatio: number;                    // Segment width ratio of canvas width
    centerXRatio: number;                  // Segment center ratio of canvas width
  }>;
  jumpForceRange: {
    min: number;                           // Minimum upward jump impulse
    max: number;                           // Maximum upward jump impulse
  };
  jumpCooldownRangeMs: {
    min: number;                           // Minimum jump cooldown
    max: number;                           // Maximum jump cooldown
  };
  contactDamageCooldownMs: number;         // Cooldown between boss HP hits from player contact
  defeatBlinkDurationMs: number;           // Duration of blink animation before despawn
  defeatBlinkIntervalMs: number;           // Blink toggle interval
}

/**
 * Runtime state for the currently active boss.
 */
export interface BossState {
  encounterId: string;       // Encounter id this boss belongs to
  bossId: string;            // Boss id (e.g. gigaball)
  name: string;              // Display name
  hp: number;                // Current HP
  maxHp: number;             // Maximum HP
  isDefeating: boolean;      // True while blink/death animation is running
}

/**
 * Minimal HUD state surfaced to React for boss health meter rendering.
 */
export interface BossHudState {
  visible: boolean;          // Whether the boss HUD should be shown
  name: string;              // Boss display name
  hp: number;                // Current HP
  maxHp: number;             // Max HP
}
