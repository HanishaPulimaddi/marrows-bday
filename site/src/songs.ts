/* ============================================================================
   THE PLAYLIST  —  this is the file to edit.

   Paste your YouTube video IDs below. The id is the part after `v=` in a normal
   YouTube URL, or the last part of a youtu.be link:

     https://www.youtube.com/watch?v=dQw4w9WgXcQ   ->  dQw4w9WgXcQ
     https://youtu.be/dQw4w9WgXcQ                  ->  dQw4w9WgXcQ

   No API key is needed. The page uses the free YouTube IFrame Player API, which
   only needs the video id. Songs play in the order listed here.

   A video will silently fail if its owner has disabled embedding - the player
   skips to the next song when that happens, so prefer official uploads or
   videos you have checked play in an embed.
   ============================================================================ */

export type Song = {
  title: string;
  artist: string;
  youtubeId: string;
};

export const songs: Song[] = [
  {
    title: 'Song Name 1',
    artist: 'Artist Name',
    youtubeId: 'VIDEO_ID_1',
  },
  {
    title: 'Song Name 2',
    artist: 'Artist Name',
    youtubeId: 'VIDEO_ID_2',
  },
  {
    title: 'Song Name 3',
    artist: 'Artist Name',
    youtubeId: 'VIDEO_ID_3',
  },
];
