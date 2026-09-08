import { useState } from 'react';
import { content } from '../content';
import { Label } from './Label';
import { useReveal, stagger } from '../hooks/useReveal';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import styles from './HeroPoster.module.css';

type HeroPosterProps = {
  /** id of the section to scroll to when the cue is used */
  nextId: string;
};

export function HeroPoster({ nextId }: HeroPosterProps) {
  const ref = useReveal<HTMLElement>();
  const reduced = usePrefersReducedMotion();
  const [lit, setLit] = useState(true);
  const { hero, date } = content;

  const goNext = () => {
    document.getElementById(nextId)?.scrollIntoView({ block: 'start' });
  };

  /* The glow leans towards the pointer. Written straight to the custom property
     rather than through state, so moving the mouse doesn't re-render the tree. */
  const trackGlow = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || reduced) return;
    const box = el.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    /* keep it near the middle - this is a lean, not a spotlight */
    el.style.setProperty('--glow-x', `${(50 + (x - 50) * 0.35).toFixed(1)}%`);
  };

  const resetGlow = () => ref.current?.style.setProperty('--glow-x', '50%');

  return (
    <section
      id="hero"
      ref={ref}
      className={`page ${styles.hero}`}
      aria-label="Happy birthday"
      data-lit={lit}
      onPointerMove={trackGlow}
      onPointerLeave={resetGlow}
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

        <button
          type="button"
          className={styles.lamp}
          onClick={() => setLit(on => !on)}
          aria-pressed={lit}
          aria-label={lit ? 'Turn the light off' : 'Turn the light on'}
          data-reveal
          style={stagger(4)}
        >
          <span className={styles.lampRule} />
          <span className={styles.lampBox}>
            <span className={styles.bulb} />
          </span>
        </button>
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
