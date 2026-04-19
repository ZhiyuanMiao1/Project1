import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowRight, FiClock, FiX } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import {
  COURSE_TYPE_ID_TO_LABEL,
  normalizeCourseLabel,
} from '../../constants/courseMappings';
import { useI18n } from '../../i18n/language';
import { getAuthToken, getAuthUser } from '../../utils/authStorage';
import {
  formatCourseReminderClock,
  getActiveCourseReminder,
  getClassroomCourseIdFromPath,
  getCourseReminderEndMs,
  getCourseReminderStartMs,
  markCourseReminderHandled,
  normalizeCourseReminderCourse,
  normalizeCourseReminderId,
  readHandledCourseReminderIds,
  safeText,
} from '../../utils/courseStartReminder';
import './CourseStartReminder.css';

const COURSE_REMINDER_POLL_MS = 30000;
const COURSE_REMINDER_TICK_MS = 1000;

const getCurrentUserId = () => {
  const user = getAuthUser();
  const id = normalizeCourseReminderId(user?.id);
  return id || 'current';
};

const mergeCoursesById = (courses) => {
  const map = new Map();
  courses.forEach((course) => {
    const id = normalizeCourseReminderId(course?.id);
    if (!id || map.has(id)) return;
    map.set(id, course);
  });
  return Array.from(map.values());
};

const fetchReminderCourses = async () => {
  const results = await Promise.allSettled([
    api.get('/api/courses', { params: { view: 'student' } }),
    api.get('/api/courses', { params: { view: 'mentor' } }),
  ]);

  const courses = [];
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const rows = Array.isArray(result.value?.data?.courses) ? result.value.data.courses : [];
    const roleInCourse = index === 1 ? 'mentor' : 'student';
    rows.forEach((row) => courses.push(normalizeCourseReminderCourse(row, roleInCourse)));
  });

  return mergeCoursesById(courses);
};

const formatSessionTime = (value, language = 'zh-CN') => {
  const text = safeText(value);
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

function CourseStartReminderDialog({ course, now, onClose, onEnter }) {
  const { language, t, getCourseDirectionDisplayLabel, getCourseTypeLabel } = useI18n();
  const startMs = getCourseReminderStartMs(course);
  const endMs = getCourseReminderEndMs(course);
  const hasStarted = Number.isFinite(startMs) && now >= startMs;
  const clockValue = hasStarted
    ? formatCourseReminderClock(now - startMs)
    : formatCourseReminderClock(startMs - now);
  const remainingText = Number.isFinite(endMs)
    ? formatCourseReminderClock(endMs - now)
    : '';

  const courseTitle = useMemo(() => {
    const normalized = normalizeCourseLabel(course?.courseDirectionId);
    return getCourseDirectionDisplayLabel(
      course?.courseDirectionId,
      normalized || safeText(course?.title) || t('courseReminder.courseFallback', '课程')
    );
  }, [course?.courseDirectionId, course?.title, getCourseDirectionDisplayLabel, t]);

  const courseType = useMemo(() => {
    const courseTypeId = safeText(course?.courseTypeId);
    return getCourseTypeLabel(courseTypeId, COURSE_TYPE_ID_TO_LABEL[courseTypeId] || '');
  }, [course?.courseTypeId, getCourseTypeLabel]);

  if (!course) return null;

  const participantFallback = course?.roleInCourse === 'mentor'
    ? t('courseReminder.student', '学生')
    : t('courseReminder.mentor', '导师');
  const participantName = safeText(course?.counterpartName) || participantFallback;
  const title = hasStarted
    ? t('courseReminder.startedTitle', '课程已开始')
    : t('courseReminder.upcomingTitle', '课程即将开始');
  const clockLabel = hasStarted
    ? t('courseReminder.elapsedLabel', '已开始')
    : t('courseReminder.countdownLabel', '距离开始');

  return (
    <div className="course-start-reminder-overlay" role="presentation">
      <div
        className="course-start-reminder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-start-reminder-title"
      >
        <button
          type="button"
          className="course-start-reminder-close"
          aria-label={t('courseReminder.close', '关闭课程提醒')}
          title={t('courseReminder.close', '关闭课程提醒')}
          onClick={onClose}
        >
          <FiX size={20} aria-hidden="true" />
        </button>

        <div className="course-start-reminder-kicker">
          <FiClock size={16} aria-hidden="true" />
          <span>{t('courseReminder.kicker', '课程提醒')}</span>
        </div>

        <h2 id="course-start-reminder-title" className="course-start-reminder-title">
          {title}
        </h2>

        <div className="course-start-reminder-clock" aria-label={`${clockLabel} ${clockValue}`}>
          <span className="course-start-reminder-clock-label">{clockLabel}</span>
          <span className="course-start-reminder-clock-value">{clockValue}</span>
        </div>

        <div className="course-start-reminder-details">
          <div className="course-start-reminder-course">
            {courseTitle}
            {courseType ? <span> · {courseType}</span> : null}
          </div>
          <div className="course-start-reminder-meta">
            <span>{formatSessionTime(course?.startsAt, language)}</span>
            <span>{participantFallback}: {participantName}</span>
          </div>
          {hasStarted && remainingText ? (
            <div className="course-start-reminder-remaining">
              {t('courseReminder.remaining', `预计剩余 ${remainingText}`, { time: remainingText })}
            </div>
          ) : null}
        </div>

        <div className="course-start-reminder-actions">
          <button
            type="button"
            className="course-start-reminder-btn course-start-reminder-btn--ghost"
            onClick={onClose}
          >
            {t('courseReminder.dismiss', '知道了')}
          </button>
          <button
            type="button"
            className="course-start-reminder-btn course-start-reminder-btn--primary"
            onClick={onEnter}
          >
            <span>{t('courseReminder.enter', '进入课堂')}</span>
            <FiArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseStartReminderGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestIdRef = useRef(0);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(getAuthToken()));
  const [userId, setUserId] = useState(getCurrentUserId);
  const [courses, setCourses] = useState([]);
  const [handledCourseIds, setHandledCourseIds] = useState(() => readHandledCourseReminderIds(getCurrentUserId()));
  const [now, setNow] = useState(() => Date.now());

  const syncHandledCourseIds = useCallback((nextUserId = getCurrentUserId()) => {
    setUserId(nextUserId);
    setHandledCourseIds(readHandledCourseReminderIds(nextUserId));
  }, []);

  const refreshCourses = useCallback(async () => {
    if (!getAuthToken()) {
      setCourses([]);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const nextCourses = await fetchReminderCourses();
      if (requestIdRef.current === requestId) {
        setCourses(nextCourses);
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setCourses([]);
      }
    }
  }, []);

  useEffect(() => {
    const handleAuthChanged = () => {
      const loggedIn = Boolean(getAuthToken());
      setIsLoggedIn(loggedIn);
      if (!loggedIn) {
        setCourses([]);
        setHandledCourseIds(new Set());
        return;
      }
      syncHandledCourseIds(getCurrentUserId());
      refreshCourses();
    };

    window.addEventListener('auth:changed', handleAuthChanged);
    return () => window.removeEventListener('auth:changed', handleAuthChanged);
  }, [refreshCourses, syncHandledCourseIds]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    refreshCourses();
    const intervalId = window.setInterval(refreshCourses, COURSE_REMINDER_POLL_MS);
    const handleFocus = () => refreshCourses();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshCourses();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoggedIn, refreshCourses]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), COURSE_REMINDER_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const openedCourseId = getClassroomCourseIdFromPath(location.pathname);
    if (!openedCourseId) return;
    const next = markCourseReminderHandled(userId, openedCourseId);
    setHandledCourseIds(next);
  }, [isLoggedIn, location.pathname, userId]);

  const activeCourse = useMemo(() => getActiveCourseReminder({
    courses,
    now,
    pathname: location.pathname,
    handledCourseIds,
  }), [courses, handledCourseIds, location.pathname, now]);

  const handleClose = useCallback(() => {
    const courseId = normalizeCourseReminderId(activeCourse?.id);
    if (!courseId) return;
    const next = markCourseReminderHandled(userId, courseId);
    setHandledCourseIds(next);
  }, [activeCourse?.id, userId]);

  const handleEnter = useCallback(() => {
    const courseId = normalizeCourseReminderId(activeCourse?.id);
    if (!courseId) return;
    const next = markCourseReminderHandled(userId, courseId);
    setHandledCourseIds(next);
    navigate(`/classroom/${encodeURIComponent(courseId)}`);
  }, [activeCourse?.id, navigate, userId]);

  if (!isLoggedIn || !activeCourse) return null;

  return (
    <CourseStartReminderDialog
      course={activeCourse}
      now={now}
      onClose={handleClose}
      onEnter={handleEnter}
    />
  );
}

export default CourseStartReminderGate;
