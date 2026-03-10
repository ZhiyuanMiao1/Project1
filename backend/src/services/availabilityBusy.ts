import { query } from '../db';

export type AvailabilityBlock = { start: number; end: number };
export type AvailabilityPayload = {
  timeZone: string;
  sessionDurationHours: number;
  daySelections: Record<string, AvailabilityBlock[]>;
};

type AppointmentPayload = {
  kind?: string;
  windowText?: unknown;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_SESSION_DURATION_HOURS = 2;
const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * 60_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeTimeZone = (value: unknown, fallback = DEFAULT_TIME_ZONE) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
};

const getFormatter = (timeZone: string) => {
  const normalized = normalizeTimeZone(timeZone);
  if (!formatterCache.has(normalized)) {
    formatterCache.set(
      normalized,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: normalized,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }
  return formatterCache.get(normalized)!;
};

const getZonedParts = (timeZone: string, value: Date): ZonedParts => {
  const parts = getFormatter(timeZone).formatToParts(value);
  const pick = (type: string) => {
    const token = parts.find((part) => part.type === type)?.value || '';
    return Number.parseInt(token, 10);
  };
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
};

const safeJsonParse = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseAppointmentPayload = (payloadJson: unknown): AppointmentPayload | null => {
  const parsed = safeJsonParse(payloadJson);
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as any).kind !== 'appointment_card') return null;
  return parsed as AppointmentPayload;
};

const parseTimezoneOffsetMinutes = (raw: string) => {
  const text = String(raw || '')
    .trim()
    .replace(/\uFF0B/g, '+')
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\uFF0D]/g, '-');
  if (!text) return null;
  const match = text.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?:[:]\s*(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || hours > 14) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 60) return null;
  return sign * (hours * 60 + minutes);
};

const parseCourseWindowText = (windowText: unknown, createdAt: Date) => {
  const raw = typeof windowText === 'string' ? windowText.trim() : '';
  if (!raw) return null;

  const canonical = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\uFF1A/g, ':')
    .replace(/[\u2013\u2014\uFF5E]/g, '-')
    .replace(/\uFF0B/g, '+')
    .replace(/[\u2212\uFF0D]/g, '-');

  const tzMatch = canonical.match(/\(([^)]+)\)\s*$/);
  const tzLabel = tzMatch ? String(tzMatch[1] || '').trim() : '';
  const tzOffsetMinutes = parseTimezoneOffsetMinutes(tzLabel) ?? parseTimezoneOffsetMinutes(canonical) ?? 0;

  const timeMatch = canonical.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/i);
  if (!timeMatch) return null;

  const startHour = Number.parseInt(timeMatch[1], 10);
  const startMinute = Number.parseInt(timeMatch[2], 10);
  const endHour = Number.parseInt(timeMatch[3], 10);
  const endMinute = Number.parseInt(timeMatch[4], 10);
  if (![startHour, startMinute, endHour, endMinute].every((n) => Number.isFinite(n))) return null;
  if (
    startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59
    || endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59
  ) return null;

  const cnDateMatch = canonical.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const altDateMatch = canonical.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  const parsedYear = cnDateMatch?.[1] || altDateMatch?.[1] || '';
  const monthText = cnDateMatch?.[2] || altDateMatch?.[2] || '';
  const dayText = cnDateMatch?.[3] || altDateMatch?.[3] || '';
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const buildRange = (year: number) => {
    const startMs = Date.UTC(year, month - 1, day, startHour, startMinute, 0) - tzOffsetMinutes * 60_000;
    let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationMinutes <= 0) durationMinutes += 24 * 60;
    return {
      startMs,
      endMs: startMs + durationMinutes * 60_000,
    };
  };

  if (parsedYear) {
    const year = Number.parseInt(parsedYear, 10);
    if (!Number.isFinite(year) || year < 1970 || year > 2100) return null;
    return buildRange(year);
  }

  const base = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
  const baseYear = base.getUTCFullYear();
  const baseMs = base.getTime();
  const candidates = [baseYear - 1, baseYear, baseYear + 1].map((candidateYear) => {
    const range = buildRange(candidateYear);
    return { ...range, diffMs: range.startMs - baseMs };
  });
  const acceptable = candidates
    .filter((item) => item.diffMs >= -36 * 60 * 60 * 1000)
    .sort((a, b) => a.diffMs - b.diffMs);
  return acceptable[0] || candidates.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs))[0] || null;
};

const parseStoredUtcDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    ));
  }
  const raw = safeText(value);
  if (!raw) return null;

  const canonical = raw
    .replace('T', ' ')
    .replace(/Z$/i, '')
    .replace(/\.\d+$/, '')
    .trim();

  const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match;
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    const hour = Number.parseInt(hourText, 10);
    const minute = Number.parseInt(minuteText, 10);
    const second = Number.parseInt(secondText, 10);
    if ([year, month, day, hour, minute, second].every(Number.isFinite)) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDecisionStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'accepted' || raw === 'rejected' || raw === 'rescheduling' || raw === 'pending') return raw;
  return '';
};

const mergeAvailabilityBlocks = (blocks: AvailabilityBlock[]) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const sorted = blocks
    .map((block) => ({
      start: Math.min(block.start, block.end),
      end: Math.max(block.start, block.end),
    }))
    .sort((a, b) => a.start - b.start);
  const merged: AvailabilityBlock[] = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = merged[merged.length - 1];
    const current = sorted[index];
    if (current.start <= previous.end + 1) previous.end = Math.max(previous.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
};

const isMissingBusySourceSchemaError = (error: any) => {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    message.includes('message_threads')
    || message.includes('message_items')
    || message.includes('appointment_statuses')
    || message.includes('course_sessions')
  );
};

const addSlotToBuckets = (
  buckets: Map<number, Map<string, Set<number>>>,
  userId: number,
  dayKey: string,
  slotIndex: number
) => {
  if (!buckets.has(userId)) buckets.set(userId, new Map());
  const dayMap = buckets.get(userId)!;
  if (!dayMap.has(dayKey)) dayMap.set(dayKey, new Set());
  dayMap.get(dayKey)!.add(slotIndex);
};

const addRangeToBuckets = (
  buckets: Map<number, Map<string, Set<number>>>,
  userId: number,
  startMs: number,
  endMs: number,
  timeZone: string
) => {
  if (!Number.isFinite(userId) || userId <= 0) return;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const start = Math.floor(startMs / SLOT_MS) * SLOT_MS;
  const end = Math.ceil(endMs / SLOT_MS) * SLOT_MS;
  for (let cursor = start; cursor < end; cursor += SLOT_MS) {
    const zoned = getZonedParts(normalizedTimeZone, new Date(cursor));
    const slotIndex = zoned.hour * 4 + Math.floor(zoned.minute / SLOT_MINUTES);
    if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex > 95) continue;
    const dayKey = `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`;
    addSlotToBuckets(buckets, userId, dayKey, slotIndex);
  }
};

const bucketsToBusySelections = (buckets: Map<number, Map<string, Set<number>>>) => {
  const out = new Map<number, Record<string, AvailabilityBlock[]>>();
  for (const [userId, dayMap] of buckets.entries()) {
    const selections: Record<string, AvailabilityBlock[]> = {};
    for (const [dayKey, slotSet] of dayMap.entries()) {
      const orderedSlots = Array.from(slotSet).sort((a, b) => a - b);
      const blocks = mergeAvailabilityBlocks(
        orderedSlots.map((slotIndex) => ({ start: slotIndex, end: slotIndex }))
      );
      if (blocks.length > 0) selections[dayKey] = blocks;
    }
    out.set(userId, selections);
  }
  return out;
};

export const buildEmptyAvailability = (timeZone = DEFAULT_TIME_ZONE): AvailabilityPayload => ({
  timeZone: normalizeTimeZone(timeZone),
  sessionDurationHours: DEFAULT_SESSION_DURATION_HOURS,
  daySelections: {},
});

export const getBusySelectionsForUsers = async (
  userIds: number[],
  timeZoneByUserId = new Map<number, string>()
) => {
  const normalizedUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value))
    )
  );

  const results = new Map<number, Record<string, AvailabilityBlock[]>>();
  for (const userId of normalizedUserIds) results.set(userId, {});
  if (normalizedUserIds.length === 0) return results;

  const targetSet = new Set(normalizedUserIds);
  const buckets = new Map<number, Map<string, Set<number>>>();
  const placeholders = normalizedUserIds.map(() => '?').join(',');
  const nowMs = Date.now();

  try {
    const appointmentRows = await query<any[]>(
      `
      SELECT
        mi.payload_json,
        mi.created_at,
        COALESCE(ast.status, 'pending') AS appointment_status,
        t.student_user_id,
        t.mentor_user_id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
      WHERE mi.message_type = 'appointment_card'
        AND (t.student_user_id IN (${placeholders}) OR t.mentor_user_id IN (${placeholders}))
      `,
      [...normalizedUserIds, ...normalizedUserIds]
    );

    for (const row of appointmentRows || []) {
      const status = normalizeDecisionStatus(row?.appointment_status) || 'pending';
      if (status !== 'pending' && status !== 'accepted' && status !== 'rescheduling') continue;

      const payload = parseAppointmentPayload(row?.payload_json);
      const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
      const parsedWindow = parseCourseWindowText(payload?.windowText, createdAt);
      if (!parsedWindow || parsedWindow.endMs <= nowMs) continue;

      const studentUserId = Number(row?.student_user_id);
      const mentorUserId = Number(row?.mentor_user_id);
      if (targetSet.has(studentUserId)) {
        addRangeToBuckets(
          buckets,
          studentUserId,
          parsedWindow.startMs,
          parsedWindow.endMs,
          timeZoneByUserId.get(studentUserId) || DEFAULT_TIME_ZONE
        );
      }
      if (targetSet.has(mentorUserId)) {
        addRangeToBuckets(
          buckets,
          mentorUserId,
          parsedWindow.startMs,
          parsedWindow.endMs,
          timeZoneByUserId.get(mentorUserId) || DEFAULT_TIME_ZONE
        );
      }
    }
  } catch (error) {
    if (!isMissingBusySourceSchemaError(error)) throw error;
  }

  try {
    const courseSessionRows = await query<any[]>(
      `
      SELECT student_user_id, mentor_user_id, starts_at, duration_hours, status
      FROM course_sessions
      WHERE student_user_id IN (${placeholders}) OR mentor_user_id IN (${placeholders})
      `,
      [...normalizedUserIds, ...normalizedUserIds]
    );

    for (const row of courseSessionRows || []) {
      const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : '';
      if (status === 'cancelled' || status === 'canceled') continue;

      const startsAt = parseStoredUtcDate(row?.starts_at);
      const durationHours = typeof row?.duration_hours === 'number'
        ? row.duration_hours
        : Number.parseFloat(String(row?.duration_hours ?? ''));
      if (!startsAt || !Number.isFinite(durationHours) || durationHours <= 0) continue;

      const startMs = startsAt.getTime();
      const endMs = startMs + durationHours * 60 * 60 * 1000;
      if (!Number.isFinite(endMs) || endMs <= nowMs) continue;

      const studentUserId = Number(row?.student_user_id);
      const mentorUserId = Number(row?.mentor_user_id);
      if (targetSet.has(studentUserId)) {
        addRangeToBuckets(
          buckets,
          studentUserId,
          startMs,
          endMs,
          timeZoneByUserId.get(studentUserId) || DEFAULT_TIME_ZONE
        );
      }
      if (targetSet.has(mentorUserId)) {
        addRangeToBuckets(
          buckets,
          mentorUserId,
          startMs,
          endMs,
          timeZoneByUserId.get(mentorUserId) || DEFAULT_TIME_ZONE
        );
      }
    }
  } catch (error) {
    if (!isMissingBusySourceSchemaError(error)) throw error;
  }

  const busySelectionsByUser = bucketsToBusySelections(buckets);
  for (const userId of normalizedUserIds) {
    results.set(userId, busySelectionsByUser.get(userId) || {});
  }
  return results;
};

export const getBusySelectionsForUser = async (userId: number, timeZone: string) => {
  const selections = await getBusySelectionsForUsers([userId], new Map([[userId, normalizeTimeZone(timeZone)]]));
  return selections.get(userId) || {};
};
