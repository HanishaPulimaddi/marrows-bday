import { content } from '../content';
import { Label } from './Label';
import { useReveal, stagger } from '../hooks/useReveal';
import styles from './HeroPoster.module.css';

type HeroPosterProps = {
  /** id of the section to scroll to when the cue is used */
  nextId: string;
};

export function HeroPoster({ nextId }: HeroPosterProps) {
  const ref = useReveal<HTMLElement>();
  const { hero, date } = content;

  const goNext = () => {
    document.getElementById(nextId)?.scrollIntoView({ block: 'start' });
  };

  return (
    <section
      id="hero"
      ref={ref}
      className={`page ${styles.hero}`}
      aria-label="Happy birthday"
    >
      <div className={styles.corners}>
        <Label className={styles.corner} data-reveal style={stagger(0)}>
          {hero.forLabel}
        </Label>
        <Label className={styles.corner} data-reveal style={stagger(1)}>
          {date}
        </Label>
      </div>

      <Label className={styles.side} data-reveal style={stagger(2)}>
        {hero.sideLabel}
      </Label>

      <div className={styles.centre}>
        <h1 className={styles.headline} data-reveal style={stagger(3)}>
          {hero.headline.map(line => (
            <span key={line}>{line}</span>
          ))}
        </h1>

        <div className={styles.lamp} data-reveal style={stagger(4)} aria-hidden="true">
          <div className={styles.lampRule} />
          <div className={styles.lampBox}>
            <div className={styles.bulb} />
          </div>
        </div>
      </div>

      <div className={styles.foot}>
        <p className={styles.oneLiner} data-reveal style={stagger(5)}>
          {hero.oneLiner}
        </p>

        <button
          type="button"
          className={styles.cue}
          onClick={goNext}
          data-reveal
          style={stagger(6)}
        >
          <Label small>{hero.scrollCue}</Label>
          <span aria-hidden="true">⌃</span>
        </button>
      </div>
    </section>
  );
}
