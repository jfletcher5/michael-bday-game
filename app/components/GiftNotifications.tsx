'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentUser, setCurrentUser as persistCurrentUser } from '../lib/auth';
import { subscribeToPendingGifts, ackPendingGift } from '../lib/firestore';
import { PendingGift, User } from '../lib/types';
import GiftReceivedModal from './GiftReceivedModal';

/**
 * App-wide gift notification listener — shows popup on login and while online (MIE-21).
 * Queues multiple gifts and dismisses each with ackPendingGift so they are not repeated.
 */
export default function GiftNotifications() {
  const pathname = usePathname();
  const [activeGift, setActiveGift] = useState<PendingGift | null>(null);

  const userRef = useRef<User | null>(null);
  const queueRef = useRef<PendingGift[]>([]);
  const showingRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const username = useRef<string | null>(null);

  const showNext = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    showingRef.current = next.id;
    setActiveGift(next);
  }, []);

  // Hydrate user on route changes (covers login redirect).
  useEffect(() => {
    const u = getCurrentUser();
    userRef.current = u;
    username.current = u?.username ?? null;
    if (u?.pendingGifts) {
      u.pendingGifts.forEach((g) => {
        if (!seenIdsRef.current.has(g.id)) queueRef.current.push(g);
      });
      showNext();
    }
  }, [pathname, showNext]);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) return;
    userRef.current = u;
    username.current = u.username;

    const unsub = subscribeToPendingGifts(u.username, (gifts) => {
      gifts.forEach((gift) => {
        if (seenIdsRef.current.has(gift.id)) return;
        if (showingRef.current === gift.id) return;
        if (queueRef.current.some((q) => q.id === gift.id)) return;
        queueRef.current.push(gift);
      });
      showNext();
    });

    return () => unsub();
  }, [showNext]);

  const handleDismiss = async () => {
    if (!activeGift) return;
    const giftId = activeGift.id;
    seenIdsRef.current.add(giftId);
    setActiveGift(null);
    showingRef.current = null;

    const current = userRef.current;
    if (current) {
      const remaining = (current.pendingGifts ?? []).filter((g) => g.id !== giftId);
      const updated: User = { ...current, pendingGifts: remaining };
      userRef.current = updated;
      persistCurrentUser(updated);
      ackPendingGift(current.username, giftId).catch((err) =>
        console.error('Failed to ack pending gift:', err),
      );
    }

    showNext();
  };

  if (!activeGift) return null;

  return <GiftReceivedModal gift={activeGift} onDismiss={handleDismiss} />;
}
