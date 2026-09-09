import type { VinylMedia } from '../vinylContent';
import styles from './FilmStrip.module.css';

/** A vertical strip of printed photographs, taped to the page at a slight tilt. */
export function FilmStrip({ frames }: { frames: VinylMedia[] }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.tape} aria-hidden="true" />
      <div className={styles.strip}>
        {frames.map((frame, i) => (
          <div key={frame.alt} className={styles.cell}>
            {frame.src ? (
              <img src={frame.src} alt={frame.alt} loading="lazy" />
            ) : (
              <span className={styles.placeholder} role="img" aria-label={frame.alt}>
                {String(i + 1).padStart(2, '0')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
