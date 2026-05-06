import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { pool, query } from '../db';
import { requireAuth } from '../middleware/auth';
import { buildContentDisposition, getRecordingOssClient } from '../services/ossClient';
import { ensureClassroomRecordingsTable } from '../services/aliyunRtcRecording';
import {
  ClassroomHttpError,
  isMissingClassroomSchemaError,
  loadAuthorizedClassroomContext,
} from '../services/classroomAccess';

const router = Router();

type CourseView = 'student' | 'mentor';

type ReviewScoreKey =
  | 'clarity'
  | 'communication'
  | 'preparation'
  | 'expertise'
  | 'punctuality';

type ReviewScores = Record<ReviewScoreKey, number>;

const REVIEW_SCORE_KEYS: ReviewScoreKey[] = [
  'clarity',
  'communication',
  'preparation',
  'expertise',
  'punctuality',
];
const REVIEW_COMMENT_MAX_LENGTH = 1000;
const REPLAY_SIGNED_URL_EXPIRE_SECONDS = 60 * 60;
const REPLAY_LIST_MAX_OBJECTS = 500;

let mentorRatingColumnsEnsured = false;
let courseReviewSchemaEnsured = false;
let courseAlertColumnsEnsured = false;

const isMissingCoursesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('course_sessions') || message.includes('lesson_hour_confirmations');
};

const normalizeView = (raw: unknown): CourseView | '' => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'student' || value === 'mentor') return value;
  return '';
};

const getLastSeenCourseColumn = (view: CourseView) => (
  view === 'student' ? 'student_last_seen_course_id' : 'mentor_last_seen_course_id'
);

const pad2 = (n: number) => String(n).padStart(2, '0');

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
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  const canonical = text
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

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (raw: unknown) => {
  const parsed = parseStoredUtcDate(raw);
  if (parsed) return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;

  return '';
};

const toIsoString = (raw: unknown) => {
  const parsed = parseStoredUtcDate(raw);
  if (!parsed) return '';
  return parsed.toISOString();
};

const toNumber = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
};

const toInt = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  return n;
};

const toObjectLastModifiedIso = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw !== 'string') return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const toReplayFileName = (ossKey: string) => {
  const parts = ossKey.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'recording.mp4';
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
    const normalizedPrefix = storagePrefix.replace(/^\/+|\/+$/g, '');
    if (!normalizedPrefix) continue;

    const mp4Prefix = `${normalizedPrefix}/mp4/`;
    let marker = '';

    do {
      const result = await client.list({
        prefix: mp4Prefix,
        marker,
        'max-keys': 1000,
      } as any, {});
      const objects = Array.isArray((result as any)?.objects) ? (result as any).objects : [];

      for (const object of objects) {
        const ossKey = typeof object?.name === 'string' ? object.name.trim() : '';
        if (!ossKey || seenKeys.has(ossKey) || !ossKey.toLowerCase().endsWith('.mp4')) continue;
        seenKeys.add(ossKey);

        const fileName = toReplayFileName(ossKey);
        files.push({
          fileId: toReplayFileId(ossKey),
          fileName,
          sizeBytes: Math.max(0, toNumber(object?.size) ?? 0),
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
    const timeDiff = (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    return timeDiff || a.fileName.localeCompare(b.fileName);
  });

  return { files, expiresAt };
};

const isMissingMentorRatingColumnsError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column'))) return false;
  return message.includes('rating') || message.includes('review_count');
};

const isMissingCourseAlertColumnError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column'))) return false;
  return message.includes('student_last_seen_course_id') || message.includes('mentor_last_seen_course_id');
};

const ensureMentorRatingColumns = async () => {
  if (mentorRatingColumnsEnsured) return true;

  const ensureColumn = async (sql: string) => {
    try {
      await query(sql);
      return true;
    } catch (e: any) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) return true;
      return false;
    }
  };

  const okRating = await ensureColumn(
    'ALTER TABLE mentor_profiles ADD COLUMN rating DECIMAL(3,2) NOT NULL DEFAULT 0'
  );
  const okReviewCount = await ensureColumn(
    'ALTER TABLE mentor_profiles ADD COLUMN review_count INT NOT NULL DEFAULT 0'
  );

  mentorRatingColumnsEnsured = okRating && okReviewCount;
  return mentorRatingColumnsEnsured;
};

const ensureCourseReviewSchema = async () => {
  if (courseReviewSchemaEnsured) return true;

  const ensureColumn = async (sql: string) => {
    try {
      await query(sql);
      return true;
    } catch (e: any) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) return true;
      return false;
    }
  };

  await query(`
    CREATE TABLE IF NOT EXISTS course_session_reviews (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_session_id BIGINT NOT NULL,
      student_user_id INT NOT NULL,
      mentor_user_id INT NOT NULL,
      clarity_score TINYINT UNSIGNED NOT NULL,
      communication_score TINYINT UNSIGNED NOT NULL,
      preparation_score TINYINT UNSIGNED NOT NULL,
      expertise_score TINYINT UNSIGNED NOT NULL,
      punctuality_score TINYINT UNSIGNED NOT NULL,
      comment_text TEXT NULL,
      overall_score DECIMAL(3,2) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_course_session_reviews_session_student (course_session_id, student_user_id),
      KEY idx_course_session_reviews_mentor_created (mentor_user_id, created_at),
      KEY idx_course_session_reviews_student_created (student_user_id, created_at),
      CONSTRAINT fk_course_session_reviews_session FOREIGN KEY (course_session_id) REFERENCES course_sessions(id) ON DELETE CASCADE,
      CONSTRAINT fk_course_session_reviews_student FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_course_session_reviews_mentor FOREIGN KEY (mentor_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const commentColumnReady = await ensureColumn(
    'ALTER TABLE course_session_reviews ADD COLUMN comment_text TEXT NULL AFTER punctuality_score'
  );

  courseReviewSchemaEnsured = commentColumnReady;
  return courseReviewSchemaEnsured;
};

const ensureCourseAlertColumns = async () => {
  if (courseAlertColumnsEnsured) return true;

  const ensureColumn = async (sql: string) => {
    try {
      await query(sql);
      return true;
    } catch (e: any) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) return true;
      return false;
    }
  };

  const studentReady = await ensureColumn(
    'ALTER TABLE account_settings ADD COLUMN student_last_seen_course_id BIGINT UNSIGNED NOT NULL DEFAULT 0'
  );
  const mentorReady = await ensureColumn(
    'ALTER TABLE account_settings ADD COLUMN mentor_last_seen_course_id BIGINT UNSIGNED NOT NULL DEFAULT 0'
  );

  courseAlertColumnsEnsured = studentReady && mentorReady;
  return courseAlertColumnsEnsured;
};

const normalizeReviewScores = (payload: any): ReviewScores | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const next = {} as ReviewScores;
  for (const key of REVIEW_SCORE_KEYS) {
    const value = toInt(payload?.[key]);
    if (!value || value < 1 || value > 5) return null;
    next[key] = value;
  }

  return next;
};

const getOverallScore = (scores: ReviewScores) => {
  const total = REVIEW_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
  return Math.round((total / REVIEW_SCORE_KEYS.length) * 100) / 100;
};

const normalizeReviewComment = (raw: unknown) => {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  if (text.length > REVIEW_COMMENT_MAX_LENGTH) return null;
  return text;
};

const getCourseEndTimestamp = (row: any) => {
  const startsAt = parseStoredUtcDate(row?.starts_at);
  if (!startsAt || Number.isNaN(startsAt.getTime())) return NaN;

  const durationHours = Math.max(toNumber(row?.duration_hours) ?? 0, 0);
  return startsAt.getTime() + durationHours * 60 * 60 * 1000;
};

const getEffectiveCourseStatus = (row: any) => {
  const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : '';
  if (status !== 'scheduled') return status;

  const endTimestamp = getCourseEndTimestamp(row);
  if (Number.isFinite(endTimestamp) && endTimestamp <= Date.now()) {
    return 'completed';
  }

  return status;
};

const isCourseEligibleForReview = (row: any) => {
  return getEffectiveCourseStatus(row) === 'completed';
};

const buildReviewPayload = (row: any) => {
  const reviewSubmittedAt = toIsoString(row?.review_submitted_at);
  if (!reviewSubmittedAt) {
    return {
      reviewSubmittedAt: '',
      reviewUpdatedAt: '',
      reviewScores: null,
      reviewOverallScore: null,
      reviewComment: '',
    };
  }

  return {
    reviewSubmittedAt,
    reviewUpdatedAt: toIsoString(row?.review_updated_at),
    reviewScores: {
      clarity: toInt(row?.review_clarity_score) ?? 0,
      communication: toInt(row?.review_communication_score) ?? 0,
      preparation: toInt(row?.review_preparation_score) ?? 0,
      expertise: toInt(row?.review_expertise_score) ?? 0,
      punctuality: toInt(row?.review_punctuality_score) ?? 0,
    },
    reviewOverallScore: toNumber(row?.review_overall_score),
    reviewComment: typeof row?.review_comment === 'string' ? row.review_comment.trim() : '',
  };
};

const fetchLastSeenCourseId = async (userId: number, view: CourseView) => {
  const column = getLastSeenCourseColumn(view);
  const selectSql = `SELECT ${column} AS last_seen_course_id FROM account_settings WHERE user_id = ? LIMIT 1`;

  try {
    const rows = await query<any[]>(selectSql, [userId]);
    return Math.max(0, toInt(rows?.[0]?.last_seen_course_id) ?? 0);
  } catch (e) {
    if (!isMissingCourseAlertColumnError(e)) return 0;
    const ensured = await ensureCourseAlertColumns();
    if (!ensured) return 0;
    const rows = await query<any[]>(selectSql, [userId]);
    return Math.max(0, toInt(rows?.[0]?.last_seen_course_id) ?? 0);
  }
};

const recalculateMentorRating = async (connection: any, mentorUserId: number) => {
  const [aggregateRowsRaw] = await connection.query(
    `
      SELECT
        COUNT(*) AS review_count,
        COALESCE(ROUND(AVG(overall_score), 2), 0) AS rating
      FROM course_session_reviews
      WHERE mentor_user_id = ?
    `,
    [mentorUserId]
  );

  const aggregateRows = aggregateRowsRaw as any[];
  const reviewCount = toInt(aggregateRows?.[0]?.review_count) ?? 0;
  const mentorRating = toNumber(aggregateRows?.[0]?.rating) ?? 0;

  await connection.query(
    `
      INSERT INTO mentor_profiles (user_id, rating, review_count)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        review_count = VALUES(review_count)
    `,
    [mentorUserId, mentorRating, reviewCount]
  );

  return { mentorRating, mentorReviewCount: reviewCount };
};

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });

  const view = normalizeView(req.query?.view);
  if (!view) {
    return res.status(400).json({ error: 'invalid_view' });
  }

  try {
    if (view === 'student') {
      const ratingReady = await ensureMentorRatingColumns();
      if (!ratingReady) {
        return res.status(500).json({ error: 'mentor_rating_init_failed' });
      }
      await ensureCourseReviewSchema();
    }

    const sql = view === 'student'
      ? `
        SELECT
          cs.id,
          cs.course_direction,
          cs.course_type,
          cs.starts_at,
          cs.duration_hours,
          cs.status,
          COALESCE(NULLIF(TRIM(mp.display_name), ''), NULLIF(TRIM(mu.username), ''), NULLIF(TRIM(mr.public_id), ''), 'mentor') AS counterpart_name,
          COALESCE(NULLIF(TRIM(mr.public_id), ''), '') AS counterpart_public_id,
          COALESCE(NULLIF(TRIM(mp.avatar_url), ''), '') AS counterpart_avatar_url,
          mp.rating AS counterpart_rating,
          csr.created_at AS review_submitted_at,
          csr.updated_at AS review_updated_at,
          csr.clarity_score AS review_clarity_score,
          csr.communication_score AS review_communication_score,
          csr.preparation_score AS review_preparation_score,
          csr.expertise_score AS review_expertise_score,
          csr.punctuality_score AS review_punctuality_score,
          csr.comment_text AS review_comment,
          csr.overall_score AS review_overall_score,
          latest_lhc.message_item_id AS latest_lesson_hours_message_id,
          latest_lhc.proposed_hours AS latest_lesson_hours_proposed_hours,
          latest_lhc.final_hours AS latest_lesson_hours_final_hours,
          latest_lhc.status AS latest_lesson_hours_status
        FROM course_sessions cs
        LEFT JOIN users mu
          ON mu.id = cs.mentor_user_id
        LEFT JOIN user_roles mr
          ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
        LEFT JOIN mentor_profiles mp
          ON mp.user_id = cs.mentor_user_id
        LEFT JOIN course_session_reviews csr
          ON csr.course_session_id = cs.id AND csr.student_user_id = ?
        LEFT JOIN (
          SELECT
            latest.course_session_id,
            latest.message_item_id,
            latest.proposed_hours,
            latest.final_hours,
            latest.status
          FROM lesson_hour_confirmations latest
          INNER JOIN (
            SELECT course_session_id, MAX(id) AS latest_id
            FROM lesson_hour_confirmations
            GROUP BY course_session_id
          ) picked
            ON picked.latest_id = latest.id
        ) latest_lhc
          ON latest_lhc.course_session_id = cs.id
        WHERE cs.student_user_id = ?
          AND cs.status IN ('scheduled', 'completed')
        ORDER BY cs.starts_at DESC, cs.id DESC
        LIMIT 500
      `
      : `
        SELECT
          cs.id,
          cs.course_direction,
          cs.course_type,
          cs.starts_at,
          cs.duration_hours,
          cs.status,
          COALESCE(NULLIF(TRIM(sr.public_id), ''), NULLIF(TRIM(su.username), ''), 'student') AS counterpart_name,
          COALESCE(NULLIF(TRIM(sr.public_id), ''), '') AS counterpart_public_id,
          COALESCE(NULLIF(TRIM(sas.student_avatar_url), ''), '') AS counterpart_avatar_url,
          NULL AS counterpart_rating,
          NULL AS review_submitted_at,
          NULL AS review_updated_at,
          NULL AS review_clarity_score,
          NULL AS review_communication_score,
          NULL AS review_preparation_score,
          NULL AS review_expertise_score,
          NULL AS review_punctuality_score,
          NULL AS review_comment,
          NULL AS review_overall_score,
          latest_lhc.message_item_id AS latest_lesson_hours_message_id,
          latest_lhc.proposed_hours AS latest_lesson_hours_proposed_hours,
          latest_lhc.final_hours AS latest_lesson_hours_final_hours,
          latest_lhc.status AS latest_lesson_hours_status
        FROM course_sessions cs
        LEFT JOIN users su
          ON su.id = cs.student_user_id
        LEFT JOIN user_roles sr
          ON sr.user_id = cs.student_user_id AND sr.role = 'student'
        LEFT JOIN account_settings sas
          ON sas.user_id = cs.student_user_id
        LEFT JOIN (
          SELECT
            latest.course_session_id,
            latest.message_item_id,
            latest.proposed_hours,
            latest.final_hours,
            latest.status
          FROM lesson_hour_confirmations latest
          INNER JOIN (
            SELECT course_session_id, MAX(id) AS latest_id
            FROM lesson_hour_confirmations
            GROUP BY course_session_id
          ) picked
            ON picked.latest_id = latest.id
        ) latest_lhc
          ON latest_lhc.course_session_id = cs.id
        WHERE cs.mentor_user_id = ?
          AND cs.status IN ('scheduled', 'completed')
        ORDER BY cs.starts_at DESC, cs.id DESC
        LIMIT 500
      `;

    const params = view === 'student' ? [req.user.id, req.user.id] : [req.user.id];
    const rows = await query<any[]>(sql, params);

    const courses = (rows || []).map((row) => {
      const durationHours = toNumber(row?.duration_hours) ?? 0;
      return {
        id: String(row?.id ?? ''),
        courseDirectionId: typeof row?.course_direction === 'string' ? row.course_direction.trim() : '',
        courseTypeId: typeof row?.course_type === 'string' ? row.course_type.trim() : '',
        date: toDateKey(row?.starts_at),
        startsAt: toIsoString(row?.starts_at),
        durationHours,
        status: getEffectiveCourseStatus(row),
        counterpartName: typeof row?.counterpart_name === 'string' ? row.counterpart_name.trim() : '',
        counterpartPublicId: typeof row?.counterpart_public_id === 'string' ? row.counterpart_public_id.trim() : '',
        counterpartAvatarUrl: typeof row?.counterpart_avatar_url === 'string' ? row.counterpart_avatar_url.trim() : '',
        counterpartRating: toNumber(row?.counterpart_rating),
        latestLessonHoursMessageId: row?.latest_lesson_hours_message_id == null
          ? ''
          : String(row.latest_lesson_hours_message_id),
        latestLessonHoursProposedHours: toNumber(row?.latest_lesson_hours_proposed_hours),
        latestLessonHoursFinalHours: toNumber(row?.latest_lesson_hours_final_hours),
        latestLessonHoursStatus: typeof row?.latest_lesson_hours_status === 'string'
          ? row.latest_lesson_hours_status.trim().toLowerCase()
          : '',
        ...buildReviewPayload(row),
      };
    });

    const lastSeenCourseId = await fetchLastSeenCourseId(req.user.id, view);

    return res.json({ view, courses, lastSeenCourseId });
  } catch (e) {
    if (isMissingCoursesSchemaError(e)) {
      return res.status(500).json({ error: 'courses_schema_missing' });
    }
    if (isMissingMentorRatingColumnsError(e)) {
      return res.status(500).json({ error: 'mentor_rating_columns_missing' });
    }
    console.error('Fetch courses error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/alerts/seen', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });

  const view = normalizeView(req.body?.view);
  if (!view) {
    return res.status(400).json({ error: 'invalid_view' });
  }

  const lastSeenCourseId = Math.max(0, toInt(req.body?.lastSeenCourseId) ?? 0);
  const column = getLastSeenCourseColumn(view);
  const upsertSql = `
    INSERT INTO account_settings (user_id, ${column})
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      ${column} = GREATEST(COALESCE(${column}, 0), VALUES(${column}))
  `;

  try {
    try {
      await query(upsertSql, [req.user.id, lastSeenCourseId]);
    } catch (e) {
      if (!isMissingCourseAlertColumnError(e)) throw e;
      const ensured = await ensureCourseAlertColumns();
      if (!ensured) throw e;
      await query(upsertSql, [req.user.id, lastSeenCourseId]);
    }

    const persistedLastSeenCourseId = await fetchLastSeenCourseId(req.user.id, view);
    return res.json({
      ok: true,
      view,
      lastSeenCourseId: persistedLastSeenCourseId,
    });
  } catch (e) {
    console.error('Mark courses seen error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.get('/:courseId/replay-files', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });

  const courseId = toInt(req.params?.courseId);
  if (!courseId || courseId <= 0) {
    return res.status(400).json({ error: 'invalid_course_id' });
  }

  try {
    await loadAuthorizedClassroomContext(courseId, req.user.id);
    await ensureClassroomRecordingsTable();

    const recordingRows = await query<Array<{ storage_prefix: string | null }>>(
      `
      SELECT storage_prefix
      FROM classroom_recordings
      WHERE course_session_id = ?
        AND status IN ('running', 'stopping', 'stopped')
      ORDER BY id DESC
      LIMIT 20
      `,
      [courseId]
    );
    const storagePrefixes = Array.from(new Set((recordingRows || [])
      .map((row) => (typeof row?.storage_prefix === 'string' ? row.storage_prefix.trim() : ''))
      .filter(Boolean)));

    const replayFiles = await listReplayMp4Files(storagePrefixes);
    if (!replayFiles) {
      return res.status(500).json({ error: 'recording_storage_unconfigured' });
    }

    return res.json({
      courseId: String(courseId),
      files: replayFiles.files,
      expiresAt: replayFiles.expiresAt,
    });
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e) || isMissingCoursesSchemaError(e)) {
      return res.status(500).json({ error: 'courses_schema_missing' });
    }
    console.error('Fetch replay files error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/:courseId/review', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });

  const courseId = toInt(req.params?.courseId);
  if (!courseId || courseId <= 0) {
    return res.status(400).json({ error: 'invalid_course_id' });
  }

  const scores = normalizeReviewScores(req.body);
  if (!scores) {
    return res.status(400).json({ error: 'invalid_review_scores' });
  }

  const comment = normalizeReviewComment(req.body?.comment);
  if (comment === null) {
    return res.status(400).json({ error: 'invalid_review_comment' });
  }

  try {
    const ratingReady = await ensureMentorRatingColumns();
    if (!ratingReady) {
      return res.status(500).json({ error: 'mentor_rating_init_failed' });
    }
    await ensureCourseReviewSchema();
  } catch (e) {
    console.error('Ensure course review schema error:', e);
    return res.status(500).json({ error: 'course_review_schema_init_failed' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [sessionRowsRaw] = await connection.query(
      `
        SELECT id, student_user_id, mentor_user_id, starts_at, duration_hours, status
        FROM course_sessions
        WHERE id = ?
        LIMIT 1
      `,
      [courseId]
    );

    const sessionRows = sessionRowsRaw as any[];
    const session = sessionRows?.[0];
    if (!session || Number(session.student_user_id) !== req.user.id) {
      await connection.rollback();
      return res.status(404).json({ error: 'course_not_found' });
    }

    if (!isCourseEligibleForReview(session)) {
      await connection.rollback();
      return res.status(400).json({ error: 'course_not_completed' });
    }

    const [existingRowsRaw] = await connection.query(
      `
        SELECT id, created_at
        FROM course_session_reviews
        WHERE course_session_id = ? AND student_user_id = ?
        LIMIT 1
      `,
      [courseId, req.user.id]
    );

    const existingRows = existingRowsRaw as any[];
    const existing = existingRows?.[0];
    const overallScore = getOverallScore(scores);
    const mentorUserId = Number(session.mentor_user_id);

    if (existing) {
      await connection.query(
        `
          UPDATE course_session_reviews
          SET
            clarity_score = ?,
            communication_score = ?,
            preparation_score = ?,
            expertise_score = ?,
            punctuality_score = ?,
            comment_text = ?,
            overall_score = ?
          WHERE id = ?
        `,
        [
          scores.clarity,
          scores.communication,
          scores.preparation,
          scores.expertise,
          scores.punctuality,
          comment || null,
          overallScore,
          Number(existing.id),
        ]
      );
    } else {
      await connection.query(
        `
          INSERT INTO course_session_reviews (
            course_session_id,
            student_user_id,
            mentor_user_id,
            clarity_score,
            communication_score,
            preparation_score,
            expertise_score,
            punctuality_score,
            comment_text,
            overall_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          courseId,
          req.user.id,
          mentorUserId,
          scores.clarity,
          scores.communication,
          scores.preparation,
          scores.expertise,
          scores.punctuality,
          comment || null,
          overallScore,
        ]
      );
    }

    const { mentorRating, mentorReviewCount } = await recalculateMentorRating(connection, mentorUserId);

    const [savedRowsRaw] = await connection.query(
      `
        SELECT created_at, updated_at, comment_text AS review_comment
        FROM course_session_reviews
        WHERE course_session_id = ? AND student_user_id = ?
        LIMIT 1
      `,
      [courseId, req.user.id]
    );

    await connection.commit();

    const savedRows = savedRowsRaw as any[];
    const saved = savedRows?.[0] || {};

    return res.status(existing ? 200 : 201).json({
      message: existing ? 'review_updated' : 'review_submitted',
      reviewSubmittedAt: toIsoString(saved.created_at) || new Date().toISOString(),
      reviewUpdatedAt: toIsoString(saved.updated_at) || new Date().toISOString(),
      reviewScores: scores,
      reviewOverallScore: overallScore,
      reviewComment: typeof saved.review_comment === 'string' ? saved.review_comment.trim() : '',
      mentorRating,
      mentorReviewCount,
    });
  } catch (e: any) {
    try {
      await connection.rollback();
    } catch {}

    console.error('Submit course review error:', e);
    return res.status(500).json({ error: 'submit_review_failed' });
  } finally {
    connection.release();
  }
});

export default router;
