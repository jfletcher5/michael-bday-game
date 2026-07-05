// Display name validation and normalization (MIE-23 — replaces 3-letter initials).

import { isProfaneDisplayName } from './profanityFilter';

export const DISPLAY_NAME_MAX_LENGTH = 10;
/** One calendar month between renames via Settings. */
export const RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Trim, collapse whitespace, cap length. Preserves user-chosen casing.
 */
export function formatDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/** Case-insensitive uniqueness key stored on user docs. */
export function usernameLowerKey(name: string): string {
  return formatDisplayName(name).toLowerCase();
}

/**
 * Allowed: letters, numbers, spaces, symbols — but not `/` (Firestore doc id).
 */
export function validateDisplayNameFormat(name: string): boolean {
  const formatted = formatDisplayName(name);
  if (formatted.length < 1 || formatted.length > DISPLAY_NAME_MAX_LENGTH) return false;
  if (formatted.includes('/')) return false;
  if (formatted === '.' || formatted === '..') return false;
  return true;
}

/** Legacy accounts created before MIE-23 (exactly 3 uppercase letters). */
export function isLegacyInitialsUsername(username: string): boolean {
  return /^[A-Z]{3}$/.test(username);
}

export type DisplayNameValidationResult =
  | { ok: true; formatted: string }
  | { ok: false; error: string };

/**
 * Full client-side validation for signup/rename forms.
 */
export function validateDisplayName(name: string): DisplayNameValidationResult {
  const formatted = formatDisplayName(name);
  if (!validateDisplayNameFormat(formatted)) {
    return { ok: false, error: `Name must be 1–${DISPLAY_NAME_MAX_LENGTH} characters` };
  }
  if (isProfaneDisplayName(formatted)) {
    return { ok: false, error: 'Name not usable' };
  }
  return { ok: true, formatted };
}

/** Days remaining until the next Settings rename is allowed. */
export function renameCooldownDaysRemaining(lastRenameAtMs: number | undefined): number {
  if (!lastRenameAtMs) return 0;
  const elapsed = Date.now() - lastRenameAtMs;
  if (elapsed >= RENAME_COOLDOWN_MS) return 0;
  return Math.ceil((RENAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
}

// --- Backward compatibility for admin/tests referencing old helpers ---

/** @deprecated Use validateDisplayName — kept for legacy detection only. */
export function validateInitials(initials: string): boolean {
  return /^[A-Z]{3}$/.test(initials);
}

/** @deprecated Use formatDisplayName — kept for legacy migration UI only. */
export function formatInitials(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}
