import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { query } from '../db';
import { requireAdminAuth, getAdminJwtSecret } from '../middleware/adminAuth';
import { ensureAdminSchema } from '../services/adminSchema';
import { revokeAllRefreshTokensForUser } from '../auth/refreshTokens';
import { buildContentDisposition, getOssClient } from '../services/ossClient';

const router = Router();

const ORDER_STATUSES = new Set(['CREATED', 'APPROVED', 'COMPLETED', 'CAPTURED', 'VOIDED', 'FAILED']);
const REPORT_STATUSES = new Set(['open', 'reviewing', 'resolved', 'dismissed']);
const REPORT_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const USER_STATUSES = new Set(['active', 'suspended']);

type AuditPayload = {
  req: Request;
  action: string;
  targetType: string;
  targetId: string | number;
  reason?: string | null;
  before?: any;
  after?: any;
};

const safeString = (value: unknown, max = 255) => {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text.slice(0, max);
};

const toPositiveInt = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const getPaging = (req: Request) => {
  const page = toPositiveInt(req.query.page, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
};

const pagingSql = (limit: number, offset: number) => `LIMIT ${Math.max(1, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`);

const maybeParseJson = (raw: any, fallback: any = null) => {
  if (raw === null || typeof raw === 'undefined') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const readReason = (req: Request, minLength = 2) => {
  const reason = safeString((req.body as any)?.reason, 1000);
  if (reason.length < minLength) return null;
  return reason;
};

const parseUrlList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => safeString(item, 1000))
      .filter(Boolean);
  }
  const text = safeString(raw, 4000);
  if (!text) return [];
  const parsed = maybeParseJson(text, null);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => safeString(item, 1000))
      .filter(Boolean);
  }
  return [text];
};

const resolveOssKeyFromUrl = (rawUrl: unknown) => {
  const value = safeString(rawUrl, 4000);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
};

const getFileNameFromUrl = (rawUrl: unknown) => {
  const value = safeString(rawUrl, 4000);
  if (!value) return 'resume';
  const ossKey = resolveOssKeyFromUrl(value);
  const last = ossKey.split('/').filter(Boolean).pop();
  return safeString(last || 'resume', 255) || 'resume';
};

const getContentTypeFromFileName = (fileName: unknown) => {
  const raw = safeString(fileName, 255).toLowerCase();
  const ext = raw.includes('.') ? raw.split('.').pop() || '' : '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return '';
};

const authenticateAdminToken = async (token: unknown) => {
  const rawToken = safeString(token, 4000);
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, getAdminJwtSecret()) as { adminId?: number; scope?: string };
    const adminId = Number(payload?.adminId || 0);
    if (!adminId || payload?.scope !== 'admin') return null;

    const rows = await query<Array<{ id: number; username: string; is_active: number | boolean }>>(
      'SELECT id, username, is_active FROM admin_users WHERE id = ? LIMIT 1',
      [adminId]
    );
    const admin = rows?.[0];
    if (!admin || !(admin.is_active === 1 || admin.is_active === true)) return null;
    return { adminId: Number(admin.id), username: String(admin.username || '') };
  } catch {
    return null;
  }
};

const jsonOrNull = (value: any) => {
  if (typeof value === 'undefined') return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const audit = async ({ req, action, targetType, targetId, reason = null, before, after }: AuditPayload) => {
  await query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, target_type, target_id, reason, before_json, after_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.admin?.adminId || null,
      action,
      targetType,
      String(targetId),
      reason || null,
      jsonOrNull(before),
      jsonOrNull(after),
      safeString(req.ip || '', 45) || null,
      safeString(req.get('user-agent') || '', 255) || null,
    ]
  );
};

router.use(async (_req, res, next) => {
  try {
    await ensureAdminSchema();
    next();
  } catch (error) {
    console.error('Ensure admin schema error:', error);
    res.status(500).json({ error: '后台数据库初始化失败' });
  }
});

router.post('/auth/login', async (req: Request, res: Response) => {
  const username = safeString((req.body as any)?.username, 100).toLowerCase();
  const password = String((req.body as any)?.password || '');
  if (!username || !password) return res.status(400).json({ error: '请输入后台账号和密码' });

  try {
    const rows = await query<Array<{ id: number; username: string; password_hash: string; display_name: string | null; is_active: number | boolean }>>(
      'SELECT id, username, password_hash, display_name, is_active FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    const admin = rows?.[0];
    if (!admin || !(admin.is_active === 1 || admin.is_active === true)) {
      return res.status(401).json({ error: '后台账号或密码错误' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: '后台账号或密码错误' });

    await query('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    const expiresIn = (process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || '8h') as SignOptions['expiresIn'];
    const token = jwt.sign({ adminId: Number(admin.id), scope: 'admin' }, getAdminJwtSecret(), { expiresIn });

    return res.json({
      token,
      admin: {
        id: Number(admin.id),
        username: admin.username,
        displayName: admin.display_name || admin.username,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/auth/me', requireAdminAuth, async (req: Request, res: Response) => {
  return res.json({ admin: req.admin });
});

router.get('/dashboard/summary', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const [
      userRows,
      roleRows,
      mentorRows,
      orderRows,
      courseRows,
      lessonRows,
      reportRows,
    ] = await Promise.all([
      query<any[]>(
        `SELECT
           COUNT(*) AS totalUsers,
           SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
           SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS newUsersToday,
           SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS newUsers7d
         FROM users`
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
           SUM(CASE WHEN role = 'mentor' THEN 1 ELSE 0 END) AS mentors
         FROM user_roles`
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN role = 'mentor' AND mentor_approved = 1 THEN 1 ELSE 0 END) AS approvedMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status = 'pending' AND mentor_approved = 0 THEN 1 ELSE 0 END) AS pendingMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status = 'rejected' THEN 1 ELSE 0 END) AS rejectedMentors
         FROM user_roles`
      ),
      query<any[]>(
        `SELECT
           COUNT(*) AS totalOrders,
           SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN 1 ELSE 0 END) AS paidOrders,
           COALESCE(SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END), 0) AS paidAmountCny
         FROM billing_orders`
      ),
      query<any[]>('SELECT COUNT(*) AS scheduledCourses FROM course_sessions WHERE status = "scheduled"'),
      query<any[]>(
        "SELECT COUNT(*) AS pendingLessonHours FROM lesson_hour_confirmations WHERE status IN ('pending','disputed','platform_review')"
      ),
      query<any[]>(
        "SELECT COUNT(*) AS openReports FROM risk_reports WHERE status IN ('open','reviewing')"
      ),
    ]);

    return res.json({
      users: userRows?.[0] || {},
      roles: roleRows?.[0] || {},
      mentors: mentorRows?.[0] || {},
      orders: orderRows?.[0] || {},
      courses: courseRows?.[0] || {},
      lessonHours: lessonRows?.[0] || {},
      reports: reportRows?.[0] || {},
    });
  } catch (error) {
    console.error('Admin dashboard summary error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/users', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const role = safeString(req.query.role, 20);
  const status = safeString(req.query.status, 20);
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR u.username LIKE ? ESCAPE '\\\\'
      OR EXISTS (SELECT 1 FROM user_roles rx WHERE rx.user_id = u.id AND rx.public_id LIKE ? ESCAPE '\\\\')
      ${Number.isFinite(id) && id > 0 ? 'OR u.id = ?' : ''}
    )`);
    params.push(like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id);
  }
  if (role === 'student' || role === 'mentor') {
    where.push('EXISTS (SELECT 1 FROM user_roles rr WHERE rr.user_id = u.id AND rr.role = ?)');
    params.push(role);
  }
  if (USER_STATUSES.has(status)) {
    where.push('u.account_status = ?');
    params.push(status);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(DISTINCT u.id) AS total FROM users u WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         u.id, u.username, u.email, u.lesson_balance_hours, u.account_status,
         u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at,
         GROUP_CONCAT(CONCAT(ur.role, '|', ur.public_id, '|', ur.mentor_approved, '|', ur.mentor_review_status) ORDER BY ur.role SEPARATOR ',') AS roles_compact
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, u.username, u.email, u.lesson_balance_hours, u.account_status, u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at
       ORDER BY u.created_at DESC, u.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    const users = (rows || []).map((row) => ({
      ...row,
      roles: String(row.roles_compact || '')
        .split(',')
        .filter(Boolean)
        .map((item) => {
          const [itemRole, publicId, mentorApproved, reviewStatus] = item.split('|');
          return {
            role: itemRole,
            publicId,
            mentorApproved: mentorApproved === '1',
            mentorReviewStatus: reviewStatus,
          };
        }),
    }));
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), users });
  } catch (error) {
    console.error('Admin users list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/users/:userId', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效用户ID' });

  try {
    const users = await query<any[]>(
      `SELECT id, username, email, lesson_balance_hours, account_status, suspended_at, suspended_reason,
              created_at, updated_at, last_login_at
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const user = users?.[0];
    if (!user) return res.status(404).json({ error: '未找到用户' });

    const [roles, mentorProfiles, orderSummary, courseSummary] = await Promise.all([
      query<any[]>(
        `SELECT role, public_id, mentor_approved, mentor_review_status, mentor_review_note,
                mentor_reviewed_at, mentor_reviewed_by_admin_id, created_at
         FROM user_roles WHERE user_id = ? ORDER BY role`,
        [userId]
      ),
      query<any[]>(
        `SELECT display_name, gender, degree, school, timezone, courses_json, teaching_languages_json,
                rating, review_count, avg_appointment_response_minutes, is_accepting_students,
                last_replied_at, completed_session_count, avatar_url, created_at, updated_at
         FROM mentor_profiles WHERE user_id = ? LIMIT 1`,
        [userId]
      ),
      query<any[]>(
        `SELECT COUNT(*) AS orderCount,
                COALESCE(SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END), 0) AS paidAmountCny
         FROM billing_orders WHERE user_id = ?`,
        [userId]
      ),
      query<any[]>(
        `SELECT
           SUM(CASE WHEN student_user_id = ? THEN 1 ELSE 0 END) AS studentCourseCount,
           SUM(CASE WHEN mentor_user_id = ? THEN 1 ELSE 0 END) AS mentorCourseCount,
           SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduledCourseCount,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedCourseCount
         FROM course_sessions WHERE student_user_id = ? OR mentor_user_id = ?`,
        [userId, userId, userId, userId]
      ),
    ]);

    const mentorProfile = mentorProfiles?.[0] || null;
    if (mentorProfile) {
      mentorProfile.courses = maybeParseJson(mentorProfile.courses_json, []);
      mentorProfile.teachingLanguages = maybeParseJson(mentorProfile.teaching_languages_json, []);
    }

    return res.json({
      user,
      roles,
      mentorProfile,
      orderSummary: orderSummary?.[0] || {},
      courseSummary: courseSummary?.[0] || {},
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch('/users/:userId/status', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  const status = safeString((req.body as any)?.status, 20);
  const reason = readReason(req);
  if (!userId) return res.status(400).json({ error: '无效用户ID' });
  if (!USER_STATUSES.has(status)) return res.status(400).json({ error: '无效账号状态' });
  if (!reason) return res.status(400).json({ error: '请填写操作原因' });

  try {
    const beforeRows = await query<any[]>(
      'SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到用户' });

    await query(
      `UPDATE users
       SET account_status = ?,
           suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,
           suspended_reason = CASE WHEN ? = 'suspended' THEN ? ELSE NULL END
       WHERE id = ?`,
      [status, status, status, reason, userId]
    );
    if (status === 'suspended') {
      await revokeAllRefreshTokensForUser(userId, 'admin_suspended');
    }
    const afterRows = await query<any[]>(
      'SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const after = afterRows?.[0];
    await audit({ req, action: 'user.status.update', targetType: 'user', targetId: userId, reason, before, after });
    return res.json({ user: after });
  } catch (error) {
    console.error('Admin update user status error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/reviews', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const status = safeString(req.query.status || 'pending', 20);
  const where = ["ur.role = 'mentor'"];
  const params: any[] = [];

  if (status === 'approved' || status === 'rejected' || status === 'pending') {
    where.push('ur.mentor_review_status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR u.username LIKE ? ESCAPE '\\\\'
      OR ur.public_id LIKE ? ESCAPE '\\\\'
      OR mp.display_name LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR u.id = ?' : ''}
    )`);
    params.push(like, like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
         ur.mentor_review_note, ur.mentor_reviewed_at, ur.created_at AS mentor_created_at,
         u.username, u.email, u.account_status, u.last_login_at,
         mp.display_name, mp.degree, mp.school, mp.timezone, mp.avatar_url, mp.updated_at AS profile_updated_at,
         s.mentor_resume_url
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ur.created_at DESC, ur.user_id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), mentors: rows || [] });
  } catch (error) {
    console.error('Admin mentor reviews list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/review', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const rows = await query<any[]>(
      `SELECT
         ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
         ur.mentor_review_note, ur.mentor_reviewed_at, ur.mentor_reviewed_by_admin_id,
         ur.created_at AS mentor_created_at,
         u.username, u.email, u.account_status, u.last_login_at,
         mp.display_name, mp.gender, mp.degree, mp.school, mp.timezone, mp.courses_json,
         mp.teaching_languages_json, mp.rating, mp.review_count, mp.avatar_url, mp.created_at AS profile_created_at,
         mp.updated_at AS profile_updated_at,
         s.mentor_resume_url, s.availability_json
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`,
      [userId]
    );
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });
    mentor.courses = maybeParseJson(mentor.courses_json, []);
    mentor.teachingLanguages = maybeParseJson(mentor.teaching_languages_json, []);
    mentor.availability = maybeParseJson(mentor.availability_json, null);
    mentor.resumeUrls = parseUrlList(mentor.mentor_resume_url);
    mentor.mentor_resume_url = mentor.resumeUrls[0] || null;
    return res.json({ mentor });
  } catch (error) {
    console.error('Admin mentor review detail error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/resume-url', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const rows = await query<any[]>(
      `SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`,
      [userId]
    );
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });

    const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
    if (!resumeUrl) return res.status(404).json({ error: '未找到简历' });

    const ossKey = resolveOssKeyFromUrl(resumeUrl);
    if (!ossKey) return res.json({ url: resumeUrl, signed: false });

    const client = getOssClient();
    if (!client) return res.status(500).json({ error: 'OSS 未配置' });

    const fileName = getFileNameFromUrl(resumeUrl);
    const expires = 120;
    const url = client.signatureUrl(ossKey, {
      expires,
      response: {
        'content-disposition': buildContentDisposition(fileName, 'inline'),
      },
    });

    return res.json({
      url,
      signed: true,
      expiresAt: Math.floor(Date.now() / 1000) + expires,
    });
  } catch (error) {
    console.error('Admin mentor resume url error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/mentors/:userId/resume-preview', async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const auth = req.headers.authorization || '';
    const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const admin = await authenticateAdminToken(bearerToken || req.query.token);
    if (!admin) return res.status(401).json({ error: '后台登录已失效' });

    const rows = await query<any[]>(
      `SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`,
      [userId]
    );
    const mentor = rows?.[0];
    if (!mentor) return res.status(404).json({ error: '未找到导师申请' });

    const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
    if (!resumeUrl) return res.status(404).json({ error: '未找到简历' });

    const ossKey = resolveOssKeyFromUrl(resumeUrl);
    if (!ossKey) return res.redirect(resumeUrl);

    const client = getOssClient();
    if (!client) return res.status(500).json({ error: 'OSS 未配置' });

    const fileName = getFileNameFromUrl(resumeUrl);
    const contentType = getContentTypeFromFileName(fileName) || 'application/octet-stream';
    const result = await client.getStream(ossKey);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(fileName, 'inline'));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Admin-User', admin.username);

    result.stream.on('error', (error: Error) => {
      console.error('Admin mentor resume preview stream error:', error);
      if (!res.headersSent) {
        res.status(500).end('预览失败');
      } else {
        res.end();
      }
    });

    return result.stream.pipe(res);
  } catch (error) {
    console.error('Admin mentor resume preview error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/mentors/:userId/approve', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  const reason = readReason(req, 0);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });

  try {
    const beforeRows = await query<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到导师申请' });
    await query(
      `UPDATE user_roles
       SET mentor_approved = 1,
           mentor_review_status = 'approved',
           mentor_review_note = ?,
           mentor_reviewed_at = CURRENT_TIMESTAMP,
           mentor_reviewed_by_admin_id = ?
       WHERE user_id = ? AND role = 'mentor'`,
      [reason || null, req.admin!.adminId, userId]
    );
    const afterRows = await query<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    const after = afterRows?.[0];
    await audit({ req, action: 'mentor.approve', targetType: 'mentor', targetId: userId, reason: reason || null, before, after });
    return res.json({ mentor: after });
  } catch (error) {
    console.error('Admin approve mentor error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/mentors/:userId/reject', requireAdminAuth, async (req: Request, res: Response) => {
  const userId = toPositiveInt(req.params.userId, 0);
  const reason = readReason(req);
  if (!userId) return res.status(400).json({ error: '无效导师ID' });
  if (!reason) return res.status(400).json({ error: '请填写驳回原因' });

  try {
    const beforeRows = await query<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到导师申请' });
    await query(
      `UPDATE user_roles
       SET mentor_approved = 0,
           mentor_review_status = 'rejected',
           mentor_review_note = ?,
           mentor_reviewed_at = CURRENT_TIMESTAMP,
           mentor_reviewed_by_admin_id = ?
       WHERE user_id = ? AND role = 'mentor'`,
      [reason, req.admin!.adminId, userId]
    );
    const afterRows = await query<any[]>(
      "SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [userId]
    );
    const after = afterRows?.[0];
    await audit({ req, action: 'mentor.reject', targetType: 'mentor', targetId: userId, reason, before, after });
    return res.json({ mentor: after });
  } catch (error) {
    console.error('Admin reject mentor error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/orders', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const provider = safeString(req.query.provider, 20);
  const status = safeString(req.query.status, 40);
  const startDate = safeString(req.query.startDate, 20);
  const endDate = safeString(req.query.endDate, 20);
  const where = ['1=1'];
  const params: any[] = [];

  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR ur.public_id LIKE ? ESCAPE '\\\\'
      OR bo.provider_order_id LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR bo.id = ? OR u.id = ?' : ''}
    )`);
    params.push(like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id, id);
  }
  if (provider) {
    where.push('bo.provider = ?');
    params.push(provider);
  }
  if (status) {
    where.push('bo.status = ?');
    params.push(status);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    where.push('bo.created_at >= ?');
    params.push(`${startDate} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    where.push('bo.created_at <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT
         bo.id, bo.user_id, bo.provider, bo.provider_order_id, bo.status, bo.topup_hours,
         bo.unit_price_cny, bo.amount_cny, bo.currency_code, bo.amount_usd, bo.paypal_capture_id,
         bo.created_at, bo.captured_at, bo.credited_at, bo.updated_at,
         u.email, u.username, u.account_status, ur.public_id AS student_public_id
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE ${where.join(' AND ')}
       ORDER BY bo.created_at DESC, bo.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), orders: rows || [] });
  } catch (error) {
    console.error('Admin orders list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch('/orders/:orderId/status', requireAdminAuth, async (req: Request, res: Response) => {
  const orderId = toPositiveInt(req.params.orderId, 0);
  const status = safeString((req.body as any)?.status, 40).toUpperCase();
  const reason = readReason(req);
  if (!orderId) return res.status(400).json({ error: '无效订单ID' });
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: '无效订单状态' });
  if (!reason) return res.status(400).json({ error: '请填写操作原因' });

  try {
    const beforeRows = await query<any[]>('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到订单' });
    await query('UPDATE billing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
    const afterRows = await query<any[]>('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
    const after = afterRows?.[0];
    await audit({ req, action: 'order.status.update', targetType: 'billing_order', targetId: orderId, reason, before, after });
    return res.json({ order: after });
  } catch (error) {
    console.error('Admin update order status error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/reports', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const q = safeString(req.query.q, 100);
  const status = safeString(req.query.status, 30);
  const severity = safeString(req.query.severity, 30);
  const where = ['1=1'];
  const params: any[] = [];

  if (status && REPORT_STATUSES.has(status)) {
    where.push('rr.status = ?');
    params.push(status);
  }
  if (severity && REPORT_SEVERITIES.has(severity)) {
    where.push('rr.severity = ?');
    params.push(severity);
  }
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const id = Number.parseInt(q, 10);
    where.push(`(
      rr.title LIKE ? ESCAPE '\\\\'
      OR rr.target_type LIKE ? ESCAPE '\\\\'
      OR rr.target_id LIKE ? ESCAPE '\\\\'
      OR tu.email LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR rr.id = ?' : ''}
    )`);
    params.push(like, like, like, like);
    if (Number.isFinite(id) && id > 0) params.push(id);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total
       FROM risk_reports rr
       LEFT JOIN users tu ON tu.id = rr.target_user_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT rr.*, tu.email AS target_user_email, au.username AS assigned_admin_username
       FROM risk_reports rr
       LEFT JOIN users tu ON tu.id = rr.target_user_id
       LEFT JOIN admin_users au ON au.id = rr.assigned_admin_id
       WHERE ${where.join(' AND ')}
       ORDER BY FIELD(rr.status, 'open','reviewing','resolved','dismissed'), FIELD(rr.severity, 'critical','high','medium','low'), rr.created_at DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), reports: rows || [] });
  } catch (error) {
    console.error('Admin reports list error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/reports', requireAdminAuth, async (req: Request, res: Response) => {
  const title = safeString((req.body as any)?.title, 200);
  const severity = safeString((req.body as any)?.severity || 'medium', 30);
  const targetType = safeString((req.body as any)?.targetType, 60);
  const targetId = safeString((req.body as any)?.targetId, 80);
  const targetUserIdRaw = toPositiveInt((req.body as any)?.targetUserId, 0);
  const reporterUserIdRaw = toPositiveInt((req.body as any)?.reporterUserId, 0);
  const description = safeString((req.body as any)?.description, 5000);
  const reason = readReason(req);
  if (!title || !targetType || !targetId) return res.status(400).json({ error: '请填写工单标题和关联目标' });
  if (!REPORT_SEVERITIES.has(severity)) return res.status(400).json({ error: '无效风险等级' });
  if (!reason) return res.status(400).json({ error: '请填写创建原因' });

  try {
    const result = await query<any>(
      `INSERT INTO risk_reports
         (status, severity, source, reporter_user_id, target_type, target_id, target_user_id, title, description,
          assigned_admin_id, created_by_admin_id, updated_by_admin_id)
       VALUES ('open', ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        severity,
        reporterUserIdRaw || null,
        targetType,
        targetId,
        targetUserIdRaw || null,
        title,
        description || null,
        req.admin!.adminId,
        req.admin!.adminId,
        req.admin!.adminId,
      ]
    );
    const reportId = Number(result?.insertId || 0);
    const afterRows = await query<any[]>('SELECT * FROM risk_reports WHERE id = ? LIMIT 1', [reportId]);
    const after = afterRows?.[0];
    await audit({ req, action: 'risk_report.create', targetType: 'risk_report', targetId: reportId, reason, after });
    return res.status(201).json({ report: after });
  } catch (error) {
    console.error('Admin create report error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.patch('/reports/:reportId', requireAdminAuth, async (req: Request, res: Response) => {
  const reportId = toPositiveInt(req.params.reportId, 0);
  const status = safeString((req.body as any)?.status, 30);
  const severity = safeString((req.body as any)?.severity, 30);
  const resolutionNote = safeString((req.body as any)?.resolutionNote, 5000);
  const reason = readReason(req);
  if (!reportId) return res.status(400).json({ error: '无效工单ID' });
  if (status && !REPORT_STATUSES.has(status)) return res.status(400).json({ error: '无效工单状态' });
  if (severity && !REPORT_SEVERITIES.has(severity)) return res.status(400).json({ error: '无效风险等级' });
  if (!reason) return res.status(400).json({ error: '请填写操作原因' });

  try {
    const beforeRows = await query<any[]>('SELECT * FROM risk_reports WHERE id = ? LIMIT 1', [reportId]);
    const before = beforeRows?.[0];
    if (!before) return res.status(404).json({ error: '未找到风控工单' });

    const nextStatus = status || before.status;
    const nextSeverity = severity || before.severity;
    await query(
      `UPDATE risk_reports
       SET status = ?,
           severity = ?,
           resolution_note = ?,
           updated_by_admin_id = ?,
           resolved_at = CASE WHEN ? IN ('resolved','dismissed') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id = ?`,
      [nextStatus, nextSeverity, resolutionNote || before.resolution_note || null, req.admin!.adminId, nextStatus, reportId]
    );
    const afterRows = await query<any[]>('SELECT * FROM risk_reports WHERE id = ? LIMIT 1', [reportId]);
    const after = afterRows?.[0];
    await audit({ req, action: 'risk_report.update', targetType: 'risk_report', targetId: reportId, reason, before, after });
    return res.json({ report: after });
  } catch (error) {
    console.error('Admin update report error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/audit-logs', requireAdminAuth, async (req: Request, res: Response) => {
  const { page, limit, offset } = getPaging(req);
  const action = safeString(req.query.action, 80);
  const targetType = safeString(req.query.targetType, 60);
  const where = ['1=1'];
  const params: any[] = [];
  if (action) {
    where.push('al.action = ?');
    params.push(action);
  }
  if (targetType) {
    where.push('al.target_type = ?');
    params.push(targetType);
  }

  try {
    const countRows = await query<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM admin_audit_logs al WHERE ${where.join(' AND ')}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT al.*, au.username AS admin_username
       FROM admin_audit_logs al
       LEFT JOIN admin_users au ON au.id = al.admin_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.created_at DESC, al.id DESC
       ${pagingSql(limit, offset)}`,
      params
    );
    return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), logs: rows || [] });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
