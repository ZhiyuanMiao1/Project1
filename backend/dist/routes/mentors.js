"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
let mentorRatingColumnsEnsured = false;
const isMissingRatingColumnsError = (e) => {
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
const parseCourses = (raw) => {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(String(raw));
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, 50);
    }
    catch {
        return [];
    }
};
const normalizeRating = (raw) => {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};
const normalizeCount = (raw) => {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '0'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};
// GET /api/mentors/approved
// Public: return mentors who have passed approval.
router.get('/approved', async (_req, res) => {
    const runQuery = async () => {
        const rows = await (0, db_1.query)(`
      SELECT
        ur.public_id,
        u.username,
        mp.display_name,
        mp.gender,
        mp.degree,
        mp.school,
        mp.timezone,
        mp.courses_json,
        mp.avatar_url,
        mp.rating,
        mp.review_count,
        mp.updated_at
      FROM user_roles ur
      JOIN users u ON u.id = ur.user_id
      LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
      WHERE ur.role = 'mentor' AND ur.mentor_approved = 1
      ORDER BY mp.updated_at DESC, ur.public_id ASC
      LIMIT 200
      `);
        return rows || [];
    };
    try {
        let rows = [];
        try {
            rows = await runQuery();
        }
        catch (e) {
            if (!isMissingRatingColumnsError(e))
                throw e;
            const ensured = await ensureMentorRatingColumns();
            if (!ensured)
                throw e;
            rows = await runQuery();
        }
        const mentors = rows.map((row) => {
            const name = (row.display_name && String(row.display_name).trim()) || (row.username && String(row.username).trim()) || row.public_id;
            return {
                id: row.public_id,
                name,
                gender: row.gender || '',
                degree: row.degree || '',
                school: row.school || '',
                rating: normalizeRating(row.rating),
                reviewCount: normalizeCount(row.review_count),
                courses: parseCourses(row.courses_json),
                timezone: row.timezone || '',
                languages: '',
                imageUrl: row.avatar_url || null,
            };
        });
        return res.json({ mentors });
    }
    catch (e) {
        console.error('Fetch approved mentors error:', e);
        return res.status(500).json({ error: 'server_error' });
    }
});
exports.default = router;
