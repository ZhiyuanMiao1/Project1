"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMentorDirectionScoresTable = ensureMentorDirectionScoresTable;
exports.refreshMentorDirectionScores = refreshMentorDirectionScores;
const db_1 = require("../db");
const rdsVectorIndex_1 = require("./rdsVectorIndex");
const DIRECTION_KIND = 'direction';
const OTHERS_DIRECTION_ID = 'others';
const RELEVANCE_ABS_MIN = 0.35;
let mentorDirectionScoresEnsured = false;
const tableExists = async (tableName, queryFn) => {
    const rows = await queryFn('SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [tableName]);
    const n = typeof rows?.[0]?.c === 'number' ? rows[0].c : Number(rows?.[0]?.c);
    return Number.isFinite(n) && n > 0;
};
async function ensureMentorDirectionScoresTable(queryFn) {
    if (mentorDirectionScoresEnsured)
        return;
    const q = queryFn || (async (sql, args = []) => (0, db_1.query)(sql, args));
    const ok = await tableExists('mentor_direction_scores', q);
    if (!ok) {
        const err = new Error('数据库未升级，请先执行 backend/schema.sql');
        err.code = 'SCHEMA_NOT_UPGRADED';
        throw err;
    }
    mentorDirectionScoresEnsured = true;
}
const parseEmbedding = (raw) => {
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
    for (let i = 0; i < vec.length; i += 1)
        sum += vec[i] * vec[i];
    return Math.sqrt(sum);
};
const cosineSimilarity = (a, aNorm, b, bNorm) => {
    if (a.length !== b.length || a.length === 0)
        return 0;
    if (aNorm <= 0 || bNorm <= 0)
        return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i += 1)
        dot += a[i] * b[i];
    return dot / (aNorm * bNorm);
};
async function hasAnyMentorCourseEmbeddings(userId, queryFn) {
    try {
        const rows = await queryFn('SELECT COUNT(*) AS c FROM mentor_course_embeddings WHERE user_id = ? LIMIT 1', [
            userId,
        ]);
        const n = typeof rows?.[0]?.c === 'number' ? rows[0].c : Number(rows?.[0]?.c);
        return Number.isFinite(n) && n > 0;
    }
    catch (e) {
        const code = String(e?.code || '');
        const msg = String(e?.message || '');
        if (code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist"))
            return false;
        throw e;
    }
}
async function computeScoresWithVectors(userId, queryFn) {
    const rows = await queryFn(`
    SELECT
      ce.source_id AS direction_id,
      MAX(1 - VEC_DISTANCE(mce.embedding_vec, ce.embedding_vec)) AS score
    FROM course_embeddings ce
    JOIN mentor_course_embeddings mce ON mce.user_id = ?
    WHERE ce.kind = ? AND ce.source_id <> ?
    GROUP BY ce.source_id
    `, [userId, DIRECTION_KIND, OTHERS_DIRECTION_ID]);
    return (rows || [])
        .map((r) => {
        const directionId = String(r?.direction_id || '').trim();
        const rawScore = r?.score;
        const score = typeof rawScore === 'number' ? rawScore : Number.parseFloat(String(rawScore ?? '0'));
        if (!directionId)
            return null;
        return { directionId, score: Number.isFinite(score) ? score : 0 };
    })
        .filter(Boolean);
}
async function computeScoresFallback(userId, queryFn) {
    const dirRows = await queryFn('SELECT source_id, embedding, embedding_dim FROM course_embeddings WHERE kind = ? AND source_id <> ?', [DIRECTION_KIND, OTHERS_DIRECTION_ID]);
    let courseRows = [];
    try {
        courseRows = await queryFn('SELECT course_text, embedding FROM mentor_course_embeddings WHERE user_id = ?', [
            userId,
        ]);
    }
    catch (e) {
        const code = String(e?.code || '');
        const msg = String(e?.message || '');
        if (!(code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist")))
            throw e;
        courseRows = [];
    }
    const courses = (courseRows || [])
        .map((r) => {
        const embedding = parseEmbedding(r?.embedding);
        if (!embedding)
            return null;
        const norm = l2Norm(embedding);
        if (!(norm > 0))
            return null;
        return { embedding, norm };
    })
        .filter(Boolean);
    if (courses.length === 0)
        return [];
    const directions = (dirRows || [])
        .map((r) => {
        const directionId = String(r?.source_id || '').trim();
        if (!directionId)
            return null;
        const embedding = parseEmbedding(r?.embedding);
        if (!embedding)
            return null;
        const dim = typeof r?.embedding_dim === 'number'
            ? r.embedding_dim
            : Number.parseInt(String(r?.embedding_dim ?? ''), 10);
        const expectedDim = Number.isFinite(dim) && dim > 0 ? dim : embedding.length;
        if (embedding.length !== expectedDim)
            return null;
        const norm = l2Norm(embedding);
        if (!(norm > 0))
            return null;
        return { directionId, embedding, norm };
    })
        .filter(Boolean);
    const scores = [];
    for (const dir of directions) {
        let best = 0;
        for (const c of courses) {
            const s = cosineSimilarity(dir.embedding, dir.norm, c.embedding, c.norm);
            if (s > best)
                best = s;
        }
        scores.push({ directionId: dir.directionId, score: best });
    }
    return scores;
}
function computeOthersScore(scores, hasCourses) {
    if (!hasCourses)
        return 0;
    let maxScore = 0;
    for (const s of scores) {
        if (s.directionId === OTHERS_DIRECTION_ID)
            continue;
        if (typeof s.score === 'number' && Number.isFinite(s.score) && s.score > maxScore)
            maxScore = s.score;
    }
    const delta = RELEVANCE_ABS_MIN - maxScore;
    return delta > 0 ? delta : 0;
}
async function refreshMentorDirectionScores(params) {
    const userId = params.userId;
    const queryFn = params.queryFn || (async (sql, args = []) => (0, db_1.query)(sql, args));
    const execFn = params.execFn || (async (sql, args = []) => (0, db_1.query)(sql, args));
    await ensureMentorDirectionScoresTable(queryFn);
    const hasCourses = await hasAnyMentorCourseEmbeddings(userId, queryFn);
    if (!hasCourses) {
        await execFn('DELETE FROM mentor_direction_scores WHERE user_id = ?', [userId]);
        return { stored: 0, mode: 'none' };
    }
    let scores = [];
    let mode = 'fallback';
    try {
        const vecOk = await (0, rdsVectorIndex_1.ensureCourseEmbeddingsVectorColumn)();
        const mentorVecOk = await (0, rdsVectorIndex_1.ensureMentorCourseEmbeddingsVectorIndex)();
        if (vecOk && mentorVecOk) {
            scores = await computeScoresWithVectors(userId, queryFn);
            mode = 'rds';
        }
        else {
            scores = await computeScoresFallback(userId, queryFn);
            mode = 'fallback';
        }
    }
    catch {
        scores = await computeScoresFallback(userId, queryFn);
        mode = 'fallback';
    }
    const othersScore = computeOthersScore(scores, hasCourses);
    scores = scores.filter((s) => s.directionId !== OTHERS_DIRECTION_ID);
    scores.push({ directionId: OTHERS_DIRECTION_ID, score: othersScore });
    await execFn('DELETE FROM mentor_direction_scores WHERE user_id = ?', [userId]);
    const rowsToInsert = scores
        .map((s) => ({ directionId: String(s.directionId || '').trim(), score: Number(s.score) }))
        .filter((s) => s.directionId && Number.isFinite(s.score));
    if (rowsToInsert.length === 0) {
        return { stored: 0, mode };
    }
    const placeholders = rowsToInsert.map(() => '(?, ?, ?)').join(',');
    const args = [];
    for (const row of rowsToInsert) {
        args.push(userId, row.directionId, row.score);
    }
    await execFn(`INSERT INTO mentor_direction_scores (user_id, direction_id, score) VALUES ${placeholders}`, args);
    return { stored: rowsToInsert.length, mode };
}
