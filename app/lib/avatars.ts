// Avatar configuration using DiceBear API
// Provides 9 pre-defined character avatars for player selection

/**
 * Avatar option interface
 */
export interface AvatarOption {
  id: number;        // Unique identifier (1-9)
  seed: string;      // DiceBear seed for consistent avatar generation
  name: string;      // Display name for the avatar
}

/**
 * 9 pre-defined avatar options using kid-friendly seeds
 * These generate consistent, colorful cartoon-style avatars
 */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 1, seed: 'felix', name: 'Felix' },
  { id: 2, seed: 'luna', name: 'Luna' },
  { id: 3, seed: 'milo', name: 'Milo' },
  { id: 4, seed: 'bella', name: 'Bella' },
  { id: 5, seed: 'oscar', name: 'Oscar' },
  { id: 6, seed: 'daisy', name: 'Daisy' },
  { id: 7, seed: 'charlie', name: 'Charlie' },
  { id: 8, seed: 'ruby', name: 'Ruby' },
  { id: 9, seed: 'max', name: 'Max' },
];

/**
 * DiceBear API base URL and style
 * Using "adventurer" style for colorful, kid-friendly cartoon avatars
 */
const DICEBEAR_BASE_URL = 'https://api.dicebear.com/9.x/adventurer/svg';

/**
 * Get the DiceBear avatar URL for a given avatar ID
 * @param avatarId - The avatar ID (1-9)
 * @returns The full URL to the DiceBear avatar SVG
 */
export function getAvatarUrl(avatarId: number): string {
  const avatar = AVATAR_OPTIONS.find(a => a.id === avatarId);
  const seed = avatar?.seed || 'default';
  return `${DICEBEAR_BASE_URL}?seed=${seed}`;
}

/**
 * Get avatar option by ID
 * @param avatarId - The avatar ID (1-9)
 * @returns The AvatarOption or undefined if not found
 */
export function getAvatarById(avatarId: number): AvatarOption | undefined {
  return AVATAR_OPTIONS.find(a => a.id === avatarId);
}

/**
 * Validate initials string
 * Must be exactly 3 uppercase letters (A-Z)
 * @param initials - The initials string to validate
 * @returns true if valid, false otherwise
 */
export function validateInitials(initials: string): boolean {
  return /^[A-Z]{3}$/.test(initials);
}

/**
 * Format initials to uppercase
 * Strips non-letter characters and limits to 3 characters
 * @param input - Raw input string
 * @returns Formatted initials (uppercase, letters only, max 3 chars)
 */
export function formatInitials(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
}
