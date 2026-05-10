'use client';

import { useEffect, useRef } from 'react';

interface YTPlayerEvent {
  target: {
    unMute: () => void;
    setVolume: (v: number) => void;
    playVideo: () => void;
  };
}

interface YTPlayerCtor {
  new (
    element: HTMLIFrameElement | string,
    options: {
      events: { onReady?: (e: YTPlayerEvent) => void };
    },
  ): { destroy?: () => void };
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
}

/**
 * Looping YouTube video used as a gameplay background. Starts muted to
 * satisfy browser autoplay policies, then asks the IFrame Player API to
 * unmute as soon as the player is ready — by which point the user has
 * already interacted with the page (clicking Start Game) so the unmute
 * gesture-check passes.
 */
export default function YouTubeBackground({ videoId, volume = 60 }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    const initPlayer = () => {
      if (!iframeRef.current || !window.YT?.Player) return;
      try {
        playerRef.current = new window.YT.Player(iframeRef.current, {
          events: {
            onReady: (e) => {
              try {
                e.target.unMute();
                e.target.setVolume(volume);
                e.target.playVideo();
              } catch (err) {
                console.warn('YouTube unmute failed:', err);
              }
            },
          },
        });
      } catch (err) {
        console.warn('YouTube Player init failed:', err);
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('youtube-iframe-api')) {
        const script = document.createElement('script');
        script.id = 'youtube-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        initPlayer();
      };
    }

    return () => {
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId, volume]);

  return (
    <iframe
      ref={iframeRef}
      // enablejsapi=1 is required for the IFrame Player API to control this player.
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`}
      title="Background video"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ border: 0, zIndex: 0 }}
      allow="autoplay; encrypted-media"
    />
  );
}
