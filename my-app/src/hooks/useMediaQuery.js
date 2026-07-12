import { useEffect, useState } from 'react';

export default function useMediaQuery(query) {
  const getMatches = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', update);
    else mediaQuery.addListener?.(update);
    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', update);
      else mediaQuery.removeListener?.(update);
    };
  }, [query]);

  return matches;
}
