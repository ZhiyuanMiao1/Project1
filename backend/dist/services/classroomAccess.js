"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAuthorizedClassroomContext = exports.isClassroomClosed = exports.isMissingClassroomSchemaError = exports.getEffectiveCourseStatus = exports.toIsoString = exports.parseStoredUtcDate = exports.toNumber = exports.safeText = exports.ClassroomHttpError = void 0;
const db_1 = require("../db");
class ClassroomHttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.ClassroomHttpError = ClassroomHttpError;
const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
exports.safeText = safeText;
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
exports.toNumber = toNumber;
const parseStoredUtcDate = (raw) => {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), raw.getHours(), raw.getMinutes(), raw.getSeconds(), raw.getMilliseconds()));
    }
    const text = (0, exports.safeText)(raw);
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
exports.parseStoredUtcDate = parseStoredUtcDate;
const toIsoString = (raw) => {
    const parsed = (0, exports.parseStoredUtcDate)(raw);
    if (!parsed)
        return '';
    return parsed.toISOString();
};
exports.toIsoString = toIsoString;
const getEffectiveCourseStatus = (row) => {
    const status = (0, exports.safeText)(row?.status).toLowerCase();
    if (status !== 'scheduled')
        return status;
    const startsAt = (0, exports.parseStoredUtcDate)(row?.starts_at);
    if (!startsAt || Number.isNaN(startsAt.getTime()))
        return status;
    const durationHours = Math.max((0, exports.toNumber)(row?.duration_hours, 0), 0);
    const endTimestamp = startsAt.getTime() + durationHours * 60 * 60 * 1000;
    if (endTimestamp <= Date.now())
        return 'completed';
    return status;
};
exports.getEffectiveCourseStatus = getEffectiveCourseStatus;
const isMissingClassroomSchemaError = (err) => {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR')
        return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('course_sessions') || message.includes('user_roles') || message.includes('users');
};
exports.isMissingClassroomSchemaError = isMissingClassroomSchemaError;
const isClassroomClosed = (context) => ((0, exports.safeText)(context?.status).toLowerCase() !== 'scheduled');
exports.isClassroomClosed = isClassroomClosed;
const loadAuthorizedClassroomContext = async (courseId, currentUserId, options = {}) => {
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
        throw new ClassroomHttpError(404, '课程不存在');
    const studentUserId = (0, exports.toNumber)(sessionRow.student_user_id, 0);
    const mentorUserId = (0, exports.toNumber)(sessionRow.mentor_user_id, 0);
    const isStudentInSession = currentUserId === studentUserId;
    const isMentorInSession = currentUserId === mentorUserId;
    if (!isStudentInSession && !isMentorInSession) {
        throw new ClassroomHttpError(403, '无权限进入该课程课堂');
    }
    const status = (0, exports.getEffectiveCourseStatus)(sessionRow);
    if (options.requireScheduled && status !== 'scheduled') {
        throw new ClassroomHttpError(409, '非 scheduled 课程不可进入课堂');
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
    const threadRows = await (0, db_1.query)(`
    SELECT id
    FROM message_threads
    WHERE student_user_id = ? AND mentor_user_id = ?
    LIMIT 1
    `, [studentUserId, mentorUserId]);
    const rolePublicIdMap = new Map();
    roleRows.forEach((row) => {
        const userId = (0, exports.toNumber)(row.user_id, 0);
        const role = (0, exports.safeText)(row.role).toLowerCase();
        const publicId = (0, exports.safeText)(row.public_id);
        if (!userId || !role || !publicId)
            return;
        rolePublicIdMap.set(`${userId}:${role}`, publicId);
    });
    const studentPublicId = rolePublicIdMap.get(`${studentUserId}:student`) || `s${studentUserId}`;
    const mentorPublicId = rolePublicIdMap.get(`${mentorUserId}:mentor`) || `m${mentorUserId}`;
    const userNameMap = new Map();
    userRows.forEach((row) => {
        const userId = (0, exports.toNumber)(row.id, 0);
        const userName = (0, exports.safeText)(row.username);
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
    const rawThreadId = threadRows?.[0]?.id;
    const threadId = Number.isFinite(Number(rawThreadId)) && Number(rawThreadId) > 0
        ? String(rawThreadId)
        : '';
    return {
        courseId,
        status,
        startsAt: (0, exports.toIsoString)(sessionRow.starts_at),
        durationHours: Number((Math.round((0, exports.toNumber)(sessionRow.duration_hours, 0) * 100) / 100).toFixed(2)),
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
exports.loadAuthorizedClassroomContext = loadAuthorizedClassroomContext;
