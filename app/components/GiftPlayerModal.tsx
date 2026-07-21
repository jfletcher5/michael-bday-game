'use client';

import { useEffect, useMemo, useState } from 'react';
import { searchPlayersByPrefix, giftShopItem, type GiftShopItemRequest } from '../lib/firestore';
import { User } from '../lib/types';
import { formatGems } from '../lib/gamepasses';

export interface GiftPlayerModalProps {
  open: boolean;
  gifter: User;
  giftItem: GiftShopItemRequest;
  onClose: () => void;
  onSuccess: (updatedGifter: User, recipientUsername: string) => void;
}

/**
 * Roblox-style "Select Player" modal for gifting gem-priced shop items (MIE-21).
 * Step 1: search any player by username prefix. Step 2: confirm gem cost.
 */
export default function GiftPlayerModal({
  open,
  gifter,
  giftItem,
  onClose,
  onSuccess,
}: GiftPlayerModalProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const gemBalance = gifter.totalGems ?? 0;
  const canAfford = gemBalance >= giftItem.gemCost;

  // Reset modal state whenever a new gift flow opens.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setResults([]);
    setSelected(null);
    setError(null);
    setSubmitting(false);
  }, [open, giftItem.itemId]);

  // Debounced prefix search — same pattern as friends page (MIE-20 / MIE-36).
  useEffect(() => {
    if (!open || selected) return;
    const term = search.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const matches = await searchPlayersByPrefix(term);
        // Hide the gifter from recipient results.
        setResults(matches.filter((u) => u.username !== gifter.username));
      } catch (err) {
        console.error('Gift player search failed:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [search, open, selected, gifter.username]);

  const headerLabel = useMemo(() => {
    if (selected) return 'Confirm Gift';
    return 'Select Player';
  }, [selected]);

  const handleGift = async () => {
    if (!selected || !canAfford) return;
    setSubmitting(true);
    setError(null);
    try {
      const { gifter: updated, recipientUsername } = await giftShopItem(
        gifter.username,
        selected.username,
        giftItem,
      );
      onSuccess(updated, recipientUsername);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send gift';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-page-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-modal-title"
      >
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-4 py-3 flex items-center justify-between">
          <h2 id="gift-modal-title" className="font-black text-lg">
            🎁 {headerLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-cyan-50 border border-cyan-100 px-3 py-2 text-center text-sm">
            <span className="font-semibold text-gray-800">{giftItem.itemLabel}</span>
            <span className="text-cyan-700 font-bold"> · {formatGems(giftItem.gemCost)} gems</span>
          </div>

          {!selected ? (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for People"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 focus:outline-none"
                autoFocus
              />

              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {searching && (
                  <p className="text-center text-sm text-gray-500 py-6">Searching…</p>
                )}
                {!searching && search.trim().length < 1 && (
                  <p className="text-center text-sm text-gray-400 py-6">Type a username to search</p>
                )}
                {!searching && search.trim().length >= 1 && results.length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-6">No players found</p>
                )}
                {results.map((player) => (
                  <button
                    key={player.username}
                    type="button"
                    onClick={() => setSelected(player)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-cyan-50 transition text-left"
                  >
                    <span className="font-bold text-gray-800">{player.username}</span>
                    <span className="text-cyan-600 font-black text-lg" aria-hidden>
                      →
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Gift <span className="font-bold text-gray-900">{giftItem.itemLabel}</span> to{' '}
                <span className="font-bold text-cyan-700">{selected.username}</span>?
              </p>
              <p className={`text-center text-sm font-semibold ${canAfford ? 'text-cyan-700' : 'text-red-500'}`}>
                Your balance: {formatGems(gemBalance)} gems
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-gray-500 underline w-full text-center"
              >
                ← Pick a different player
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center font-medium">{error}</p>
          )}

          {selected && (
            <button
              type="button"
              onClick={handleGift}
              disabled={!canAfford || submitting}
              className={`w-full min-h-[44px] py-2.5 rounded-xl font-bold text-sm transition ${
                canAfford
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-95'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              } disabled:opacity-60`}
            >
              {submitting ? 'Sending…' : canAfford ? 'Send Gift' : 'Not enough gems'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
