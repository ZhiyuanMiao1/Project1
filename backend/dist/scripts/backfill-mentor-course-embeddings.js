"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../db");
const mentorCourseEmbeddings_1 = require("../services/mentorCourseEmbeddings");
const mentorDirectionScores_1 = require("../services/mentorDirectionScores");
dotenv_1.default.config();
const requiredEnv = (name) => {
    const value = process.env[name];
    if (!value || !value.trim())
        throw new Error(`Missing env var: ${name}`);
    return value.trim();
};
const parseArgs = (argv) => {
    const args = new Map();
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (!t.startsWith('--'))
            continue;
        const key = t.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args.set(key, true);
        }
        else {
            args.set(key, next);
            i++;
        }
    }
    return args;
};
const parseCoursesJson = (raw) => {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(String(raw));
        if (!Array.isArray(parsed))
            return [];
        return parsed;
    }
    catch {
        return [];
    }
};
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const approvedOnly = Boolean(args.get('approved-only'));
    const dryRun = Boolean(args.get('dry-run'));
    const limitRaw = args.get('limit');
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : null;
    const apiKey = requiredEnv('DASHSCOPE_API_KEY');
    const whereApproved = approvedOnly ? "AND ur.mentor_approved = 1" : '';
    const rows = await (0, db_1.query)(`
    SELECT ur.user_id, mp.courses_json
    FROM user_roles ur
    LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
    WHERE ur.role = 'mentor'
    ${whereApproved}
    ORDER BY ur.user_id ASC
    `);
    const mentors = (rows || []).filter((r) => typeof r.user_id === 'number');
    const sliced = limit && Number.isFinite(limit) && limit > 0 ? mentors.slice(0, limit) : mentors;
    console.log(`[backfill-mentor-course-embeddings] mentors=${sliced.length} approvedOnly=${approvedOnly} dryRun=${dryRun}`);
    let done = 0;
    for (const mentor of sliced) {
        const userId = mentor.user_id;
        const coursesRaw = parseCoursesJson(mentor.courses_json);
        const courses = (0, mentorCourseEmbeddings_1.sanitizeMentorCourses)(coursesRaw, 50);
        if (dryRun) {
            console.log(`[dry-run] user_id=${userId} courses=${courses.length}`);
            done++;
            continue;
        }
        const prepared = courses.length > 0
            ? await (0, mentorCourseEmbeddings_1.prepareMentorCourseEmbeddings)({ userId, courses, apiKey })
            : { keepKeys: [], upserts: [] };
        const conn = await db_1.pool.getConnection();
        try {
            await conn.beginTransaction();
            await (0, mentorCourseEmbeddings_1.applyMentorCourseEmbeddings)({
                userId,
                keepKeys: prepared.keepKeys,
                upserts: prepared.upserts,
                exec: async (sql, args = []) => {
                    await conn.execute(sql, args);
                },
            });
            await (0, mentorDirectionScores_1.refreshMentorDirectionScores)({
                userId,
                queryFn: async (sql, args = []) => {
                    const [rows] = await conn.execute(sql, args);
                    return rows;
                },
                execFn: async (sql, args = []) => {
                    await conn.execute(sql, args);
                },
            });
            await conn.commit();
        }
        catch (e) {
            try {
                await conn.rollback();
            }
            catch { }
            throw e;
        }
        finally {
            conn.release();
        }
        done++;
        if (done % 5 === 0 || done === sliced.length) {
            console.log(`[backfill-mentor-course-embeddings] progress ${done}/${sliced.length}`);
        }
    }
    console.log('[backfill-mentor-course-embeddings] done');
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
