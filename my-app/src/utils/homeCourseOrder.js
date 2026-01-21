export const HOME_COURSE_ORDER_EVENT = 'homeCourseOrder:changed';

export function normalizeHomeCourseOrderIds(orderIds, defaultIds) {
  const safeDefaultIds = Array.isArray(defaultIds)
    ? defaultIds.filter((id) => typeof id === 'string' && id.trim() !== '')
    : [];

  const defaultSet = new Set(safeDefaultIds);
  const defaultIndex = new Map(safeDefaultIds.map((id, idx) => [id, idx]));
  const legacyIdMap = {
    'operations': 'management',
    'project-management': 'management',
  };
  const mapLegacyId = (raw) => legacyIdMap[raw] || raw;
  const seen = new Set();
  let normalized = [];

  if (Array.isArray(orderIds)) {
    for (const rawId of orderIds) {
      if (typeof rawId !== 'string') continue;
      const id = mapLegacyId(rawId.trim());
      if (!id) continue;
      if (!defaultSet.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
    }
  }

  if (normalized.length === 0) return [...safeDefaultIds];

  // Heuristic: some older clients appended newly added categories to the end.
  // If `others` is no longer the last item and the suffix after it is small and
  // follows default order, treat it as an appended suffix and re-insert by default positions.
  const isIncreasingByDefaultIndex = (ids) => {
    let prev = -1;
    for (const id of ids) {
      const idx = defaultIndex.get(id);
      if (typeof idx !== 'number') return false;
      if (idx <= prev) return false;
      prev = idx;
    }
    return true;
  };
  const idxOthers = normalized.indexOf('others');
  if (normalized.length === safeDefaultIds.length && idxOthers >= 0 && idxOthers < normalized.length - 1) {
    const suffix = normalized.slice(idxOthers + 1);
    const prefix = normalized.slice(0, idxOthers + 1);
    if (suffix.length > 0 && suffix.length <= 12 && isIncreasingByDefaultIndex(prefix) && isIncreasingByDefaultIndex(suffix)) {
      normalized = prefix;
    }
  }

  // Insert missing ids into their default positions (instead of always appending to the end),
  // while preserving the user's relative order for the ids they already had.
  const result = [...normalized];
  const present = new Set(result);
  for (let i = 0; i < safeDefaultIds.length; i += 1) {
    const id = safeDefaultIds[i];
    if (present.has(id)) continue;

    let insertAt = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = safeDefaultIds[j];
      if (!present.has(prev)) continue;
      insertAt = result.indexOf(prev) + 1;
      break;
    }

    result.splice(insertAt, 0, id);
    present.add(id);
  }

  return result;
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
