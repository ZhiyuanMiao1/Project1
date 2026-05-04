import { query as dbQuery } from '../db';

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

export type SessionRole = 'student' | 'mentor';

export type AuthorizedClassroomContext = {
  courseId: number;
  status: string;
  startsAt: string;
  durationHours: number;
  threadId: string;
  roleInSession: SessionRole;
  remoteRole: SessionRole;
  selfUserPublicId: string;
  remoteUserPublicId: string;
  selfUserName: string;
  remoteUserName: string;
  roomId: string;
  studentUserId: number;
  mentorUserId: number;
};

export class ClassroomHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const parseStoredUtcDate = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(
      raw.getFullYear(),
      raw.getMonth(),
      raw.getDate(),
      raw.getHours(),
      raw.getMinutes(),
      raw.getSeconds(),
      raw.getMilliseconds(),
    ));
  }
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

export const toIsoString = (raw: unknown) => {
  const parsed = parseStoredUtcDate(raw);
  if (!parsed) return '';
  return parsed.toISOString();
};

export const getEffectiveCourseStatus = (row: CourseSessionRow) => {
  const status = safeText(row?.status).toLowerCase();
  if (status !== 'scheduled') return status;

  const startsAt = parseStoredUtcDate(row?.starts_at);
  if (!startsAt || Number.isNaN(startsAt.getTime())) return status;

  const durationHours = Math.max(toNumber(row?.duration_hours, 0), 0);
  const endTimestamp = startsAt.getTime() + durationHours * 60 * 60 * 1000;
  if (endTimestamp <= Date.now()) return 'completed';
  return status;
};

export const isMissingClassroomSchemaError = (err: any) => {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('course_sessions') || message.includes('user_roles') || message.includes('users');
};

export const isClassroomClosed = (context: AuthorizedClassroomContext | null | undefined) => (
  safeText(context?.status).toLowerCase() !== 'scheduled'
);

export const loadAuthorizedClassroomContext = async (
  courseId: number,
  currentUserId: number,
  options: { requireScheduled?: boolean } = {}
): Promise<AuthorizedClassroomContext> => {
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
  if (!sessionRow) throw new ClassroomHttpError(404, '课程不存在');

  const studentUserId = toNumber(sessionRow.student_user_id, 0);
  const mentorUserId = toNumber(sessionRow.mentor_user_id, 0);
  const isStudentInSession = currentUserId === studentUserId;
  const isMentorInSession = currentUserId === mentorUserId;
  if (!isStudentInSession && !isMentorInSession) {
    throw new ClassroomHttpError(403, '无权限进入该课程课堂');
  }

  const status = getEffectiveCourseStatus(sessionRow);
  if (options.requireScheduled && status !== 'scheduled') {
    throw new ClassroomHttpError(409, '非 scheduled 课程不可进入课堂');
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

  const threadRows = await dbQuery<{ id: number | string }[]>(
    `
    SELECT id
    FROM message_threads
    WHERE student_user_id = ? AND mentor_user_id = ?
    LIMIT 1
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

  const roleInSession: SessionRole = isMentorInSession ? 'mentor' : 'student';
  const remoteRole: SessionRole = isMentorInSession ? 'student' : 'mentor';
  const selfUserPublicId = isMentorInSession ? mentorPublicId : studentPublicId;
  const remoteUserPublicId = isMentorInSession ? studentPublicId : mentorPublicId;
  const selfUserName = userNameMap.get(currentUserId) || selfUserPublicId;
  const remoteUserName = isMentorInSession
    ? (userNameMap.get(studentUserId) || studentPublicId)
    : (userNameMap.get(mentorUserId) || mentorPublicId);
  const rawThreadId = threadRows?.[0]?.id;
  const threadId = Number.isFinite(Number(rawThreadId)) && Number(rawThreadId) > 0
    ? String(rawThreadId)
    : '';

  return {
    courseId,
    status,
    startsAt: toIsoString(sessionRow.starts_at),
    durationHours: Number((Math.round(toNumber(sessionRow.duration_hours, 0) * 100) / 100).toFixed(2)),
    threadId,
    roleInSession,
    remoteRole,
    selfUserPublicId,
    remoteUserPublicId,
    selfUserName,
    remoteUserName,
    roomId: `course_${courseId}`,
    studentUserId,
    mentorUserId,
  };
};
