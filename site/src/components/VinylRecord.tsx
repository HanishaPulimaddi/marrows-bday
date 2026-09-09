import { isVideo, type VinylMedia } from '../vinylContent';
import styles from './VinylRecord.module.css';

type VinylRecordProps = {
  media: VinylMedia;
  /** spins the disc while a song is playing */
  playing: boolean;
};

/**
 * The record. The disc layer is the one that rotates; the sheen sits still on
 * top of it so the light source stays fixed, and the centre label and photo are
 * held out of the spin so a face never turns upside down.
 */
export function VinylRecord({ media, playing }: VinylRecordProps) {
  return (
    <div className={styles.record} data-playing={playing}>
      <div className={`${styles.disc} ${playing ? styles.spinning : ''}`} aria-hidden="true" />
      <div className={styles.sheen} aria-hidden="true" />

      <div className={styles.label}>
        <div className={styles.media}>
          {media.src ? (
            isVideo(media.src) ? (
              /* muted + loop + playsInline, and no controls: it is a portrait,
                 not a player */
              <video
                src={media.src}
                poster={undefined}
                muted
                loop
                autoPlay
                playsInline
                aria-label={media.alt}
              />
            ) : (
              <img src={media.src} alt={media.alt} />
            )
          ) : (
            <span className={styles.placeholder} role="img" aria-label={media.alt}>
              <span className={styles.placeholderTag} aria-hidden="true">PHOTO</span>
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
