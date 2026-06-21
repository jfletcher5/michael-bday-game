'use client';

import { useEffect } from 'react';
import type { AvatarItem } from '../lib/types';
import { EMOTE_DURATION_MS } from '../lib/avatarItems';

interface EmoteOverlayProps {
  item: AvatarItem | null;
  onDone: () => void;
  /** `menu` = full-screen modal; `hud` = compact corner toast that does not block gameplay input */
  variant?: 'menu' | 'hud';
}

/** Timed emote playback overlay (MIE-17) — does not pause game physics. */
export default function EmoteOverlay({ item, onDone, variant = 'menu' }: EmoteOverlayProps) {
  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(onDone, EMOTE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [item, onDone]);

  if (!item) return null;

  if (variant === 'hud') {
    return (
      <div className="fixed bottom-24 right-3 sm:bottom-28 sm:right-6 z-[60] pointer-events-none">
        <div className="bg-white/95 rounded-xl shadow-lg px-4 py-3 text-center animate-pulse max-w-[140px] border border-purple-200">
          {item.previewImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewImageUrl} alt="" className="w-12 h-12 mx-auto mb-1 object-contain" />
          ) : (
            <div className="text-3xl mb-1">✨</div>
          )}
          <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center animate-pulse max-w-xs mx-4">
        {item.previewImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewImageUrl} alt="" className="w-24 h-24 mx-auto mb-4 object-contain" />
        ) : (
          <div className="text-6xl mb-4">✨</div>
        )}
        <p className="text-xl font-bold text-gray-800">{item.name}</p>
        <p className="text-sm text-gray-500 mt-1">{item.description}</p>
      </div>
    </div>
  );
}
