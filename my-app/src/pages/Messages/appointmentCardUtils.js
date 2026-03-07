import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../constants/courseMappings';

export const SCHEDULE_STATUS_META = {
  pending: { label: '待确认', tone: 'pending' },
  accepted: { label: '已接受', tone: 'accept' },
  rejected: { label: '已拒绝', tone: 'reject' },
  rescheduling: { label: '修改时间中', tone: 'reschedule' },
  expired: { label: '已过期', tone: 'expired' },
};

export const normalizeScheduleStatus = (value) => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key in SCHEDULE_STATUS_META) return key;
  return 'pending';
};

const parseTimezoneOffsetMinutes = (raw) => {
  const text = String(raw || '')
    .trim()
    .replace(/\uFF0B/g, '+')
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\uFF0D]/g, '-');
  if (!text) return null;
  const match = text.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?:[:]\s*(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || hours > 14) return null;
  if (!Number.isFinite(mins) || mins < 0 || mins >= 60) return null;
  return sign * (hours * 60 + mins);
};

const parseScheduleWindowRangeInternal = (windowText, referenceTime) => {
  const raw = typeof windowText === 'string' ? windowText.trim() : '';
  if (!raw) return null;

  const canonical = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\uFF1A/g, ':')
    .replace(/[\u2013\u2014\uFF5E]/g, '-')
    .replace(/\uFF0B/g, '+')
    .replace(/[\u2212\uFF0D]/g, '-');

  const timeMatch = canonical.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/i);
  if (!timeMatch) return null;

  const startHour = Number.parseInt(timeMatch[1], 10);
  const startMinute = Number.parseInt(timeMatch[2], 10);
  const endHour = Number.parseInt(timeMatch[3], 10);
  const endMinute = Number.parseInt(timeMatch[4], 10);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return null;
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

  const tzMatch = canonical.match(/\(([^)]+)\)\s*$/);
  const tzLabel = tzMatch ? String(tzMatch[1] || '').trim() : '';
  const offsetMinutes = parseTimezoneOffsetMinutes(tzLabel) ?? parseTimezoneOffsetMinutes(canonical) ?? 0;
  const buildRange = (year) => {
    const startMs = Date.UTC(year, month - 1, day, startHour, startMinute, 0) - offsetMinutes * 60_000;
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

  const ref = referenceTime ? new Date(referenceTime) : new Date();
  const baseMs = Number.isFinite(ref.getTime()) ? ref.getTime() : Date.now();
  const baseYear = Number.isFinite(ref.getTime()) ? ref.getUTCFullYear() : new Date().getUTCFullYear();
  const candidates = [baseYear - 1, baseYear, baseYear + 1].map((year) => {
    const range = buildRange(year);
    return { ...range, diffMs: range.startMs - baseMs };
  });
  const acceptable = candidates
    .filter((item) => item.diffMs >= -36 * 60 * 60 * 1000)
    .sort((a, b) => a.diffMs - b.diffMs);
  const picked = acceptable[0] || candidates.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs))[0];
  return picked ? { startMs: picked.startMs, endMs: picked.endMs } : null;
};

export const parseScheduleWindowRange = (windowText, referenceTime) => {
  const parsed = parseScheduleWindowRangeInternal(windowText, referenceTime);
  if (!parsed) return null;
  return {
    startMs: parsed.startMs,
    endMs: parsed.endMs,
  };
};

const parseWindowStartMs = (windowText, referenceTime) => {
  return parseScheduleWindowRangeInternal(windowText, referenceTime)?.startMs ?? null;
};

export const isScheduleWindowExpired = ({ windowText, referenceTime, nowMs = Date.now() }) => {
  const startMs = parseWindowStartMs(windowText, referenceTime);
  if (!Number.isFinite(startMs)) return false;
  return startMs <= nowMs;
};

export const resolveScheduleStatus = ({ status, windowText, referenceTime, nowMs = Date.now() }) => {
  const baseStatus = normalizeScheduleStatus(status);
  if (baseStatus !== 'pending') return baseStatus;
  return isScheduleWindowExpired({ windowText, referenceTime, nowMs }) ? 'expired' : baseStatus;
};

export const getCourseTitleParts = (thread, scheduleCard) => {
  const directionId = scheduleCard?.courseDirectionId || thread?.courseDirectionId || 'others';
  const courseTypeId = scheduleCard?.courseTypeId || thread?.courseTypeId || 'others';

  const courseName =
    DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || '其它课程方向';
  const courseType =
    COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || '其它类型';
  const DirectionIcon = DIRECTION_ICON_MAP[directionId] || DIRECTION_ICON_MAP.others || null;
  const CourseTypeIcon = COURSE_TYPE_ICON_MAP[courseTypeId] || COURSE_TYPE_ICON_MAP.others || null;

  return { courseName, courseType, directionId, courseTypeId, DirectionIcon, CourseTypeIcon };
};
