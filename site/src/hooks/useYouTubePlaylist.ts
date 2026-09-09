import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================================
   YouTube IFrame Player API

   No API key and no backend. The IFrame Player API is a plain script that
   creates a normal <iframe> embed and hands back a JS object to control it -
   quite separate from the YouTube *Data* API, which is the one that needs a key.

   How it hangs together:
     1. The script is injected once, on the first press, and calls a global
        `onYouTubeIframeAPIReady`.
     2. We build a YT.Player over a mount div with `listType: 'playlist'` and
        the playlist id, so YouTube owns the queue and advances between tracks
        by itself - nobody has to click each song.
     3. `onStateChange` is the source of truth for the button and the record:
        PLAYING / PAUSED / ENDED come from the player, not from the click.
     4. `getVideoData()` gives us the current track's title and author, so the
        "NOW PLAYING" line shows the real song without the Data API.
     5. `onError` fires for tracks that are private, removed, or blocked from
        embedding - we skip past those rather than stalling on them.

   The iframe has to exist and be laid out for playback to work, so the page
   keeps it in the DOM, sized small and fully transparent.
   ============================================================================ */

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';

/* YT.PlayerState, spelled out so we don't depend on the global for constants */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

/** how many unplayable tracks we skip past before giving up on the playlist */
const MAX_SKIPS = 10;

type VideoData = { title?: string; author?: string; video_id?: string };

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  destroy(): void;
  nextVideo(): void;
  getPlayerState(): number;
  getVideoData?(): VideoData;
  getPlaylist?(): string[] | null;
  getPlaylistIndex?(): number;
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

/** the handful of onError codes worth telling someone about */
function describeError(code: number): string {
  switch (code) {
    case 2:   return 'that playlist id looks wrong';
    case 5:   return 'this browser could not play the track';
    case 100: return 'the playlist or track is private or no longer exists';
    case 101:
    case 150: return 'the owner does not allow this to be played outside YouTube';
    default:  return `the player reported error ${code}`;
  }
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type Track = { title: string; artist: string; id: string };

export function useYouTubePlaylist(playlistId: string) {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /* player callbacks fire outside React's render, so they read a ref */
  const skipsRef = useRef(0);

  /** pull the current track's title and artist straight off the player */
  const readTrack = useCallback(() => {
    const data = playerRef.current?.getVideoData?.();
    if (!data?.title) return;
    setTrack({
      title: data.title,
      artist: data.author ?? '',
      id: data.video_id ?? data.title,
    });
  }, []);

  const onStateChange = useCallback((event: { data: number }) => {
    const player = playerRef.current;

    if (event.data === PLAYING) {
      skipsRef.current = 0;
      setStatus('playing');
      readTrack();
      return;
    }

    if (event.data === PAUSED) {
      setStatus('paused');
      return;
    }

    if (event.data === ENDED) {
      /* ENDED fires between tracks as well as at the very end, so only treat it
         as "finished" when there is nothing after the current item */
      const list = player?.getPlaylist?.() ?? null;
      const index = player?.getPlaylistIndex?.() ?? 0;
      const isLast = !list || list.length === 0 || index >= list.length - 1;
      if (isLast) {
        setStatus('idle');
        setTrack(null);
      }
      /* otherwise YouTube advances to the next track on its own */
    }
  }, [readTrack]);

  const onError = useCallback((event: { data: number }) => {
    const reason = describeError(event.data);
    console.warn(`[vinyl] YouTube player error ${event.data}: ${reason}`);

    skipsRef.current += 1;
    if (skipsRef.current > MAX_SKIPS) {
      setStatus('error');
      setError(reason);
      return;
    }

    /* a single unplayable track must not stall the whole playlist */
    try {
      playerRef.current?.nextVideo();
    } catch {
      setStatus('error');
      setError(reason);
    }
  }, []);

  const toggle = useCallback(async () => {
    const player = playerRef.current;

    /* once the player exists, the button just flips it - the resulting state
       comes back through onStateChange rather than being assumed here */
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
        /* no videoId: `list` is what queues the whole playlist */
        playerVars: {
          listType: 'playlist',
          list: playlistId,
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
      /* the page keeps working; only the music is unavailable */
      console.error('[vinyl] could not start the YouTube player:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'the player could not start');
    }
  }, [playlistId, onStateChange, onError]);

  useEffect(() => () => { playerRef.current?.destroy(); playerRef.current = null; }, []);

  return {
    /** attach to the (hidden) div the iframe replaces */
    mountRef,
    status,
    error,
    /** the track YouTube is actually on, read from the player */
    track,
    toggle,
    isPlaying: status === 'playing',
  };
}
