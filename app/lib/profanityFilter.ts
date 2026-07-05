// Client-side profanity filter for display names (MIE-23).
// Server-side validation mirrors this list in Cloud Functions.

/** Michael's exact rejection copy for blocked names. */
export const NAME_NOT_USABLE_MESSAGE = 'Name not usable';

/** Common English block list — substring match after lowercasing. */
const BLOCKED_SUBSTRINGS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'damn',
  'cunt',
  'dick',
  'pussy',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
];

/**
 * Returns true when the name contains a blocked substring.
 * Used before create/rename; show NAME_NOT_USABLE_MESSAGE on match.
 */
export function isProfaneDisplayName(name: string): boolean {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  return BLOCKED_SUBSTRINGS.some((word) => lower.includes(word));
}
