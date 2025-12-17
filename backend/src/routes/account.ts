import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query as dbQuery } from '../db';
import { body, validationResult } from 'express-validator';

type Role = 'student' | 'mentor';

type CurrentUserRow = {
  email: string;
};

type PublicIdRow = {
  role: Role;
  public_id: string;
  id: number;
};

type MentorProfileRow = {
  user_id: number;
  degree: string | null;
  school: string | null;
  updated_at?: Date | string | null;
};

const router = Router();

router.get('/ids', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const currentRows = await dbQuery<CurrentUserRow[]>(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const email = currentRows[0]?.email;
    if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

    const rows = await dbQuery<PublicIdRow[]>(
      "SELECT id, role, public_id FROM users WHERE email = ? AND role IN ('student','mentor')",
      [email]
    );

    let studentId: string | null = null;
    let mentorId: string | null = null;
    let studentUserId: number | null = null;
    let mentorUserId: number | null = null;
    for (const row of rows) {
      if (row.role === 'student') {
        studentId = row.public_id;
        studentUserId = row.id;
      }
      if (row.role === 'mentor') {
        mentorId = row.public_id;
        mentorUserId = row.id;
      }
    }

    let degree: string | null = null;
    let school: string | null = null;
    const profileUserIds = [studentUserId, mentorUserId].filter((id): id is number => typeof id === 'number');
    if (profileUserIds.length > 0) {
      const placeholders = profileUserIds.map(() => '?').join(',');
      const profRows = await dbQuery<MentorProfileRow[]>(
        `SELECT user_id, degree, school, updated_at FROM mentor_profiles WHERE user_id IN (${placeholders})`,
        profileUserIds
      );

      const candidates = (profRows || []).map((row) => {
        const norm = (value: any) => (typeof value === 'string' && value.trim() !== '' ? value : null);
        const updatedAt = row.updated_at ? new Date(row.updated_at as any).getTime() : 0;
        const nextDegree = norm(row.degree);
        const nextSchool = norm(row.school);
        const hasValue = !!nextDegree || !!nextSchool;
        return {
          userId: row.user_id,
          degree: nextDegree,
          school: nextSchool,
          hasValue,
          updatedAt,
        };
      });

      const withValue = candidates.filter((c) => c.hasValue);
      const sorted = (withValue.length > 0 ? withValue : candidates)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const picked = sorted[0];
      if (picked) {
        degree = picked.degree;
        school = picked.school;
      }
    }

    return res.json({ email, studentId, mentorId, degree, school });
  } catch (e) {
    console.error('Account ids error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.put(
  '/profile',
  requireAuth,
  [
    body('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    body('school').optional().isString().trim().isLength({ max: 200 }).withMessage('学校无效'),
  ],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const hasDegree = Object.prototype.hasOwnProperty.call(req.body, 'degree');
    const hasSchool = Object.prototype.hasOwnProperty.call(req.body, 'school');
    if (!hasDegree && !hasSchool) {
      return res.status(400).json({ error: '没有可保存的字段' });
    }

    const normalize = (value: any) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    };

    try {
      const currentRows = await dbQuery<CurrentUserRow[]>(
        'SELECT email FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      const email = currentRows[0]?.email;
      if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

      const rows = await dbQuery<PublicIdRow[]>(
        "SELECT id, role, public_id FROM users WHERE email = ? AND role IN ('student','mentor')",
        [email]
      );

      let studentUserId: number | null = null;
      let mentorUserId: number | null = null;
      for (const row of rows) {
        if (row.role === 'student') studentUserId = row.id;
        if (row.role === 'mentor') mentorUserId = row.id;
      }

      const targetUserIds = Array.from(new Set([studentUserId, mentorUserId].filter((id): id is number => typeof id === 'number')));
      if (targetUserIds.length === 0) {
        return res.status(404).json({ error: '未找到账号信息' });
      }

      const patchDegree = hasDegree ? normalize(req.body.degree) : undefined;
      const patchSchool = hasSchool ? normalize(req.body.school) : undefined;

      for (const userId of targetUserIds) {
        const existingRows = await dbQuery<any[]>(
          'SELECT degree, school FROM mentor_profiles WHERE user_id = ? LIMIT 1',
          [userId]
        );
        const existing = existingRows?.[0] || {};
        const existingDegree = normalize(existing.degree);
        const existingSchool = normalize(existing.school);

        const nextDegree = typeof patchDegree !== 'undefined' ? patchDegree : existingDegree;
        const nextSchool = typeof patchSchool !== 'undefined' ? patchSchool : existingSchool;

        await dbQuery(
          `INSERT INTO mentor_profiles (user_id, degree, school)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             degree = VALUES(degree),
             school = VALUES(school),
             updated_at = CURRENT_TIMESTAMP`,
          [userId, nextDegree, nextSchool]
        );
      }

      return res.json({ message: '保存成功' });
    } catch (e) {
      console.error('Account profile save error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
