export const normalizeQuarterHourValue = (rawValue) => {
  const n = typeof rawValue === 'number' ? rawValue : Number.parseFloat(String(rawValue ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 4) / 4;
  if (Math.abs(rounded - n) > 1e-6) return null;
  if (rounded < 0.25 || rounded > 12) return null;
  return Number(rounded.toFixed(2));
};

export const formatQuarterHourValue = (rawValue, fallback = '1') => {
  const normalized = normalizeQuarterHourValue(rawValue);
  if (normalized == null) return fallback;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(2).replace(/\.?0+$/, '');
};
