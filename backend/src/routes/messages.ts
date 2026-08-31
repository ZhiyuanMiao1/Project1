import express, { Request, Response } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import type { InsertResult } from '../db';
import { pool, query } from '../db';
import { requireAuth } from '../middleware/auth';
import { buildEmptyAvailability, getBusySelectionsForUsers } from '../services/availabilityBusy';
import {
  getEmailNotificationPreferencesForUser,
  getPublicAppUrl,
  sendAppointmentNotificationMail,
} from '../services/mailService';
import {
  ensureMentorResponseTimeColumn,
  recomputeMentorResponseTimeAverage,
} from '../services/mentorResponseTime';
import {
  ensureMentorRecommendationColumns,
  recomputeMentorCompletedSessionCount,
  touchMentorLastReplied,
  touchMentorLastRepliedWithConnection,
} from '../services/mentorRecommendation';
import { isWalletHoursError } from '../services/walletHours';
import { getLessonHoursAutoConfirmAt } from '../services/lessonHoursAutoConfirmation';
import {
  ensureLessonHourReservationSchema,
  releaseLessonHoursReservation,
  reserveLessonHours,
  settleLessonHours,
} from '../services/lessonHourReservations';

const router = express.Router();

let appointmentLifecycleSchemaPromise: Promise<void> | null = null;
const ensureAppointmentLifecycleStatuses = async () => {
  if (!appointmentLifecycleSchemaPromise) {
    appointmentLifecycleSchemaPromise = query(
      `
      ALTER TABLE appointment_statuses
      MODIFY COLUMN status ENUM(
        'pending',
        'accepted',
        'rejected',
        'rescheduling',
        'cancelled',
        'not_held_pending',
        'not_held'
      ) NOT NULL DEFAULT 'pending'
      `
    )
      .then(() => undefined)
      .catch((error) => {
        appointmentLifecycleSchemaPromise = null;
        throw error;
      });
  }
  return appointmentLifecycleSchemaPromise;
};

const isMissingMessagesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return (
    message.includes('message_threads')
    || message.includes('message_thread_stars')
    || message.includes('message_thread_archives')
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

const THREAD_VISIBLE_AFTER_ARCHIVE_SQL = `
  (
    mta.thread_id IS NULL
    OR (
      t.last_message_id IS NOT NULL
      AND (
        mta.archived_after_message_id IS NULL
        OR t.last_message_id > mta.archived_after_message_id
      )
    )
  )
`;

const MESSAGE_VISIBLE_AFTER_ARCHIVE_SQL = `
  (
    mta.thread_id IS NULL
    OR mta.archived_after_message_id IS NULL
    OR mi.id > mta.archived_after_message_id
  )
`;

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
  intent?: unknown;
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
  const courseRequestId = toPositiveIntOrNull(payload.courseRequestId);
  const rawStatus = typeof row?.appointment_status === 'string'
    ? row.appointment_status.trim().toLowerCase()
    : '';
  const normalizedStatus =
    rawStatus === 'accepted'
      || rawStatus === 'rejected'
      || rawStatus === 'rescheduling'
      || rawStatus === 'pending'
      || rawStatus === 'cancelled'
      || rawStatus === 'not_held_pending'
      || rawStatus === 'not_held'
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
    statusUpdatedByMe: Number(row?.appointment_status_updated_by_user_id) === currentUserId,
    canRecall: Number(row?.sender_user_id) === currentUserId && normalizedStatus === 'pending',
    isRead: Number(row?.is_read_by_me) === 1,
    courseDirectionId: typeof payload.courseDirectionId === 'string' ? payload.courseDirectionId : '',
    courseTypeId: typeof payload.courseTypeId === 'string' ? payload.courseTypeId : '',
    courseRequestId: courseRequestId == null ? '' : String(courseRequestId),
  };
};

const toLessonHoursConfirmationCard = (row: any, currentUserId: number) => {
  const payload = parseLessonHoursConfirmationPayload(row?.payload_json);
  if (!payload) return null;

  const status = normalizeLessonHoursConfirmationStatus(row?.confirmation_status) || 'pending';
  const courseSessionId = toPositiveIntOrNull(row?.course_session_id);
  const proposedHours = Number.parseFloat(String(row?.proposed_hours ?? payload?.proposedHours ?? ''));
  if (!Number.isFinite(proposedHours) || proposedHours <= 0) return null;

  const disputedHoursRaw = Number.parseFloat(String(row?.disputed_hours ?? ''));
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
    disputedHours: Number.isFinite(disputedHoursRaw) && disputedHoursRaw > 0 ? Number(disputedHoursRaw.toFixed(2)) : null,
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
  if (
    raw === 'accepted'
    || raw === 'rejected'
    || raw === 'rescheduling'
    || raw === 'pending'
    || raw === 'cancelled'
    || raw === 'not_held_pending'
    || raw === 'not_held'
  ) return raw;
  return '';
};

const normalizeLessonHoursConfirmationStatus = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    raw === 'pending'
    || raw === 'confirmed'
    || raw === 'disputed'
    || raw === 'dispute_confirmed'
    || raw === 'platform_review'
  ) return raw;
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

const createLessonHoursConfirmationMessage = async (
  conn: PoolConnection,
  {
    threadId,
    senderUserId,
    courseSessionId,
    studentUserId,
    mentorUserId,
    proposedHours,
    startsAt,
    courseDirectionId,
    courseTypeId,
  }: {
    threadId: number;
    senderUserId: number;
    courseSessionId: number;
    studentUserId: number;
    mentorUserId: number;
    proposedHours: number;
    startsAt: string;
    courseDirectionId: string;
    courseTypeId: string;
  }
) => {
  const nextPayload = {
    kind: 'lesson_hours_confirmation',
    courseSessionId: String(courseSessionId),
    proposedHours,
    startsAt,
    courseDirectionId,
    courseTypeId,
  };

  const [messageInsert] = await conn.execute<InsertResult>(
    `
    INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
    VALUES (?, ?, 'lesson_hours_confirmation', ?)
    `,
    [threadId, senderUserId, JSON.stringify(nextPayload)]
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
      threadId,
      courseSessionId,
      studentUserId,
      mentorUserId,
      proposedHours,
    ]
  );

  return nextMessageId;
};

const hideMessageForUsers = async (conn: PoolConnection, messageItemId: number, userIds: number[]) => {
  for (const userId of userIds) {
    if (!Number.isFinite(userId) || userId <= 0) continue;
    await conn.execute(
      `
      INSERT INTO message_item_hidden_for_users (message_item_id, user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP
      `,
      [messageItemId, userId]
    );
  }
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
  await touchMentorLastRepliedWithConnection(conn, mentorUserId);
  if (senderUserId !== studentUserId) return;
  await recomputeMentorResponseTimeAverage(conn, mentorUserId);
};

const toPositiveIntOrNull = (value: unknown) => {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

type RestoredAppointmentStatus = 'pending' | 'accepted' | 'rejected';

const resolveRestoredAppointmentStatus = async (
  conn: PoolConnection,
  threadId: number,
  appointmentId: number
): Promise<RestoredAppointmentStatus> => {
  const [decisionRows] = await conn.execute<any[]>(
    `
    SELECT payload_json
    FROM message_items
    WHERE thread_id = ?
      AND message_type = 'appointment_decision'
    ORDER BY id DESC
    LIMIT 100
    `,
    [threadId]
  );

  const appointmentIdText = String(appointmentId);
  for (const decisionRow of decisionRows || []) {
    const decision = parseAppointmentDecisionPayload(decisionRow?.payload_json);
    if (!decision) continue;
    const decisionAppointmentId = safeText(decision.appointmentId)
      || (decision.appointmentId == null ? '' : String(decision.appointmentId).trim());
    if (decisionAppointmentId !== appointmentIdText) continue;

    const status = normalizeDecisionStatus(decision.status);
    if (status === 'accepted' || status === 'rejected') return status;
  }

  return 'pending';
};

const findFallbackRescheduleSourceAppointmentId = async (
  conn: PoolConnection,
  {
    threadId,
    recalledAppointmentId,
    recalledPayload,
  }: {
    threadId: number;
    recalledAppointmentId: number;
    recalledPayload: AppointmentPayload | null;
  }
) => {
  const [candidateRows] = await conn.execute<any[]>(
    `
    SELECT mi.id, mi.payload_json
    FROM message_items mi
    INNER JOIN appointment_statuses ast
      ON ast.appointment_message_id = mi.id
     AND ast.status = 'rescheduling'
    WHERE mi.thread_id = ?
      AND mi.id < ?
      AND mi.message_type = 'appointment_card'
    ORDER BY mi.id DESC
    LIMIT 20
    `,
    [threadId, recalledAppointmentId]
  );

  const recalledDirectionId = safeText(recalledPayload?.courseDirectionId);
  const recalledTypeId = safeText(recalledPayload?.courseTypeId);
  for (const candidateRow of candidateRows || []) {
    const candidateId = toPositiveIntOrNull(candidateRow?.id);
    if (candidateId == null) continue;

    const candidatePayload = parseAppointmentPayload(candidateRow?.payload_json);
    if (recalledDirectionId && safeText(candidatePayload?.courseDirectionId) !== recalledDirectionId) continue;
    if (recalledTypeId && safeText(candidatePayload?.courseTypeId) !== recalledTypeId) continue;
    return candidateId;
  }

  return null;
};

const restoreRescheduleSourceAfterRecall = async (
  conn: PoolConnection,
  row: any,
  recalledAppointmentId: number
) => {
  const threadId = Number(row?.thread_id);
  if (!Number.isFinite(threadId) || threadId <= 0) return;

  const recalledPayload = parseAppointmentPayload(row?.payload_json);
  let sourceAppointmentId = toPositiveIntOrNull(recalledPayload?.sourceAppointmentId);
  if (sourceAppointmentId == null) {
    sourceAppointmentId = await findFallbackRescheduleSourceAppointmentId(conn, {
      threadId,
      recalledAppointmentId,
      recalledPayload,
    });
  }
  if (sourceAppointmentId == null || sourceAppointmentId === recalledAppointmentId) return;

  const [sourceRows] = await conn.execute<any[]>(
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
      AND mi.thread_id = ?
      AND mi.message_type = 'appointment_card'
    LIMIT 1
    `,
    [sourceAppointmentId, threadId]
  );

  const sourceRow = sourceRows?.[0];
  if (!sourceRow) return;
  const sourceStatus = normalizeDecisionStatus(sourceRow.appointment_status) || 'pending';
  if (sourceStatus !== 'rescheduling') return;

  const restoredStatus = await resolveRestoredAppointmentStatus(conn, threadId, sourceAppointmentId);
  if (restoredStatus === 'pending') {
    await conn.execute(
      'DELETE FROM appointment_statuses WHERE appointment_message_id = ? LIMIT 1',
      [sourceAppointmentId]
    );
    return;
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
    [sourceAppointmentId, restoredStatus, row.sender_user_id]
  );

  await syncCourseSessionForAppointmentDecision(conn, sourceRow, restoredStatus);
};

const applyExplicitRescheduleSourceStatuses = async (rowsForThread: any[]) => {
  const cancelledChainUpdates = new Map<number, number>();
  const rescheduleSourceUpdates = new Map<number, number>();
  const statusByAppointmentId = new Map<number, string>();
  const rowByAppointmentId = new Map<number, any>();
  const rescheduleChildrenBySourceId = new Map<number, Set<number>>();
  const rescheduleNeighborsByAppointmentId = new Map<number, Set<number>>();
  const explicitCancelledAppointmentIds = new Set<number>();

  for (const row of rowsForThread || []) {
    const appointmentId = toPositiveIntOrNull(row?.id);
    if (appointmentId == null) continue;
    statusByAppointmentId.set(appointmentId, normalizeDecisionStatus(row?.appointment_status) || 'pending');
    rowByAppointmentId.set(appointmentId, row);
  }

  const addNeighbor = (fromId: number, toId: number) => {
    if (!rescheduleNeighborsByAppointmentId.has(fromId)) {
      rescheduleNeighborsByAppointmentId.set(fromId, new Set<number>());
    }
    rescheduleNeighborsByAppointmentId.get(fromId)?.add(toId);
  };

  for (const row of rowsForThread || []) {
    const decisionPayload = parseAppointmentDecisionPayload(row?.payload_json);
    const decisionAppointmentId = toPositiveIntOrNull(decisionPayload?.appointmentId);
    if (
      normalizeDecisionStatus(decisionPayload?.status) === 'cancelled'
      && decisionAppointmentId != null
    ) {
      explicitCancelledAppointmentIds.add(decisionAppointmentId);
    }

    const payload = parseAppointmentPayload(row?.payload_json);
    if (!payload) continue;

    if (safeText(payload.intent).toLowerCase() !== 'reschedule') continue;
    const sourceAppointmentId = toPositiveIntOrNull(payload.sourceAppointmentId);
    const appointmentId = toPositiveIntOrNull(row?.id);
    if (
      sourceAppointmentId == null
      || appointmentId == null
      || sourceAppointmentId === appointmentId
      || !statusByAppointmentId.has(sourceAppointmentId)
    ) continue;

    if (!rescheduleChildrenBySourceId.has(sourceAppointmentId)) {
      rescheduleChildrenBySourceId.set(sourceAppointmentId, new Set<number>());
    }
    rescheduleChildrenBySourceId.get(sourceAppointmentId)?.add(appointmentId);
    addNeighbor(sourceAppointmentId, appointmentId);
    addNeighbor(appointmentId, sourceAppointmentId);
  }

  // Older cancellations only updated the currently accepted card. Repair those
  // histories when the terminal card in a reschedule chain is cancelled. A
  // cancelled non-terminal card is normal after a successful reschedule and
  // must not cancel its accepted replacement.
  const visitedAppointmentIds = new Set<number>();
  for (const seedAppointmentId of rescheduleNeighborsByAppointmentId.keys()) {
    if (visitedAppointmentIds.has(seedAppointmentId)) continue;

    const componentIds: number[] = [];
    const pendingIds = [seedAppointmentId];
    visitedAppointmentIds.add(seedAppointmentId);
    while (pendingIds.length > 0) {
      const appointmentId = pendingIds.pop();
      if (appointmentId == null) continue;
      componentIds.push(appointmentId);
      for (const neighborId of rescheduleNeighborsByAppointmentId.get(appointmentId) || []) {
        if (visitedAppointmentIds.has(neighborId)) continue;
        visitedAppointmentIds.add(neighborId);
        pendingIds.push(neighborId);
      }
    }

    const explicitlyCancelled = componentIds.some((appointmentId) => (
      explicitCancelledAppointmentIds.has(appointmentId)
    ));
    const cancelledTerminalId = componentIds.find((appointmentId) => (
      (rescheduleChildrenBySourceId.get(appointmentId)?.size || 0) === 0
      && statusByAppointmentId.get(appointmentId) === 'cancelled'
    ));
    if (!explicitlyCancelled && cancelledTerminalId == null) continue;

    const cancelledAnchorId = componentIds.find((appointmentId) => (
      explicitCancelledAppointmentIds.has(appointmentId)
      || appointmentId === cancelledTerminalId
    ));
    const cancelledAnchorRow = cancelledAnchorId == null
      ? null
      : rowByAppointmentId.get(cancelledAnchorId);
    const updatedByUserId = toPositiveIntOrNull(cancelledAnchorRow?.appointment_status_updated_by_user_id)
      || toPositiveIntOrNull(cancelledAnchorRow?.sender_user_id)
      || componentIds
        .map((appointmentId) => rowByAppointmentId.get(appointmentId))
        .map((row) => toPositiveIntOrNull(row?.appointment_status_updated_by_user_id)
          || toPositiveIntOrNull(row?.sender_user_id))
        .find((userId) => userId != null)
      || null;
    if (updatedByUserId == null) continue;

    for (const appointmentId of componentIds) {
      if (statusByAppointmentId.get(appointmentId) === 'cancelled') continue;
      cancelledChainUpdates.set(appointmentId, updatedByUserId);
      statusByAppointmentId.set(appointmentId, 'cancelled');
    }
  }

  for (const [appointmentId, updatedByUserId] of cancelledChainUpdates.entries()) {
    await query(
      `
      INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
      VALUES (?, 'cancelled', ?)
      ON DUPLICATE KEY UPDATE
        status = 'cancelled',
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [appointmentId, updatedByUserId]
    );
  }

  for (const row of rowsForThread || []) {
    const payload = parseAppointmentPayload(row?.payload_json);
    if (!payload) continue;
    const sourceAppointmentId = toPositiveIntOrNull(payload.sourceAppointmentId);
    const appointmentId = toPositiveIntOrNull(row?.id);
    const updatedByUserId = toPositiveIntOrNull(row?.sender_user_id);
    const childStatus = appointmentId == null
      ? 'pending'
      : (statusByAppointmentId.get(appointmentId) || 'pending');

    if (sourceAppointmentId != null && sourceAppointmentId !== appointmentId) {
      const sourceStatus = statusByAppointmentId.get(sourceAppointmentId) || 'pending';
      if (
        safeText(payload.intent).toLowerCase() === 'reschedule'
        && updatedByUserId != null
        && (childStatus === 'pending' || childStatus === 'rejected' || childStatus === 'rescheduling')
        && (sourceStatus === 'pending' || sourceStatus === 'rescheduling')
      ) {
        rescheduleSourceUpdates.set(sourceAppointmentId, updatedByUserId);
      }
      continue;
    }
  }

  for (const [sourceAppointmentId, updatedByUserId] of rescheduleSourceUpdates.entries()) {
    await query(
      `
      INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
      VALUES (?, 'rescheduling', ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP
      `,
      [sourceAppointmentId, updatedByUserId]
    );
  }

  if (cancelledChainUpdates.size === 0 && rescheduleSourceUpdates.size === 0) {
    return rowsForThread || [];
  }

  return (rowsForThread || []).map((row) => {
    const appointmentId = toPositiveIntOrNull(row?.id);
    if (appointmentId == null) return row;
    if (cancelledChainUpdates.has(appointmentId)) {
      return {
        ...row,
        appointment_status: 'cancelled',
      };
    }
    if (!rescheduleSourceUpdates.has(appointmentId)) return row;
    return {
      ...row,
      appointment_status: 'rescheduling',
    };
  });
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
  if (sessionStatus === 'completed') {
    await ensureMentorRecommendationColumns();
    const conn = await pool.getConnection();
    try {
      await recomputeMentorCompletedSessionCount(conn, mentorUserId);
    } finally {
      conn.release();
    }
  }
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

const markCourseRequestPairedForAcceptedAppointment = async (
  conn: PoolConnection,
  payload: AppointmentPayload | null,
  studentUserId: number
) => {
  const courseRequestId = toPositiveIntOrNull(payload?.courseRequestId);
  if (courseRequestId == null) return;
  if (!Number.isFinite(studentUserId) || studentUserId <= 0) return;

  await conn.execute(
    `
    UPDATE course_requests
    SET status = 'paired',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
      AND status = 'submitted'
    `,
    [courseRequestId, studentUserId]
  );
};

const reopenCourseRequestIfNoActiveAppointment = async (
  conn: PoolConnection,
  payload: AppointmentPayload | null,
  studentUserId: number
) => {
  const courseRequestId = toPositiveIntOrNull(payload?.courseRequestId);
  if (courseRequestId == null || !Number.isFinite(studentUserId) || studentUserId <= 0) return;

  const [activeRows] = await conn.execute<any[]>(
    `
    SELECT mi.id
    FROM message_items mi
    INNER JOIN message_threads mt
      ON mt.id = mi.thread_id
     AND mt.student_user_id = ?
    INNER JOIN appointment_statuses ast
      ON ast.appointment_message_id = mi.id
     AND ast.status IN ('accepted', 'rescheduling', 'not_held_pending')
    WHERE mi.message_type = 'appointment_card'
      AND JSON_UNQUOTE(
        CASE
          WHEN JSON_VALID(mi.payload_json) THEN JSON_EXTRACT(mi.payload_json, '$.courseRequestId')
          ELSE NULL
        END
      ) = CAST(? AS CHAR)
    LIMIT 1
    `,
    [studentUserId, courseRequestId]
  );
  if (activeRows?.[0]) return;

  await conn.execute(
    `
    UPDATE course_requests
    SET status = 'submitted',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
      AND status = 'paired'
    `,
    [courseRequestId, studentUserId]
  );
};

const getAppointmentCourseWindow = (row: any) => {
  const payload = parseAppointmentPayload(row?.payload_json);
  if (!payload) return null;
  const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
  const parsed = parseCourseWindowText(payload.windowText, createdAt);
  if (!parsed) return null;
  return {
    payload,
    startsAt: formatUtcDatetime(parsed.startsAtUtc),
    startsAtMs: parsed.startsAtUtc.getTime(),
  };
};

const cancelAppointmentCourseSession = async (conn: PoolConnection, row: any) => {
  const window = getAppointmentCourseWindow(row);
  if (!window) return;

  const [sessionRows] = await conn.execute<any[]>(
    `
    SELECT id
    FROM course_sessions
    WHERE student_user_id = ?
      AND mentor_user_id = ?
      AND starts_at = ?
    LIMIT 1
    FOR UPDATE
    `,
    [Number(row.student_user_id), Number(row.mentor_user_id), window.startsAt]
  );
  const sessionId = toPositiveIntOrNull(sessionRows?.[0]?.id);
  if (sessionId == null) return;

  const [confirmationRows] = await conn.execute<any[]>(
    `
    SELECT id
    FROM lesson_hour_confirmations
    WHERE course_session_id = ?
    LIMIT 1
    `,
    [sessionId]
  );
  if (confirmationRows?.[0]) {
    const error = new Error('课时确认已开始，请在课时确认中处理');
    (error as any).code = 'LESSON_HOURS_STARTED';
    throw error;
  }

  await conn.execute(
    `UPDATE course_sessions SET status = 'cancelled' WHERE id = ?`,
    [sessionId]
  );
  await releaseLessonHoursReservation(conn, sessionId);
  await recomputeMentorCompletedSessionCount(conn, Number(row.mentor_user_id));
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
      const [sessionInsert] = await conn.execute<InsertResult>(
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
      const sessionId = Number(sessionInsert.insertId);
      await reserveLessonHours(conn, studentUserId, sessionId, parsed.durationHours);
      if (sessionStatus === 'completed') {
        await recomputeMentorCompletedSessionCount(conn, mentorUserId);
      }
      await markCourseRequestPairedForAcceptedAppointment(conn, payload, studentUserId);
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
    await reserveLessonHours(conn, studentUserId, existingId, parsed.durationHours);
    if (sessionStatus === 'completed') {
      await recomputeMentorCompletedSessionCount(conn, mentorUserId);
    }
    await markCourseRequestPairedForAcceptedAppointment(conn, payload, studentUserId);
    return;
  }

  // A reschedule proposal must not remove the original class until the new
  // time has been accepted. Rejection/cancellation are handled separately.
  if (status === 'rescheduling') return;

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
  await releaseLessonHoursReservation(conn, existingId);
};

type AppointmentNotificationKind =
  | 'new_appointment'
  | 'new_time'
  | 'accepted'
  | 'rejected'
  | 'rescheduling'
  | 'recalled'
  | 'cancelled'
  | 'not_held_requested'
  | 'not_held_confirmed'
  | 'not_held_kept'
  | 'not_held_withdrawn'
  | 'hours_submitted'
  | 'hours_confirmed'
  | 'hours_disputed'
  | 'hours_resubmitted'
  | 'hours_dispute_accepted'
  | 'hours_platform_review';

type AppointmentNotificationInput = {
  kind: AppointmentNotificationKind;
  actorUserId: number;
  recipientUserId: number;
  studentUserId: number;
  mentorUserId: number;
  payload: AppointmentPayload | null;
  payloadCreatedAt?: Date | string | null;
  hours?: number | null;
};

const getRecipientTimeZone = async (
  recipientUserId: number,
  recipientRole: 'student' | 'mentor' | ''
) => {
  const rows = await query<any[]>(
    `SELECT aset.availability_json, mp.timezone AS mentor_timezone
     FROM users u
     LEFT JOIN account_settings aset ON aset.user_id = u.id
     LEFT JOIN mentor_profiles mp ON mp.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [recipientUserId]
  );
  const fallback = recipientRole === 'mentor'
    ? safeText(rows?.[0]?.mentor_timezone) || 'Asia/Shanghai'
    : 'Asia/Shanghai';
  return parseAvailabilityPayload(rows?.[0]?.availability_json, fallback)?.timeZone || fallback;
};

const formatWindowForRecipient = (
  windowText: unknown,
  createdAt: Date | string | null | undefined,
  timeZone: string,
  locale: 'zh-CN' | 'en'
) => {
  const base = createdAt ? new Date(createdAt) : new Date();
  const parsed = parseCourseWindowText(windowText, Number.isNaN(base.getTime()) ? new Date() : base);
  if (!parsed) return safeText(windowText);

  try {
    const intlLocale = locale === 'en' ? 'en-US' : 'zh-CN';
    const dateFormatter = new Intl.DateTimeFormat(intlLocale, {
      timeZone,
      year: 'numeric',
      month: locale === 'en' ? 'short' : 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const dateText = locale === 'en'
      ? dateFormatter.format(parsed.startsAtUtc)
      : (() => {
          const parts = dateFormatter.formatToParts(parsed.startsAtUtc);
          const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
          return `${get('year')}年${get('month')}月${get('day')}日 ${get('weekday')}`;
        })();
    const timeFormatter = new Intl.DateTimeFormat(intlLocale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const startText = timeFormatter.format(parsed.startsAtUtc);
    const endText = timeFormatter.format(parsed.endsAtUtc);
    const offsetPart = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      timeZoneName: 'shortOffset',
    }).formatToParts(parsed.startsAtUtc).find((part) => part.type === 'timeZoneName')?.value || timeZone;
    const offsetText = offsetPart.replace(/^GMT(?=$|[+-])/, 'UTC');
    return `${dateText} ${startText}-${endText} (${offsetText})`;
  } catch {
    return safeText(windowText);
  }
};

const getAppointmentNotificationCopy = (
  kind: AppointmentNotificationKind,
  actorDisplayName: string,
  locale: 'zh-CN' | 'en',
  hours?: number | null
) => {
  const isEnglish = locale === 'en';
  const actor = actorDisplayName || (isEnglish ? 'The other participant' : '对方');
  const hourText = Number.isFinite(Number(hours)) ? Number(hours) : null;
  if (isEnglish) {
    const copies: Record<AppointmentNotificationKind, { subject: string; eventTitle: string; description: string }> = {
      new_appointment: { subject: 'Mentory: New course booking', eventTitle: 'New course booking', description: `${actor} sent you a course booking.` },
      new_time: { subject: 'Mentory: New course time', eventTitle: 'New course time', description: `${actor} proposed a new course time. Please review it.` },
      accepted: { subject: 'Mentory: Course booking accepted', eventTitle: 'Course booking accepted', description: `${actor} accepted your course booking.` },
      rejected: { subject: 'Mentory: Course booking declined', eventTitle: 'Course booking declined', description: `${actor} declined your course booking.` },
      rescheduling: { subject: 'Mentory: New course time requested', eventTitle: 'Reschedule requested', description: `${actor} requested a new course time.` },
      recalled: { subject: 'Mentory: Course booking withdrawn', eventTitle: 'Course booking withdrawn', description: `${actor} withdrew a course booking.` },
      cancelled: { subject: 'Mentory: Course cancelled', eventTitle: 'Course cancelled', description: `${actor} cancelled the scheduled course.` },
      not_held_requested: { subject: 'Mentory: Missed-course confirmation needed', eventTitle: 'Missed-course confirmation', description: `${actor} reported that this course did not take place. Please respond.` },
      not_held_confirmed: { subject: 'Mentory: Course marked as not held', eventTitle: 'Course not held', description: `${actor} confirmed that the course did not take place.` },
      not_held_kept: { subject: 'Mentory: Course kept as held', eventTitle: 'Course kept as held', description: `${actor} indicated that the course took place.` },
      not_held_withdrawn: { subject: 'Mentory: Missed-course request withdrawn', eventTitle: 'Request withdrawn', description: `${actor} withdrew the missed-course confirmation request.` },
      hours_submitted: { subject: 'Mentory: Lesson hours to confirm', eventTitle: 'Lesson hours submitted', description: `${actor} submitted ${hourText ?? ''} lesson hour${hourText === 1 ? '' : 's'}. Please confirm.` },
      hours_confirmed: { subject: 'Mentory: Lesson hours confirmed', eventTitle: 'Lesson hours confirmed', description: `${actor} confirmed ${hourText ?? ''} lesson hour${hourText === 1 ? '' : 's'}.` },
      hours_disputed: { subject: 'Mentory: Lesson hours disputed', eventTitle: 'Lesson hours disputed', description: `${actor} proposed ${hourText ?? ''} lesson hour${hourText === 1 ? '' : 's'} instead. Please respond.` },
      hours_resubmitted: { subject: 'Mentory: Lesson hours resubmitted', eventTitle: 'Lesson hours resubmitted', description: `${actor} resubmitted ${hourText ?? ''} lesson hour${hourText === 1 ? '' : 's'}. Please confirm.` },
      hours_dispute_accepted: { subject: 'Mentory: Lesson-hours dispute accepted', eventTitle: 'Dispute accepted', description: `${actor} accepted the revised total of ${hourText ?? ''} lesson hour${hourText === 1 ? '' : 's'}.` },
      hours_platform_review: { subject: 'Mentory: Lesson hours sent for review', eventTitle: 'Platform review requested', description: `${actor} sent the lesson-hours dispute to Mentory for review.` },
    };
    return copies[kind];
  }
  if (kind === 'new_appointment') {
    return {
      subject: 'Mentory 新的课程预约',
      eventTitle: '新的课程预约',
      description: `${actor} 给您发送了一条课程预约。`,
    };
  }
  if (kind === 'new_time') {
    return {
      subject: 'Mentory 新的课程时间',
      eventTitle: '新的课程时间',
      description: `${actor} 给您发送了一条新的课程时间，请及时确认。`,
    };
  }
  if (kind === 'accepted') {
    return {
      subject: 'Mentory 课程预约已接受',
      eventTitle: '课程预约已接受',
      description: `${actor} 已接受您的课程预约。`,
    };
  }
  if (kind === 'rejected') {
    return {
      subject: 'Mentory 课程预约已拒绝',
      eventTitle: '课程预约已拒绝',
      description: `${actor} 已拒绝您的课程预约。`,
    };
  }
  if (kind === 'rescheduling') {
    return {
      subject: 'Mentory 请求更换课程时间',
      eventTitle: '请求更换课程时间',
      description: `${actor} 请求重新安排课程时间。`,
    };
  }
  const copies: Record<Exclude<AppointmentNotificationKind, 'new_appointment' | 'new_time' | 'accepted' | 'rejected' | 'rescheduling'>, { subject: string; eventTitle: string; description: string }> = {
    recalled: { subject: 'Mentory 课程预约已撤回', eventTitle: '课程预约已撤回', description: `${actor} 已撤回一条课程预约。` },
    cancelled: { subject: 'Mentory 课程已取消', eventTitle: '课程已取消', description: `${actor} 已取消已安排的课程。` },
    not_held_requested: { subject: 'Mentory 待确认本节未上课', eventTitle: '本节未上课确认', description: `${actor} 发起了本节未上课确认，请及时处理。` },
    not_held_confirmed: { subject: 'Mentory 已确认本节未上课', eventTitle: '本节未上课', description: `${actor} 已确认本节课程未进行。` },
    not_held_kept: { subject: 'Mentory 课程保留为已上课', eventTitle: '课程保留为已上课', description: `${actor} 确认本节课程已正常进行。` },
    not_held_withdrawn: { subject: 'Mentory 已撤回未上课确认', eventTitle: '已撤回未上课确认', description: `${actor} 已撤回本节未上课确认。` },
    hours_submitted: { subject: 'Mentory 待确认课时', eventTitle: '课时待确认', description: `${actor} 提交了 ${hourText ?? ''} 小时课时，请及时确认。` },
    hours_confirmed: { subject: 'Mentory 课时已确认', eventTitle: '课时已确认', description: `${actor} 已确认 ${hourText ?? ''} 小时课时。` },
    hours_disputed: { subject: 'Mentory 课时有异议', eventTitle: '课时有异议', description: `${actor} 提议将课时调整为 ${hourText ?? ''} 小时，请及时处理。` },
    hours_resubmitted: { subject: 'Mentory 课时已重新提交', eventTitle: '课时已重新提交', description: `${actor} 重新提交了 ${hourText ?? ''} 小时课时，请及时确认。` },
    hours_dispute_accepted: { subject: 'Mentory 课时异议已接受', eventTitle: '课时异议已接受', description: `${actor} 已接受调整后的 ${hourText ?? ''} 小时课时。` },
    hours_platform_review: { subject: 'Mentory 课时已提交平台审核', eventTitle: '课时平台审核', description: `${actor} 已将课时异议提交 Mentory 平台审核。` },
  };
  return copies[kind];
};

const getUserRoleInThread = (
  userId: number,
  studentUserId: number,
  mentorUserId: number
): 'student' | 'mentor' | '' => {
  if (Number.isFinite(userId) && userId === studentUserId) return 'student';
  if (Number.isFinite(userId) && userId === mentorUserId) return 'mentor';
  return '';
};

const buildMessagesPageUrl = (role: 'student' | 'mentor' | '') => {
  const path = role === 'mentor' ? '/mentor/messages' : '/student/messages';
  return `${getPublicAppUrl()}${path}`;
};

const getAppointmentActorDisplayName = async (
  actorUserId: number,
  studentUserId: number,
  mentorUserId: number
) => {
  const role = getUserRoleInThread(actorUserId, studentUserId, mentorUserId);
  const rows = role === 'mentor'
    ? await query<any[]>(
        `
        SELECT u.username, ur.public_id, mp.display_name
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'mentor'
        LEFT JOIN mentor_profiles mp ON mp.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
        `,
        [actorUserId]
      )
    : role
      ? await query<any[]>(
          `
          SELECT u.username, ur.public_id, NULL AS display_name
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = ?
          WHERE u.id = ?
          LIMIT 1
          `,
          [role, actorUserId]
        )
      : await query<any[]>(
          'SELECT username, NULL AS public_id, NULL AS display_name FROM users WHERE id = ? LIMIT 1',
          [actorUserId]
        );

  const row = rows?.[0] || {};
  const username = typeof row?.username === 'string' ? row.username.trim() : '';
  const publicId = typeof row?.public_id === 'string' ? row.public_id.trim() : '';
  const displayName = typeof row?.display_name === 'string' ? row.display_name.trim() : '';
  if (role === 'mentor') {
    const mentorName = displayName || username;
    if (mentorName && publicId && mentorName !== publicId) return `${mentorName}（${publicId}）`;
    return mentorName || publicId;
  }
  if (username) return username;
  return publicId;
};

const sendAppointmentNotificationSafely = async ({
  kind,
  actorUserId,
  recipientUserId,
  studentUserId,
  mentorUserId,
  payload,
  payloadCreatedAt,
  hours,
}: AppointmentNotificationInput) => {
  try {
    if (!Number.isFinite(actorUserId) || actorUserId <= 0) return;
    if (!Number.isFinite(recipientUserId) || recipientUserId <= 0) return;
    if (actorUserId === recipientUserId) return;

    const preferences = await getEmailNotificationPreferencesForUser(recipientUserId);
    if (!preferences.enabled) return;

    const recipientRows = await query<any[]>(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [recipientUserId]
    );
    const recipient = recipientRows?.[0];
    const to = typeof recipient?.email === 'string' ? recipient.email.trim() : '';
    if (!to) return;

    const actorDisplayName = await getAppointmentActorDisplayName(actorUserId, studentUserId, mentorUserId);
    const copy = getAppointmentNotificationCopy(kind, actorDisplayName, preferences.locale, hours);
    const recipientRole = getUserRoleInThread(recipientUserId, studentUserId, mentorUserId);
    const recipientTimeZone = await getRecipientTimeZone(recipientUserId, recipientRole);
    await sendAppointmentNotificationMail({
      recipientUserId,
      to,
      subject: copy.subject,
      eventTitle: copy.eventTitle,
      actorDisplayName,
      windowText: formatWindowForRecipient(payload?.windowText, payloadCreatedAt, recipientTimeZone, preferences.locale),
      messageUrl: buildMessagesPageUrl(recipientRole),
      description: copy.description,
      locale: preferences.locale,
    });
  } catch (error) {
    console.error('Appointment notification mail error:', error);
  }
};

const getRescheduleChainAppointmentIds = async (
  conn: PoolConnection,
  threadId: number,
  rootAppointmentId: number
) => {
  const [rows] = await conn.execute<any[]>(
    `SELECT id, payload_json
     FROM message_items
     WHERE thread_id = ? AND message_type = 'appointment_card'`,
    [threadId]
  );
  const knownIds = new Set<number>();
  const adjacency = new Map<number, Set<number>>();
  for (const item of rows || []) {
    const id = toPositiveIntOrNull(item?.id);
    if (id == null) continue;
    knownIds.add(id);
    adjacency.set(id, adjacency.get(id) || new Set<number>());
  }
  for (const item of rows || []) {
    const id = toPositiveIntOrNull(item?.id);
    const payload = parseAppointmentPayload(item?.payload_json);
    const sourceId = toPositiveIntOrNull(payload?.sourceAppointmentId);
    if (
      id == null
      || sourceId == null
      || !knownIds.has(sourceId)
      || safeText(payload?.intent).toLowerCase() !== 'reschedule'
    ) continue;
    adjacency.get(id)?.add(sourceId);
    adjacency.get(sourceId)?.add(id);
  }

  const connected = new Set<number>();
  const queue = [rootAppointmentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (connected.has(current) || !knownIds.has(current)) continue;
    connected.add(current);
    for (const neighbor of adjacency.get(current) || []) {
      if (!connected.has(neighbor)) queue.push(neighbor);
    }
  }
  return Array.from(connected);
};

router.post('/appointments', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const mentorPublicIdFromBody = typeof req.body?.mentorId === 'string' && req.body.mentorId.trim()
    ? req.body.mentorId.trim()
    : '';
  const mentorPublicId = mentorPublicIdFromBody || (req.user.role === 'mentor' ? '__mentor_self__' : '');
  const hasExplicitMentorTarget = Boolean(mentorPublicIdFromBody);
  const studentUserIdFromBody = toPositiveIntOrNull(req.body?.studentUserId);
  const hasExplicitStudentTarget = studentUserIdFromBody != null;
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
    // Prefer explicit target fields over the JWT's active role so dual-role users
    // can still book mentors from the student UI while logged in with mentor as
    // their default role.
    const shouldSendAsMentor = hasExplicitStudentTarget || (!hasExplicitMentorTarget && req.user.role === 'mentor');

    if (shouldSendAsMentor) {
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
      void touchMentorLastReplied(req.user.id).catch((error) => {
        console.error('Touch mentor last replied error:', error);
      });

      void sendAppointmentNotificationSafely({
        kind: 'new_appointment',
        actorUserId: req.user.id,
        recipientUserId: studentUserId,
        studentUserId,
        mentorUserId: req.user.id,
        payload,
      });

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

    void sendAppointmentNotificationSafely({
      kind: 'new_appointment',
      actorUserId: req.user.id,
      recipientUserId: mentorUserId,
      studentUserId: req.user.id,
      mentorUserId,
      payload,
    });

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
  const rawIntent = safeText(req.body?.intent).toLowerCase();
  const appointmentIntent = rawIntent === 'reschedule' || rawIntent === 'next_lesson' ? rawIntent : '';
  const meetingId = typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
    ? String(req.body.meetingId).trim()
    : buildDefaultMeetingId();

  if (!windowText) return res.status(400).json({ error: '缺少预约时间' });

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
      const canUseSourceAppointment = appointmentIntent === 'reschedule'
        ? sourceStatus === 'pending'
          || sourceStatus === 'accepted'
          || sourceStatus === 'rejected'
          || sourceStatus === 'rescheduling'
        : sourceStatus === 'pending' || sourceStatus === 'accepted';
      if (!canUseSourceAppointment) {
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
      if (
        appointmentIntent !== 'reschedule'
        && sourceWindow
        && nextWindow.startsAtUtc.getTime() <= sourceWindow.endsAtUtc.getTime()
      ) {
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
      ...(appointmentIntent ? { intent: appointmentIntent } : {}),
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

    const studentUserId = Number(thread.student_user_id);
    const mentorUserId = Number(thread.mentor_user_id);
    if (req.user.id === mentorUserId) {
      void touchMentorLastReplied(mentorUserId).catch((error) => {
        console.error('Touch mentor last replied error:', error);
      });
    }
    const recipientUserId = req.user.id === studentUserId ? mentorUserId : studentUserId;
    void sendAppointmentNotificationSafely({
      kind: appointmentIntent === 'reschedule' ? 'rescheduling' : 'new_time',
      actorUserId: req.user.id,
      recipientUserId,
      studentUserId,
      mentorUserId,
      payload,
    });

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
  if (status !== 'accepted' && status !== 'rejected' && status !== 'rescheduling') {
    return res.status(400).json({ error: '无效状态' });
  }

  await ensureMentorResponseTimeColumn();
  await ensureMentorRecommendationColumns();
  try {
    await ensureAppointmentLifecycleStatuses();
    await ensureLessonHourReservationSchema();
  } catch (e) {
    console.error('Ensure appointment lifecycle statuses error:', e);
    return res.status(500).json({ error: '数据库升级失败，请检查 appointment_statuses 表权限' });
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

    const currentStatus = normalizeDecisionStatus(row.appointment_status) || 'pending';
    const isSender = Number(row.sender_user_id) === req.user.id;
    const canRespondToPending = !isSender
      && currentStatus === 'pending'
      && (status === 'accepted' || status === 'rejected' || status === 'rescheduling');
    const canRescheduleAccepted = currentStatus === 'accepted' && status === 'rescheduling';
    const canReviseRejected = currentStatus === 'rejected'
      && (
        status === 'rescheduling'
        || (!isSender && status === 'accepted')
      );

    if (!canRespondToPending && !canRescheduleAccepted && !canReviseRejected) {
      await conn.rollback();
      return res.status(409).json({ error: '该预约状态已变化，请刷新后重试' });
    }
    if (canRespondToPending) {
      const pendingWindow = getAppointmentCourseWindow(row);
      if (!pendingWindow || Date.now() >= pendingWindow.startsAtMs) {
        await conn.rollback();
        return res.status(409).json({ error: '该预约已过期，不能再处理' });
      }
    }
    if (canRescheduleAccepted) {
      const currentWindow = getAppointmentCourseWindow(row);
      if (!currentWindow || Date.now() >= currentWindow.startsAtMs) {
        await conn.rollback();
        return res.status(409).json({ error: '课程已到开始时间，请使用“本节未上课”' });
      }
    }
    if (canReviseRejected) {
      const rejectedWindow = getAppointmentCourseWindow(row);
      if (!rejectedWindow || Date.now() >= rejectedWindow.startsAtMs) {
        await conn.rollback();
        return res.status(409).json({ error: '该预约已过期，不能再修改' });
      }
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

    // Release the original reservation before reserving a replacement time.
    // This lets a same-duration reschedule reuse the student's frozen hours.
    if (status === 'accepted') {
      const acceptedPayload = parseAppointmentPayload(row.payload_json);
      const sourceAppointmentId = toPositiveIntOrNull(acceptedPayload?.sourceAppointmentId);
      if (safeText(acceptedPayload?.intent).toLowerCase() === 'reschedule' && sourceAppointmentId != null) {
        const [sourceRows] = await conn.execute<any[]>(
          `SELECT mi.id, mi.payload_json, mi.created_at, t.student_user_id, t.mentor_user_id
           FROM message_items mi
           INNER JOIN message_threads t ON t.id = mi.thread_id
           WHERE mi.id = ? AND mi.thread_id = ? AND mi.message_type = 'appointment_card'
           LIMIT 1`,
          [sourceAppointmentId, Number(row.thread_id)]
        );
        if (sourceRows?.[0]) await cancelAppointmentCourseSession(conn, sourceRows[0]);
      }
    }

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

    if (status === 'accepted') {
      const acceptedPayload = parseAppointmentPayload(row.payload_json);
      const sourceAppointmentId = toPositiveIntOrNull(acceptedPayload?.sourceAppointmentId);
      if (safeText(acceptedPayload?.intent).toLowerCase() === 'reschedule' && sourceAppointmentId != null) {
        const [sourceRows] = await conn.execute<any[]>(
          `
          SELECT
            mi.id,
            mi.payload_json,
            mi.created_at,
            t.student_user_id,
            t.mentor_user_id
          FROM message_items mi
          INNER JOIN message_threads t ON t.id = mi.thread_id
          WHERE mi.id = ?
            AND mi.thread_id = ?
            AND mi.message_type = 'appointment_card'
          LIMIT 1
          `,
          [sourceAppointmentId, Number(row.thread_id)]
        );
        const sourceRow = sourceRows?.[0];
        if (sourceRow) {
          await conn.execute(
            `
            INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
            VALUES (?, 'cancelled', ?)
            ON DUPLICATE KEY UPDATE
              status = VALUES(status),
              updated_by_user_id = VALUES(updated_by_user_id),
              updated_at = CURRENT_TIMESTAMP
            `,
            [sourceAppointmentId, req.user.id]
          );
        }
      }
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
    // A reschedule action immediately creates a replacement appointment card.
    // That creation sends the single email with the proposed new time.
    if (status === 'accepted' || status === 'rejected') {
      const studentUserId = Number(row.student_user_id);
      const mentorUserId = Number(row.mentor_user_id);
      void sendAppointmentNotificationSafely({
        kind: status,
        actorUserId: req.user.id,
        recipientUserId: req.user.id === studentUserId ? mentorUserId : studentUserId,
        studentUserId,
        mentorUserId,
        payload: parseAppointmentPayload(row.payload_json),
        payloadCreatedAt: row.created_at,
      });
    }
    return res.json({ ok: true, appointmentId: String(appointmentId), status });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isWalletHoursError(e)) {
      return res.status(409).json({ code: e.code, error: e.message });
    }
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行backend/schema.sql' });
    }
    console.error('Update appointment decision error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn.release(); } catch {}
  }
});

router.post('/appointments/:appointmentId/lifecycle', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: '无效预约ID' });
  }

  const action = safeText(req.body?.action).toLowerCase();
  if (!['cancel', 'start_not_held', 'confirm_not_held', 'keep_as_held', 'withdraw_not_held'].includes(action)) {
    return res.status(400).json({ error: '无效操作' });
  }

  await ensureMentorRecommendationColumns();
  try {
    await ensureAppointmentLifecycleStatuses();
    await ensureLessonHourReservationSchema();
  } catch (e) {
    console.error('Ensure appointment lifecycle statuses error:', e);
    return res.status(500).json({ error: '数据库升级失败，请检查 appointment_statuses 表权限' });
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
        mi.payload_json,
        mi.created_at,
        COALESCE(ast.status, 'pending') AS appointment_status,
        ast.updated_by_user_id AS appointment_status_updated_by_user_id,
        t.student_user_id,
        t.mentor_user_id
      FROM message_items mi
      INNER JOIN message_threads t ON t.id = mi.thread_id
      LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
      WHERE mi.id = ?
        AND mi.message_type = 'appointment_card'
        AND (t.student_user_id = ? OR t.mentor_user_id = ?)
      LIMIT 1
      FOR UPDATE
      `,
      [appointmentId, req.user.id, req.user.id]
    );
    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: '预约不存在或无权限' });
    }

    const currentStatus = normalizeDecisionStatus(row.appointment_status) || 'pending';
    const window = getAppointmentCourseWindow(row);
    if (!window) {
      await conn.rollback();
      return res.status(400).json({ error: '预约时间数据无效' });
    }

    let nextStatus = currentStatus;
    let shouldCancelSession = false;
    let shouldReopenRequest = false;
    if (action === 'cancel') {
      if (currentStatus !== 'accepted') {
        await conn.rollback();
        return res.status(409).json({ error: '只有已接受且未开始的课程可以取消' });
      }
      if (Date.now() >= window.startsAtMs) {
        await conn.rollback();
        return res.status(409).json({ error: '课程已到开始时间，请使用“本节未上课”' });
      }
      nextStatus = 'cancelled';
      shouldCancelSession = true;
      shouldReopenRequest = true;
    } else if (action === 'start_not_held') {
      if (currentStatus !== 'accepted') {
        await conn.rollback();
        return res.status(409).json({ error: '当前课程不能发起未上课确认' });
      }
      if (Date.now() < window.startsAtMs) {
        await conn.rollback();
        return res.status(409).json({ error: '课程开始前请直接取消课程' });
      }
      const [confirmationRows] = await conn.execute<any[]>(
        `
        SELECT id
        FROM lesson_hour_confirmations
        WHERE course_session_id IN (
          SELECT id FROM course_sessions
          WHERE student_user_id = ? AND mentor_user_id = ? AND starts_at = ?
        )
        LIMIT 1
        `,
        [Number(row.student_user_id), Number(row.mentor_user_id), window.startsAt]
      );
      if (confirmationRows?.[0]) {
        await conn.rollback();
        return res.status(409).json({ error: '课时确认已开始，请在课时确认中处理' });
      }
      nextStatus = 'not_held_pending';
    } else {
      if (currentStatus !== 'not_held_pending') {
        await conn.rollback();
        return res.status(409).json({ error: '该课程没有待处理的未上课确认' });
      }
      const requestedBy = Number(row.appointment_status_updated_by_user_id);
      if (action === 'withdraw_not_held') {
        if (requestedBy !== req.user.id) {
          await conn.rollback();
          return res.status(403).json({ error: '只有发起方可以撤回未上课确认' });
        }
        nextStatus = 'accepted';
      } else {
        if (requestedBy === req.user.id) {
          await conn.rollback();
          return res.status(403).json({ error: '需要由另一方处理未上课确认' });
        }
        if (action === 'confirm_not_held') {
          nextStatus = 'not_held';
          shouldCancelSession = true;
          shouldReopenRequest = true;
        } else {
          nextStatus = 'accepted';
        }
      }
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
      [appointmentId, nextStatus, req.user.id]
    );

    if (action === 'cancel') {
      const chainIds = await getRescheduleChainAppointmentIds(
        conn,
        Number(row.thread_id),
        appointmentId
      );
      for (const chainAppointmentId of chainIds) {
        if (chainAppointmentId === appointmentId) continue;
        await conn.execute(
          `INSERT INTO appointment_statuses (appointment_message_id, status, updated_by_user_id)
           VALUES (?, 'cancelled', ?)
           ON DUPLICATE KEY UPDATE
             status = 'cancelled',
             updated_by_user_id = VALUES(updated_by_user_id),
             updated_at = CURRENT_TIMESTAMP`,
          [chainAppointmentId, req.user.id]
        );
      }
    }

    if (shouldCancelSession) await cancelAppointmentCourseSession(conn, row);
    if (shouldReopenRequest) {
      await reopenCourseRequestIfNoActiveAppointment(
        conn,
        window.payload,
        Number(row.student_user_id)
      );
    }

    if (action === 'cancel') {
      const lifecyclePayload = {
        kind: 'appointment_decision',
        appointmentId: String(appointmentId),
        status: 'cancelled',
      };
      const [messageInsert] = await conn.execute<InsertResult>(
        `INSERT INTO message_items (thread_id, sender_user_id, message_type, payload_json)
         VALUES (?, ?, 'appointment_decision', ?)`,
        [Number(row.thread_id), req.user.id, JSON.stringify(lifecyclePayload)]
      );
      const lifecycleMessageId = Number(messageInsert.insertId);
      await conn.execute(
        `UPDATE message_threads
         SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [lifecycleMessageId, Number(row.thread_id)]
      );
    } else {
      await conn.execute(
        `UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [Number(row.thread_id)]
      );
    }
    await conn.commit();
    const studentUserId = Number(row.student_user_id);
    const mentorUserId = Number(row.mentor_user_id);
    const lifecycleKindByAction: Record<string, AppointmentNotificationKind> = {
      cancel: 'cancelled',
      start_not_held: 'not_held_requested',
      confirm_not_held: 'not_held_confirmed',
      keep_as_held: 'not_held_kept',
      withdraw_not_held: 'not_held_withdrawn',
    };
    void sendAppointmentNotificationSafely({
      kind: lifecycleKindByAction[action],
      actorUserId: req.user.id,
      recipientUserId: req.user.id === studentUserId ? mentorUserId : studentUserId,
      studentUserId,
      mentorUserId,
      payload: window.payload,
      payloadCreatedAt: row.created_at,
    });
    return res.json({
      ok: true,
      appointmentId: String(appointmentId),
      status: nextStatus,
      statusUpdatedByMe: true,
      courseRemoved: shouldCancelSession,
      courseRequestReopened: shouldReopenRequest,
    });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    if (String(e?.code || '') === 'LESSON_HOURS_STARTED') {
      return res.status(409).json({ error: e.message });
    }
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Update appointment lifecycle error:', e);
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
  const disputedHours = normalizeQuarterHourValue(req.body?.disputedHours);
  if (status !== 'confirmed' && status !== 'disputed') {
    return res.status(400).json({ error: '无效响应状态' });
  }
  if (status === 'disputed' && disputedHours == null) {
    return res.status(400).json({ error: '请填写你认为正确的课时，需为 0.25 小时颗粒度且范围 0.25-12 小时' });
  }

  await ensureMentorRecommendationColumns();
  await ensureLessonHourReservationSchema();

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

    const [latestRows] = await conn.execute<any[]>(
      `
      SELECT message_item_id
      FROM lesson_hour_confirmations
      WHERE course_session_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [Number(row.course_session_id)]
    );
    const latestMessageItemId = Number(latestRows?.[0]?.message_item_id || 0);
    if (latestMessageItemId > 0 && latestMessageItemId !== messageId) {
      await conn.rollback();
      return res.status(409).json({ error: '该课时确认已更新，请刷新后重试' });
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
            disputed_hours = NULL,
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
      await recomputeMentorCompletedSessionCount(conn, Number(row.mentor_user_id));

      await settleLessonHours(conn, req.user.id, Number(row.course_session_id), proposedHours);
    } else {
      await conn.execute(
        `
        UPDATE lesson_hour_confirmations
        SET status = 'disputed',
            disputed_hours = ?,
            responded_by_user_id = ?,
            responded_at = CURRENT_TIMESTAMP
        WHERE message_item_id = ?
        `,
        [disputedHours, req.user.id, messageId]
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
    void sendAppointmentNotificationSafely({
      kind: status === 'confirmed' ? 'hours_confirmed' : 'hours_disputed',
      actorUserId: req.user.id,
      recipientUserId: Number(row.mentor_user_id),
      studentUserId: Number(row.student_user_id),
      mentorUserId: Number(row.mentor_user_id),
      payload: null,
      hours: status === 'confirmed' ? proposedHours : disputedHours,
    });
    return res.json({
      ok: true,
      messageId: String(messageId),
      status,
      disputedHours: status === 'disputed' && disputedHours != null ? disputedHours : null,
      finalHours: status === 'confirmed' ? Number(proposedHours.toFixed(2)) : null,
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isWalletHoursError(e)) {
      return res.status(409).json({ code: e.code, error: e.message });
    }
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

  await ensureMentorRecommendationColumns();

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

    const [latestRows] = await conn.execute<any[]>(
      `
      SELECT message_item_id
      FROM lesson_hour_confirmations
      WHERE course_session_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [Number(row.course_session_id)]
    );
    const latestMessageItemId = Number(latestRows?.[0]?.message_item_id || 0);
    if (latestMessageItemId > 0 && latestMessageItemId !== messageId) {
      await conn.rollback();
      return res.status(409).json({ error: '该课时确认已更新，请刷新后重试' });
    }

    const payload = parseLessonHoursConfirmationPayload(row?.payload_json);
    const startsAt = row?.starts_at instanceof Date
      ? row.starts_at.toISOString()
      : safeText(row?.starts_at || payload?.startsAt);

    await hideMessageForUsers(conn, messageId, [Number(row.student_user_id), Number(row.mentor_user_id)]);

    const nextMessageId = await createLessonHoursConfirmationMessage(conn, {
      threadId: Number(row.thread_id),
      senderUserId: req.user.id,
      courseSessionId: Number(row.course_session_id),
      studentUserId: Number(row.student_user_id),
      mentorUserId: Number(row.mentor_user_id),
      proposedHours,
      startsAt,
      courseDirectionId: safeText(row?.course_direction) || safeText(payload?.courseDirectionId),
      courseTypeId: safeText(row?.course_type) || safeText(payload?.courseTypeId),
    });
    await touchMentorLastRepliedWithConnection(conn, Number(row.mentor_user_id));

    await conn.execute(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [nextMessageId, Number(row.thread_id)]
    );

    await conn.commit();
    void sendAppointmentNotificationSafely({
      kind: 'hours_resubmitted',
      actorUserId: req.user.id,
      recipientUserId: Number(row.student_user_id),
      studentUserId: Number(row.student_user_id),
      mentorUserId: Number(row.mentor_user_id),
      payload: null,
      hours: proposedHours,
    });
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

router.post('/lesson-hour-confirmations/:messageId/mentor-respond', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return res.status(400).json({ error: '无效课时确认ID' });
  }

  const status = normalizeLessonHoursConfirmationStatus(req.body?.status);
  if (status !== 'dispute_confirmed' && status !== 'platform_review') {
    return res.status(400).json({ error: '无效响应状态' });
  }

  await ensureMentorRecommendationColumns();
  await ensureLessonHourReservationSchema();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        mi.id,
        mi.thread_id,
        lhc.course_session_id,
        lhc.student_user_id,
        lhc.mentor_user_id,
        lhc.proposed_hours,
        lhc.disputed_hours,
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

    if (Number(row?.mentor_user_id) !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: '只有导师可以处理学生异议' });
    }

    const currentStatus = normalizeLessonHoursConfirmationStatus(row?.confirmation_status);
    if (currentStatus !== 'disputed') {
      await conn.rollback();
      return res.status(409).json({ error: '当前状态不支持导师处理，请刷新后重试' });
    }

    const [latestRows] = await conn.execute<any[]>(
      `
      SELECT message_item_id
      FROM lesson_hour_confirmations
      WHERE course_session_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [Number(row.course_session_id)]
    );
    const latestMessageItemId = Number(latestRows?.[0]?.message_item_id || 0);
    if (latestMessageItemId > 0 && latestMessageItemId !== messageId) {
      await conn.rollback();
      return res.status(409).json({ error: '该课时确认已更新，请刷新后重试' });
    }

    const disputedHours = Number.parseFloat(String(row?.disputed_hours ?? ''));
    if (!Number.isFinite(disputedHours) || disputedHours <= 0) {
      await conn.rollback();
      return res.status(409).json({ error: '学生尚未提交有效异议课时，请刷新后重试' });
    }

    await conn.execute(
      `
      UPDATE lesson_hour_confirmations
      SET status = ?,
          final_hours = ?,
          responded_by_user_id = ?,
          responded_at = CURRENT_TIMESTAMP,
          settled_at = CURRENT_TIMESTAMP
      WHERE message_item_id = ?
      `,
      [status, status === 'dispute_confirmed' ? disputedHours : null, req.user.id, messageId]
    );

    if (status === 'dispute_confirmed') {
      await conn.execute(
        `
        UPDATE course_sessions
        SET duration_hours = ?, status = 'completed'
        WHERE id = ?
        `,
        [disputedHours, Number(row.course_session_id)]
      );
      await recomputeMentorCompletedSessionCount(conn, Number(row.mentor_user_id));

      await settleLessonHours(
        conn,
        Number(row.student_user_id),
        Number(row.course_session_id),
        disputedHours
      );
    }
    await touchMentorLastRepliedWithConnection(conn, Number(row.mentor_user_id));

    await conn.execute(
      `
      UPDATE message_threads
      SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [messageId, Number(row.thread_id)]
    );

    await conn.commit();
    void sendAppointmentNotificationSafely({
      kind: status === 'dispute_confirmed' ? 'hours_dispute_accepted' : 'hours_platform_review',
      actorUserId: req.user.id,
      recipientUserId: Number(row.student_user_id),
      studentUserId: Number(row.student_user_id),
      mentorUserId: Number(row.mentor_user_id),
      payload: null,
      hours: status === 'dispute_confirmed' ? disputedHours : null,
    });
    return res.json({
      ok: true,
      messageId: String(messageId),
      status,
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (isWalletHoursError(e)) {
      return res.status(409).json({ code: e.code, error: e.message });
    }
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Mentor respond lesson hour dispute error:', e);
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

    await restoreRescheduleSourceAfterRecall(conn, row, appointmentId);

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
    const studentUserId = Number(row.student_user_id);
    const mentorUserId = Number(row.mentor_user_id);
    const recipientUserId = req.user.id === studentUserId ? mentorUserId : studentUserId;
    void sendAppointmentNotificationSafely({
      kind: 'recalled',
      actorUserId: req.user.id,
      recipientUserId,
      studentUserId,
      mentorUserId,
      payload: parseAppointmentPayload(row.payload_json),
      payloadCreatedAt: row.created_at,
    });
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
    const requestedExcludedSourceId = toPositiveIntOrNull(req.query?.excludeSourceAppointmentId);
    let excludedAppointmentIds: number[] = [];
    if (requestedExcludedSourceId != null) {
      const excludedRows = await query<any[]>(
        `SELECT mi.id
         FROM message_items mi
         INNER JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
         WHERE mi.id = ?
           AND mi.thread_id = ?
           AND mi.message_type = 'appointment_card'
           AND ast.status = 'rescheduling'
         LIMIT 1`,
        [requestedExcludedSourceId, threadId]
      );
      if (excludedRows?.[0]) excludedAppointmentIds = [requestedExcludedSourceId];
    }
    const busySelectionsByUser = await getBusySelectionsForUsers(
      [studentUserId, mentorUserId],
      new Map<number, string>([
        [studentUserId, studentAvailability.timeZone],
        [mentorUserId, mentorAvailability.timeZone],
      ]),
      { excludedAppointmentIds }
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

router.post('/threads/:threadId/star', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

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

    if (!threadRows?.[0]) return res.status(404).json({ error: '会话不存在或无权限' });

    await query(
      `
      INSERT INTO message_thread_stars (thread_id, user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE starred_at = CURRENT_TIMESTAMP
      `,
      [threadId, req.user.id]
    );

    return res.json({ ok: true, threadId: String(threadId), isStarred: true });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Star thread error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.delete('/threads/:threadId/star', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

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

    if (!threadRows?.[0]) return res.status(404).json({ error: '会话不存在或无权限' });

    await query(
      `
      DELETE FROM message_thread_stars
      WHERE thread_id = ? AND user_id = ?
      `,
      [threadId, req.user.id]
    );

    return res.json({ ok: true, threadId: String(threadId), isStarred: false });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Unstar thread error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/threads/:threadId/archive', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const threadId = Number(req.params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return res.status(400).json({ error: '无效会话ID' });
  }

  try {
    const threadRows = await query<any[]>(
      `
      SELECT id, last_message_id
      FROM message_threads
      WHERE id = ? AND (student_user_id = ? OR mentor_user_id = ?)
      LIMIT 1
      `,
      [threadId, req.user.id, req.user.id]
    );

    const thread = threadRows?.[0];
    if (!thread) return res.status(404).json({ error: '会话不存在或无权限' });

    await query(
      `
      INSERT INTO message_thread_archives (thread_id, user_id, archived_after_message_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        archived_at = CURRENT_TIMESTAMP,
        archived_after_message_id = VALUES(archived_after_message_id)
      `,
      [threadId, req.user.id, toPositiveIntOrNull(thread?.last_message_id)]
    );

    return res.json({ ok: true, threadId: String(threadId), archived: true });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Archive thread error:', e);
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
      LEFT JOIN message_thread_archives mta
        ON mta.thread_id = t.id
       AND mta.user_id = ?
      LEFT JOIN message_item_hidden_for_users mihfu
        ON mihfu.message_item_id = mi.id
       AND mihfu.user_id = ?
      LEFT JOIN message_item_reads mir
        ON mir.message_item_id = mi.id
       AND mir.user_id = ?
      WHERE (t.student_user_id = ? OR t.mentor_user_id = ?)
        AND mi.sender_user_id <> ?
        AND ${MESSAGE_VISIBLE_AFTER_ARCHIVE_SQL}
        AND mihfu.message_item_id IS NULL
        AND mir.message_item_id IS NULL
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
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

router.get('/pending-lesson-hours', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const rows = await query<any[]>(
      `
      SELECT
        lhc.message_item_id,
        lhc.thread_id,
        lhc.course_session_id,
        lhc.student_user_id,
        lhc.mentor_user_id,
        lhc.proposed_hours,
        lhc.disputed_hours,
        lhc.status AS confirmation_status,
        mi.payload_json,
        mi.created_at,
        cs.starts_at,
        cs.course_direction,
        cs.course_type,
        su.username AS student_username,
        srole.public_id AS student_public_id,
        sas.student_avatar_url AS student_avatar_url,
        mu.username AS mentor_username,
        mrole.public_id AS mentor_public_id,
        mp.display_name AS mentor_display_name,
        mp.avatar_url AS mentor_avatar_url
      FROM lesson_hour_confirmations lhc
      INNER JOIN (
        SELECT course_session_id, MAX(id) AS latest_id
        FROM lesson_hour_confirmations
        WHERE (student_user_id = ? AND status = 'pending')
           OR (mentor_user_id = ? AND status = 'disputed')
        GROUP BY course_session_id
      ) latest
        ON latest.latest_id = lhc.id
      INNER JOIN message_items mi
        ON mi.id = lhc.message_item_id
       AND mi.message_type = 'lesson_hours_confirmation'
      LEFT JOIN message_item_hidden_for_users mihfu
        ON mihfu.message_item_id = mi.id
       AND mihfu.user_id = ?
      LEFT JOIN course_sessions cs
        ON cs.id = lhc.course_session_id
      LEFT JOIN users su
        ON su.id = lhc.student_user_id
      LEFT JOIN user_roles srole
        ON srole.user_id = lhc.student_user_id
       AND srole.role = 'student'
      LEFT JOIN account_settings sas
        ON sas.user_id = lhc.student_user_id
      LEFT JOIN users mu
        ON mu.id = lhc.mentor_user_id
      LEFT JOIN user_roles mrole
        ON mrole.user_id = lhc.mentor_user_id
       AND mrole.role = 'mentor'
      LEFT JOIN mentor_profiles mp
        ON mp.user_id = lhc.mentor_user_id
      WHERE (
          (lhc.student_user_id = ? AND lhc.status = 'pending')
          OR (lhc.mentor_user_id = ? AND lhc.status = 'disputed')
        )
        AND mihfu.message_item_id IS NULL
      ORDER BY COALESCE(cs.starts_at, mi.created_at) ASC, lhc.id ASC
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    const items = (rows || [])
      .map((row) => {
        const payload = parseLessonHoursConfirmationPayload(row?.payload_json);
        const status = normalizeLessonHoursConfirmationStatus(row?.confirmation_status) || 'pending';
        const actionRole = Number(row?.student_user_id) === req.user!.id ? 'student' : 'mentor';
        if (
          (actionRole === 'student' && status !== 'pending')
          || (actionRole === 'mentor' && status !== 'disputed')
        ) {
          return null;
        }

        const messageItemId = toPositiveIntOrNull(row?.message_item_id);
        const courseSessionId = toPositiveIntOrNull(row?.course_session_id);
        const proposedHours = Number.parseFloat(String(row?.proposed_hours ?? payload?.proposedHours ?? ''));
        const disputedHoursRaw = Number.parseFloat(String(row?.disputed_hours ?? ''));
        if (messageItemId == null || !Number.isFinite(proposedHours) || proposedHours <= 0) return null;

        const startsAtRaw = row?.starts_at ?? payload?.startsAt;
        const startsAt = startsAtRaw instanceof Date
          ? startsAtRaw.toISOString()
          : safeText(startsAtRaw);
        const participantName = actionRole === 'mentor'
          ? (safeText(row?.student_username) || safeText(row?.student_public_id) || '学生')
          : (safeText(row?.mentor_display_name) || safeText(row?.mentor_username) || safeText(row?.mentor_public_id) || '导师');
        const participantAvatarUrl = actionRole === 'mentor'
          ? safeText(row?.student_avatar_url)
          : safeText(row?.mentor_avatar_url);

        return {
          id: String(messageItemId),
          threadId: String(row?.thread_id || ''),
          courseSessionId: courseSessionId != null
            ? String(courseSessionId)
            : safeText(payload?.courseSessionId),
          proposedHours: Number(proposedHours.toFixed(2)),
          disputedHours: Number.isFinite(disputedHoursRaw) && disputedHoursRaw > 0
            ? Number(disputedHoursRaw.toFixed(2))
            : null,
          startsAt,
          courseDirectionId: safeText(row?.course_direction) || safeText(payload?.courseDirectionId),
          courseTypeId: safeText(row?.course_type) || safeText(payload?.courseTypeId),
          mentorName: safeText(row?.mentor_display_name) || safeText(row?.mentor_username) || safeText(row?.mentor_public_id) || '导师',
          mentorAvatarUrl: safeText(row?.mentor_avatar_url),
          participantName,
          participantAvatarUrl,
          createdAt: row?.created_at ? new Date(row.created_at).toISOString() : '',
          autoConfirmAt: getLessonHoursAutoConfirmAt(row?.created_at)?.toISOString() || '',
          actionRole,
          status,
        };
      })
      .filter(Boolean);

    return res.json({
      items,
      totalCount: items.length,
    });
  } catch (e) {
    if (isMissingMessagesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch pending lesson hours error:', e);
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
        mts.thread_id AS starred_thread_id,
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
      LEFT JOIN message_thread_stars mts
        ON mts.thread_id = t.id
       AND mts.user_id = ?
      LEFT JOIN message_thread_archives mta
        ON mta.thread_id = t.id
       AND mta.user_id = ?
      LEFT JOIN message_items m ON m.id = t.last_message_id
      LEFT JOIN users su ON su.id = t.student_user_id
      LEFT JOIN user_roles srole ON srole.user_id = t.student_user_id AND srole.role = 'student'
      LEFT JOIN account_settings sas ON sas.user_id = t.student_user_id
      LEFT JOIN users mu ON mu.id = t.mentor_user_id
      LEFT JOIN user_roles mrole ON mrole.user_id = t.mentor_user_id AND mrole.role = 'mentor'
      LEFT JOIN mentor_profiles mp ON mp.user_id = t.mentor_user_id
      WHERE (t.student_user_id = ? OR t.mentor_user_id = ?)
        AND ${THREAD_VISIBLE_AFTER_ARCHIVE_SQL}
      ORDER BY COALESCE(t.last_message_at, t.updated_at, t.created_at) DESC
      LIMIT 100
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id]
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
        isStarred: Boolean(r.starred_thread_id),
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
        INNER JOIN message_threads t ON t.id = mi.thread_id
        LEFT JOIN message_thread_archives mta
          ON mta.thread_id = t.id
         AND mta.user_id = ?
        LEFT JOIN message_item_hidden_for_users mihfu
          ON mihfu.message_item_id = mi.id
         AND mihfu.user_id = ?
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.sender_user_id <> ?
          AND ${MESSAGE_VISIBLE_AFTER_ARCHIVE_SQL}
          AND mihfu.message_item_id IS NULL
          AND mir.message_item_id IS NULL
        GROUP BY mi.thread_id
        `,
        [req.user.id, req.user.id, req.user.id, ...threadIds, req.user.id]
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
            WHEN mta.archived_after_message_id IS NOT NULL AND mi.id <= mta.archived_after_message_id THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        INNER JOIN message_threads t ON t.id = mi.thread_id
        LEFT JOIN message_thread_archives mta
          ON mta.thread_id = t.id
         AND mta.user_id = ?
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_decision'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, req.user.id, ...threadIds]
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
          lhc.disputed_hours,
          lhc.final_hours,
          lhc.status AS confirmation_status,
          cs.starts_at AS course_starts_at,
          CASE
            WHEN mi.sender_user_id = ? THEN 1
            WHEN mta.archived_after_message_id IS NOT NULL AND mi.id <= mta.archived_after_message_id THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        INNER JOIN message_threads t ON t.id = mi.thread_id
        INNER JOIN lesson_hour_confirmations lhc
          ON lhc.message_item_id = mi.id
        LEFT JOIN course_sessions cs
          ON cs.id = lhc.course_session_id
        LEFT JOIN message_thread_archives mta
          ON mta.thread_id = t.id
         AND mta.user_id = ?
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'lesson_hours_confirmation'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, req.user.id, ...threadIds]
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
          COALESCE(ast.status, 'pending') AS appointment_status,
          ast.updated_by_user_id AS appointment_status_updated_by_user_id
          ,
          CASE
            WHEN mi.sender_user_id = ? THEN 1
            WHEN mta.archived_after_message_id IS NOT NULL AND mi.id <= mta.archived_after_message_id THEN 1
            WHEN mir.message_item_id IS NULL THEN 0
            ELSE 1
          END AS is_read_by_me
        FROM message_items mi
        INNER JOIN message_threads t ON t.id = mi.thread_id
        LEFT JOIN message_thread_archives mta
          ON mta.thread_id = t.id
         AND mta.user_id = ?
        LEFT JOIN appointment_statuses ast ON ast.appointment_message_id = mi.id
        LEFT JOIN message_item_reads mir
          ON mir.message_item_id = mi.id
         AND mir.user_id = ?
        WHERE mi.thread_id IN (${placeholders})
          AND mi.message_type = 'appointment_card'
        ORDER BY mi.thread_id ASC, mi.id ASC
        `,
        [req.user.id, req.user.id, req.user.id, ...threadIds]
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

        const normalizedRowsForThread = await applyExplicitRescheduleSourceStatuses(rowsForThread);
        const MAX_PER_THREAD = 30;
        const recentRows = normalizedRowsForThread.length > MAX_PER_THREAD
          ? normalizedRowsForThread.slice(-MAX_PER_THREAD)
          : normalizedRowsForThread;

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
            if (
              status !== 'cancelled'
              && appointmentIdNum != null
              && hiddenAppointmentIds.has(appointmentIdNum)
            ) return null;
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
