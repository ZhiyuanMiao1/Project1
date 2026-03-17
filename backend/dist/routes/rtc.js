"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const aliyunRtc_1 = require("../services/aliyunRtc");
const router = (0, express_1.Router)();
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const CLASSROOM_PRESENCE_TTL_MS = 4500;
const classroomPresenceStore = new Map();
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const normalizeDbDateAsUtc = (value) => new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds()));
const parseStoredUtcDate = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime()))
        return normalizeDbDateAsUtc(raw);
    const text = safeText(raw);
    if (!text)
        return null;
    const canonical = text
        .replace('T', ' ')
        .replace(/Z$/i, '')
        .replace(/\.\d+$/, '')
        .trim();
    const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match;
        const year = Number.parseInt(yearText, 10);
        const month = Number.parseInt(monthText, 10);
        const day = Number.parseInt(dayText, 10);
        const hour = Number.parseInt(hourText, 10);
        const minute = Number.parseInt(minuteText, 10);
        const second = Number.parseInt(secondText, 10);
        if ([year, month, day, hour, minute, second].every(Number.isFinite)) {
            return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        }
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toIsoString = (raw) => {
    const parsed = parseStoredUtcDate(raw);
    if (!parsed)
        return '';
    return parsed.toISOString();
};
const getEffectiveCourseStatus = (row) => {
    const status = safeText(row?.status).toLowerCase();
    if (status !== 'scheduled')
        return status;
    const startsAt = parseStoredUtcDate(row?.starts_at);
    if (!startsAt || Number.isNaN(startsAt.getTime()))
        return status;
    const durationHours = Math.max(toNumber(row?.duration_hours, 0), 0);
    const endTimestamp = startsAt.getTime() + durationHours * 60 * 60 * 1000;
    if (endTimestamp <= Date.now())
        return 'completed';
    return status;
};
const isMissingSchemaError = (err) => {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR')
        return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('course_sessions') || message.includes('user_roles') || message.includes('users');
};
const pruneClassroomPresence = (courseId) => {
    const now = Date.now();
    const targetCourseIds = courseId ? [courseId] : Array.from(classroomPresenceStore.keys());
    targetCourseIds.forEach((currentCourseId) => {
        const entries = classroomPresenceStore.get(currentCourseId);
        if (!entries)
            return;
        entries.forEach((entry, publicId) => {
            if (now - entry.lastSeenAt > CLASSROOM_PRESENCE_TTL_MS) {
                entries.delete(publicId);
            }
        });
        if (entries.size === 0) {
            classroomPresenceStore.delete(currentCourseId);
        }
    });
};
const touchClassroomPresence = (courseId, entry) => {
    pruneClassroomPresence(courseId);
    let entries = classroomPresenceStore.get(courseId);
    if (!entries) {
        entries = new Map();
        classroomPresenceStore.set(courseId, entries);
    }
    entries.set(entry.publicId, entry);
};
const removeClassroomPresence = (courseId, publicId) => {
    const entries = classroomPresenceStore.get(courseId);
    if (!entries)
        return;
    entries.delete(publicId);
    if (entries.size === 0) {
        classroomPresenceStore.delete(courseId);
    }
};
const getClassroomPresencePayload = (context) => {
    const courseKey = String(context.courseId);
    pruneClassroomPresence(courseKey);
    const entries = classroomPresenceStore.get(courseKey);
    const selfPresence = entries?.get(context.selfUserPublicId) || null;
    const remotePresence = entries?.get(context.remoteUserPublicId) || null;
    return {
        selfPresent: Boolean(selfPresence),
        selfScreenSharing: Boolean(selfPresence?.screenSharing),
        remotePresent: Boolean(remotePresence),
        remoteScreenSharing: Boolean(remotePresence?.screenSharing),
        remoteUserId: context.remoteUserPublicId,
        remoteUserName: context.remoteUserName,
        remoteLastSeenAt: remotePresence ? new Date(remotePresence.lastSeenAt).toISOString() : '',
    };
};
const loadAuthorizedClassroomContext = async (courseId, currentUserId) => {
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
        throw new HttpError(404, '课程不存在');
    const studentUserId = toNumber(sessionRow.student_user_id, 0);
    const mentorUserId = toNumber(sessionRow.mentor_user_id, 0);
    const isStudentInSession = currentUserId === studentUserId;
    const isMentorInSession = currentUserId === mentorUserId;
    if (!isStudentInSession && !isMentorInSession) {
        throw new HttpError(403, '无权限进入该课程课堂');
    }
    const status = getEffectiveCourseStatus(sessionRow);
    if (status !== 'scheduled') {
        throw new HttpError(409, '非 scheduled 课程不可进入课堂');
    }
    const roleRows = await (0, db_1.query)(`
    SELECT user_id, role, public_id
    FROM user_roles
    WHERE (user_id = ? AND role = 'student')
       OR (user_id = ? AND role = 'mentor')
    `, [studentUserId, mentorUserId]);
    const userRows = await (0, db_1.query)(`
    SELECT id, username
    FROM users
    WHERE id IN (?, ?)
    `, [studentUserId, mentorUserId]);
    const rolePublicIdMap = new Map();
    roleRows.forEach((row) => {
        const userId = toNumber(row.user_id, 0);
        const role = safeText(row.role).toLowerCase();
        const publicId = safeText(row.public_id);
        if (!userId || !role || !publicId)
            return;
        rolePublicIdMap.set(`${userId}:${role}`, publicId);
    });
    const studentPublicId = rolePublicIdMap.get(`${studentUserId}:student`) || `s${studentUserId}`;
    const mentorPublicId = rolePublicIdMap.get(`${mentorUserId}:mentor`) || `m${mentorUserId}`;
    const userNameMap = new Map();
    userRows.forEach((row) => {
        const userId = toNumber(row.id, 0);
        const userName = safeText(row.username);
        if (!userId || !userName)
            return;
        userNameMap.set(userId, userName);
    });
    const roleInSession = isMentorInSession ? 'mentor' : 'student';
    const remoteRole = isMentorInSession ? 'student' : 'mentor';
    const selfUserPublicId = isMentorInSession ? mentorPublicId : studentPublicId;
    const remoteUserPublicId = isMentorInSession ? studentPublicId : mentorPublicId;
    const selfUserName = userNameMap.get(currentUserId) || selfUserPublicId;
    const remoteUserName = isMentorInSession
        ? (userNameMap.get(studentUserId) || studentPublicId)
        : (userNameMap.get(mentorUserId) || mentorPublicId);
    return {
        courseId,
        status,
        startsAt: toIsoString(sessionRow.starts_at),
        durationHours: Number((Math.round(toNumber(sessionRow.duration_hours, 0) * 100) / 100).toFixed(2)),
        roleInSession,
        remoteRole,
        selfUserPublicId,
        remoteUserPublicId,
        selfUserName,
        remoteUserName,
        roomId: `course_${courseId}`,
    };
};
router.get('/classrooms/:courseId/auth', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未登录' });
    const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
    if (!Number.isFinite(courseId) || courseId <= 0) {
        return res.status(400).json({ error: '无效课程ID' });
    }
    const runtime = (0, aliyunRtc_1.getAliyunLiveRuntimeConfig)();
    if (!runtime) {
        return res.status(500).json({ error: '实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY' });
    }
    try {
        const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
        const timestamp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const selfStreamAuth = (0, aliyunRtc_1.createAliyunLiveStreamAuthInfo)({
            appId: runtime.appId,
            appKey: runtime.appKey,
            roomId: context.roomId,
            userId: context.selfUserPublicId,
            timestamp,
        });
        const remoteStreamAuth = (0, aliyunRtc_1.createAliyunLiveStreamAuthInfo)({
            appId: runtime.appId,
            appKey: runtime.appKey,
            roomId: context.roomId,
            userId: context.remoteUserPublicId,
            timestamp,
        });
        return res.json({
            liveAuth: {
                mode: 'aliyun-live-artc',
                sdkAppId: runtime.appId,
                roomId: selfStreamAuth.roomId,
                selfUserId: selfStreamAuth.userId,
                remoteUserId: remoteStreamAuth.userId,
                pushUrl: selfStreamAuth.pushUrl,
                selfPlayUrl: selfStreamAuth.playUrl,
                remotePlayUrl: remoteStreamAuth.playUrl,
                expiresAt: new Date(timestamp * 1000).toISOString(),
            },
            userName: context.selfUserName,
            session: {
                courseId: String(courseId),
                status: context.status,
                startsAt: context.startsAt,
                durationHours: context.durationHours,
                roleInSession: context.roleInSession,
                remoteRole: context.remoteRole,
                remoteUserName: context.remoteUserName,
            },
        });
    }
    catch (e) {
        if (e instanceof HttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if (isMissingSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Live classroom auth error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.post('/classrooms/:courseId/presence', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未登录' });
    const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
    if (!Number.isFinite(courseId) || courseId <= 0) {
        return res.status(400).json({ error: '无效课程ID' });
    }
    try {
        const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
        const screenSharing = Boolean(req.body?.screenSharing);
        touchClassroomPresence(String(courseId), {
            publicId: context.selfUserPublicId,
            userName: context.selfUserName,
            role: context.roleInSession,
            lastSeenAt: Date.now(),
            screenSharing,
        });
        return res.json(getClassroomPresencePayload(context));
    }
    catch (e) {
        if (e instanceof HttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if (isMissingSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Live classroom presence heartbeat error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
router.delete('/classrooms/:courseId/presence', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未登录' });
    const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
    if (!Number.isFinite(courseId) || courseId <= 0) {
        return res.status(400).json({ error: '无效课程ID' });
    }
    try {
        const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
        removeClassroomPresence(String(courseId), context.selfUserPublicId);
        return res.status(204).end();
    }
    catch (e) {
        if (e instanceof HttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if (isMissingSchemaError(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Live classroom presence leave error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
