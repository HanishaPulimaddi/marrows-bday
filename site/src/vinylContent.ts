/* ============================================================================
   Every word and every media path on the vinyl page.

   The songs themselves live in ./songs.ts - that file is separate on purpose,
   so the playlist is easy to find.
   ============================================================================ */

export type VinylMedia = {
  /** put the file in site/public/assets/ and reference it from the site root.
   *  A .mp4 / .webm path renders a muted looping video, anything else an image.
   *  Leave it undefined to keep the labelled placeholder. */
  src?: string;
  alt: string;
};

export const vinylContent = {
  /* ---- the record's centre label ---- */
  centre: {
    /* Photos live in  site/public/images/  and are referenced from the site root.
       Swap in a video any time - a .mp4 / .webm path renders a muted, looping,
       circular clip instead of a still. */
    src: '/images/MainHeroPhoto.jpeg',
    alt: 'Marion',
  } as VinylMedia,

  /* ---- top corners ---- */
  forLabel: 'FOR MARION',
  date: '09.09.2026',

  /* ---- headline ---- */
  headline: ['Tunes that remind', 'us of you'] as readonly string[],

  /* ---- under the record, when nothing is playing ---- */
  invitation: ['PLAY THE SONGS', 'THAT REMIND ME OF YOU'] as readonly string[],

  /* ---- the small status words above the song title ---- */
  status: {
    nowPlaying: 'NOW PLAYING',
    paused: 'PAUSED',
    loading: 'DROPPING THE NEEDLE',
  },

  /* ---- handwritten notes scattered around the page ---- */
  notes: {
    left: 'A playlist\nmade just\nfor you ♡',
    right: 'same songs,\ndifferent feelings,\nalways you',
    foot: 'good music\nbrighter days',
  },

  /* ---- the film strip down the right-hand side ---- */
  filmStrip: [
    { src: '/images/Letter1.jpeg', alt: 'Marion, one' },
    { src: '/images/Reason5.jpeg', alt: 'Marion, two' },
    { src: '/images/Reason6.jpeg', alt: 'Marion, three' },
  ] as VinylMedia[],

  /* ---- shown if every song fails to load ---- */
  errorNote: 'The playlist would not load. Check PLAYLIST_ID in src/songs.ts,\nand that the playlist is public or unlisted.',
};

/** a path ending .mp4 / .webm / .mov is treated as video, anything else image */
export const isVideo = (src?: string) => !!src && /\.(mp4|webm|mov|m4v)$/i.test(src);
