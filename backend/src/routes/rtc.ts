import { Request, Response, Router } from 'express';
import { query as dbQuery } from '../db';
import { requireAuth } from '../middleware/auth';
import { createAliyunLiveStreamAuthInfo, getAliyunLiveRuntimeConfig } from '../services/aliyunRtc';

const router = Router();

type CourseSessionRow = {
  id: number | string;
  status: string | null;
  starts_at: Date | string | null;
  duration_hours: number | string | null;
  student_user_id: number | string;
  mentor_user_id: number | string;
};

type RolePublicIdRow = {
  user_id: number | string;
  role: string | null;
  public_id: string | null;
};

type UserNameRow = {
  id: number | string;
  username: string | null;
};

const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeDbDateAsUtc = (value: Date) => new Date(Date.UTC(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  value.getHours(),
  value.getMinutes(),
  value.getSeconds(),
  value.getMilliseconds(),
));

const parseStoredUtcDate = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return normalizeDbDateAsUtc(raw);
  const text = safeText(raw);
  if (!text) return null;

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

const toIsoString = (raw: unknown) => {
  const parsed = parseStoredUtcDate(raw);
  if (!parsed) return '';
  return parsed.toISOString();
};

const getEffectiveCourseStatus = (row: CourseSessionRow) => {
  const status = safeText(row?.status).toLowerCase();
  if (status !== 'scheduled') return status;

  const startsAt = parseStoredUtcDate(row?.starts_at);
  if (!startsAt || Number.isNaN(startsAt.getTime())) return status;

  const durationHours = Math.max(toNumber(row?.duration_hours, 0), 0);
  const endTimestamp = startsAt.getTime() + durationHours * 60 * 60 * 1000;
  if (endTimestamp <= Date.now()) return 'completed';
  return status;
};

const isMissingSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('course_sessions') || message.includes('user_roles') || message.includes('users');
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
    const sessionRows = await dbQuery<CourseSessionRow[]>(
      `
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
      `,
      [courseId]
    );
    const sessionRow = sessionRows?.[0];
    if (!sessionRow) return res.status(404).json({ error: '课程不存在' });

    const studentUserId = toNumber(sessionRow.student_user_id, 0);
    const mentorUserId = toNumber(sessionRow.mentor_user_id, 0);
    const isStudentInSession = req.user.id === studentUserId;
    const isMentorInSession = req.user.id === mentorUserId;
    if (!isStudentInSession && !isMentorInSession) {
      return res.status(403).json({ error: '无权限进入该课程课堂' });
    }

    const status = getEffectiveCourseStatus(sessionRow);
    if (status !== 'scheduled') {
      return res.status(409).json({ error: '非 scheduled 课程不可进入课堂' });
    }

    const roleRows = await dbQuery<RolePublicIdRow[]>(
      `
      SELECT user_id, role, public_id
      FROM user_roles
      WHERE (user_id = ? AND role = 'student')
         OR (user_id = ? AND role = 'mentor')
      `,
      [studentUserId, mentorUserId]
    );

    const userRows = await dbQuery<UserNameRow[]>(
      `
      SELECT id, username
      FROM users
      WHERE id IN (?, ?)
      `,
      [studentUserId, mentorUserId]
    );

    const rolePublicIdMap = new Map<string, string>();
    roleRows.forEach((row) => {
      const userId = toNumber(row.user_id, 0);
      const role = safeText(row.role).toLowerCase();
      const publicId = safeText(row.public_id);
      if (!userId || !role || !publicId) return;
      rolePublicIdMap.set(`${userId}:${role}`, publicId);
    });

    const studentPublicId = rolePublicIdMap.get(`${studentUserId}:student`) || `s${studentUserId}`;
    const mentorPublicId = rolePublicIdMap.get(`${mentorUserId}:mentor`) || `m${mentorUserId}`;

    const userNameMap = new Map<number, string>();
    userRows.forEach((row) => {
      const userId = toNumber(row.id, 0);
      const userName = safeText(row.username);
      if (!userId || !userName) return;
      userNameMap.set(userId, userName);
    });

    const roleInSession = isMentorInSession ? 'mentor' : 'student';
    const remoteRole = isMentorInSession ? 'student' : 'mentor';
    const selfUserId = isMentorInSession ? mentorPublicId : studentPublicId;
    const remoteUserId = isMentorInSession ? studentPublicId : mentorPublicId;
    const selfUserName = userNameMap.get(req.user.id) || selfUserId;
    const remoteUserName = isMentorInSession
      ? (userNameMap.get(studentUserId) || studentPublicId)
      : (userNameMap.get(mentorUserId) || mentorPublicId);

    const roomId = `course_${courseId}`;
    const timestamp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const selfStreamAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId,
      userId: selfUserId,
      timestamp,
    });
    const remoteStreamAuth = createAliyunLiveStreamAuthInfo({
      appId: runtime.appId,
      appKey: runtime.appKey,
      roomId,
      userId: remoteUserId,
      timestamp,
    });

    const durationHours = Number((Math.round(toNumber(sessionRow.duration_hours, 0) * 100) / 100).toFixed(2));

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
      userName: selfUserName,
      session: {
        courseId: String(courseId),
        status,
        startsAt: toIsoString(sessionRow.starts_at),
        durationHours,
        roleInSession,
        remoteRole,
        remoteUserName,
      },
    });
  } catch (e) {
    if (isMissingSchemaError(e)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Live classroom auth error:', e);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
