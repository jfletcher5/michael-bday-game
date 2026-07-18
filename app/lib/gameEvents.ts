/**
 * Shared helpers for admin-scheduled game events (Aurora, Fossil, etc.).
 * Extracted so home menu, overlays, and canvases share one live-window check.
 */

import type { GameEvent, GameEventType } from './types';

/** True when an event of the given type is currently inside its active window. */
export function isEventTypeLive(
  events: GameEvent[],
  type: GameEventType,
  nowMs: number = Date.now(),
): boolean {
  return events.some((evt) => {
    if (evt.type !== type) return false;
    const endsAt = evt.startAtMs + evt.durationSec * 1000;
    return nowMs >= evt.startAtMs && nowMs < endsAt;
  });
}

/** True when a Fossil Event is currently live (MIE-31). */
export function isFossilEventActive(
  events: GameEvent[],
  nowMs: number = Date.now(),
): boolean {
  return isEventTypeLive(events, 'fossil', nowMs);
}
