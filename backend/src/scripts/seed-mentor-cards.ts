import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

type SeedCard = {
  publicId: string; // e.g. s1
  degree: '本科' | '硕士' | 'PhD';
  school: string;
  timezone: string; // e.g. "UTC+8 (上海)"
  courseDirection: string; // direction id (matches my-app courseMappings)
  courseType: string; // course type id (matches my-app courseMappings)
  sessionDurationHours: number;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing env var: ${name}`);
  return value.trim();
};

const parsePort = (raw: string | undefined, fallback = 3306) => {
  const n = Number.parseInt((raw || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const SEED_CARDS: SeedCard[] = [
  { publicId: 's1', degree: 'PhD', school: '哈佛大学', timezone: 'UTC+8 (上海)', courseDirection: 'cs-foundation', courseType: 'course-selection', sessionDurationHours: 2 },
  { publicId: 's2', degree: '硕士', school: '斯坦福大学', timezone: 'UTC-7 (加州)', courseDirection: 'ml', courseType: 'assignment-project', sessionDurationHours: 1.5 },
  { publicId: 's3', degree: '硕士', school: '麻省理工学院', timezone: 'UTC-5 (纽约)', courseDirection: 'algo', courseType: 'pre-study', sessionDurationHours: 2 },
  { publicId: 's4', degree: 'PhD', school: '牛津大学', timezone: 'UTC+0 (伦敦)', courseDirection: 'ai-large-model', courseType: 'final-review', sessionDurationHours: 2 },
  { publicId: 's5', degree: '硕士', school: '剑桥大学', timezone: 'UTC+1 (柏林)', courseDirection: 'data-analysis', courseType: 'course-selection', sessionDurationHours: 1 },
  { publicId: 's6', degree: 'PhD', school: '清华大学', timezone: 'UTC+8 (上海)', courseDirection: 'advanced-math', courseType: 'assignment-project', sessionDurationHours: 2 },
  { publicId: 's7', degree: '硕士', school: '北京大学', timezone: 'UTC+8 (上海)', courseDirection: 'statistics', courseType: 'pre-study', sessionDurationHours: 1.5 },
  { publicId: 's8', degree: 'PhD', school: '加州大学伯克利分校', timezone: 'UTC-8 (洛杉矶)', courseDirection: 'software-engineering', courseType: 'in-class-support', sessionDurationHours: 2 },
  { publicId: 's9', degree: '硕士', school: '帝国理工学院', timezone: 'UTC+0 (伦敦)', courseDirection: 'physics', courseType: 'others', sessionDurationHours: 2 },
  { publicId: 's10', degree: '硕士', school: '多伦多大学', timezone: 'UTC-5 (纽约)', courseDirection: 'life-science', courseType: 'course-selection', sessionDurationHours: 1 },
  { publicId: 's11', degree: 'PhD', school: '苏黎世联邦理工', timezone: 'UTC+1 (柏林)', courseDirection: 'cybersecurity', courseType: 'assignment-project', sessionDurationHours: 1.5 },
  { publicId: 's12', degree: '硕士', school: '新加坡国立大学', timezone: 'UTC+8 (上海)', courseDirection: 'economics', courseType: 'pre-study', sessionDurationHours: 2 },
];

const buildSeedEmail = (publicId: string) => `seed_${publicId}@mentory.local`;

async function main() {
  const host = requiredEnv('DB_HOST');
  const user = requiredEnv('DB_USER');
  const password = process.env.DB_PASSWORD || '';
  const database = requiredEnv('DB_NAME');
  const port = parsePort(process.env.DB_PORT, 3306);

  const connection = await mysql.createConnection({ host, port, user, password, database, multipleStatements: false });

  const queryScalar = async <T = any>(sql: string, params: any[] = []) => {
    const [rows] = await connection.query<any[]>(sql, params);
    return (rows?.[0] as any) as T;
  };

  const ensureUserIdByPublicId = async (publicId: string) => {
    const existing = await queryScalar<{ user_id?: number }>(
      "SELECT user_id FROM user_roles WHERE role = 'student' AND public_id = ? LIMIT 1",
      [publicId]
    );
    if (existing?.user_id) return Number(existing.user_id);

    const email = buildSeedEmail(publicId);
    const pwHash = await bcrypt.hash('Password123!', 10);

    const userRow = await queryScalar<{ id?: number }>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    let userId = userRow?.id ? Number(userRow.id) : 0;

    if (!userId) {
      const [result] = await connection.execute<any>(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [publicId.toUpperCase(), email, pwHash]
      );
      userId = Number((result as any)?.insertId || 0);
    }
    if (!userId) throw new Error(`Failed to create/find user for ${publicId}`);

    await connection.execute(
      "INSERT INTO user_roles (user_id, role, mentor_approved, public_id) VALUES (?, 'student', 0, ?) ON DUPLICATE KEY UPDATE public_id = VALUES(public_id)",
      [userId, publicId]
    );

    return userId;
  };

  const ensureStudentProfile = async (userId: number, card: SeedCard) => {
    await connection.execute(
      `INSERT INTO mentor_profiles (user_id, degree, school, timezone)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         degree = VALUES(degree),
         school = VALUES(school),
         timezone = VALUES(timezone),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, card.degree, card.school, card.timezone]
    );
  };

  const ensureCourseRequest = async (userId: number, card: SeedCard) => {
    const existing = await queryScalar<{ id?: number }>(
      `SELECT id FROM course_requests
       WHERE user_id = ? AND status = 'submitted'
         AND course_direction = ? AND course_type = ?
         AND session_duration_hours = ?
       LIMIT 1`,
      [userId, card.courseDirection, card.courseType, card.sessionDurationHours]
    );
    if (existing?.id) return Number(existing.id);

    const [result] = await connection.execute<any>(
      `INSERT INTO course_requests
         (user_id, status, course_direction, course_type, course_types_json, time_zone, session_duration_hours, submitted_at)
       VALUES
         (?, 'submitted', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        userId,
        card.courseDirection,
        card.courseType,
        JSON.stringify([card.courseType]),
        card.timezone,
        card.sessionDurationHours,
      ]
    );
    return Number((result as any)?.insertId || 0);
  };

  console.log('[seed-mentor-cards] seeding 12 student requests...');

  await connection.beginTransaction();
  try {
    for (const card of SEED_CARDS) {
      const userId = await ensureUserIdByPublicId(card.publicId);
      await ensureStudentProfile(userId, card);
      const requestId = await ensureCourseRequest(userId, card);
      console.log(`[seed-mentor-cards] upserted ${card.publicId} -> request ${requestId}`);
    }
    await connection.commit();
  } catch (e) {
    try { await connection.rollback(); } catch {}
    throw e;
  } finally {
    await connection.end();
  }

  console.log('[seed-mentor-cards] done.');
}

main().catch((err) => {
  console.error('[seed-mentor-cards] failed:', err);
  process.exitCode = 1;
});
