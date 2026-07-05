'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, setCurrentUser } from '../lib/auth';
import { User, PlayerSettings } from '../lib/types';
import { renameUserViaFunction, getDisplayName } from '../lib/firestore';
import { usePlayerSettings } from '../components/PlayerSettingsProvider';
import MenuBackground from '../components/MenuBackground';
import TopNav from '../components/TopNav';
import { Alert } from '../components/ui';
import {
  ZOOM_MIN,
  ZOOM_MAX,
  normalizeHexColor,
  withSettingsCode,
} from '../lib/playerSettings';
import {
  formatDisplayName,
  validateDisplayName,
  renameCooldownDaysRemaining,
  DISPLAY_NAME_MAX_LENGTH,
  isLegacyInitialsUsername,
} from '../lib/displayName';

/**
 * Settings Page (MIE-4)
 * Lets players customize in-game zoom, menu gradient colors, and share via Settings ID.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { settings, updateSettings, applySettingsCode } = usePlayerSettings();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Local form state mirrors context so sliders/pickers feel responsive.
  const [zoom, setZoom] = useState(settings.zoom);
  const [colors, setColors] = useState<[string, string, string]>(settings.gradientColors);
  const [pasteCode, setPasteCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamePassword, setRenamePassword] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Require login — same gate as Shop.
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setIsLoading(false);
  }, [router]);

  // Keep form in sync when context reloads (e.g. after login or paste).
  useEffect(() => {
    setZoom(settings.zoom);
    setColors(settings.gradientColors);
  }, [settings]);

  /** Persist any change and regenerate the shareable Settings ID. */
  const saveDraft = async (next: PlayerSettings) => {
    setIsSaving(true);
    setApplyError(null);
    try {
      await updateSettings(withSettingsCode(next));
    } finally {
      setIsSaving(false);
    }
  };

  const handleZoomChange = (value: number) => {
    setZoom(value);
    void saveDraft({ zoom: value, gradientColors: colors });
  };

  const handleColorChange = (index: number, value: string) => {
    const nextColors = [...colors] as [string, string, string];
    nextColors[index] = normalizeHexColor(value);
    setColors(nextColors);
    void saveDraft({ zoom, gradientColors: nextColors });
  };

  const handleCopyCode = async () => {
    const code = settings.settingsCode ?? withSettingsCode({ zoom, gradientColors: colors }).settingsCode;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setApplyError('Could not copy to clipboard. Please copy the code manually.');
    }
  };

  const handleApplyCode = async () => {
    setApplyError(null);
    setApplySuccess(null);

    if (!pasteCode.trim()) {
      setApplyError('Paste a Settings ID first.');
      return;
    }

    const applied = await applySettingsCode(pasteCode);
    if (!applied) {
      setApplyError('Invalid Settings ID. Check the code and try again.');
      return;
    }

    setZoom(applied.zoom);
    setColors(applied.gradientColors);
    setPasteCode(applied.settingsCode ?? pasteCode.trim());
    setApplySuccess('Settings applied!');
    setTimeout(() => setApplySuccess(null), 2500);
  };

  const needsLegacyRename =
    !!user &&
    isLegacyInitialsUsername(user.username) &&
    user.isLegacyInitials !== false &&
    user.legacyRenameUsed !== true;

  const renameLockedDays = user ? renameCooldownDaysRemaining(user.lastRenameAtMs) : 0;

  const handleRename = async () => {
    if (!user) return;
    setRenameError(null);
    setRenameSuccess(null);
    const validation = validateDisplayName(newName);
    if (!validation.ok) {
      setRenameError(validation.error);
      return;
    }
    if (!renamePassword) {
      setRenameError('Enter your password to confirm');
      return;
    }
    setIsRenaming(true);
    try {
      const result = await renameUserViaFunction(user.username, renamePassword, validation.formatted);
      const refreshed = { ...user, username: result.username, displayName: result.displayName, legacyRenameUsed: true, isLegacyInitials: false, lastRenameAtMs: Date.now() };
      setUser(refreshed);
      setCurrentUser(refreshed);
      setRenameSuccess('Name updated!');
      setNewName('');
      setRenamePassword('');
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setIsRenaming(false);
    }
  };

  if (isLoading) {
    return (
      <MenuBackground className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </MenuBackground>
    );
  }

  if (!user) return null;

  const displayCode =
    settings.settingsCode ?? withSettingsCode({ zoom, gradientColors: colors }).settingsCode ?? '';

  return (
    <MenuBackground className="min-h-screen flex flex-col items-center justify-center p-4 py-20 sm:py-24">
      <TopNav user={user} showShopButton showSeasonButton transparent />

      <main className="bg-white rounded-3xl shadow-glow ring-1 ring-black/5 p-6 sm:p-8 w-full max-w-md md:max-w-2xl mx-2 sm:mx-4 my-auto animate-page-in">
        <div className="text-center mb-6 sm:mb-7">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 tracking-tight mb-1">⚙️ Settings</h1>
          <p className="text-sm text-gray-600">
            Playing as <span className="font-bold">{getDisplayName(user)}</span>
          </p>
        </div>

        {/* Rename (MIE-23) */}
        <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <p className="text-sm font-medium text-gray-800 mb-1">Rename</p>
          {needsLegacyRename ? (
            <p className="text-xs text-amber-800 mb-3">One-time rename: pick a new name to replace your 3-letter id.</p>
          ) : renameLockedDays > 0 ? (
            <p className="text-xs text-gray-600 mb-3">You can rename again in {renameLockedDays} day(s).</p>
          ) : (
            <p className="text-xs text-gray-600 mb-3">Change your name (once every 30 days).</p>
          )}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(formatDisplayName(e.target.value))}
            placeholder="New name"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={!needsLegacyRename && renameLockedDays > 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 disabled:opacity-50"
          />
          <input
            type="password"
            value={renamePassword}
            onChange={(e) => setRenamePassword(e.target.value)}
            placeholder="Password to confirm"
            disabled={!needsLegacyRename && renameLockedDays > 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={isRenaming || (!needsLegacyRename && renameLockedDays > 0)}
            className="w-full min-h-[44px] py-2 bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isRenaming ? 'Saving...' : 'Rename'}
          </button>
          {renameError && <p className="text-xs text-red-600 mt-2">{renameError}</p>}
          {renameSuccess && <p className="text-xs text-green-700 mt-2">{renameSuccess}</p>}
        </div>

        {/* Live gradient preview strip */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Menu Preview</p>
          <div
            className="h-16 rounded-xl shadow-inner border border-gray-200"
            style={{
              background: `linear-gradient(to bottom right, ${colors[0]}, ${colors[1]}, ${colors[2]})`,
            }}
          />
        </div>

        {/* In-game zoom slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="zoom-slider" className="text-sm font-medium text-gray-700">
              In-Game Zoom
            </label>
            <span className="text-sm font-semibold text-purple-600">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            id="zoom-slider"
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full accent-purple-600"
          />
          <p className="text-xs text-gray-500 mt-1">
            Affects gameplay only (75% = see more, 125% = zoomed in). Menus stay the same size.
          </p>
        </div>

        {/* Three menu gradient color pickers */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['Color 1', 'Color 2', 'Color 3'] as const).map((label, index) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
              <input
                type="color"
                value={colors[index]}
                onChange={(e) => handleColorChange(index, e.target.value)}
                className="w-full h-12 rounded-lg cursor-pointer border border-gray-200"
              />
              <p className="text-xs text-gray-500 mt-1 text-center font-mono">{colors[index]}</p>
            </div>
          ))}
        </div>

        {/* Shareable Settings ID */}
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">Your Settings ID</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={displayCode}
              className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono text-gray-800"
            />
            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[44px] px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Share this code to copy your zoom and colors to another account.
          </p>
        </div>

        {/* Paste Settings ID from another account */}
        <div className="mb-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
          <p className="text-sm font-medium text-gray-700 mb-2">Paste Settings ID</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={pasteCode}
              onChange={(e) => setPasteCode(e.target.value)}
              placeholder="PD-..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={handleApplyCode}
              disabled={isSaving}
              className="min-h-[44px] px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>

        {applyError && <Alert className="mb-4">{applyError}</Alert>}
        {applySuccess && <Alert tone="success" className="mb-4">{applySuccess}</Alert>}

        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full min-h-[52px] py-3 px-6 rounded-xl bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 active:scale-95 transition-all"
        >
          Back to Menu
        </button>
      </main>
    </MenuBackground>
  );
}
