import { pool, query } from '../db';
import {
  ensureRecommendationSchema,
  recomputeMentorCompletedSessionCount,
} from '../services/mentorRecommendation';

const main = async () => {
  await ensureRecommendationSchema();

  const rows = await query<Array<{ user_id: number }>>(
    "SELECT user_id FROM user_roles WHERE role = 'mentor'"
  );

  let updated = 0;
  const conn = await pool.getConnection();
  try {
    for (const row of rows || []) {
      const mentorUserId = Number(row.user_id);
      if (!Number.isFinite(mentorUserId) || mentorUserId <= 0) continue;
      await recomputeMentorCompletedSessionCount(conn, mentorUserId);
      updated += 1;
    }
  } finally {
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
      await pool.end();
    } catch {}
  });
