import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { pool, query } from '../db';
import { requireAdminAuth, getAdminJwtSecret } from '../middleware/adminAuth';
import { ensureAdminSchema } from '../services/adminSchema';
import { expireStaleBillingOrders } from '../services/billingOrderExpiry';
import { revokeAllRefreshTokensForUser } from '../auth/refreshTokens';
import {
  createAliyunLiveStreamAuthInfo,
  getAliyunLiveRuntimeConfig,
  getClassroomRtcProvider,
  toAliRtcSdkAuthInfo,
} from '../services/aliyunRtc';
import { ensureClassroomRecordingsTable } from '../services/aliyunRtcRecording';
import { createClassroomObserverToken } from '../services/classroomObserverToken';
import { buildContentDisposition, getOssClient, getRecordingOssClient } from '../services/ossClient';
import { resolveReplayMp4ObjectPrefix, toRecordingDisplayFileName } from '../services/recordingStorage';
import {
  ensureMentorRecommendationColumns,
  recomputeMentorCompletedSessionCount,
} from '../services/mentorRecommendation';
import { isWalletHoursError } from '../services/walletHours';
import { ensureLessonHourReservationSchema, settleLessonHours } from '../services/lessonHourReservations';
import { computeRefundPricing, parseRefundHours } from '../services/refundPricing';
import { processRefundById } from './refunds';
import {
  sendAdminBroadcastMail,
  sendCourseDisputeResultMail,
  sendLessonHoursFinalDecisionMail,
} from '../services/mailService';
import { calculateMentorPayroll } from '../services/mentorPayroll';

const router = Router();

const ORDER_STATUSES = new Set(['CREATED', 'APPROVED', 'PENDING_RECEIPT', 'COMPLETED', 'CAPTURED', 'VOIDED', 'FAILED']);
const USER_STATUSES = new Set(['active', 'suspended']);
const CLASSROOM_STATUSES = new Set(['scheduled', 'completed', 'cancelled']);
const LESSON_HOURS_STATUSES = new Set(['none', 'pending', 'confirmed', 'disputed', 'dispute_confirmed', 'platform_review']);
const REPLAY_STATUSES = new Set(['none', 'running', 'ready', 'failed']);
const REPLAY_SIGNED_URL_EXPIRE_SECONDS = 60 * 60;
const REPLAY_LIST_MAX_OBJECTS = 500;
const COURSE_DISPUTE_STATUSES = new Set(['submitted', 'resolved', 'rejected']);
const COURSE_DISPUTE_OUTCOMES = new Set(['feedback_only', 'lesson_credit', 'refund', 'rejected']);
const COURSE_DISPUTE_PREFERRED_OUTCOMES: Record<string, string> = {
  feedback_only: 'feedback_only',
  lesson_credit: 'lesson_credit',
  refund_review: 'refund',
};
const EMAIL_BROADCAST_AUDIENCES = new Set(['students', 'mentors', 'all']);
const EMAIL_BROADCAST_CONCURRENCY = 5;

type AuditPayload = {
  req: Request;
  action: string;
  targetType: string;
  targetId: string | number;
  reason?: string | null;
  before?: any;
  after?: any;
};

const safeString = (value: unknown, max = 255) => {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text.slice(0, max);
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: unknown) => {
  const text = safeString(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed) === text ? text : null;
};

const addLocalDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;
  return { startDate: toLocalDateKey(start), endDate: toLocalDateKey(end) };
};

const getPreviousDateRange = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const now = new Date();
  const isCurrentYearRange = start.getFullYear() === now.getFullYear()
    && start.getMonth() === 0
    && start.getDate() === 1
    && endDate === toLocalDateKey(now);
  if (isCurrentYearRange) {
    const previousStart = new Date(start.getFullYear() - 1, 0, 1);
    const previousEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    return {
      previousStartDate: toLocalDateKey(previousStart),
      previousEndDate: toLocalDateKey(previousEnd),
    };
  }
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEndDate = addLocalDays(startDate, -1);
  const previousStartDate = addLocalDays(previousEndDate, -(days - 1));
  return { previousStartDate, previousEndDate };
};

const toPositiveInt = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const getPaging = (req: Request) => {
  const page = toPositiveInt(req.query.page, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
};

const pagingSql = (limit: number, offset: number) => `LIMIT ${Math.max(1, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`);

const maybeParseJson = (raw: any, fallback: any = null) => {
  if (raw === null || typeof raw === 'undefined') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const readReason = (req: Request, minLength = 2) => {
  const reason = safeString((req.body as any)?.reason, 1000);
  if (reason.length < minLength) return null;
  return reason;
};

const parseUrlList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => safeString(item, 1000))
      .filter(Boolean);
  }
  const text = safeString(raw, 4000);
  if (!text) return [];
  const parsed = maybeParseJson(text, null);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => safeString(item, 1000))
      .filter(Boolean);
  }
  return [text];
};

const parseStoredUtcDate = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(
      raw.getFullYear(),
      raw.getMonth(),
      raw.getDate(),
      raw.getHours(),
      raw.getMinutes(),
      raw.getSeconds(),
      raw.getMilliseconds(),
    ));
  }
  const text = safeString(raw, 80);
  if (!text) return null;
  const canonical = text.replace('T', ' ').replace(/Z$/i, '').replace(/\.\d+$/, '').trim();
  const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, y, m, d, hh, mm, ss = '00'] = match;
    const parsed = new Date(Date.UTC(
      Number.parseInt(y, 10),
      Number.parseInt(m, 10) - 1,
      Number.parseInt(d, 10),
      Number.parseInt(hh, 10),
      Number.parseInt(mm, 10),
      Number.parseInt(ss, 10),
    ));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoString = (raw: unknown) => {
  const parsed = parseStoredUtcDate(raw);
  return parsed ? parsed.toISOString() : '';
};

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parsePayrollMonth = (value: unknown) => {
  const month = safeString(value, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  return month;
};

const getPayrollMonthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${month}-01 00:00:00`,
    end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`,
  };
};

const getDefaultMentorHourlyRate = () => {
  const configured = Number(process.env.MENTOR_HOURLY_RATE_CNY || 400);
  return Number.isFinite(configured) && configured > 0 ? Number(configured.toFixed(2)) : 400;
};

const getEffectiveClassroomStatus = (row: any) => {
  const status = safeString(row?.status, 30).toLowerCase();
  if (status !== 'scheduled') return status;
  const startsAt = parseStoredUtcDate(row?.starts_at);
  if (!startsAt) return status;
  const endAt = startsAt.getTime() + Math.max(toNumber(row?.duration_hours, 0), 0) * 60 * 60 * 1000;
  return endAt <= Date.now() ? 'completed' : status;
};

const getReplayStatus = (row: any) => {
  const recordingCount = toNumber(row?.recording_count, 0);
  if (!recordingCount) return 'none';
  if (toNumber(row?.stopped_recording_count, 0) > 0) return 'ready';
  return safeString(row?.latest_recording_status, 30).toLowerCase() === 'failed' ? 'failed' : 'none';
};

const getReviewStatus = (row: any) => (
  row?.review_id == null ? 'none' : 'reviewed'
);

const toObjectLastModifiedIso = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const parsed = new Date(safeString(raw, 100));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const toReplayFileName = (ossKey: string) => {
  const parts = ossKey.split('/').filter(Boolean);
  return toRecordingDisplayFileName(parts[parts.length - 1] || 'recording.mp4');
};

const toReplayFileId = (ossKey: string) => crypto.createHash('sha1').update(ossKey).digest('hex').slice(0, 16);

const listReplayMp4Files = async (storagePrefixes: string[]) => {
  const client = getRecordingOssClient();
  if (!client) return null;

  const seenKeys = new Set<string>();
  const files: Array<{
    fileId: string;
    fileName: string;
    sizeBytes: number;
    lastModified: string;
    url: string;
    expiresAt: number;
  }> = [];
  const expiresAt = Math.floor(Date.now() / 1000) + REPLAY_SIGNED_URL_EXPIRE_SECONDS;

  for (const storagePrefix of storagePrefixes) {
    const mp4Prefix = resolveReplayMp4ObjectPrefix(storagePrefix);
    if (!mp4Prefix) continue;
    let marker = '';

    do {
      const result = await client.list({ prefix: mp4Prefix, marker, 'max-keys': 1000 } as any, {});
      const objects = Array.isArray((result as any)?.objects) ? (result as any).objects : [];

      for (const object of objects) {
        const ossKey = safeString(object?.name, 512);
        if (!ossKey || seenKeys.has(ossKey) || !ossKey.toLowerCase().endsWith('.mp4')) continue;
        seenKeys.add(ossKey);

        const fileName = toReplayFileName(ossKey);
        files.push({
          fileId: toReplayFileId(ossKey),
          fileName,
          sizeBytes: Math.max(0, toNumber(object?.size, 0)),
          lastModified: toObjectLastModifiedIso(object?.lastModified),
          url: client.signatureUrl(ossKey, {
            expires: REPLAY_SIGNED_URL_EXPIRE_SECONDS,
            response: {
              'content-disposition': buildContentDisposition(fileName, 'inline'),
            },
          }),
          expiresAt,
        });
        if (files.length >= REPLAY_LIST_MAX_OBJECTS) break;
      }

      marker = typeof (result as any)?.nextMarker === 'string' ? (result as any).nextMarker : '';
    } while (marker && files.length < REPLAY_LIST_MAX_OBJECTS);

    if (files.length >= REPLAY_LIST_MAX_OBJECTS) break;
  }

  files.sort((a, b) => {
    const bTime = Date.parse(b.lastModified);
    const aTime = Date.parse(a.lastModified);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime) || a.fileName.localeCompare(b.fileName);
  });

  return { files, expiresAt };
};

const resolveOssKeyFromUrl = (rawUrl: unknown) => {
  const value = safeString(rawUrl, 4000);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
};

const getFileNameFromUrl = (rawUrl: unknown) => {
  const value = safeString(rawUrl, 4000);
  if (!value) return 'resume';
  const ossKey = resolveOssKeyFromUrl(value);
  const last = ossKey.split('/').filter(Boolean).pop();
  return safeString(last || 'resume', 255) || 'resume';
};

const getContentTypeFromFileName = (fileName: unknown) => {
  const raw = safeString(fileName, 255).toLowerCase();
  const ext = raw.includes('.') ? raw.split('.').pop() || '' : '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return '';
};

const authenticateAdminToken = async (token: unknown) => {
  const rawToken = safeString(token, 4000);
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, getAdminJwtSecret()) as { adminId?: number; scope?: string };
    const adminId = Number(payload?.adminId || 0);
    if (!adminId || payload?.scope !== 'admin') return null;

    const rows = await query<Array<{ id: number; username: string; is_active: number | boolean }>>(
      'SELECT id, username, is_active FROM admin_users WHERE id = ? LIMIT 1',
      [adminId]
    );
    const admin = rows?.[0];
    if (!admin || !(admin.is_active === 1 || admin.is_active === true)) return null;
    return { adminId: Number(admin.id), username: String(admin.username || '') };
  } catch {
    return null;
  }
};

const jsonOrNull = (value: any) => {
  if (typeof value === 'undefined') return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const audit = async ({ req, action, targetType, targetId, reason = null, before, after }: AuditPayload) => {
  await query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, target_type, target_id, reason, before_json, after_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.admin?.adminId || null,
      action,
      targetType,
      String(targetId),
      reason || null,
      jsonOrNull(before),
      jsonOrNull(after),
      safeString(req.ip || '', 45) || null,
      safeString(req.get('user-agent') || '', 255) || null,
    ]
  );
};

type BroadcastRecipient = {
  id: number;
  email: string;
  preferred_language?: string | null;
};

const broadcastAudienceCondition = (audience: string) => {
  if (audience === 'students') {
    return "EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'student')";
  }
  if (audience === 'mentors') {
    return "EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'mentor' AND ur.mentor_approved = 1)";
  }
  return '1=1';
};

const broadcastRecipientBaseSql = (audience: string) => `
  FROM users u
  LEFT JOIN account_settings settings ON settings.user_id = u.id
  WHERE u.account_status = 'active'
    AND TRIM(COALESCE(u.email, '')) <> ''
    AND COALESCE(settings.email_notifications, 1) = 1
    AND ${broadcastAudienceCondition(audience)}
`;

const loadBroadcastRecipients = async (audience: string): Promise<BroadcastRecipient[]> => {
  const baseSql = broadcastRecipientBaseSql(audience);
  try {
    return await query<BroadcastRecipient[]>(
      `SELECT u.id, u.email, settings.preferred_language ${baseSql} ORDER BY u.id ASC`
    );
  } catch (error: any) {
    if (String(error?.code || '') !== 'ER_BAD_FIELD_ERROR') throw error;
    return await query<BroadcastRecipient[]>(
      `SELECT u.id, u.email ${baseSql} ORDER BY u.id ASC`
    );
  }
};

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) => {
  let cursor = 0;
  const runner = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  };
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => runner()
  );
  await Promise.all(runners);
};

const toDisputeStatusPayload = (row: any) => ({
  id: String(row?.public_id || ''),
  status: String(row?.status || 'submitted').toLowerCase(),
  outcomeCode: row?.outcome_code ? String(row.outcome_code) : '',
  resultMessage: row?.result_message ? String(row.result_message) : '',
  resolvedHours: Number(row?.resolved_hours || 0),
  refundStatus: row?.refund_status ? String(row.refund_status).toLowerCase() : '',
  acceptedAt: toIsoString(row?.accepted_at),
  resolvedAt: toIsoString(row?.resolved_at),
  version: Number(row?.version || 1),
});

const loadDisputeRefundQuote = async (conn: any, dispute: any, requestedHours: number) => {
  const [allocationRows] = await conn.query(
    `SELECT bha.billing_order_id, SUM(bha.hours) AS allocated_hours,
            bo.provider, bo.topup_hours, bo.amount_cny, bo.currency_code,
            COALESCE(bo.amount_usd, bo.amount_cny) AS amount_original,
            COALESCE(bo.standard_unit_price_cny, 600) AS standard_unit_price_cny,
            COALESCE(bo.discount_threshold_hours, 10) AS discount_threshold_hours,
            COALESCE(bo.discount_unit_price_cny, 500) AS discount_unit_price_cny
     FROM billing_hour_allocations bha
     JOIN billing_orders bo ON bo.id = bha.billing_order_id
     WHERE bha.course_session_id = ? AND bha.user_id = ?
     GROUP BY bha.billing_order_id, bo.provider, bo.topup_hours, bo.amount_cny, bo.currency_code,
              bo.amount_usd, bo.standard_unit_price_cny, bo.discount_threshold_hours, bo.discount_unit_price_cny
     ORDER BY bha.billing_order_id ASC
     FOR UPDATE`,
    [dispute.course_session_id, dispute.student_user_id]
  );
  const [handledRows] = await conn.query(
    `SELECT COALESCE(SUM(cdr.hours), 0) AS handled_hours
     FROM course_dispute_refunds cdr WHERE cdr.dispute_id = ?`,
    [dispute.id]
  );
  const alreadyHandled = Number(handledRows?.[0]?.handled_hours || 0);
  const maxHours = Number(Math.min(
    Number(dispute.final_hours || dispute.duration_hours || 0),
    Math.max(0, (allocationRows || []).reduce((sum: number, row: any) => sum + Number(row.allocated_hours || 0), 0) - alreadyHandled)
  ).toFixed(2));
  if (requestedHours > maxHours + 0.000001) throw Object.assign(new Error('退款课时超过本节可处理上限'), { statusCode: 409 });

  let remaining = requestedHours;
  const lines: any[] = [];
  for (const order of allocationRows || []) {
    if (remaining <= 0.000001) break;
    const lineHours = Number(Math.min(Number(order.allocated_hours || 0), remaining).toFixed(2));
    if (lineHours <= 0) continue;
    const [refundRows] = await conn.query(
      `SELECT COALESCE(SUM(requested_hours),0) AS hours,
              COALESCE(SUM(amount_cny),0) AS cny,
              COALESCE(SUM(amount_original),0) AS original
       FROM billing_refunds
       WHERE billing_order_id = ? AND status IN ('PENDING','PROCESSING','COMPLETED')`,
      [order.billing_order_id]
    );
    const prior = refundRows?.[0] || {};
    const quote = computeRefundPricing({
      purchasedHours: Number(order.topup_hours || 0),
      requestedHours: lineHours,
      priorActiveRefundHours: Number(prior.hours || 0),
      originalAmountCny: Number(order.amount_cny || 0),
      originalAmount: Number(order.amount_original || 0),
      priorActiveRefundCny: Number(prior.cny || 0),
      priorActiveRefundOriginal: Number(prior.original || 0),
      standardUnitPriceCny: Number(order.standard_unit_price_cny || 600),
      discountThresholdHours: Number(order.discount_threshold_hours || 10),
      discountUnitPriceCny: Number(order.discount_unit_price_cny || 500),
    });
    if (quote.refundAmountOriginal < 0.01) throw Object.assign(new Error('优惠重算后该课时暂无可退金额'), { statusCode: 422 });
    lines.push({
      orderId: Number(order.billing_order_id), provider: String(order.provider || ''), hours: lineHours,
      amountCny: quote.refundAmountCny, amountOriginal: quote.refundAmountOriginal,
      currencyCode: String(order.currency_code || 'CNY').toUpperCase(),
    });
    remaining = Number((remaining - lineHours).toFixed(2));
  }
  if (remaining > 0.000001) throw Object.assign(new Error('未找到足够的原始扣费记录'), { statusCode: 409 });
  return { maxHours, requestedHours, lines };
};

const sendCourseDisputeResultMails = async (disputeId: number) => {
  const rows = await query<any[]>(
    `SELECT csd.id, csd.status, csd.outcome_code, csd.result_message, csd.resolved_hours,
            csd.result_email_sent_at, csd.mentor_result_email_sent_at,
            cs.course_direction, cs.course_type, cs.starts_at,
            csd.student_user_id, su.email AS student_email, sr.public_id AS student_public_id,
            csd.mentor_user_id, mu.email AS mentor_email, mr.public_id AS mentor_public_id
     FROM course_session_disputes csd
     JOIN course_sessions cs ON cs.id = csd.course_session_id
     JOIN users su ON su.id = csd.student_user_id
     JOIN users mu ON mu.id = csd.mentor_user_id
     LEFT JOIN user_roles sr ON sr.user_id = csd.student_user_id AND sr.role = 'student'
     LEFT JOIN user_roles mr ON mr.user_id = csd.mentor_user_id AND mr.role = 'mentor'
     WHERE csd.id = ? LIMIT 1`,
    [disputeId]
  );
  const dispute = rows?.[0];
  if (!dispute || !['resolved', 'rejected'].includes(String(dispute.status))) return;

  const refundRows = String(dispute.outcome_code) === 'refund'
    ? await query<any[]>(
      `SELECT br.currency_code, SUM(br.amount_original) AS amount
       FROM course_dispute_refunds cdr
       JOIN billing_refunds br ON br.id = cdr.billing_refund_id
       WHERE cdr.dispute_id = ? AND br.status = 'COMPLETED'
       GROUP BY br.currency_code
       ORDER BY br.currency_code`,
      [disputeId]
    )
    : [];
  const refundAmountText = (refundRows || [])
    .map((row) => `${Number(row.amount || 0).toFixed(2)} ${String(row.currency_code || 'CNY').toUpperCase()}`)
    .join(' + ');
  const common = {
    courseName: [dispute.course_direction, dispute.course_type].filter(Boolean).join(' / '),
    startsAt: dispute.starts_at,
    outcome: String(dispute.outcome_code || ''),
    resolvedHours: Number(dispute.resolved_hours || 0),
    refundAmountText,
    resultMessage: String(dispute.result_message || ''),
  };

  if (!dispute.result_email_sent_at) {
    try {
      const sent = await sendCourseDisputeResultMail({
        ...common,
        recipientRole: 'student',
        recipientUserId: Number(dispute.student_user_id),
        recipientPublicId: String(dispute.student_public_id || ''),
        to: String(dispute.student_email || ''),
      });
      if (sent) await query('UPDATE course_session_disputes SET result_email_sent_at = COALESCE(result_email_sent_at, CURRENT_TIMESTAMP) WHERE id = ?', [disputeId]);
    } catch (error) {
      console.error('Course dispute student result mail error:', error);
    }
  }

  if (!dispute.mentor_result_email_sent_at) {
    try {
      const sent = await sendCourseDisputeResultMail({
        ...common,
        recipientRole: 'mentor',
        recipientUserId: Number(dispute.mentor_user_id),
        recipientPublicId: String(dispute.mentor_public_id || ''),
        to: String(dispute.mentor_email || ''),
      });
      if (sent) await query('UPDATE course_session_disputes SET mentor_result_email_sent_at = COALESCE(mentor_result_email_sent_at, CURRENT_TIMESTAMP) WHERE id = ?', [disputeId]);
    } catch (error) {
      console.error('Course dispute mentor result mail error:', error);
    }
  }
};

router.use(async (_req, res, next) => {
  try {
    await ensureAdminSchema();
    next();
  } catch (error) {
    console.error('Ensure admin schema error:', error);
    res.status(500).json({ error: '后台数据库初始化失败' });
  }
});

router.post('/auth/login', async (req: Request, res: Response) => {
  const username = safeString((req.body as any)?.username, 100).toLowerCase();
  const password = String((req.body as any)?.password || '');
  if (!username || !password) return res.status(400).json({ error: '请输入后台账号和密码' });

  try {
    const rows = await query<Array<{ id: number; username: string; password_hash: string; display_name: string | null; is_active: number | boolean }>>(
      'SELECT id, username, password_hash, display_name, is_active FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    const admin = rows?.[0];
    if (!admin || !(admin.is_active === 1 || admin.is_active === true)) {
      return res.status(401).json({ error: '后台账号或密码错误' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: '后台账号或密码错误' });

    await query('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    const expiresIn = (process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || '8h') as SignOptions['expiresIn'];
    const token = jwt.sign({ adminId: Number(admin.id), scope: 'admin' }, getAdminJwtSecret(), { expiresIn });

    return res.json({
      token,
      admin: {
        id: Number(admin.id),
        username: admin.username,
        displayName: admin.display_name || admin.username,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/auth/me', requireAdminAuth, async (req: Request, res: Response) => {
  return res.json({ admin: req.admin });
});

router.get('/dashboard/summary', requireAdminAuth, async (req: Request, res: Response) => {
  const defaultRange = getCurrentMonthRange();
  let startDate = parseDateKey(req.query.startDate) || defaultRange.startDate;
  let endDate = parseDateKey(req.query.endDate) || defaultRange.endDate;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];

  const { previousStartDate, previousEndDate } = getPreviousDateRange(startDate, endDate);
  const rangeStart = `${startDate} 00:00:00`;
  const rangeEnd = `${endDate} 23:59:59`;
  const previousRangeStart = `${previousStartDate} 00:00:00`;
  const previousRangeEnd = `${previousEndDate} 23:59:59`;

  try {
    const [
      userRows,
      roleRows,
      mentorRows,
      orderRows,
      paidStudentRows,
      previousPaidStudentRows,
      courseRows,
      previousActiveMentorRows,
      previousRoleRows,
      previousApprovedMentorRows,
      lessonRows,
      trendRows,
    ] = await Promise.all([
      query<any[]>(
        `SELECT
           COUNT(*) AS totalUsers,
           SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
           SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS newUsersToday,
           SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS newUsers7d
         FROM users`
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
           SUM(CASE WHEN role = 'mentor' THEN 1 ELSE 0 END) AS mentors
         FROM user_roles
         WHERE created_at <= ?`,
        [rangeEnd]
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'mentor'
             AND mentor_approved = 1
             AND COALESCE(mentor_interviewed_at, mentor_reviewed_at, created_at) <= ? THEN 1 ELSE 0 END) AS approvedMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status IN ('pending','interview_pending') AND mentor_approved = 0 THEN 1 ELSE 0 END) AS pendingMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status = 'interview_pending' AND mentor_approved = 0 THEN 1 ELSE 0 END) AS interviewPendingMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status IN ('rejected','interview_rejected') THEN 1 ELSE 0 END) AS rejectedMentors
         FROM user_roles
         WHERE created_at <= ?`,
        [rangeEnd, rangeEnd]
      ),
      query<any[]>(
        `SELECT
           COUNT(*) AS totalOrders,
           SUM(CASE WHEN (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS paidOrders,
           COALESCE(SUM(CASE WHEN (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ? THEN amount_cny ELSE 0 END), 0) AS paidAmountCny,
           SUM(CASE WHEN (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS paidOrdersThisMonth,
           COALESCE(SUM(CASE WHEN (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ? THEN amount_cny ELSE 0 END), 0) AS paidAmountCnyThisMonth,
           COALESCE(SUM(CASE WHEN (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ? THEN amount_cny ELSE 0 END), 0) AS paidAmountCnyLastMonth,
           SUM(CASE WHEN status IN ('VOIDED','FAILED') AND COALESCE(updated_at, created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS failedOrders
         FROM billing_orders`,
        [
          rangeStart, rangeEnd,
          rangeStart, rangeEnd,
          rangeStart, rangeEnd,
          rangeStart, rangeEnd,
          previousRangeStart, previousRangeEnd,
          rangeStart, rangeEnd,
        ]
      ),
      query<any[]>(
        `SELECT COUNT(DISTINCT bo.user_id) AS paidStudents
         FROM billing_orders bo
         INNER JOIN user_roles ur ON ur.user_id = bo.user_id AND ur.role = 'student'
         WHERE (bo.credited_at IS NOT NULL OR bo.status IN ('COMPLETED','CAPTURED'))
           AND COALESCE(bo.credited_at, bo.captured_at, bo.updated_at, bo.created_at) BETWEEN ? AND ?`,
        [rangeStart, rangeEnd]
      ),
      query<any[]>(
        `SELECT COUNT(DISTINCT bo.user_id) AS paidStudents
         FROM billing_orders bo
         INNER JOIN user_roles ur ON ur.user_id = bo.user_id AND ur.role = 'student'
         WHERE (bo.credited_at IS NOT NULL OR bo.status IN ('COMPLETED','CAPTURED'))
           AND COALESCE(bo.credited_at, bo.captured_at, bo.updated_at, bo.created_at) BETWEEN ? AND ?`,
        [previousRangeStart, previousRangeEnd]
      ),
      query<any[]>(
        `SELECT
           COUNT(CASE WHEN status = 'scheduled' AND starts_at BETWEEN ? AND ? THEN 1 END) AS scheduledCourses,
           COUNT(CASE WHEN status = 'completed' AND starts_at BETWEEN ? AND ? THEN 1 END) AS completedCourses,
           COUNT(CASE WHEN status = 'completed' AND starts_at BETWEEN ? AND ? THEN 1 END) AS completedCoursesThisMonth,
           COUNT(CASE WHEN status = 'completed' AND starts_at BETWEEN ? AND ? THEN 1 END) AS completedCoursesLastMonth,
           COUNT(DISTINCT CASE WHEN starts_at BETWEEN ? AND ?
             AND status IN ('scheduled','completed') THEN mentor_user_id END) AS activeMentors
         FROM course_sessions`,
        [
          rangeStart, rangeEnd,
          rangeStart, rangeEnd,
          rangeStart, rangeEnd,
          previousRangeStart, previousRangeEnd,
          rangeStart, rangeEnd,
        ]
      ),
      query<any[]>(
        `SELECT
           COUNT(DISTINCT CASE WHEN starts_at BETWEEN ? AND ?
             AND status IN ('scheduled','completed') THEN mentor_user_id END) AS activeMentors
         FROM course_sessions`,
        [previousRangeStart, previousRangeEnd]
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'student' AND created_at <= ? THEN 1 ELSE 0 END) AS students,
           SUM(CASE WHEN role = 'mentor' AND created_at <= ? THEN 1 ELSE 0 END) AS mentors
         FROM user_roles`,
        [previousRangeEnd, previousRangeEnd]
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'mentor'
             AND mentor_approved = 1
             AND COALESCE(mentor_interviewed_at, mentor_reviewed_at, created_at) <= ? THEN 1 ELSE 0 END) AS approvedMentors
         FROM user_roles`,
        [previousRangeEnd]
      ),
      query<any[]>(
        `SELECT
           COUNT(*) AS pendingLessonHours,
           COUNT(CASE WHEN status IN ('disputed','platform_review') THEN 1 END) AS disputedLessonHours
         FROM lesson_hour_confirmations
         WHERE status IN ('pending','disputed','platform_review')`
      ),
      query<any[]>(
        `SELECT trend_day AS day, SUM(gmvCny) AS gmvCny, SUM(completedCourses) AS completedCourses
         FROM (
           SELECT DATE(COALESCE(credited_at, captured_at, updated_at, created_at)) AS trend_day,
             COALESCE(SUM(amount_cny), 0) AS gmvCny,
             0 AS completedCourses
           FROM billing_orders
           WHERE (credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED'))
             AND COALESCE(credited_at, captured_at, updated_at, created_at) BETWEEN ? AND ?
           GROUP BY DATE(COALESCE(credited_at, captured_at, updated_at, created_at))
           UNION ALL
           SELECT DATE(starts_at) AS trend_day,
             0 AS gmvCny,
             COUNT(*) AS completedCourses
           FROM course_sessions
           WHERE status = 'completed'
             AND starts_at BETWEEN ? AND ?
           GROUP BY DATE(starts_at)
         ) daily
         GROUP BY trend_day
         ORDER BY trend_day`,
        [rangeStart, rangeEnd, rangeStart, rangeEnd]
      ),
    ]);

    const percentChange = (currentValue: unknown, previousValue: unknown) => {
      const current = Number(currentValue || 0);
      const previous = Number(previousValue || 0);
      if (previous > 0) return ((current - previous) / previous) * 100;
      if (current > 0) return 100;
      return 0;
    };

    return res.json({
      users: userRows?.[0] || {},
      roles: roleRows?.[0] || {},
      mentors: mentorRows?.[0] || {},
      orders: orderRows?.[0] || {},
      paidStudents: paidStudentRows?.[0] || {},
      courses: courseRows?.[0] || {},
      comparison: {
        studentsChange: percentChange(roleRows?.[0]?.students, previousRoleRows?.[0]?.students),
        paidStudentsChange: percentChange(paidStudentRows?.[0]?.paidStudents, previousPaidStudentRows?.[0]?.paidStudents),
        mentorsChange: percentChange(roleRows?.[0]?.mentors, previousRoleRows?.[0]?.mentors),
        approvedMentorsChange: percentChange(mentorRows?.[0]?.approvedMentors, previousApprovedMentorRows?.[0]?.approvedMentors),
        activeMentorsChange: percentChange(courseRows?.[0]?.activeMentors, previousActiveMentorRows?.[0]?.activeMentors),
      },
      lessonHours: lessonRows?.[0] || {},
      trends: trendRows || [],
      range: { startDate, endDate, previousStartDate, previousEndDate },
    });
  } catch (error) {
    console.error('Admin dashboard summary error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/users', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const status = safeString(req.query.status, 20);
  const where: string[] = ["sr.role = 'student'"];
  const params: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR u.username LIKE ? ESCAPE '\\\\'
      OR sr.public_id LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR u.id = ?' : ''}
    )`);
    params.push(like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id);
  }
  if (USER_STATUSES.has(status)) {
    where.push('u.account_status = ?');
    params.push(status);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       INNER JOIN user_roles sr ON sr.user_id = u.id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         u.id, sr.public_id AS student_id, u.username, u.email, u.lesson_balance_hours,
         COALESCE(payments.total_paid_cny, 0) AS total_paid_cny, u.account_status,
         u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at,
         GROUP_CONCAT(CONCAT(ur.role, '|', ur.public_id, '|', ur.mentor_approved, '|', ur.mentor_review_status) ORDER BY ur.role SEPARATOR ',') AS roles_compact
       FROM users u
       INNER JOIN user_roles sr ON sr.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN (
         SELECT user_id,
                SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END) AS total_paid_cny
         FROM billing_orders
         GROUP BY user_id
       ) payments ON payments.user_id = u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, sr.public_id, u.username, u.email, u.lesson_balance_hours, payments.total_paid_cny,
                u.account_status, u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at
       ORDER BY u.created_at DESC, u.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    const users = (rows || []).map((row) => ({
      ...row,
      roles: String(row.roles_compact || '')
        .split(',')
        .filter(Boolean)
        .map((item) => {
          const [itemRole, publicId, mentorApproved, reviewStatus] = item.split('|');
          return {
            role: itemRole,
            publicId,
            mentorApproved: mentorApproved === '1',
            mentorReviewStatus: reviewStatus,
          };
        }),
    }));
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), users });
  } catch (error) {
    console.error('Admin users list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/users/:userId', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效用户ID' });

  try {
    const users = await query<any[]>(
      `SELECT id, username, email, lesson_balance_hours, account_status, suspended_at, suspended_reason,
              created_at, updated_at, last_login_at
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const user = users?.[0];
    if (!user) return res.status(404).json({ error: '未找到用户' });

    const [roles, mentorProfiles, orderSummary, courseSummary, reviews] = await Promise.all([
      query<any[]>(
        `SELECT role, public_id, mentor_approved, mentor_review_status, mentor_review_note,
                mentor_reviewed_at, mentor_reviewed_by_admin_id, created_at
         FROM user_roles WHERE user_id = ? ORDER BY role`,
        [userId]
      ),
      query<any[]>(
        `SELECT display_name, gender, degree, school, timezone, courses_json, teaching_languages_json,
                rating, review_count, avg_appointment_response_minutes, is_accepting_students,
                last_replied_at, completed_session_count, avatar_url, created_at, updated_at
         FROM mentor_profiles WHERE user_id = ? LIMIT 1`,
        [userId]
      ),
      query<any[]>(
        `SELECT COUNT(*) AS orderCount,
                COALESCE(SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END), 0) AS paidAmountCny
         FROM billing_orders WHERE user_id = ?`,
        [userId]
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN student_user_id = ? THEN 1 ELSE 0 END) AS studentCourseCount,
           SUM(CASE WHEN mentor_user_id = ? THEN 1 ELSE 0 END) AS mentorCourseCount,
           SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduledCourseCount,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedCourseCount
         FROM course_sessions WHERE student_user_id = ? OR mentor_user_id = ?`,
        [userId, userId, userId, userId]
      ),
      query<any[]>(
        `SELECT
           csr.id, csr.course_session_id, csr.overall_score,
           csr.clarity_score, csr.communication_score, csr.preparation_score,
           csr.expertise_score, csr.punctuality_score, csr.comment_text,
           csr.created_at, csr.updated_at, cs.starts_at, cs.duration_hours,
           csr.mentor_user_id AS counterpart_user_id,
           mentor_role.public_id AS counterpart_public_id,
           COALESCE(mp.display_name, mentor.username, mentor.email) AS counterpart_name,
           mentor.email AS counterpart_email, mentor.account_status AS counterpart_account_status
         FROM course_session_reviews csr
         JOIN course_sessions cs ON cs.id = csr.course_session_id
         JOIN users mentor ON mentor.id = csr.mentor_user_id
         LEFT JOIN user_roles mentor_role
           ON mentor_role.user_id = csr.mentor_user_id AND mentor_role.role = 'mentor'
         LEFT JOIN mentor_profiles mp ON mp.user_id = csr.mentor_user_id
         WHERE csr.student_user_id = ?
         ORDER BY csr.created_at DESC, csr.id DESC`,
        [userId]
      ),
    ]);

    const mentorProfile = mentorProfiles?.[0] || null;
    if (mentorProfile) {
      mentorProfile.courses = maybeParseJson(mentorProfile.courses_json, []);
      mentorProfile.teachingLanguages = maybeParseJson(mentorProfile.teaching_languages_json, []);
    }

    return res.json({
      user,
      roles,
      mentorProfile,
      orderSummary: orderSummary?.[0] || {},
      courseSummary: courseSummary?.[0] || {},
      reviews: reviews || [],
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch('/users/:userId/status', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  const status = safeString((req.body as any)?.status, 20);
  const reason = readReason(req);
  if (!userId) return res.status(400).json({ error: '无效用户ID' });
  if (!USER_STATUSES.has(status)) return res.status(400).json({ error: '无效账号状态' });
  if (!reason) return res.status(400).json({ error: '请填写操作原因' });

  try {
    const beforeRows = await query<any[]>(
      'SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到用户' });

    await query(
      `UPDATE users
       SET account_status = ?,
           suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,
           suspended_reason = CASE WHEN ? = 'suspended' THEN ? ELSE NULL END
       WHERE id = ?`,
      [status, status, status, reason, userId]
    );
    if (status === 'suspended') {
      await revokeAllRefreshTokensForUser(userId, 'admin_suspended');
    }
    const afterRows = await query<any[]>(
      'SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const after = afterRows?.[0];
    await audit({ req, action: 'user.status.update', targetType: 'user', targetId: userId, reason, before, after });
    return res.json({ user: after });
  } catch (error) {
    console.error('Admin update user status error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.delete('/reviews/:reviewId/comment', requireAdminAuth, async (req: Request, res: Response) => {
  const reviewId = toPositiveInt(req.params.reviewId, 0);
  const reason = readReason(req);
  if (!reviewId) return res.status(400).json({ error: '无效评价ID' });
  if (!reason) return res.status(400).json({ error: '请填写删除原因' });

  try {
    const beforeRows = await query<any[]>(
      `SELECT id, course_session_id, student_user_id, mentor_user_id, comment_text, created_at, updated_at
       FROM course_session_reviews
       WHERE id = ?
       LIMIT 1`,
      [reviewId]
    );
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到评价' });
    if (!safeString(before.comment_text, 10000)) {
      return res.status(409).json({ error: '该评价已无文字评论' });
    }

    await query(
      `UPDATE course_session_reviews
       SET comment_text = NULL
       WHERE id = ?`,
      [reviewId]
    );

    const after = { ...before, comment_text: null };
    const auditBefore = {
      id: before.id,
      course_session_id: before.course_session_id,
      student_user_id: before.student_user_id,
      mentor_user_id: before.mentor_user_id,
      comment_present: true,
      created_at: before.created_at,
      updated_at: before.updated_at,
    };
    const auditAfter = { ...auditBefore, comment_present: false };
    await audit({
      req,
      action: 'review.comment.delete',
      targetType: 'course_session_review',
      targetId: reviewId,
      reason,
      before: auditBefore,
      after: auditAfter,
    });
    return res.json({ review: after });
  } catch (error) {
    console.error('Admin delete review comment error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

type MentorReviewStage = 'resume' | 'interview';
type MentorReviewDecision = 'pass' | 'reject';

class MentorReviewDecisionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const executeMentorReviewDecision = async ({
  userId,
  adminId,
  stage,
  decision,
  note,
  qsTop100,
}: {
  userId: number;
  adminId: number;
  stage: MentorReviewStage;
  decision: MentorReviewDecision;
  note: string | null;
  qsTop100: boolean;
}) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [beforeRows] = await conn.execute<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1 FOR UPDATE",
      [userId]
    );
    const before = beforeRows?.[0];
    if (!before) throw new MentorReviewDecisionError(404, '未找到导师申请');

    const expectedStatus = stage === 'resume' ? 'pending' : 'interview_pending';
    if (String(before.mentor_review_status || '') !== expectedStatus) {
      throw new MentorReviewDecisionError(409, '申请状态已变化，请刷新后重试');
    }

    if (stage === 'resume') {
      if (decision === 'pass') {
        await conn.execute(
          `UPDATE user_roles
           SET mentor_approved = 0,
               mentor_review_status = 'interview_pending',
               mentor_review_note = NULL,
               mentor_qs_top100 = 0,
               mentor_reviewed_at = CURRENT_TIMESTAMP,
               mentor_reviewed_by_admin_id = ?,
               mentor_interview_note = NULL,
               mentor_interviewed_at = NULL,
               mentor_interviewed_by_admin_id = NULL
           WHERE user_id = ? AND role = 'mentor'`,
          [adminId, userId]
        );
      } else {
        await conn.execute(
          `UPDATE user_roles
           SET mentor_approved = 0,
               mentor_review_status = 'rejected',
               mentor_review_note = ?,
               mentor_qs_top100 = 0,
               mentor_reviewed_at = CURRENT_TIMESTAMP,
               mentor_reviewed_by_admin_id = ?,
               mentor_interview_note = NULL,
               mentor_interviewed_at = NULL,
               mentor_interviewed_by_admin_id = NULL
           WHERE user_id = ? AND role = 'mentor'`,
          [note, adminId, userId]
        );
      }
    } else if (decision === 'pass') {
      await conn.execute(
        `UPDATE user_roles
         SET mentor_approved = 1,
             mentor_review_status = 'approved',
             mentor_interview_note = ?,
             mentor_qs_top100 = ?,
             mentor_interviewed_at = CURRENT_TIMESTAMP,
             mentor_interviewed_by_admin_id = ?
         WHERE user_id = ? AND role = 'mentor'`,
        [note, qsTop100 ? 1 : 0, adminId, userId]
      );
    } else {
      await conn.execute(
        `UPDATE user_roles
         SET mentor_approved = 0,
             mentor_review_status = 'interview_rejected',
             mentor_interview_note = ?,
             mentor_qs_top100 = 0,
             mentor_interviewed_at = CURRENT_TIMESTAMP,
             mentor_interviewed_by_admin_id = ?
         WHERE user_id = ? AND role = 'mentor'`,
        [note, adminId, userId]
      );
    }

    const [afterRows] = await conn.execute<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    await conn.commit();
    return { before, after: afterRows?.[0] };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const respondMentorReviewDecision = async (
  req: Request,
  res: Response,
  stage: MentorReviewStage,
  decision: MentorReviewDecision
) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  const bodyValue = (req.body || {}) as Record<string, unknown>;
  const rawNote = Object.prototype.hasOwnProperty.call(bodyValue, 'note') ? bodyValue.note : bodyValue.reason;
  if (typeof rawNote !== 'undefined' && typeof rawNote !== 'string') {
    return res.status(400).json({ error: '审核备注格式无效' });
  }
  const noteText = typeof rawNote === 'string' ? rawNote.trim() : '';
  if (noteText.length > 500) {
    return res.status(400).json({ error: '审核备注不能超过 500 字' });
  }
  const note = noteText || null;
  const hasQsTop100 = Object.prototype.hasOwnProperty.call(bodyValue, 'qsTop100');
  if (hasQsTop100 && typeof bodyValue.qsTop100 !== 'boolean') {
    return res.status(400).json({ error: 'QS100 参数无效' });
  }
  if ((stage !== 'interview' || decision !== 'pass') && hasQsTop100) {
    return res.status(400).json({ error: '仅面试通过时可以设置 QS100' });
  }
  if (stage === 'resume' && decision === 'reject' && (!note || note.length < 2)) {
    return res.status(400).json({ error: '请填写至少 2 个字的驳回原因' });
  }
  if (stage === 'interview' && (!note || note.length < 5)) {
    return res.status(400).json({ error: '请填写简短面评' });
  }

  let result: { before: any; after: any };
  try {
    result = await executeMentorReviewDecision({
      userId,
      adminId: req.admin!.adminId,
      stage,
      decision,
      note,
      qsTop100: bodyValue.qsTop100 === true,
    });
  } catch (error) {
    if (error instanceof MentorReviewDecisionError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Admin mentor review decision error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }

  try {
    await audit({
      req,
      action: `mentor.${stage}.${decision}`,
      targetType: 'mentor',
      targetId: userId,
      reason: note || (bodyValue.qsTop100 === true ? 'QS100' : null),
      before: result.before,
      after: result.after,
    });
  } catch (error) {
    console.error('Admin mentor review decision audit error:', error);
  }
  return res.json({ mentor: result.after });
};

router.get('/mentors/reviews', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const status = safeString(req.query.status, 20);
  const baseWhere = ["ur.role = 'mentor'"];
  const baseParams: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    baseWhere.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR u.username LIKE ? ESCAPE '\\\\'
      OR ur.public_id LIKE ? ESCAPE '\\\\'
      OR mp.display_name LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR u.id = ?' : ''}
    )`);
    baseParams.push(like, like, like, like);
    if (Number.isFinite(id) && id > 0) baseParams.push(id);
  }

  const where = [...baseWhere];
  const params = [...baseParams];
  if (status === 'suspended') {
    where.push('u.account_status = ?');
    params.push(status);
  } else if (status === 'actionable') {
    where.push("ur.mentor_review_status IN ('pending','interview_pending')");
    where.push('ur.mentor_approved = 0');
  } else if (['pending', 'interview_pending', 'approved', 'rejected', 'interview_rejected'].includes(status)) {
    where.push('ur.mentor_review_status = ?');
    params.push(status);
  }

  try {
    const [countRows, summaryRows, rows] = await Promise.all([
      query<Array<{ total: number }>>(
        `SELECT COUNT(*) AS total
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
         WHERE ${where.join(' AND ')}`,
        params
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN ur.mentor_review_status IN ('pending','interview_pending') AND ur.mentor_approved = 0 THEN 1 ELSE 0 END) AS actionable,
           SUM(CASE WHEN ur.mentor_review_status = 'pending' AND ur.mentor_approved = 0 THEN 1 ELSE 0 END) AS resumePending,
           SUM(CASE WHEN ur.mentor_review_status = 'interview_pending' AND ur.mentor_approved = 0 THEN 1 ELSE 0 END) AS interviewPending,
           SUM(CASE WHEN ur.mentor_review_status = 'approved' AND ur.mentor_approved = 1 THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN ur.mentor_review_status IN ('rejected','interview_rejected') THEN 1 ELSE 0 END) AS rejected
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
         WHERE ${baseWhere.join(' AND ')}`,
        baseParams
      ),
      query<any[]>(
        `SELECT
           ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
           ur.mentor_review_note, ur.mentor_qs_top100, ur.mentor_reviewed_at,
           ur.mentor_interview_note, ur.mentor_interviewed_at, ur.created_at AS mentor_created_at,
           u.username, u.email, u.account_status, u.last_login_at,
           mp.display_name, mp.degree, mp.school, mp.timezone, mp.avatar_url, mp.updated_at AS profile_updated_at,
           s.mentor_resume_url,
           COALESCE(teaching.total_teaching_hours, 0) AS total_teaching_hours
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
         LEFT JOIN account_settings s ON s.user_id = ur.user_id
         LEFT JOIN (
           SELECT mentor_user_id, SUM(duration_hours) AS total_teaching_hours
           FROM course_sessions
           WHERE status = 'completed'
           GROUP BY mentor_user_id
         ) teaching ON teaching.mentor_user_id = ur.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE WHEN ? = 'actionable' THEN ur.created_at END ASC,
           CASE WHEN ? <> 'actionable' THEN ur.created_at END DESC,
           ur.user_id DESC
         ${pagingSql(limit, offset)}`,
        [...params, status, status]
      ),
    ]);
    const rawSummary = summaryRows?.[0] || {};
    const summary = Object.fromEntries(
      Object.entries(rawSummary).map(([key, value]) => [key, Number(value || 0)])
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), summary, mentors: rows || [] });
  } catch (error) {
    console.error('Admin mentor reviews list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/review', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const [rows, reviews] = await Promise.all([
      query<any[]>(
        `SELECT
         ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
         ur.mentor_review_note, ur.mentor_qs_top100, ur.mentor_reviewed_at, ur.mentor_reviewed_by_admin_id,
         COALESCE(resume_admin.display_name, resume_admin.username) AS mentor_reviewed_by_admin_name,
         ur.mentor_interview_note, ur.mentor_interviewed_at, ur.mentor_interviewed_by_admin_id,
         COALESCE(interview_admin.display_name, interview_admin.username) AS mentor_interviewed_by_admin_name,
         ur.created_at AS mentor_created_at,
         u.username, u.email, u.account_status, u.last_login_at,
         mp.display_name, mp.gender, mp.degree, mp.school, mp.timezone, mp.courses_json,
         mp.teaching_languages_json, mp.rating, mp.review_count, mp.avatar_url, mp.created_at AS profile_created_at,
         mp.updated_at AS profile_updated_at,
         s.mentor_resume_url, s.availability_json
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       LEFT JOIN admin_users resume_admin ON resume_admin.id = ur.mentor_reviewed_by_admin_id
       LEFT JOIN admin_users interview_admin ON interview_admin.id = ur.mentor_interviewed_by_admin_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
         LIMIT 1`,
        [userId]
      ),
      query<any[]>(
        `SELECT
           csr.id, csr.course_session_id, csr.overall_score,
           csr.clarity_score, csr.communication_score, csr.preparation_score,
           csr.expertise_score, csr.punctuality_score, csr.comment_text,
           csr.created_at, csr.updated_at, cs.starts_at, cs.duration_hours,
           csr.student_user_id AS counterpart_user_id,
           student_role.public_id AS counterpart_public_id,
           COALESCE(student.username, student.email) AS counterpart_name,
           student.email AS counterpart_email, student.account_status AS counterpart_account_status
         FROM course_session_reviews csr
         JOIN course_sessions cs ON cs.id = csr.course_session_id
         JOIN users student ON student.id = csr.student_user_id
         LEFT JOIN user_roles student_role
           ON student_role.user_id = csr.student_user_id AND student_role.role = 'student'
         WHERE csr.mentor_user_id = ?
         ORDER BY csr.created_at DESC, csr.id DESC`,
        [userId]
      ),
    ]);
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });
    mentor.courses = maybeParseJson(mentor.courses_json, []);
    mentor.teachingLanguages = maybeParseJson(mentor.teaching_languages_json, []);
    mentor.availability = maybeParseJson(mentor.availability_json, null);
    mentor.resumeUrls = parseUrlList(mentor.mentor_resume_url);
    mentor.mentor_resume_url = mentor.resumeUrls[0] || null;
    return res.json({ mentor, reviews: reviews || [] });
  } catch (error) {
    console.error('Admin mentor review detail error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/resume-url', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const rows = await query<any[]>(
      `SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`,
      [userId]
    );
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });

    const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
    if (!resumeUrl) return res.status(404).json({ error: '未找到简历' });

    const ossKey = resolveOssKeyFromUrl(resumeUrl);
    if (!ossKey) return res.json({ url: resumeUrl, signed: false });

    const client = getOssClient();
    if (!client) return res.status(500).json({ error: 'OSS 未配置' });

    const fileName = getFileNameFromUrl(resumeUrl);
    const expires = 120;
    const url = client.signatureUrl(ossKey, {
      expires,
      response: {
        'content-disposition': buildContentDisposition(fileName, 'inline'),
      },
    });

    return res.json({
      url,
      signed: true,
      expiresAt: Math.floor(Date.now() / 1000) + expires,
    });
  } catch (error) {
    console.error('Admin mentor resume url error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/resume-preview', async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const auth = req.headers.authorization || '';
    const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const admin = await authenticateAdminToken(bearerToken || req.query.token);
    if (!admin) return res.status(401).json({ error: '后台登录已失效' });

    const rows = await query<any[]>(
      `SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`,
      [userId]
    );
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });

    const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
    if (!resumeUrl) return res.status(404).json({ error: '未找到简历' });

    const ossKey = resolveOssKeyFromUrl(resumeUrl);
    if (!ossKey) return res.redirect(resumeUrl);

    const client = getOssClient();
    if (!client) return res.status(500).json({ error: 'OSS 未配置' });

    const fileName = getFileNameFromUrl(resumeUrl);
    const contentType = getContentTypeFromFileName(fileName) || 'application/octet-stream';
    const result = await client.getStream(ossKey);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(fileName, 'inline'));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Admin-User', admin.username);

    result.stream.on('error', (error: Error) => {
      console.error('Admin mentor resume preview stream error:', error);
      if (!res.headersSent) {
        res.status(500).end('预览失败');
      } else {
        res.end();
      }
    });

    return result.stream.pipe(res);
  } catch (error) {
    console.error('Admin mentor resume preview error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/mentors/:userId/review-decision', requireAdminAuth, async (req: Request, res: Response) => {
  const stage = safeString((req.body as any)?.stage, 20) as MentorReviewStage;
  const decision = safeString((req.body as any)?.decision, 20) as MentorReviewDecision;
  if (stage !== 'resume' && stage !== 'interview') {
    return res.status(400).json({ error: '无效审核阶段' });
  }
  if (decision !== 'pass' && decision !== 'reject') {
    return res.status(400).json({ error: '无效审核结论' });
  }
  return respondMentorReviewDecision(req, res, stage, decision);
});

router.post('/mentors/:userId/approve', requireAdminAuth, async (req: Request, res: Response) => {
  return respondMentorReviewDecision(req, res, 'interview', 'pass');
});

router.post('/mentors/:userId/reject', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const rows = await query<any[]>(
      "SELECT mentor_review_status FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    const status = String(rows?.[0]?.mentor_review_status || '');
    if (!status) return res.status(404).json({ error: '未找到导师申请' });
    if (status === 'pending') return respondMentorReviewDecision(req, res, 'resume', 'reject');
    if (status === 'interview_pending') return respondMentorReviewDecision(req, res, 'interview', 'reject');
    return res.status(409).json({ error: '申请状态已变化，请刷新后重试' });
  } catch (error) {
    console.error('Admin legacy reject mentor error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/orders', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const provider = safeString(req.query.provider, 20);
  const status = safeString(req.query.status, 40).toLowerCase();
  const startDate = safeString(req.query.startDate, 20);
  const endDate = safeString(req.query.endDate, 20);
  const where = ['1=1'];
  const params: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR ur.public_id LIKE ? ESCAPE '\\\\'
      OR bo.provider_order_id LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR bo.id = ? OR u.id = ?' : ''}
    )`);
    params.push(like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id, id);
  }
  if (provider) {
    where.push('bo.provider = ?');
    params.push(provider);
  }
  if (status === 'refund_processing') {
    where.push(`EXISTS (
      SELECT 1 FROM billing_refunds br
      WHERE br.billing_order_id = bo.id
        AND br.status IN ('PROCESSING', 'PENDING')
    )`);
  } else if (status === 'refunded') {
    where.push(`EXISTS (
      SELECT 1 FROM billing_refunds br
      WHERE br.billing_order_id = bo.id
        AND br.status = 'COMPLETED'
    )`);
  } else if (status === 'pending') {
    where.push("bo.status IN ('CREATED', 'APPROVED')");
  } else if (status === 'pending_receipt') {
    where.push("bo.status = 'PENDING_RECEIPT'");
  } else if (status === 'paid') {
    where.push("(bo.credited_at IS NOT NULL OR bo.status IN ('COMPLETED', 'CAPTURED'))");
  } else if (status === 'failed') {
    where.push("bo.status IN ('FAILED', 'VOIDED')");
  } else if (status) {
    where.push('bo.status = ?');
    params.push(status.toUpperCase());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    where.push('bo.created_at >= ?');
    params.push(`${startDate} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    where.push('bo.created_at <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  try {
    await expireStaleBillingOrders();
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         bo.id, bo.user_id, bo.provider, bo.provider_order_id, bo.status, bo.topup_hours,
         bo.unit_price_cny, bo.amount_cny, bo.currency_code, bo.amount_usd, bo.paypal_capture_id,
         bo.remaining_hours,
         COALESCE(refunds.refunded_hours, 0) AS refunded_hours,
         COALESCE(refunds.refunded_amount_cny, 0) AS refunded_amount_cny,
         COALESCE(refunds.pending_refund_hours, 0) AS pending_refund_hours,
         COALESCE(refunds.pending_refund_amount_cny, 0) AS pending_refund_amount_cny,
         CASE
           WHEN COALESCE(refunds.processing_count, 0) > 0 THEN 'PROCESSING'
           WHEN COALESCE(refunds.pending_count, 0) > 0 THEN 'PENDING'
           WHEN COALESCE(refunds.completed_hours, 0) >= bo.topup_hours THEN 'REFUNDED'
           WHEN COALESCE(refunds.completed_count, 0) > 0 THEN 'PARTIALLY_REFUNDED'
           WHEN COALESCE(refunds.failed_count, 0) > 0 THEN 'FAILED'
           ELSE NULL
         END AS refund_status,
         bo.created_at, bo.captured_at, bo.credited_at, bo.updated_at,
         u.email, u.username, u.account_status, ur.public_id AS student_public_id
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       LEFT JOIN (
         SELECT billing_order_id,
                SUM(CASE WHEN status = 'COMPLETED' THEN requested_hours ELSE 0 END) AS refunded_hours,
                SUM(CASE WHEN status = 'COMPLETED' THEN requested_hours ELSE 0 END) AS completed_hours,
                SUM(CASE WHEN status = 'COMPLETED' THEN amount_cny ELSE 0 END) AS refunded_amount_cny,
                SUM(CASE WHEN status IN ('PROCESSING', 'PENDING') THEN requested_hours ELSE 0 END) AS pending_refund_hours,
                SUM(CASE WHEN status IN ('PROCESSING', 'PENDING') THEN amount_cny ELSE 0 END) AS pending_refund_amount_cny,
                SUM(status = 'COMPLETED') AS completed_count,
                SUM(status = 'PROCESSING') AS processing_count,
                SUM(status = 'PENDING') AS pending_count,
                SUM(status = 'FAILED') AS failed_count
         FROM billing_refunds
         GROUP BY billing_order_id
       ) refunds ON refunds.billing_order_id = bo.id
       WHERE ${where.join(' AND ')}
       ORDER BY bo.created_at DESC, bo.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), orders: rows || [] });
  } catch (error) {
    console.error('Admin orders list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/orders/:orderId/confirm-payment', requireAdminAuth, async (req: Request, res: Response) => {
  const orderId = toPositiveInt(req.params.orderId, 0);
  if (!orderId) return res.status(400).json({ error: '无效订单ID' });

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  let before: any = null;
  let after: any = null;
  let alreadyConfirmed = false;

  try {
    await expireStaleBillingOrders();
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [orderRows] = await conn.query<any[]>(
      `SELECT id, user_id, provider, provider_order_id, status, topup_hours,
              amount_cny, remaining_hours, credited_at, captured_at
       FROM billing_orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );
    before = orderRows?.[0];
    if (!before) {
      await conn.rollback();
      return res.status(404).json({ error: '未找到订单' });
    }
    const paymentProvider = String(before.provider || '').toLowerCase();
    if (!['alipay', 'wechat'].includes(paymentProvider)) {
      await conn.rollback();
      return res.status(400).json({ error: '仅支付宝或微信待收款订单支持人工确认' });
    }

    alreadyConfirmed = Boolean(before.credited_at);
    const paymentStatus = String(before.status || '').toUpperCase();
    if (!alreadyConfirmed && !['CREATED', 'APPROVED', 'PENDING_RECEIPT'].includes(paymentStatus)) {
      await conn.rollback();
      return res.status(409).json({ error: '该订单当前不能确认收款，请刷新后重试' });
    }

    if (!alreadyConfirmed) {
      const hours = Number(before.topup_hours);
      if (!Number.isFinite(hours) || hours <= 0) {
        await conn.rollback();
        return res.status(409).json({ error: '订单课时无效，无法确认收款' });
      }

      await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [before.user_id]);
      await conn.query(
        'UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?',
        [hours, before.user_id]
      );
      await conn.query(
        `UPDATE billing_orders
         SET status = 'COMPLETED',
             captured_at = COALESCE(captured_at, CURRENT_TIMESTAMP),
             credited_at = CURRENT_TIMESTAMP,
             remaining_hours = topup_hours,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [orderId]
      );
    }

    const [afterRows] = await conn.query<any[]>(
      `SELECT id, user_id, provider, provider_order_id, status, topup_hours,
              amount_cny, remaining_hours, credited_at, captured_at
       FROM billing_orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    after = afterRows?.[0];
    await conn.commit();
  } catch (error) {
    try {
      await conn?.rollback();
    } catch {}
    console.error('Admin confirm manual payment error:', error);
    return res.status(500).json({ error: '确认收款失败，请稍后再试' });
  } finally {
    conn?.release();
  }

  try {
    if (!alreadyConfirmed) {
      await audit({
        req,
        action: 'order.payment.confirm',
        targetType: 'billing_order',
        targetId: orderId,
        reason: `${String(before?.provider || '').toLowerCase() === 'wechat' ? '微信' : '支付宝'}人工确认收款`,
        before,
        after,
      });
    }
  } catch (error) {
    console.error('Admin confirm manual payment audit error:', error);
  }

  return res.json({ order: after, alreadyConfirmed });
});

router.post('/orders/:orderId/complete-manual-refund', requireAdminAuth, async (req: Request, res: Response) => {
  const orderId = toPositiveInt(req.params.orderId, 0);
  if (!orderId) return res.status(400).json({ error: '无效订单ID' });

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  let before: any[] = [];
  let after: any[] = [];
  let provider = '';
  let completedDisputes: any[] = [];

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [orderRows] = await conn.query<any[]>(
      `SELECT id, provider, credited_at
       FROM billing_orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );
    const order = orderRows?.[0];
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ error: '未找到订单' });
    }

    provider = String(order.provider || '').trim().toLowerCase();
    if (!['alipay', 'wechat'].includes(provider)) {
      await conn.rollback();
      return res.status(400).json({ error: '仅支付宝或微信订单支持人工确认退款' });
    }
    if (!order.credited_at) {
      await conn.rollback();
      return res.status(409).json({ error: '订单尚未确认收款，不能完成退款' });
    }

    const [refundRows] = await conn.query<any[]>(
      `SELECT id, public_id, requested_hours, amount_cny, status, balance_reserved,
              created_at, completed_at
       FROM billing_refunds
       WHERE billing_order_id = ?
       ORDER BY id ASC
       FOR UPDATE`,
      [orderId]
    );
    before = refundRows || [];
    const pendingRefunds = before.filter((refund) => {
      const status = String(refund.status || '').toUpperCase();
      return status === 'PENDING' || status === 'PROCESSING';
    });

    if (!pendingRefunds.length) {
      const alreadyCompleted = before.some(
        (refund) => String(refund.status || '').toUpperCase() === 'COMPLETED'
      );
      if (alreadyCompleted) {
        await conn.commit();
        return res.json({ alreadyCompleted: true, completedRefundCount: 0 });
      }
      await conn.rollback();
      return res.status(409).json({ error: '该订单没有待处理的退款申请' });
    }

    await conn.query(
      `UPDATE billing_refunds
       SET status = 'COMPLETED',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE billing_order_id = ?
         AND provider IN ('alipay', 'wechat')
         AND status IN ('PENDING', 'PROCESSING')`,
      [orderId]
    );

    const [updatedRows] = await conn.query<any[]>(
      `SELECT id, public_id, requested_hours, amount_cny, status, balance_reserved,
              created_at, completed_at
       FROM billing_refunds
       WHERE billing_order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );
    after = updatedRows || [];
    const [candidateDisputes] = await conn.query<any[]>(
      `SELECT DISTINCT csd.id, csd.public_id, csd.student_user_id, csd.outcome_code, csd.result_message, u.email AS student_email
       FROM course_dispute_refunds cdr
       JOIN course_session_disputes csd ON csd.id = cdr.dispute_id
       JOIN users u ON u.id = csd.student_user_id
       WHERE cdr.billing_refund_id IN (${pendingRefunds.map(() => '?').join(',')})`,
      pendingRefunds.map((refund) => refund.id)
    );
    for (const dispute of candidateDisputes || []) {
      const [openRows] = await conn.query<any[]>(
        `SELECT COUNT(*) AS count FROM course_dispute_refunds cdr JOIN billing_refunds br ON br.id = cdr.billing_refund_id WHERE cdr.dispute_id = ? AND br.status <> 'COMPLETED'`,
        [dispute.id]
      );
      if (Number(openRows?.[0]?.count || 0) === 0) {
        await conn.query(`UPDATE course_session_disputes SET status = 'resolved', refund_status = 'completed', resolved_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND status = 'submitted'`, [dispute.id]);
        completedDisputes.push(dispute);
      }
    }
    await conn.commit();

    try {
      await audit({
        req,
        action: 'order.refund.manual.complete',
        targetType: 'billing_order',
        targetId: orderId,
        reason: `${provider === 'wechat' ? '微信' : '支付宝'}人工退款已完成`,
        before,
        after,
      });
    } catch (auditError) {
      console.error('Admin manual refund audit error:', auditError);
    }

    for (const dispute of completedDisputes) {
      await sendCourseDisputeResultMails(Number(dispute.id));
    }

    return res.json({
      alreadyCompleted: false,
      completedRefundCount: pendingRefunds.length,
      completedAmountCny: Number(pendingRefunds.reduce(
        (sum, refund) => sum + Number(refund.amount_cny || 0),
        0
      ).toFixed(2)),
    });
  } catch (error) {
    try { await conn?.rollback(); } catch {}
    console.error('Admin complete manual refund error:', error);
    return res.status(500).json({ error: '确认人工退款失败，请稍后重试' });
  } finally {
    conn?.release();
  }
});

router.patch('/orders/:orderId/status', requireAdminAuth, async (req: Request, res: Response) => {
  const orderId = toPositiveInt(req.params.orderId, 0);
  const status = safeString((req.body as any)?.status, 40).toUpperCase();
  const reason = readReason(req);
  if (!orderId) return res.status(400).json({ error: '无效订单ID' });
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: '无效订单状态' });
  if (!reason) return res.status(400).json({ error: '请填写操作原因' });

  try {
    const beforeRows = await query<any[]>('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到订单' });
    await query('UPDATE billing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
    const afterRows = await query<any[]>('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
    const after = afterRows?.[0];
    await audit({ req, action: 'order.status.update', targetType: 'billing_order', targetId: orderId, reason, before, after });
    return res.json({ order: after });
  } catch (error) {
    console.error('Admin update order status error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/classrooms', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const status = safeString(req.query.status, 30).toLowerCase();
  const lessonHoursStatus = safeString(req.query.lessonHoursStatus, 40).toLowerCase();
  const replayStatus = safeString(req.query.replayStatus, 30).toLowerCase();
  const startDate = safeString(req.query.startDate, 20);
  const endDate = safeString(req.query.endDate, 20);
  const where = ['1=1'];
  const params: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      su.email LIKE ? ESCAPE '\\\\'
      OR su.username LIKE ? ESCAPE '\\\\'
      OR mu.email LIKE ? ESCAPE '\\\\'
      OR mu.username LIKE ? ESCAPE '\\\\'
      OR sr.public_id LIKE ? ESCAPE '\\\\'
      OR mr.public_id LIKE ? ESCAPE '\\\\'
      OR mp.display_name LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR cs.id = ?' : ''}
    )`);
    params.push(like, like, like, like, like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id);
  }
  if (CLASSROOM_STATUSES.has(status)) {
    if (status === 'scheduled') {
      where.push("cs.status = 'scheduled' AND TIMESTAMPADD(MINUTE, ROUND(cs.duration_hours * 60), cs.starts_at) > UTC_TIMESTAMP()");
    } else if (status === 'completed') {
      where.push("(cs.status = 'completed' OR (cs.status = 'scheduled' AND TIMESTAMPADD(MINUTE, ROUND(cs.duration_hours * 60), cs.starts_at) <= UTC_TIMESTAMP()))");
    } else {
      where.push('cs.status = ?');
      params.push(status);
    }
  }
  if (LESSON_HOURS_STATUSES.has(lessonHoursStatus)) {
    if (lessonHoursStatus === 'none') {
      where.push('latest_lhc.id IS NULL');
    } else if (lessonHoursStatus === 'confirmed') {
      where.push("latest_lhc.status IN ('confirmed', 'dispute_confirmed')");
    } else {
      where.push('latest_lhc.status = ?');
      params.push(lessonHoursStatus);
    }
  }
  if (REPLAY_STATUSES.has(replayStatus)) {
    if (replayStatus === 'none') {
      where.push('COALESCE(rec.recording_count, 0) = 0');
    } else if (replayStatus === 'running') {
      where.push('COALESCE(rec.active_recording_count, 0) > 0');
    } else if (replayStatus === 'ready') {
      where.push('COALESCE(rec.stopped_recording_count, 0) > 0');
    } else if (replayStatus === 'failed') {
      where.push("COALESCE(rec.recording_count, 0) > 0 AND COALESCE(rec.active_recording_count, 0) = 0 AND COALESCE(rec.stopped_recording_count, 0) = 0 AND rec.latest_recording_status = 'failed'");
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    where.push('cs.starts_at >= ?');
    params.push(`${startDate} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    where.push('cs.starts_at <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  const joins = `
    FROM course_sessions cs
    JOIN users su ON su.id = cs.student_user_id
    JOIN users mu ON mu.id = cs.mentor_user_id
    LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
    LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
    LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
    LEFT JOIN (
      SELECT lhc.*
      FROM lesson_hour_confirmations lhc
      INNER JOIN (
        SELECT course_session_id, MAX(id) AS latest_id
        FROM lesson_hour_confirmations
        GROUP BY course_session_id
      ) picked ON picked.latest_id = lhc.id
    ) latest_lhc ON latest_lhc.course_session_id = cs.id
    LEFT JOIN (
      SELECT
        course_session_id,
        COUNT(*) AS recording_count,
        SUM(CASE WHEN status IN ('starting','running','stopping') THEN 1 ELSE 0 END) AS active_recording_count,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) AS stopped_recording_count,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY id DESC SEPARATOR ','), ',', 1) AS latest_recording_status
      FROM classroom_recordings
      GROUP BY course_session_id
    ) rec ON rec.course_session_id = cs.id
    LEFT JOIN course_session_reviews csr ON csr.course_session_id = cs.id
    LEFT JOIN course_session_disputes csd ON csd.course_session_id = cs.id
  `;

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total ${joins} WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         cs.id, cs.student_user_id, cs.mentor_user_id, cs.course_direction, cs.course_type,
         cs.starts_at, cs.duration_hours, cs.status, cs.created_at, cs.updated_at,
         sr.public_id AS student_public_id, su.email AS student_email, su.username AS student_username,
         mr.public_id AS mentor_public_id, mu.email AS mentor_email, mu.username AS mentor_username,
         mp.display_name AS mentor_display_name,
         latest_lhc.status AS lesson_hours_status,
         latest_lhc.proposed_hours, latest_lhc.disputed_hours, latest_lhc.final_hours,
         latest_lhc.responded_at, latest_lhc.settled_at,
         COALESCE(rec.recording_count, 0) AS recording_count,
         COALESCE(rec.active_recording_count, 0) AS active_recording_count,
         COALESCE(rec.stopped_recording_count, 0) AS stopped_recording_count,
         rec.latest_recording_status,
         csr.id AS review_id, csr.overall_score AS review_overall_score, csr.created_at AS review_created_at
         ,csd.public_id AS course_dispute_id, csd.id AS course_dispute_internal_id, csd.status AS course_dispute_status
       ${joins}
       WHERE ${where.join(' AND ')}
       ORDER BY cs.starts_at DESC, cs.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );

    const classrooms = (rows || []).map((row) => ({
      ...row,
      startsAt: toIsoString(row.starts_at),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
      effectiveStatus: getEffectiveClassroomStatus(row),
      replayStatus: getReplayStatus(row),
      reviewStatus: getReviewStatus(row),
    }));

    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), classrooms });
  } catch (error) {
    console.error('Admin classrooms list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/classrooms/:courseId', requireAdminAuth, async (req: Request, res: Response) => {
  const courseId = toPositiveInt(req.params.courseId, 0);
  if (!courseId) return res.status(400).json({ error: '无效课堂ID' });

  try {
    const rows = await query<any[]>(
      `SELECT
         cs.*,
         sr.public_id AS student_public_id, su.email AS student_email, su.username AS student_username,
         mr.public_id AS mentor_public_id, mu.email AS mentor_email, mu.username AS mentor_username,
         mp.display_name AS mentor_display_name,
         csr.id AS review_id, csr.clarity_score, csr.communication_score, csr.preparation_score,
         csr.expertise_score, csr.punctuality_score, csr.comment_text, csr.overall_score,
         csr.created_at AS review_created_at, csr.updated_at AS review_updated_at
         ,csd.public_id AS course_dispute_id, csd.id AS course_dispute_internal_id, csd.status AS course_dispute_status
       FROM course_sessions cs
       JOIN users su ON su.id = cs.student_user_id
       JOIN users mu ON mu.id = cs.mentor_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
       LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
       LEFT JOIN course_session_disputes csd ON csd.course_session_id = cs.id
       LEFT JOIN course_session_reviews csr ON csr.course_session_id = cs.id
       WHERE cs.id = ?
       LIMIT 1`,
      [courseId]
    );
    const classroom = rows?.[0];
    if (!classroom) return res.status(404).json({ error: '未找到课堂' });

    const [lessonRows, recordingRows] = await Promise.all([
      query<any[]>(
        `SELECT lhc.*, responded.email AS responded_by_email
         FROM lesson_hour_confirmations lhc
         LEFT JOIN users responded ON responded.id = lhc.responded_by_user_id
         WHERE lhc.course_session_id = ?
         ORDER BY lhc.id DESC
         LIMIT 1`,
        [courseId]
      ),
      query<any[]>(
        `SELECT cr.*, starter.email AS started_by_email
         FROM classroom_recordings cr
         LEFT JOIN users starter ON starter.id = cr.started_by_user_id
         WHERE cr.course_session_id = ?
         ORDER BY cr.id DESC`,
        [courseId]
      ),
    ]);

    const recordings = (recordingRows || []).map((row) => ({
      ...row,
      startedAt: toIsoString(row.started_at),
      stopRequestedAt: toIsoString(row.stop_requested_at),
      stoppedAt: toIsoString(row.stopped_at),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    }));
    const replayStatus = getReplayStatus({
      recording_count: recordings.length,
      active_recording_count: recordings.filter((r: any) => ['starting', 'running', 'stopping'].includes(safeString(r.status, 30))).length,
      stopped_recording_count: recordings.filter((r: any) => safeString(r.status, 30) === 'stopped').length,
      latest_recording_status: recordings[0]?.status,
    });

    const detail = {
      ...classroom,
      startsAt: toIsoString(classroom.starts_at),
      createdAt: toIsoString(classroom.created_at),
      updatedAt: toIsoString(classroom.updated_at),
      effectiveStatus: getEffectiveClassroomStatus(classroom),
      replayStatus,
      reviewStatus: getReviewStatus(classroom),
      review: classroom.review_id == null ? null : {
        id: String(classroom.review_id),
        overallScore: toNumber(classroom.overall_score, 0),
        scores: {
          clarity: toNumber(classroom.clarity_score, 0),
          communication: toNumber(classroom.communication_score, 0),
          preparation: toNumber(classroom.preparation_score, 0),
          expertise: toNumber(classroom.expertise_score, 0),
          punctuality: toNumber(classroom.punctuality_score, 0),
        },
        comment: safeString(classroom.comment_text, 4000),
        createdAt: toIsoString(classroom.review_created_at),
        updatedAt: toIsoString(classroom.review_updated_at),
      },
      latestLessonHours: lessonRows?.[0] || null,
      recordings,
    };

    return res.json({ classroom: detail });
  } catch (error) {
    console.error('Admin classroom detail error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch('/classrooms/:courseId/lesson-hours/final-decision', requireAdminAuth, async (req: Request, res: Response) => {
  const courseId = toPositiveInt(req.params.courseId, 0);
  const decision = safeString((req.body as any)?.decision, 40).toLowerCase();
  const reason = readReason(req, 4);
  if (!courseId) return res.status(400).json({ error: '无效课堂ID' });
  if (decision !== 'mentor_proposed' && decision !== 'student_disputed') {
    return res.status(400).json({ error: '请选择采信导师提交课时或学生争议课时' });
  }
  if (!reason) return res.status(400).json({ error: '请填写裁决依据' });

  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  let before: any = null;
  let after: any = null;
  try {
    await ensureMentorRecommendationColumns();
    await ensureLessonHourReservationSchema();
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute<any[]>(
      `SELECT
         lhc.id, lhc.message_item_id, lhc.thread_id, lhc.course_session_id,
         lhc.student_user_id, lhc.mentor_user_id, lhc.proposed_hours,
         lhc.disputed_hours, lhc.final_hours, lhc.status,
         cs.duration_hours AS session_duration_hours, cs.status AS session_status
       FROM lesson_hour_confirmations lhc
       INNER JOIN course_sessions cs ON cs.id = lhc.course_session_id
       WHERE lhc.course_session_id = ?
       ORDER BY lhc.id DESC
       LIMIT 1
       FOR UPDATE`,
      [courseId]
    );
    before = rows?.[0];
    if (!before) {
      await conn.rollback();
      return res.status(404).json({ error: '未找到课时确认记录' });
    }
    if (safeString(before.status, 40).toLowerCase() !== 'platform_review') {
      await conn.rollback();
      return res.status(409).json({ error: '当前课时确认不在平台介入状态' });
    }

    const proposedHours = toNumber(before.proposed_hours, 0);
    const disputedHours = toNumber(before.disputed_hours, 0);
    const finalHours = decision === 'mentor_proposed' ? proposedHours : disputedHours;
    if (!Number.isFinite(finalHours) || finalHours <= 0) {
      await conn.rollback();
      return res.status(409).json({ error: '待裁决课时数据不完整，请刷新后重试' });
    }

    await conn.execute(
      `UPDATE lesson_hour_confirmations
       SET status = 'dispute_confirmed',
           final_hours = ?,
           responded_by_user_id = NULL,
           responded_at = CURRENT_TIMESTAMP,
           settled_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [finalHours, Number(before.id)]
    );
    await conn.execute(
      `UPDATE course_sessions
       SET duration_hours = ?, status = 'completed'
       WHERE id = ?`,
      [finalHours, courseId]
    );
    await recomputeMentorCompletedSessionCount(conn, Number(before.mentor_user_id));
    await settleLessonHours(
      conn,
      Number(before.student_user_id),
      courseId,
      finalHours
    );
    await conn.execute(
      `UPDATE message_threads
       SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [Number(before.message_item_id), Number(before.thread_id)]
    );

    const [afterRows] = await conn.execute<any[]>(
      `SELECT lhc.*, cs.duration_hours AS session_duration_hours, cs.status AS session_status
       FROM lesson_hour_confirmations lhc
       INNER JOIN course_sessions cs ON cs.id = lhc.course_session_id
       WHERE lhc.id = ?
       LIMIT 1`,
      [Number(before.id)]
    );
    after = afterRows?.[0] || null;
    await conn.commit();
  } catch (error) {
    try { await conn?.rollback(); } catch {}
    if (isWalletHoursError(error)) {
      return res.status(409).json({ code: error.code, error: error.message });
    }
    console.error('Admin classroom lesson hours final decision error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  } finally {
    try { conn?.release(); } catch {}
  }

  try {
    await audit({
      req,
      action: 'classroom.lesson_hours.final_decision',
      targetType: 'course_session',
      targetId: courseId,
      reason,
      before,
      after: { ...after, decision },
    });
  } catch (error) {
    console.error('Admin classroom lesson hours audit error:', error);
  }

  const notificationResults = await Promise.allSettled([
    sendLessonHoursFinalDecisionMail({
      recipientUserId: Number(before.student_user_id),
      recipientRole: 'student',
      finalHours: Number(after.final_hours),
      decision,
      reason,
    }),
    sendLessonHoursFinalDecisionMail({
      recipientUserId: Number(before.mentor_user_id),
      recipientRole: 'mentor',
      finalHours: Number(after.final_hours),
      decision,
      reason,
    }),
  ]);
  notificationResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Lesson hours final decision ${index === 0 ? 'student' : 'mentor'} mail error:`, result.reason);
    }
  });

  return res.json({ ok: true, classroomId: String(courseId), decision, lessonHours: after });
});

router.get('/classrooms/:courseId/chat', requireAdminAuth, async (req: Request, res: Response) => {
  const courseId = toPositiveInt(req.params.courseId, 0);
  if (!courseId) return res.status(400).json({ error: '无效课堂ID' });

  try {
    const rows = await query<any[]>(
      `SELECT
         cm.id, cm.sender_user_id, cm.message_type, cm.text_content, cm.created_at,
         CASE
           WHEN cm.sender_user_id = cs.student_user_id THEN 'student'
           WHEN cm.sender_user_id = cs.mentor_user_id THEN 'mentor'
           ELSE ''
         END AS sender_role,
         u.email, u.username,
         sr.public_id AS student_public_id,
         mr.public_id AS mentor_public_id,
         ctf.file_id, ctf.original_file_name, ctf.content_type, ctf.size_bytes, ctf.ext, ctf.cleanup_status
       FROM classroom_messages cm
       INNER JOIN course_sessions cs ON cs.id = cm.classroom_id
       LEFT JOIN users u ON u.id = cm.sender_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cm.sender_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cm.sender_user_id AND mr.role = 'mentor'
       LEFT JOIN classroom_temp_files ctf ON ctf.classroom_id = cm.classroom_id AND ctf.file_id = cm.file_id
       WHERE cm.classroom_id = ?
       ORDER BY cm.id ASC`,
      [courseId]
    );

    const messages = (rows || []).map((row) => ({
      id: String(row.id),
      senderUserId: Number(row.sender_user_id),
      senderLabel: (
        row.sender_role === 'student'
          ? row.student_public_id
          : (row.sender_role === 'mentor' ? row.mentor_public_id : '')
      ) || row.username || row.email || `User ${row.sender_user_id}`,
      senderRole: safeString(row.sender_role, 20),
      messageType: safeString(row.message_type, 20),
      textContent: safeString(row.text_content, 4000),
      createdAt: toIsoString(row.created_at),
      file: row.file_id ? {
        fileId: safeString(row.file_id, 32),
        fileName: safeString(row.original_file_name, 255),
        contentType: safeString(row.content_type, 128),
        sizeBytes: toNumber(row.size_bytes, 0),
        ext: safeString(row.ext, 16),
        cleanupStatus: safeString(row.cleanup_status, 20),
      } : null,
    }));

    return res.json({ courseId: String(courseId), messages });
  } catch (error) {
    console.error('Admin classroom chat error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/classrooms/:courseId/replay-files', requireAdminAuth, async (req: Request, res: Response) => {
  const courseId = toPositiveInt(req.params.courseId, 0);
  if (!courseId) return res.status(400).json({ error: '无效课堂ID' });

  try {
    await ensureClassroomRecordingsTable();
    const recordingRows = await query<Array<{ storage_prefix: string | null }>>(
      `SELECT storage_prefix
       FROM classroom_recordings
       WHERE course_session_id = ?
         AND status IN ('running', 'stopping', 'stopped')
       ORDER BY id DESC
       LIMIT 20`,
      [courseId]
    );
    const storagePrefixes = Array.from(new Set((recordingRows || [])
      .map((row) => safeString(row.storage_prefix, 512))
      .filter(Boolean)));
    const replayFiles = await listReplayMp4Files(storagePrefixes);
    if (!replayFiles) return res.status(500).json({ error: 'recording_storage_unconfigured' });
    return res.json({ courseId: String(courseId), files: replayFiles.files, expiresAt: replayFiles.expiresAt });
  } catch (error) {
    console.error('Admin classroom replay files error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/classrooms/:courseId/observer-auth', requireAdminAuth, async (req: Request, res: Response) => {
  const courseId = toPositiveInt(req.params.courseId, 0);
  if (!courseId) return res.status(400).json({ error: '无效课堂ID' });

  const runtime = getAliyunLiveRuntimeConfig();
  if (!runtime) return res.status(500).json({ error: '实时音视频配置缺失' });

  try {
    const rows = await query<any[]>(
      `SELECT
         cs.id, cs.status, cs.starts_at, cs.duration_hours,
         cs.student_user_id, cs.mentor_user_id,
         sr.public_id AS student_public_id,
         mr.public_id AS mentor_public_id,
         su.username AS student_username,
         mu.username AS mentor_username,
         mp.display_name AS mentor_display_name
       FROM course_sessions cs
       LEFT JOIN users su ON su.id = cs.student_user_id
       LEFT JOIN users mu ON mu.id = cs.mentor_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
       LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
       WHERE cs.id = ?
       LIMIT 1`,
      [courseId]
    );
    const classroom = rows?.[0];
    if (!classroom) return res.status(404).json({ error: '未找到课堂' });

    const roomId = `course_${courseId}`;
    const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const studentPublicId = safeString(classroom.student_public_id, 64) || `s${classroom.student_user_id}`;
    const mentorPublicId = safeString(classroom.mentor_public_id, 64) || `m${classroom.mentor_user_id}`;
    const studentAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId,
      userId: studentPublicId,
      timestamp: expires,
    });
    const mentorAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId,
      userId: mentorPublicId,
      timestamp: expires,
    });

    return res.json({
      courseId: String(courseId),
      provider: getClassroomRtcProvider(),
      mode: 'readonly-observer',
      observerToken: createClassroomObserverToken(courseId, Number(req.admin?.adminId || 0)),
      roomId,
      expiresAt: new Date(expires * 1000).toISOString(),
      status: classroom.status,
      effectiveStatus: getEffectiveClassroomStatus(classroom),
      startsAt: toIsoString(classroom.starts_at),
      durationHours: toNumber(classroom.duration_hours, 0),
      streams: [
        {
          role: 'student',
          userId: studentPublicId,
          label: safeString(classroom.student_username, 100) || studentPublicId,
          authInfo: toAliRtcSdkAuthInfo(studentAuth),
          playUrl: studentAuth.playUrl,
        },
        {
          role: 'mentor',
          userId: mentorPublicId,
          label: safeString(classroom.mentor_display_name, 100) || safeString(classroom.mentor_username, 100) || mentorPublicId,
          authInfo: toAliRtcSdkAuthInfo(mentorAuth),
          playUrl: mentorAuth.playUrl,
        },
      ],
    });
  } catch (error) {
    console.error('Admin classroom observer auth error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentor-payroll', requireAdminAuth, async (req: Request, res: Response) => {
  const month = parsePayrollMonth(req.query.month);
  if (!month) return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
  const { start, end } = getPayrollMonthRange(month);
  const defaultHourlyRate = getDefaultMentorHourlyRate();
  try {
    const rows = await query<any[]>(
      `SELECT u.id AS mentor_user_id, u.email, ur.public_id AS mentor_public_id,
              COALESCE(NULLIF(mp.display_name, ''), NULLIF(u.username, ''), u.email) AS mentor_name,
              COALESCE(mpp.hourly_rate_cny, ?) AS configured_hourly_rate_cny,
              COALESCE(mpp.china_tax_resident, 1) AS configured_china_tax_resident,
              COALESCE(earned.settled_hours, 0) AS current_settled_hours,
              pay.id AS payment_id, pay.settled_hours AS paid_settled_hours,
              pay.hourly_rate_cny AS paid_hourly_rate_cny, pay.gross_income_cny AS paid_gross_income_cny,
              pay.china_tax_resident AS paid_china_tax_resident, pay.taxable_income_cny AS paid_taxable_income_cny,
              pay.withheld_tax_cny AS paid_withheld_tax_cny, pay.net_income_cny AS paid_net_income_cny,
              pay.status AS payment_status, pay.payment_reference, pay.note_text, pay.paid_at
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = u.id
       LEFT JOIN mentor_payroll_profiles mpp ON mpp.mentor_user_id = u.id
       LEFT JOIN (
         SELECT lhc.mentor_user_id, SUM(lhc.final_hours) AS settled_hours
         FROM lesson_hour_confirmations lhc
         WHERE lhc.final_hours IS NOT NULL
           AND lhc.status IN ('confirmed', 'dispute_confirmed')
           AND COALESCE(lhc.settled_at, lhc.updated_at) >= ?
           AND COALESCE(lhc.settled_at, lhc.updated_at) < ?
           AND lhc.id = (
             SELECT MAX(latest.id) FROM lesson_hour_confirmations latest
             WHERE latest.course_session_id = lhc.course_session_id
           )
         GROUP BY lhc.mentor_user_id
       ) earned ON earned.mentor_user_id = u.id
       LEFT JOIN mentor_payroll_payments pay
         ON pay.mentor_user_id = u.id AND pay.payroll_month = ?
       WHERE ur.role = 'mentor' AND ur.mentor_approved = 1
       ORDER BY COALESCE(pay.gross_income_cny, earned.settled_hours * COALESCE(mpp.hourly_rate_cny, ?)) DESC,
                ur.public_id ASC`,
      [defaultHourlyRate, start, end, month, defaultHourlyRate]
    );

    const payroll = (rows || []).map((row) => {
      const paid = Boolean(row.payment_id) && String(row.payment_status || '').toLowerCase() === 'paid';
      const settledHours = toNumber(paid ? row.paid_settled_hours : row.current_settled_hours);
      const hourlyRateCny = toNumber(paid ? row.paid_hourly_rate_cny : row.configured_hourly_rate_cny, defaultHourlyRate);
      const grossIncomeCny = Number((paid ? toNumber(row.paid_gross_income_cny) : settledHours * hourlyRateCny).toFixed(2));
      const chinaTaxResident = Boolean(Number(paid ? row.paid_china_tax_resident : row.configured_china_tax_resident));
      const calculated = calculateMentorPayroll(grossIncomeCny, chinaTaxResident);
      return {
        mentorUserId: Number(row.mentor_user_id),
        mentorId: safeString(row.mentor_public_id, 64),
        mentorName: safeString(row.mentor_name, 120),
        email: safeString(row.email, 255),
        month,
        settledHours,
        hourlyRateCny,
        grossIncomeCny,
        chinaTaxResident,
        taxableIncomeCny: paid ? toNumber(row.paid_taxable_income_cny) : calculated.taxableIncomeCny,
        withheldTaxCny: paid ? toNumber(row.paid_withheld_tax_cny) : calculated.withheldTaxCny,
        netIncomeCny: paid ? toNumber(row.paid_net_income_cny) : calculated.netIncomeCny,
        status: paid ? 'paid' : 'pending',
        paymentReference: safeString(row.payment_reference, 120),
        note: safeString(row.note_text, 1000),
        paidAt: paid ? toIsoString(row.paid_at) : '',
      };
    });
    const summary = payroll.reduce((acc, item) => {
      acc.grossIncomeCny += item.grossIncomeCny;
      acc.withheldTaxCny += item.withheldTaxCny;
      acc.netIncomeCny += item.netIncomeCny;
      if (item.status === 'paid') acc.paidCount += 1;
      else if (item.grossIncomeCny > 0) acc.pendingCount += 1;
      return acc;
    }, { grossIncomeCny: 0, withheldTaxCny: 0, netIncomeCny: 0, paidCount: 0, pendingCount: 0 });
    summary.grossIncomeCny = Number(summary.grossIncomeCny.toFixed(2));
    summary.withheldTaxCny = Number(summary.withheldTaxCny.toFixed(2));
    summary.netIncomeCny = Number(summary.netIncomeCny.toFixed(2));
    return res.json({ month, defaultHourlyRate, payroll, summary });
  } catch (error) {
    console.error('Admin mentor payroll list error:', error);
    return res.status(500).json({ error: '导师薪资加载失败' });
  }
});

router.put('/mentor-payroll/:mentorUserId/profile', requireAdminAuth, async (req: Request, res: Response) => {
  const mentorUserId = toPositiveInt(req.params.mentorUserId, 0);
  const hourlyRateCny = Number((req.body as any)?.hourlyRateCny);
  const chinaTaxResident = (req.body as any)?.chinaTaxResident;
  if (!mentorUserId) return res.status(400).json({ error: '导师 ID 无效' });
  if (!Number.isFinite(hourlyRateCny) || hourlyRateCny <= 0 || hourlyRateCny > 100000) {
    return res.status(400).json({ error: '时薪必须在 0 至 100000 元之间' });
  }
  if (typeof chinaTaxResident !== 'boolean') return res.status(400).json({ error: '请选择是否在中国纳税' });
  try {
    const mentors = await query<any[]>(
      "SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'mentor' AND mentor_approved = 1 LIMIT 1",
      [mentorUserId]
    );
    if (!mentors?.length) return res.status(404).json({ error: '未找到已通过审核的导师' });
    const beforeRows = await query<any[]>('SELECT * FROM mentor_payroll_profiles WHERE mentor_user_id = ? LIMIT 1', [mentorUserId]);
    await query(
      `INSERT INTO mentor_payroll_profiles (mentor_user_id, hourly_rate_cny, china_tax_resident, updated_by_admin_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hourly_rate_cny = VALUES(hourly_rate_cny),
         china_tax_resident = VALUES(china_tax_resident), updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [mentorUserId, Number(hourlyRateCny.toFixed(2)), chinaTaxResident ? 1 : 0, req.admin?.adminId || null]
    );
    const after = { mentorUserId, hourlyRateCny: Number(hourlyRateCny.toFixed(2)), chinaTaxResident };
    await audit({ req, action: 'mentor_payroll.profile.update', targetType: 'mentor', targetId: mentorUserId, before: beforeRows?.[0], after });
    return res.json({ profile: after });
  } catch (error) {
    console.error('Admin mentor payroll profile update error:', error);
    return res.status(500).json({ error: '薪资配置保存失败' });
  }
});

router.patch('/mentor-payroll/:mentorUserId/status', requireAdminAuth, async (req: Request, res: Response) => {
  const mentorUserId = toPositiveInt(req.params.mentorUserId, 0);
  const month = parsePayrollMonth((req.body as any)?.month);
  const nextStatus = safeString((req.body as any)?.status, 20).toLowerCase();
  if (!mentorUserId || !month || !['pending', 'paid'].includes(nextStatus)) {
    return res.status(400).json({ error: '导师、月份或发放状态无效' });
  }
  const { start, end } = getPayrollMonthRange(month);
  const defaultHourlyRate = getDefaultMentorHourlyRate();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [profileRows] = await conn.query<any[]>(
      `SELECT ur.public_id, COALESCE(mpp.hourly_rate_cny, ?) AS hourly_rate_cny,
              COALESCE(mpp.china_tax_resident, 1) AS china_tax_resident
       FROM user_roles ur
       LEFT JOIN mentor_payroll_profiles mpp ON mpp.mentor_user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor' AND ur.mentor_approved = 1 LIMIT 1 FOR UPDATE`,
      [defaultHourlyRate, mentorUserId]
    );
    const profile = profileRows?.[0];
    if (!profile) throw Object.assign(new Error('未找到已通过审核的导师'), { statusCode: 404 });
    const [existingRows] = await conn.query<any[]>(
      'SELECT * FROM mentor_payroll_payments WHERE mentor_user_id = ? AND payroll_month = ? FOR UPDATE',
      [mentorUserId, month]
    );
    const before = existingRows?.[0] || { mentorUserId, month, status: 'pending' };
    let after: any;

    if (nextStatus === 'pending') {
      if (existingRows?.length) {
        await conn.query(
          `UPDATE mentor_payroll_payments
           SET status = 'pending', paid_by_admin_id = ?
           WHERE mentor_user_id = ? AND payroll_month = ?`,
          [req.admin?.adminId || null, mentorUserId, month]
        );
      }
      after = { mentorUserId, month, status: 'pending' };
    } else {
      const [hourRows] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(lhc.final_hours), 0) AS settled_hours
         FROM lesson_hour_confirmations lhc
         WHERE lhc.mentor_user_id = ? AND lhc.final_hours IS NOT NULL
           AND lhc.status IN ('confirmed', 'dispute_confirmed')
           AND COALESCE(lhc.settled_at, lhc.updated_at) >= ?
           AND COALESCE(lhc.settled_at, lhc.updated_at) < ?
           AND lhc.id = (SELECT MAX(latest.id) FROM lesson_hour_confirmations latest WHERE latest.course_session_id = lhc.course_session_id)`,
        [mentorUserId, start, end]
      );
      const settledHours = Number(toNumber(hourRows?.[0]?.settled_hours).toFixed(2));
      const hourlyRateCny = Number(toNumber(profile.hourly_rate_cny, defaultHourlyRate).toFixed(2));
      const grossIncomeCny = Number((settledHours * hourlyRateCny).toFixed(2));
      const chinaTaxResident = Boolean(Number(profile.china_tax_resident));
      const tax = calculateMentorPayroll(grossIncomeCny, chinaTaxResident);
      await conn.query(
        `INSERT INTO mentor_payroll_payments
          (mentor_user_id, payroll_month, settled_hours, hourly_rate_cny, gross_income_cny,
           china_tax_resident, taxable_income_cny, withheld_tax_cny, net_income_cny,
           status, paid_at, paid_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', CURRENT_TIMESTAMP, ?)
         ON DUPLICATE KEY UPDATE settled_hours = VALUES(settled_hours),
           hourly_rate_cny = VALUES(hourly_rate_cny), gross_income_cny = VALUES(gross_income_cny),
           china_tax_resident = VALUES(china_tax_resident), taxable_income_cny = VALUES(taxable_income_cny),
           withheld_tax_cny = VALUES(withheld_tax_cny), net_income_cny = VALUES(net_income_cny),
           status = 'paid', paid_at = CURRENT_TIMESTAMP, paid_by_admin_id = VALUES(paid_by_admin_id)`,
        [mentorUserId, month, settledHours, hourlyRateCny, grossIncomeCny, chinaTaxResident ? 1 : 0,
          tax.taxableIncomeCny, tax.withheldTaxCny, tax.netIncomeCny, req.admin?.adminId || null]
      );
      after = { mentorUserId, month, status: 'paid', settledHours, hourlyRateCny, grossIncomeCny, chinaTaxResident, ...tax };
    }

    await conn.query(
      `INSERT INTO admin_audit_logs
        (admin_id, action, target_type, target_id, before_json, after_json, ip, user_agent)
       VALUES (?, 'mentor_payroll.status.update', 'mentor_payroll', ?, ?, ?, ?, ?)`,
      [req.admin?.adminId || null, `${mentorUserId}:${month}`, jsonOrNull(before), jsonOrNull(after),
        safeString(req.ip || '', 45) || null, safeString(req.get('user-agent') || '', 255) || null]
    );
    await conn.commit();
    return res.json({ payroll: after });
  } catch (error: any) {
    await conn.rollback();
    console.error('Admin mentor payroll status update error:', error);
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || '发放状态更新失败' });
  } finally {
    conn.release();
  }
});

router.post('/mentor-payroll/:mentorUserId/pay', requireAdminAuth, async (req: Request, res: Response) => {
  const mentorUserId = toPositiveInt(req.params.mentorUserId, 0);
  const month = parsePayrollMonth((req.body as any)?.month);
  const paymentReference = safeString((req.body as any)?.paymentReference, 120);
  const note = safeString((req.body as any)?.note, 1000);
  if (!mentorUserId || !month) return res.status(400).json({ error: '导师或月份无效' });
  const { start, end } = getPayrollMonthRange(month);
  const defaultHourlyRate = getDefaultMentorHourlyRate();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existingRows] = await conn.query<any[]>(
      'SELECT id FROM mentor_payroll_payments WHERE mentor_user_id = ? AND payroll_month = ? FOR UPDATE',
      [mentorUserId, month]
    );
    if (existingRows?.length) throw Object.assign(new Error('该导师本月薪资已发放，请勿重复操作'), { statusCode: 409 });
    const [profileRows] = await conn.query<any[]>(
      `SELECT ur.public_id, COALESCE(mpp.hourly_rate_cny, ?) AS hourly_rate_cny,
              COALESCE(mpp.china_tax_resident, 1) AS china_tax_resident
       FROM user_roles ur
       LEFT JOIN mentor_payroll_profiles mpp ON mpp.mentor_user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor' AND ur.mentor_approved = 1 LIMIT 1 FOR UPDATE`,
      [defaultHourlyRate, mentorUserId]
    );
    const profile = profileRows?.[0];
    if (!profile) throw Object.assign(new Error('未找到已通过审核的导师'), { statusCode: 404 });
    const [hourRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(lhc.final_hours), 0) AS settled_hours
       FROM lesson_hour_confirmations lhc
       WHERE lhc.mentor_user_id = ? AND lhc.final_hours IS NOT NULL
         AND lhc.status IN ('confirmed', 'dispute_confirmed')
         AND COALESCE(lhc.settled_at, lhc.updated_at) >= ?
         AND COALESCE(lhc.settled_at, lhc.updated_at) < ?
         AND lhc.id = (SELECT MAX(latest.id) FROM lesson_hour_confirmations latest WHERE latest.course_session_id = lhc.course_session_id)`,
      [mentorUserId, start, end]
    );
    const settledHours = Number(toNumber(hourRows?.[0]?.settled_hours).toFixed(2));
    const hourlyRateCny = Number(toNumber(profile.hourly_rate_cny, defaultHourlyRate).toFixed(2));
    const grossIncomeCny = Number((settledHours * hourlyRateCny).toFixed(2));
    if (grossIncomeCny <= 0) throw Object.assign(new Error('该导师本月暂无可发放收入'), { statusCode: 422 });
    const chinaTaxResident = Boolean(Number(profile.china_tax_resident));
    const tax = calculateMentorPayroll(grossIncomeCny, chinaTaxResident);
    const [insertResult] = await conn.query<any>(
      `INSERT INTO mentor_payroll_payments
        (mentor_user_id, payroll_month, settled_hours, hourly_rate_cny, gross_income_cny,
         china_tax_resident, taxable_income_cny, withheld_tax_cny, net_income_cny,
         payment_reference, note_text, paid_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mentorUserId, month, settledHours, hourlyRateCny, grossIncomeCny, chinaTaxResident ? 1 : 0,
        tax.taxableIncomeCny, tax.withheldTaxCny, tax.netIncomeCny,
        paymentReference || null, note || null, req.admin?.adminId || null]
    );
    const after = { id: Number(insertResult.insertId), mentorUserId, month, settledHours, hourlyRateCny, grossIncomeCny, chinaTaxResident, ...tax, paymentReference, note };
    await conn.query(
      `INSERT INTO admin_audit_logs
        (admin_id, action, target_type, target_id, reason, before_json, after_json, ip, user_agent)
       VALUES (?, 'mentor_payroll.payment.mark_paid', 'mentor_payroll', ?, ?, NULL, ?, ?, ?)`,
      [req.admin?.adminId || null, `${mentorUserId}:${month}`, note || null, jsonOrNull(after),
        safeString(req.ip || '', 45) || null, safeString(req.get('user-agent') || '', 255) || null]
    );
    await conn.commit();
    return res.status(201).json({ payment: after });
  } catch (error: any) {
    await conn.rollback();
    console.error('Admin mentor payroll payment error:', error);
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || '薪资发放记录保存失败' });
  } finally {
    conn.release();
  }
});

router.get('/navigation-stats', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    await expireStaleBillingOrders();
    const [mentorRows, orderRows, disputeRows] = await Promise.all([
      query<any[]>(
        `SELECT COUNT(*) AS count
         FROM user_roles
         WHERE role = 'mentor'
           AND mentor_approved = 0
           AND mentor_review_status IN ('pending', 'interview_pending')`
      ),
      query<any[]>(
        `SELECT COUNT(DISTINCT bo.id) AS count
         FROM billing_orders bo
         WHERE (
           bo.status IN ('CREATED', 'APPROVED', 'PENDING_RECEIPT')
         ) OR EXISTS (
           SELECT 1
           FROM billing_refunds br
           WHERE br.billing_order_id = bo.id
             AND br.provider IN ('alipay', 'wechat')
             AND br.status IN ('PENDING', 'PROCESSING')
         )`
      ),
      query<any[]>(
        `SELECT COUNT(*) AS count
         FROM course_session_disputes
         WHERE status = 'submitted'`
      ),
    ]);
    return res.json({
      mentors: Number(mentorRows?.[0]?.count || 0),
      orders: Number(orderRows?.[0]?.count || 0),
      disputes: Number(disputeRows?.[0]?.count || 0),
    });
  } catch (error) {
    console.error('Admin navigation stats error:', error);
    return res.status(500).json({ error: '待处理事项统计加载失败' });
  }
});

router.get('/course-disputes/stats', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any[]>(
      `SELECT status, COUNT(*) AS count FROM course_session_disputes GROUP BY status`
    );
    const counts = Object.fromEntries((rows || []).map((row) => [String(row.status), Number(row.count || 0)]));
    return res.json({ counts, openCount: Number(counts.submitted || 0) });
  } catch (error) {
    console.error('Admin dispute stats error:', error);
    return res.status(500).json({ error: '异议统计加载失败' });
  }
});

router.get('/course-disputes', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const disputeNumber = q.match(/^#?(\d+)$/)?.[1] || q;
  const status = safeString(req.query.status, 32).toLowerCase();
  const reason = safeString(req.query.reason, 40);
  const resolution = safeString(req.query.resolution, 40);
  const startDate = parseDateKey(req.query.startDate);
  const endDate = parseDateKey(req.query.endDate);
  const where = ['1=1'];
  const params: any[] = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(`(csd.public_id LIKE ? ESCAPE '\\\\' OR sr.public_id LIKE ? ESCAPE '\\\\' OR mr.public_id LIKE ? ESCAPE '\\\\' OR CAST(csd.course_session_id AS CHAR) = ? OR CAST(csd.id AS CHAR) = ?)`);
    params.push(like, like, like, q, disputeNumber);
  }
  if (COURSE_DISPUTE_STATUSES.has(status)) { where.push('csd.status = ?'); params.push(status); }
  if (reason) { where.push('csd.reason_code = ?'); params.push(reason); }
  if (resolution) { where.push('csd.preferred_resolution = ?'); params.push(resolution); }
  if (startDate) { where.push('csd.created_at >= ?'); params.push(`${startDate} 00:00:00`); }
  if (endDate) { where.push('csd.created_at <= ?'); params.push(`${endDate} 23:59:59`); }
  const joins = `FROM course_session_disputes csd
    JOIN course_sessions cs ON cs.id = csd.course_session_id
    LEFT JOIN user_roles sr ON sr.user_id = csd.student_user_id AND sr.role = 'student'
    LEFT JOIN user_roles mr ON mr.user_id = csd.mentor_user_id AND mr.role = 'mentor'
    LEFT JOIN admin_users au ON au.id = csd.assigned_admin_id`;
  try {
    const countRows = await query<any[]>(`SELECT COUNT(*) AS total ${joins} WHERE ${where.join(' AND ')}`, params);
    const rows = await query<any[]>(
      `SELECT csd.*, sr.public_id AS student_public_id, mr.public_id AS mentor_public_id,
              cs.course_direction, cs.course_type, cs.starts_at, cs.duration_hours,
              au.display_name AS admin_display_name, au.username AS admin_username
       ${joins} WHERE ${where.join(' AND ')} ORDER BY csd.created_at DESC ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), disputes: (rows || []).map((row) => ({
      ...row, id: String(row.public_id), internalId: Number(row.id), submittedAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at), startsAt: toIsoString(row.starts_at),
      assignedAdmin: row.admin_display_name || row.admin_username || '',
    })) });
  } catch (error) {
    console.error('Admin disputes list error:', error);
    return res.status(500).json({ error: '异议列表加载失败' });
  }
});

router.get('/course-disputes/:disputeId', requireAdminAuth, async (req: Request, res: Response) => {
  const disputeId = safeString(req.params.disputeId, 40);
  try {
    const rows = await query<any[]>(
      `SELECT csd.*, cs.course_direction, cs.course_type, cs.starts_at, cs.duration_hours,
              su.email AS student_email, sr.public_id AS student_public_id,
              mu.email AS mentor_email, mr.public_id AS mentor_public_id, mp.display_name AS mentor_name,
              au.display_name AS admin_display_name, au.username AS admin_username,
              lhc.status AS lesson_hours_status, lhc.proposed_hours, lhc.disputed_hours, lhc.final_hours
       FROM course_session_disputes csd
       JOIN course_sessions cs ON cs.id = csd.course_session_id
       JOIN users su ON su.id = csd.student_user_id JOIN users mu ON mu.id = csd.mentor_user_id
       LEFT JOIN user_roles sr ON sr.user_id = csd.student_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = csd.mentor_user_id AND mr.role = 'mentor'
       LEFT JOIN mentor_profiles mp ON mp.user_id = csd.mentor_user_id
       LEFT JOIN admin_users au ON au.id = csd.assigned_admin_id
       LEFT JOIN lesson_hour_confirmations lhc ON lhc.id = (SELECT MAX(x.id) FROM lesson_hour_confirmations x WHERE x.course_session_id = cs.id)
       WHERE csd.public_id = ? LIMIT 1`,
      [disputeId]
    );
    const dispute = rows?.[0];
    if (!dispute) return res.status(404).json({ error: '未找到异议' });
    const [events, refunds, allocations] = await Promise.all([
      query<any[]>(`SELECT cde.*, au.display_name, au.username FROM course_dispute_events cde LEFT JOIN admin_users au ON au.id = cde.admin_id WHERE cde.dispute_id = ? ORDER BY cde.id ASC`, [dispute.id]),
      query<any[]>(`SELECT br.*, cdr.hours AS dispute_hours FROM course_dispute_refunds cdr JOIN billing_refunds br ON br.id = cdr.billing_refund_id WHERE cdr.dispute_id = ? ORDER BY cdr.id ASC`, [dispute.id]),
      query<any[]>(`SELECT bha.billing_order_id, SUM(bha.hours) AS hours, bo.provider, bo.currency_code, bo.amount_cny FROM billing_hour_allocations bha JOIN billing_orders bo ON bo.id = bha.billing_order_id WHERE bha.course_session_id = ? GROUP BY bha.billing_order_id, bo.provider, bo.currency_code, bo.amount_cny`, [dispute.course_session_id]),
    ]);
    return res.json({ dispute: {
      ...dispute, internalId: Number(dispute.id), submittedAt: toIsoString(dispute.created_at),
      updatedAt: toIsoString(dispute.updated_at), startsAt: toIsoString(dispute.starts_at),
      assignedAdmin: dispute.admin_display_name || dispute.admin_username || '',
      ...toDisputeStatusPayload(dispute), events, refunds, allocations,
    } });
  } catch (error) {
    console.error('Admin dispute detail error:', error);
    return res.status(500).json({ error: '异议详情加载失败' });
  }
});

router.post('/course-disputes/:disputeId/notes', requireAdminAuth, async (req: Request, res: Response) => {
  const disputeId = safeString(req.params.disputeId, 40);
  const note = safeString((req.body as any)?.note, 4000);
  if (!note) return res.status(400).json({ error: '请输入内部备注' });
  const rows = await query<any[]>('SELECT id FROM course_session_disputes WHERE public_id = ? LIMIT 1', [disputeId]);
  if (!rows?.[0]) return res.status(404).json({ error: '未找到异议' });
  await query(`INSERT INTO course_dispute_events (dispute_id, admin_id, event_type, note_text) VALUES (?, ?, 'internal_note', ?)`, [rows[0].id, req.admin?.adminId, note]);
  await audit({ req, action: 'course_dispute.note', targetType: 'course_dispute', targetId: disputeId, reason: note });
  return res.status(201).json({ ok: true });
});

router.post('/course-disputes/:disputeId/refund-quote', requireAdminAuth, async (req: Request, res: Response) => {
  const hours = parseRefundHours((req.body as any)?.hours);
  if (!hours) return res.status(400).json({ error: '退款课时需为0.25小时倍数' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(`SELECT csd.*, cs.duration_hours, lhc.final_hours FROM course_session_disputes csd JOIN course_sessions cs ON cs.id = csd.course_session_id LEFT JOIN lesson_hour_confirmations lhc ON lhc.id = (SELECT MAX(x.id) FROM lesson_hour_confirmations x WHERE x.course_session_id = cs.id) WHERE csd.public_id = ? LIMIT 1 FOR UPDATE`, [safeString(req.params.disputeId, 40)]);
    if (!rows?.[0]) { await conn.rollback(); return res.status(404).json({ error: '未找到异议' }); }
    const quote = await loadDisputeRefundQuote(conn, rows[0], hours);
    await conn.rollback();
    return res.json({ quote });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || '退款报价失败' });
  } finally { conn.release(); }
});

router.post('/course-disputes/:disputeId/resolve', requireAdminAuth, async (req: Request, res: Response) => {
  const publicId = safeString(req.params.disputeId, 40);
  const outcome = safeString((req.body as any)?.outcome, 32);
  const resultMessage = safeString((req.body as any)?.resultMessage, 4000);
  const version = toPositiveInt((req.body as any)?.version, 0);
  const hours = parseRefundHours((req.body as any)?.hours);
  if (!COURSE_DISPUTE_OUTCOMES.has(outcome)) return res.status(400).json({ error: '无效处理结果' });
  if (!resultMessage) return res.status(400).json({ error: '请填写学生可见的处理说明' });
  if ((outcome === 'lesson_credit' || outcome === 'refund') && !hours) return res.status(400).json({ error: '课时需为0.25小时倍数' });
  const conn = await pool.getConnection();
  let finalRow: any = null;
  let refundIds: number[] = [];
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(`SELECT csd.*, cs.duration_hours, su.email AS student_email, lhc.final_hours FROM course_session_disputes csd JOIN course_sessions cs ON cs.id = csd.course_session_id JOIN users su ON su.id = csd.student_user_id LEFT JOIN lesson_hour_confirmations lhc ON lhc.id = (SELECT MAX(x.id) FROM lesson_hour_confirmations x WHERE x.course_session_id = cs.id) WHERE csd.public_id = ? LIMIT 1 FOR UPDATE`, [publicId]);
    const dispute = rows?.[0];
    if (!dispute) { await conn.rollback(); return res.status(404).json({ error: '未找到异议' }); }
    if (Number(dispute.version || 1) !== version || String(dispute.status) !== 'submitted') { await conn.rollback(); return res.status(409).json({ error: '异议已被更新，请刷新' }); }
    if (String(dispute.outcome_code) === 'refund' && dispute.refund_status) { await conn.rollback(); return res.status(409).json({ error: '退款已提交，请使用刷新 / 重试退款' }); }
    const preferredOutcome = COURSE_DISPUTE_PREFERRED_OUTCOMES[String(dispute.preferred_resolution)];
    if (!preferredOutcome || (outcome !== preferredOutcome && outcome !== 'rejected')) { await conn.rollback(); return res.status(400).json({ error: '处理方式必须与学生期望一致' }); }
    const maxHours = Number(dispute.final_hours || dispute.duration_hours || 0);
    if (hours && hours > maxHours + 0.000001) { await conn.rollback(); return res.status(409).json({ error: '处理课时超过本节实际扣除' }); }
    let nextStatus = outcome === 'rejected' ? 'rejected' : 'resolved';
    let refundStatus: string | null = null;
    if (outcome === 'lesson_credit') {
      const grantId = `PC${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
      await conn.query(`INSERT INTO platform_lesson_hour_grants (public_id, user_id, dispute_id, granted_hours, remaining_hours) VALUES (?, ?, ?, ?, ?)`, [grantId, dispute.student_user_id, dispute.id, hours, hours]);
      await conn.query('UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?', [hours, dispute.student_user_id]);
    } else if (outcome === 'refund') {
      const quote = await loadDisputeRefundQuote(conn, dispute, Number(hours));
      for (const line of quote.lines) {
        const refundPublicId = crypto.randomUUID();
        const initialStatus = line.provider === 'paypal' ? 'PROCESSING' : 'PENDING';
        const [insert] = await conn.query<any>(`INSERT INTO billing_refunds (public_id, user_id, billing_order_id, provider, requested_hours, amount_cny, currency_code, amount_original, paypal_request_id, status, balance_reserved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, [refundPublicId, dispute.student_user_id, line.orderId, line.provider, line.hours, line.amountCny, line.currencyCode, line.amountOriginal, refundPublicId, initialStatus]);
        refundIds.push(Number(insert.insertId));
        await conn.query(`INSERT INTO course_dispute_refunds (dispute_id, billing_refund_id, hours) VALUES (?, ?, ?)`, [dispute.id, insert.insertId, line.hours]);
      }
      nextStatus = 'submitted'; refundStatus = 'processing';
    }
    await conn.query(`UPDATE course_session_disputes SET status = ?, assigned_admin_id = COALESCE(assigned_admin_id, ?), accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP), outcome_code = ?, result_message = ?, resolved_hours = ?, refund_status = ?, resolved_at = CASE WHEN ? IN ('resolved','rejected') THEN CURRENT_TIMESTAMP ELSE NULL END, version = version + 1 WHERE id = ?`, [nextStatus, req.admin?.adminId, outcome, resultMessage, hours || null, refundStatus, nextStatus, dispute.id]);
    await conn.query(`INSERT INTO course_dispute_events (dispute_id, admin_id, event_type, note_text, payload_json) VALUES (?, ?, 'decision', ?, ?)`, [dispute.id, req.admin?.adminId, resultMessage, JSON.stringify({ outcome, hours: hours || null })]);
    await conn.commit();
    const afterRows = await query<any[]>('SELECT csd.*, u.email AS student_email FROM course_session_disputes csd JOIN users u ON u.id = csd.student_user_id WHERE csd.id = ? LIMIT 1', [dispute.id]);
    finalRow = afterRows[0];
    await audit({ req, action: 'course_dispute.resolve', targetType: 'course_dispute', targetId: publicId, before: dispute, after: finalRow, reason: resultMessage });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    console.error('Admin resolve dispute error:', error);
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || '处理异议失败' });
  } finally { conn.release(); }

  if (refundIds.length) {
    let processed: any[] = [];
    try {
      processed = await Promise.all(refundIds.map((id) => processRefundById(id)));
    } catch (error: any) {
      console.error('Course dispute refund execution error:', error);
      await query(
        `UPDATE course_session_disputes SET status = 'submitted', refund_status = 'failed', version = version + 1 WHERE public_id = ?`,
        [publicId]
      );
      await query(
        `INSERT INTO course_dispute_events (dispute_id, admin_id, event_type, note_text, payload_json)
         SELECT id, ?, 'refund_failed', ?, ? FROM course_session_disputes WHERE public_id = ?`,
        [req.admin?.adminId, error?.message || '退款渠道执行失败', JSON.stringify({ refundIds }), publicId]
      );
      finalRow = (await query<any[]>(
        'SELECT csd.*, u.email AS student_email FROM course_session_disputes csd JOIN users u ON u.id = csd.student_user_id WHERE csd.public_id = ? LIMIT 1',
        [publicId]
      ))[0];
    }
    const allCompleted = processed.every((row: any) => String(row?.status || '').toUpperCase() === 'COMPLETED');
    const anyFailed = processed.some((row: any) => String(row?.status || '').toUpperCase() === 'FAILED');
    if (processed.length) {
      await query(`UPDATE course_session_disputes SET status = ?, refund_status = ?, resolved_at = ?, version = version + 1 WHERE public_id = ?`, [allCompleted ? 'resolved' : 'submitted', allCompleted ? 'completed' : anyFailed ? 'failed' : 'processing', allCompleted ? new Date() : null, publicId]);
      finalRow = (await query<any[]>('SELECT csd.*, u.email AS student_email FROM course_session_disputes csd JOIN users u ON u.id = csd.student_user_id WHERE csd.public_id = ? LIMIT 1', [publicId]))[0];
    }
  }
  if (finalRow && ['resolved','rejected'].includes(String(finalRow.status))) {
    await sendCourseDisputeResultMails(Number(finalRow.id));
  }
  return res.json({ dispute: toDisputeStatusPayload(finalRow) });
});

router.post('/course-disputes/:disputeId/refresh-refunds', requireAdminAuth, async (req: Request, res: Response) => {
  const publicId = safeString(req.params.disputeId, 40);
  const rows = await query<any[]>(
    `SELECT csd.*, u.email AS student_email FROM course_session_disputes csd JOIN users u ON u.id = csd.student_user_id WHERE csd.public_id = ? LIMIT 1`,
    [publicId]
  );
  const dispute = rows?.[0];
  if (!dispute) return res.status(404).json({ error: '未找到异议' });
  if (String(dispute.status) !== 'submitted' || String(dispute.outcome_code) !== 'refund') return res.status(409).json({ error: '该异议没有待执行退款' });
  const refundRows = await query<any[]>(`SELECT br.id, br.status, br.provider FROM course_dispute_refunds cdr JOIN billing_refunds br ON br.id = cdr.billing_refund_id WHERE cdr.dispute_id = ?`, [dispute.id]);
  for (const refund of refundRows || []) {
    if (String(refund.status).toUpperCase() === 'FAILED' && String(refund.provider).toLowerCase() === 'paypal') {
      await query(`UPDATE billing_refunds SET status = 'PROCESSING', failure_code = NULL, failure_message = NULL WHERE id = ?`, [refund.id]);
    }
  }
  let processed: any[] = [];
  try {
    processed = await Promise.all((refundRows || []).map((refund) => processRefundById(Number(refund.id))));
  } catch (error: any) {
    console.error('Admin refresh dispute refunds error:', error);
    await query(`UPDATE course_session_disputes SET refund_status = 'failed', version = version + 1 WHERE id = ?`, [dispute.id]);
    await query(`INSERT INTO course_dispute_events (dispute_id, admin_id, event_type, note_text) VALUES (?, ?, 'refund_failed', ?)`, [dispute.id, req.admin?.adminId, error?.message || '退款渠道执行失败']);
    const updated = (await query<any[]>('SELECT * FROM course_session_disputes WHERE id = ? LIMIT 1', [dispute.id]))[0];
    return res.status(502).json({ error: '退款渠道执行失败，请稍后重试', dispute: toDisputeStatusPayload(updated) });
  }
  const allCompleted = processed.length > 0 && processed.every((row: any) => String(row?.status || '').toUpperCase() === 'COMPLETED');
  const anyFailed = processed.some((row: any) => String(row?.status || '').toUpperCase() === 'FAILED');
  await query(`UPDATE course_session_disputes SET status = ?, refund_status = ?, resolved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE resolved_at END, version = version + 1 WHERE id = ?`, [allCompleted ? 'resolved' : 'submitted', allCompleted ? 'completed' : anyFailed ? 'failed' : 'processing', allCompleted ? 1 : 0, dispute.id]);
  await query(`INSERT INTO course_dispute_events (dispute_id, admin_id, event_type, payload_json) VALUES (?, ?, 'refund_refresh', ?)`, [dispute.id, req.admin?.adminId, JSON.stringify({ allCompleted, anyFailed })]);
  await audit({ req, action: 'course_dispute.refund.refresh', targetType: 'course_dispute', targetId: publicId, after: { allCompleted, anyFailed } });
  if (allCompleted) await sendCourseDisputeResultMails(Number(dispute.id));
  const updated = (await query<any[]>('SELECT * FROM course_session_disputes WHERE id = ? LIMIT 1', [dispute.id]))[0];
  return res.json({ dispute: toDisputeStatusPayload(updated), refunds: processed });
});

router.get('/email-broadcasts/audiences', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const countAudience = async (audience: string) => {
      const rows = await query<Array<{ total: number | string }>>(
        `SELECT COUNT(*) AS total ${broadcastRecipientBaseSql(audience)}`
      );
      return Number(rows?.[0]?.total || 0);
    };
    const [students, mentors, all] = await Promise.all([
      countAudience('students'),
      countAudience('mentors'),
      countAudience('all'),
    ]);
    return res.json({ audiences: { students, mentors, all } });
  } catch (error) {
    console.error('Admin email broadcast audience count error:', error);
    return res.status(500).json({ error: '收件人数加载失败，请稍后再试' });
  }
});

router.post('/email-broadcasts', requireAdminAuth, async (req: Request, res: Response) => {
  const audience = safeString((req.body as any)?.audience, 20).toLowerCase();
  const subject = safeString((req.body as any)?.subject, 120);
  const messageBody = safeString((req.body as any)?.body, 10000);
  if (!EMAIL_BROADCAST_AUDIENCES.has(audience)) {
    return res.status(400).json({ error: '请选择有效的收件人范围' });
  }
  if (subject.length < 2) return res.status(400).json({ error: '邮件主题至少需要 2 个字符' });
  if (messageBody.length < 2) return res.status(400).json({ error: '邮件正文至少需要 2 个字符' });

  const broadcastId = crypto.randomUUID();
  try {
    const recipients = await loadBroadcastRecipients(audience);
    if (!recipients.length) return res.status(409).json({ error: '当前范围内没有可接收邮件的账号' });

    let sent = 0;
    let failed = 0;
    await runWithConcurrency(recipients, EMAIL_BROADCAST_CONCURRENCY, async (recipient) => {
      try {
        await sendAdminBroadcastMail({
          to: String(recipient.email || '').trim(),
          subject,
          body: messageBody,
          locale: String(recipient.preferred_language || '').toLowerCase() === 'en' ? 'en' : 'zh-CN',
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error('Admin email broadcast delivery error:', {
          broadcastId,
          userId: recipient.id,
          code: String((error as any)?.code || (error as any)?.message || 'MAIL_SEND_FAILED'),
        });
      }
    });

    try {
      await audit({
        req,
        action: 'email_broadcast.send',
        targetType: 'email_broadcast',
        targetId: broadcastId,
        reason: `统一邮件：${subject}`,
        after: {
          audience,
          subject,
          body: messageBody,
          recipients: recipients.length,
          sent,
          failed,
        },
      });
    } catch (auditError) {
      console.error('Admin email broadcast audit error:', auditError);
    }

    return res.json({
      broadcastId,
      audience,
      recipients: recipients.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error('Admin email broadcast error:', error);
    return res.status(500).json({ error: '统一邮件发送失败，请稍后再试' });
  }
});

router.get('/audit-logs', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const action = safeString(req.query.action, 80);
  const targetType = safeString(req.query.targetType, 60);
  const where = ['1=1'];
  const params: any[] = [];
  if (action) {
    where.push('al.action = ?');
    params.push(action);
  }
  if (targetType) {
    where.push('al.target_type = ?');
    params.push(targetType);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM admin_audit_logs al WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT al.*, au.username AS admin_username
       FROM admin_audit_logs al
       LEFT JOIN admin_users au ON au.id = al.admin_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.created_at DESC, al.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), logs: rows || [] });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
