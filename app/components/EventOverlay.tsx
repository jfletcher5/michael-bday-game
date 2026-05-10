'use client';

import { useEffect, useState } from 'react';
import { subscribeToActiveEvents } from '../lib/firestore';
import { GameEvent, GameEventType } from '../lib/types';

const EVENT_META: Record<GameEventType, { label: string; emoji: string }> = {
  'taco-rain': { label: 'Taco Rain', emoji: '🌮' },
  'meteor-shower': { label: 'Meteor Shower', emoji: '☄️' },
};

/**
 * App-wide overlay that surfaces upcoming and active admin-scheduled events.
 * Shows a small floating banner with a live countdown for each event so
 * logged-in players know something cosmetic is about to happen.
 */
export default function EventOverlay() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsub = subscribeToActiveEvents(setEvents);
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="fixed top-16 right-2 sm:top-20 sm:right-4 z-[90] flex flex-col gap-2 pointer-events-none">
      {events.map((e) => {
        const meta = EVENT_META[e.type];
        const endsAt = e.startAtMs + e.durationSec * 1000;
        const isActive = now >= e.startAtMs && now < endsAt;
        const remaining = Math.max(0, Math.ceil((isActive ? endsAt - now : e.startAtMs - now) / 1000));
        const mm = Math.floor(remaining / 60).toString();
        const ss = (remaining % 60).toString().padStart(2, '0');

        return (
          <div
            key={e.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg backdrop-blur-md border text-white text-sm font-medium ${
              isActive
                ? 'bg-green-500/85 border-white/30'
                : 'bg-purple-600/85 border-white/30'
            }`}
          >
            <span className="text-lg">{meta?.emoji ?? '✨'}</span>
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-wider opacity-80">
                {isActive ? 'LIVE' : 'Starts in'}
              </span>
              <span className="font-bold">
                {meta?.label ?? e.type} · {mm}:{ss}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
