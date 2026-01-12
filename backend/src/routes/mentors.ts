import { Router, Request, Response } from 'express';
import { query } from '../db';
import {
  ensureMentorTeachingLanguagesColumn,
  formatTeachingLanguageCodesForCard,
  isMissingTeachingLanguagesColumnError,
  parseTeachingLanguagesJson,
} from '../services/mentorTeachingLanguages';
import { ensureMentorCourseEmbeddingsVectorIndex } from '../services/rdsVectorIndex';

const router = Router();

const hrNow = () => process.hrtime.bigint();
const msSince = (start: bigint) => Number(hrNow() - start) / 1e6;

const getTimingFlag = (req: Request) => {
  const q = req.query as any;
  const raw = typeof q?.timing === 'string' ? q.timing.trim() : '';
  return raw === '1' || raw.toLowerCase() === 'true' || process.env.DEBUG_MENTOR_RANKING_TIMING === '1';
};

type ApprovedMentorRow = {
  user_id: number;
  public_id: string;
  username: string | null;
  display_name: string | null;
  gender: string | null;
  degree: string | null;
  school: string | null;
  timezone: string | null;
  courses_json: string | null;
  teaching_languages_json: string | null;
  avatar_url: string | null;
  rating: any;
  review_count: any;
  updated_at?: Date | string | null;
};

type ApprovedMentorCard = {
  id: string;
  name: string;
  gender: string;
  degree: string;
  school: string;
  rating: number;
  reviewCount: number;
  courses: string[];
  timezone: string;
  languages: string;
  imageUrl: string | null;
  relevanceScore?: number;
  relevanceCourse?: string;
};

type MentorInternal = ApprovedMentorCard & { _userId: number };

let mentorRatingColumnsEnsured = false;

const isMissingRatingColumnsError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  if (!(code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column'))) return false;
  return message.includes('rating') || message.includes('review_count');
};

const ensureMentorRatingColumns = async () => {
  if (mentorRatingColumnsEnsured) return true;

  const ensureColumn = async (sql: string) => {
    try {
      await query(sql);
      return true;
    } catch (e: any) {
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) return true;
      return false;
    }
  };

  const okRating = await ensureColumn('ALTER TABLE mentor_profiles ADD COLUMN rating DECIMAL(3,2) NOT NULL DEFAULT 0');
  const okReviewCount = await ensureColumn('ALTER TABLE mentor_profiles ADD COLUMN review_count INT NOT NULL DEFAULT 0');

  mentorRatingColumnsEnsured = okRating && okReviewCount;
  return mentorRatingColumnsEnsured;
};

const parseCourses = (raw: any): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, 50);
  } catch {
    return [];
  }
};

const hasNonEmptyText = (value: any) => typeof value === 'string' && value.trim().length > 0;

const normalizeRating = (raw: any) => {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '0'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};

const normalizeCount = (raw: any) => {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const parseEmbedding = (raw: any): number[] | null => {
  if (!raw) return null;
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
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
};

const cosineSimilarity = (a: number[], aNorm: number, b: number[], bNorm: number) => {
  if (a.length !== b.length || a.length === 0) return 0;
  if (aNorm <= 0 || bNorm <= 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
};

const RELEVANCE_TOP_RELATIVE_DELTA = 0.2;
const RELEVANCE_ABS_MIN = 0.35;

const applyTopRelativeCutoff = <T extends { relevanceScore?: number }>(items: T[], delta: number, absMin: number) => {
  if (!Array.isArray(items) || items.length === 0) return items;
  let maxScore = -Infinity;
  for (const item of items) {
    const s = typeof item?.relevanceScore === 'number' && Number.isFinite(item.relevanceScore) ? item.relevanceScore : 0;
    if (s > maxScore) maxScore = s;
  }
  if (!Number.isFinite(maxScore)) return items;
  const threshold = Math.max(maxScore - delta, absMin);
  return items.filter((item) => {
    const s = typeof item?.relevanceScore === 'number' && Number.isFinite(item.relevanceScore) ? item.relevanceScore : 0;
    return s >= threshold;
  });
};

type MentorCourseEmbeddingRow = { user_id: number; course_text: string; embedding: any };

async function loadDirectionEmbeddingById(directionId: string) {
  const rows = await query<any[]>(
    'SELECT embedding, embedding_dim FROM course_embeddings WHERE kind = ? AND source_id = ? LIMIT 1',
    ['direction', directionId]
  );
  const row = rows?.[0];
  const embedding = parseEmbedding(row?.embedding);
  if (!embedding) return null;
  return { embedding, embeddingDim: Number(row?.embedding_dim) || embedding.length };
}

// GET /api/mentors/approved
// Public: return mentors who have passed approval.
router.get('/approved', async (_req: Request, res: Response) => {
  const directionId = typeof _req.query?.directionId === 'string' ? _req.query.directionId.trim() : '';
  const timingEnabled = getTimingFlag(_req);
  const reqId = timingEnabled ? Math.random().toString(16).slice(2, 8) : '';
  const t0 = timingEnabled ? hrNow() : 0n;

  const runQuery = async () => {
    const rows = await query<ApprovedMentorRow[]>(
      `
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
      `
    );
    return rows || [];
  };

  try {
    const tMentorsQueryStart = timingEnabled ? hrNow() : 0n;
    let rows: ApprovedMentorRow[] = [];
    try {
      rows = await runQuery();
    } catch (e: any) {
      const missingRating = isMissingRatingColumnsError(e);
      const missingTeaching = isMissingTeachingLanguagesColumnError(e);
      if (!missingRating && !missingTeaching) throw e;
      if (missingRating) {
        const ensured = await ensureMentorRatingColumns();
        if (!ensured) throw e;
      }
      if (missingTeaching) {
        const ensured = await ensureMentorTeachingLanguagesColumn();
        if (!ensured) throw e;
      }
      rows = await runQuery();
    }
    const tMentorsQueryMs = timingEnabled ? msSince(tMentorsQueryStart) : 0;

    const tBuildCardsStart = timingEnabled ? hrNow() : 0n;
    let mentors: MentorInternal[] = rows.flatMap((row) => {
      const courses = parseCourses(row.courses_json);
      const hasAnyProfileInfo =
        hasNonEmptyText(row.avatar_url) ||
        hasNonEmptyText(row.school) ||
        hasNonEmptyText(row.degree) ||
        hasNonEmptyText(row.timezone) ||
        hasNonEmptyText(row.gender) ||
        courses.length > 0;

      if (!hasAnyProfileInfo) return [];

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
          languages: formatTeachingLanguageCodesForCard(parseTeachingLanguagesJson(row.teaching_languages_json)),
          imageUrl: row.avatar_url || null,
        },
      ];
    });
    const tBuildCardsMs = timingEnabled ? msSince(tBuildCardsStart) : 0;

    if (directionId) {
      let vectorRanked = false;
      const vectorUserIds = Array.from(new Set(mentors.map((m) => Number(m._userId)).filter((n) => Number.isFinite(n))));

      if (vectorUserIds.length > 0) {
        const tVectorEnsureStart = timingEnabled ? hrNow() : 0n;
        let vectorReady = false;
        try {
          vectorReady = await ensureMentorCourseEmbeddingsVectorIndex();
        } catch {
          vectorReady = false;
        }
        const tVectorEnsureMs = timingEnabled ? msSince(tVectorEnsureStart) : 0;

        if (vectorReady) {
          const dirRows = await query<any[]>(
            "SELECT 1 AS ok FROM course_embeddings WHERE kind = 'direction' AND source_id = ? LIMIT 1",
            [directionId]
          );
          const directionEmbeddingExists = Boolean(dirRows?.[0]);

          if (directionEmbeddingExists) {
            const tVectorQueryStart = timingEnabled ? hrNow() : 0n;
            const placeholders = vectorUserIds.map(() => '?').join(',');

            type VectorMatchRow = { user_id: number; course_text: string; score: any };
            let matchRows: VectorMatchRow[] = [];
            try {
              matchRows = await query<VectorMatchRow[]>(
                `
                SELECT user_id, course_text, score
                FROM (
                  SELECT
                    mce.user_id,
                    mce.course_text,
                    (1 - VEC_DISTANCE(mce.embedding_vec, q.q_vec)) AS score,
                    ROW_NUMBER() OVER (PARTITION BY mce.user_id ORDER BY VEC_DISTANCE(mce.embedding_vec, q.q_vec) ASC) AS rn
                  FROM mentor_course_embeddings mce
                  JOIN (
                    SELECT TO_VECTOR(CAST(embedding AS CHAR)) AS q_vec
                    FROM course_embeddings
                    WHERE kind = 'direction' AND source_id = ?
                    LIMIT 1
                  ) q
                  WHERE mce.user_id IN (${placeholders})
                ) ranked
                WHERE rn = 1
                ORDER BY score DESC, user_id ASC
                `,
                [directionId, ...(vectorUserIds as any[])]
              );
              vectorRanked = true;
            } catch (e: any) {
              const code = String(e?.code || '');
              const msg = String(e?.message || '');
              if (timingEnabled) {
                console.warn(`[mentors/approved timing ${reqId}] vector ranking skipped (${code}): ${msg}`);
              }
            }
            const tVectorQueryMs = timingEnabled ? msSince(tVectorQueryStart) : 0;

            if (vectorRanked) {
              const byUser = new Map<number, { score: number; courseText: string }>();
              for (const r of matchRows || []) {
                const uid = Number(r?.user_id);
                if (!Number.isFinite(uid)) continue;
                const score = typeof r?.score === 'number' ? r.score : Number.parseFloat(String(r?.score ?? '0'));
                byUser.set(uid, { score: Number.isFinite(score) ? score : 0, courseText: String(r?.course_text || '') });
              }

              mentors = mentors
                .map((m) => {
                  const hit = byUser.get(Number(m._userId));
                  return hit ? { ...m, relevanceScore: hit.score, relevanceCourse: hit.courseText } : m;
                })
                .sort((a, b) => {
                  const sa = typeof a.relevanceScore === 'number' ? a.relevanceScore : 0;
                  const sb = typeof b.relevanceScore === 'number' ? b.relevanceScore : 0;
                  if (sb !== sa) return sb - sa;
                  return String(a.id).localeCompare(String(b.id));
                });

              mentors = applyTopRelativeCutoff(mentors, RELEVANCE_TOP_RELATIVE_DELTA, RELEVANCE_ABS_MIN);

              if (timingEnabled) {
                const totalMs = msSince(t0);
                console.log(
                  `[mentors/approved timing ${reqId}] directionId=${directionId} mentors=${mentors.length} userIds=${vectorUserIds.length} | ` +
                    `mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms ` +
                    `vecEnsure=${tVectorEnsureMs.toFixed(1)}ms vecQuery=${tVectorQueryMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms`
                );
              }
            }
          }
        }
      }

      if (!vectorRanked) {
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
          let courseRows: MentorCourseEmbeddingRow[] = [];
          try {
            courseRows = await query<MentorCourseEmbeddingRow[]>(
              `SELECT user_id, course_text, embedding FROM mentor_course_embeddings WHERE user_id IN (${placeholders})`,
              userIds as any[]
            );
          } catch (e: any) {
            const code = String(e?.code || '');
            const msg = String(e?.message || '');
            if (!(code === 'ER_NO_SUCH_TABLE' || msg.includes("doesn't exist"))) throw e;
            courseRows = [];
          }
          const tEmbeddingsQueryMs = timingEnabled ? msSince(tEmbeddingsQueryStart) : 0;

          const tParseAndGroupStart = timingEnabled ? hrNow() : 0n;
          let embeddingRawChars = 0;
          const byUser = new Map<number, Array<{ courseText: string; embedding: number[]; norm: number }>>();
          for (const r of courseRows || []) {
            const uid = Number(r?.user_id);
            if (!Number.isFinite(uid)) continue;
            if (timingEnabled) {
              if (typeof r?.embedding === 'string') embeddingRawChars += r.embedding.length;
              else {
                try {
                  embeddingRawChars += JSON.stringify(r?.embedding ?? null).length;
                } catch {}
              }
            }
            const emb = parseEmbedding(r?.embedding);
            if (!emb || emb.length !== q.length) continue;
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
              if (sb !== sa) return sb - sa;
              return String(a.id).localeCompare(String(b.id));
            });

          mentors = applyTopRelativeCutoff(mentors, RELEVANCE_TOP_RELATIVE_DELTA, RELEVANCE_ABS_MIN);
          const tScoreMs = timingEnabled ? msSince(tScoreStart) : 0;

          if (timingEnabled) {
            const totalMs = msSince(t0);
            console.log(
              `[mentors/approved timing ${reqId}] directionId=${directionId} mentors=${mentors.length} userIds=${userIds.length} ` +
                `courseRows=${courseRows.length} embChars≈${embeddingRawChars} dim=${q.length} | ` +
                `mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms ` +
                `tabEmbSQL=${tTabEmbeddingMs.toFixed(1)}ms norm=${tNormMs.toFixed(1)}ms ` +
                `embSQL=${tEmbeddingsQueryMs.toFixed(1)}ms parseGroup=${tParseAndGroupMs.toFixed(1)}ms scoreSort=${tScoreMs.toFixed(1)}ms ` +
                `TOTAL=${totalMs.toFixed(1)}ms`
            );
          }
        }
      } else if (timingEnabled) {
        const totalMs = msSince(t0);
        console.log(
          `[mentors/approved timing ${reqId}] directionId=${directionId} mentors=${mentors.length} ` +
            `mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms tabEmbSQL=${tTabEmbeddingMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms (no tab embedding found)`
        );
      }
      }
    } else if (timingEnabled) {
      const totalMs = msSince(t0);
      console.log(
        `[mentors/approved timing ${reqId}] directionId=<none> mentors=${mentors.length} mentorsSQL=${tMentorsQueryMs.toFixed(1)}ms buildCards=${tBuildCardsMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms`
      );
    }

    const publicMentors: ApprovedMentorCard[] = mentors.map(({ _userId, ...rest }) => rest);

    return res.json({ mentors: publicMentors });
  } catch (e) {
    console.error('Fetch approved mentors error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
