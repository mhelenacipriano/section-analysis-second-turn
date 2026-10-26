import { useCallback, useSyncExternalStore } from 'react';

const subscribe = (cb) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const snapshot = () => window.location.hash || '#/';

export function parseHash(h) {
  const [p, q = ''] = h.replace(/^#/, '').split('?');
  return { path: p || '/', query: Object.fromEntries(new URLSearchParams(q)) };
}
export function buildHash(path, query) {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
  return `#${path}${q ? `?${q}` : ''}`;
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const { path, query } = parseHash(hash);
  const go = useCallback((newPath, newQuery) => {
    const cur = parseHash(window.location.hash || '#/');
    window.location.hash = buildHash(newPath ?? cur.path, newQuery ?? cur.query);
  }, []);
  return { path, query, go };
}
