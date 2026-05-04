const REMINDER_LEAD_MS = 5 * 60 * 1000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const STORAGE_PREFIX = 'mentory.courseStartReminder.handled.v2';

export const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const normalizeCourseReminderId = (value) => {
  const text = safeText(String(value ?? ''));
  return text || '';
};

export const getCourseReminderStartMs = (course) => {
  const startsAt = safeText(course?.startsAt || course?.starts_at);
  if (!startsAt) return NaN;
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) ? timestamp : NaN;
};

export const getCourseReminderDurationMs = (course) => {
  const raw = course?.durationHours ?? course?.duration_hours;
  const hours = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_DURATION_MS;
  return hours * 60 * 60 * 1000;
};

export const getCourseReminderEndMs = (course) => {
  const startMs = getCourseReminderStartMs(course);
  if (!Number.isFinite(startMs)) return NaN;
  return startMs + getCourseReminderDurationMs(course);
};

export const isClassroomPathForCourse = (pathname, courseId) => {
  const normalizedId = normalizeCourseReminderId(courseId);
  if (!normalizedId) return false;
  const path = safeText(pathname);
  const match = path.match(/^\/classroom\/([^/?#]+)/);
  if (!match) return false;
  try {
    return decodeURIComponent(match[1]) === normalizedId;
  } catch {
    return match[1] === normalizedId;
  }
};

export const getClassroomCourseIdFromPath = (pathname) => {
  const path = safeText(pathname);
  const match = path.match(/^\/classroom\/([^/?#]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export const getCourseReminderStorageKey = (userId) => {
  const normalizedUserId = normalizeCourseReminderId(userId) || 'current';
  return `${STORAGE_PREFIX}.${normalizedUserId}`;
};

export const readHandledCourseReminderIds = (userId) => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(getCourseReminderStorageKey(userId));
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(normalizeCourseReminderId).filter(Boolean));
  } catch {
    return new Set();
  }
};

export const writeHandledCourseReminderIds = (userId, ids) => {
  if (typeof window === 'undefined') return;
  try {
    const normalizedIds = Array.from(ids || []).map(normalizeCourseReminderId).filter(Boolean).slice(-500);
    window.localStorage.setItem(getCourseReminderStorageKey(userId), JSON.stringify(normalizedIds));
  } catch {}
};

export const markCourseReminderHandled = (userId, courseId) => {
  const normalizedId = normalizeCourseReminderId(courseId);
  if (!normalizedId) return new Set();
  const next = readHandledCourseReminderIds(userId);
  next.add(normalizedId);
  writeHandledCourseReminderIds(userId, next);
  return next;
};

export const normalizeCourseReminderCourse = (row, roleInCourse) => {
  const id = normalizeCourseReminderId(row?.id);
  return {
    id,
    roleInCourse: roleInCourse === 'mentor' ? 'mentor' : 'student',
    courseDirectionId: safeText(row?.courseDirectionId || row?.course_direction || row?.title),
    courseTypeId: safeText(row?.courseTypeId || row?.course_type),
    title: safeText(row?.title),
    startsAt: safeText(row?.startsAt || row?.starts_at),
    durationHours: row?.durationHours ?? row?.duration_hours,
    status: safeText(row?.status).toLowerCase(),
    counterpartName: safeText(row?.counterpartName || row?.mentorName || row?.studentName || row?.counterpartPublicId),
    counterpartAvatarUrl: safeText(row?.counterpartAvatarUrl || row?.mentorAvatar || row?.studentAvatar),
  };
};

export const getActiveCourseReminder = ({
  courses,
  now = Date.now(),
  pathname = '',
  handledCourseIds = new Set(),
} = {}) => {
  if (!Array.isArray(courses) || !courses.length) return null;

  const activeCourses = courses
    .filter((course) => {
      const courseId = normalizeCourseReminderId(course?.id);
      if (!courseId || handledCourseIds.has(courseId)) return false;
      if (isClassroomPathForCourse(pathname, courseId)) return false;

      const status = safeText(course?.status).toLowerCase();
      if (status && status !== 'scheduled') return false;

      const startMs = getCourseReminderStartMs(course);
      const endMs = getCourseReminderEndMs(course);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

      return now >= startMs - REMINDER_LEAD_MS && now < endMs;
    })
    .sort((a, b) => getCourseReminderStartMs(a) - getCourseReminderStartMs(b));

  return activeCourses[0] || null;
};

export const formatCourseReminderClock = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad2 = (value) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(minutes)}:${pad2(seconds)}`;
};

export const COURSE_REMINDER_LEAD_MS = REMINDER_LEAD_MS;
