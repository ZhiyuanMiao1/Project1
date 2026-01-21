import dotenv from 'dotenv';
import { pool, query } from '../db';
import { applyMentorCourseEmbeddings, prepareMentorCourseEmbeddings, sanitizeMentorCourses } from '../services/mentorCourseEmbeddings';
import { refreshMentorDirectionScores } from '../services/mentorDirectionScores';

dotenv.config();

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing env var: ${name}`);
  return value.trim();
};

const parseArgs = (argv: string[]) => {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
};

type MentorRow = { user_id: number; courses_json: string | null };

const parseCoursesJson = (raw: any): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const approvedOnly = Boolean(args.get('approved-only'));
    const dryRun = Boolean(args.get('dry-run'));
    const limitRaw = args.get('limit');
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : null;

    const apiKey = requiredEnv('DASHSCOPE_API_KEY');

    const whereApproved = approvedOnly ? "AND ur.mentor_approved = 1" : '';

    const rows = await query<MentorRow[]>(
      `
      SELECT ur.user_id, mp.courses_json
      FROM user_roles ur
      LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
      WHERE ur.role = 'mentor'
      ${whereApproved}
      ORDER BY ur.user_id ASC
      `
    );

    const mentors = (rows || []).filter((r) => typeof r.user_id === 'number');
    const sliced = limit && Number.isFinite(limit) && limit > 0 ? mentors.slice(0, limit) : mentors;

    console.log(
      `[backfill-mentor-course-embeddings] mentors=${sliced.length} approvedOnly=${approvedOnly} dryRun=${dryRun}`
    );

    let done = 0;
    for (const mentor of sliced) {
      const userId = mentor.user_id;
      const coursesRaw = parseCoursesJson(mentor.courses_json);
      const courses = sanitizeMentorCourses(coursesRaw, 50);

      if (dryRun) {
        console.log(`[dry-run] user_id=${userId} courses=${courses.length}`);
        done++;
        continue;
      }

      const prepared =
        courses.length > 0
          ? await prepareMentorCourseEmbeddings({ userId, courses, apiKey })
          : { keepKeys: [] as string[], upserts: [] as any[] };

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await applyMentorCourseEmbeddings({
          userId,
          keepKeys: prepared.keepKeys,
          upserts: prepared.upserts,
          exec: async (sql: string, args: any[] = []) => {
            await conn.execute(sql, args);
          },
        });

        await refreshMentorDirectionScores({
          userId,
          queryFn: async (sql: string, args: any[] = []) => {
            const [rows] = await conn.execute(sql, args);
            return rows as any[];
          },
          execFn: async (sql: string, args: any[] = []) => {
            await conn.execute(sql, args);
          },
        });
        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch {}
        throw e;
      } finally {
        conn.release();
      }

      done++;
      if (done % 5 === 0 || done === sliced.length) {
        console.log(`[backfill-mentor-course-embeddings] progress ${done}/${sliced.length}`);
      }
    }

    console.log('[backfill-mentor-course-embeddings] done');
  } finally {
    try {
      await pool.end();
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
