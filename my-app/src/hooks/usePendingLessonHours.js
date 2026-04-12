import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { getAuthToken } from '../utils/authStorage';

export const PENDING_LESSON_HOURS_CHANGED_EVENT = 'lesson-hours:pending-changed';

const PENDING_LESSON_HOURS_POLL_INTERVAL_MS = 4000;

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePendingLessonHoursItem = (item) => {
  if (!item || typeof item !== 'object') return null;

  const id = safeText(item?.id);
  if (!id) return null;

  const proposedHours = Number(item?.proposedHours);
  if (!Number.isFinite(proposedHours) || proposedHours <= 0) return null;

  return {
    id,
    threadId: safeText(item?.threadId),
    courseSessionId: safeText(item?.courseSessionId),
    proposedHours: Number(proposedHours.toFixed(2)),
    disputedHours: (() => {
      const n = Number(item?.disputedHours);
      return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
    })(),
    startsAt: safeText(item?.startsAt),
    courseDirectionId: safeText(item?.courseDirectionId),
    courseTypeId: safeText(item?.courseTypeId),
    mentorName: safeText(item?.mentorName) || '导师',
    mentorAvatarUrl: safeText(item?.mentorAvatarUrl),
    participantName: safeText(item?.participantName),
    participantAvatarUrl: safeText(item?.participantAvatarUrl),
    createdAt: safeText(item?.createdAt),
    actionRole: safeText(item?.actionRole) === 'mentor' ? 'mentor' : 'student',
    status: safeText(item?.status),
  };
};

export const emitPendingLessonHoursChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent(PENDING_LESSON_HOURS_CHANGED_EVENT));
  } catch {}
};

export default function usePendingLessonHours(enabled = true) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle');
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !getAuthToken()) {
      setItems([]);
      setStatus('idle');
      return [];
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setStatus((prev) => (prev === 'loaded' ? 'refreshing' : 'loading'));

    try {
      const res = await api.get('/api/messages/pending-lesson-hours');
      const nextItems = Array.isArray(res?.data?.items)
        ? res.data.items.map(normalizePendingLessonHoursItem).filter(Boolean)
        : [];

      if (requestIdRef.current === requestId) {
        setItems(nextItems);
        setStatus('loaded');
      }

      return nextItems;
    } catch (err) {
      if (requestIdRef.current === requestId) {
        if (err?.response?.status === 401) {
          setItems([]);
          setStatus('idle');
        } else {
          setStatus('error');
        }
      }
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setStatus('idle');
      return undefined;
    }

    refresh();

    const handleChanged = () => {
      refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const intervalId = window.setInterval(refresh, PENDING_LESSON_HOURS_POLL_INTERVAL_MS);

    window.addEventListener(PENDING_LESSON_HOURS_CHANGED_EVENT, handleChanged);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(PENDING_LESSON_HOURS_CHANGED_EVENT, handleChanged);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, refresh]);

  return {
    items,
    status,
    refresh,
  };
}
