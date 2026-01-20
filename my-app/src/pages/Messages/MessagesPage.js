import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import api from '../../api/client';
import { useLocation } from 'react-router-dom';
import { getAuthToken } from '../../utils/authStorage';
import AppointmentCard from './AppointmentCard';
import { getCourseTitleParts, normalizeScheduleStatus } from './appointmentCardUtils';
import './MessagesPage.css';

const stripDisplaySuffix = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\s*(导师|老师|同学)\s*$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const getThreadCounterpartDisplayName = (thread) => {
  if (!thread) return '';
  if (typeof thread.counterpartId === 'string' && thread.counterpartId.trim()) {
    return thread.counterpartId.trim();
  }
  return stripDisplaySuffix(thread.counterpart);
};

const getThreadMyRole = (thread) => {
  const role = typeof thread?.myRole === 'string' ? thread.myRole.trim().toLowerCase() : '';
  return role === 'mentor' ? 'mentor' : 'student';
};

const buildScheduleCardsFromThread = (thread) => {
  if (!thread) return [];

  const history = Array.isArray(thread.scheduleHistory)
    ? thread.scheduleHistory
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({ ...item, __key: `history-${index}`, __primary: false }))
    : [];

  const main = thread.schedule && typeof thread.schedule === 'object'
    ? [{ ...thread.schedule, __key: 'main', __primary: true }]
    : [];

  return [...history, ...main];
};



const formatHoverTime = (rawValue) => {
  if (!rawValue) return '';
  const text = String(rawValue).trim();
  if (!text) return '';

  const now = new Date();
  const toDateLabel = (date) => `${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`;
  const timeMatch = text.match(/(\d{1,2}:\d{2})/);
  const timePart = timeMatch ? timeMatch[1] : '';

  const parsed = Date.parse(text);
  const looksLikeIso = /T\d{2}:\d{2}:\d{2}/.test(text) || /Z$/.test(text);
  if (!Number.isNaN(parsed) && looksLikeIso) {
    const dt = new Date(parsed);
    const pad2 = (n) => String(n).padStart(2, '0');
    const localTimePart = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

    const sameYmd = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (sameYmd(dt, now)) return localTimePart;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameYmd(dt, yesterday)) return `${toDateLabel(dt)} ${localTimePart}`;

    return `${toDateLabel(dt)} ${localTimePart}`;
  }

  if (text.startsWith('今天')) {
    const trimmed = text.replace(/^今天\s*/, '').trim();
    return timePart || trimmed || text;
  }

  if (text.startsWith('昨天')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const dateLabel = toDateLabel(d);
    return timePart ? `${dateLabel} ${timePart}` : dateLabel;
  }

  const weekMatch = text.match(/^(周[一二三四五六日天])/);
  if (weekMatch) {
    const map = { 周日: 0, 周天: 0, 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6 };
    const targetDay = map[weekMatch[1]];
    if (typeof targetDay === 'number') {
      const d = new Date(now);
      const currentDay = now.getDay();
      const diff = currentDay === targetDay ? 7 : (currentDay - targetDay + 7) % 7;
      d.setDate(d.getDate() - diff);
      const dateLabel = toDateLabel(d);
      return timePart ? `${dateLabel} ${timePart}` : dateLabel;
    }
  }

  const monthDayMatch = text.match(/(\d{1,2}月\d{1,2}日)/);
  if (monthDayMatch) {
    return timePart ? `${monthDayMatch[1]} ${timePart}` : monthDayMatch[1];
  }

  if (timePart) return timePart;

  return text;
};

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const formatThreadTimeLabel = (rawValue) => {
  const text = String(rawValue || '').trim();
  if (!text) return '';
  if (/^(今天|昨天|周[一二三四五六日天])\b/.test(text) || /月\\d{1,2}日/.test(text)) return text;

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;

  const dt = new Date(parsed);
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const timePart = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

  const sameYmd = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameYmd(dt, now)) return `今天 ${timePart}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameYmd(dt, yesterday)) return `昨天 ${timePart}`;

  const diffDays = Math.floor((now.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    const week = weekdayLabels[dt.getDay()] || '';
    return `${week} ${timePart}`;
  }

  return `${dt.getMonth() + 1}月${dt.getDate()}日 ${timePart}`;
};

const formatFullDate = (date) => {
  if (!(date instanceof Date)) return '';
  const label = weekdayLabels[date.getDay()] || '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${label}`;
};

const minutesToTimeLabel = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const normalized = Math.max(0, minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatScheduleWindow = (date, startMinutes, endMinutes, timezoneLabel = 'GMT+08') => {
  if (!(date instanceof Date)) return '';
  const weekdayLabel = weekdayLabels[date.getDay()] || '';
  const startLabel = minutesToTimeLabel(startMinutes);
  const endLabel = minutesToTimeLabel(endMinutes);
  if (!startLabel || !endLabel) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel} ${startLabel}-${endLabel} (${timezoneLabel})`;
};

const toMiddayDate = (value = new Date()) => {
  const base = value instanceof Date ? new Date(value) : new Date(value);
  base.setHours(12, 0, 0, 0);
  return base;
};

const DEFAULT_SCHEDULE_WINDOW = '11月11日 周二 14:00-15:00 (GMT+8)';
const DEFAULT_MEETING_ID = '会议号：123 456 789';

const toYmdKey = (dateLike) => {
  if (!dateLike) return '';
  const d = toMiddayDate(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const availabilityBlocksToSlots = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      const startIndex = Number(block?.start);
      const endIndex = Number(block?.end);
      if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return null;
      const start = Math.max(0, Math.min(95, Math.floor(startIndex)));
      const end = Math.max(0, Math.min(95, Math.floor(endIndex)));
      const startMinutes = Math.min(start, end) * 15;
      const endMinutes = (Math.max(start, end) + 1) * 15;
      if (endMinutes <= startMinutes) return null;
      return { startMinutes, endMinutes };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMinutes - b.startMinutes);
};

const intersectSlots = (a = [], b = []) => {
  const result = [];
  let i = 0;
  let j = 0;
  const sortedA = [...a].sort((x, y) => x.startMinutes - y.startMinutes);
  const sortedB = [...b].sort((x, y) => x.startMinutes - y.startMinutes);

  while (i < sortedA.length && j < sortedB.length) {
    const slotA = sortedA[i];
    const slotB = sortedB[j];
    const start = Math.max(slotA.startMinutes, slotB.startMinutes);
    const end = Math.min(slotA.endMinutes, slotB.endMinutes);
    if (end > start) result.push({ startMinutes: start, endMinutes: end });

    if (slotA.endMinutes < slotB.endMinutes) i += 1;
    else j += 1;
  }

  return result;
};

const buildMockAvailability = (date, role) => {
  const day = date?.getDay?.() ?? 1;
  const isWeekend = day === 0 || day === 6;

  if (role === 'student') {
    return isWeekend
      ? [
        { startMinutes: 13 * 60, endMinutes: 16 * 60 },
        { startMinutes: 19 * 60, endMinutes: 21 * 60 },
      ]
      : [
        { startMinutes: 12 * 60, endMinutes: 13 * 60 + 30 },
        { startMinutes: 14 * 60, endMinutes: 15 * 60 + 30 },
        { startMinutes: 20 * 60, endMinutes: 21 * 60 + 30 },
      ];
  }

  return isWeekend
    ? [
      { startMinutes: 15 * 60, endMinutes: 17 * 60 + 30 },
      { startMinutes: 20 * 60, endMinutes: 21 * 60 },
    ]
    : [
      { startMinutes: 11 * 60 + 30, endMinutes: 12 * 60 + 30 },
      { startMinutes: 14 * 60 + 30, endMinutes: 17 * 60 },
      { startMinutes: 19 * 60, endMinutes: 20 * 60 + 30 },
    ];
};

function MessagesPage() {
  const location = useLocation();
  const isMentorView = useMemo(() => {
    return location.pathname.startsWith('/mentor');
  }, [location.pathname]);

  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const messageBodyScrollRef = useRef(null);
  const scheduleCardSendTimeoutRef = useRef(null);
  const entryAnimatedThreadRef = useRef(null);
  const rescheduleScrollRef = useRef(null);
  const rescheduleInitialScrollSet = useRef(false);
  const rescheduleResizeRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [appointmentBusyId, setAppointmentBusyId] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSourceId, setRescheduleSourceId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => toMiddayDate());
  const [rescheduleSelection, setRescheduleSelection] = useState(null);
  const [myAvailabilityStatus, setMyAvailabilityStatus] = useState('idle'); // idle | loading | loaded | error
  const [myAvailability, setMyAvailability] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadsStatus, setThreadsStatus] = useState('idle'); // idle | loading | loaded | error
  const [threadsError, setThreadsError] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      setErrorMessage('');
      return;
    }
    setErrorMessage('请登录后查看消息');
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) return;
    setMyAvailabilityStatus('idle');
    setMyAvailability(null);
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn || !rescheduleOpen) return () => { alive = false; };

    setMyAvailabilityStatus('loading');
    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        setMyAvailability(res?.data?.availability || null);
        setMyAvailabilityStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setMyAvailabilityStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn, rescheduleOpen]);

  useEffect(() => {
    if (rescheduleOpen) return;
    const resizeState = rescheduleResizeRef.current;
    if (resizeState) {
      document.body.style.userSelect = resizeState.previousUserSelect ?? '';
      document.body.classList.remove('reschedule-resizing');
      rescheduleResizeRef.current = null;
    }
    setRescheduleSelection(null);
    setRescheduleSourceId(null);
  }, [rescheduleOpen]);

  useEffect(() => {
    setRescheduleSelection(null);
  }, [rescheduleDate]);

  const hasThreads = threads.length > 0;

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setThreads([]);
      setThreadsStatus('idle');
      setThreadsError('');
      return () => { alive = false; };
    }

    setThreadsStatus('loading');
    setThreadsError('');
    api.get('/api/messages/threads')
      .then((res) => {
        if (!alive) return;
        const next = Array.isArray(res?.data?.threads) ? res.data.threads : [];
        setThreads(next);
        setThreadsStatus('loaded');
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || '加载会话失败，请稍后再试';
        setThreads([]);
        setThreadsStatus('error');
        setThreadsError(String(msg));
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const [activeId, setActiveId] = useState(() => threads[0]?.id || null);
  const [openMoreId, setOpenMoreId] = useState(null);

  useEffect(() => {
    const target = location?.state?.threadId;
    const preferred = target && threads.some((t) => String(t?.id) === String(target)) ? String(target) : null;
    const keepActive = activeId && threads.some((t) => String(t?.id) === String(activeId)) ? activeId : null;
    setActiveId(preferred || keepActive || threads[0]?.id || null);
    setOpenMoreId(null);
  }, [activeId, location?.state?.threadId, threads]);

  useEffect(() => {
    if (!openMoreId) return undefined;

    const handleOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.message-more')) return;
      setOpenMoreId(null);
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }, [openMoreId]);

  const activeThread = threads.find((item) => item.id === activeId) || threads[0];
  const activeCounterpartDisplayName = useMemo(() => getThreadCounterpartDisplayName(activeThread), [activeThread]);
  const isMentorInThread = useMemo(() => getThreadMyRole(activeThread) === 'mentor', [activeThread]);
  const activeAvatarUrl = useMemo(() => {
    const url = typeof activeThread?.counterpartAvatarUrl === 'string' ? activeThread.counterpartAvatarUrl.trim() : '';
    return url;
  }, [activeThread]);
  const detailAvatarInitial = useMemo(() => {
    const name = activeCounterpartDisplayName || '';
    return name.trim().charAt(0) || '·';
  }, [activeCounterpartDisplayName]);
  const scheduleTitle = activeThread?.subject || '日程';
  const activeSchedule = activeThread?.schedule && typeof activeThread.schedule === 'object' ? activeThread.schedule : null;
  const scheduleWindow = (typeof activeSchedule?.window === 'string' && activeSchedule.window.trim())
    ? activeSchedule.window
    : DEFAULT_SCHEDULE_WINDOW;
  const meetingId = (typeof activeSchedule?.meetingId === 'string' && activeSchedule.meetingId.trim())
    ? activeSchedule.meetingId
    : DEFAULT_MEETING_ID;

  const [scheduleCards, setScheduleCards] = useState(() => buildScheduleCardsFromThread(activeThread));
  const [isScheduleCardSending, setIsScheduleCardSending] = useState(false);

  useEffect(() => () => {
    if (scheduleCardSendTimeoutRef.current) {
      clearTimeout(scheduleCardSendTimeoutRef.current);
      scheduleCardSendTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setScheduleCards(buildScheduleCardsFromThread(activeThread));
  }, [activeThread]);

  useEffect(() => {
    const scrollEl = messageBodyScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, [activeThread?.id, activeThread?.latestDecision?.status, activeThread?.latestDecision?.time, scheduleCards]);

  useEffect(() => {
    setActionError('');
    setRescheduleOpen(false);
    setRescheduleSourceId(null);
    setRescheduleDate(toMiddayDate());
    setIsScheduleCardSending(false);
    if (scheduleCardSendTimeoutRef.current) {
      clearTimeout(scheduleCardSendTimeoutRef.current);
      scheduleCardSendTimeoutRef.current = null;
    }
  }, [activeThread?.id]);

  useEffect(() => {
    const targetThreadId = location?.state?.threadId;
    const animateKey = location?.state?.animateKey;
    if (!targetThreadId) return;
    if (!activeThread?.id || String(activeThread.id) !== String(targetThreadId)) return;

    const dedupeKey = animateKey ? String(animateKey) : `thread:${String(targetThreadId)}`;
    if (entryAnimatedThreadRef.current === dedupeKey) return;
    entryAnimatedThreadRef.current = dedupeKey;

    setIsScheduleCardSending(true);
    if (scheduleCardSendTimeoutRef.current) clearTimeout(scheduleCardSendTimeoutRef.current);
    scheduleCardSendTimeoutRef.current = setTimeout(() => {
      setIsScheduleCardSending(false);
      scheduleCardSendTimeoutRef.current = null;
    }, 900);
  }, [activeThread?.id, location?.state?.animateKey, location?.state?.threadId]);

  const persistAppointmentDecision = async (appointmentId, status) => {
    if (!appointmentId || !status) return false;
    setActionError('');
    setAppointmentBusyId(String(appointmentId));
    try {
      await api.post(`/api/messages/appointments/${encodeURIComponent(String(appointmentId))}/decision`, { status });
      return true;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '更新日程状态失败，请稍后再试';
      setActionError(String(msg));
      return false;
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleAppointmentDecision = async (appointmentId, status) => {
    if (!appointmentId || !status) return;
    const ok = await persistAppointmentDecision(appointmentId, status);
    if (!ok) return;
    setScheduleCards((prev) => prev.map((card) => (String(card?.id) === String(appointmentId) ? { ...card, status } : card)));

    try {
      const res = await api.get('/api/messages/threads');
      const nextThreads = Array.isArray(res?.data?.threads) ? res.data.threads : [];
      setThreads(nextThreads);
      setThreadsStatus('loaded');
      setThreadsError('');
    } catch {}
  };

  const openRescheduleFor = (appointmentId) => {
    if (!appointmentId) return;
    setActionError('');
    setRescheduleSourceId(String(appointmentId));
    setRescheduleOpen(true);
  };

  useEffect(() => {
    if (!rescheduleOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setRescheduleOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [rescheduleOpen]);

  const timelineConfig = useMemo(() => ({
    startHour: 0,
    endHour: 24,
    rowHeight: 56,
    timeColumnWidth: 74,
    bodyPaddingTop: 0,
    timezoneLabel: 'GMT+08',
  }), []);

  const handleRescheduleTimelineClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = timelineConfig.startHour * 60 + offsetY / pixelsPerMinute;
    const snappedStart = Math.round(rawMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxStart = timelineConfig.endHour * 60 - 60;
    const startMinutes = Math.max(minStart, Math.min(maxStart, snappedStart));
    setRescheduleSelection({ startMinutes, endMinutes: startMinutes + 60 });
  };

  const clearRescheduleResizeState = () => {
    const state = rescheduleResizeRef.current;
    if (!state) return;
    document.body.style.userSelect = state.previousUserSelect ?? '';
    document.body.classList.remove('reschedule-resizing');
    rescheduleResizeRef.current = null;
  };

  const handleSelectionResizePointerMove = (event) => {
    const state = rescheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    event.preventDefault();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const deltaMinutes = (event.clientY - state.startY) / pixelsPerMinute;
    const snappedDelta = Math.round(deltaMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxEnd = timelineConfig.endHour * 60;
    const minDuration = 15;

    if (state.edge === 'start') {
      const startMinutes = Math.max(
        minStart,
        Math.min(state.endMinutes - minDuration, state.startMinutes + snappedDelta),
      );
      setRescheduleSelection({ startMinutes, endMinutes: state.endMinutes });
      return;
    }

    const endMinutes = Math.max(
      state.startMinutes + minDuration,
      Math.min(maxEnd, state.endMinutes + snappedDelta),
    );
    setRescheduleSelection({ startMinutes: state.startMinutes, endMinutes });
  };

  const handleSelectionResizePointerUp = (event) => {
    const state = rescheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    clearRescheduleResizeState();
  };

  const handleSelectionResizePointerDown = (edge) => (event) => {
    if (!rescheduleSelection) return;
    event.preventDefault();
    event.stopPropagation();

    clearRescheduleResizeState();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    rescheduleResizeRef.current = {
      edge,
      pointerId: event.pointerId,
      startY: event.clientY,
      startMinutes: rescheduleSelection.startMinutes,
      endMinutes: rescheduleSelection.endMinutes,
      previousUserSelect: document.body.style.userSelect,
    };
    document.body.style.userSelect = 'none';
    document.body.classList.add('reschedule-resizing');
  };

  const displayHours = useMemo(
    () => Array.from({ length: timelineConfig.endHour - timelineConfig.startHour }, (_, index) => timelineConfig.startHour + index),
    [timelineConfig.endHour, timelineConfig.startHour],
  );

  const counterpartDisplayName = useMemo(() => {
    return activeCounterpartDisplayName || '';
  }, [activeCounterpartDisplayName]);

  const participantLabels = useMemo(() => {
    return {
      left: '我',
      right: counterpartDisplayName,
    };
  }, [counterpartDisplayName]);

  const myAvailabilitySlots = useMemo(() => {
    if (myAvailability && typeof myAvailability === 'object') {
      const key = toYmdKey(rescheduleDate);
      const blocks = myAvailability.daySelections?.[key];
      return availabilityBlocksToSlots(blocks);
    }
    if (myAvailabilityStatus === 'idle' || myAvailabilityStatus === 'loading') return null;
    return [];
  }, [myAvailability, myAvailabilityStatus, rescheduleDate]);

  const availability = useMemo(() => {
    const mySlots = Array.isArray(myAvailabilitySlots) ? myAvailabilitySlots : [];
    const counterpartSlots = buildMockAvailability(rescheduleDate, isMentorInThread ? 'student' : 'mentor');
    const studentSlots = isMentorInThread ? counterpartSlots : mySlots;
    const mentorSlots = isMentorInThread ? mySlots : counterpartSlots;
    return {
      studentSlots,
      mentorSlots,
      commonSlots: intersectSlots(studentSlots, mentorSlots),
    };
  }, [isMentorInThread, myAvailabilitySlots, rescheduleDate]);

  const shiftRescheduleDate = (deltaDays) => {
    setRescheduleDate((prev) => {
      const today = toMiddayDate();
      const next = toMiddayDate(prev);
      next.setDate(next.getDate() + deltaDays);
      return next < today ? today : next;
    });
  };

  const handleRescheduleSend = async () => {
    if (!rescheduleSelection) return;
    if (!activeThread?.id) return;
    const nextWindow = formatScheduleWindow(
      rescheduleDate,
      rescheduleSelection.startMinutes,
      rescheduleSelection.endMinutes,
      timelineConfig.timezoneLabel,
    );
    if (!nextWindow) return;

    setIsScheduleCardSending(true);
    if (scheduleCardSendTimeoutRef.current) clearTimeout(scheduleCardSendTimeoutRef.current);
    scheduleCardSendTimeoutRef.current = setTimeout(() => {
      setIsScheduleCardSending(false);
      scheduleCardSendTimeoutRef.current = null;
    }, 900);

    const sourceAppointmentId = rescheduleSourceId;
    const sourceCard =
      (sourceAppointmentId ? scheduleCards.find((card) => String(card?.id) === String(sourceAppointmentId)) : null)
      || scheduleCards.find((card) => Boolean(card?.__primary))
      || null;

    setScheduleCards((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const primaryIndex = prev.findIndex((item) => Boolean(item?.__primary));
      if (primaryIndex < 0) return prev;
      const primary = prev[primaryIndex];
      const rest = prev.filter((_, index) => index !== primaryIndex);

      const primaryDirection = primary?.direction === 'outgoing' ? 'outgoing' : 'incoming';
      const primaryStatusKey = normalizeScheduleStatus(primary?.status);
      const shouldUpdateExistingPending = primaryDirection === 'outgoing' && primaryStatusKey === 'pending';

      const historyEntry = {
        ...primary,
        __primary: false,
        __pendingReschedule: false,
        readOnly: true,
        __key: `history-${Date.now()}`,
      };

      const updatedPrimary = {
        ...primary,
        __pendingReschedule: true,
        direction: 'outgoing',
        status: 'pending',
        window: nextWindow,
        __primary: true,
      };

      if (shouldUpdateExistingPending) {
        return [...rest, updatedPrimary];
      }

      return [...rest, historyEntry, updatedPrimary];
    });

    try {
      if (sourceAppointmentId && sourceCard?.direction !== 'outgoing') {
        // Mark the original proposal as "rescheduling" so both parties see the state.
        await persistAppointmentDecision(sourceAppointmentId, 'rescheduling');
      }

      const courseDirectionId = String(sourceCard?.courseDirectionId || activeThread?.courseDirectionId || '');
      const courseTypeId = String(sourceCard?.courseTypeId || activeThread?.courseTypeId || '');
      const meetingIdText = String(sourceCard?.meetingId || meetingId || '');

      await api.post(`/api/messages/threads/${encodeURIComponent(String(activeThread.id))}/appointments`, {
        windowText: nextWindow,
        meetingId: meetingIdText,
        courseDirectionId,
        courseTypeId,
      });

      const res = await api.get('/api/messages/threads');
      const nextThreads = Array.isArray(res?.data?.threads) ? res.data.threads : [];
      setThreads(nextThreads);
      setThreadsStatus('loaded');
      setThreadsError('');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '发送修改时间失败，请稍后再试';
      setActionError(String(msg));
    } finally {
      setRescheduleOpen(false);
      setRescheduleSourceId(null);
    }
  };

  const columns = useMemo(() => {
    const mySlots = isMentorInThread ? availability.mentorSlots : availability.studentSlots;
    const counterpartSlots = isMentorInThread ? availability.studentSlots : availability.mentorSlots;
    return { mySlots, counterpartSlots };
  }, [availability.mentorSlots, availability.studentSlots, isMentorInThread]);

  const rescheduleMinDate = toMiddayDate();
  const isReschedulePrevDisabled = toMiddayDate(rescheduleDate).getTime() <= rescheduleMinDate.getTime();

  useEffect(() => {
    if (!rescheduleOpen) {
      rescheduleInitialScrollSet.current = false;
      return;
    }
    if (rescheduleInitialScrollSet.current) return;

    const scrollEl = rescheduleScrollRef.current;
    if (!scrollEl) return;

    rescheduleInitialScrollSet.current = true;
    const targetMinutes = 11 * 60;
    const top = (targetMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60);
    scrollEl.scrollTop = Math.max(0, top);
  }, [rescheduleOpen, timelineConfig.rowHeight, timelineConfig.startHour]);

  return (
    <div className="messages-page">
      <div className="container">
        <header className="messages-header">
          <BrandMark className="nav-logo-text" to={homeHref} />
          <button
            type="button"
            className="icon-circle messages-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => (isMentorView ? setShowMentorAuth(true) : setShowStudentAuth(true))}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="messages-hero">
          <h1>消息</h1>
        </section>

        {(errorMessage || threadsError || actionError) && (
          <div className="messages-alert">{errorMessage || threadsError || actionError}</div>
        )}

        {isLoggedIn && (
        <section className="messages-shell" aria-label="消息列表与详情">
          <div className="messages-list-pane">
            <div className="messages-list-title">
              <div>
                <div className="messages-title-label">最近</div>
                <div className="messages-title-sub">
                  会话
                </div>
              </div>
              <div className="messages-pill">{threads.length} 个会话</div>
            </div>
            <div className="messages-list">
              {threads.length === 0
                ? null
                : threads.map((thread) => {
                    const threadCounterpartDisplayName = getThreadCounterpartDisplayName(thread);
                    const initial = threadCounterpartDisplayName.trim().charAt(0) || '·';
                    const avatarUrl = typeof thread?.counterpartAvatarUrl === 'string' ? thread.counterpartAvatarUrl.trim() : '';
                    const isActive = thread.id === activeThread?.id;
                    const timeLabel = formatThreadTimeLabel(thread.time || '');
                    const timeParts = timeLabel.split(/\s+/).filter(Boolean);
                    const displayDate = (timeParts[0] === '今天' && timeParts[1]) ? timeParts[1] : (timeParts[0] || timeLabel);

                    const hasCourseMeta =
                      Boolean(thread?.courseDirectionId || thread?.courseTypeId) ||
                      Boolean(thread?.schedule?.courseDirectionId || thread?.schedule?.courseTypeId);
                    const listTitleParts = hasCourseMeta ? getCourseTitleParts(thread, thread?.schedule) : null;
                    const listSubtitle = listTitleParts
                      ? `${listTitleParts.courseName} - ${listTitleParts.courseType}`
                      : (thread.subject || '');
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        className={`message-item ${isActive ? 'is-active' : ''} ${openMoreId === thread.id ? 'is-menu-open' : ''}`}
                        onClick={() => {
                          setActiveId(thread.id);
                          setOpenMoreId(null);
                        }}
                        aria-pressed={isActive}
                      >
                          <div className="message-item-shell">
                            <div className="message-avatar" aria-hidden="true">
                              <span className="message-avatar-fallback">{initial}</span>
                              {avatarUrl ? (
                                <img
                                  className="message-avatar-img"
                                  src={avatarUrl}
                                  alt=""
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </div>
                            <div className="message-content">
                              <div className="message-name">{threadCounterpartDisplayName}</div>
                              <div className="message-subject">{listSubtitle}</div>
                            </div>
                          <div className="message-meta-col">
                            <div className="message-time">{displayDate}</div>
                            <div
                              className="message-more"
                              aria-label="更多操作"
                              role="presentation"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMoreId((prev) => (prev === thread.id ? null : thread.id));
                              }}
                            >
                              <span />
                              <span />
                              <span />
                              {openMoreId === thread.id && (
                                <div className="message-more-menu" role="menu">
                                  <button
                                    type="button"
                                    className="message-more-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMoreId(null);
                                    }}
                                  >
                                    <span className="message-more-icon" aria-hidden="true">
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path
                                          d="M12 4.5l1.88 3.81 4.2.61-3.04 2.96.72 4.19L12 14.97l-3.76 1.98.72-4.19-3.04-2.96 4.2-.61L12 4.5z"
                                          fill="currentColor"
                                        />
                                      </svg>
                                    </span>
                                    加星标
                                  </button>
                                  <button
                                    type="button"
                                    className="message-more-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMoreId(null);
                                    }}
                                  >
                                    <span className="message-more-icon" aria-hidden="true">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                        <path
                                          d="M5.5 7.5h13v11a1 1 0 01-1 1h-11a1 1 0 01-1-1v-11z"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M9 7.5V6.2c0-.39.31-.7.7-.7h4.6c.39 0 .7.31.7.7v1.3"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinecap="round"
                                        />
                                        <path d="M8 11.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                      </svg>
                                    </span>
                                    归档
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </div>

          <div className="messages-divider" aria-hidden="true" />

          <div className="messages-detail-pane">
            {hasThreads ? (activeThread ? (
              <>
                <div className="message-detail-head">
                  <div className="message-detail-identity">
                    <div className="message-detail-avatar" aria-hidden="true">
                      <span className="message-avatar-fallback">{detailAvatarInitial}</span>
                      {activeAvatarUrl ? (
                        <img
                          className="message-avatar-img"
                          src={activeAvatarUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="message-detail-name">{activeCounterpartDisplayName}</div>
                  </div>
                </div>

                <div className="message-detail-body" ref={messageBodyScrollRef}>
                  {scheduleCards.map((scheduleCard) => {
                    const isPrimary = Boolean(scheduleCard?.__primary);
                    const cardHoverTime = formatHoverTime(scheduleCard?.time || activeThread?.time || '');

                    const windowText = (typeof scheduleCard?.window === 'string' && scheduleCard.window.trim())
                      ? scheduleCard.window
                      : (isPrimary ? scheduleWindow : DEFAULT_SCHEDULE_WINDOW);
                    const meetingText = (typeof scheduleCard?.meetingId === 'string' && scheduleCard.meetingId.trim())
                      ? scheduleCard.meetingId
                      : (isPrimary ? meetingId : DEFAULT_MEETING_ID);

                    const isSendingCard = Boolean(
                      isScheduleCardSending
                      && isPrimary
                      && scheduleCard?.direction === 'outgoing'
                      && normalizeScheduleStatus(scheduleCard?.status) === 'pending'
                    );

                    return (
                      <AppointmentCard
                        key={scheduleCard.__key || scheduleCard.id || windowText}
                        thread={activeThread}
                        scheduleCard={scheduleCard}
                        detailAvatarInitial={detailAvatarInitial}
                        activeAvatarUrl={activeAvatarUrl}
                        scheduleTitle={scheduleTitle}
                        windowText={windowText}
                        meetingText={meetingText}
                        cardHoverTime={cardHoverTime}
                        isSendingCard={isSendingCard}
                        appointmentBusyId={appointmentBusyId}
                        onDecision={handleAppointmentDecision}
                        onReschedule={openRescheduleFor}
                      />
                    );
                  })}
                  {(() => {
                    const decision = activeThread?.latestDecision;
                    const decisionStatus = (() => {
                      if (decision && typeof decision === 'object') {
                        const status = typeof decision.status === 'string' ? decision.status.trim().toLowerCase() : '';
                        if ((status === 'accepted' || status === 'rejected') && !decision.isByMe) return status;
                      }

                      const primaryCard =
                        scheduleCards.find((card) => Boolean(card?.__primary))
                        || scheduleCards[scheduleCards.length - 1];
                      if (!primaryCard || primaryCard?.direction !== 'outgoing') return '';
                      const statusKey = normalizeScheduleStatus(primaryCard?.status);
                      if (statusKey === 'accepted' || statusKey === 'rejected') return statusKey;
                      return '';
                    })();

                    if (!decisionStatus) return null;

                    const verb = decisionStatus === 'accepted' ? '接受' : '拒绝';
                    return (
                      <div className="message-decision-notice" role="status">
                        {`${activeCounterpartDisplayName}${verb}了你的邀请`}
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="messages-empty messages-empty-center">选择左侧的一条会话查看详情</div>
            )) : (
              <div className="messages-empty messages-empty-center">{threadsStatus === 'loading' ? '加载中…' : '暂无会话'}</div>
            )}
          </div>
        </section>
        )}
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      )}

      {rescheduleOpen && (
        <div
          className="reschedule-overlay"
          role="presentation"
          onClick={() => setRescheduleOpen(false)}
        >
          <aside
            className="reschedule-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="修改时间"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="reschedule-header">
              <div className="reschedule-header-left">
                <button
                  type="button"
                  className="reschedule-header-btn icon"
                  aria-label="前一天"
                  disabled={isReschedulePrevDisabled}
                  onClick={() => shiftRescheduleDate(-1)}
                >
                  <FiChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="reschedule-header-btn icon"
                  aria-label="后一天"
                  onClick={() => shiftRescheduleDate(1)}
                >
                  <FiChevronRight size={18} aria-hidden="true" />
                </button>
                <div className="reschedule-date-title">{formatFullDate(rescheduleDate)}</div>
              </div>
              <button
                type="button"
                className="reschedule-header-btn icon close"
                aria-label="关闭"
                onClick={() => setRescheduleOpen(false)}
              >
                <FiX size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="reschedule-timeline">
              <div
                className="reschedule-timeline-head"
                style={{ '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px` }}
              >
                <div className="reschedule-tz">{timelineConfig.timezoneLabel}</div>
                <div className="reschedule-person">{participantLabels.left}</div>
                <div className="reschedule-person">{participantLabels.right}</div>
              </div>

              <div className="reschedule-timeline-scroll" ref={rescheduleScrollRef}>
                <div
                  className="reschedule-timeline-body"
                  style={{
                    '--rs-row-height': `${timelineConfig.rowHeight}px`,
                    '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px`,
                    '--rs-body-padding-top': `${timelineConfig.bodyPaddingTop}px`,
                    '--rs-timeline-height': `${timelineConfig.rowHeight * (timelineConfig.endHour - timelineConfig.startHour)}px`,
                  }}
                >
                  <div
                    className="reschedule-time-col"
                    aria-hidden="true"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {displayHours.map((hour) => (
                      <div key={hour} className="reschedule-time-label">
                        {hour === 0 ? null : (
                          <span className="reschedule-time-text">{`${String(hour).padStart(2, '0')}:00`}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    className="reschedule-column left"
                    aria-label="我的空闲时间"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {columns.mySlots.map((slot, index) => (
                      <div
                        key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                        className="reschedule-slot availability"
                        style={{
                          top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                      </div>
                    ))}
                  </div>

                  <div
                    className="reschedule-column right"
                    aria-label="对方空闲时间"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {columns.counterpartSlots.map((slot, index) => (
                      <div
                        key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                        className="reschedule-slot availability"
                        style={{
                          top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                      </div>
                    ))}
                  </div>

                  {rescheduleSelection && (
                    <div className="reschedule-selection-layer" aria-hidden="true">
                      <div
                        className="reschedule-slot selection"
                        style={{
                          top: `${(rescheduleSelection.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(rescheduleSelection.endMinutes - rescheduleSelection.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        <div
                          className="reschedule-selection-handle top"
                          role="presentation"
                          onPointerDown={handleSelectionResizePointerDown('start')}
                          onPointerMove={handleSelectionResizePointerMove}
                          onPointerUp={handleSelectionResizePointerUp}
                          onPointerCancel={handleSelectionResizePointerUp}
                        />
                        <div
                          className="reschedule-selection-handle bottom"
                          role="presentation"
                          onPointerDown={handleSelectionResizePointerDown('end')}
                          onPointerMove={handleSelectionResizePointerMove}
                          onPointerUp={handleSelectionResizePointerUp}
                          onPointerCancel={handleSelectionResizePointerUp}
                        />
                        {minutesToTimeLabel(rescheduleSelection.startMinutes)} - {minutesToTimeLabel(rescheduleSelection.endMinutes)}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

            <div className="reschedule-footer">
              <button
                type="button"
                className="reschedule-send-btn"
                onClick={handleRescheduleSend}
                disabled={!rescheduleSelection}
              >
                发送预约
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default MessagesPage;
