"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const mentorRecommendation_1 = require("../services/mentorRecommendation");
const main = async () => {
    await (0, mentorRecommendation_1.ensureRecommendationSchema)();
    const rows = await (0, db_1.query)("SELECT user_id FROM user_roles WHERE role = 'mentor'");
    let updated = 0;
    const conn = await db_1.pool.getConnection();
    try {
        for (const row of rows || []) {
            const mentorUserId = Number(row.user_id);
            if (!Number.isFinite(mentorUserId) || mentorUserId <= 0)
                continue;
            await (0, mentorRecommendation_1.recomputeMentorCompletedSessionCount)(conn, mentorUserId);
            updated += 1;
        }
    }
    finally {
        conn.release();
    }
    console.log(`[backfill-mentor-recommendation-stats] done mentors=${updated}`);
};
main()
    .catch((error) => {
    console.error('[backfill-mentor-recommendation-stats] failed', error);
    process.exitCode = 1;
})
    .finally(async () => {
    try {
        await db_1.pool.end();
    }
    catch { }
});
