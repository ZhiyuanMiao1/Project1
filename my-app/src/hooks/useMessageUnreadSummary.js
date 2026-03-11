import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { getAuthToken } from '../utils/authStorage';

export const MESSAGE_UNREAD_CHANGED_EVENT = 'messages:unread-changed';

const SUMMARY_POLL_INTERVAL_MS = 12000;

const normalizeUnreadCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
};

export const emitMessageUnreadChanged = (detail = {}) => {
  try {
    window.dispatchEvent(new CustomEvent(MESSAGE_UNREAD_CHANGED_EVENT, { detail }));
  } catch {}
};

export default function useMessageUnreadSummary(enabled = true) {
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !getAuthToken()) {
      setTotalUnreadCount(0);
      return 0;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const res = await api.get('/api/messages/unread-summary');
      const nextCount = normalizeUnreadCount(res?.data?.totalUnreadCount);
      if (requestIdRef.current === requestId) {
        setTotalUnreadCount(nextCount);
      }
      return nextCount;
    } catch (err) {
      if (requestIdRef.current === requestId && err?.response?.status === 401) {
        setTotalUnreadCount(0);
      }
      return 0;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setTotalUnreadCount(0);
      return undefined;
    }

    refresh();

    const onUnreadChanged = (event) => {
      const nextCount = normalizeUnreadCount(event?.detail?.totalUnreadCount);
      if (typeof event?.detail?.totalUnreadCount === 'number') {
        setTotalUnreadCount(nextCount);
        return;
      }
      refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    const intervalId = window.setInterval(refresh, SUMMARY_POLL_INTERVAL_MS);

    window.addEventListener(MESSAGE_UNREAD_CHANGED_EVENT, onUnreadChanged);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(MESSAGE_UNREAD_CHANGED_EVENT, onUnreadChanged);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, refresh]);

  return {
    totalUnreadCount,
    refresh,
  };
}
