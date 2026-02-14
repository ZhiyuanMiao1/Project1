import { Request, Response, Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

type CourseView = 'student' | 'mentor';

const isMissingCoursesSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('course_sessions');
};

const normalizeView = (raw: unknown): CourseView | '' => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'student' || value === 'mentor') return value;
  return '';
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const toDateKey = (raw: unknown) => {
  if (typeof raw === 'string') {
    const text = raw.trim();
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`;
  }

  return '';
};

const toIsoString = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString();
};

const toNumber = (raw: unknown) => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
};

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const view = normalizeView(req.query?.view);
  if (!view) {
    return res.status(400).json({ error: '参数错误：view 仅支持 student 或 mentor' });
  }

  try {
    const sql = view === 'student'
      ? `
        SELECT
          cs.id,
          cs.course_direction,
          cs.course_type,
          cs.starts_at,
          cs.duration_hours,
          cs.status,
          COALESCE(NULLIF(TRIM(mp.display_name), ''), NULLIF(TRIM(mu.username), ''), NULLIF(TRIM(mr.public_id), ''), 'mentor') AS counterpart_name,
          COALESCE(NULLIF(TRIM(mr.public_id), ''), '') AS counterpart_public_id,
          COALESCE(NULLIF(TRIM(mp.avatar_url), ''), '') AS counterpart_avatar_url,
          mp.rating AS counterpart_rating
        FROM course_sessions cs
        LEFT JOIN users mu
          ON mu.id = cs.mentor_user_id
        LEFT JOIN user_roles mr
          ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
        LEFT JOIN mentor_profiles mp
          ON mp.user_id = cs.mentor_user_id
        WHERE cs.student_user_id = ?
          AND cs.status IN ('scheduled', 'completed')
        ORDER BY cs.starts_at DESC, cs.id DESC
        LIMIT 500
      `
      : `
        SELECT
          cs.id,
          cs.course_direction,
          cs.course_type,
          cs.starts_at,
          cs.duration_hours,
          cs.status,
          COALESCE(NULLIF(TRIM(sr.public_id), ''), NULLIF(TRIM(su.username), ''), 'student') AS counterpart_name,
          COALESCE(NULLIF(TRIM(sr.public_id), ''), '') AS counterpart_public_id,
          COALESCE(NULLIF(TRIM(sas.student_avatar_url), ''), '') AS counterpart_avatar_url,
          NULL AS counterpart_rating
        FROM course_sessions cs
        LEFT JOIN users su
          ON su.id = cs.student_user_id
        LEFT JOIN user_roles sr
          ON sr.user_id = cs.student_user_id AND sr.role = 'student'
        LEFT JOIN account_settings sas
          ON sas.user_id = cs.student_user_id
        WHERE cs.mentor_user_id = ?
          AND cs.status IN ('scheduled', 'completed')
        ORDER BY cs.starts_at DESC, cs.id DESC
        LIMIT 500
      `;

    const rows = await query<any[]>(sql, [req.user.id]);

    const courses = (rows || []).map((row) => {
      const durationHours = toNumber(row?.duration_hours) ?? 0;
      return {
        id: String(row?.id ?? ''),
        courseDirectionId: typeof row?.course_direction === 'string' ? row.course_direction.trim() : '',
        courseTypeId: typeof row?.course_type === 'string' ? row.course_type.trim() : '',
        date: toDateKey(row?.starts_at),
        startsAt: toIsoString(row?.starts_at),
        durationHours,
        status: typeof row?.status === 'string' ? row.status.trim() : '',
        counterpartName: typeof row?.counterpart_name === 'string' ? row.counterpart_name.trim() : '',
        counterpartPublicId: typeof row?.counterpart_public_id === 'string' ? row.counterpart_public_id.trim() : '',
        counterpartAvatarUrl: typeof row?.counterpart_avatar_url === 'string' ? row.counterpart_avatar_url.trim() : '',
        counterpartRating: toNumber(row?.counterpart_rating),
      };
    });

    return res.json({ view, courses });
  } catch (e) {
    if (isMissingCoursesSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch courses error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
