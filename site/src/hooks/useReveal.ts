import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './usePrefersReducedMotion';

/**
 * Fade + rise the element in when it first enters view. Children stagger via
 * a `--reveal-delay` custom property set on each child.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = [el, ...Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'))];

    if (prefersReducedMotion()) {
      targets.forEach(t => { t.dataset.revealed = 'true'; });
      return;
    }

    /* threshold 0, and no negative rootMargin: an element sitting at the very
       bottom of a full-height section (the letter's footer rule and link) would
       otherwise never cross a higher threshold, and would stay invisible. */
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = 'true';
          io.unobserve(entry.target);
        }
      },
      { threshold: 0 }
    );

    targets.forEach(t => io.observe(t));
    return () => io.disconnect();
  }, []);

  return ref;
}

/** inline style helper for staggering a list of children by 60ms each */
export const stagger = (index: number, step = 60) =>
  ({ ['--reveal-delay' as string]: `${index * step}ms` }) as React.CSSProperties;
