import { useEffect, useRef, useState } from 'react';

// Reveal-on-scroll using IntersectionObserver
export default function useRevealOnScroll(options = {}) {
  const {
    threshold = 0.1,
    root = null,
    rootMargin = '0px',
    once = true,
  } = options;

  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Fallback: 若不支持 IO，直接设为可见
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setVisible(true);
          if (once) observer.unobserve(entry.target);
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, root, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, root, rootMargin, once]);

  return { ref, visible };
}

