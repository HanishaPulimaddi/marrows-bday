/* ============================================================================
   THE PLAYLIST  —  this is the file to edit.

   The page plays a whole YouTube playlist, so there is one id to keep here
   rather than a list of individual songs. It is the `list=` part of the URL:

     https://music.youtube.com/playlist?list=PLXOsRpt93s7U&si=...
                                             ^^^^^^^^^^^^^

   No API key and no Google Cloud project. This is the free IFrame Player API,
   which only needs the id - quite separate from the YouTube *Data* API.

   Two things the playlist itself has to satisfy, or nothing will play:
     - it must be Public or Unlisted. A Private playlist cannot be embedded.
     - it must be a real playlist you made, not one of YouTube Music's
       generated radio mixes (those have ids beginning RDCLAK / RDAMVM).
   ============================================================================ */

export const PLAYLIST_ID = 'PLXOsRpt93s7U';
