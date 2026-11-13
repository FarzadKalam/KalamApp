import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const getSnapshot = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
const getServerSnapshot = () => false;
const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

// Responds to preference changes while the page is open, including the controls.
export default function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
