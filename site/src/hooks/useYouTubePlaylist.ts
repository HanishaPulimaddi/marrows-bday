import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================================
   YouTube IFrame Player API

   No API key and no backend. The IFrame Player API is a plain script that
   creates a normal <iframe> embed and hands back a JS object to control it -
   quite separate from the YouTube *Data* API, which is the one that needs a key.

   Why the player is built on mount rather than on the first press
   --------------------------------------------------------------
   Phones only allow playback that starts inside a real user gesture, and
   `autoplay` is ignored outright. If the tap handler has to `await` the API
   script and then play from the `onReady` callback, the gesture has long since
   ended by the time playVideo() runs and the browser silently refuses.

   So: the script loads and the player is constructed when the page mounts, with
   the playlist merely cued. `toggle()` is then fully synchronous - the tap
   calls playVideo() directly, still inside the gesture, which is what mobile
   requires.

   The rest:
     - `listType: 'playlist'` hands the queue to YouTube, so it moves between
       tracks by itself and nobody clicks each song.
     - `onStateChange` is the source of truth for the button and the record.
     - `getVideoData()` supplies the current title and artist, no Data API.
     - `onError` skips tracks that are private, removed or un-embeddable.

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

/**
 * YouTube Music's auto-generated artist channels are called "Artist - Topic".
 * Nobody wants to read that on a birthday card.
 */
function tidyArtist(author?: string): string {
  if (!author) return '';
  return author.replace(/\s*[-\u2013\u2014]\s*Topic\s*$/i, '').trim();
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type Track = { title: string; artist: string; id: string };

export function useYouTubePlaylist(playlistId: string) {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /* player callbacks fire outside React's render, so they read refs */
  const skipsRef = useRef(0);
  /** tapped before the player finished loading - play as soon as it is ready */
  const wantsPlayRef = useRef(false);
  /** a setup failure is only worth showing once she actually presses play */
  const setupErrorRef = useRef<string | null>(null);
  /** has anything actually played yet this session */
  const hasPlayedRef = useRef(false);

  /** pull the current track's title and artist straight off the player */
  const readTrack = useCallback(() => {
    const data = playerRef.current?.getVideoData?.();
    if (!data?.title) return;
    setTrack({
      title: data.title,
      artist: tidyArtist(data.author),
      id: data.video_id ?? data.title,
    });
  }, []);

  const onStateChange = useCallback((event: { data: number }) => {
    const player = playerRef.current;

    if (event.data === PLAYING) {
      skipsRef.current = 0;
      hasPlayedRef.current = true;
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

    /* Nothing has played yet and we are already stumbling: this is the playlist
       refusing to start, not one bad track. Say so rather than leaving the
       button looking broken. */
    if (!hasPlayedRef.current && skipsRef.current >= 3) {
      setStatus('error');
      setError(reason);
      return;
    }

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

  /* ---- build the player up front, cued but not playing ---- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const YT = await loadYouTubeAPI();
        if (cancelled || !mountRef.current || playerRef.current) return;

        playerRef.current = new YT.Player(mountRef.current, {
          /* no videoId: `list` queues the whole playlist.
             no autoplay: phones ignore it, and the first play has to come from
             the tap itself. */
          playerVars: {
            listType: 'playlist',
            list: playlistId,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,          // iOS will not play inline without this
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              /* she pressed play while this was still loading */
              if (wantsPlayRef.current) {
                wantsPlayRef.current = false;
                playerRef.current?.playVideo();
              }
            },
            onStateChange,
            onError,
          },
        });
      } catch (err) {
        console.error('[vinyl] could not create the YouTube player:', err);
        /* the page keeps working; only the music is unavailable, and she is
           not told about it until she asks for music */
        setupErrorRef.current =
          err instanceof Error ? err.message : 'the player could not start';
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [playlistId, onStateChange, onError]);

  /* ---- deliberately NOT async: this must stay inside the tap ---- */
  const toggle = useCallback(() => {
    const player = playerRef.current;

    if (!player) {
      if (setupErrorRef.current) {
        setStatus('error');
        setError(setupErrorRef.current);
        return;
      }
      /* still loading - remember the intent and play the moment it is ready */
      wantsPlayRef.current = true;
      setStatus('loading');
      return;
    }

    /* the resulting state comes back through onStateChange rather than being
       assumed here, so the button follows the player */
    if (player.getPlayerState() === PLAYING) {
      player.pauseVideo();
    } else {
      /* show that the press registered - without this, a refusal to start
         looks exactly like a dead button */
      if (status !== 'paused') setStatus('loading');
      player.playVideo();
    }
  }, [status]);

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
