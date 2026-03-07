const normalizeBlockArray = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const normalized = blocks
    .map((block) => ({
      start: Number(block?.start),
      end: Number(block?.end),
    }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end))
    .map((block) => ({
      start: Math.max(0, Math.min(95, Math.floor(Math.min(block.start, block.end)))),
      end: Math.max(0, Math.min(95, Math.floor(Math.max(block.start, block.end)))),
    }))
    .sort((a, b) => a.start - b.start);

  if (normalized.length === 0) return [];

  const merged = [normalized[0]];
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = merged[merged.length - 1];
    const current = normalized[index];
    if (current.start <= previous.end + 1) previous.end = Math.max(previous.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
};

const normalizeMinuteSlots = (slots) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  return slots
    .map((slot) => ({
      startMinutes: Number(slot?.startMinutes),
      endMinutes: Number(slot?.endMinutes),
    }))
    .filter((slot) => Number.isFinite(slot.startMinutes) && Number.isFinite(slot.endMinutes))
    .map((slot) => ({
      startMinutes: Math.max(0, Math.min(24 * 60, Math.min(slot.startMinutes, slot.endMinutes))),
      endMinutes: Math.max(0, Math.min(24 * 60, Math.max(slot.startMinutes, slot.endMinutes))),
    }))
    .filter((slot) => slot.endMinutes > slot.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
};

export const normalizeBlockMap = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const blocks = normalizeBlockArray(value);
    if (blocks.length > 0) out[key] = blocks;
  }
  return out;
};

export const mergeAvailabilityBlocks = normalizeBlockArray;

export const subtractAvailabilityBlocks = (baseBlocks, removeBlocks) => {
  const base = normalizeBlockArray(baseBlocks);
  const remove = normalizeBlockArray(removeBlocks);
  if (base.length === 0) return [];
  if (remove.length === 0) return base;

  const out = [];
  let removeIndex = 0;
  for (const segment of base) {
    let cursor = segment.start;
    const segmentEnd = segment.end;

    while (removeIndex < remove.length && remove[removeIndex].end < cursor) removeIndex += 1;

    let scanIndex = removeIndex;
    while (scanIndex < remove.length && remove[scanIndex].start <= segmentEnd) {
      const current = remove[scanIndex];
      if (current.start > cursor) {
        out.push({ start: cursor, end: Math.min(segmentEnd, current.start - 1) });
      }
      cursor = Math.max(cursor, current.end + 1);
      if (cursor > segmentEnd) break;
      scanIndex += 1;
    }

    if (cursor <= segmentEnd) out.push({ start: cursor, end: segmentEnd });
  }

  return normalizeBlockArray(out);
};

export const buildAvailabilityDaySet = (daySelections) => {
  const normalized = normalizeBlockMap(daySelections);
  const out = new Set();
  for (const [key, blocks] of Object.entries(normalized)) {
    if (blocks.length > 0) out.add(key);
  }
  return out;
};

export const intersectMinuteSlots = (slotsA = [], slotsB = []) => {
  const left = normalizeMinuteSlots(slotsA);
  const right = normalizeMinuteSlots(slotsB);
  if (left.length === 0 || right.length === 0) return [];

  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].startMinutes, right[j].startMinutes);
    const end = Math.min(left[i].endMinutes, right[j].endMinutes);
    if (end > start) out.push({ startMinutes: start, endMinutes: end });
    if (left[i].endMinutes < right[j].endMinutes) i += 1;
    else j += 1;
  }
  return normalizeMinuteSlots(out);
};

export const findMinuteSlotContainingPoint = (slots = [], pointMinutes) => {
  const normalizedSlots = normalizeMinuteSlots(slots);
  const point = Number(pointMinutes);
  if (!Number.isFinite(point)) return null;
  return normalizedSlots.find((slot) => point >= slot.startMinutes && point < slot.endMinutes) || null;
};

export const findMinuteSlotContainingRange = (slots = [], range) => {
  const normalizedSlots = normalizeMinuteSlots(slots);
  const startMinutes = Number(range?.startMinutes);
  const endMinutes = Number(range?.endMinutes);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null;
  return normalizedSlots.find(
    (slot) => startMinutes >= slot.startMinutes && endMinutes <= slot.endMinutes
  ) || null;
};

export const selectionFitsWithinSlots = (selection, slots = []) => {
  return Boolean(findMinuteSlotContainingRange(slots, selection));
};

export const buildSelectionFromPoint = (slots = [], pointMinutes, preferredDuration = 60, minDuration = 15) => {
  const point = Number(pointMinutes);
  const targetDuration = Number.isFinite(preferredDuration) ? Math.max(minDuration, preferredDuration) : 60;
  const slot = findMinuteSlotContainingPoint(slots, point);
  if (!slot) return null;

  const availableDuration = slot.endMinutes - slot.startMinutes;
  if (availableDuration < minDuration) return null;

  const clippedDuration = Math.min(targetDuration, availableDuration);
  const latestStart = slot.endMinutes - clippedDuration;
  const startMinutes = Math.max(slot.startMinutes, Math.min(latestStart, point));
  const endMinutes = Math.min(slot.endMinutes, startMinutes + clippedDuration);
  if (endMinutes - startMinutes < minDuration) return null;

  return { startMinutes, endMinutes };
};

export const buildSelectionFromMinutePoint = (
  pointMinutes,
  preferredDuration = 60,
  minDuration = 15,
  minStartMinutes = 0,
  maxEndMinutes = 24 * 60,
) => {
  const point = Number(pointMinutes);
  const minStart = Number.isFinite(minStartMinutes) ? minStartMinutes : 0;
  const maxEnd = Number.isFinite(maxEndMinutes) ? maxEndMinutes : 24 * 60;
  const duration = Number.isFinite(preferredDuration) ? preferredDuration : 60;
  const minDurationSafe = Number.isFinite(minDuration) ? Math.max(1, minDuration) : 15;
  const availableDuration = Math.max(minDurationSafe, Math.min(duration, maxEnd - minStart));
  if (!Number.isFinite(point) || maxEnd - minStart < minDurationSafe) return null;

  const snappedStart = Math.round(point / minDurationSafe) * minDurationSafe;
  const maxStart = maxEnd - availableDuration;
  const startMinutes = Math.max(minStart, Math.min(maxStart, snappedStart));
  const endMinutes = startMinutes + availableDuration;
  if (endMinutes - startMinutes < minDurationSafe) return null;

  return { startMinutes, endMinutes };
};

export const findFirstSlotStartMinutes = (...slotGroups) => {
  for (const group of slotGroups) {
    const normalized = normalizeMinuteSlots(group);
    if (normalized.length > 0) return normalized[0].startMinutes;
  }
  return null;
};
