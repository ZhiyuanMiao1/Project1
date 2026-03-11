import React, { useEffect, useRef, useState } from 'react';
import './UnreadBadge.css';

const formatCount = (count) => {
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count > 99) return '99';
  return String(Math.floor(count));
};

function UnreadBadge({ count = 0, className = '', variant = 'default', ariaLabel = '未读消息' }) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  const prevCountRef = useRef(safeCount);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (safeCount <= 0) {
      prevCountRef.current = safeCount;
      setIsAnimating(false);
      return undefined;
    }

    if (prevCountRef.current !== safeCount || prevCountRef.current <= 0) {
      setIsAnimating(true);
      const timer = window.setTimeout(() => setIsAnimating(false), 280);
      prevCountRef.current = safeCount;
      return () => window.clearTimeout(timer);
    }

    prevCountRef.current = safeCount;
    return undefined;
  }, [safeCount]);

  if (safeCount <= 0) return null;

  const classes = [
    'unread-badge',
    variant ? `unread-badge--${variant}` : '',
    isAnimating ? 'is-animating' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-label={`${ariaLabel} ${safeCount} 条`}>
      {formatCount(safeCount)}
    </span>
  );
}

export default UnreadBadge;
