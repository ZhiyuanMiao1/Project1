import { Request, Response, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createAliyunLiveStreamAuthInfo, getAliyunLiveRuntimeConfig } from '../services/aliyunRtc';
import {
  ClassroomRecordingPresenceEntry,
  getClassroomRecordingStatus,
  startClassroomRecording,
  stopClassroomRecordingIfIdle,
  updateClassroomRecordingLayout,
} from '../services/aliyunRtcRecording';
import {
  AuthorizedClassroomContext,
  ClassroomHttpError,
  isMissingClassroomSchemaError,
  loadClassroomObserverContext,
  loadAuthorizedClassroomContext,
  safeText,
} from '../services/classroomAccess';
import { verifyClassroomObserverToken } from '../services/classroomObserverToken';

const router = Router();

type ClassroomPresenceEntry = {
  publicId: string;
  userName: string;
  role: 'student' | 'mentor';
  lastSeenAt: number;
  screenSharing: boolean;
};

type ClassroomObserverPresenceEntry = {
  adminId: number;
  lastSeenAt: number;
};

const CLASSROOM_PRESENCE_TTL_MS = 4500;
const classroomPresenceStore = new Map<string, Map<string, ClassroomPresenceEntry>>();
const classroomObserverPresenceStore = new Map<string, Map<string, ClassroomObserverPresenceEntry>>();

const pruneClassroomPresence = (courseId?: string) => {
  const now = Date.now();
  const targetCourseIds = courseId ? [courseId] : Array.from(classroomPresenceStore.keys());

  targetCourseIds.forEach((currentCourseId) => {
    const entries = classroomPresenceStore.get(currentCourseId);
    if (!entries) return;

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

const pruneClassroomObserverPresence = (courseId?: string) => {
  const now = Date.now();
  const targetCourseIds = courseId ? [courseId] : Array.from(classroomObserverPresenceStore.keys());

  targetCourseIds.forEach((currentCourseId) => {
    const entries = classroomObserverPresenceStore.get(currentCourseId);
    if (!entries) return;

    entries.forEach((entry, key) => {
      if (now - entry.lastSeenAt > CLASSROOM_PRESENCE_TTL_MS) {
        entries.delete(key);
      }
    });

    if (entries.size === 0) {
      classroomObserverPresenceStore.delete(currentCourseId);
    }
  });
};

const touchClassroomPresence = (courseId: string, entry: ClassroomPresenceEntry) => {
  pruneClassroomPresence(courseId);

  let entries = classroomPresenceStore.get(courseId);
  if (!entries) {
    entries = new Map<string, ClassroomPresenceEntry>();
    classroomPresenceStore.set(courseId, entries);
  }

  entries.set(entry.publicId, entry);
};

const removeClassroomPresence = (courseId: string, publicId: string) => {
  const entries = classroomPresenceStore.get(courseId);
  if (!entries) return 0;

  entries.delete(publicId);
  if (entries.size === 0) {
    classroomPresenceStore.delete(courseId);
  }
  return entries.size;
};

const touchClassroomObserverPresence = (courseId: string, adminId: number) => {
  pruneClassroomObserverPresence(courseId);

  let entries = classroomObserverPresenceStore.get(courseId);
  if (!entries) {
    entries = new Map<string, ClassroomObserverPresenceEntry>();
    classroomObserverPresenceStore.set(courseId, entries);
  }

  entries.set(String(adminId), { adminId, lastSeenAt: Date.now() });
};

const removeClassroomObserverPresence = (courseId: string, adminId: number) => {
  const entries = classroomObserverPresenceStore.get(courseId);
  if (!entries) return 0;

  entries.delete(String(adminId));
  if (entries.size === 0) {
    classroomObserverPresenceStore.delete(courseId);
  }
  return entries.size;
};

const getClassroomObserverCount = (courseId: number | string) => {
  const courseKey = String(courseId);
  pruneClassroomObserverPresence(courseKey);
  return classroomObserverPresenceStore.get(courseKey)?.size || 0;
};

const getClassroomPresenceEntries = (context: AuthorizedClassroomContext): ClassroomRecordingPresenceEntry[] => {
  const courseKey = String(context.courseId);
  pruneClassroomPresence(courseKey);

  const entries = classroomPresenceStore.get(courseKey);
  if (!entries) return [];

  return Array.from(entries.values()).map((entry) => ({
    publicId: entry.publicId,
    role: entry.role,
    lastSeenAt: entry.lastSeenAt,
    screenSharing: entry.screenSharing,
  }));
};

const getClassroomPresencePayload = (context: AuthorizedClassroomContext) => {
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
    observerCount: getClassroomObserverCount(context.courseId),
  };
};

router.get('/classrooms/:courseId/auth', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  const runtime = getAliyunLiveRuntimeConfig();
  if (!runtime) {
    return res.status(500).json({ error: '实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id, { requireScheduled: true });
    const timestamp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const selfStreamAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId: context.roomId,
      userId: context.selfUserPublicId,
      timestamp,
    });
    const remoteStreamAuth = createAliyunLiveStreamAuthInfo({
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
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom auth error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/classrooms/:courseId/observer-auth', async (req: Request, res: Response) => {
  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  const observer = verifyClassroomObserverToken(req.query.observerToken, courseId);
  if (!observer) return res.status(401).json({ error: '旁听链接已失效，请从后台重新进入' });

  const runtime = getAliyunLiveRuntimeConfig();
  if (!runtime) {
    return res.status(500).json({ error: '实时音视频配置缺失，请检查 ALIYUN_LIVE_ARTC_APP_ID / ALIYUN_LIVE_ARTC_APP_KEY' });
  }

  try {
    const context = await loadClassroomObserverContext(courseId);
    const timestamp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const studentStreamAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId: context.roomId,
      userId: context.studentPublicId,
      timestamp,
    });
    const mentorStreamAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId: context.roomId,
      userId: context.mentorPublicId,
      timestamp,
    });

    return res.json({
      liveAuth: {
        mode: 'readonly-observer',
        sdkAppId: runtime.appId,
        roomId: context.roomId,
        selfUserId: context.studentPublicId,
        remoteUserId: context.mentorPublicId,
        selfPlayUrl: studentStreamAuth.playUrl,
        remotePlayUrl: mentorStreamAuth.playUrl,
        expiresAt: new Date(timestamp * 1000).toISOString(),
      },
      userName: '平台旁听',
      session: {
        courseId: String(courseId),
        status: context.status,
        startsAt: context.startsAt,
        durationHours: context.durationHours,
        threadId: '',
        roleInSession: 'observer',
        remoteRole: 'mentor',
        observerMode: true,
        studentUserName: context.studentUserName,
        mentorUserName: context.mentorUserName,
        remoteUserName: context.mentorUserName,
      },
    });
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom observer auth error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/classrooms/:courseId/presence', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id, { requireScheduled: true });
    const screenSharing = Boolean(req.body?.screenSharing);
    const currentEntries = classroomPresenceStore.get(String(courseId));
    const previous = currentEntries?.get(context.selfUserPublicId) || null;
    const screenSharingChanged = Boolean(previous?.screenSharing) !== screenSharing;

    touchClassroomPresence(String(courseId), {
      publicId: context.selfUserPublicId,
      userName: context.selfUserName,
      role: context.roleInSession,
      lastSeenAt: Date.now(),
      screenSharing,
    });

    if (screenSharingChanged) {
      void updateClassroomRecordingLayout(context, getClassroomPresenceEntries(context));
    }

    return res.json(getClassroomPresencePayload(context));
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom presence heartbeat error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/classrooms/:courseId/observer-presence', async (req: Request, res: Response) => {
  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  const observer = verifyClassroomObserverToken(req.body?.observerToken || req.query.observerToken, courseId);
  if (!observer) return res.status(401).json({ error: '旁听链接已失效，请从后台重新进入' });

  try {
    await loadClassroomObserverContext(courseId);
    touchClassroomObserverPresence(String(courseId), observer.adminId);
    return res.json({
      observerPresent: true,
      observerCount: getClassroomObserverCount(courseId),
    });
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom observer presence heartbeat error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.delete('/classrooms/:courseId/presence', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id, { requireScheduled: true });
    const remainingCount = removeClassroomPresence(String(courseId), context.selfUserPublicId);
    void stopClassroomRecordingIfIdle(context, remainingCount);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom presence leave error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.delete('/classrooms/:courseId/observer-presence', async (req: Request, res: Response) => {
  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  const observer = verifyClassroomObserverToken(req.body?.observerToken || req.query.observerToken, courseId);
  if (!observer) return res.status(204).end();

  removeClassroomObserverPresence(String(courseId), observer.adminId);
  return res.status(204).end();
});

router.post('/classrooms/:courseId/recording/start', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id, { requireScheduled: true });
    const recording = await startClassroomRecording(
      context,
      req.user.id,
      getClassroomPresenceEntries(context)
    );
    return res.json({ recording });
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('ARTC cloud recording start error:', e);
    return res.status(500).json({ error: safeText((e as any)?.message) || '云端录制启动失败' });
  }
});

router.get('/classrooms/:courseId/recording/status', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课程ID' });
  }

  try {
    await loadAuthorizedClassroomContext(courseId, req.user.id, { requireScheduled: true });
    const recording = await getClassroomRecordingStatus(courseId);
    return res.json({ recording });
  } catch (e) {
    if (e instanceof ClassroomHttpError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    if (isMissingClassroomSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('ARTC cloud recording status error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
