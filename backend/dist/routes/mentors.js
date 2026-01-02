"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const mentorTeachingLanguages_1 = require("../services/mentorTeachingLanguages");
const router = (0, express_1.Router)();
const hrNow = () => process.hrtime.bigint();
const msSince = (start) => Number(hrNow() - start) / 1e6;
const getTimingFlag = (req) => {
    const q = req.query;
    const raw = typeof q?.timing === 'string' ? q.timing.trim() : '';
    return raw === '1' || raw.toLowerCase() === 'true' || process.env.DEBUG_MENTOR_RANKING_TIMING === '1';
};
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
const hasNonEmptyText = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeRating = (raw) => {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};
const normalizeCount = (raw) => {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '0'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};
const parseEmbedding = (raw) => {
    if (!raw)
        return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed) || parsed.length === 0)
            return null;
        const out = parsed.map((x) => (typeof x === 'number' ? x : Number.parseFloat(String(x))));
        if (out.some((n) => !Number.isFinite(n)))
            return null;
        return out;
    }
    catch {
        return null;
    }
};
const l2Norm = (vec) => {
    let sum = 0;
    for (let i = 0; i < vec.length; i++)
        sum += vec[i] * vec[i];
    return Math.sqrt(sum);
};
const cosineSimilarity = (a, aNorm, b, bNorm) => {
    if (a.length !== b.length || a.length === 0)
        return 0;
    if (aNorm <= 0 || bNorm <= 0)
        return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++)
        dot += a[i] * b[i];
    return dot / (aNorm * bNorm);
};
async function loadDirectionEmbeddingById(directionId) {
    const rows = await (0, db_1.query)('SELECT embedding, embedding_dim FROM course_embeddings WHERE kind = ? AND source_id = ? LIMIT 1', ['direction', directionId]);
    const row = rows?.[0];
    const embedding = parseEmbedding(row?.embedding);
    if (!embedding)
        return null;
    return { embedding, embeddingDim: Number(row?.embedding_dim) || embedding.length };
}
// GET /api/mentors/approved
// Public: return mentors who have passed approval.
router.get('/approved', async (_req, res) => {
    const directionId = typeof _req.query?.directionId === 'string' ? _req.query.directionId.trim() : '';
    const timingEnabled = getTimingFlag(_req);
    const reqId = timingEnabled ? Math.random().toString(16).slice(2, 8) : '';
    const t0 = timingEnabled ? hrNow() : 0n;
    const runQuery = async () => {
        const rows = await (0, db_1.query)(`
      SELECT
        ur.user_id,
        ur.public_id,
        u.username,
        mp.display_name,
        mp.gender,
        mp.degree,
        mp.school,
        mp.timezone,
        mp.courses_json,
        mp.teaching_languages_json,
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
        const tMentorsQueryStart = timingEnabled ? hrNow() : 0n;
        let rows = [];
        try {
            rows = await runQuery();
        }
        catch (e) {
            const missingRating = isMissingRatingColumnsError(e);
            const missingTeaching = (0, mentorTeachingLanguages_1.isMissingTeachingLanguagesColumnError)(e);
            if (!missingRating && !missingTeaching)
                throw e;
            if (missingRating) {
                const ensured = await ensureMentorRatingColumns();
                if (!ensured)
                    throw e;
            }
            if (missingTeaching) {
                const ensured = await (0, mentorTeachingLanguages_1.ensureMentorTeachingLanguagesColumn)();
                if (!ensured)
                    throw e;
            }
            rows = await runQuery();
        }
        const tMentorsQueryMs = timingEnabled ? msSince(tMentorsQueryStart) : 0;
        const tBuildCardsStart = timingEnabled ? hrNow() : 0n;
        let mentors = rows.flatMap((row) => {
            const courses = parseCourses(row.courses_json);
            const hasAnyProfileInfo = hasNonEmptyText(row.avatar_url) ||
                hasNonEmptyText(row.school) ||
                hasNonEmptyText(row.degree) ||
                hasNonEmptyText(row.timezone) ||
                hasNonEmptyText(row.gender) ||
                courses.length > 0;
            if (!hasAnyProfileInfo)
                return [];
            const name = (row.display_name && String(row.display_name).trim()) || (row.username && String(row.username).trim()) || row.public_id;
            return [
                {
                    _userId: Number(row.user_id),
                    id: row.public_id,
                    name,
                    gender: row.gender || '',
                    degree: row.degree || '',
                    school: row.school || '',
                    rating: normalizeRating(row.rating),
                    reviewCount: normalizeCount(row.review_count),
                    courses,
                    timezone: row.timezone || '',
                    languages: (0, mentorTeachingLanguages_1.formatTeachingLanguageCodesForCard)((0, mentorTeachingLanguages_1.parseTeachingLanguagesJson)(row.teaching_languages_json)),
                    imageUrl: row.avatar_url || null,
                },
            ];
        });
        const tBuildCardsMs = timingEnabled ? msSince(tBuildCardsStart) : 0;
        if (directionId) {
            const tTabEmbeddingStart = timingEnabled ? hrNow() : 0n;
            const queryEmbeddingInfo = await loadDirectionEmbeddingById(directionId);
            const tTabEmbeddingMs = timingEnabled ? msSince(tTabEmbeddingStart) : 0;
            if (queryEmbeddingInfo) {
                const q = queryEmbeddingInfo.embedding;
                const tNormStart = timingEnabled ? hrNow() : 0n;
                const qNorm = l2Norm(q);
                const tNormMs = timingEnabled ? msSince(tNormStart) : 0;
                const userIds = mentors.map((m) => Number(m._userId)).filter((n) => Number.isFinite(n));
                if (userIds.length > 0) {
                    const tEmbeddingsQueryStart = timingEnabled ? hrNow() : 0n;
                    const placeholders = userIds.map(() => '?').join(',');
                    let courseRows = [];
                    try {
                        courseRows = await (0, db_1.query)(`SELECT user_id, course_text, embedding FROM mentor_course_embeddings WHERE user_id IN (${placeholders})`, userIds);
                    }
                    catch (e) {
                        const code = String(e?.code || '');
                        const msg = String(e?.message || '');
                        if (!(code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist")))
                            throw e;
                        courseRows = [];
                    }
                    const tEmbeddingsQueryMs = timingEnabled ? msSince(tEmbeddingsQueryStart) : 0;
                    const tParseAndGroupStart = timingEnabled ? hrNow() : 0n;
                    let embeddingRawChars = 0;
                    const byUser = new Map();
                    for (const r of courseRows || []) {
                        const uid = Number(r?.user_id);
                        if (!Number.isFinite(uid))
                            continue;
                        if (timingEnabled) {
                            if (typeof r?.embedding === 'string')
                                embeddingRawChars += r.embedding.length;
                            else {
                                try {
                                    embeddingRawChars += JSON.stringify(r?.embedding ?? null).length;
                                }
                                catch { }
                            }
                        }
                        const emb = parseEmbedding(r?.embedding);
                        if (!emb || emb.length !== q.length)
                            continue;
                        const list = byUser.get(uid) || [];
                        list.push({ courseText: String(r?.course_text || ''), embedding: emb, norm: l2Norm(emb) });
                        byUser.set(uid, list);
                    }
                    const tParseAndGroupMs = timingEnabled ? msSince(tParseAndGroupStart) : 0;
                    const tScoreStart = timingEnabled ? hrNow() : 0n;
                    mentors = mentors
                        .map((m) => {
                        const uid = Number(m._userId);
                        const list = byUser.get(uid) || [];
                        let bestScore = 0;
                        let bestCourse = '';
                        for (const item of list) {
                            const score = cosineSimilarity(q, qNorm, item.embedding, item.norm);
                            if (score > bestScore) {
                                bestScore = score;
                                bestCourse = item.courseText;
                            }
                        }
                        return { ...m, relevanceScore: bestScore, relevanceCourse: bestCourse };
                    })
                        .sort((a, b) => {
                        const sa = typeof a.relevanceScore === 'number' ? a.relevanceScore : 0;
                        const sb = typeof b.relevanceScore === 'number' ? b.relevanceScore : 0;
                        if (sb !== sa)
                            return sb - sa;
                        return String(a.id).localeCompare(String(b.id));
                    });
                    const tScoreMs = timingEnabled ? msSince(tScoreStart) : 0;
                    if (timingEnabled) {
                        const totalMs = msSince(t0);
                        console.log(`[mentors/approved timing ${reqId}] directionId=${directionId} mentors=${mentors.length} userIds=${userIds.length} ` +
                            `courseRows=${courseRows.length} embChars≈${embeddingRawChars} dim=${q.length} | ` +
                            `mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms ` +
                            `tabEmbSQL=${tTabEmbeddingMs.toFixed(1)}ms norm=${tNormMs.toFixed(1)}ms ` +
                            `embSQL=${tEmbeddingsQueryMs.toFixed(1)}ms parseGroup=${tParseAndGroupMs.toFixed(1)}ms scoreSort=${tScoreMs.toFixed(1)}ms ` +
                            `TOTAL=${totalMs.toFixed(1)}ms`);
                    }
                }
            }
            else if (timingEnabled) {
                const totalMs = msSince(t0);
                console.log(`[mentors/approved timing ${reqId}] directionId=${directionId} mentors=${mentors.length} ` +
                    `mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms tabEmbSQL=${tTabEmbeddingMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms (no tab embedding found)`);
            }
        }
        else if (timingEnabled) {
            const totalMs = msSince(t0);
            console.log(`[mentors/approved timing ${reqId}] directionId=<none> mentors=${mentors.length} mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms`);
        }
        const publicMentors = mentors.map(({ _userId, ...rest }) => rest);
        return res.json({ mentors: publicMentors });
    }
    catch (e) {
        console.error('Fetch approved mentors error:', e);
        return res.status(500).json({ error: 'server_error' });
    }
});
exports.default = router;
