import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../songs';

/* ============================================================================
   YouTube IFrame Player API

   No API key and no backend. The IFrame Player API is a plain script that
   creates a normal <iframe> embed and hands back a JS object to control it -
   quite separate from the YouTube *Data* API, which is the one that needs a key.

   How it hangs together:
     1. The script is injected once and calls a global `onYouTubeIframeAPIReady`.
     2. We build a YT.Player over a mount div, giving it the first video id.
     3. `onStateChange` tells us when a song ENDED, so we load the next id into
        the same player rather than creating a new one per song.
     4. `onError` fires for videos that are private, removed, or that the owner
        has blocked from embedding - we skip past those instead of stalling.

   The iframe still has to exist and be laid out for playback to work, so the
   page keeps it in the DOM, sized small and fully transparent.
   ============================================================================ */

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

/* YT.PlayerState, spelled out so we don't depend on the global for constants */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  destroy(): void;
  loadVideoById(id: string): void;
  getPlayerState(): number;
};

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<NonNullable<Window['YT']>> | null = null;

/** injects the script once; resolves when YT.Player is constructible */
function loadYouTubeAPI(): Promise<NonNullable<Window['YT']>> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('the YouTube player took too long to load')),
      15000
    );

    /* the API only calls one global, so chain any existing handler */
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('the YouTube player loaded but is unusable'));
    };

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      apiPromise = null;   // let a later attempt retry
      reject(new Error('the YouTube player script was blocked or failed to load'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export function useYouTubePlaylist(songs: Song[]) {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /* player callbacks fire outside React's render, so they read refs not state */
  const indexRef = useRef(0);
  const failuresRef = useRef(0);

  const stop = useCallback(() => {
    indexRef.current = 0;
    failuresRef.current = 0;
    setIndex(0);
    setStatus('idle');
    playerRef.current?.stopVideo();
  }, []);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= songs.length) { stop(); return; }
    indexRef.current = next;
    setIndex(next);
    playerRef.current?.loadVideoById(songs[next].youtubeId);
  }, [songs, stop]);

  const onStateChange = useCallback((event: { data: number }) => {
    if (event.data === PLAYING) { failuresRef.current = 0; setStatus('playing'); }
    else if (event.data === PAUSED) setStatus('paused');
    else if (event.data === ENDED) advance();
  }, [advance]);

  const onError = useCallback(() => {
    /* private, removed, or embedding disabled - don't let one bad id stall it */
    failuresRef.current += 1;
    console.warn('[vinyl] song could not be played:', songs[indexRef.current]?.youtubeId);
    if (failuresRef.current >= songs.length) {
      setStatus('error');
      setError('none of these songs could be played');
      return;
    }
    advance();
  }, [advance, songs]);

  const toggle = useCallback(async () => {
    if (!songs.length) return;

    const player = playerRef.current;
    if (player) {
      if (player.getPlayerState() === PLAYING) player.pauseVideo();
      else player.playVideo();
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      const YT = await loadYouTubeAPI();
      if (!mountRef.current) return;

      playerRef.current = new YT.Player(mountRef.current, {
        videoId: songs[indexRef.current].youtubeId,
        playerVars: {
          autoplay: 1,        // allowed: this runs inside the click handler
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
          onStateChange,
          onError,
        },
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'the player could not start');
    }
  }, [songs, onStateChange, onError]);

  useEffect(() => () => { playerRef.current?.destroy(); playerRef.current = null; }, []);

  return {
    /** attach to the (hidden) div the iframe replaces */
    mountRef,
    status,
    error,
    current: songs[index] ?? null,
    index,
    toggle,
    isPlaying: status === 'playing',
  };
}
