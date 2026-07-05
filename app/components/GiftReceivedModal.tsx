'use client';

import { PendingGift } from '../lib/types';

export interface GiftReceivedModalProps {
  gift: PendingGift;
  onDismiss: () => void;
}

/**
 * Recipient popup — Michael's format: "{Gifter} gifted you {Item}!" (MIE-21).
 */
export default function GiftReceivedModal({ gift, onDismiss }: GiftReceivedModalProps) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border-2 border-cyan-200 overflow-hidden animate-page-in text-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-6">
          <div className="text-4xl mb-2" aria-hidden>
            🎁
          </div>
          <p className="text-lg font-black leading-snug">
            {gift.fromUsername} gifted you {gift.itemLabel}!
          </p>
        </div>
        <div className="p-4">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-95 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
