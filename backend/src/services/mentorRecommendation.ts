import type { PoolConnection } from 'mysql2/promise';
import { query } from '../db';

const MS_DAY = 24 * 60 * 60 * 1000;
const DIVERSIFY_LOOKAHEAD = 6;

type QueryExecutor = Pick<PoolConnection, 'execute'>;

export type AvailabilityBlock = { start: number; end: number };

export type RecommendationInput = {
  userId: number;
  id: string;
  name: string;
  displayName?: string | null;
  gender?: string | null;
  degree?: string | null;
  school?: string | null;
  timezone?: string | null;
  courses: string[];
  teachingLanguages: string[];
  avatarUrl?: string | null;
  rating: number;
  reviewCount: number;
  avgResponseMinutes: number | null;
  relevanceScore?: number;
  mentorCreatedAt?: unknown;
  lastLoginAt?: unknown;
  profileUpdatedAt?: unknown;
  availabilityJson?: unknown;
  availabilityUpdatedAt?: unknown;
  isAcceptingStudents?: unknown;
  lastRepliedAt?: unknown;
  completedSessionCount?: unknown;
};

export type RecommendationBreakdown = {
  availabilityScore: number;
  profileQualityScore: number;
  performanceScore: number;
  freshnessScore: number;
  explorationScore: number;
  matchBonus: number;
  recommendScore: number;
};

export type RecommendedMentor<T> = T & {
  recommendation: RecommendationBreakdown;
  isNewMentor: boolean;
  primaryCourseKey: string;
  timezoneBucket: string;
  diversityTag: string;
};

let userLastLoginColumnEnsured = false;
let mentorRecommendationColumnsEnsured = false;
let accountRecommendationColumnsEnsured = false;

const ensureColumn = async (sql: string) => {
  try {
    await query(sql);
    return true;
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) return true;
    return false;
  }
};

export const ensureUserLastLoginColumn = async () => {
  if (userLastLoginColumnEnsured) return true;
  userLastLoginColumnEnsured = await ensureColumn(
    'ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at'
  );
  return userLastLoginColumnEnsured;
};

export const ensureMentorRecommendationColumns = async () => {
  if (mentorRecommendationColumnsEnsured) return true;
  const okAccepting = await ensureColumn(
    'ALTER TABLE mentor_profiles ADD COLUMN is_accepting_students TINYINT(1) NOT NULL DEFAULT 1 AFTER avg_appointment_response_minutes'
  );
  const okLastReplied = await ensureColumn(
    'ALTER TABLE mentor_profiles ADD COLUMN last_replied_at TIMESTAMP NULL DEFAULT NULL AFTER is_accepting_students'
  );
  const okCompleted = await ensureColumn(
    'ALTER TABLE mentor_profiles ADD COLUMN completed_session_count INT NOT NULL DEFAULT 0 AFTER last_replied_at'
  );
  mentorRecommendationColumnsEnsured = okAccepting && okLastReplied && okCompleted;
  return mentorRecommendationColumnsEnsured;
};

export const ensureAccountRecommendationColumns = async () => {
  if (accountRecommendationColumnsEnsured) return true;
  accountRecommendationColumnsEnsured = await ensureColumn(
    'ALTER TABLE account_settings ADD COLUMN availability_updated_at TIMESTAMP NULL DEFAULT NULL AFTER availability_json'
  );
  return accountRecommendationColumnsEnsured;
};

export const ensureRecommendationSchema = async () => {
  const [okLogin, okMentor, okAccount] = await Promise.all([
    ensureUserLastLoginColumn(),
    ensureMentorRecommendationColumns(),
    ensureAccountRecommendationColumns(),
  ]);
  return okLogin && okMentor && okAccount;
};

export const touchUserLastLogin = async (userId: number) => {
  if (!Number.isFinite(userId) || userId <= 0) return false;
  const ensured = await ensureUserLastLoginColumn();
  if (!ensured) return false;
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  return true;
};

export const touchMentorLastReplied = async (mentorUserId: number) => {
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return false;
  const ensured = await ensureMentorRecommendationColumns();
  if (!ensured) return false;
  await query('UPDATE mentor_profiles SET last_replied_at = CURRENT_TIMESTAMP WHERE user_id = ?', [mentorUserId]);
  return true;
};

export const touchMentorLastRepliedWithConnection = async (conn: QueryExecutor, mentorUserId: number) => {
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return false;
  await conn.execute(
    'UPDATE mentor_profiles SET last_replied_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [mentorUserId]
  );
  return true;
};

export const recomputeMentorCompletedSessionCount = async (conn: QueryExecutor, mentorUserId: number) => {
  if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) return 0;
  const [rows] = await conn.execute<any[]>(
    `
      SELECT COUNT(*) AS completed_count
      FROM course_sessions
      WHERE mentor_user_id = ?
        AND status = 'completed'
    `,
    [mentorUserId]
  );
  const count = Math.max(0, Number.parseInt(String(rows?.[0]?.completed_count ?? '0'), 10) || 0);
  await conn.execute(
    `
      INSERT INTO mentor_profiles (user_id, completed_session_count)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE completed_session_count = VALUES(completed_session_count)
    `,
    [mentorUserId, count]
  );
  return count;
};

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const roundScore = (value: number) => Math.round(clamp01(value) * 10000) / 10000;

const toDateMs = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getTime();
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
};

const daysSince = (raw: unknown, nowMs: number) => {
  const ms = toDateMs(raw);
  if (ms == null) return null;
  return Math.max(0, (nowMs - ms) / MS_DAY);
};

const recencyScore = (raw: unknown, nowMs: number, fullDays: number, staleDays: number) => {
  const days = daysSince(raw, nowMs);
  if (days == null) return null;
  if (days <= fullDays) return 1;
  if (days >= staleDays) return 0;
  return 1 - (days - fullDays) / (staleDays - fullDays);
};

const maxDateMs = (...values: unknown[]) => {
  let best: number | null = null;
  for (const value of values) {
    const ms = toDateMs(value);
    if (ms == null) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const countNonEmpty = (items: unknown[]) => items.filter((item) => normalizeText(item).length > 0).length;

const hasAnyProfileSignal = (mentor: Pick<RecommendationInput, 'displayName' | 'name' | 'avatarUrl' | 'school' | 'degree' | 'timezone' | 'courses' | 'teachingLanguages'>) => (
  Boolean(normalizeText(mentor.displayName) || normalizeText(mentor.name))
  || Boolean(normalizeText(mentor.avatarUrl))
  || Boolean(normalizeText(mentor.school))
  || Boolean(normalizeText(mentor.degree))
  || Boolean(normalizeText(mentor.timezone))
  || (Array.isArray(mentor.courses) && countNonEmpty(mentor.courses) > 0)
  || (Array.isArray(mentor.teachingLanguages) && countNonEmpty(mentor.teachingLanguages) > 0)
);

export const calculateProfileQualityScore = (mentor: Pick<RecommendationInput, 'displayName' | 'name' | 'avatarUrl' | 'school' | 'degree' | 'timezone' | 'courses' | 'teachingLanguages'>) => {
  let score = 0;
  if (normalizeText(mentor.displayName) || normalizeText(mentor.name)) score += 0.12;
  if (normalizeText(mentor.avatarUrl)) score += 0.16;
  if (normalizeText(mentor.school)) score += 0.16;
  if (normalizeText(mentor.degree)) score += 0.12;
  if (normalizeText(mentor.timezone)) score += 0.12;
  const courseCount = Array.isArray(mentor.courses) ? countNonEmpty(mentor.courses) : 0;
  score += courseCount >= 3 ? 0.22 : courseCount >= 1 ? 0.16 : 0;
  const languageCount = Array.isArray(mentor.teachingLanguages) ? countNonEmpty(mentor.teachingLanguages) : 0;
  score += languageCount >= 2 ? 0.10 : languageCount >= 1 ? 0.07 : 0;
  return roundScore(score);
};

const parseAvailabilityDaySelections = (value: unknown): Record<string, AvailabilityBlock[]> => {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    const raw = parsed?.daySelections;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, AvailabilityBlock[]> = {};
    for (const [key, blocks] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(blocks)) continue;
      const valid = blocks
        .map((block) => ({
          start: Number((block as any)?.start),
          end: Number((block as any)?.end),
        }))
        .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start);
      if (valid.length > 0) out[key] = valid;
    }
    return out;
  } catch {
    return {};
  }
};

export const hasFutureAvailability = (availabilityJson: unknown, now = new Date()) => {
  const selections = parseAvailabilityDaySelections(availabilityJson);
  const todayKey = now.toISOString().slice(0, 10);
  return Object.keys(selections).some((key) => key >= todayKey);
};

const normalizeCount = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normalizeRating = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.min(5, n)) : 0;
};

const normalizeAccepting = (raw: unknown) => raw === true || raw === 1 || raw === '1' || raw == null;

const normalizeResponseScore = (minutes: number | null) => {
  if (minutes == null) return 0.6;
  if (minutes <= 30) return 1;
  if (minutes <= 120) return 0.85;
  if (minutes <= 720) return 0.65;
  if (minutes <= 1440) return 0.45;
  return 0.25;
};

const timezoneOffsetFromLabel = (timezone: string) => {
  const match = timezone.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return sign * (hours * 60 + minutes);
};

const timezoneBucket = (timezone: unknown) => {
  const text = normalizeText(timezone);
  if (!text) return '';
  const offset = timezoneOffsetFromLabel(text);
  if (offset != null) return `utc:${Math.round(offset / 120) * 2}`;
  const region = text.includes('/') ? text.split('/')[0] : text;
  return region.toLowerCase();
};

const diversityTag = (mentor: RecommendationInput, isNewMentor: boolean) => {
  if (isNewMentor) return 'new';
  if ((mentor.teachingLanguages || []).length >= 2) return 'bilingual';
  if (normalizeRating(mentor.rating) >= 4.7 && normalizeCount(mentor.reviewCount) >= 3) return 'high-rating';
  if (mentor.avgResponseMinutes != null && mentor.avgResponseMinutes <= 120) return 'fast-response';
  return 'standard';
};

const wouldOverCluster = <T extends RecommendedMentor<RecommendationInput>>(selected: T[], candidate: T) => {
  const lastOne = selected[selected.length - 1];
  const lastTwo = selected.slice(-2);
  if (lastTwo.length === 2) {
    if (candidate.primaryCourseKey && lastTwo.every((item) => item.primaryCourseKey === candidate.primaryCourseKey)) return true;
    if (candidate.timezoneBucket && lastTwo.every((item) => item.timezoneBucket === candidate.timezoneBucket)) return true;
    if (candidate.diversityTag && lastTwo.every((item) => item.diversityTag === candidate.diversityTag)) return true;
  }
  if (candidate.isNewMentor && lastOne?.isNewMentor) return true;
  return false;
};

export const scoreMentorForRecommendation = (mentor: RecommendationInput, now = new Date()): RecommendedMentor<RecommendationInput> | null => {
  const nowMs = now.getTime();
  const profileQualityScore = calculateProfileQualityScore(mentor);
  const isAcceptingStudents = normalizeAccepting(mentor.isAcceptingStudents);
  const activeMs = maxDateMs(
    mentor.lastLoginAt,
    mentor.lastRepliedAt,
    mentor.profileUpdatedAt,
    mentor.availabilityUpdatedAt
  );
  const fallbackActiveMs = activeMs ?? toDateMs(mentor.profileUpdatedAt);

  if (!isAcceptingStudents) return null;
  if (!hasAnyProfileSignal(mentor)) return null;

  const hasAvailability = hasFutureAvailability(mentor.availabilityJson, now);
  const activeFreshness = recencyScore(fallbackActiveMs ? new Date(fallbackActiveMs) : null, nowMs, 7, 45) ?? 0.55;
  const replyFreshness = recencyScore(mentor.lastRepliedAt, nowMs, 3, 21) ?? 0.5;
  const responseScore = normalizeResponseScore(mentor.avgResponseMinutes);

  const availabilityScore = roundScore(
    0.2
    + (hasAvailability ? 0.35 : 0.08)
    + 0.25 * activeFreshness
    + 0.12 * replyFreshness
    + 0.08 * responseScore
  );

  const rating = normalizeRating(mentor.rating);
  const reviewCount = normalizeCount(mentor.reviewCount);
  const completedSessionCount = normalizeCount(mentor.completedSessionCount);
  const hasHistory = reviewCount > 0 || completedSessionCount > 0;
  const performanceScore = hasHistory
    ? roundScore(
        0.55 * (rating > 0 ? rating / 5 : 0.7)
        + 0.25 * Math.min(1, Math.log(reviewCount + 1) / Math.log(51))
        + 0.20 * Math.min(1, Math.log(completedSessionCount + 1) / Math.log(101))
      )
    : 0.55;

  const freshnessScore = roundScore(Math.max(
    recencyScore(mentor.profileUpdatedAt, nowMs, 7, 60) ?? 0,
    recencyScore(mentor.availabilityUpdatedAt, nowMs, 7, 45) ?? 0,
    recencyScore(mentor.lastLoginAt, nowMs, 7, 45) ?? 0,
    recencyScore(mentor.lastRepliedAt, nowMs, 3, 30) ?? 0
  ));

  const ageDays = daysSince(mentor.mentorCreatedAt, nowMs) ?? 999;
  const isNewMentor = ageDays <= 45;
  const explorationScore = roundScore(
    profileQualityScore < 0.65
      ? 0
      : ageDays <= 14
        ? 1
        : ageDays <= 45
          ? 0.72
          : ageDays <= 90
            ? 0.35
            : 0
  );
  const matchBonus = Math.round(clamp01(Number(mentor.relevanceScore ?? 0)) * 0.08 * 10000) / 10000;
  const recommendScore = Math.round((
    0.35 * availabilityScore
    + 0.25 * profileQualityScore
    + 0.20 * performanceScore
    + 0.10 * freshnessScore
    + 0.10 * explorationScore
    + matchBonus
  ) * 10000) / 10000;

  return {
    ...mentor,
    recommendation: {
      availabilityScore,
      profileQualityScore,
      performanceScore,
      freshnessScore,
      explorationScore,
      matchBonus,
      recommendScore,
    },
    isNewMentor,
    primaryCourseKey: normalizeText(mentor.courses?.[0]).toLowerCase(),
    timezoneBucket: timezoneBucket(mentor.timezone),
    diversityTag: diversityTag(mentor, isNewMentor),
  };
};

export const rankMentorsForRecommendation = <T extends RecommendationInput>(mentors: T[], now = new Date()) => {
  const scored = mentors
    .map((mentor) => scoreMentorForRecommendation(mentor, now))
    .filter((mentor): mentor is RecommendedMentor<RecommendationInput> => Boolean(mentor))
    .sort((a, b) => {
      if (b.recommendation.recommendScore !== a.recommendation.recommendScore) {
        return b.recommendation.recommendScore - a.recommendation.recommendScore;
      }
      return String(a.id).localeCompare(String(b.id));
    }) as Array<RecommendedMentor<T>>;

  const remaining = [...scored];
  const diversified: Array<RecommendedMentor<T>> = [];
  while (remaining.length > 0) {
    let pickIndex = 0;
    if (wouldOverCluster(diversified as any, remaining[0] as any)) {
      const maxIndex = Math.min(DIVERSIFY_LOOKAHEAD, remaining.length - 1);
      for (let index = 1; index <= maxIndex; index += 1) {
        if (!wouldOverCluster(diversified as any, remaining[index] as any)) {
          pickIndex = index;
          break;
        }
      }
    }
    const [picked] = remaining.splice(pickIndex, 1);
    diversified.push(picked);
  }
  return diversified;
};
