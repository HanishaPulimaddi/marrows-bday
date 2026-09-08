import { useEffect, useState } from 'react';
import { content } from '../content';
import { Label } from './Label';
import { Photo } from './Photo';
import { useReveal, stagger } from '../hooks/useReveal';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import styles from './LetterTape.module.css';

/**
 * Types the first paragraph on. The rest of the letter is rendered immediately -
 * nobody should wait on an effect to read the thing they were sent.
 */
function useTypedFirstLine(full: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? '' : full);

  useEffect(() => {
    if (!enabled) { setShown(full); return; }
    setShown('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, 42);
    return () => window.clearInterval(id);
  }, [full, enabled]);

  return shown;
}

export function LetterTape() {
  const ref = useReveal<HTMLElement>();
  const reduced = usePrefersReducedMotion();
  const { letter } = content;

  const [first, ...rest] = letter.paragraphs;
  const typed = useTypedFirstLine(first, !reduced);
  const typing = !reduced && typed.length < first.length;

  return (
    <section
      id="letter"
      ref={ref}
      className={`page ${styles.letter}`}
      aria-label="A letter for you"
    >
      <div className={styles.wall}>
        {letter.photos.map((photo, i) => (
          <Photo
            key={photo.alt}
            src={photo.src}
            alt={photo.alt}
            index={i + 1}
            className={styles.tile}
            frameClassName={styles.tileFrame}
            data-reveal
            style={stagger(i)}
          />
        ))}
      </div>

      <div className={styles.panel}>
        <Label small className={styles.panelLabel} data-reveal style={stagger(0)}>
          {letter.label}
        </Label>

        <div className={styles.rule} data-reveal style={stagger(1)} />

        <div className={styles.body} data-reveal style={stagger(2)} tabIndex={0}>
          <p className={styles.para}>
            {typed}
            {typing ? <span className={styles.caret} aria-hidden="true" /> : null}
          </p>
          {rest.map(paragraph => (
            <p key={paragraph.slice(0, 24)} className={styles.para}>
              {paragraph}
            </p>
          ))}
        </div>

        <div className={styles.footer} data-reveal style={stagger(3)}>
          <span className={styles.footerRule} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
