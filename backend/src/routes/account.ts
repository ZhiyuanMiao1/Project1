import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth';
import { query as dbQuery } from '../db';
import { body, validationResult } from 'express-validator';
import { clearRefreshTokenCookie, revokeAllRefreshTokensForUser } from '../auth/refreshTokens';

type Role = 'student' | 'mentor';

type CurrentUserRow = {
  id: number;
  email: string;
};

type PublicIdRow = {
  role: Role;
  public_id: string;
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
  availability_json?: string | null;
  student_avatar_url?: string | null;
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

let availabilityColumnEnsured = false;

type AvailabilityBlock = { start: number; end: number };
type AvailabilityPayload = {
  timeZone: string;
  sessionDurationHours: number;
  daySelections: Record<string, AvailabilityBlock[]>;
};

const isMissingAvailabilityColumnError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('availability_json');
};

const ensureAvailabilityColumn = async () => {
  if (availabilityColumnEnsured) return true;
  try {
    await dbQuery('ALTER TABLE account_settings ADD COLUMN availability_json TEXT NULL');
    availabilityColumnEnsured = true;
    return true;
  } catch (e: any) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
      availabilityColumnEnsured = true;
      return true;
    }
    return false;
  }
};

let studentAvatarColumnEnsured = false;

const isMissingStudentAvatarColumnError = (e: any) => {
  const code = String(e?.code || '');
  const message = String(e?.message || '');
  return (code === 'ER_BAD_FIELD_ERROR' || message.includes('Unknown column')) && message.includes('student_avatar_url');
};

const ensureStudentAvatarColumn = async () => {
  if (studentAvatarColumnEnsured) return true;
  try {
    await dbQuery('ALTER TABLE account_settings ADD COLUMN student_avatar_url VARCHAR(500) NULL');
    studentAvatarColumnEnsured = true;
    return true;
  } catch (e: any) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || message.includes('Duplicate column name')) {
      studentAvatarColumnEnsured = true;
      return true;
    }
    return false;
  }
};

const roundToQuarter = (raw: any, min = 0.25, max = 10, fallback = 2) => {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.max(min, Math.min(max, n));
  return Number((Math.round(clamped / 0.25) * 0.25).toFixed(2));
};

const mergeBlocksList = (blocks: AvailabilityBlock[]) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const sorted = blocks
    .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
    .sort((a, b) => a.start - b.start);
  const merged: AvailabilityBlock[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
};

const isValidDayKey = (key: string) => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [yRaw, mRaw, dRaw] = key.split('-');
  const y = Number.parseInt(yRaw, 10);
  const m = Number.parseInt(mRaw, 10);
  const d = Number.parseInt(dRaw, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  if (!Number.isFinite(dt.getTime())) return false;
  const normalized = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return normalized === key;
};

const sanitizeDaySelections = (raw: any) => {
  const out: Record<string, AvailabilityBlock[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const entries = Object.entries(raw);
  for (const [key, value] of entries) {
    if (!isValidDayKey(key)) continue;
    if (!Array.isArray(value)) continue;
    const blocks: AvailabilityBlock[] = [];
    for (const item of value) {
      const start = Number((item as any)?.start);
      const end = Number((item as any)?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const s = Math.max(0, Math.min(95, Math.floor(start)));
      const e = Math.max(0, Math.min(95, Math.floor(end)));
      blocks.push({ start: Math.min(s, e), end: Math.max(s, e) });
      if (blocks.length >= 64) break;
    }
    const merged = mergeBlocksList(blocks);
    if (merged.length) out[key] = merged;
    if (Object.keys(out).length >= 730) break;
  }
  return out;
};

const sanitizeAvailabilityPayload = (raw: any): AvailabilityPayload => {
  const timeZoneRaw = typeof raw?.timeZone === 'string' ? raw.timeZone.trim() : '';
  const timeZone = timeZoneRaw && timeZoneRaw.length <= 64 ? timeZoneRaw : 'Asia/Shanghai';
  const sessionDurationHours = roundToQuarter(raw?.sessionDurationHours);
  const daySelections = sanitizeDaySelections(raw?.daySelections);
  return { timeZone, sessionDurationHours, daySelections };
};

const parseAvailability = (value: any): AvailabilityPayload | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return sanitizeAvailabilityPayload(parsed);
  } catch {
    return null;
  }
};

router.get('/ids', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const currentRows = await dbQuery<CurrentUserRow[]>(
      'SELECT id, email FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const current = currentRows[0];
    if (!current) return res.status(401).json({ error: '登录状态异常，请重新登录' });

    const userId = current.id;
    const email = current.email;

    let settingsRows: AccountSettingsRow[] = [];
    let columns = ['email_notifications', 'home_course_order_json', 'student_avatar_url'];
    while (true) {
      try {
        settingsRows = await dbQuery<AccountSettingsRow[]>(
          `SELECT ${columns.join(', ')} FROM account_settings WHERE user_id = ? LIMIT 1`,
          [userId]
        );
        break;
      } catch (e: any) {
        if (isMissingHomeCourseOrderColumnError(e)) {
          const ensured = await ensureHomeCourseOrderColumn();
          if (!ensured) columns = columns.filter((c) => c !== 'home_course_order_json');
          continue;
        }
        if (isMissingStudentAvatarColumnError(e)) {
          const ensured = await ensureStudentAvatarColumn();
          if (!ensured) columns = columns.filter((c) => c !== 'student_avatar_url');
          continue;
        }
        throw e;
      }
    }
    let emailNotificationsEnabled = false;
    let homeCourseOrderIds: string[] | null = null;
    let studentAvatarUrl: string | null = null;
    if (settingsRows.length === 0) {
      await dbQuery(
        'INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)',
        [userId, 1]
      );
      emailNotificationsEnabled = true;
    } else {
      emailNotificationsEnabled = !!settingsRows[0]?.email_notifications;
      homeCourseOrderIds = parseOrderIds(settingsRows[0]?.home_course_order_json);
      studentAvatarUrl = typeof settingsRows[0]?.student_avatar_url === 'string' && settingsRows[0].student_avatar_url.trim()
        ? settingsRows[0].student_avatar_url.trim()
        : null;
    }

    const rows = await dbQuery<PublicIdRow[]>(
      "SELECT role, public_id, created_at FROM user_roles WHERE user_id = ? AND role IN ('student','mentor')",
      [userId]
    );

    let studentId: string | null = null;
    let mentorId: string | null = null;
    let studentCreatedAt: Date | string | null = null;
    let mentorCreatedAt: Date | string | null = null;
    for (const row of rows) {
      if (row.role === 'student') {
        studentId = row.public_id;
        studentCreatedAt = row.created_at ?? null;
      }
      if (row.role === 'mentor') {
        mentorId = row.public_id;
        mentorCreatedAt = row.created_at ?? null;
      }
    }

    let degree: string | null = null;
    let school: string | null = null;
    const profRows = await dbQuery<MentorProfileRow[]>(
      'SELECT user_id, degree, school, updated_at FROM mentor_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const prof = profRows[0];
    if (prof) {
      degree = typeof prof.degree === 'string' && prof.degree.trim() ? prof.degree : null;
      school = typeof prof.school === 'string' && prof.school.trim() ? prof.school : null;
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
      studentAvatarUrl,
    });
  } catch (e) {
    console.error('Account ids error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/wallet-summary', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const toNumber = (value: any, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(n) ? n : fallback;
  };

  const isMissingWalletSchemaError = (e: any) => {
    const code = String(e?.code || '');
    if (code !== 'ER_BAD_FIELD_ERROR' && code !== 'ER_NO_SUCH_TABLE') return false;
    const message = String(e?.message || '');
    return message.includes('lesson_balance_hours') || message.includes('billing_orders');
  };

  try {
    const balanceRows = await dbQuery<any[]>(
      'SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const remainingHours = toNumber(balanceRows?.[0]?.lesson_balance_hours, 0);

    const sumRows = await dbQuery<any[]>(
      `SELECT
         COALESCE(SUM(amount_cny), 0) AS totalTopUpCny,
         COALESCE(SUM(CASE WHEN credited_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') THEN amount_cny ELSE 0 END), 0) AS monthTopUpCny
       FROM billing_orders
       WHERE user_id = ?
         AND credited_at IS NOT NULL`,
      [req.user.id]
    );

    const totalTopUpCny = toNumber(sumRows?.[0]?.totalTopUpCny, 0);
    const monthTopUpCny = toNumber(sumRows?.[0]?.monthTopUpCny, 0);

    return res.json({ remainingHours, monthTopUpCny, totalTopUpCny });
  } catch (e) {
    console.error('Account wallet summary error:', e);
    if (isMissingWalletSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 升级' });
    }
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.put(
  '/student-avatar',
  requireAuth,
  [body('avatarUrl').optional({ nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('头像地址无效')],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl');
    if (!hasAvatarUrl) return res.status(400).json({ error: '没有可保存的字段' });

    const raw = (req.body as any).avatarUrl;
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    const nextAvatarUrl = normalized ? normalized : null;

    try {
      const ensured = await ensureStudentAvatarColumn();
      if (!ensured) return res.status(500).json({ error: '服务器错误：无法初始化头像字段' });

      await dbQuery(
        'INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)',
        [req.user.id, 1]
      );
      await dbQuery(
        'UPDATE account_settings SET student_avatar_url = ? WHERE user_id = ?',
        [nextAvatarUrl, req.user.id]
      );

      return res.json({ message: '保存成功', studentAvatarUrl: nextAvatarUrl });
    } catch (e) {
      console.error('Save student avatar error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.put(
  '/profile',
  requireAuth,
  [
    body('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    body('school').optional().isString().trim().isLength({ max: 200 }).withMessage('学校无效'),
  ],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const userId = req.user.id;

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
      const userId = req.user.id;

      const patchDegree = hasDegree ? normalize(req.body.degree) : undefined;
      const patchSchool = hasSchool ? normalize(req.body.school) : undefined;

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

    const userId = req.user.id;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { emailNotificationsEnabled } = req.body as { emailNotificationsEnabled: boolean };

    try {
      await dbQuery(
        `INSERT INTO account_settings (user_id, email_notifications)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           email_notifications = VALUES(email_notifications),
           updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, emailNotificationsEnabled ? 1 : 0]
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
    await dbQuery(
      'INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)',
      [req.user.id, 1]
    );

    let rows: AccountSettingsRow[] = [];
    try {
      rows = await dbQuery<AccountSettingsRow[]>(
        'SELECT home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );
    } catch (e: any) {
      if (!isMissingHomeCourseOrderColumnError(e)) throw e;
      const ensured = await ensureHomeCourseOrderColumn();
      if (ensured) {
        rows = await dbQuery<AccountSettingsRow[]>(
          'SELECT home_course_order_json FROM account_settings WHERE user_id = ? LIMIT 1',
          [req.user.id]
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
      try {
        await dbQuery(
          `INSERT INTO account_settings (user_id, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, JSON.stringify(sanitized)]
        );
      } catch (e: any) {
        if (!isMissingHomeCourseOrderColumnError(e)) throw e;
        const ensured = await ensureHomeCourseOrderColumn();
        if (!ensured) {
          return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 中的 account_settings 迁移' });
        }
        await dbQuery(
          `INSERT INTO account_settings (user_id, home_course_order_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             home_course_order_json = VALUES(home_course_order_json),
             updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, JSON.stringify(sanitized)]
        );
      }

      return res.json({ message: '保存成功', orderIds: sanitized });
    } catch (e) {
      console.error('Account home course order save error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

router.get('/availability', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    await dbQuery(
      'INSERT IGNORE INTO account_settings (user_id, email_notifications) VALUES (?, ?)',
      [req.user.id, 1]
    );

    let rows: AccountSettingsRow[] = [];
    try {
      rows = await dbQuery<AccountSettingsRow[]>(
        'SELECT availability_json FROM account_settings WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );
    } catch (e: any) {
      if (!isMissingAvailabilityColumnError(e)) throw e;
      const ensured = await ensureAvailabilityColumn();
      if (!ensured) return res.json({ availability: null });
      rows = await dbQuery<AccountSettingsRow[]>(
        'SELECT availability_json FROM account_settings WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );
    }

    const availability = parseAvailability(rows[0]?.availability_json);
    return res.json({ availability });
  } catch (e) {
    console.error('Account availability fetch error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.put(
  '/availability',
  requireAuth,
  [
    body('timeZone').isString().trim().isLength({ min: 1, max: 64 }).withMessage('时区无效'),
    body('sessionDurationHours').isFloat({ min: 0.25, max: 10 }).withMessage('可约时长无效'),
    body('daySelections')
      .custom((value) => value && typeof value === 'object' && !Array.isArray(value))
      .withMessage('时间段数据无效'),
  ],
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });

    const userId = req.user.id;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = sanitizeAvailabilityPayload(req.body);

    try {
      const write = async () => {
        await dbQuery(
          `INSERT INTO account_settings (user_id, availability_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE
             availability_json = VALUES(availability_json),
             updated_at = CURRENT_TIMESTAMP`,
          [userId, JSON.stringify(payload)]
        );
      };

      try {
        await write();
      } catch (e: any) {
        if (!isMissingAvailabilityColumnError(e)) throw e;
        const ensured = await ensureAvailabilityColumn();
        if (!ensured) {
          return res.status(500).json({ error: '数据库未升级，请先执行 schema.sql 中的 account_settings 迁移' });
        }
        await write();
      }

      return res.json({ message: '保存成功', availability: payload });
    } catch (e) {
      console.error('Account availability save error:', e);
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
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const result = await dbQuery<any>(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, req.user.id]
      );

      const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
      if (affected === 0) {
        return res.status(404).json({ error: '未找到账号信息' });
      }

      try {
        await revokeAllRefreshTokensForUser(req.user.id, 'password_changed');
      } catch (e) {
        console.error('Revoke refresh tokens on password change error:', e);
      }
      clearRefreshTokenCookie(res);

      return res.json({ message: '密码已更新' });
    } catch (e) {
      console.error('Account password update error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
