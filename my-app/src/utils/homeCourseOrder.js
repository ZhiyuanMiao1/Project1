export const HOME_COURSE_ORDER_EVENT = 'homeCourseOrder:changed';

export function normalizeHomeCourseOrderIds(orderIds, defaultIds) {
  const safeDefaultIds = Array.isArray(defaultIds)
    ? defaultIds.filter((id) => typeof id === 'string' && id.trim() !== '')
    : [];

  const defaultSet = new Set(safeDefaultIds);
  const seen = new Set();
  const normalized = [];

  if (Array.isArray(orderIds)) {
    for (const rawId of orderIds) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!id) continue;
      if (!defaultSet.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
    }
  }

  for (const id of safeDefaultIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

export function broadcastHomeCourseOrderChanged({ email, orderIds }) {
  try {
    window.dispatchEvent(
      new CustomEvent(HOME_COURSE_ORDER_EVENT, {
        detail: { email, orderIds },
      })
    );
  } catch {}
}
