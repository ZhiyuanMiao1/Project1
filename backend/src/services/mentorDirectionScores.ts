import { query } from '../db';
import { ensureCourseEmbeddingsVectorColumn, ensureMentorCourseEmbeddingsVectorIndex } from './rdsVectorIndex';

type DbQuery = (sql: string, params?: any[]) => Promise<any[]>;
type DbExec = (sql: string, params?: any[]) => Promise<any>;

export type MentorDirectionScore = { directionId: string; score: number };

type DirectionEmbeddingRow = { source_id: string; embedding: any; embedding_dim: any };
type MentorCourseEmbeddingRow = { course_text: string; embedding: any };
type CountRow = { c: any };

const DIRECTION_KIND = 'direction';
const OTHERS_DIRECTION_ID = 'others';

const RELEVANCE_ABS_MIN = 0.35;

let mentorDirectionScoresEnsured = false;

export async function ensureMentorDirectionScoresTable() {
  if (mentorDirectionScoresEnsured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS \`mentor_direction_scores\` (
      \`user_id\` INT NOT NULL,
      \`direction_id\` VARCHAR(64) NOT NULL,
      \`score\` DOUBLE NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`, \`direction_id\`),
      KEY \`idx_mds_direction_score\` (\`direction_id\`, \`score\`),
      CONSTRAINT \`fk_mds_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  mentorDirectionScoresEnsured = true;
}

const parseEmbedding = (raw: any): number[] | null => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out = parsed.map((x) => (typeof x === 'number' ? x : Number.parseFloat(String(x))));
    if (out.some((n) => !Number.isFinite(n))) return null;
    return out as number[];
  } catch {
    return null;
  }
};

const l2Norm = (vec: number[]) => {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
};

const cosineSimilarity = (a: number[], aNorm: number, b: number[], bNorm: number) => {
  if (a.length !== b.length || a.length === 0) return 0;
  if (aNorm <= 0 || bNorm <= 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
};

async function hasAnyMentorCourseEmbeddings(userId: number, queryFn: DbQuery) {
  try {
    const rows = await queryFn('SELECT COUNT(*) AS c FROM mentor_course_embeddings WHERE user_id = ? LIMIT 1', [
      userId,
    ]);
    const n = typeof (rows?.[0] as any)?.c === 'number' ? (rows[0] as any).c : Number((rows?.[0] as any)?.c);
    return Number.isFinite(n) && n > 0;
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist")) return false;
    throw e;
  }
}

async function computeScoresWithVectors(userId: number, queryFn: DbQuery): Promise<MentorDirectionScore[]> {
  const rows = await queryFn(
    `
    SELECT
      ce.source_id AS direction_id,
      MAX(1 - VEC_DISTANCE(mce.embedding_vec, ce.embedding_vec)) AS score
    FROM course_embeddings ce
    JOIN mentor_course_embeddings mce ON mce.user_id = ?
    WHERE ce.kind = ? AND ce.source_id <> ?
    GROUP BY ce.source_id
    `,
    [userId, DIRECTION_KIND, OTHERS_DIRECTION_ID]
  );

  return (rows || [])
    .map((r) => {
      const directionId = String((r as any)?.direction_id || '').trim();
      const rawScore = (r as any)?.score;
      const score = typeof rawScore === 'number' ? rawScore : Number.parseFloat(String(rawScore ?? '0'));
      if (!directionId) return null;
      return { directionId, score: Number.isFinite(score) ? score : 0 };
    })
    .filter(Boolean) as MentorDirectionScore[];
}

async function computeScoresFallback(userId: number, queryFn: DbQuery): Promise<MentorDirectionScore[]> {
  const dirRows = await queryFn(
    'SELECT source_id, embedding, embedding_dim FROM course_embeddings WHERE kind = ? AND source_id <> ?',
    [DIRECTION_KIND, OTHERS_DIRECTION_ID]
  );

  let courseRows: MentorCourseEmbeddingRow[] = [];
  try {
    courseRows = await queryFn('SELECT course_text, embedding FROM mentor_course_embeddings WHERE user_id = ?', [
      userId,
    ]);
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (!(code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist"))) throw e;
    courseRows = [];
  }

  const courses = (courseRows || [])
    .map((r) => {
      const embedding = parseEmbedding((r as any)?.embedding);
      if (!embedding) return null;
      const norm = l2Norm(embedding);
      if (!(norm > 0)) return null;
      return { embedding, norm };
    })
    .filter(Boolean) as Array<{ embedding: number[]; norm: number }>;

  if (courses.length === 0) return [];

  const directions = (dirRows || [])
    .map((r) => {
      const directionId = String((r as any)?.source_id || '').trim();
      if (!directionId) return null;
      const embedding = parseEmbedding((r as any)?.embedding);
      if (!embedding) return null;
      const dim = typeof (r as any)?.embedding_dim === 'number'
        ? (r as any).embedding_dim
        : Number.parseInt(String((r as any)?.embedding_dim ?? ''), 10);
      const expectedDim = Number.isFinite(dim) && dim > 0 ? dim : embedding.length;
      if (embedding.length !== expectedDim) return null;
      const norm = l2Norm(embedding);
      if (!(norm > 0)) return null;
      return { directionId, embedding, norm };
    })
    .filter(Boolean) as Array<{ directionId: string; embedding: number[]; norm: number }>;

  const scores: MentorDirectionScore[] = [];
  for (const dir of directions) {
    let best = 0;
    for (const c of courses) {
      const s = cosineSimilarity(dir.embedding, dir.norm, c.embedding, c.norm);
      if (s > best) best = s;
    }
    scores.push({ directionId: dir.directionId, score: best });
  }

  return scores;
}

function computeOthersScore(scores: MentorDirectionScore[], hasCourses: boolean) {
  if (!hasCourses) return 0;
  let maxScore = 0;
  for (const s of scores) {
    if (s.directionId === OTHERS_DIRECTION_ID) continue;
    if (typeof s.score === 'number' && Number.isFinite(s.score) && s.score > maxScore) maxScore = s.score;
  }
  const delta = RELEVANCE_ABS_MIN - maxScore;
  return delta > 0 ? delta : 0;
}

export async function refreshMentorDirectionScores(params: {
  userId: number;
  queryFn?: DbQuery;
  execFn?: DbExec;
}) {
  const userId = params.userId;
  const queryFn = params.queryFn || (async (sql: string, args: any[] = []) => query<any[]>(sql, args));
  const execFn = params.execFn || (async (sql: string, args: any[] = []) => query<any>(sql, args));

  await ensureMentorDirectionScoresTable();

  const hasCourses = await hasAnyMentorCourseEmbeddings(userId, queryFn);

  if (!hasCourses) {
    await execFn('DELETE FROM mentor_direction_scores WHERE user_id = ?', [userId]);
    return { stored: 0, mode: 'none' as const };
  }

  let scores: MentorDirectionScore[] = [];
  let mode: 'rds' | 'fallback' = 'fallback';
  try {
    const vecOk = await ensureCourseEmbeddingsVectorColumn();
    const mentorVecOk = await ensureMentorCourseEmbeddingsVectorIndex();
    if (vecOk && mentorVecOk) {
      scores = await computeScoresWithVectors(userId, queryFn);
      mode = 'rds';
    } else {
      scores = await computeScoresFallback(userId, queryFn);
      mode = 'fallback';
    }
  } catch {
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
  const args: any[] = [];
  for (const row of rowsToInsert) {
    args.push(userId, row.directionId, row.score);
  }

  await execFn(
    `INSERT INTO mentor_direction_scores (user_id, direction_id, score) VALUES ${placeholders}`,
    args
  );

  return { stored: rowsToInsert.length, mode };
}

