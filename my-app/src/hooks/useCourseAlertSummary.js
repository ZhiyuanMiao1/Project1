import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { getAuthToken, getAuthUser } from '../utils/authStorage';

export const COURSE_ALERT_CHANGED_EVENT = 'courses:alert-changed';

const COURSE_ALERT_POLL_INTERVAL_MS = 12000;

const normalizeCourseId = (value) => {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const getCurrentUserId = () => {
  const user = getAuthUser();
  const id = Number(user?.id);
  return Number.isFinite(id) && id > 0 ? String(id) : '';
};

const buildSeenStorageKey = (view, userId) => {
  const normalizedView = typeof view === 'string' ? view.trim().toLowerCase() : '';
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedView || !normalizedUserId) return '';
  return `mx:courses:last-seen:${normalizedView}:${normalizedUserId}`;
};

const readLastSeenCourseId = (view, userId) => {
  const storageKey = buildSeenStorageKey(view, userId);
  if (!storageKey) return 0;
  try {
    return normalizeCourseId(window.localStorage.getItem(storageKey));
  } catch {
    return 0;
  }
};

const writeLastSeenCourseId = (view, userId, lastSeenCourseId) => {
  const storageKey = buildSeenStorageKey(view, userId);
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, String(Math.max(0, normalizeCourseId(lastSeenCourseId))));
  } catch {}
};

const getMaxCourseId = (courses) => {
  if (!Array.isArray(courses) || courses.length === 0) return 0;
  return courses.reduce((max, course) => {
    const courseId = normalizeCourseId(course?.id);
    return courseId > max ? courseId : max;
  }, 0);
};

const getNewCourseCount = (courses, lastSeenCourseId) => {
  if (!Array.isArray(courses) || courses.length === 0) return 0;
  const baselineId = normalizeCourseId(lastSeenCourseId);
  return courses.reduce((count, course) => {
    return count + (normalizeCourseId(course?.id) > baselineId ? 1 : 0);
  }, 0);
};

export const emitCourseAlertChanged = (detail = {}) => {
  try {
    window.dispatchEvent(new CustomEvent(COURSE_ALERT_CHANGED_EVENT, { detail }));
  } catch {}
};

export const markCoursesAsSeen = ({ view, courses = [], userId = getCurrentUserId() } = {}) => {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!view || !normalizedUserId) return 0;
  const maxCourseId = getMaxCourseId(courses);
  writeLastSeenCourseId(view, normalizedUserId, maxCourseId);
  emitCourseAlertChanged({
    view,
    userId: normalizedUserId,
    newCourseCount: 0,
    lastSeenCourseId: maxCourseId,
  });
  return maxCourseId;
};

export default function useCourseAlertSummary({ enabled = true, view } = {}) {
  const [newCourseCount, setNewCourseCount] = useState(0);
  const requestIdRef = useRef(0);
  const userId = getCurrentUserId();

  const refresh = useCallback(async () => {
    if (!enabled || !view || !getAuthToken() || !userId) {
      setNewCourseCount(0);
      return 0;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const res = await api.get('/api/courses', { params: { view } });
      const rows = Array.isArray(res?.data?.courses) ? res.data.courses : [];
      const nextCount = getNewCourseCount(rows, readLastSeenCourseId(view, userId));
      if (requestIdRef.current === requestId) {
        setNewCourseCount(nextCount);
      }
      return nextCount;
    } catch (err) {
      if (requestIdRef.current === requestId) {
        const status = Number(err?.response?.status || 0);
        if (status === 401 || status === 403) setNewCourseCount(0);
      }
      return 0;
    }
  }, [enabled, userId, view]);

  useEffect(() => {
    if (!enabled || !view) {
      setNewCourseCount(0);
      return undefined;
    }

    refresh();

    const onCourseAlertChanged = (event) => {
      const eventView = typeof event?.detail?.view === 'string' ? event.detail.view.trim().toLowerCase() : '';
      const eventUserId = typeof event?.detail?.userId === 'string' ? event.detail.userId.trim() : '';
      if (eventView && eventView !== String(view).trim().toLowerCase()) return;
      if (eventUserId && userId && eventUserId !== userId) return;

      if (typeof event?.detail?.newCourseCount === 'number') {
        setNewCourseCount(Math.max(0, Math.floor(event.detail.newCourseCount)));
        return;
      }

      refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const onStorage = (event) => {
      const storageKey = buildSeenStorageKey(view, userId);
      if (!storageKey || event?.key !== storageKey) return;
      refresh();
    };

    const intervalId = window.setInterval(refresh, COURSE_ALERT_POLL_INTERVAL_MS);

    window.addEventListener(COURSE_ALERT_CHANGED_EVENT, onCourseAlertChanged);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(COURSE_ALERT_CHANGED_EVENT, onCourseAlertChanged);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, refresh, userId, view]);

  return {
    newCourseCount,
    refresh,
  };
}
