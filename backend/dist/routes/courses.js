"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const REVIEW_SCORE_KEYS = [
    'clarity',
    'communication',
    'preparation',
    'expertise',
    'punctuality',
];
const REVIEW_COMMENT_MAX_LENGTH = 1000;
let mentorRatingColumnsEnsured = false;
let courseReviewSchemaEnsured = false;
const isMissingCoursesSchemaError = (err) => {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR')
        return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('course_sessions');
};
const normalizeView = (raw) => {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (value === 'student' || value === 'mentor')
        return value;
    return '';
};
const pad2 = (n) => String(n).padStart(2, '0');
const toDateKey = (raw) => {
    if (typeof raw === 'string') {
        const text = raw.trim();
        const match = text.match(/\d{4}-\d{2}-\d{2}/);
        if (match)
            return match[0];
        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime()))
            return '';
        return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`;
    }
    return '';
};
const toIsoString = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime()))
        return raw.toISOString();
    if (typeof raw !== 'string')
        return '';
    const text = raw.trim();
    if (!text)
        return '';
    const normalized = text.includes('T') ? text : text.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()))
        return text;
    return parsed.toISOString();
};
const toNumber = (raw) => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return null;
    return n;
};
const toInt = (raw) => {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n))
        return null;
    return n;
};
const isMissingMentorRatingColumnsError = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')))
        return false;
    return message.includes('rating') || message.includes('review_count');
};
const ensureMentorRatingColumns = async () => {
    if (mentorRatingColumnsEnsured)
        return true;
    const ensureColumn = async (sql) => {
        try {
            await (0, db_1.query)(sql);
            return true;
        }
        catch (e) {
            const code = String(e?.code || '');
            const message = String(e?.message || '');
            if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name'))
                return true;
            return false;
        }
    };
    const okRating = await ensureColumn('ALTER TABLE mentor_profiles ADD COLUMN rating DECIMAL(3,2) NOT NULL DEFAULT 0');
    const okReviewCount = await ensureColumn('ALTER TABLE mentor_profiles ADD COLUMN review_count INT NOT NULL DEFAULT 0');
    mentorRatingColumnsEnsured = okRating && okReviewCount;
    return mentorRatingColumnsEnsured;
};
const ensureCourseReviewSchema = async () => {
    if (courseReviewSchemaEnsured)
        return true;
    const ensureColumn = async (sql) => {
        try {
            await (0, db_1.query)(sql);
            return true;
        }
        catch (e) {
            const code = String(e?.code || '');
            const message = String(e?.message || '');
            if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name'))
                return true;
            return false;
        }
    };
    await (0, db_1.query)(`
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
    const commentColumnReady = await ensureColumn('ALTER TABLE course_session_reviews ADD COLUMN comment_text TEXT NULL AFTER punctuality_score');
    courseReviewSchemaEnsured = commentColumnReady;
    return courseReviewSchemaEnsured;
};
const normalizeReviewScores = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return null;
    const next = {};
    for (const key of REVIEW_SCORE_KEYS) {
        const value = toInt(payload?.[key]);
        if (!value || value < 1 || value > 5)
            return null;
        next[key] = value;
    }
    return next;
};
const getOverallScore = (scores) => {
    const total = REVIEW_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
    return Math.round((total / REVIEW_SCORE_KEYS.length) * 100) / 100;
};
const normalizeReviewComment = (raw) => {
    if (typeof raw !== 'string')
        return '';
    const text = raw.trim();
    if (!text)
        return '';
    if (text.length > REVIEW_COMMENT_MAX_LENGTH)
        return null;
    return text;
};
const getCourseEndTimestamp = (row) => {
    const startsAt = row?.starts_at instanceof Date ? row.starts_at : new Date(String(row?.starts_at ?? ''));
    if (Number.isNaN(startsAt.getTime()))
        return NaN;
    const durationHours = Math.max(toNumber(row?.duration_hours) ?? 0, 0);
    return startsAt.getTime() + durationHours * 60 * 60 * 1000;
};
const getEffectiveCourseStatus = (row) => {
    const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : '';
    if (status !== 'scheduled')
        return status;
    const endTimestamp = getCourseEndTimestamp(row);
    if (Number.isFinite(endTimestamp) && endTimestamp <= Date.now()) {
        return 'completed';
    }
    return status;
};
const isCourseEligibleForReview = (row) => {
    return getEffectiveCourseStatus(row) === 'completed';
};
const buildReviewPayload = (row) => {
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
const recalculateMentorRating = async (connection, mentorUserId) => {
    const [aggregateRowsRaw] = await connection.query(`
      SELECT
        COUNT(*) AS review_count,
        COALESCE(ROUND(AVG(overall_score), 2), 0) AS rating
      FROM course_session_reviews
      WHERE mentor_user_id = ?
    `, [mentorUserId]);
    const aggregateRows = aggregateRowsRaw;
    const reviewCount = toInt(aggregateRows?.[0]?.review_count) ?? 0;
    const mentorRating = toNumber(aggregateRows?.[0]?.rating) ?? 0;
    await connection.query(`
      INSERT INTO mentor_profiles (user_id, rating, review_count)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        review_count = VALUES(review_count)
    `, [mentorUserId, mentorRating, reviewCount]);
    return { mentorRating, mentorReviewCount: reviewCount };
};
router.get('/', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'unauthorized' });
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
          csr.overall_score AS review_overall_score
        FROM course_sessions cs
        LEFT JOIN users mu
          ON mu.id = cs.mentor_user_id
        LEFT JOIN user_roles mr
          ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
        LEFT JOIN mentor_profiles mp
          ON mp.user_id = cs.mentor_user_id
        LEFT JOIN course_session_reviews csr
          ON csr.course_session_id = cs.id AND csr.student_user_id = ?
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
          NULL AS review_overall_score
        FROM course_sessions cs
        LEFT JOIN users su
          ON su.id = cs.student_user_id
        LEFT JOIN user_roles sr
          ON sr.user_id = cs.student_user_id AND sr.role = 'student'
        LEFT JOIN account_settings sas
          ON sas.user_id = cs.student_user_id
        WHERE cs.mentor_user_id = ?
          AND cs.status IN ('scheduled', 'completed')
        ORDER BY cs.starts_at DESC, cs.id DESC
        LIMIT 500
      `;
        const params = view === 'student' ? [req.user.id, req.user.id] : [req.user.id];
        const rows = await (0, db_1.query)(sql, params);
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
                ...buildReviewPayload(row),
            };
        });
        return res.json({ view, courses });
    }
    catch (e) {
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
router.post('/:courseId/review', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'unauthorized' });
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
    }
    catch (e) {
        console.error('Ensure course review schema error:', e);
        return res.status(500).json({ error: 'course_review_schema_init_failed' });
    }
    const connection = await db_1.pool.getConnection();
    try {
        await connection.beginTransaction();
        const [sessionRowsRaw] = await connection.query(`
        SELECT id, student_user_id, mentor_user_id, starts_at, duration_hours, status
        FROM course_sessions
        WHERE id = ?
        LIMIT 1
      `, [courseId]);
        const sessionRows = sessionRowsRaw;
        const session = sessionRows?.[0];
        if (!session || Number(session.student_user_id) !== req.user.id) {
            await connection.rollback();
            return res.status(404).json({ error: 'course_not_found' });
        }
        if (!isCourseEligibleForReview(session)) {
            await connection.rollback();
            return res.status(400).json({ error: 'course_not_completed' });
        }
        const [existingRowsRaw] = await connection.query(`
        SELECT id, created_at
        FROM course_session_reviews
        WHERE course_session_id = ? AND student_user_id = ?
        LIMIT 1
      `, [courseId, req.user.id]);
        const existingRows = existingRowsRaw;
        const existing = existingRows?.[0];
        const overallScore = getOverallScore(scores);
        const mentorUserId = Number(session.mentor_user_id);
        if (existing) {
            await connection.query(`
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
        `, [
                scores.clarity,
                scores.communication,
                scores.preparation,
                scores.expertise,
                scores.punctuality,
                comment || null,
                overallScore,
                Number(existing.id),
            ]);
        }
        else {
            await connection.query(`
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
        `, [
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
            ]);
        }
        const { mentorRating, mentorReviewCount } = await recalculateMentorRating(connection, mentorUserId);
        const [savedRowsRaw] = await connection.query(`
        SELECT created_at, updated_at, comment_text AS review_comment
        FROM course_session_reviews
        WHERE course_session_id = ? AND student_user_id = ?
        LIMIT 1
      `, [courseId, req.user.id]);
        await connection.commit();
        const savedRows = savedRowsRaw;
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
    }
    catch (e) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error('Submit course review error:', e);
        return res.status(500).json({ error: 'submit_review_failed' });
    }
    finally {
        connection.release();
    }
});
exports.default = router;
