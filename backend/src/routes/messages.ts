import express, { Request, Response } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import type { InsertResult } from '../db';
import { pool, query } from '../db';
import { requireAuth } from '../middleware/auth';
import { buildEmptyAvailability, getBusySelectionsForUsers } from '../services/availabilityBusy';
import {
  ensureMentorResponseTimeColumn,
  recomputeMentorResponseTimeAverage,
} from '../services/mentorResponseTime';

const router = express.Router();

const isMissingMessagesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return (
    message.includes('message_threads')
    || message.includes('message_items')
    || message.includes('message_item_hidden_for_users')
    || message.includes('message_item_reads')
    || message.includes('appointment_statuses')
    || message.includes('lesson_hour_confirmations')
    || message.includes('course_sessions')
  );
};

const formatZoomMeetingId = (digits: number) => {
  const text = String(digits).padStart(9, '0').slice(0, 9);
  return `${text.slice(0, 3)} ${text.slice(3, 6)} ${text.slice(6)}`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatUtcDatetime = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};

const normalizeDbDateAsUtc = (value: Date) => new Date(Date.UTC(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  value.getHours(),
  value.getMinutes(),
  value.getSeconds(),
  value.getMilliseconds(),
));

const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const parseTimezoneOffsetMinutes = (raw: string) => {
  const s = String(raw || '')
    .trim()
    .replace(/\uFF0B/g, '+') // fullwidth plus
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\uFF0D]/g, '-'); // minus variants
  if (!s) return null;
  const match = s.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?:[:]\s*(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || hours > 14) return null;
  if (!Number.isFinite(mins) || mins < 0 || mins >= 60) return null;
  return sign * (hours * 60 + mins);
};

type ParsedCourseWindow = {
  startsAtUtc: Date;
  endsAtUtc: Date;
  durationHours: number;
  tzOffsetMinutes: number;
};

type CourseSessionLookupRow = {
  id: number | string;
  student_user_id: number | string;
  mentor_user_id: number | string;
  starts_at: Date | string | null;
};

const parseCourseWindowText = (windowText: unknown, createdAt: Date): ParsedCourseWindow | null => {
  const raw = typeof windowText === 'string' ? windowText.trim() : '';
  if (!raw) return null;

  const canonical = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\uFF1A/g, ':') // fullwidth colon
    .replace(/[\u2013\u2014\uFF5E]/g, '-') // dash/tilde variants
    .replace(/\uFF0B/g, '+') // fullwidth plus
    .replace(/[\u2212\uFF0D]/g, '-'); // minus variants

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
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) return null;
  if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) return null;

  const cnDateMatch = canonical.match(/(?:(\d{4})\s*\u5E74\s*)?(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65E5/);
  const altDateMatch = canonical.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);

  const parsedYear = cnDateMatch?.[1] || altDateMatch?.[1] || '';
  const monthText = cnDateMatch?.[2] || altDateMatch?.[2] || '';
  const dayText = cnDateMatch?.[3] || altDateMatch?.[3] || '';

  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const buildStartUtc = (year: number) => {
    const utcMillis = Date.UTC(year, month - 1, day, startHour, startMinute, 0) - tzOffsetMinutes * 60_000;
    return new Date(utcMillis);
  };

  const buildEndUtc = (startUtc: Date) => {
    let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationMinutes <= 0) durationMinutes += 24 * 60;
    const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);
    return { durationMinutes, endUtc };
  };

  let year: number | null = null;
  if (parsedYear) {
    const y = Number.parseInt(parsedYear, 10);
    if (Number.isFinite(y) && y >= 1970 && y <= 2100) year = y;
  }

  if (year == null) {
    const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const baseYear = base.getUTCFullYear();
    const candidates = [baseYear - 1, baseYear, baseYear + 1];
    const baseMs = base.getTime();
    const computed = candidates.map((candidateYear) => {
      const startUtc = buildStartUtc(candidateYear);
      return { year: candidateYear, startUtc, diffMs: startUtc.getTime() - baseMs };
    });
    const acceptable = computed
      .filter((c) => c.diffMs >= -36 * 60 * 60 * 1000)
      .sort((a, b) => a.diffMs - b.diffMs);
    year = (acceptable[0] || computed.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs))[0])?.year ?? baseYear;
  }

  const startsAtUtc = buildStartUtc(year);
  if (!Number.isFinite(startsAtUtc.getTime())) return null;

  const { durationMinutes, endUtc } = buildEndUtc(startsAtUtc);
  const durationHours = Math.round((durationMinutes / 60) * 100) / 100;

  return {
    startsAtUtc,
    endsAtUtc: endUtc,
    durationHours,
    tzOffsetMinutes,
  };
};

const buildDefaultMeetingId = () => {
  const n = Math.floor(100_000_000 + Math.random() * 900_000_000);
  return `会议号：${formatZoomMeetingId(n)}`;
};

const normalizeCourseSessionStartsAt = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatUtcDatetime(normalizeDbDateAsUtc(raw));
  }

  const text = safeText(raw);
  if (!text) return '';

  const canonical = text
    .replace('T', ' ')
    .replace(/Z$/i, '')
    .replace(/\.\d+$/, '')
    .trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(canonical)) {
    return canonical;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatUtcDatetime(parsed);
};

const buildCourseSessionLookupKey = (
  studentUserId: number,
  mentorUserId: number,
  startsAtText: string
) => {
  if (!Number.isFinite(studentUserId) || studentUserId <= 0) return '';
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return '';
  const normalizedStartsAt = normalizeCourseSessionStartsAt(startsAtText);
  if (!normalizedStartsAt) return '';
  return `${studentUserId}:${mentorUserId}:${normalizedStartsAt}`;
};

type AppointmentPayload = {
  kind?: string;
  windowText?: unknown;
  meetingId?: unknown;
  courseDirectionId?: unknown;
  courseTypeId?: unknown;
  courseRequestId?: unknown;
  sourceAppointmentId?: unknown;
};

type AppointmentDecisionPayload = {
  kind?: string;
  appointmentId?: unknown;
  status?: unknown;
};

type LessonHoursConfirmationPayload = {
  kind?: string;
  courseSessionId?: unknown;
  proposedHours?: unknown;
  startsAt?: unknown;
  courseDirectionId?: unknown;
  courseTypeId?: unknown;
};

type AvailabilityBlock = { start: number; end: number };

const isMissingAvailabilityColumnError = (error: any) => {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('availability_json');
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

const isValidDayKey = (key: string) => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [yearText, monthText, dayText] = key.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (![year, month, day].every(Number.isFinite)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return false;
  return (
    date.getFullYear() === year
    && date.getMonth() + 1 === month
    && date.getDate() === day
  );
};

const sanitizeDaySelections = (raw: unknown) => {
  const out: Record<string, AvailabilityBlock[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidDayKey(key) || !Array.isArray(value)) continue;
    const blocks: AvailabilityBlock[] = [];
    for (const item of value) {
      const start = Number((item as any)?.start);
      const end = Number((item as any)?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const safeStart = Math.max(0, Math.min(95, Math.floor(start)));
      const safeEnd = Math.max(0, Math.min(95, Math.floor(end)));
      blocks.push({ start: Math.min(safeStart, safeEnd), end: Math.max(safeStart, safeEnd) });
    }
    const merged = mergeAvailabilityBlocks(blocks);
    if (merged.length > 0) out[key] = merged;
  }
  return out;
};

const parseAvailabilityPayload = (value: unknown, fallbackTimeZone = 'Asia/Shanghai') => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    const timeZone = typeof parsed?.timeZone === 'string' && parsed.timeZone.trim()
      ? parsed.timeZone.trim()
      : fallbackTimeZone;
    const sessionDurationRaw = typeof parsed?.sessionDurationHours === 'number'
      ? parsed.sessionDurationHours
      : Number.parseFloat(String(parsed?.sessionDurationHours ?? '2'));
    const sessionDurationHours = Number.isFinite(sessionDurationRaw)
      ? Math.max(0.25, Math.min(10, sessionDurationRaw))
      : 2;
    return {
      timeZone,
      sessionDurationHours,
      daySelections: sanitizeDaySelections(parsed?.daySelections),
    };
  } catch {
    return null;
  }
};

const fetchAccountAvailabilityForUser = async (userId: number, fallbackTimeZone = 'Asia/Shanghai') => {
  try {
    const rows = await query<any[]>(
      'SELECT availability_json FROM account_settings WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return parseAvailabilityPayload(rows?.[0]?.availability_json, fallbackTimeZone) || buildEmptyAvailability(fallbackTimeZone);
  } catch (error) {
    if (!isMissingAvailabilityColumnError(error)) throw error;
    return buildEmptyAvailability(fallbackTimeZone);
  }
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

const parseAppointmentDecisionPayload = (payloadJson: unknown): AppointmentDecisionPayload | null => {
  const parsed = safeJsonParse(payloadJson);
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as any).kind !== 'appointment_decision') return null;
  return parsed as AppointmentDecisionPayload;
};

const parseLessonHoursConfirmationPayload = (payloadJson: unknown): LessonHoursConfirmationPayload | null => {
  const parsed = safeJsonParse(payloadJson);
  if (!parsed || typeof parsed !== 'object') return null;
  if ((parsed as any).kind !== 'lesson_hours_confirmation') return null;
  return parsed as LessonHoursConfirmationPayload;
};

const toScheduleCard = (row: any, currentUserId: number) => {
  const payload = parseAppointmentPayload(row?.payload_json);
  if (!payload) return null;
  const rawStatus = typeof row?.appointment_status === 'string'
    ? row.appointment_status.trim().toLowerCase()
    : '';
  const normalizedStatus =
    rawStatus === 'accepted' || rawStatus === 'rejected' || rawStatus === 'rescheduling' || rawStatus === 'pending'
      ? rawStatus
      : 'pending';
  return {
    id: String(row?.id ?? ''),
    direction: Number(row?.sender_user_id) === currentUserId ? 'outgoing' : 'incoming',
    window: String(payload.windowText || '').trim(),
    meetingId: String(payload.meetingId || '').trim(),
    sourceAppointmentId: typeof payload.sourceAppointmentId === 'string' ? payload.sourceAppointmentId.trim() : '',
    time: row?.created_at ? new Date(row.created_at).toISOString() : '',
    status: normalizedStatus,
    canRecall: Number(row?.sender_user_id) === currentUserId && normalizedStatus === 'pending',
    isRead: Number(row?.is_read_by_me) === 1,
    courseDirectionId: typeof payload.courseDirectionId === 'string' ? payload.courseDirectionId : '',
    courseTypeId: typeof payload.courseTypeId === 'string' ? payload.courseTypeId : '',
  };
};

const toLessonHoursConfirmationCard = (row: any, currentUserId: number) => {
  const payload = parseLessonHoursConfirmationPayload(row?.payload_json);
  if (!payload) return null;

  const status = normalizeLessonHoursConfirmationStatus(row?.confirmation_status) || 'pending';
  const courseSessionId = toPositiveIntOrNull(row?.course_session_id);
  const proposedHours = Number.parseFloat(String(row?.proposed_hours ?? payload?.proposedHours ?? ''));
  if (!Number.isFinite(proposedHours) || proposedHours <= 0) return null;

  const finalHoursRaw = Number.parseFloat(String(row?.final_hours ?? ''));
  const startsAtRaw = row?.course_starts_at ?? payload?.startsAt;
  const startsAt = startsAtRaw instanceof Date
    ? startsAtRaw.toISOString()
    : safeText(startsAtRaw);

  return {
    id: String(row?.id ?? ''),
    direction: Number(row?.sender_user_id) === currentUserId ? 'outgoing' : 'incoming',
    courseSessionId: courseSessionId != null ? String(courseSessionId) : safeText(payload?.courseSessionId),
    proposedHours: Number(proposedHours.toFixed(2)),
    finalHours: Number.isFinite(finalHoursRaw) && finalHoursRaw > 0 ? Number(finalHoursRaw.toFixed(2)) : null,
    status,
    time: row?.created_at ? new Date(row.created_at).toISOString() : '',
    startsAt,
    isRead: Number(row?.is_read_by_me) === 1,
    courseDirectionId: typeof payload?.courseDirectionId === 'string' ? payload.courseDirectionId.trim() : '',
    courseTypeId: typeof payload?.courseTypeId === 'string' ? payload.courseTypeId.trim() : '',
  };
};

const normalizeDecisionStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'accepted' || raw === 'rejected' || raw === 'rescheduling' || raw === 'pending') return raw;
  return '';
};

const normalizeLessonHoursConfirmationStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'pending' || raw === 'confirmed' || raw === 'disputed') return raw;
  return '';
};

const normalizeQuarterHourValue = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 4) / 4;
  if (Math.abs(rounded - n) > 1e-6) return null;
  if (rounded < 0.25 || rounded > 12) return null;
  return Number(rounded.toFixed(2));
};

const refreshMentorResponseTimeMetricIfNeeded = async (
  conn: PoolConnection,
  row: any,
  actingUserId: number
) => {
  const mentorUserId = Number(row?.mentor_user_id);
  const studentUserId = Number(row?.student_user_id);
  const senderUserId = Number(row?.sender_user_id);
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return;
  if (!Number.isFinite(studentUserId) || studentUserId <= 0) return;
  if (!Number.isFinite(senderUserId) || senderUserId <= 0) return;
  if (actingUserId !== mentorUserId) return;
  if (senderUserId !== studentUserId) return;
  await recomputeMentorResponseTimeAverage(conn, mentorUserId);
};

const toPositiveIntOrNull = (value: unknown) => {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ensureCourseSessionForAcceptedAppointment = async ({
  studentUserId,
  mentorUserId,
  payload,
  createdAt,
}: {
  studentUserId: number;
  mentorUserId: number;
  payload: AppointmentPayload | null;
  createdAt: Date;
}) => {
  if (!Number.isFinite(studentUserId) || studentUserId <= 0) return '';
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return '';

  const parsed = parseCourseWindowText(payload?.windowText, createdAt);
  if (!parsed) return '';

  const startsAt = formatUtcDatetime(parsed.startsAtUtc);
  const existingRows = await query<{ id: number | string }[]>(
    `
    SELECT id
    FROM course_sessions
    WHERE student_user_id = ? AND mentor_user_id = ? AND starts_at = ?
    ORDER BY id ASC
    LIMIT 1
    `,
    [studentUserId, mentorUserId, startsAt]
  );
  const existingId = toPositiveIntOrNull(existingRows?.[0]?.id);
  if (existingId != null) return String(existingId);

  const sessionStatus = parsed.endsAtUtc.getTime() <= Date.now() ? 'completed' : 'scheduled';
  const insertResult = await query<InsertResult>(
    `
    INSERT INTO course_sessions
      (student_user_id, mentor_user_id, course_direction, course_type, starts_at, duration_hours, status)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      studentUserId,
      mentorUserId,
      typeof payload?.courseDirectionId === 'string' && payload.courseDirectionId.trim()
        ? payload.courseDirectionId.trim()
        : null,
      typeof payload?.courseTypeId === 'string' && payload.courseTypeId.trim()
        ? payload.courseTypeId.trim()
        : null,
      startsAt,
      parsed.durationHours,
      sessionStatus,
    ]
  );

  const insertedId = toPositiveIntOrNull(insertResult?.insertId);
  return insertedId != null ? String(insertedId) : '';
};

const normalizeCourseSessionStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw;
};

const isCancelledCourseSessionStatus = (value: unknown) => {
  const status = normalizeCourseSessionStatus(value);
  return status === 'cancelled' || status === 'canceled';
};

const syncCourseSessionForAppointmentDecision = async (
  conn: PoolConnection,
  row: any,
  status: 'accepted' | 'rejected' | 'rescheduling'
) => {
  const payload = parseAppointmentPayload(row?.payload_json);
  if (!payload) {
    if (status === 'accepted') throw new Error('Invalid appointment payload');
    return;
  }

  const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
  const parsed = parseCourseWindowText(payload?.windowText, createdAt);
  if (!parsed) {
    if (status === 'accepted') throw new Error('Invalid schedule windowText');
    return;
  }

  const studentUserId = Number(row?.student_user_id);
  const mentorUserId = Number(row?.mentor_user_id);
  if (!Number.isFinite(studentUserId) || studentUserId <= 0 || !Number.isFinite(mentorUserId) || mentorUserId <= 0) {
    if (status === 'accepted') throw new Error('Invalid thread users');
    return;
  }

  const startsAt = formatUtcDatetime(parsed.startsAtUtc);
  const sessionStatus = parsed.endsAtUtc.getTime() <= Date.now() ? 'completed' : 'scheduled';
  const [existingRows] = await conn.execute<any[]>(
    'SELECT id, status FROM course_sessions WHERE student_user_id = ? AND mentor_user_id = ? AND starts_at = ? LIMIT 1',
    [studentUserId, mentorUserId, startsAt]
  );
  const existingRow = existingRows?.[0];

  if (status === 'accepted') {
    if (!existingRow) {
      await conn.execute(
        `
        INSERT INTO course_sessions
          (student_user_id, mentor_user_id, course_direction, course_type, starts_at, duration_hours, status)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          studentUserId,
          mentorUserId,
          typeof payload?.courseDirectionId === 'string' && payload.courseDirectionId.trim()
            ? payload.courseDirectionId.trim()
            : null,
          typeof payload?.courseTypeId === 'string' && payload.courseTypeId.trim()
            ? payload.courseTypeId.trim()
            : null,
          startsAt,
          parsed.durationHours,
          sessionStatus,
        ]
      );
      return;
    }

    const existingId = toPositiveIntOrNull(existingRow?.id);
    if (existingId == null) return;

    await conn.execute(
      `
      UPDATE course_sessions
      SET course_direction = ?,
          course_type = ?,
          duration_hours = ?,
          status = ?
      WHERE id = ?
      `,
      [
        typeof payload?.courseDirectionId === 'string' && payload.courseDirectionId.trim()
          ? payload.courseDirectionId.trim()
          : null,
        typeof payload?.courseTypeId === 'string' && payload.courseTypeId.trim()
          ? payload.courseTypeId.trim()
          : null,
        parsed.durationHours,
        sessionStatus,
        existingId,
      ]
    );
    return;
  }

  const existingId = toPositiveIntOrNull(existingRow?.id);
  if (existingId == null) return;

  const existingStatus = normalizeCourseSessionStatus(existingRow?.status);
  if (existingStatus === 'completed' || isCancelledCourseSessionStatus(existingStatus)) return;

  await conn.execute(
    `
    UPDATE course_sessions
    SET status = 'cancelled'
    WHERE id = ?
    `,
    [existingId]
  );
};

router.post('/appointments', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const mentorPublicId = typeof req.body?.mentorId === 'string' && req.body.mentorId.trim()
    ? req.body.mentorId.trim()
    : (req.user.role === 'mentor' ? '__mentor_self__' : '');
  const studentUserIdFromBody = toPositiveIntOrNull(req.body?.studentUserId);
  const windowText = typeof req.body?.windowText === 'string' ? req.body.windowText.trim() : '';
  const courseDirectionId = typeof req.body?.courseDirectionId === 'string' ? req.body.courseDirectionId.trim() : '';
  const courseTypeId = typeof req.body?.courseTypeId === 'string' ? req.body.courseTypeId.trim() : '';
  const courseRequestIdRaw = req.body?.courseRequestId;
  const courseRequestId = Number.isFinite(Number(courseRequestIdRaw)) ? Number(courseRequestIdRaw) : null;
  const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
    ? String(req.body.meetingId).trim()
    : buildDefaultMeetingId();

  if (!mentorPublicId) return res.status(400).json({ error: '缺少导师ID' });
  if (!windowText) return res.status(400).json({ error: '缺少预约时间' });

  try {
    if (req.user.role === 'mentor') {
      let studentUserId = studentUserIdFromBody;
      if (studentUserId == null && courseRequestId != null) {
        const requestRows = await query<any[]>(
          'SELECT user_id FROM course_requests WHERE id = ? LIMIT 1',
          [courseRequestId]
        );
        const requestStudentUserId = Number(requestRows?.[0]?.user_id);
        if (Number.isFinite(requestStudentUserId) && requestStudentUserId > 0) {
          studentUserId = requestStudentUserId;
        }
      }

      if (studentUserId == null) {
        return res.status(400).json({ error: 'missing_student_user_id' });
      }
      if (studentUserId === req.user.id) {
        return res.status(400).json({ error: 'cannot_message_self' });
      }

      const mentorRoleRows = await query<any[]>(
        "SELECT public_id FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
        [req.user.id]
      );
      const currentMentorPublicId = String(mentorRoleRows?.[0]?.public_id || '').trim();

      const threadInsert = await query<InsertResult>(
        `
        INSERT INTO message_threads (student_user_id, mentor_user_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          updated_at = CURRENT_TIMESTAMP
        `,
        [studentUserId, req.user.id]
      );
      const threadId = Number(threadInsert.insertId);
      if (!Number.isFinite(threadId) || threadId <= 0) {
        return res.status(500).json({ error: 'failed_to_create_thread' });
      }

      const payload = {
        kind: 'appointment_card',
        mentorId: currentMentorPublicId,
        courseDirectionId,
        courseTypeId,
        courseRequestId,
        windowText,
        meetingId,
      };

      const msgInsert = await query<InsertResult>(
        `
        INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
        VALUES (?, ?, ?, ?)
        `,
        [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]
      );
      const messageId = Number(msgInsert.insertId);

      await query(
        `
        UPDATE message_threads
        SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [Number.isFinite(messageId) && messageId > 0 ? messageId : null, threadId]
      );

      return res.json({ threadId });
    }

    const mentorRows = await query<any[]>(
      "SELECT user_id FROM user_roles WHERE role = 'mentor' AND public_id = ? LIMIT 1",
      [mentorPublicId.toLowerCase()]
    );
    const mentorUserId = Number(mentorRows?.[0]?.user_id);
    if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) {
      return res.status(404).json({ error: '未找到导师' });
    }
    if (mentorUserId === req.user.id) {
      return res.status(400).json({ error: '不能给自己发送预约' });
    }

    const threadInsert = await query<InsertResult>(
      `
      INSERT INTO message_threads (student_user_id, mentor_user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [req.user.id, mentorUserId]
    );
    const threadId = Number(threadInsert.insertId);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return res.status(500).json({ error: '创建会话失败' });
    }

    const payload = {
      kind: 'appointment_card',
      mentorId: mentorPublicId,
      courseDirectionId,
      courseTypeId,
      courseRequestId,
      windowText,
      meetingId,
    };

    const msgInsert = await query<InsertResult>(
      `
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `,
      [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]
    );
    const messageId = Number(msgInsert.insertId);

    await query(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [Number.isFinite(messageId) && messageId > 0 ? messageId : null, threadId]
    );

    return res.json({ threadId });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Create appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/threads/:threadId/appointments', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

  const windowText = typeof req.body?.windowText === 'string' ? req.body.windowText.trim() : '';
  const courseDirectionId = typeof req.body?.courseDirectionId === 'string' ? req.body.courseDirectionId.trim() : '';
  const courseTypeId = typeof req.body?.courseTypeId === 'string' ? req.body.courseTypeId.trim() : '';
  const courseRequestIdRaw = req.body?.courseRequestId;
  const courseRequestId = Number.isFinite(Number(courseRequestIdRaw)) ? Number(courseRequestIdRaw) : null;
  const sourceAppointmentId = toPositiveIntOrNull(req.body?.sourceAppointmentId);
  const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
    ? String(req.body.meetingId).trim()
    : buildDefaultMeetingId();

  if (!windowText) return res.status(400).json({ error: '缺少预约时间' });

  try {
    const threadRows = await query<any[]>(
      `
      SELECT id
      FROM message_threads
      WHERE id = ? AND (student_user_id = ? OR mentor_user_id = ?)
      LIMIT 1
      `,
      [threadId, req.user.id, req.user.id]
    );

    const thread = threadRows?.[0];
    if (!thread) return res.status(404).json({ error: '会话不存在或无权限' });

    let effectiveCourseDirectionId = courseDirectionId;
    let effectiveCourseTypeId = courseTypeId;
    let effectiveCourseRequestId = courseRequestId;

    if (sourceAppointmentId != null) {
      const sourceRows = await query<any[]>(
        `
        SELECT
          mi.id,
          mi.thread_id,
          mi.sender_user_id,
          mi.payload_json,
          mi.created_at,
          COALESCE(ast.status, 'pending') AS appointment_status
        FROM message_items mi
        LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
        WHERE mi.id = ?
          AND mi.thread_id = ?
          AND mi.message_type = 'appointment_card'
        LIMIT 1
        `,
        [sourceAppointmentId, threadId]
      );

      const sourceRow = sourceRows?.[0];
      if (!sourceRow) return res.status(404).json({ error: '来源预约不存在或无权限' });
      const sourceStatus = normalizeDecisionStatus(sourceRow.appointment_status) || 'pending';
      if (sourceStatus !== 'pending' && sourceStatus !== 'accepted') {
        return res.status(409).json({ error: '该预约当前不能用于安排下节课' });
      }

      const sourcePayload = parseAppointmentPayload(sourceRow.payload_json);
      if (!sourcePayload) return res.status(400).json({ error: '来源预约数据无效' });

      if (!effectiveCourseDirectionId && typeof sourcePayload.courseDirectionId === 'string') {
        effectiveCourseDirectionId = sourcePayload.courseDirectionId.trim();
      }
      if (!effectiveCourseTypeId && typeof sourcePayload.courseTypeId === 'string') {
        effectiveCourseTypeId = sourcePayload.courseTypeId.trim();
      }
      if (effectiveCourseRequestId == null) {
        effectiveCourseRequestId = toPositiveIntOrNull(sourcePayload.courseRequestId);
      }

      const sourceCreatedAt = sourceRow?.created_at ? new Date(sourceRow.created_at) : new Date();
      const sourceWindow = parseCourseWindowText(sourcePayload.windowText, sourceCreatedAt);
      const nextWindow = parseCourseWindowText(windowText, new Date());
      if (!nextWindow) return res.status(400).json({ error: '预约时间格式无效' });
      if (sourceWindow && nextWindow.startsAtUtc.getTime() <= sourceWindow.endsAtUtc.getTime()) {
        return res.status(400).json({ error: '下节课时间需晚于原预约结束时间' });
      }
    }

    const payload = {
      kind: 'appointment_card',
      courseDirectionId: effectiveCourseDirectionId,
      courseTypeId: effectiveCourseTypeId,
      courseRequestId: effectiveCourseRequestId,
      windowText,
      meetingId,
      ...(sourceAppointmentId != null ? { sourceAppointmentId: String(sourceAppointmentId) } : {}),
    };

    const msgInsert = await query<InsertResult>(
      `
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, ?, ?)
      `,
      [threadId, req.user.id, 'appointment_card', JSON.stringify(payload)]
    );
    const messageId = Number(msgInsert.insertId);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return res.status(500).json({ error: '发送预约失败' });
    }

    await query(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [messageId, threadId]
    );

    const appointment = toScheduleCard(
      {
        id: messageId,
        thread_id: threadId,
        sender_user_id: req.user.id,
        payload_json: JSON.stringify(payload),
        created_at: new Date(),
        appointment_status: 'pending',
      },
      req.user.id
    );

    return res.json({ threadId: String(threadId), appointment });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
    }
    console.error('Send appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/appointments/:appointmentId/decision', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: '无效预约ID' });
  }

  const status = normalizeDecisionStatus(req.body?.status ?? req.body?.decision);
  if (!status || status === 'pending') {
    return res.status(400).json({ error: '无效状态' });
  }

  await ensureMentorResponseTimeColumn();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        mi.sender_user_id,
        mi.payload_json,
        mi.created_at,
        COALESCE(ast.status, 'pending') AS appointment_status,
        t.student_user_id,
        t.mentor_user_id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      `,
      [appointmentId, req.user.id, req.user.id]
    );

    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
    }
    if (!row) return res.status(404).json({ error: '预约不存在或无权限' });

    if (Number(row.sender_user_id) === req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '不能对自己发的预约更改状态' });
    }

    await conn.execute(
      `
      INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [appointmentId, status, req.user.id]
    );

    await refreshMentorResponseTimeMetricIfNeeded(conn, row, req.user.id);

    try {
      await syncCourseSessionForAppointmentDecision(conn, row, status);
    } catch (e: any) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      const isMissingCourseSessions = code === 'ER_NO_SUCH_TABLE' || message.includes('course_sessions');
      if (isMissingCourseSessions) {
        throw e;
        return res.status(500).json({ error: '鏁版嵁搴撴湭鍗囩骇锛岃鍏堟墽琛宐ackend/schema.sql' });
      }
      console.error('Sync course session error:', e);
      throw e;
    }

    const shouldEmitDecisionMessage = status === 'accepted' || status === 'rejected';
    if (shouldEmitDecisionMessage) {
      const payload = {
        kind: 'appointment_decision',
        appointmentId: String(appointmentId),
        status,
      };

      const [msgInsert] = await conn.execute<InsertResult>(
        `
        INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
        VALUES (?, ?, ?, ?)
        `,
        [Number(row.thread_id), req.user.id, 'appointment_decision', JSON.stringify(payload)]
      );
      const messageId = Number(msgInsert.insertId);

      await conn.execute(
        `
        UPDATE message_threads
        SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [Number.isFinite(messageId) && messageId > 0 ? messageId : null, Number(row.thread_id)]
      );
    } else {
      await conn.execute(
        `UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [Number(row.thread_id)]
      );
    }

    await conn.commit();
    return res.json({ ok: true, appointmentId: String(appointmentId), status });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
    }
    console.error('Update appointment decision error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.post('/lesson-hour-confirmations/:messageId/respond', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return res.status(400).json({ error: '无效课时确认ID' });
  }

  const status = normalizeLessonHoursConfirmationStatus(req.body?.status);
  if (status !== 'confirmed' && status !== 'disputed') {
    return res.status(400).json({ error: '无效响应状态' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        mi.sender_user_id,
        lhc.course_session_id,
        lhc.student_user_id,
        lhc.mentor_user_id,
        lhc.proposed_hours,
        lhc.final_hours,
        lhc.status AS confirmation_status
      FROM message_items mi
      INNER JOIN message_threads t
        ON t.id = mi.thread_id
      INNER JOIN lesson_hour_confirmations lhc
        ON lhc.message_item_id = mi.id
      WHERE mi.id = ?
        AND mi.message_type = 'lesson_hours_confirmation'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      FOR UPDATE
      `,
      [messageId, req.user.id, req.user.id]
    );

    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: '课时确认卡片不存在或无权限' });
    }

    if (Number(row?.student_user_id) !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '只有学生可以处理课时确认' });
    }

    const currentStatus = normalizeLessonHoursConfirmationStatus(row?.confirmation_status) || 'pending';
    if (currentStatus !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: '该课时确认已处理，请刷新后重试' });
    }

    const proposedHours = Number.parseFloat(String(row?.proposed_hours ?? ''));
    if (!Number.isFinite(proposedHours) || proposedHours <= 0) {
      throw new Error('Invalid proposed lesson hours');
    }

    if (status === 'confirmed') {
      await conn.execute(
        `
        UPDATE lesson_hour_confirmations
        SET status = 'confirmed',
            final_hours = ?,
            responded_by_user_id = ?,
            responded_at = CURRENT_TIMESTAMP,
            settled_at = CURRENT_TIMESTAMP
        WHERE message_item_id = ?
        `,
        [proposedHours, req.user.id, messageId]
      );

      await conn.execute(
        `
        UPDATE course_sessions
        SET duration_hours = ?, status = 'completed'
        WHERE id = ?
        `,
        [proposedHours, Number(row.course_session_id)]
      );

      await conn.execute(
        `
        UPDATE users
        SET lesson_balance_hours = lesson_balance_hours - ?
        WHERE id = ?
        `,
        [proposedHours, req.user.id]
      );
    } else {
      await conn.execute(
        `
        UPDATE lesson_hour_confirmations
        SET status = 'disputed',
            responded_by_user_id = ?,
            responded_at = CURRENT_TIMESTAMP
        WHERE message_item_id = ?
        `,
        [req.user.id, messageId]
      );
    }

    await conn.execute(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [messageId, Number(row.thread_id)]
    );

    await conn.commit();
    return res.json({
      ok: true,
      messageId: String(messageId),
      status,
      finalHours: status === 'confirmed' ? Number(proposedHours.toFixed(2)) : null,
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Respond lesson hour confirmation error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.post('/lesson-hour-confirmations/:messageId/retry', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return res.status(400).json({ error: '无效课时确认ID' });
  }

  const proposedHours = normalizeQuarterHourValue(req.body?.proposedHours);
  if (proposedHours == null) {
    return res.status(400).json({ error: '课时必须为 0.25 小时颗粒度，且范围为 0.25-12 小时' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        mi.payload_json,
        lhc.course_session_id,
        lhc.student_user_id,
        lhc.mentor_user_id,
        lhc.status AS confirmation_status,
        cs.course_direction,
        cs.course_type,
        cs.starts_at
      FROM message_items mi
      INNER JOIN message_threads t
        ON t.id = mi.thread_id
      INNER JOIN lesson_hour_confirmations lhc
        ON lhc.message_item_id = mi.id
      INNER JOIN course_sessions cs
        ON cs.id = lhc.course_session_id
      WHERE mi.id = ?
        AND mi.message_type = 'lesson_hours_confirmation'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      FOR UPDATE
      `,
      [messageId, req.user.id, req.user.id]
    );

    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: '课时确认卡片不存在或无权限' });
    }

    if (Number(row?.mentor_user_id) !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '只有导师可以重新提交课时' });
    }

    const currentStatus = normalizeLessonHoursConfirmationStatus(row?.confirmation_status);
    if (currentStatus !== 'disputed') {
      await conn.rollback();
      return res.status(409).json({ error: '当前状态不支持重新提交课时' });
    }

    const payload = parseLessonHoursConfirmationPayload(row?.payload_json);
    const startsAt = row?.starts_at instanceof Date
      ? row.starts_at.toISOString()
      : safeText(row?.starts_at || payload?.startsAt);

    const nextPayload = {
      kind: 'lesson_hours_confirmation',
      courseSessionId: String(row.course_session_id),
      proposedHours,
      startsAt,
      courseDirectionId: safeText(row?.course_direction) || safeText(payload?.courseDirectionId),
      courseTypeId: safeText(row?.course_type) || safeText(payload?.courseTypeId),
    };

    const [messageInsert] = await conn.execute<InsertResult>(
      `
      INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
      VALUES (?, ?, 'lesson_hours_confirmation', ?)
      `,
      [Number(row.thread_id), req.user.id, JSON.stringify(nextPayload)]
    );

    const nextMessageId = Number(messageInsert?.insertId || 0);
    if (!Number.isFinite(nextMessageId) || nextMessageId <= 0) {
      throw new Error('Failed to create retried lesson hours confirmation');
    }

    await conn.execute(
      `
      INSERT INTO lesson_hour_confirmations (
        message_item_id,
        thread_id,
        course_session_id,
        student_user_id,
        mentor_user_id,
        proposed_hours,
        final_hours,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending')
      `,
      [
        nextMessageId,
        Number(row.thread_id),
        Number(row.course_session_id),
        Number(row.student_user_id),
        Number(row.mentor_user_id),
        proposedHours,
      ]
    );

    await conn.execute(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [nextMessageId, Number(row.thread_id)]
    );

    await conn.commit();
    return res.json({
      ok: true,
      messageId: String(nextMessageId),
      proposedHours,
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Retry lesson hour confirmation error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.post('/appointments/:appointmentId/hide', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: '无效预约ID' });
  }

  try {
    const rows = await query<any[]>(
      `
      SELECT mi.id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      `,
      [appointmentId, req.user.id, req.user.id]
    );

    if (!rows?.[0]) return res.status(404).json({ error: '预约不存在或无权限' });

    await query(
      `
      INSERT INTO message_item_hidden_for_users (message_item_id, user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP
      `,
      [appointmentId, req.user.id]
    );

    return res.json({ ok: true, appointmentId: String(appointmentId) });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Hide appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/appointments/:appointmentId/recall', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: '无效预约ID' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        mi.sender_user_id,
        COALESCE(ast.status, 'pending') AS appointment_status
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      `,
      [appointmentId, req.user.id, req.user.id]
    );

    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: '预约不存在或无权限' });
    }

    if (Number(row.sender_user_id) !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '只能撤回自己发送的消息' });
    }

    const status = normalizeDecisionStatus(row.appointment_status) || 'pending';
    if (status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: '对方已响应该消息，无法撤回' });
    }

    await conn.execute('DELETE FROM message_items WHERE id = ? LIMIT 1', [appointmentId]);

    const threadId = Number(row.thread_id);
    const [latestRows] = await conn.execute<any[]>(
      `
      SELECT id, created_at
      FROM message_items
      WHERE thread_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [threadId]
    );
    const latest = latestRows?.[0];

    if (latest) {
      await conn.execute(
        `
        UPDATE message_threads
        SET last_message_id = ?, last_message_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [Number(latest.id), latest.created_at || null, threadId]
      );
    } else {
      await conn.execute(
        `
        UPDATE message_threads
        SET last_message_id = NULL, last_message_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [threadId]
      );
    }

    await conn.commit();
    return res.json({ ok: true, appointmentId: String(appointmentId) });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Recall appointment message error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.get('/threads/:threadId/availability', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

  try {
    const threadRows = await query<any[]>(
      `
      SELECT id, student_user_id, mentor_user_id
      FROM message_threads
      WHERE id = ? AND (student_user_id = ? OR mentor_user_id = ?)
      LIMIT 1
      `,
      [threadId, req.user.id, req.user.id]
    );

    const thread = threadRows?.[0];
    if (!thread) return res.status(404).json({ error: '会话不存在或无权限' });

    const studentUserId = Number(thread?.student_user_id);
    const mentorUserId = Number(thread?.mentor_user_id);
    if (!Number.isFinite(studentUserId) || studentUserId <= 0 || !Number.isFinite(mentorUserId) || mentorUserId <= 0) {
      return res.status(404).json({ error: '会话参与者无效' });
    }

    const mentorProfileRows = await query<any[]>(
      'SELECT timezone FROM mentor_profiles WHERE user_id = ? LIMIT 1',
      [mentorUserId]
    ).catch(() => []);
    const mentorFallbackTimeZone = typeof mentorProfileRows?.[0]?.timezone === 'string' && mentorProfileRows[0].timezone.trim()
      ? mentorProfileRows[0].timezone.trim()
      : 'Asia/Shanghai';

    const studentAvailability = await fetchAccountAvailabilityForUser(studentUserId, 'Asia/Shanghai');
    const mentorAvailability = await fetchAccountAvailabilityForUser(mentorUserId, mentorFallbackTimeZone);
    const busySelectionsByUser = await getBusySelectionsForUsers(
      [studentUserId, mentorUserId],
      new Map<number, string>([
        [studentUserId, studentAvailability.timeZone],
        [mentorUserId, mentorAvailability.timeZone],
      ])
    );

    return res.json({
      threadId: String(threadId),
      studentAvailability,
      mentorAvailability,
      studentBusySelections: busySelectionsByUser.get(studentUserId) || {},
      mentorBusySelections: busySelectionsByUser.get(mentorUserId) || {},
    });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch thread availability error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/unread-summary', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const rows = await query<any[]>(
      `
      SELECT COUNT(*) AS unread_count
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN message_item_hidden_for_users mihfu
        ON mihfu.message_item_id = mi.id
       AND mihfu.user_id = ?
      LEFT JOIN message_item_reads mir
        ON mir.message_item_id = mi.id
       AND mir.user_id = ?
      WHERE (t.student_user_id = ? OR t.mentor_user_id = ?)
        AND mi.sender_user_id <> ?
        AND mihfu.message_item_id IS NULL
        AND mir.message_item_id IS NULL
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    return res.json({
      totalUnreadCount: Math.max(0, Number(rows?.[0]?.unread_count || 0)),
    });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch unread summary error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/read', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const rawMessageIds = Array.isArray((req.body as any)?.messageIds) ? (req.body as any).messageIds : [];
  const messageIds = Array.from(
    new Set(
      rawMessageIds
        .map((value: unknown) => toPositiveIntOrNull(value))
        .filter((value: number | null): value is number => value != null)
    )
  ).slice(0, 100);

  if (messageIds.length === 0) {
    return res.json({ readMessageIds: [] });
  }

  const placeholders = messageIds.map(() => '?').join(',');

  try {
    const eligibleRows = await query<any[]>(
      `
      SELECT mi.id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN message_item_hidden_for_users mihfu
        ON mihfu.message_item_id = mi.id
       AND mihfu.user_id = ?
      WHERE mi.id IN (${placeholders})
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
        AND mi.sender_user_id <> ?
        AND mihfu.message_item_id IS NULL
      `,
      [req.user.id, ...messageIds, req.user.id, req.user.id, req.user.id]
    );

    const readableIds = Array.from(
      new Set(
        (eligibleRows || [])
          .map((row) => toPositiveIntOrNull(row?.id))
          .filter((value: number | null): value is number => value != null)
      )
    );

    if (readableIds.length === 0) {
      return res.json({ readMessageIds: [] });
    }

    const valuesSql = readableIds.map(() => '(?, ?)').join(',');
    const params = readableIds.flatMap((messageId) => [messageId, req.user!.id]);

    await query<InsertResult>(
      `
      INSERT IGNORE INTO message_item_reads (message_item_id, user_id)
      VALUES ${valuesSql}
      `,
      params
    );

    return res.json({
      readMessageIds: readableIds.map((id) => String(id)),
    });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Mark messages read error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/threads', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const rows = await query<any[]>(
      `
      SELECT
        t.id AS thread_id,
        t.student_user_id,
        t.mentor_user_id,
        t.last_message_at,
        t.updated_at,
        m.sender_user_id,
        m.payload_json,
        su.username AS student_username,
        srole.public_id AS student_public_id,
        sas.student_avatar_url AS student_avatar_url,
        mu.username AS mentor_username,
        mrole.public_id AS mentor_public_id,
        mp.display_name AS mentor_display_name,
        mp.avatar_url AS mentor_avatar_url
      FROM message_threads t
      LEFT JOIN message_items m ON m.id = t.last_message_id
      LEFT JOIN users su ON su.id = t.student_user_id
      LEFT JOIN user_roles srole ON srole.user_id = t.student_user_id AND srole.role = 'student'
      LEFT JOIN account_settings sas ON sas.user_id = t.student_user_id
      LEFT JOIN users mu ON mu.id = t.mentor_user_id
      LEFT JOIN user_roles mrole ON mrole.user_id = t.mentor_user_id AND mrole.role = 'mentor'
      LEFT JOIN mentor_profiles mp ON mp.user_id = t.mentor_user_id
      WHERE t.student_user_id = ? OR t.mentor_user_id = ?
      ORDER BY COALESCE(t.last_message_at, t.updated_at) DESC
      LIMIT 100
      `,
      [req.user.id, req.user.id]
    );

    const threadParticipantsById = new Map<string, { studentUserId: number; mentorUserId: number }>();

    const threads = (rows || []).map((r) => {
      const threadId = String(r.thread_id);
      const studentUserId = Number(r.student_user_id);
      const mentorUserId = Number(r.mentor_user_id);
      if (Number.isFinite(studentUserId) && studentUserId > 0 && Number.isFinite(mentorUserId) && mentorUserId > 0) {
        threadParticipantsById.set(threadId, { studentUserId, mentorUserId });
      }

      const isStudentSide = Number(r.student_user_id) === req.user!.id;
      const myRole = isStudentSide ? 'student' : 'mentor';
      const counterpart = isStudentSide
        ? String(r.mentor_display_name || r.mentor_username || r.mentor_public_id || '导师')
        : String(r.student_username || r.student_public_id || '学生');
      const counterpartId = isStudentSide ? '' : String(r.student_public_id || '');
      const counterpartAvatarUrl = isStudentSide
        ? String(r.mentor_avatar_url || '')
        : String(r.student_avatar_url || '');

      const lastAt = r.last_message_at || r.updated_at;

      return {
        id: threadId,
        subject: '日程',
        myRole,
        counterpart,
        counterpartId,
        counterpartAvatarUrl,
        time: lastAt ? new Date(lastAt).toISOString() : '',
        courseDirectionId: '',
        courseTypeId: '',
        schedule: null,
        scheduleHistory: [] as any[],
        decisionMessages: [] as any[],
        latestDecision: null as any,
        lessonHourConfirmations: [] as any[],
        latestLessonHoursConfirmation: null as any,
        messages: [],
        unreadCount: 0,
      };
    });

    const threadIds = threads
      .map((t) => String(t.id || '').trim())
      .filter((id) => id);

    let hiddenAppointmentIds = new Set<number>();

    if (threadIds.length > 0) {
      const placeholders = threadIds.map(() => '?').join(',');

      const unreadCountRows = await query<any[]>(
        `
        SELECT mi.thread_id, COUNT(*) AS unread_count
        FROM message_items mi
        LEFT JOIN message_item_hidden_for_users mihfu
          ON mihfu.message_item_id = mi.id
         AND mihfu.user_id = ?
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.sender_user_id <> ?
          AND mihfu.message_item_id IS NULL
          AND mir.message_item_id IS NULL
        GROUP BY mi.thread_id
        `,
        [req.user.id, req.user.id, ...threadIds, req.user.id]
      );

      const unreadCountByThread = new Map<string, number>(
        (unreadCountRows || []).map((row) => [
          String(row?.thread_id || ''),
          Math.max(0, Number(row?.unread_count || 0)),
        ])
      );

      for (const thread of threads) {
        thread.unreadCount = unreadCountByThread.get(String(thread.id)) || 0;
      }

      const hiddenRows = await query<any[]>(
        `
        SELECT message_item_id
        FROM message_item_hidden_for_users
        WHERE user_id = ?
        `,
        [req.user.id]
      );
      hiddenAppointmentIds = new Set<number>(
        (hiddenRows || [])
          .map((row) => toPositiveIntOrNull(row?.message_item_id))
          .filter((id): id is number => id != null)
      );

      const decisionRows = await query<any[]>(
        `
        SELECT
          mi.id,
          mi.thread_id,
          mi.sender_user_id,
          mi.payload_json,
          mi.created_at,
          CASE
            WHEN mi.sender_user_id = ? THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_decision'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, ...threadIds]
      );

      const decisionByThread = new Map<string, any[]>();
      for (const row of decisionRows || []) {
        const tid = String(row?.thread_id || '').trim();
        if (!tid) continue;
        if (!decisionByThread.has(tid)) decisionByThread.set(tid, []);
        decisionByThread.get(tid)!.push(row);
      }

      const lessonHourRows = await query<any[]>(
        `
        SELECT
          mi.id,
          mi.thread_id,
          mi.sender_user_id,
          mi.payload_json,
          mi.created_at,
          lhc.course_session_id,
          lhc.proposed_hours,
          lhc.final_hours,
          lhc.status AS confirmation_status,
          cs.starts_at AS course_starts_at,
          CASE
            WHEN mi.sender_user_id = ? THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        INNER JOIN lesson_hour_confirmations lhc
          ON lhc.message_item_id = mi.id
        LEFT JOIN course_sessions cs
          ON cs.id = lhc.course_session_id
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'lesson_hours_confirmation'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, ...threadIds]
      );

      const lessonHourByThread = new Map<string, any[]>();
      for (const row of lessonHourRows || []) {
        const tid = String(row?.thread_id || '').trim();
        if (!tid) continue;
        if (!lessonHourByThread.has(tid)) lessonHourByThread.set(tid, []);
        lessonHourByThread.get(tid)!.push(row);
      }

      const items = await query<any[]>(
        `
        SELECT
          mi.id,
          mi.thread_id,
          mi.sender_user_id,
          mi.payload_json,
          mi.created_at,
          COALESCE(ast.status, 'pending') AS appointment_status
          ,
          CASE
            WHEN mi.sender_user_id = ? THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_card'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, ...threadIds]
      );

      const courseSessionLookup = new Map<string, string>();
      const pairParams: number[] = [];
      const pairClauses: string[] = [];
      const seenPairs = new Set<string>();

      for (const threadId of threadIds) {
        const participants = threadParticipantsById.get(String(threadId));
        if (!participants) continue;
        const pairKey = `${participants.studentUserId}:${participants.mentorUserId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        pairClauses.push('(student_user_id = ? AND mentor_user_id = ?)');
        pairParams.push(participants.studentUserId, participants.mentorUserId);
      }

      if (pairClauses.length > 0) {
        const sessionRows = await query<CourseSessionLookupRow[]>(
          `
          SELECT id, student_user_id, mentor_user_id, starts_at
          FROM course_sessions
          WHERE ${pairClauses.join(' OR ')}
          `,
          pairParams
        );

        for (const sessionRow of sessionRows || []) {
          const lookupKey = buildCourseSessionLookupKey(
            Number(sessionRow?.student_user_id),
            Number(sessionRow?.mentor_user_id),
            normalizeCourseSessionStartsAt(sessionRow?.starts_at)
          );
          const sessionId = toPositiveIntOrNull(sessionRow?.id);
          if (!lookupKey || sessionId == null) continue;
          if (!courseSessionLookup.has(lookupKey)) {
            courseSessionLookup.set(lookupKey, String(sessionId));
          }
        }
      }

      const byThread = new Map<string, any[]>();
      for (const row of items || []) {
        const appointmentId = toPositiveIntOrNull(row?.id);
        if (appointmentId != null && hiddenAppointmentIds.has(appointmentId)) continue;
        const tid = String(row?.thread_id || '').trim();
        if (!tid) continue;
        if (!byThread.has(tid)) byThread.set(tid, []);
        byThread.get(tid)!.push(row);
      }

      const threadMap = new Map<string, any>();
      for (const t of threads) threadMap.set(String(t.id), t);

      for (const [tid, rowsForThread] of byThread.entries()) {
        const thread = threadMap.get(tid);
        if (!thread) continue;

        const MAX_PER_THREAD = 30;
        const recentRows = rowsForThread.length > MAX_PER_THREAD
          ? rowsForThread.slice(-MAX_PER_THREAD)
          : rowsForThread;

        const participants = threadParticipantsById.get(String(tid));
        const cards = recentRows
          .map(async (row) => {
            const card = toScheduleCard(row, req.user!.id);
            if (!card || !participants) return card;

            const payload = parseAppointmentPayload(row?.payload_json);
            const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
            const parsed = parseCourseWindowText(payload?.windowText, createdAt);
            const lookupKey = parsed
              ? buildCourseSessionLookupKey(
                participants.studentUserId,
                participants.mentorUserId,
                formatUtcDatetime(parsed.startsAtUtc)
              )
              : '';
            let courseSessionId = lookupKey ? courseSessionLookup.get(lookupKey) || '' : '';

            if (!courseSessionId && card.status === 'accepted') {
              courseSessionId = await ensureCourseSessionForAcceptedAppointment({
                studentUserId: participants.studentUserId,
                mentorUserId: participants.mentorUserId,
                payload,
                createdAt,
              });
              if (lookupKey && courseSessionId) {
                courseSessionLookup.set(lookupKey, courseSessionId);
              }
            }

            return {
              ...card,
              courseSessionId,
            };
          })
        const resolvedCards = (await Promise.all(cards)).filter(Boolean) as any[];

        if (resolvedCards.length === 0) continue;

        const last = resolvedCards[resolvedCards.length - 1];
        const history = resolvedCards.slice(0, -1);

        thread.schedule = last;
        thread.scheduleHistory = history;
        thread.courseDirectionId = String(last.courseDirectionId || '');
        thread.courseTypeId = String(last.courseTypeId || '');
      }

      for (const t of threads) {
        const rowsForThread = decisionByThread.get(String(t.id)) || [];
        if (!rowsForThread.length) continue;

        const MAX_PER_THREAD = 30;
        const recentRows = rowsForThread.length > MAX_PER_THREAD
          ? rowsForThread.slice(-MAX_PER_THREAD)
          : rowsForThread;

        const decisionMessages = recentRows
          .map((row) => {
            const payload = parseAppointmentDecisionPayload(row?.payload_json);
            if (!payload) return null;

            const status = normalizeDecisionStatus(payload.status);
            if (!status) return null;

            const appointmentIdRaw = payload.appointmentId;
            const appointmentIdNum = toPositiveIntOrNull(appointmentIdRaw);
            if (appointmentIdNum != null && hiddenAppointmentIds.has(appointmentIdNum)) return null;
            const appointmentIdText = typeof appointmentIdRaw === 'string'
              ? appointmentIdRaw.trim()
              : (appointmentIdRaw == null ? '' : String(appointmentIdRaw).trim());

            return {
              id: String(row?.id || ''),
              appointmentId: appointmentIdNum != null ? String(appointmentIdNum) : appointmentIdText,
              status,
              time: row?.created_at ? new Date(row.created_at).toISOString() : '',
              isByMe: Number(row?.sender_user_id) === req.user!.id,
              isRead: Number(row?.is_read_by_me) === 1,
            };
          })
          .filter(Boolean) as any[];

        t.decisionMessages = decisionMessages;

        const latestDecision = decisionMessages[decisionMessages.length - 1];
        if (latestDecision) {
          t.latestDecision = {
            status: latestDecision.status,
            time: latestDecision.time,
            isByMe: latestDecision.isByMe,
          };
        }
      }

      for (const t of threads) {
        const rowsForThread = lessonHourByThread.get(String(t.id)) || [];
        if (!rowsForThread.length) continue;

        const MAX_PER_THREAD = 30;
        const recentRows = rowsForThread.length > MAX_PER_THREAD
          ? rowsForThread.slice(-MAX_PER_THREAD)
          : rowsForThread;

        const lessonHourConfirmations = recentRows
          .map((row) => {
            const card = toLessonHoursConfirmationCard(row, req.user!.id);
            if (!card) return null;

            const cardId = toPositiveIntOrNull(card.id);
            if (cardId != null && hiddenAppointmentIds.has(cardId)) return null;
            return card;
          })
          .filter(Boolean) as any[];

        t.lessonHourConfirmations = lessonHourConfirmations;
        t.latestLessonHoursConfirmation = lessonHourConfirmations[lessonHourConfirmations.length - 1] || null;
      }
    }

    const totalUnreadCount = threads.reduce((sum, thread) => sum + Math.max(0, Number(thread?.unreadCount || 0)), 0);

    return res.json({ threads, totalUnreadCount });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch message threads error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
