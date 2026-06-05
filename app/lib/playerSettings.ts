// Encode/decode shareable Settings IDs and validate player preference values.
// Settings IDs use the format PD-<base64url> so zoom + gradient colors can be pasted across accounts.

import { PlayerSettings } from './types';

/** Zoom bounds for in-game camera scale (1.0 = normal). */
export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 1.25;

/** Prefix shown before the encoded payload in a shareable Settings ID. */
export const SETTINGS_CODE_PREFIX = 'PD-';

/** Default menu gradient + zoom matching the original Tailwind blue/purple/pink look. */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  zoom: 1,
  gradientColors: ['#3b82f6', '#a855f7', '#ec4899'],
};

/** Compact JSON shape stored inside the Settings ID. */
interface SettingsPayload {
  z: number;
  c: [string, string, string];
}

/** Clamp zoom to the allowed slider range. */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Normalize a hex color to lowercase #RRGGBB for storage and display. */
export function normalizeHexColor(color: string): string {
  const raw = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return '#000000';
  }
  return `#${raw.toLowerCase()}`;
}

/** Build a CSS linear-gradient string from the three menu colors. */
export function buildMenuGradient(colors: [string, string, string]): string {
  const [c1, c2, c3] = colors.map(normalizeHexColor);
  return `linear-gradient(to bottom right, ${c1}, ${c2}, ${c3})`;
}

/** Attach a freshly generated Settings ID to a settings object. */
export function withSettingsCode(settings: PlayerSettings): PlayerSettings {
  return {
    ...settings,
    zoom: clampZoom(settings.zoom),
    gradientColors: settings.gradientColors.map(
      (c) => normalizeHexColor(c)
    ) as [string, string, string],
    settingsCode: encodeSettings(settings),
  };
}

/**
 * Encode zoom + gradient colors into a shareable Settings ID.
 * Uses compact JSON → base64url so the code is reversible.
 */
export function encodeSettings(settings: PlayerSettings): string {
  const payload: SettingsPayload = {
    z: clampZoom(settings.zoom),
    c: settings.gradientColors.map((c) =>
      normalizeHexColor(c).slice(1)
    ) as [string, string, string],
  };
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  return `${SETTINGS_CODE_PREFIX}${encoded}`;
}

/**
 * Decode a pasted Settings ID back into player settings.
 * Returns null when the code is missing, malformed, or out of range.
 */
export function decodeSettings(code: string): PlayerSettings | null {
  const trimmed = code.trim();
  if (!trimmed.toUpperCase().startsWith(SETTINGS_CODE_PREFIX)) {
    return null;
  }

  const payloadPart = trimmed.slice(SETTINGS_CODE_PREFIX.length);
  if (!payloadPart) return null;

  try {
    const json = base64UrlDecode(payloadPart);
    const payload = JSON.parse(json) as SettingsPayload;
    if (!isValidPayload(payload)) return null;

    const decoded: PlayerSettings = {
      zoom: clampZoom(payload.z),
      gradientColors: payload.c.map((hex) => normalizeHexColor(`#${hex}`)) as [
        string,
        string,
        string,
      ],
    };
    return withSettingsCode(decoded);
  } catch {
    return null;
  }
}

/** Validate decoded payload fields before applying to the UI. */
function isValidPayload(payload: SettingsPayload): boolean {
  if (typeof payload.z !== 'number' || Number.isNaN(payload.z)) return false;
  if (payload.z < ZOOM_MIN || payload.z > ZOOM_MAX) return false;
  if (!Array.isArray(payload.c) || payload.c.length !== 3) return false;
  return payload.c.every((hex) => /^[0-9a-fA-F]{6}$/.test(hex));
}

/** UTF-8 safe base64url encode for browser + Node. */
function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/** UTF-8 safe base64url decode for browser + Node. */
function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
