import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { pool, query } from '../db';
import { body, validationResult } from 'express-validator';
import { applyMentorCourseEmbeddings, prepareMentorCourseEmbeddings, sanitizeMentorCourses } from '../services/mentorCourseEmbeddings';
import {
  ensureMentorTeachingLanguagesColumn,
  isMissingTeachingLanguagesColumnError,
  parseTeachingLanguagesJson,
  sanitizeTeachingLanguageCodes,
} from '../services/mentorTeachingLanguages';

const router = Router();

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing env var: ${name}`);
  return value.trim();
};

// GET /api/mentor/permissions
// Check mentor permissions (e.g., can edit profile card)
router.get('/permissions', requireAuth, async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'mentor') {
    return res.status(403).json({ error: '仅导师可访问', canEditProfile: false, reason: 'not_mentor' });
  }

  try {
    const rows = await query<any[]>(
      "SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [req.user!.id]
    );
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) {
      return res.status(403).json({ error: '导师审核中，暂不可编辑个人名片', canEditProfile: false, reason: 'pending_review' });
    }
    return res.json({ canEditProfile: true });
  } catch (e) {
    return res.status(500).json({ error: '服务器错误，请稍后再试', canEditProfile: false });
  }
});

// GET /api/mentor/cards — only mentors can access
router.get('/cards', requireAuth, async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'mentor') {
    return res.status(403).json({ error: '仅导师可访问' });
  }

  // 审核 gating：仅审核通过的导师可查看卡片
  try {
    const rows = await query<any[]>("SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [req.user!.id]);
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) {
      return res.status(403).json({ error: '导师审核中' });
    }
  } catch (e) {
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }

  const formatDuration = (raw: any) => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return '';
    const s = Math.round(n * 100) / 100;
    return `${Number.isInteger(s) ? String(s) : String(s)}小时`;
  };

  try {
    const rows = await query<any[]>(
      `SELECT
         r.id AS request_id,
         r.course_direction,
         r.course_type,
         r.course_types_json,
         r.total_course_hours,
         r.time_zone,
         r.session_duration_hours,
         r.schedule_json,
         ur.public_id AS student_public_id,
         mp.degree AS student_degree,
         mp.school AS student_school,
         mp.timezone AS student_timezone,
         s.student_avatar_url AS student_avatar_url
       FROM course_requests r
       JOIN user_roles ur
         ON ur.user_id = r.user_id AND ur.role = 'student'
       LEFT JOIN mentor_profiles mp
         ON mp.user_id = r.user_id
       LEFT JOIN account_settings s
         ON s.user_id = r.user_id
       WHERE r.status = 'submitted' AND r.user_id <> ?
       ORDER BY CAST(SUBSTRING(ur.public_id, 2) AS UNSIGNED) ASC, r.id DESC
       LIMIT 200`,
      [req.user!.id]
    );

    const cards = (rows || []).map((r) => {
      let courseTypes: string[] = [];
      try { courseTypes = r.course_types_json ? JSON.parse(r.course_types_json) : []; } catch { courseTypes = []; }
      const courseType = (r.course_type || courseTypes?.[0] || '').toString();
      if ((!Array.isArray(courseTypes) || courseTypes.length === 0) && courseType) {
        courseTypes = [courseType];
      }

      let daySelections: Record<string, { start: number; end: number }[]> = {};
      try { daySelections = r.schedule_json ? JSON.parse(r.schedule_json) : {}; } catch { daySelections = {}; }

      return {
        id: Number(r.request_id),
        name: String(r.student_public_id || '').toUpperCase(),
        degree: r.student_degree || '',
        school: r.student_school || '',
        timezone: r.time_zone || r.student_timezone || '',
        avatarUrl: r.student_avatar_url || null,
        courses: r.course_direction ? [String(r.course_direction)] : [],
        courseTypes,
        courseType,
        expectedDuration: formatDuration(r.total_course_hours),
        daySelections,
      };
    });

    return res.json({ cards });
  } catch (e) {
    console.error('Fetch mentor cards error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }

  // Demo data; replace with DB query if needed
  const cards = [
    { id: 1,  degree: 'PhD',  school: '哈佛大学',   courses: ['编程基础'],       timezone: 'UTC+8 (北京)',  expectedDuration: '2小时',   expectedTime: '2025-02-01', courseType: '选课指导' },
    { id: 2,  degree: '硕士', school: '斯坦福大学', courses: ['机器学习'],       timezone: 'UTC-7 (加州)',  expectedDuration: '1.5小时', expectedTime: '2025-02-02', courseType: '作业项目' },
    { id: 3,  degree: '硕士', school: '麻省理工学院', courses: ['数据结构与算法'], timezone: 'UTC-5 (纽约)',   expectedDuration: '2小时',   expectedTime: '2025-02-03', courseType: '课前预习' },
    { id: 4,  degree: 'PhD',  school: '牛津大学',   courses: ['AI 大模型'],     timezone: 'UTC+0 (伦敦)',  expectedDuration: '2小时',   expectedTime: '2025-02-04', courseType: '期末复习' },
    { id: 5,  degree: '硕士', school: '剑桥大学',   courses: ['数据分析'],       timezone: 'UTC+1 (柏林)',  expectedDuration: '1小时',   expectedTime: '2025-02-05', courseType: '选课指导' },
    { id: 6,  degree: 'PhD',  school: '清华大学',   courses: ['高等数学'],       timezone: 'UTC+8 (北京)',  expectedDuration: '2小时',   expectedTime: '2025-02-06', courseType: '作业项目' },
    { id: 7,  degree: '硕士', school: '北京大学',   courses: ['概率与统计'],     timezone: 'UTC+8 (北京)',  expectedDuration: '1.5小时', expectedTime: '2025-02-07', courseType: '课前预习' },
    { id: 8,  degree: 'PhD',  school: '加州大学伯克利分校', courses: ['软件工程'], timezone: 'UTC-8 (加州)',  expectedDuration: '2小时',   expectedTime: '2025-02-08', courseType: '毕业论文' },
    { id: 9,  degree: '硕士', school: '帝国理工学院', courses: ['物理学'],       timezone: 'UTC+0 (伦敦)',  expectedDuration: '2小时',   expectedTime: '2025-02-09', courseType: '其它类型' },
    { id: 10, degree: '硕士', school: '多伦多大学', courses: ['生命科学'],       timezone: 'UTC-5 (多伦多)', expectedDuration: '1小时',   expectedTime: '2025-02-10', courseType: '选课指导' },
    { id: 11, degree: 'PhD',  school: '苏黎世联邦理工', courses: ['网络安全'],     timezone: 'UTC+1 (苏黎世)', expectedDuration: '1.5小时', expectedTime: '2025-02-11', courseType: '作业项目' },
    { id: 12, degree: '硕士', school: '新加坡国立大学', courses: ['经济学'],       timezone: 'UTC+8 (新加坡)', expectedDuration: '2小时',  expectedTime: '2025-02-12', courseType: '课前预习' },
  ];

  return res.json({ cards });
});

// GET /api/mentor/requests/:id — fetch one submitted course request
router.get('/requests/:id', requireAuth, async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (role !== 'mentor') {
    return res.status(403).json({ error: '仅导师可访问' });
  }

  // 审核 gating：仅审核通过的导师可查看需求详情
  try {
    const rows = await query<any[]>(
      "SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [req.user!.id]
    );
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) {
      return res.status(403).json({ error: '导师审核中' });
    }
  } catch (e) {
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }

  const rawId = typeof req.params?.id === 'string' ? req.params.id : '';
  const parsedId = Number(rawId);
  const requestId = Number.isFinite(parsedId) ? Math.floor(parsedId) : 0;
  if (!requestId || requestId < 1) {
    return res.status(400).json({ error: '参数错误' });
  }

  try {
    const rows = await query<any[]>(
      `SELECT
         r.id AS request_id,
         r.user_id AS student_user_id,
         r.status,
         r.learning_goal,
         r.course_direction,
         r.course_type,
         r.course_types_json,
         r.course_focus,
         r.format,
         r.milestone,
         r.total_course_hours,
         r.time_zone,
         r.session_duration_hours,
         r.schedule_json,
         r.submitted_at,
         r.created_at,
         r.updated_at,
         ur.public_id AS student_public_id,
         mp.degree AS student_degree,
         mp.school AS student_school,
         mp.timezone AS student_timezone,
         s.student_avatar_url AS student_avatar_url
       FROM course_requests r
       JOIN user_roles ur
         ON ur.user_id = r.user_id AND ur.role = 'student'
       LEFT JOIN mentor_profiles mp
         ON mp.user_id = r.user_id
       LEFT JOIN account_settings s
         ON s.user_id = r.user_id
       WHERE r.id = ? AND r.status = 'submitted'
       LIMIT 1`,
      [requestId]
    );

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: '未找到需求' });

    let courseTypes: string[] = [];
    try {
      courseTypes = row.course_types_json ? JSON.parse(row.course_types_json) : [];
    } catch {
      courseTypes = [];
    }
    const courseType = (row.course_type || courseTypes?.[0] || '').toString();
    if ((!Array.isArray(courseTypes) || courseTypes.length === 0) && courseType) {
      courseTypes = [courseType];
    }

    let daySelections: Record<string, { start: number; end: number }[]> = {};
    try {
      daySelections = row.schedule_json ? JSON.parse(row.schedule_json) : {};
    } catch {
      daySelections = {};
    }

    let attachments: Array<{
      fileId: string;
      fileName: string;
      ext: string;
      contentType: string | null;
      sizeBytes: number;
      ossKey: string;
      fileUrl: string;
      createdAt: any;
    }> = [];

    try {
      const attRows = await query<any[]>(
        'SELECT file_id, original_file_name, ext, content_type, size_bytes, oss_key, file_url, created_at FROM course_request_attachments WHERE request_id = ? ORDER BY id ASC',
        [requestId]
      );
      attachments = (attRows || []).map((r) => ({
        fileId: r.file_id,
        fileName: r.original_file_name,
        ext: r.ext,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        ossKey: r.oss_key,
        fileUrl: r.file_url,
        createdAt: r.created_at,
      }));
    } catch (e) {
      const message = typeof (e as any)?.message === 'string' ? (e as any).message : '';
      if (message.includes('course_request_attachments')) {
        return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
      }
      console.error('Fetch request attachments error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }

    return res.json({
      request: {
        id: Number(row.request_id),
        studentUserId: Number(row.student_user_id),
        status: row.status,
        learningGoal: row.learning_goal || '',
        courseDirection: row.course_direction || '',
        courseType: courseType || '',
        courseTypes,
        courseFocus: row.course_focus || '',
        format: row.format || '',
        milestone: row.milestone || '',
        totalCourseHours: row.total_course_hours,
        timeZone: row.time_zone || row.student_timezone || '',
        sessionDurationHours: row.session_duration_hours,
        daySelections,
        student: {
          publicId: String(row.student_public_id || '').toUpperCase(),
          degree: row.student_degree || '',
          school: row.student_school || '',
          avatarUrl: row.student_avatar_url || null,
          timezone: row.time_zone || row.student_timezone || '',
        },
        attachments,
        submittedAt: row.submitted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (e) {
    console.error('Fetch mentor request detail error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

// ===== Mentor Profile: CRUD (create/update via upsert, get) =====
// GET /api/mentor/profile
router.get('/profile', requireAuth, async (req: Request, res: Response) => {
  if (req.user?.role !== 'mentor') return res.status(403).json({ error: '仅导师可访问' });
  try {
    const rows = await query<any[]>(
      "SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
      [req.user!.id]
    );
    const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
    if (!approved) return res.status(403).json({ error: '导师审核中' });

    const loadProfile = async () =>
      query<any[]>(
        'SELECT user_id, display_name, gender, degree, school, timezone, courses_json, teaching_languages_json, avatar_url, updated_at FROM mentor_profiles WHERE user_id = ? LIMIT 1',
        [req.user!.id]
      );

    let prof: any[] = [];
    try {
      prof = await loadProfile();
    } catch (e: any) {
      if (!isMissingTeachingLanguagesColumnError(e)) throw e;
      const ensured = await ensureMentorTeachingLanguagesColumn();
      if (!ensured) throw e;
      prof = await loadProfile();
    }
    if (prof.length === 0) return res.json({ profile: null });
    const row = prof[0];
    let courses: string[] = [];
    try { courses = row.courses_json ? JSON.parse(row.courses_json) : []; } catch { courses = []; }
    const teachingLanguages = parseTeachingLanguagesJson(row.teaching_languages_json);
    return res.json({
      profile: {
        displayName: row.display_name || '',
        gender: row.gender || '',
        degree: row.degree || '',
        school: row.school || '',
        timezone: row.timezone || '',
        courses,
        teachingLanguages,
        avatarUrl: row.avatar_url || null,
        updatedAt: row.updated_at,
      }
    });
  } catch (e) {
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

// PUT /api/mentor/profile
router.put(
  '/profile',
  requireAuth,
  [
    body('displayName').optional().isString().isLength({ max: 100 }),
    body('gender').optional().isIn(['男', '女', '']).withMessage('性别无效'),
    body('degree').optional().isIn(['本科', '硕士', 'PhD', '']).withMessage('学历无效'),
    body('school').optional().isString().isLength({ max: 200 }),
    body('timezone').optional().isString().isLength({ max: 64 }),
    body('courses').optional().isArray().custom((arr) => arr.every((s: any) => typeof s === 'string' && s.length <= 100)).withMessage('课程需为字符串数组'),
    body('teachingLanguages')
      .optional()
      .isArray()
      .custom((arr) => arr.every((s: any) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= 10))
      .withMessage('授课语言需为字符串数组'),
    body('avatarUrl').optional({ nullable: true }).isString().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response) => {
    if (req.user?.role !== 'mentor') return res.status(403).json({ error: '仅导师可访问' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // 审核 gating
      const rows = await query<any[]>(
        "SELECT mentor_approved FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1",
        [req.user!.id]
      );
      const approved = rows?.[0]?.mentor_approved === 1 || rows?.[0]?.mentor_approved === true;
      if (!approved) return res.status(403).json({ error: '导师审核中，暂不可保存' });

      const {
        displayName,
        gender,
        degree,
        school,
        timezone,
        courses,
        teachingLanguages,
        avatarUrl,
      } = req.body as {
        displayName?: string;
        gender?: string;
        degree?: string;
        school?: string;
        timezone?: string;
        courses?: string[];
        teachingLanguages?: string[];
        avatarUrl?: string | null;
      };

      // Merge update: unspecified fields keep existing values.
      const loadExisting = async () =>
        query<any[]>(
          'SELECT display_name, gender, degree, school, timezone, courses_json, teaching_languages_json, avatar_url FROM mentor_profiles WHERE user_id = ? LIMIT 1',
          [req.user!.id]
        );

      let existingRows: any[] = [];
      try {
        existingRows = await loadExisting();
      } catch (e: any) {
        if (!isMissingTeachingLanguagesColumnError(e)) throw e;
        const ensured = await ensureMentorTeachingLanguagesColumn();
        if (!ensured) throw e;
        existingRows = await loadExisting();
      }
      const existing = existingRows?.[0] || {};
      let existingCourses: string[] = [];
      try { existingCourses = existing.courses_json ? JSON.parse(existing.courses_json) : []; } catch { existingCourses = []; }
      const existingTeachingLanguages = parseTeachingLanguagesJson(existing.teaching_languages_json);

      const nextDisplayName = (Object.prototype.hasOwnProperty.call(req.body, 'displayName') ? displayName : (existing.display_name || '')) as string;
      const nextGender = (Object.prototype.hasOwnProperty.call(req.body, 'gender') ? gender : (existing.gender || '')) as string;
      const nextDegree = (Object.prototype.hasOwnProperty.call(req.body, 'degree') ? degree : (existing.degree || '')) as string;
      const nextSchool = (Object.prototype.hasOwnProperty.call(req.body, 'school') ? school : (existing.school || '')) as string;
      const nextTimezone = (Object.prototype.hasOwnProperty.call(req.body, 'timezone') ? timezone : (existing.timezone || '')) as string;
      const nextCoursesRaw = Object.prototype.hasOwnProperty.call(req.body, 'courses')
        ? (courses || [])
        : (Array.isArray(existingCourses) ? existingCourses : []);
      const nextCourses = sanitizeMentorCourses(nextCoursesRaw, 50);
      const nextTeachingLanguagesRaw = Object.prototype.hasOwnProperty.call(req.body, 'teachingLanguages')
        ? (teachingLanguages || [])
        : (Array.isArray(existingTeachingLanguages) ? existingTeachingLanguages : []);
      const nextTeachingLanguages = sanitizeTeachingLanguageCodes(nextTeachingLanguagesRaw, 20);
      const nextAvatarUrl = Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl') ? (avatarUrl ?? null) : (existing.avatar_url ?? null);

      const coursesJson = JSON.stringify(nextCourses);
      const teachingLanguagesJson = JSON.stringify(nextTeachingLanguages);

      const userId = req.user!.id;
      const preparedEmbeddings =
        nextCourses.length > 0
          ? await prepareMentorCourseEmbeddings({
              userId,
              courses: nextCourses,
              apiKey: requiredEnv('DASHSCOPE_API_KEY'),
            })
          : { keepKeys: [] as string[], upserts: [] as any[] };

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Upsert by user_id
        await conn.execute(
          `INSERT INTO mentor_profiles (user_id, display_name, gender, degree, school, timezone, courses_json, teaching_languages_json, avatar_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
              display_name = VALUES(display_name),
              gender = VALUES(gender),
              degree = VALUES(degree),
              school = VALUES(school),
              timezone = VALUES(timezone),
              courses_json = VALUES(courses_json),
              teaching_languages_json = VALUES(teaching_languages_json),
              avatar_url = VALUES(avatar_url),
              updated_at = CURRENT_TIMESTAMP`,
          [
            userId,
            nextDisplayName,
            nextGender || null,
            nextDegree || null,
            nextSchool || null,
            nextTimezone || null,
            coursesJson,
            teachingLanguagesJson,
            nextAvatarUrl,
          ]
        );

        await applyMentorCourseEmbeddings({
          userId,
          keepKeys: preparedEmbeddings.keepKeys,
          upserts: preparedEmbeddings.upserts,
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

      return res.json({ message: '保存成功' });
    } catch (e) {
      console.error('Save mentor profile error:', e);
      return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
  }
);

export default router;
