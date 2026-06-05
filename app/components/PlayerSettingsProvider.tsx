'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { PlayerSettings } from '../lib/types';
import {
  decodeSettings,
  withSettingsCode,
  DEFAULT_PLAYER_SETTINGS,
} from '../lib/playerSettings';
import {
  loadPlayerSettingsFromStorage,
  savePlayerSettingsToStorage,
} from '../lib/playerSettingsStorage';
import { getCurrentUser, setCurrentUser, USER_CHANGED_EVENT } from '../lib/auth';
import { getUserData, updateUserPlayerSettings } from '../lib/firestore';

interface PlayerSettingsContextValue {
  settings: PlayerSettings;
  isLoading: boolean;
  updateSettings: (next: PlayerSettings) => Promise<void>;
  applySettingsCode: (code: string) => Promise<PlayerSettings | null>;
}

const PlayerSettingsContext = createContext<PlayerSettingsContextValue | null>(null);

/**
 * Global provider for zoom + menu gradient preferences.
 * Loads localStorage first, then merges Firestore settings when logged in.
 */
export default function PlayerSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<PlayerSettings>(
    withSettingsCode(DEFAULT_PLAYER_SETTINGS)
  );
  const [isLoading, setIsLoading] = useState(true);

  /** Apply settings locally and sync to Firestore when a user is logged in. */
  const persistSettings = useCallback(async (next: PlayerSettings) => {
    const stamped = withSettingsCode(next);
    setSettings(stamped);
    savePlayerSettingsToStorage(stamped);

    const user = getCurrentUser();
    if (!user) return;

    try {
      const updatedUser = await updateUserPlayerSettings(user.username, stamped);
      setCurrentUser(updatedUser);
    } catch (error) {
      console.error('Failed to save player settings to Firestore:', error);
    }
  }, []);

  /** Load settings from local cache, then refresh from the logged-in account. */
  const hydrateSettings = useCallback(async () => {
    const cached = loadPlayerSettingsFromStorage();
    setSettings(cached);

    const user = getCurrentUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Prefer Firestore when the account already has saved preferences.
    if (user.playerSettings) {
      const merged = withSettingsCode(user.playerSettings);
      setSettings(merged);
      savePlayerSettingsToStorage(merged);
      setIsLoading(false);
      return;
    }

    try {
      const fresh = await getUserData(user.username);
      if (fresh?.playerSettings) {
        const merged = withSettingsCode(fresh.playerSettings);
        setSettings(merged);
        savePlayerSettingsToStorage(merged);
        setCurrentUser({ ...user, playerSettings: merged });
      }
    } catch (error) {
      console.error('Failed to load player settings from Firestore:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrateSettings();

    const handleUserChanged = () => {
      hydrateSettings();
    };

    window.addEventListener(USER_CHANGED_EVENT, handleUserChanged);
    return () => window.removeEventListener(USER_CHANGED_EVENT, handleUserChanged);
  }, [hydrateSettings]);

  const updateSettings = useCallback(
    async (next: PlayerSettings) => {
      await persistSettings(next);
    },
    [persistSettings]
  );

  /** Decode a pasted Settings ID and apply zoom + colors immediately. */
  const applySettingsCode = useCallback(
    async (code: string) => {
      const decoded = decodeSettings(code);
      if (!decoded) return null;
      await persistSettings(decoded);
      return decoded;
    },
    [persistSettings]
  );

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      updateSettings,
      applySettingsCode,
    }),
    [settings, isLoading, updateSettings, applySettingsCode]
  );

  return (
    <PlayerSettingsContext.Provider value={value}>
      {children}
    </PlayerSettingsContext.Provider>
  );
}

/** Hook for reading/updating player settings anywhere in the client tree. */
export function usePlayerSettings(): PlayerSettingsContextValue {
  const context = useContext(PlayerSettingsContext);
  if (!context) {
    throw new Error('usePlayerSettings must be used within PlayerSettingsProvider');
  }
  return context;
}
