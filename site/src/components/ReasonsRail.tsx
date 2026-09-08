import { useCallback, useEffect, useRef, useState } from 'react';
import { content } from '../content';
import { Label } from './Label';
import { Photo } from './Photo';
import { useReveal, stagger } from '../hooks/useReveal';
import { prefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import styles from './ReasonsRail.module.css';

/** odd cards are tall, even cards short - matches the alternating widths */
const photoHeight = (index: number) => (index % 2 === 0 ? 340 : 284);

export function ReasonsRail() {
  const sectionRef = useReveal<HTMLElement>();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);

  const { reasons } = content;
  const total = reasons.items.length;

  /* ---- which card is at the left edge right now ---- */
  const syncActive = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    const edge = rail.scrollLeft + 40;
    let index = 0;
    cards.forEach((card, i) => {
      if (card.offsetLeft <= edge) index = i;
    });
    setActive(index);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    syncActive();
    rail.addEventListener('scroll', syncActive, { passive: true });
    return () => rail.removeEventListener('scroll', syncActive);
  }, [syncActive]);

  /* ---- click and drag, with a little momentum ---- */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    /* touch already scrolls this natively; only take over for a mouse */
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let glide = 0;
    let moved = false;

    const stopGlide = () => { if (glide) { cancelAnimationFrame(glide); glide = 0; } };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      stopGlide();
      pointerId = e.pointerId;
      startX = lastX = e.clientX;
      startLeft = rail.scrollLeft;
      lastT = performance.now();
      velocity = 0;
      moved = false;
      setDragging(true);
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        rail.setPointerCapture(e.pointerId);
      }
      if (!moved) return;

      rail.scrollLeft = startLeft - dx;

      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
      pointerId = null;
      setDragging(false);

      if (!moved || prefersReducedMotion()) return;

      let v = velocity * 16;
      const step = () => {
        v *= 0.94;
        rail.scrollLeft -= v;
        if (Math.abs(v) > 0.4) glide = requestAnimationFrame(step);
        else glide = 0;
      };
      if (Math.abs(v) > 1) glide = requestAnimationFrame(step);
    };

    /* a drag must not fire the click on the card underneath */
    const onClickCapture = (e: MouseEvent) => {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    };

    rail.addEventListener('pointerdown', onDown);
    rail.addEventListener('pointermove', onMove);
    rail.addEventListener('pointerup', onUp);
    rail.addEventListener('pointercancel', onUp);
    rail.addEventListener('click', onClickCapture, true);

    return () => {
      stopGlide();
      rail.removeEventListener('pointerdown', onDown);
      rail.removeEventListener('pointermove', onMove);
      rail.removeEventListener('pointerup', onUp);
      rail.removeEventListener('pointercancel', onUp);
      rail.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  /* ---- vertical wheel drives the rail, but hands the page back at the ends ---- */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // trackpad swipe: native
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) return;

      const atStart = rail.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = rail.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;   // let the page scroll on to the next section

      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    };

    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, []);

  /* ---- arrow keys ---- */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    let next: number | null = null;

    if (e.key === 'ArrowRight') next = Math.min(active + 1, total - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(active - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = total - 1;
    if (next === null) return;

    e.preventDefault();
    rail.scrollTo({
      left: cards[next].offsetLeft,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const upcoming = reasons.items
    .slice(active + 1)
    .map(r => r.caption.toUpperCase())
    .join(' · ');

  const status =
    `${String(active + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}` +
    (upcoming ? ` · ${upcoming}` : '');

  return (
    <section
      id="reasons"
      ref={sectionRef}
      className={`page ${styles.reasons}`}
      aria-label="Reasons I love you"
    >
      <header className={styles.header}>
        <Label className={styles.eyebrow} data-reveal style={stagger(0)}>
          {reasons.label}
        </Label>
        <h2 className={styles.headline} data-reveal style={stagger(1)}>
          {reasons.headlineLead}
          <em className={styles.accent}>{reasons.headlineAccent}</em>
        </h2>
      </header>

      <div className={styles.railWrap}>
        <div
          ref={railRef}
          className={`${styles.rail} ${dragging ? styles.dragging : ''}`}
          role="group"
          aria-label="Reasons, use the arrow keys or drag to scroll"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {reasons.items.map((reason, i) => (
            <div key={reason.caption} className={styles.card} data-reveal style={stagger(i + 2)}>
              <Photo
                src={reason.src}
                alt={reason.alt}
                caption={reason.caption}
                index={i + 1}
                height={photoHeight(i)}
                frameClassName={styles.photoFrame}
              />
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        <Label small className={styles.status} aria-live="polite">
          {status}
        </Label>
        <Label small className={styles.dragCue}>{reasons.dragCue}</Label>
      </footer>
    </section>
  );
}
