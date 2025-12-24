import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
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
  created_at?: Date | string | null;
};

type MentorProfileRow = {
  user_id: number;
  degree: string | null;
  school: string | null;
  updated_at?: Date | string | null;
};

type AccountSettingsRow = {
  email_notifications: number | null;
  home_course_order_json?: string | null;
};

const router = Router();

const parseOrderIds = (value: any): string[] | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const id = item.trim();
      if (!id) continue;
      if (id.length > 80) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= 200) break;
    }
    return out;
  } catch {
    return null;
  }
};

const sanitizeOrderIds = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id) continue;
    if (id.length > 80) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 200) break;
  }
  return out;
};

let homeCourseOrderColumnEnsured = false;

const isMissingHomeCourseOrderColumnError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('home_course_order_json');
};

const ensureHomeCourseOrderColumn = async () => {
  if (homeCourseOrderColumnEnsured) return true;
  try {
    await dbQuery('ALTER TABLE account_settings ADD COLUMN home_course_order_json TEXT NULL');
    homeCourseOrderColumnEnsured = true;
    return true;
  } catch (e: any) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
      homeCourseOrderColumnEnsured = true;
      return true;
    }
    return false;
  }
};

router.get('/ids', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const currentRows = await dbQuery<CurrentUserRow[]>(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const email = currentRows[0]?.email;
    if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

    let settingsRows: AccountSettingsRow[] = [];
    try {
      settingsRows = await dbQuery<AccountSettingsRow[]>(
        'SELECT email_notifications, home_course_order_json FROM account_settings WHERE email = ? LIMIT 1',
        [email]
      );
    } catch (e: any) {
      if (!isMissingHomeCourseOrderColumnError(e)) throw e;
      const ensured = await ensureHomeCourseOrderColumn();
      if (ensured) {
        settingsRows = await dbQuery<AccountSettingsRow[]>(
          'SELECT email_notifications, home_course_order_json FROM account_settings WHERE email = ? LIMIT 1',
          [email]
        );
      } else {
        settingsRows = await dbQuery<AccountSettingsRow[]>(
          'SELECT email_notifications FROM account_settings WHERE email = ? LIMIT 1',
          [email]
        );
      }
    }
    let emailNotificationsEnabled = false;
    let homeCourseOrderIds: string[] | null = null;
    if (settingsRows.length === 0) {
      await dbQuery(
        'INSERT IGNORE INTO account_settings (email, email_notifications) VALUES (?, ?)',
        [email, 1]
      );
      emailNotificationsEnabled = true;
    } else {
      emailNotificationsEnabled = !!settingsRows[0]?.email_notifications;
      homeCourseOrderIds = parseOrderIds(settingsRows[0]?.home_course_order_json);
    }

    const rows = await dbQuery<PublicIdRow[]>(
      "SELECT id, role, public_id, created_at FROM users WHERE email = ? AND role IN ('student','mentor')",
      [email]
    );

    let studentId: string | null = null;
    let mentorId: string | null = null;
    let studentUserId: number | null = null;
    let mentorUserId: number | null = null;
    let studentCreatedAt: Date | string | null = null;
    let mentorCreatedAt: Date | string | null = null;
    for (const row of rows) {
      if (row.role === 'student') {
        studentId = row.public_id;
        studentUserId = row.id;
        studentCreatedAt = row.created_at ?? null;
      }
      if (row.role === 'mentor') {
        mentorId = row.public_id;
        mentorUserId = row.id;
        mentorCreatedAt = row.created_at ?? null;
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

    return res.json({
      email,
      studentId,
      mentorId,
      degree,
      school,
      studentCreatedAt,
      mentorCreatedAt,
      emailNotificationsEnabled,
      homeCourseOrderIds,
    });
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

router.put(
  '/notifications',
  requireAuth,
  [
    body('emailNotificationsEnabled').isBoolean().withMessage('邮件通知设置无效'),
  ],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { emailNotificationsEnabled } = req.body as { emailNotificationsEnabled: boolean };

    try {
      const currentRows = await dbQuery<CurrentUserRow[]>(
        'SELECT email FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      const email = currentRows[0]?.email;
      if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

      await dbQuery(
        `INSERT INTO account_settings (email, email_notifications)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           email_notifications = VALUES(email_notifications),
           updated_at = CURRENT_TIMESTAMP`,
        [email, emailNotificationsEnabled ? 1 : 0]
      );

      return res.json({ message: '保存成功', emailNotificationsEnabled });
    } catch (e) {
      console.error('Account notifications update error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.get('/home-course-order', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const currentRows = await dbQuery<CurrentUserRow[]>(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const email = currentRows[0]?.email;
    if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

    await dbQuery(
      'INSERT IGNORE INTO account_settings (email, email_notifications) VALUES (?, ?)',
      [email, 1]
    );

    let rows: AccountSettingsRow[] = [];
    try {
      rows = await dbQuery<AccountSettingsRow[]>(
        'SELECT home_course_order_json FROM account_settings WHERE email = ? LIMIT 1',
        [email]
      );
    } catch (e: any) {
      if (!isMissingHomeCourseOrderColumnError(e)) throw e;
      const ensured = await ensureHomeCourseOrderColumn();
      if (ensured) {
        rows = await dbQuery<AccountSettingsRow[]>(
          'SELECT home_course_order_json FROM account_settings WHERE email = ? LIMIT 1',
          [email]
        );
      } else {
        return res.json({ orderIds: null });
      }
    }

    const orderIds = parseOrderIds(rows[0]?.home_course_order_json);
    return res.json({ orderIds });
  } catch (e) {
    console.error('Account home course order fetch error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.put(
  '/home-course-order',
  requireAuth,
  [body('orderIds').isArray().withMessage('顺序数据无效')],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { orderIds } = req.body as { orderIds: unknown };
    const sanitized = sanitizeOrderIds(orderIds);

    try {
      const currentRows = await dbQuery<CurrentUserRow[]>(
        'SELECT email FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      const email = currentRows[0]?.email;
      if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

      try {
        await dbQuery(
          `INSERT INTO account_settings (email, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`,
          [email, JSON.stringify(sanitized)]
        );
      } catch (e: any) {
        if (!isMissingHomeCourseOrderColumnError(e)) throw e;
        const ensured = await ensureHomeCourseOrderColumn();
        if (!ensured) {
          return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 中的 account_settings 迁移' });
        }
        await dbQuery(
          `INSERT INTO account_settings (email, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`,
          [email, JSON.stringify(sanitized)]
        );
      }

      return res.json({ message: '保存成功', orderIds: sanitized });
    } catch (e) {
      console.error('Account home course order save error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.put(
  '/password',
  requireAuth,
  [
    body('newPassword').isString().isLength({ min: 6 }).withMessage('密码至少6位'),
    body('confirmPassword')
      .isString()
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('两次输入的密码不一致'),
  ],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { newPassword } = req.body as { newPassword: string; confirmPassword: string };

    try {
      const currentRows = await dbQuery<CurrentUserRow[]>(
        'SELECT email FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      const email = currentRows[0]?.email;
      if (!email) return res.status(401).json({ error: '登录状态异常，请重新登录' });

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const result = await dbQuery<any>(
        "UPDATE users SET password_hash = ? WHERE email = ? AND role IN ('student','mentor')",
        [passwordHash, email]
      );

      const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
      if (affected === 0) {
        return res.status(404).json({ error: '未找到账号信息' });
      }

      return res.json({ message: '密码已更新' });
    } catch (e) {
      console.error('Account password update error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
