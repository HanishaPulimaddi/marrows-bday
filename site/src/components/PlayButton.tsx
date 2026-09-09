import styles from './PlayButton.module.css';

type PlayButtonProps = {
  playing: boolean;
  loading?: boolean;
  onClick: () => void;
};

const PlayIcon = () => (
  <svg className={`${styles.icon} ${styles.play}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
  </svg>
);

export function PlayButton({ playing, loading = false, onClick }: PlayButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={loading}
      data-playing={playing}
      aria-label={playing ? 'Pause the playlist' : 'Play the playlist'}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}
