const toFiniteNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const getVerticalVisibilityRatio = (rect, rootRect) => {
  if (!rect || !rootRect) return 0;

  const top = toFiniteNumber(rect.top);
  const bottom = toFiniteNumber(rect.bottom);
  const height = Math.max(0, toFiniteNumber(rect.height, bottom - top) || (bottom - top));
  if (height <= 0) return 0;

  const rootTop = toFiniteNumber(rootRect.top);
  const rootBottom = toFiniteNumber(rootRect.bottom);
  const visibleHeight = Math.max(0, Math.min(bottom, rootBottom) - Math.max(top, rootTop));
  return Math.max(0, Math.min(1, visibleHeight / height));
};

export const isMessageRectVisible = (rect, rootRect, minimumRatio = 0.55) => {
  if (!rect || !rootRect) return false;

  const fullyInsideRoot = rect.top >= rootRect.top && rect.bottom <= rootRect.bottom;
  if (fullyInsideRoot) return true;

  return getVerticalVisibilityRatio(rect, rootRect) >= minimumRatio;
};
