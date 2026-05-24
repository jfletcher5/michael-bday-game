'use client';

import { useEffect, useRef } from 'react';

interface YTPlayer {
  unMute: () => void;
  mute: () => void;
  setVolume: (v: number) => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  destroy?: () => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data?: number;
}

interface YTPlayerOptions {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onStateChange?: (e: YTPlayerEvent) => void;
  };
}

interface YTPlayerCtor {
  new (element: HTMLElement | string, options: YTPlayerOptions): YTPlayer;
}

declare global {
  interface Window {
    YT?: { Player: YTPlayerCtor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface Props {
  videoId: string;
  volume?: number;
  /** When true, keep audio but hide the player visually (Crab Rave). */
  audioOnly?: boolean;
  /** Skip to this timestamp (seconds) on start and when the track loops. */
  startAtSec?: number;
}

/** YouTube player states — YT.PlayerState.PAUSED === 2, ENDED === 0 */
const YT_PAUSED = 2;
const YT_ENDED = 0;

/**
 * Looping YouTube player for event backgrounds or audio-only tracks.
 * Starts muted for autoplay policy, then unmutes once ready. Retries on
 * the next user tap/keypress if the browser blocks the first unmute.
 */
export default function YouTubeBackground({
  videoId,
  volume = 80,
  audioOnly = false,
  startAtSec = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    let disposed = false;
    let removeInteractionRetry: (() => void) | null = null;

    const tryUnmuteAndPlay = (player: YTPlayer) => {
      try {
        if (startAtSec > 0) {
          player.seekTo(startAtSec, true);
        }
        player.unMute();
        player.setVolume(volume);
        player.playVideo();
      } catch (err) {
        console.warn('YouTube unmute/play failed:', err);
      }
    };

    const attachInteractionRetry = (player: YTPlayer) => {
      const retry = () => {
        tryUnmuteAndPlay(player);
        removeInteractionRetry?.();
        removeInteractionRetry = null;
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
      removeInteractionRetry = () => {
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
      };
    };

    const initPlayer = () => {
      if (disposed || !containerRef.current || !window.YT?.Player) return;

      try {
        playerRef.current = new window.YT.Player(containerRef.current, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            loop: 1,
            playlist: videoId,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            ...(startAtSec > 0 ? { start: startAtSec } : {}),
          },
          events: {
            onReady: (e) => {
              tryUnmuteAndPlay(e.target);
              attachInteractionRetry(e.target);
            },
            onStateChange: (e) => {
              if (e.data === YT_ENDED && startAtSec > 0) {
                // Loop from the drop instead of restarting the intro.
                e.target.seekTo(startAtSec, true);
                e.target.playVideo();
                return;
              }
              // Resume if the browser pauses a hidden/off-screen player.
              if (e.data === YT_PAUSED) {
                e.target.playVideo();
              }
            },
          },
        });
      } catch (err) {
        console.warn('YouTube Player init failed:', err);
      }
    };

    const loadApi = () => {
      if (window.YT?.Player) {
        initPlayer();
        return;
      }

      if (!document.getElementById('youtube-iframe-api')) {
        const script = document.createElement('script');
        script.id = 'youtube-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }

      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
    };

    loadApi();

    return () => {
      disposed = true;
      removeInteractionRetry?.();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId, volume, startAtSec]);

  return (
    <div
      className={`absolute inset-0 pointer-events-none ${audioOnly ? 'opacity-0' : ''}`}
      style={{ zIndex: 0, border: 0 }}
      aria-hidden={audioOnly}
    >
      {/* YT IFrame API replaces this div with the iframe — keep full size so audio is not throttled. */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
