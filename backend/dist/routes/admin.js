"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const adminAuth_1 = require("../middleware/adminAuth");
const adminSchema_1 = require("../services/adminSchema");
const refreshTokens_1 = require("../auth/refreshTokens");
const aliyunRtc_1 = require("../services/aliyunRtc");
const aliyunRtcRecording_1 = require("../services/aliyunRtcRecording");
const ossClient_1 = require("../services/ossClient");
const mentorRecommendation_1 = require("../services/mentorRecommendation");
const router = (0, express_1.Router)();
const ORDER_STATUSES = new Set(['CREATED', 'APPROVED', 'COMPLETED', 'CAPTURED', 'VOIDED', 'FAILED']);
const USER_STATUSES = new Set(['active', 'suspended']);
const CLASSROOM_STATUSES = new Set(['scheduled', 'completed', 'cancelled']);
const LESSON_HOURS_STATUSES = new Set(['none', 'pending', 'confirmed', 'disputed', 'dispute_confirmed', 'platform_review']);
const REPLAY_STATUSES = new Set(['none', 'running', 'ready', 'failed']);
const REPLAY_SIGNED_URL_EXPIRE_SECONDS = 60 * 60;
const REPLAY_LIST_MAX_OBJECTS = 500;
const safeString = (value, max = 255) => {
    const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    return text.slice(0, max);
};
const toPositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n <= 0)
        return fallback;
    return Math.min(n, max);
};
const getPaging = (req) => {
    const page = toPositiveInt(req.query.page, 1, 100000);
    const limit = toPositiveInt(req.query.limit, 20, 100);
    return { page, limit, offset: (page - 1) * limit };
};
const pagingSql = (limit, offset) => `LIMIT ${Math.max(1, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`;
const escapeLike = (value) => value.replace(/[\\%_]/g, (m) => `\\${m}`);
const maybeParseJson = (raw, fallback = null) => {
    if (raw === null || typeof raw === 'undefined')
        return fallback;
    if (typeof raw !== 'string')
        return raw;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
};
const readReason = (req, minLength = 2) => {
    const reason = safeString(req.body?.reason, 1000);
    if (reason.length < minLength)
        return null;
    return reason;
};
const parseUrlList = (raw) => {
    if (Array.isArray(raw)) {
        return raw
            .map((item) => safeString(item, 1000))
            .filter(Boolean);
    }
    const text = safeString(raw, 4000);
    if (!text)
        return [];
    const parsed = maybeParseJson(text, null);
    if (Array.isArray(parsed)) {
        return parsed
            .map((item) => safeString(item, 1000))
            .filter(Boolean);
    }
    return [text];
};
const parseStoredUtcDate = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), raw.getHours(), raw.getMinutes(), raw.getSeconds(), raw.getMilliseconds()));
    }
    const text = safeString(raw, 80);
    if (!text)
        return null;
    const canonical = text.replace('T', ' ').replace(/Z$/i, '').replace(/\.\d+$/, '').trim();
    const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const [, y, m, d, hh, mm, ss = '00'] = match;
        const parsed = new Date(Date.UTC(Number.parseInt(y, 10), Number.parseInt(m, 10) - 1, Number.parseInt(d, 10), Number.parseInt(hh, 10), Number.parseInt(mm, 10), Number.parseInt(ss, 10)));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toIsoString = (raw) => {
    const parsed = parseStoredUtcDate(raw);
    return parsed ? parsed.toISOString() : '';
};
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const getEffectiveClassroomStatus = (row) => {
    const status = safeString(row?.status, 30).toLowerCase();
    if (status !== 'scheduled')
        return status;
    const startsAt = parseStoredUtcDate(row?.starts_at);
    if (!startsAt)
        return status;
    const endAt = startsAt.getTime() + Math.max(toNumber(row?.duration_hours, 0), 0) * 60 * 60 * 1000;
    return endAt <= Date.now() ? 'completed' : status;
};
const getReplayStatus = (row) => {
    const recordingCount = toNumber(row?.recording_count, 0);
    if (!recordingCount)
        return 'none';
    if (toNumber(row?.stopped_recording_count, 0) > 0)
        return 'ready';
    return safeString(row?.latest_recording_status, 30).toLowerCase() === 'failed' ? 'failed' : 'none';
};
const getReviewStatus = (row) => (row?.review_id == null ? 'none' : 'reviewed');
const toObjectLastModifiedIso = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime()))
        return raw.toISOString();
    const parsed = new Date(safeString(raw, 100));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};
const toReplayFileName = (ossKey) => {
    const parts = ossKey.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'recording.mp4';
};
const toReplayFileId = (ossKey) => crypto_1.default.createHash('sha1').update(ossKey).digest('hex').slice(0, 16);
const listReplayMp4Files = async (storagePrefixes) => {
    const client = (0, ossClient_1.getRecordingOssClient)();
    if (!client)
        return null;
    const seenKeys = new Set();
    const files = [];
    const expiresAt = Math.floor(Date.now() / 1000) + REPLAY_SIGNED_URL_EXPIRE_SECONDS;
    for (const storagePrefix of storagePrefixes) {
        const normalizedPrefix = safeString(storagePrefix, 512).replace(/^\/+|\/+$/g, '');
        if (!normalizedPrefix)
            continue;
        const mp4Prefix = `${normalizedPrefix}/mp4/`;
        let marker = '';
        do {
            const result = await client.list({ prefix: mp4Prefix, marker, 'max-keys': 1000 }, {});
            const objects = Array.isArray(result?.objects) ? result.objects : [];
            for (const object of objects) {
                const ossKey = safeString(object?.name, 512);
                if (!ossKey || seenKeys.has(ossKey) || !ossKey.toLowerCase().endsWith('.mp4'))
                    continue;
                seenKeys.add(ossKey);
                const fileName = toReplayFileName(ossKey);
                files.push({
                    fileId: toReplayFileId(ossKey),
                    fileName,
                    sizeBytes: Math.max(0, toNumber(object?.size, 0)),
                    lastModified: toObjectLastModifiedIso(object?.lastModified),
                    url: client.signatureUrl(ossKey, {
                        expires: REPLAY_SIGNED_URL_EXPIRE_SECONDS,
                        response: {
                            'content-disposition': (0, ossClient_1.buildContentDisposition)(fileName, 'inline'),
                        },
                    }),
                    expiresAt,
                });
                if (files.length >= REPLAY_LIST_MAX_OBJECTS)
                    break;
            }
            marker = typeof result?.nextMarker === 'string' ? result.nextMarker : '';
        } while (marker && files.length < REPLAY_LIST_MAX_OBJECTS);
        if (files.length >= REPLAY_LIST_MAX_OBJECTS)
            break;
    }
    files.sort((a, b) => {
        const bTime = Date.parse(b.lastModified);
        const aTime = Date.parse(a.lastModified);
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime) || a.fileName.localeCompare(b.fileName);
    });
    return { files, expiresAt };
};
const resolveOssKeyFromUrl = (rawUrl) => {
    const value = safeString(rawUrl, 4000);
    if (!value)
        return '';
    try {
        const parsed = new URL(value);
        return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    }
    catch {
        return '';
    }
};
const getFileNameFromUrl = (rawUrl) => {
    const value = safeString(rawUrl, 4000);
    if (!value)
        return 'resume';
    const ossKey = resolveOssKeyFromUrl(value);
    const last = ossKey.split('/').filter(Boolean).pop();
    return safeString(last || 'resume', 255) || 'resume';
};
const getContentTypeFromFileName = (fileName) => {
    const raw = safeString(fileName, 255).toLowerCase();
    const ext = raw.includes('.') ? raw.split('.').pop() || '' : '';
    if (ext === 'pdf')
        return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg')
        return 'image/jpeg';
    if (ext === 'png')
        return 'image/png';
    if (ext === 'webp')
        return 'image/webp';
    if (ext === 'gif')
        return 'image/gif';
    return '';
};
const authenticateAdminToken = async (token) => {
    const rawToken = safeString(token, 4000);
    if (!rawToken)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(rawToken, (0, adminAuth_1.getAdminJwtSecret)());
        const adminId = Number(payload?.adminId || 0);
        if (!adminId || payload?.scope !== 'admin')
            return null;
        const rows = await (0, db_1.query)('SELECT id, username, is_active FROM admin_users WHERE id = ? LIMIT 1', [adminId]);
        const admin = rows?.[0];
        if (!admin || !(admin.is_active === 1 || admin.is_active === true))
            return null;
        return { adminId: Number(admin.id), username: String(admin.username || '') };
    }
    catch {
        return null;
    }
};
const jsonOrNull = (value) => {
    if (typeof value === 'undefined')
        return null;
    try {
        return JSON.stringify(value);
    }
    catch {
        return null;
    }
};
const audit = async ({ req, action, targetType, targetId, reason = null, before, after }) => {
    await (0, db_1.query)(`INSERT INTO admin_audit_logs
       (admin_id, action, target_type, target_id, reason, before_json, after_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        req.admin?.adminId || null,
        action,
        targetType,
        String(targetId),
        reason || null,
        jsonOrNull(before),
        jsonOrNull(after),
        safeString(req.ip || '', 45) || null,
        safeString(req.get('user-agent') || '', 255) || null,
    ]);
};
router.use(async (_req, res, next) => {
    try {
        await (0, adminSchema_1.ensureAdminSchema)();
        next();
    }
    catch (error) {
        console.error('Ensure admin schema error:', error);
        res.status(500).json({ error: '后台数据库初始化失败' });
    }
});
router.post('/auth/login', async (req, res) => {
    const username = safeString(req.body?.username, 100).toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password)
        return res.status(400).json({ error: '请输入后台账号和密码' });
    try {
        const rows = await (0, db_1.query)('SELECT id, username, password_hash, display_name, is_active FROM admin_users WHERE username = ? LIMIT 1', [username]);
        const admin = rows?.[0];
        if (!admin || !(admin.is_active === 1 || admin.is_active === true)) {
            return res.status(401).json({ error: '后台账号或密码错误' });
        }
        const ok = await bcryptjs_1.default.compare(password, admin.password_hash);
        if (!ok)
            return res.status(401).json({ error: '后台账号或密码错误' });
        await (0, db_1.query)('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
        const expiresIn = (process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || '8h');
        const token = jsonwebtoken_1.default.sign({ adminId: Number(admin.id), scope: 'admin' }, (0, adminAuth_1.getAdminJwtSecret)(), { expiresIn });
        return res.json({
            token,
            admin: {
                id: Number(admin.id),
                username: admin.username,
                displayName: admin.display_name || admin.username,
            },
        });
    }
    catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/auth/me', adminAuth_1.requireAdminAuth, async (req, res) => {
    return res.json({ admin: req.admin });
});
router.get('/dashboard/summary', adminAuth_1.requireAdminAuth, async (_req, res) => {
    try {
        const [userRows, roleRows, mentorRows, orderRows, courseRows, lessonRows,] = await Promise.all([
            (0, db_1.query)(`SELECT
           COUNT(*) AS totalUsers,
           SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END) AS suspendedUsers,
           SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS newUsersToday,
           SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS newUsers7d
         FROM users`),
            (0, db_1.query)(`SELECT
           SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
           SUM(CASE WHEN role = 'mentor' THEN 1 ELSE 0 END) AS mentors
         FROM user_roles`),
            (0, db_1.query)(`SELECT
           SUM(CASE WHEN role = 'mentor' AND mentor_approved = 1 THEN 1 ELSE 0 END) AS approvedMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status = 'pending' AND mentor_approved = 0 THEN 1 ELSE 0 END) AS pendingMentors,
           SUM(CASE WHEN role = 'mentor' AND mentor_review_status = 'rejected' THEN 1 ELSE 0 END) AS rejectedMentors
         FROM user_roles`),
            (0, db_1.query)(`SELECT
           COUNT(*) AS totalOrders,
           SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN 1 ELSE 0 END) AS paidOrders,
           COALESCE(SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END), 0) AS paidAmountCny
         FROM billing_orders`),
            (0, db_1.query)('SELECT COUNT(*) AS scheduledCourses FROM course_sessions WHERE status = "scheduled"'),
            (0, db_1.query)("SELECT COUNT(*) AS pendingLessonHours FROM lesson_hour_confirmations WHERE status IN ('pending','disputed','platform_review')"),
        ]);
        return res.json({
            users: userRows?.[0] || {},
            roles: roleRows?.[0] || {},
            mentors: mentorRows?.[0] || {},
            orders: orderRows?.[0] || {},
            courses: courseRows?.[0] || {},
            lessonHours: lessonRows?.[0] || {},
        });
    }
    catch (error) {
        console.error('Admin dashboard summary error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/users', adminAuth_1.requireAdminAuth, async (req, res) => {
    const { page, limit, offset } = getPaging(req);
    const q = safeString(req.query.q, 100);
    const status = safeString(req.query.status, 20);
    const where = ["sr.role = 'student'"];
    const params = [];
    if (q) {
        const like = `%${escapeLike(q)}%`;
        const id = Number.parseInt(q, 10);
        where.push(`(
      u.email LIKE ? ESCAPE '\\\\'
      OR u.username LIKE ? ESCAPE '\\\\'
      OR sr.public_id LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR u.id = ?' : ''}
    )`);
        params.push(like, like, like);
        if (Number.isFinite(id) && id > 0)
            params.push(id);
    }
    if (USER_STATUSES.has(status)) {
        where.push('u.account_status = ?');
        params.push(status);
    }
    try {
        const countRows = await (0, db_1.query)(`SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       INNER JOIN user_roles sr ON sr.user_id = u.id
       WHERE ${where.join(' AND ')}`, params);
        const rows = await (0, db_1.query)(`SELECT
         u.id, sr.public_id AS student_id, u.username, u.email, u.lesson_balance_hours,
         COALESCE(payments.total_paid_cny, 0) AS total_paid_cny, u.account_status,
         u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at,
         GROUP_CONCAT(CONCAT(ur.role, '|', ur.public_id, '|', ur.mentor_approved, '|', ur.mentor_review_status) ORDER BY ur.role SEPARATOR ',') AS roles_compact
       FROM users u
       INNER JOIN user_roles sr ON sr.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN (
         SELECT user_id,
                SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END) AS total_paid_cny
         FROM billing_orders
         GROUP BY user_id
       ) payments ON payments.user_id = u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, sr.public_id, u.username, u.email, u.lesson_balance_hours, payments.total_paid_cny,
                u.account_status, u.suspended_at, u.suspended_reason, u.created_at, u.updated_at, u.last_login_at
       ORDER BY u.created_at DESC, u.id DESC
       ${pagingSql(limit, offset)}`, params);
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
    }
    catch (error) {
        console.error('Admin users list error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/users/:userId', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    if (!userId)
        return res.status(400).json({ error: '无效用户ID' });
    try {
        const users = await (0, db_1.query)(`SELECT id, username, email, lesson_balance_hours, account_status, suspended_at, suspended_reason,
              created_at, updated_at, last_login_at
       FROM users WHERE id = ? LIMIT 1`, [userId]);
        const user = users?.[0];
        if (!user)
            return res.status(404).json({ error: '未找到用户' });
        const [roles, mentorProfiles, orderSummary, courseSummary] = await Promise.all([
            (0, db_1.query)(`SELECT role, public_id, mentor_approved, mentor_review_status, mentor_review_note,
                mentor_reviewed_at, mentor_reviewed_by_admin_id, created_at
         FROM user_roles WHERE user_id = ? ORDER BY role`, [userId]),
            (0, db_1.query)(`SELECT display_name, gender, degree, school, timezone, courses_json, teaching_languages_json,
                rating, review_count, avg_appointment_response_minutes, is_accepting_students,
                last_replied_at, completed_session_count, avatar_url, created_at, updated_at
         FROM mentor_profiles WHERE user_id = ? LIMIT 1`, [userId]),
            (0, db_1.query)(`SELECT COUNT(*) AS orderCount,
                COALESCE(SUM(CASE WHEN credited_at IS NOT NULL OR status IN ('COMPLETED','CAPTURED') THEN amount_cny ELSE 0 END), 0) AS paidAmountCny
         FROM billing_orders WHERE user_id = ?`, [userId]),
            (0, db_1.query)(`SELECT
           SUM(CASE WHEN student_user_id = ? THEN 1 ELSE 0 END) AS studentCourseCount,
           SUM(CASE WHEN mentor_user_id = ? THEN 1 ELSE 0 END) AS mentorCourseCount,
           SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduledCourseCount,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedCourseCount
         FROM course_sessions WHERE student_user_id = ? OR mentor_user_id = ?`, [userId, userId, userId, userId]),
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
    }
    catch (error) {
        console.error('Admin user detail error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.patch('/users/:userId/status', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    const status = safeString(req.body?.status, 20);
    const reason = readReason(req);
    if (!userId)
        return res.status(400).json({ error: '无效用户ID' });
    if (!USER_STATUSES.has(status))
        return res.status(400).json({ error: '无效账号状态' });
    if (!reason)
        return res.status(400).json({ error: '请填写操作原因' });
    try {
        const beforeRows = await (0, db_1.query)('SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1', [userId]);
        const before = beforeRows?.[0];
        if (!before)
            return res.status(404).json({ error: '未找到用户' });
        await (0, db_1.query)(`UPDATE users
       SET account_status = ?,
           suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,
           suspended_reason = CASE WHEN ? = 'suspended' THEN ? ELSE NULL END
       WHERE id = ?`, [status, status, status, reason, userId]);
        if (status === 'suspended') {
            await (0, refreshTokens_1.revokeAllRefreshTokensForUser)(userId, 'admin_suspended');
        }
        const afterRows = await (0, db_1.query)('SELECT id, email, account_status, suspended_at, suspended_reason FROM users WHERE id = ? LIMIT 1', [userId]);
        const after = afterRows?.[0];
        await audit({ req, action: 'user.status.update', targetType: 'user', targetId: userId, reason, before, after });
        return res.json({ user: after });
    }
    catch (error) {
        console.error('Admin update user status error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/mentors/reviews', adminAuth_1.requireAdminAuth, async (req, res) => {
    const { page, limit, offset } = getPaging(req);
    const q = safeString(req.query.q, 100);
    const status = safeString(req.query.status, 20);
    const where = ["ur.role = 'mentor'"];
    const params = [];
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
        if (Number.isFinite(id) && id > 0)
            params.push(id);
    }
    try {
        const countRows = await (0, db_1.query)(`SELECT COUNT(*) AS total
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       WHERE ${where.join(' AND ')}`, params);
        const rows = await (0, db_1.query)(`SELECT
         ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
         ur.mentor_review_note, ur.mentor_qs_top100, ur.mentor_reviewed_at, ur.created_at AS mentor_created_at,
         u.username, u.email, u.account_status, u.last_login_at,
         mp.display_name, mp.degree, mp.school, mp.timezone, mp.avatar_url, mp.updated_at AS profile_updated_at,
         s.mentor_resume_url,
         COALESCE(teaching.total_teaching_hours, 0) AS total_teaching_hours
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       LEFT JOIN mentor_profiles mp ON mp.user_id = ur.user_id
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       LEFT JOIN (
         SELECT mentor_user_id, SUM(duration_hours) AS total_teaching_hours
         FROM course_sessions
         WHERE status = 'completed'
         GROUP BY mentor_user_id
       ) teaching ON teaching.mentor_user_id = ur.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ur.created_at DESC, ur.user_id DESC
       ${pagingSql(limit, offset)}`, params);
        return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), mentors: rows || [] });
    }
    catch (error) {
        console.error('Admin mentor reviews list error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/mentors/:userId/review', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    if (!userId)
        return res.status(400).json({ error: '无效导师ID' });
    try {
        const rows = await (0, db_1.query)(`SELECT
         ur.user_id, ur.public_id, ur.mentor_approved, ur.mentor_review_status,
         ur.mentor_review_note, ur.mentor_qs_top100, ur.mentor_reviewed_at, ur.mentor_reviewed_by_admin_id,
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
       LIMIT 1`, [userId]);
        const mentor = rows?.[0];
        if (!mentor)
            return res.status(404).json({ error: '未找到导师申请' });
        mentor.courses = maybeParseJson(mentor.courses_json, []);
        mentor.teachingLanguages = maybeParseJson(mentor.teaching_languages_json, []);
        mentor.availability = maybeParseJson(mentor.availability_json, null);
        mentor.resumeUrls = parseUrlList(mentor.mentor_resume_url);
        mentor.mentor_resume_url = mentor.resumeUrls[0] || null;
        return res.json({ mentor });
    }
    catch (error) {
        console.error('Admin mentor review detail error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/mentors/:userId/resume-url', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    if (!userId)
        return res.status(400).json({ error: '无效导师ID' });
    try {
        const rows = await (0, db_1.query)(`SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`, [userId]);
        const mentor = rows?.[0];
        if (!mentor)
            return res.status(404).json({ error: '未找到导师申请' });
        const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
        if (!resumeUrl)
            return res.status(404).json({ error: '未找到简历' });
        const ossKey = resolveOssKeyFromUrl(resumeUrl);
        if (!ossKey)
            return res.json({ url: resumeUrl, signed: false });
        const client = (0, ossClient_1.getOssClient)();
        if (!client)
            return res.status(500).json({ error: 'OSS 未配置' });
        const fileName = getFileNameFromUrl(resumeUrl);
        const expires = 120;
        const url = client.signatureUrl(ossKey, {
            expires,
            response: {
                'content-disposition': (0, ossClient_1.buildContentDisposition)(fileName, 'inline'),
            },
        });
        return res.json({
            url,
            signed: true,
            expiresAt: Math.floor(Date.now() / 1000) + expires,
        });
    }
    catch (error) {
        console.error('Admin mentor resume url error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/mentors/:userId/resume-preview', async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    if (!userId)
        return res.status(400).json({ error: '无效导师ID' });
    try {
        const auth = req.headers.authorization || '';
        const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const admin = await authenticateAdminToken(bearerToken || req.query.token);
        if (!admin)
            return res.status(401).json({ error: '后台登录已失效' });
        const rows = await (0, db_1.query)(`SELECT s.mentor_resume_url
       FROM user_roles ur
       LEFT JOIN account_settings s ON s.user_id = ur.user_id
       WHERE ur.user_id = ? AND ur.role = 'mentor'
       LIMIT 1`, [userId]);
        const mentor = rows?.[0];
        if (!mentor)
            return res.status(404).json({ error: '未找到导师申请' });
        const resumeUrl = parseUrlList(mentor.mentor_resume_url)[0] || '';
        if (!resumeUrl)
            return res.status(404).json({ error: '未找到简历' });
        const ossKey = resolveOssKeyFromUrl(resumeUrl);
        if (!ossKey)
            return res.redirect(resumeUrl);
        const client = (0, ossClient_1.getOssClient)();
        if (!client)
            return res.status(500).json({ error: 'OSS 未配置' });
        const fileName = getFileNameFromUrl(resumeUrl);
        const contentType = getContentTypeFromFileName(fileName) || 'application/octet-stream';
        const result = await client.getStream(ossKey);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', (0, ossClient_1.buildContentDisposition)(fileName, 'inline'));
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Admin-User', admin.username);
        result.stream.on('error', (error) => {
            console.error('Admin mentor resume preview stream error:', error);
            if (!res.headersSent) {
                res.status(500).end('预览失败');
            }
            else {
                res.end();
            }
        });
        return result.stream.pipe(res);
    }
    catch (error) {
        console.error('Admin mentor resume preview error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/mentors/:userId/approve', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    const qsTop100 = req.body?.qsTop100 === true || req.body?.qsTop100 === 1 || req.body?.qsTop100 === '1' || req.body?.qsTop100 === 'true';
    if (!userId)
        return res.status(400).json({ error: '无效导师ID' });
    try {
        const beforeRows = await (0, db_1.query)("SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [userId]);
        const before = beforeRows?.[0];
        if (!before)
            return res.status(404).json({ error: '未找到导师申请' });
        await (0, db_1.query)(`UPDATE user_roles
       SET mentor_approved = 1,
           mentor_review_status = 'approved',
           mentor_review_note = NULL,
           mentor_qs_top100 = ?,
           mentor_reviewed_at = CURRENT_TIMESTAMP,
           mentor_reviewed_by_admin_id = ?
       WHERE user_id = ? AND role = 'mentor'`, [qsTop100 ? 1 : 0, req.admin.adminId, userId]);
        const afterRows = await (0, db_1.query)("SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [userId]);
        const after = afterRows?.[0];
        await audit({ req, action: 'mentor.approve', targetType: 'mentor', targetId: userId, reason: qsTop100 ? 'QS100' : null, before, after });
        return res.json({ mentor: after });
    }
    catch (error) {
        console.error('Admin approve mentor error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/mentors/:userId/reject', adminAuth_1.requireAdminAuth, async (req, res) => {
    const userId = toPositiveInt(req.params.userId, 0);
    const reason = readReason(req);
    if (!userId)
        return res.status(400).json({ error: '无效导师ID' });
    if (!reason)
        return res.status(400).json({ error: '请填写驳回原因' });
    try {
        const beforeRows = await (0, db_1.query)("SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [userId]);
        const before = beforeRows?.[0];
        if (!before)
            return res.status(404).json({ error: '未找到导师申请' });
        await (0, db_1.query)(`UPDATE user_roles
       SET mentor_approved = 0,
           mentor_review_status = 'rejected',
           mentor_review_note = ?,
           mentor_qs_top100 = 0,
           mentor_reviewed_at = CURRENT_TIMESTAMP,
           mentor_reviewed_by_admin_id = ?
       WHERE user_id = ? AND role = 'mentor'`, [reason, req.admin.adminId, userId]);
        const afterRows = await (0, db_1.query)("SELECT * FROM user_roles WHERE user_id = ? AND role = 'mentor' LIMIT 1", [userId]);
        const after = afterRows?.[0];
        await audit({ req, action: 'mentor.reject', targetType: 'mentor', targetId: userId, reason, before, after });
        return res.json({ mentor: after });
    }
    catch (error) {
        console.error('Admin reject mentor error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/orders', adminAuth_1.requireAdminAuth, async (req, res) => {
    const { page, limit, offset } = getPaging(req);
    const q = safeString(req.query.q, 100);
    const provider = safeString(req.query.provider, 20);
    const status = safeString(req.query.status, 40).toLowerCase();
    const startDate = safeString(req.query.startDate, 20);
    const endDate = safeString(req.query.endDate, 20);
    const where = ['1=1'];
    const params = [];
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
        if (Number.isFinite(id) && id > 0)
            params.push(id, id);
    }
    if (provider) {
        where.push('bo.provider = ?');
        params.push(provider);
    }
    if (status === 'pending') {
        where.push("bo.status IN ('CREATED', 'APPROVED')");
    }
    else if (status === 'paid') {
        where.push("(bo.credited_at IS NOT NULL OR bo.status IN ('COMPLETED', 'CAPTURED'))");
    }
    else if (status === 'failed') {
        where.push("bo.status IN ('FAILED', 'VOIDED')");
    }
    else if (status) {
        where.push('bo.status = ?');
        params.push(status.toUpperCase());
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
        const countRows = await (0, db_1.query)(`SELECT COUNT(*) AS total
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE ${where.join(' AND ')}`, params);
        const rows = await (0, db_1.query)(`SELECT
         bo.id, bo.user_id, bo.provider, bo.provider_order_id, bo.status, bo.topup_hours,
         bo.unit_price_cny, bo.amount_cny, bo.currency_code, bo.amount_usd, bo.paypal_capture_id,
         bo.created_at, bo.captured_at, bo.credited_at, bo.updated_at,
         u.email, u.username, u.account_status, ur.public_id AS student_public_id
       FROM billing_orders bo
       JOIN users u ON u.id = bo.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
       WHERE ${where.join(' AND ')}
       ORDER BY bo.created_at DESC, bo.id DESC
       ${pagingSql(limit, offset)}`, params);
        return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), orders: rows || [] });
    }
    catch (error) {
        console.error('Admin orders list error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.patch('/orders/:orderId/status', adminAuth_1.requireAdminAuth, async (req, res) => {
    const orderId = toPositiveInt(req.params.orderId, 0);
    const status = safeString(req.body?.status, 40).toUpperCase();
    const reason = readReason(req);
    if (!orderId)
        return res.status(400).json({ error: '无效订单ID' });
    if (!ORDER_STATUSES.has(status))
        return res.status(400).json({ error: '无效订单状态' });
    if (!reason)
        return res.status(400).json({ error: '请填写操作原因' });
    try {
        const beforeRows = await (0, db_1.query)('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
        const before = beforeRows?.[0];
        if (!before)
            return res.status(404).json({ error: '未找到订单' });
        await (0, db_1.query)('UPDATE billing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
        const afterRows = await (0, db_1.query)('SELECT id, status, provider_order_id FROM billing_orders WHERE id = ? LIMIT 1', [orderId]);
        const after = afterRows?.[0];
        await audit({ req, action: 'order.status.update', targetType: 'billing_order', targetId: orderId, reason, before, after });
        return res.json({ order: after });
    }
    catch (error) {
        console.error('Admin update order status error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/classrooms', adminAuth_1.requireAdminAuth, async (req, res) => {
    const { page, limit, offset } = getPaging(req);
    const q = safeString(req.query.q, 100);
    const status = safeString(req.query.status, 30).toLowerCase();
    const lessonHoursStatus = safeString(req.query.lessonHoursStatus, 40).toLowerCase();
    const replayStatus = safeString(req.query.replayStatus, 30).toLowerCase();
    const startDate = safeString(req.query.startDate, 20);
    const endDate = safeString(req.query.endDate, 20);
    const where = ['1=1'];
    const params = [];
    if (q) {
        const like = `%${escapeLike(q)}%`;
        const id = Number.parseInt(q, 10);
        where.push(`(
      su.email LIKE ? ESCAPE '\\\\'
      OR su.username LIKE ? ESCAPE '\\\\'
      OR mu.email LIKE ? ESCAPE '\\\\'
      OR mu.username LIKE ? ESCAPE '\\\\'
      OR sr.public_id LIKE ? ESCAPE '\\\\'
      OR mr.public_id LIKE ? ESCAPE '\\\\'
      OR mp.display_name LIKE ? ESCAPE '\\\\'
      ${Number.isFinite(id) && id > 0 ? 'OR cs.id = ?' : ''}
    )`);
        params.push(like, like, like, like, like, like, like);
        if (Number.isFinite(id) && id > 0)
            params.push(id);
    }
    if (CLASSROOM_STATUSES.has(status)) {
        if (status === 'scheduled') {
            where.push("cs.status = 'scheduled' AND TIMESTAMPADD(MINUTE, ROUND(cs.duration_hours * 60), cs.starts_at) > UTC_TIMESTAMP()");
        }
        else if (status === 'completed') {
            where.push("(cs.status = 'completed' OR (cs.status = 'scheduled' AND TIMESTAMPADD(MINUTE, ROUND(cs.duration_hours * 60), cs.starts_at) <= UTC_TIMESTAMP()))");
        }
        else {
            where.push('cs.status = ?');
            params.push(status);
        }
    }
    if (LESSON_HOURS_STATUSES.has(lessonHoursStatus)) {
        if (lessonHoursStatus === 'none') {
            where.push('latest_lhc.id IS NULL');
        }
        else if (lessonHoursStatus === 'confirmed') {
            where.push("latest_lhc.status IN ('confirmed', 'dispute_confirmed')");
        }
        else {
            where.push('latest_lhc.status = ?');
            params.push(lessonHoursStatus);
        }
    }
    if (REPLAY_STATUSES.has(replayStatus)) {
        if (replayStatus === 'none') {
            where.push('COALESCE(rec.recording_count, 0) = 0');
        }
        else if (replayStatus === 'running') {
            where.push('COALESCE(rec.active_recording_count, 0) > 0');
        }
        else if (replayStatus === 'ready') {
            where.push('COALESCE(rec.stopped_recording_count, 0) > 0');
        }
        else if (replayStatus === 'failed') {
            where.push("COALESCE(rec.recording_count, 0) > 0 AND COALESCE(rec.active_recording_count, 0) = 0 AND COALESCE(rec.stopped_recording_count, 0) = 0 AND rec.latest_recording_status = 'failed'");
        }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        where.push('cs.starts_at >= ?');
        params.push(`${startDate} 00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        where.push('cs.starts_at <= ?');
        params.push(`${endDate} 23:59:59`);
    }
    const joins = `
    FROM course_sessions cs
    JOIN users su ON su.id = cs.student_user_id
    JOIN users mu ON mu.id = cs.mentor_user_id
    LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
    LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
    LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
    LEFT JOIN (
      SELECT lhc.*
      FROM lesson_hour_confirmations lhc
      INNER JOIN (
        SELECT course_session_id, MAX(id) AS latest_id
        FROM lesson_hour_confirmations
        GROUP BY course_session_id
      ) picked ON picked.latest_id = lhc.id
    ) latest_lhc ON latest_lhc.course_session_id = cs.id
    LEFT JOIN (
      SELECT
        course_session_id,
        COUNT(*) AS recording_count,
        SUM(CASE WHEN status IN ('starting','running','stopping') THEN 1 ELSE 0 END) AS active_recording_count,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) AS stopped_recording_count,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY id DESC SEPARATOR ','), ',', 1) AS latest_recording_status
      FROM classroom_recordings
      GROUP BY course_session_id
    ) rec ON rec.course_session_id = cs.id
    LEFT JOIN course_session_reviews csr ON csr.course_session_id = cs.id
  `;
    try {
        const countRows = await (0, db_1.query)(`SELECT COUNT(*) AS total ${joins} WHERE ${where.join(' AND ')}`, params);
        const rows = await (0, db_1.query)(`SELECT
         cs.id, cs.student_user_id, cs.mentor_user_id, cs.course_direction, cs.course_type,
         cs.starts_at, cs.duration_hours, cs.status, cs.created_at, cs.updated_at,
         sr.public_id AS student_public_id, su.email AS student_email, su.username AS student_username,
         mr.public_id AS mentor_public_id, mu.email AS mentor_email, mu.username AS mentor_username,
         mp.display_name AS mentor_display_name,
         latest_lhc.status AS lesson_hours_status,
         latest_lhc.proposed_hours, latest_lhc.disputed_hours, latest_lhc.final_hours,
         latest_lhc.responded_at, latest_lhc.settled_at,
         COALESCE(rec.recording_count, 0) AS recording_count,
         COALESCE(rec.active_recording_count, 0) AS active_recording_count,
         COALESCE(rec.stopped_recording_count, 0) AS stopped_recording_count,
         rec.latest_recording_status,
         csr.id AS review_id, csr.overall_score AS review_overall_score, csr.created_at AS review_created_at
       ${joins}
       WHERE ${where.join(' AND ')}
       ORDER BY cs.starts_at DESC, cs.id DESC
       ${pagingSql(limit, offset)}`, params);
        const classrooms = (rows || []).map((row) => ({
            ...row,
            startsAt: toIsoString(row.starts_at),
            createdAt: toIsoString(row.created_at),
            updatedAt: toIsoString(row.updated_at),
            effectiveStatus: getEffectiveClassroomStatus(row),
            replayStatus: getReplayStatus(row),
            reviewStatus: getReviewStatus(row),
        }));
        return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), classrooms });
    }
    catch (error) {
        console.error('Admin classrooms list error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/classrooms/:courseId', adminAuth_1.requireAdminAuth, async (req, res) => {
    const courseId = toPositiveInt(req.params.courseId, 0);
    if (!courseId)
        return res.status(400).json({ error: '无效课堂ID' });
    try {
        const rows = await (0, db_1.query)(`SELECT
         cs.*,
         sr.public_id AS student_public_id, su.email AS student_email, su.username AS student_username,
         mr.public_id AS mentor_public_id, mu.email AS mentor_email, mu.username AS mentor_username,
         mp.display_name AS mentor_display_name,
         csr.id AS review_id, csr.clarity_score, csr.communication_score, csr.preparation_score,
         csr.expertise_score, csr.punctuality_score, csr.comment_text, csr.overall_score,
         csr.created_at AS review_created_at, csr.updated_at AS review_updated_at
       FROM course_sessions cs
       JOIN users su ON su.id = cs.student_user_id
       JOIN users mu ON mu.id = cs.mentor_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
       LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
       LEFT JOIN course_session_reviews csr ON csr.course_session_id = cs.id
       WHERE cs.id = ?
       LIMIT 1`, [courseId]);
        const classroom = rows?.[0];
        if (!classroom)
            return res.status(404).json({ error: '未找到课堂' });
        const [lessonRows, recordingRows] = await Promise.all([
            (0, db_1.query)(`SELECT lhc.*, responded.email AS responded_by_email
         FROM lesson_hour_confirmations lhc
         LEFT JOIN users responded ON responded.id = lhc.responded_by_user_id
         WHERE lhc.course_session_id = ?
         ORDER BY lhc.id DESC
         LIMIT 1`, [courseId]),
            (0, db_1.query)(`SELECT cr.*, starter.email AS started_by_email
         FROM classroom_recordings cr
         LEFT JOIN users starter ON starter.id = cr.started_by_user_id
         WHERE cr.course_session_id = ?
         ORDER BY cr.id DESC`, [courseId]),
        ]);
        const recordings = (recordingRows || []).map((row) => ({
            ...row,
            startedAt: toIsoString(row.started_at),
            stopRequestedAt: toIsoString(row.stop_requested_at),
            stoppedAt: toIsoString(row.stopped_at),
            createdAt: toIsoString(row.created_at),
            updatedAt: toIsoString(row.updated_at),
        }));
        const replayStatus = getReplayStatus({
            recording_count: recordings.length,
            active_recording_count: recordings.filter((r) => ['starting', 'running', 'stopping'].includes(safeString(r.status, 30))).length,
            stopped_recording_count: recordings.filter((r) => safeString(r.status, 30) === 'stopped').length,
            latest_recording_status: recordings[0]?.status,
        });
        const detail = {
            ...classroom,
            startsAt: toIsoString(classroom.starts_at),
            createdAt: toIsoString(classroom.created_at),
            updatedAt: toIsoString(classroom.updated_at),
            effectiveStatus: getEffectiveClassroomStatus(classroom),
            replayStatus,
            reviewStatus: getReviewStatus(classroom),
            review: classroom.review_id == null ? null : {
                id: String(classroom.review_id),
                overallScore: toNumber(classroom.overall_score, 0),
                scores: {
                    clarity: toNumber(classroom.clarity_score, 0),
                    communication: toNumber(classroom.communication_score, 0),
                    preparation: toNumber(classroom.preparation_score, 0),
                    expertise: toNumber(classroom.expertise_score, 0),
                    punctuality: toNumber(classroom.punctuality_score, 0),
                },
                comment: safeString(classroom.comment_text, 4000),
                createdAt: toIsoString(classroom.review_created_at),
                updatedAt: toIsoString(classroom.review_updated_at),
            },
            latestLessonHours: lessonRows?.[0] || null,
            recordings,
        };
        return res.json({ classroom: detail });
    }
    catch (error) {
        console.error('Admin classroom detail error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.patch('/classrooms/:courseId/lesson-hours/final-decision', adminAuth_1.requireAdminAuth, async (req, res) => {
    const courseId = toPositiveInt(req.params.courseId, 0);
    const decision = safeString(req.body?.decision, 40).toLowerCase();
    const reason = readReason(req, 4);
    if (!courseId)
        return res.status(400).json({ error: '无效课堂ID' });
    if (decision !== 'mentor_proposed' && decision !== 'student_disputed') {
        return res.status(400).json({ error: '请选择采信导师提交课时或学生争议课时' });
    }
    if (!reason)
        return res.status(400).json({ error: '请填写裁决依据' });
    let conn = null;
    let before = null;
    let after = null;
    try {
        await (0, mentorRecommendation_1.ensureMentorRecommendationColumns)();
        conn = await db_1.pool.getConnection();
        await conn.beginTransaction();
        const [rows] = await conn.execute(`SELECT
         lhc.id, lhc.message_item_id, lhc.thread_id, lhc.course_session_id,
         lhc.student_user_id, lhc.mentor_user_id, lhc.proposed_hours,
         lhc.disputed_hours, lhc.final_hours, lhc.status,
         cs.duration_hours AS session_duration_hours, cs.status AS session_status
       FROM lesson_hour_confirmations lhc
       INNER JOIN course_sessions cs ON cs.id = lhc.course_session_id
       WHERE lhc.course_session_id = ?
       ORDER BY lhc.id DESC
       LIMIT 1
       FOR UPDATE`, [courseId]);
        before = rows?.[0];
        if (!before) {
            await conn.rollback();
            return res.status(404).json({ error: '未找到课时确认记录' });
        }
        if (safeString(before.status, 40).toLowerCase() !== 'platform_review') {
            await conn.rollback();
            return res.status(409).json({ error: '当前课时确认不在平台介入状态' });
        }
        const proposedHours = toNumber(before.proposed_hours, 0);
        const disputedHours = toNumber(before.disputed_hours, 0);
        const finalHours = decision === 'mentor_proposed' ? proposedHours : disputedHours;
        if (!Number.isFinite(finalHours) || finalHours <= 0) {
            await conn.rollback();
            return res.status(409).json({ error: '待裁决课时数据不完整，请刷新后重试' });
        }
        await conn.execute(`UPDATE lesson_hour_confirmations
       SET status = 'dispute_confirmed',
           final_hours = ?,
           responded_by_user_id = NULL,
           responded_at = CURRENT_TIMESTAMP,
           settled_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [finalHours, Number(before.id)]);
        await conn.execute(`UPDATE course_sessions
       SET duration_hours = ?, status = 'completed'
       WHERE id = ?`, [finalHours, courseId]);
        await (0, mentorRecommendation_1.recomputeMentorCompletedSessionCount)(conn, Number(before.mentor_user_id));
        await conn.execute(`UPDATE users
       SET lesson_balance_hours = lesson_balance_hours - ?
       WHERE id = ?`, [finalHours, Number(before.student_user_id)]);
        await conn.execute(`UPDATE message_threads
       SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [Number(before.message_item_id), Number(before.thread_id)]);
        const [afterRows] = await conn.execute(`SELECT lhc.*, cs.duration_hours AS session_duration_hours, cs.status AS session_status
       FROM lesson_hour_confirmations lhc
       INNER JOIN course_sessions cs ON cs.id = lhc.course_session_id
       WHERE lhc.id = ?
       LIMIT 1`, [Number(before.id)]);
        after = afterRows?.[0] || null;
        await conn.commit();
    }
    catch (error) {
        try {
            await conn?.rollback();
        }
        catch { }
        console.error('Admin classroom lesson hours final decision error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
    finally {
        try {
            conn?.release();
        }
        catch { }
    }
    try {
        await audit({
            req,
            action: 'classroom.lesson_hours.final_decision',
            targetType: 'course_session',
            targetId: courseId,
            reason,
            before,
            after: { ...after, decision },
        });
    }
    catch (error) {
        console.error('Admin classroom lesson hours audit error:', error);
    }
    return res.json({ ok: true, classroomId: String(courseId), decision, lessonHours: after });
});
router.get('/classrooms/:courseId/chat', adminAuth_1.requireAdminAuth, async (req, res) => {
    const courseId = toPositiveInt(req.params.courseId, 0);
    if (!courseId)
        return res.status(400).json({ error: '无效课堂ID' });
    try {
        const rows = await (0, db_1.query)(`SELECT
         cm.id, cm.sender_user_id, cm.message_type, cm.text_content, cm.created_at,
         u.email, u.username,
         sr.public_id AS student_public_id,
         mr.public_id AS mentor_public_id,
         ctf.file_id, ctf.original_file_name, ctf.content_type, ctf.size_bytes, ctf.ext, ctf.cleanup_status
       FROM classroom_messages cm
       LEFT JOIN users u ON u.id = cm.sender_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cm.sender_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cm.sender_user_id AND mr.role = 'mentor'
       LEFT JOIN classroom_temp_files ctf ON ctf.classroom_id = cm.classroom_id AND ctf.file_id = cm.file_id
       WHERE cm.classroom_id = ?
       ORDER BY cm.id ASC
       LIMIT 500`, [courseId]);
        const messages = (rows || []).map((row) => ({
            id: String(row.id),
            senderUserId: Number(row.sender_user_id),
            senderLabel: row.student_public_id || row.mentor_public_id || row.username || row.email || `User ${row.sender_user_id}`,
            messageType: safeString(row.message_type, 20),
            textContent: safeString(row.text_content, 4000),
            createdAt: toIsoString(row.created_at),
            file: row.file_id ? {
                fileId: safeString(row.file_id, 32),
                fileName: safeString(row.original_file_name, 255),
                contentType: safeString(row.content_type, 128),
                sizeBytes: toNumber(row.size_bytes, 0),
                ext: safeString(row.ext, 16),
                cleanupStatus: safeString(row.cleanup_status, 20),
            } : null,
        }));
        return res.json({ courseId: String(courseId), messages });
    }
    catch (error) {
        console.error('Admin classroom chat error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/classrooms/:courseId/replay-files', adminAuth_1.requireAdminAuth, async (req, res) => {
    const courseId = toPositiveInt(req.params.courseId, 0);
    if (!courseId)
        return res.status(400).json({ error: '无效课堂ID' });
    try {
        await (0, aliyunRtcRecording_1.ensureClassroomRecordingsTable)();
        const recordingRows = await (0, db_1.query)(`SELECT storage_prefix
       FROM classroom_recordings
       WHERE course_session_id = ?
         AND status IN ('running', 'stopping', 'stopped')
       ORDER BY id DESC
       LIMIT 20`, [courseId]);
        const storagePrefixes = Array.from(new Set((recordingRows || [])
            .map((row) => safeString(row.storage_prefix, 512))
            .filter(Boolean)));
        const replayFiles = await listReplayMp4Files(storagePrefixes);
        if (!replayFiles)
            return res.status(500).json({ error: 'recording_storage_unconfigured' });
        return res.json({ courseId: String(courseId), files: replayFiles.files, expiresAt: replayFiles.expiresAt });
    }
    catch (error) {
        console.error('Admin classroom replay files error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/classrooms/:courseId/observer-auth', adminAuth_1.requireAdminAuth, async (req, res) => {
    const courseId = toPositiveInt(req.params.courseId, 0);
    if (!courseId)
        return res.status(400).json({ error: '无效课堂ID' });
    const runtime = (0, aliyunRtc_1.getAliyunLiveRuntimeConfig)();
    if (!runtime)
        return res.status(500).json({ error: '实时音视频配置缺失' });
    try {
        const rows = await (0, db_1.query)(`SELECT
         cs.id, cs.status, cs.starts_at, cs.duration_hours,
         cs.student_user_id, cs.mentor_user_id,
         sr.public_id AS student_public_id,
         mr.public_id AS mentor_public_id,
         su.username AS student_username,
         mu.username AS mentor_username,
         mp.display_name AS mentor_display_name
       FROM course_sessions cs
       LEFT JOIN users su ON su.id = cs.student_user_id
       LEFT JOIN users mu ON mu.id = cs.mentor_user_id
       LEFT JOIN user_roles sr ON sr.user_id = cs.student_user_id AND sr.role = 'student'
       LEFT JOIN user_roles mr ON mr.user_id = cs.mentor_user_id AND mr.role = 'mentor'
       LEFT JOIN mentor_profiles mp ON mp.user_id = cs.mentor_user_id
       WHERE cs.id = ?
       LIMIT 1`, [courseId]);
        const classroom = rows?.[0];
        if (!classroom)
            return res.status(404).json({ error: '未找到课堂' });
        const roomId = `course_${courseId}`;
        const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const studentPublicId = safeString(classroom.student_public_id, 64) || `s${classroom.student_user_id}`;
        const mentorPublicId = safeString(classroom.mentor_public_id, 64) || `m${classroom.mentor_user_id}`;
        const studentAuth = (0, aliyunRtc_1.createAliyunLiveStreamAuthInfo)({
            appId: runtime.appId,
            appKey: runtime.appKey,
            roomId,
            userId: studentPublicId,
            timestamp: expires,
        });
        const mentorAuth = (0, aliyunRtc_1.createAliyunLiveStreamAuthInfo)({
            appId: runtime.appId,
            appKey: runtime.appKey,
            roomId,
            userId: mentorPublicId,
            timestamp: expires,
        });
        return res.json({
            courseId: String(courseId),
            mode: 'readonly-observer',
            roomId,
            expiresAt: new Date(expires * 1000).toISOString(),
            status: classroom.status,
            effectiveStatus: getEffectiveClassroomStatus(classroom),
            startsAt: toIsoString(classroom.starts_at),
            durationHours: toNumber(classroom.duration_hours, 0),
            streams: [
                {
                    role: 'student',
                    userId: studentPublicId,
                    label: safeString(classroom.student_username, 100) || studentPublicId,
                    playUrl: studentAuth.playUrl,
                },
                {
                    role: 'mentor',
                    userId: mentorPublicId,
                    label: safeString(classroom.mentor_display_name, 100) || safeString(classroom.mentor_username, 100) || mentorPublicId,
                    playUrl: mentorAuth.playUrl,
                },
            ],
        });
    }
    catch (error) {
        console.error('Admin classroom observer auth error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.get('/audit-logs', adminAuth_1.requireAdminAuth, async (req, res) => {
    const { page, limit, offset } = getPaging(req);
    const action = safeString(req.query.action, 80);
    const targetType = safeString(req.query.targetType, 60);
    const where = ['1=1'];
    const params = [];
    if (action) {
        where.push('al.action = ?');
        params.push(action);
    }
    if (targetType) {
        where.push('al.target_type = ?');
        params.push(targetType);
    }
    try {
        const countRows = await (0, db_1.query)(`SELECT COUNT(*) AS total FROM admin_audit_logs al WHERE ${where.join(' AND ')}`, params);
        const rows = await (0, db_1.query)(`SELECT al.*, au.username AS admin_username
       FROM admin_audit_logs al
       LEFT JOIN admin_users au ON au.id = al.admin_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.created_at DESC, al.id DESC
       ${pagingSql(limit, offset)}`, params);
        return res.json({ page, limit, total: Number(countRows?.[0]?.total || 0), logs: rows || [] });
    }
    catch (error) {
        console.error('Admin audit logs error:', error);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
