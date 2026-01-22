import crypto from 'crypto';
import { pool, query } from '../db';
import { applyMentorCourseEmbeddings, prepareMentorCourseEmbeddings, sanitizeMentorCourses } from './mentorCourseEmbeddings';
import { refreshMentorDirectionScores } from './mentorDirectionScores';

type Job = { userId: number; enqueuedAt: number };

const pending = new Map<number, Job>();
let running = false;
let scheduled = false;

const sha256Hex = (input: string) => crypto.createHash('sha256').update(input).digest('hex');

const normalizeCourseText = (input: string) => {
  const s = String(input ?? '').trim();
  const collapsed = s.replace(/\s+/g, ' ');
  return collapsed.toLowerCase();
};

const courseKeysForCompare = (courses: string[]) =>
  courses
    .map((c) => normalizeCourseText(c))
    .filter(Boolean)
    .map((c) => sha256Hex(c))
    .sort();

const equalStringArrays = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const parseCoursesJson = (raw: any): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

async function loadMentorCourses(userId: number) {
  const rows = await query<any[]>('SELECT courses_json FROM mentor_profiles WHERE user_id = ? LIMIT 1', [userId]);
  const coursesRaw = parseCoursesJson(rows?.[0]?.courses_json);
  const courses = sanitizeMentorCourses(coursesRaw, 50);
  return { courses, compareKeys: courseKeysForCompare(courses) };
}

async function applyEmbeddingsForMentor(userId: number, keepKeys: string[], upserts: any[]) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await applyMentorCourseEmbeddings({
      userId,
      keepKeys,
      upserts,
      exec: async (sql: string, args: any[] = []) => {
        await conn.execute(sql, args);
      },
    });
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

async function refreshDirectionScoresForMentor(userId: number) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
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
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

async function processJob(job: Job) {
  const userId = job.userId;
  const t0 = Date.now();
  try {
    const startState = await loadMentorCourses(userId);
    const courses = startState.courses;
    const startKeys = startState.compareKeys;

    const apiKey = String(process.env.DASHSCOPE_API_KEY || '').trim();
    const prepared =
      courses.length > 0
        ? await prepareMentorCourseEmbeddings({ userId, courses, apiKey })
        : { keepKeys: [] as string[], upserts: [] as any[] };

    const latestState = await loadMentorCourses(userId);
    if (!equalStringArrays(latestState.compareKeys, startKeys)) {
      console.log(
        `[mentorCourseAsync] skip stale job user_id=${userId} (courses changed during compute)`
      );
      return;
    }

    await applyEmbeddingsForMentor(userId, prepared.keepKeys, prepared.upserts);

    try {
      await refreshDirectionScoresForMentor(userId);
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code !== 'SCHEMA_NOT_UPGRADED') {
        console.error(`[mentorCourseAsync] refresh direction scores failed user_id=${userId}:`, e);
      }
    }

    const ms = Date.now() - t0;
    console.log(
      `[mentorCourseAsync] done user_id=${userId} courses=${courses.length} ms=${ms}`
    );
  } catch (e) {
    console.error(`[mentorCourseAsync] job failed user_id=${userId}:`, e);
  }
}

async function runQueue() {
  if (running) return;
  running = true;
  try {
    while (pending.size > 0) {
      const first = pending.keys().next();
      const userId = first?.value;
      if (typeof userId !== 'number') break;
      const job = pending.get(userId);
      pending.delete(userId);
      if (!job) continue;
      await processJob(job);
    }
  } finally {
    running = false;
    if (pending.size > 0) scheduleRun();
  }
}

function scheduleRun() {
  if (running || scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    void runQueue();
  });
}

export function enqueueMentorCourseAsyncRefresh(userId: number) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return;
  pending.delete(uid);
  pending.set(uid, { userId: uid, enqueuedAt: Date.now() });
  scheduleRun();
}

