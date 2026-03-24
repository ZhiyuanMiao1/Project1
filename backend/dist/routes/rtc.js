"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const aliyunRtc_1 = require("../services/aliyunRtc");
const classroomAccess_1 = require("../services/classroomAccess");
const router = (0, express_1.Router)();
const CLASSROOM_PRESENCE_TTL_MS = 4500;
const classroomPresenceStore = new Map();
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
        const context = await (0, classroomAccess_1.loadAuthorizedClassroomContext)(courseId, req.user.id, { requireScheduled: true });
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
                threadId: context.threadId,
                roleInSession: context.roleInSession,
                remoteRole: context.remoteRole,
                remoteUserName: context.remoteUserName,
            },
        });
    }
    catch (e) {
        if (e instanceof classroomAccess_1.ClassroomHttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if ((0, classroomAccess_1.isMissingClassroomSchemaError)(e)) {
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
        const context = await (0, classroomAccess_1.loadAuthorizedClassroomContext)(courseId, req.user.id, { requireScheduled: true });
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
        if (e instanceof classroomAccess_1.ClassroomHttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if ((0, classroomAccess_1.isMissingClassroomSchemaError)(e)) {
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
        const context = await (0, classroomAccess_1.loadAuthorizedClassroomContext)(courseId, req.user.id, { requireScheduled: true });
        removeClassroomPresence(String(courseId), context.selfUserPublicId);
        return res.status(204).end();
    }
    catch (e) {
        if (e instanceof classroomAccess_1.ClassroomHttpError) {
            return res.status(e.statusCode).json({ error: e.message });
        }
        if ((0, classroomAccess_1.isMissingClassroomSchemaError)(e)) {
            return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
        }
        console.error('Live classroom presence leave error:', e);
        return res.status(500).json({ error: '服务器错误，请稍后再试' });
    }
});
exports.default = router;
