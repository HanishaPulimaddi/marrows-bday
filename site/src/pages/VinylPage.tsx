import { Label } from '../components/Label';
import { VinylRecord } from '../components/VinylRecord';
import { PlayButton } from '../components/PlayButton';
import { FilmStrip } from '../components/FilmStrip';
import { useYouTubePlaylist } from '../hooks/useYouTubePlaylist';
import { useReveal, stagger } from '../hooks/useReveal';
import { vinylContent } from '../vinylContent';
import { songs } from '../songs';
import styles from './VinylPage.module.css';

/** a few dried stems for the left margin - drawn, so there is no asset to find */
const DriedStems = () => (
  <svg className={styles.stems} viewBox="0 0 120 260" fill="none" aria-hidden="true">
    <g stroke="#C08C7E" strokeWidth="1.6" strokeLinecap="round">
      <path d="M60 258C58 200 54 150 44 96" />
      <path d="M60 258C64 206 72 164 86 118" />
      <path d="M60 258C56 214 44 178 26 142" />
    </g>
    <g fill="#F0A9A5" opacity=".85">
      <ellipse cx="44" cy="92" rx="7" ry="13" transform="rotate(-12 44 92)" />
      <ellipse cx="86" cy="114" rx="6" ry="11" transform="rotate(16 86 114)" />
      <ellipse cx="26" cy="138" rx="5.5" ry="10" transform="rotate(-24 26 138)" />
    </g>
    <g fill="#F6F1E6" opacity=".55">
      <ellipse cx="52" cy="140" rx="4.5" ry="8" transform="rotate(-8 52 140)" />
      <ellipse cx="74" cy="168" rx="4" ry="7.5" transform="rotate(14 74 168)" />
      <ellipse cx="40" cy="188" rx="3.6" ry="7" transform="rotate(-18 40 188)" />
    </g>
    <g stroke="#C08C7E" strokeWidth="1.1" strokeLinecap="round" opacity=".7">
      <path d="M52 148c-8 6-14 14-17 24" />
      <path d="M74 176c8 5 13 13 15 23" />
    </g>
  </svg>
);

export function VinylPage() {
  const ref = useReveal<HTMLElement>();
  const { mountRef, status, error, current, index, toggle, isPlaying } =
    useYouTubePlaylist(songs);

  const c = vinylContent;
  const loading = status === 'loading';

  /* what sits under the record changes with the player's state */
  const renderStatus = () => {
    if (status === 'error') {
      return <p className={styles.error}>{error ? `${error}\n\n${c.errorNote}` : c.errorNote}</p>;
    }
    if (loading) {
      return <Label small className={styles.statusLabel}>{c.status.loading}</Label>;
    }
    if ((status === 'playing' || status === 'paused') && current) {
      return (
        <>
          <Label small className={styles.statusLabel}>
            {status === 'playing' ? c.status.nowPlaying : c.status.paused}
          </Label>
          {/* keyed on the index so each song fades in */}
          <p key={`t-${index}`} className={`${styles.songTitle} ${styles.fade}`}>{current.title}</p>
          <p key={`a-${index}`} className={`${styles.songArtist} ${styles.fade}`}>{current.artist}</p>
        </>
      );
    }
    return (
      <p className={styles.invitation}>
        {c.invitation.map(line => <span key={line}>{line}<br /></span>)}
      </p>
    );
  };

  return (
    <main
      id="vinyl"
      ref={ref}
      className={styles.page}
      aria-label="A playlist for Marion"
    >
      <div className={styles.corners}>
        <Label className={styles.corner} data-reveal style={stagger(0)}>{c.forLabel}</Label>
        <Label className={styles.corner} data-reveal style={stagger(1)}>{c.date}</Label>
      </div>

      <div className={styles.body}>
        <aside className={`${styles.aside} ${styles.left}`}>
          <DriedStems />
          <p className={`${styles.note} ${styles.noteLeft}`} data-reveal style={stagger(2)}>
            {c.notes.left}
          </p>
        </aside>

        <div className={styles.centre}>
          <h1 className={styles.headline} data-reveal style={stagger(1)}>
            {c.headline.map(line => <span key={line}>{line}</span>)}
          </h1>

          <div className={styles.recordSize} data-reveal style={stagger(2)}>
            <VinylRecord media={c.centre} playing={isPlaying} />
          </div>

          <PlayButton playing={isPlaying} loading={loading} onClick={toggle} />

          <div className={styles.status} aria-live="polite">
            {renderStatus()}
          </div>
        </div>

        <aside className={`${styles.aside} ${styles.right}`}>
          <FilmStrip frames={c.filmStrip} />
          <p className={`${styles.note} ${styles.noteRight}`} data-reveal style={stagger(3)}>
            {c.notes.right}
          </p>
        </aside>
      </div>

      <div className={styles.foot}>
        <p className={`${styles.note} ${styles.noteFoot}`}>{c.notes.foot}</p>
      </div>

      {/* The YouTube iframe replaces this div. It has to stay in the layout for
          playback to work, so it is sized small and made fully transparent
          rather than removed or display:none. */}
      <div className={styles.player} aria-hidden="true">
        <div ref={mountRef} />
      </div>
    </main>
  );
}
