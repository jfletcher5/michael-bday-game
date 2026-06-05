// localStorage helpers for fast player settings load before Firestore sync.

import { PlayerSettings } from './types';
import { DEFAULT_PLAYER_SETTINGS, withSettingsCode } from './playerSettings';

/** localStorage key for cached zoom + menu gradient preferences. */
export const PLAYER_SETTINGS_STORAGE_KEY = 'platform_drop_player_settings';

/** Read cached settings from localStorage, falling back to defaults. */
export function loadPlayerSettingsFromStorage(): PlayerSettings {
  if (typeof window === 'undefined') {
    return withSettingsCode(DEFAULT_PLAYER_SETTINGS);
  }

  try {
    const raw = localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return withSettingsCode(DEFAULT_PLAYER_SETTINGS);
    }

    const parsed = JSON.parse(raw) as PlayerSettings;
    if (!parsed.gradientColors || parsed.gradientColors.length !== 3) {
      return withSettingsCode(DEFAULT_PLAYER_SETTINGS);
    }

    return withSettingsCode({
      zoom: parsed.zoom ?? DEFAULT_PLAYER_SETTINGS.zoom,
      gradientColors: parsed.gradientColors as [string, string, string],
      settingsCode: parsed.settingsCode,
    });
  } catch {
    return withSettingsCode(DEFAULT_PLAYER_SETTINGS);
  }
}

/** Persist settings to localStorage for instant reload on the next visit. */
export function savePlayerSettingsToStorage(settings: PlayerSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** Remove cached settings (used on logout when we keep device defaults). */
export function clearPlayerSettingsStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PLAYER_SETTINGS_STORAGE_KEY);
}
