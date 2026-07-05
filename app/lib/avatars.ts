// Avatar configuration using DiceBear API
// Provides 9 pre-defined character avatars for player selection

/**
 * Avatar option interface
 */
export interface AvatarOption {
  id: number;          // Unique identifier
  seed: string;        // DiceBear seed for consistent avatar generation
  name: string;        // Display name for the avatar
  imageUrl?: string;   // Optional override that bypasses DiceBear (e.g. a local sticker asset)
}

/**
 * Pre-defined avatar options. Most generate via DiceBear from a seed; some
 * use a local sticker image instead.
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
  { id: 10, seed: 'macy', name: 'Macy', imageUrl: '/macy_sticker.png' },
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
  if (avatar?.imageUrl) return avatar.imageUrl;
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

// Re-export display-name helpers; legacy initials helpers live in displayName.ts (MIE-23).
export {
  validateInitials,
  formatInitials,
  formatDisplayName,
  validateDisplayName,
  DISPLAY_NAME_MAX_LENGTH,
} from './displayName';
