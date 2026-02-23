"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const aliyunRtc_1 = require("../services/aliyunRtc");
const router = (0, express_1.Router)();
const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const toIsoString = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime()))
        return raw.toISOString();
    const text = safeText(raw);
    if (!text)
        return '';
    const normalized = text.includes('T') ? text : text.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()))
        return '';
    return parsed.toISOString();
};
const isMissingSchemaError = (err) => {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR')
        return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('course_sessions') || message.includes('user_roles') || message.includes('users');
};
router.get('/classrooms/:courseId/auth', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未登录' });
    const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
    if (!Number.isFinite(courseId) || courseId <= 0) {
        return res.status(400).json({ error: '无效课程ID' });
    }
    const runtime = (0, aliyunRtc_1.getAliyunRtcRuntimeConfig)();
    if (!runtime) {
        return res.status(500).json({ error: 'RTC 配置缺失，请检查 ALIYUN_RTC_APP_ID / ALIYUN_RTC_APP_KEY' });
    }
    try {
        const sessionRows = await (0, db_1.query)(`
      SELECT
        id,
        status,
        starts_at,
        duration_hours,
        student_user_id,
        mentor_user_id
      FROM course_sessions
      WHERE id = ?
      LIMIT 1
      `, [courseId]);
        const sessionRow = sessionRows?.[0];
        if (!sessionRow)
            return res.status(404).json({ error: '课程不存在' });
        const studentUserId = toNumber(sessionRow.student_user_id, 0);
        const mentorUserId = toNumber(sessionRow.mentor_user_id, 0);
        const isStudentInSession = req.user.id === studentUserId;
        const isMentorInSession = req.user.id === mentorUserId;
        if (!isStudentInSession && !isMentorInSession) {
            return res.status(403).json({ error: '无权限进入该课程课堂' });
        }
        const status = safeText(sessionRow.status).toLowerCase();
        if (status !== 'scheduled') {
            return res.status(409).json({ error: '非 scheduled 课程不可进入课堂' });
        }
        const roleRows = await (0, db_1.query)(`
      SELECT public_id
      FROM user_roles
      WHERE user_id = ? AND role = ?
      LIMIT 1
      `, [req.user.id, req.user.role]);
        const rtcUserId = safeText(roleRows?.[0]?.public_id) || `u${req.user.id}`;
        const userRows = await (0, db_1.query)('SELECT username FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        const userName = safeText(userRows?.[0]?.username) || rtcUserId;
        const channelId = `course_${courseId}`;
        const timestamp = Math.floor(Date.now() / 1000);
        const authInfo = (0, aliyunRtc_1.createAliRtcAuthInfo)({
            appId: runtime.appId,
            appKey: runtime.appKey,
            channelId,
            userId: rtcUserId,
            timestamp,
            role: 'pub',
        });
        const durationHours = Number((Math.round(toNumber(sessionRow.duration_hours, 0) * 100) / 100).toFixed(2));
        const roleInSession = isMentorInSession ? 'mentor' : 'student';
        return res.json({
            authInfo,
            userName,
            session: {
                courseId: String(courseId),
                status,
                startsAt: toIsoString(sessionRow.starts_at),
                durationHours,
                roleInSession,
            },
        });
    }
    catch (e) {
        if (isMissingSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('RTC classroom auth error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
