import { useEffect, useState } from 'react';

/**
 * A minimal hash router - deliberately not a dependency.
 *
 * Hash routing (`#/vinyl`) rather than history routing (`/vinyl`) because it
 * needs no SPA rewrite rule on the host: the page works from `vite dev`,
 * `vite preview` and any static file server without configuration.
 *
 * Section anchors like `#letter` simply don't match a route, so the deck
 * renders and the browser scrolls to them as normal.
 */
const read = () => {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/';
};

export function useHashRoute(): string {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
