'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentUser, setCurrentUser as persistCurrentUser } from '../lib/auth';
import {
  subscribeToActiveMessages,
  markMessageSeen,
} from '../lib/firestore';
import { BroadcastMessage, User } from '../lib/types';

const TOAST_DURATION_MS = 3000;

/**
 * App-wide overlay that listens to admin broadcasts and surfaces them as a
 * short top-screen toast. Each message is shown at most once per user;
 * dismissal is recorded both in localStorage (for instant reload skip) and
 * Firestore (so the same user is not toasted twice across devices).
 */
export default function GlobalNotifications() {
  const pathname = usePathname();
  const [activeToast, setActiveToast] = useState<BroadcastMessage | null>(null);

  // Refs so the Firestore listener doesn't re-subscribe on every render.
  const userRef = useRef<User | null>(null);
  const queueRef = useRef<BroadcastMessage[]>([]);
  const showingRef = useRef<string | null>(null);
  const username = useRef<string | null>(null);

  // Hydrate the current user whenever route changes (covers login).
  useEffect(() => {
    const u = getCurrentUser();
    userRef.current = u;
    username.current = u?.username ?? null;
  }, [pathname]);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) return;
    userRef.current = u;

    const unsub = subscribeToActiveMessages((msgs) => {
      const current = userRef.current;
      if (!current) return;
      const seen = new Set(current.seenMessageIds ?? []);

      msgs.forEach((m) => {
        if (seen.has(m.id)) return;
        if (showingRef.current === m.id) return;
        if (queueRef.current.some((q) => q.id === m.id)) return;
        queueRef.current.push(m);
      });

      showNext();
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username.current]);

  const showNext = () => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    showingRef.current = next.id;
    setActiveToast(next);

    setTimeout(() => {
      setActiveToast(null);
      showingRef.current = null;

      const current = userRef.current;
      if (current) {
        const updated: User = {
          ...current,
          seenMessageIds: [...(current.seenMessageIds ?? []), next.id],
        };
        userRef.current = updated;
        persistCurrentUser(updated);
        markMessageSeen(current.username, next.id).catch((err) =>
          console.error('Failed to mark message seen:', err),
        );
      }

      showNext();
    }, TOAST_DURATION_MS);
  };

  if (!activeToast) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] p-3 pointer-events-none">
      <div className="max-w-md mx-auto bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3 rounded-xl shadow-2xl text-center font-medium border border-white/20 animate-[slideDown_0.3s_ease-out]">
        📢 {activeToast.text}
      </div>
    </div>
  );
}
