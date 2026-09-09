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
    /* PUT THE PHOTO HERE.  Drop the file into  site/public/assets/  then set:
         src: '/assets/marion.jpg'      (a photo)
         src: '/assets/marion.mp4'      (a muted, looping video)
       Left undefined so the placeholder shows until you add it. */
    src: undefined,
    alt: 'Marion',
  } as VinylMedia,

  /* ---- top corners ---- */
  forLabel: 'FOR MARION',
  date: '09.09.2026',

  /* ---- headline ---- */
  headline: ['Happy', 'Birthday'] as readonly string[],

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
    { alt: 'Marion, one' },
    { alt: 'Marion, two' },
    { alt: 'Marion, three' },
  ] as VinylMedia[],

  /* ---- shown if every song fails to load ---- */
  errorNote: 'The songs would not load. Check the video ids in src/songs.ts,\nand that each video allows embedding.',
};

/** a path ending .mp4 / .webm / .mov is treated as video, anything else image */
export const isVideo = (src?: string) => !!src && /\.(mp4|webm|mov|m4v)$/i.test(src);
