import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import api from '../../api/client';
import { fetchFavoriteItems } from '../../api/favorites';
import MentorListingCard from '../../components/ListingCard/MentorListingCard';
import { getAuthToken } from '../../utils/authStorage';
import { inferRequiredRoleFromPath, setPostLoginRedirect } from '../../utils/postLoginRedirect';
import {
  buildShortUTC,
  convertSelectionsBetweenTimeZones,
  getDefaultTimeZone,
  getZonedParts,
} from '../StudentCourseRequest/steps/timezoneUtils';
import '../MentorDetail/MentorDetailPage.css';

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toNoonDate = (dateLike) => {
  if (!dateLike) return dateLike;
  const d = new Date(dateLike);
  d.setHours(12, 0, 0, 0);
  return d;
};

const ymdKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const formatFullDate = (date) => {
  if (!(date instanceof Date)) return '';
  const label = weekdayLabels[date.getDay()] || '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${label}`;
};

const parseYmdKey = (key) => {
  if (!key) return null;
  const parts = String(key).split('-');
  if (parts.length !== 3) return null;
  const [yRaw, mRaw, dRaw] = parts;
  const year = Number.parseInt(yRaw, 10);
  const month = Number.parseInt(mRaw, 10);
  const day = Number.parseInt(dRaw, 10);
  if (!year || !month || !day) return null;
  return { year, month, day };
};

const formatRangeTitleFromKeys = (keys) => {
  const normalized = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!normalized.length) return '';
  const sorted = [...normalized].sort();
  const startParts = parseYmdKey(sorted[0]);
  const endParts = parseYmdKey(sorted[sorted.length - 1]);
  if (!startParts || !endParts) return '';

  const sameYear = startParts.year === endParts.year;
  const sameMonth = sameYear && startParts.month === endParts.month;

  if (sameMonth) {
    if (startParts.day === endParts.day) return `${startParts.year}年${startParts.month}月${startParts.day}日`;
    return `${startParts.year}年${startParts.month}月${startParts.day}-${endParts.day}日`;
  }

  if (sameYear) {
    return `${startParts.year}年${startParts.month}月${startParts.day}日-${endParts.month}月${endParts.day}日`;
  }

  return `${startParts.year}年${startParts.month}月${startParts.day}日-${endParts.year}年${endParts.month}月${endParts.day}日`;
};

const minutesToTimeLabel = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const normalized = Math.max(0, minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatBytes = (value) => {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(raw) || raw <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let bytes = raw;
  let unitIndex = 0;
  while (bytes >= 1024 && unitIndex < units.length - 1) {
    bytes /= 1024;
    unitIndex += 1;
  }
  const label = unitIndex === 0 ? String(Math.round(bytes)) : String(Math.round(bytes * 10) / 10);
  return `${label}${units[unitIndex]}`;
};

const normalizeFileExt = (value) => {
  const cleaned = typeof value === 'string' ? value.trim().replace(/^\./, '') : '';
  return cleaned ? cleaned.toLowerCase() : '';
};

const getFileExtFromName = (fileName) => {
  if (typeof fileName !== 'string') return '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return '';
  return normalizeFileExt(fileName.slice(lastDot + 1));
};

const getAttachmentTypeKey = ({ ext, fileName }) => {
  const normalizedExt = normalizeFileExt(ext) || getFileExtFromName(fileName);
  if (!normalizedExt) return 'file';

  const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic']);
  if (imageExts.has(normalizedExt)) return 'image';
  if (normalizedExt === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf'].includes(normalizedExt)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(normalizedExt)) return 'sheet';
  if (['ppt', 'pptx', 'key'].includes(normalizedExt)) return 'slide';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(normalizedExt)) return 'archive';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(normalizedExt)) return 'audio';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(normalizedExt)) return 'video';
  if (['txt', 'md', 'log'].includes(normalizedExt)) return 'text';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yml', 'yaml'].includes(normalizedExt)) {
    return 'code';
  }

  return 'file';
};

const getAttachmentBadge = ({ ext, fileName, typeKey }) => {
  const normalizedExt = normalizeFileExt(ext) || getFileExtFromName(fileName);
  if (typeKey === 'image') return 'IMG';
  if (typeKey === 'pdf') return 'PDF';
  if (typeKey === 'doc') return 'DOC';
  if (typeKey === 'sheet') return 'XLS';
  if (typeKey === 'slide') return 'PPT';
  if (typeKey === 'archive') return 'ZIP';
  if (typeKey === 'audio') return 'AUD';
  if (typeKey === 'video') return 'VID';
  if (typeKey === 'text') return 'TXT';
  if (typeKey === 'code') return 'CODE';
  if (!normalizedExt) return 'FILE';
  return normalizedExt.slice(0, 4).toUpperCase();
};

const AttachmentTypeIcon = ({ typeKey }) => {
  switch (typeKey) {
    case 'image':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M6 7h12a2 2 0 0 1 2 2v10H4V9a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7 16l3-3 2 2 3-3 2 2v3H7v-1Z" fill="currentColor" opacity="0.28" />
          <circle cx="9" cy="10" r="1.2" fill="currentColor" opacity="0.55" />
        </svg>
      );
    case 'pdf':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 15c1.8-3.1 3.1-5.1 4-6 1.2-1.2 1.6 1.2-.3 3.2 1.4.8 2.5 1.6 3.3 2.3 1.6 1.5-1 1.7-3.4.5-1.7 1.2-3.2 1.8-4.3 1.8-1.7 0-.6-1.4.7-1.8Z" fill="currentColor" opacity="0.25" />
        </svg>
      );
    case 'doc':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 10h7M9 13h7M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'sheet':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 10h8M9 14h8M12 9v8M15 9v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        </svg>
      );
    case 'slide':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M6 6h12a2 2 0 0 1 2 2v9H4V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10 10l5 2.5L10 15v-5Z" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M6 7h12a2 2 0 0 1 2 2v10H4V9a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 9v9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.5 2.2" opacity="0.9" />
          <path d="M10 12h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
        </svg>
      );
    case 'audio':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M8 9v8a2 2 0 1 0 0-4V9l10-2v6a2 2 0 1 0 0-4V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'video':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M6 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M11 10l4 2-4 2v-4Z" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case 'text':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 11h7M9 14h7M9 17h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
        </svg>
      );
    case 'code':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M8.5 9.5 6 12l2.5 2.5M15.5 9.5 18 12l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 8 11 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mentor-attachment-icon-svg">
          <path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
};

const SLOT_MINUTES = 15;

const normalizeAvailabilityPayload = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const timeZone = typeof raw.timeZone === 'string' ? raw.timeZone.trim() : '';
  const sessionDurationRaw = typeof raw.sessionDurationHours === 'number'
    ? raw.sessionDurationHours
    : Number.parseFloat(String(raw.sessionDurationHours ?? '2'));
  const sessionDurationHours = Number.isFinite(sessionDurationRaw) ? sessionDurationRaw : 2;
  const daySelectionsRaw = raw.daySelections;
  const daySelections =
    (daySelectionsRaw && typeof daySelectionsRaw === 'object' && !Array.isArray(daySelectionsRaw)) ? daySelectionsRaw : {};
  return {
    timeZone: timeZone || getDefaultTimeZone(),
    sessionDurationHours,
    daySelections,
  };
};

const blocksToMinuteSlots = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const slots = [];
  for (const block of blocks) {
    const startIdx = Number(block?.start);
    const endIdx = Number(block?.end);
    if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx)) continue;
    const s = Math.max(0, Math.min(95, Math.floor(Math.min(startIdx, endIdx))));
    const e = Math.max(0, Math.min(95, Math.floor(Math.max(startIdx, endIdx))));
    const startMinutes = s * SLOT_MINUTES;
    const endMinutes = (e + 1) * SLOT_MINUTES;
    if (endMinutes > startMinutes) slots.push({ startMinutes, endMinutes });
  }
  return slots;
};

const intersectAvailabilityBlocks = (a, b) => {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length === 0 || listB.length === 0) return [];

  const out = [];
  let i = 0;
  let j = 0;
  while (i < listA.length && j < listB.length) {
    const aStart = Number(listA[i]?.start);
    const aEnd = Number(listA[i]?.end);
    const bStart = Number(listB[j]?.start);
    const bEnd = Number(listB[j]?.end);
    if (![aStart, aEnd, bStart, bEnd].every((n) => Number.isFinite(n))) {
      if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) i += 1;
      if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) j += 1;
      continue;
    }
    const start = Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
    const end = Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd));
    if (start <= end) out.push({ start, end });
    if (Math.max(aStart, aEnd) < Math.max(bStart, bEnd)) i += 1;
    else j += 1;
  }

  if (out.length <= 1) return out;
  const merged = [out[0]];
  for (let k = 1; k < out.length; k += 1) {
    const prev = merged[merged.length - 1];
    const cur = out[k];
    if (cur.start <= prev.end + 1) prev.end = Math.max(prev.end, cur.end);
    else merged.push(cur);
  }
  return merged;
};

const buildCalendarGrid = (viewMonth) => {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startIdx = first.getDay(); // 0=Sun
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const prevMonthDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

  const cells = [];
  for (let i = startIdx - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, dayNum);
    cells.push({ date, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, outside: next.getMonth() !== viewMonth.getMonth() });
  }
  return cells;
};

const isSameDay = (a, b) => (
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
);

const buildEarliestSelectedDay = (daySelections) => {
  const selections = daySelections && typeof daySelections === 'object' ? daySelections : {};
  const keys = Object.keys(selections).filter((k) => Array.isArray(selections[k]) && selections[k].length > 0);
  if (!keys.length) return null;
  return keys.sort()[0];
};

const formatTotalHoursLabel = (totalCourseHours) => {
  const raw = typeof totalCourseHours === 'number' ? totalCourseHours : Number.parseFloat(String(totalCourseHours ?? ''));
  if (!Number.isFinite(raw) || raw <= 0) return '';
  const hours = Number.isInteger(raw) ? String(raw) : String(Math.round(raw * 10) / 10);
  return `预计时长：${hours}小时`;
};

const normalizeRequestToCardData = (request) => {
  if (!request || typeof request !== 'object') return null;
  const student = request.student && typeof request.student === 'object' ? request.student : {};
  const courseDirection = request.courseDirection ? String(request.courseDirection).trim() : '';
  const courseTypes = Array.isArray(request.courseTypes) ? request.courseTypes : [];
  const courseType = request.courseType ? String(request.courseType).trim() : '';
  const daySelections =
    request.daySelections && typeof request.daySelections === 'object' && !Array.isArray(request.daySelections)
      ? request.daySelections
      : {};
  const timeZone = request.timeZone ? String(request.timeZone).trim() : (student.timezone ? String(student.timezone).trim() : '');
  const earliestDay = buildEarliestSelectedDay(daySelections);
  const requirements = earliestDay ? `期望首课：${earliestDay}` : '';
  const expectedDuration = formatTotalHoursLabel(request.totalCourseHours);

  return {
    id: request.id,
    name: String(student.publicId || request.name || '').toUpperCase(),
    degree: student.degree || request.degree || '',
    school: student.school || request.school || '',
    timezone: timeZone || request.timezone || '',
    avatarUrl: student.avatarUrl || request.avatarUrl || null,
    courses: courseDirection ? [courseDirection] : (Array.isArray(request.courses) ? request.courses : []),
    courseTypes,
    courseType,
    expectedDuration,
    requirements,
    courseFocus: request.courseFocus || '',
    milestone: request.milestone || '',
    totalCourseHours: request.totalCourseHours,
    sessionDurationHours: request.sessionDurationHours,
    daySelections,
    timeZone,
  };
};

function CourseRequestDetailPage() {
  const menuAnchorRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const requestId = safeDecode(typeof params?.requestId === 'string' ? params.requestId : '');

  const currentPath = useMemo(() => {
    try {
      const { pathname, search, hash } = window.location;
      return `${pathname}${search || ''}${hash || ''}`;
    } catch {
      return location?.pathname || '/mentor';
    }
  }, [location]);

  const rememberPostLoginRedirect = useCallback((from) => {
    const candidate = typeof from === 'string' ? from.trim() : '';
    const target = candidate || currentPath;
    setPostLoginRedirect(target, inferRequiredRoleFromPath(target) || 'mentor');
  }, [currentPath]);

  const scheduleScrollRef = useRef(null);
  const scheduleResizeRef = useRef(null);
  const didDragRef = useRef(false);

  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [forceLoginForAppointment, setForceLoginForAppointment] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [myAvailability, setMyAvailability] = useState(null);

  const [request, setRequest] = useState(() => {
    const fromState = location?.state?.request;
    if (!fromState || typeof fromState !== 'object') return null;
    if (requestId && String(fromState?.id) !== requestId) return null;
    return fromState;
  });
  const [loading, setLoading] = useState(() => {
    const fromState = location?.state?.request;
    return !(fromState && String(fromState?.id) === requestId);
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [selectedTimeZone, setSelectedTimeZone] = useState(() => getDefaultTimeZone());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(() => toNoonDate(new Date()));
  const [selectedRangeKeys, setSelectedRangeKeys] = useState(() => [ymdKey(toNoonDate(new Date()))]);
  const [dragStartKey, setDragStartKey] = useState(null);
  const [dragEndKey, setDragEndKey] = useState(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [dragPreviewKeys, setDragPreviewKeys] = useState(() => new Set());
  const [scheduleSelection, setScheduleSelection] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const parts = getZonedParts(getDefaultTimeZone(), new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    return new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1);
  });

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!(ev.newValue || getAuthToken()));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', handler);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const onLoginRequired = (event) => {
      rememberPostLoginRedirect(event?.detail?.from);
      setForceLoginForAppointment(false);
      setShowMentorAuth(true);
    };
    window.addEventListener('auth:login-required', onLoginRequired);
    return () => window.removeEventListener('auth:login-required', onLoginRequired);
  }, [rememberPostLoginRedirect]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setSelectedTimeZone(getDefaultTimeZone());
      setMyAvailability(null);
      return () => { alive = false; };
    }

    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        const availability = normalizeAvailabilityPayload(res?.data?.availability);
        setMyAvailability(availability);
        const tz = typeof availability?.timeZone === 'string' ? availability.timeZone.trim() : '';
        setSelectedTimeZone(tz || getDefaultTimeZone());
      })
      .catch(() => {
        if (!alive) return;
        setSelectedTimeZone(getDefaultTimeZone());
        setMyAvailability(null);
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    const parts = getZonedParts(selectedTimeZone, new Date());
    const todayNoon = toNoonDate(new Date(parts.year, parts.month - 1, parts.day));
    setSelectedDate(todayNoon);
    setViewMonth(new Date(todayNoon.getFullYear(), todayNoon.getMonth(), 1));
    setSelectedRangeKeys([ymdKey(todayNoon)]);
    setDragStartKey(null);
    setDragEndKey(null);
    setDragPreviewKeys(new Set());
    setIsDraggingRange(false);
  }, [selectedTimeZone]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setFavoriteIds(new Set());
      return () => { alive = false; };
    }

    fetchFavoriteItems({ role: 'mentor', itemType: 'student_request', idsOnly: true })
      .then((res) => {
        if (!alive) return;
        const ids = Array.isArray(res?.data?.ids) ? res.data.ids : [];
        setFavoriteIds(new Set(ids.map(String)));
      })
      .catch(() => {
        if (!alive) return;
        setFavoriteIds(new Set());
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;
    const fromState = location?.state?.request;
    if (fromState && String(fromState?.id) === requestId) {
      setRequest(fromState);
      setLoading(false);
      setErrorMessage('');
    }

    if (!requestId) {
      setRequest(null);
      setLoading(false);
      setErrorMessage('缺少需求ID');
      return () => { alive = false; };
    }

    setLoading(true);
    setErrorMessage('');

    api.get(`/api/mentor/requests/${encodeURIComponent(requestId)}`)
      .then((res) => {
        if (!alive) return;
        const payload = res?.data?.request;
        if (!payload) {
          setRequest(null);
          setErrorMessage('未找到需求');
          return;
        }
        setRequest(payload);
      })
      .catch((e) => {
        if (!alive) return;
        const status = e?.response?.status;
        if (status === 401) {
          setErrorMessage('请用导师身份登录后查看');
          rememberPostLoginRedirect();
          setShowMentorAuth(true);
          return;
        }
        if (status === 403) {
          const msg = e?.response?.data?.error || '';
          if (msg && (msg.includes('审核') || msg.toLowerCase().includes('pending'))) {
            setErrorMessage('导师审核中，暂不可查看');
          } else {
            setErrorMessage('仅导师可访问');
          }
          return;
        }
        const msg = e?.response?.data?.error || e?.message || '加载失败，请稍后再试';
        setErrorMessage(String(msg));
        setRequest(null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => { alive = false; };
  }, [location?.state?.request, rememberPostLoginRedirect, requestId]);

  const previewCardData = useMemo(() => {
    const data = normalizeRequestToCardData(request);
    if (!data) {
      if (request && typeof request === 'object') return request;
      return null;
    }
    return data;
  }, [request]);

  const favoriteTargetId = previewCardData?.id ?? requestId;
  const isFavorite = !!favoriteTargetId && favoriteIds.has(String(favoriteTargetId));
  const requestAttachments = useMemo(() => {
    const raw = request && typeof request === 'object' && Array.isArray(request.attachments) ? request.attachments : [];
    return raw.filter((item) => item && typeof item === 'object');
  }, [request]);
  const downloadableAttachments = useMemo(() => {
    return requestAttachments
      .map((att, index) => {
        const fileId = typeof att.fileId === 'string' && /^[0-9a-fA-F]{32}$/.test(att.fileId) ? att.fileId.toLowerCase() : '';
        if (!fileId) return null;
        const fileNameRaw = typeof att.fileName === 'string' && att.fileName.trim() ? att.fileName.trim() : '';
        const fallbackName = typeof att.ossKey === 'string' && att.ossKey.trim() ? att.ossKey.trim().split('/').pop() : '';
        const fileName = fileNameRaw || fallbackName || `附件${index + 1}`;
        return { fileId, fileName };
      })
      .filter(Boolean);
  }, [requestAttachments]);

  const triggerDownloadUrl = useCallback((url) => {
    if (!url) return;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try { iframe.remove(); } catch {}
    }, 30_000);
  }, []);

  const fetchAttachmentSignedUrl = useCallback(async (fileId) => {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('缺少 requestId');
    const res = await api.get(`/api/attachments/course-requests/${encodeURIComponent(rid)}/attachments/${encodeURIComponent(fileId)}/signed-url`);
    const url = res?.data?.url;
    if (!url || typeof url !== 'string') throw new Error('签名链接无效');
    return url;
  }, [requestId]);

  const fetchAttachmentsSignedUrls = useCallback(async (fileIds) => {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('缺少 requestId');
    const res = await api.post(`/api/attachments/course-requests/${encodeURIComponent(rid)}/attachments/signed-urls`, { fileIds });
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];
    return items
      .map((it) => ({ fileId: it?.fileId, url: it?.url }))
      .filter((it) => typeof it?.fileId === 'string' && typeof it?.url === 'string' && it.url);
  }, [requestId]);

  const handleDownloadAttachment = useCallback(async (fileId) => {
    try {
      const url = await fetchAttachmentSignedUrl(fileId);
      triggerDownloadUrl(url);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || '下载失败，请稍后再试';
      window.alert(String(msg));
    }
  }, [fetchAttachmentSignedUrl, triggerDownloadUrl]);

  const handleDownloadAllAttachments = useCallback(() => {
    if (!downloadableAttachments.length) return;
    const fileIds = downloadableAttachments.map((x) => x.fileId);
    fetchAttachmentsSignedUrls(fileIds)
      .then((items) => {
        if (!items.length) throw new Error('未获取到下载链接');
        items.forEach((it, idx) => {
          window.setTimeout(() => triggerDownloadUrl(it.url), idx * 200);
        });
      })
      .catch((e) => {
        const msg = e?.response?.data?.error || e?.message || '下载失败，请稍后再试';
        window.alert(String(msg));
      });
  }, [downloadableAttachments, fetchAttachmentsSignedUrls, triggerDownloadUrl]);

  const zhDays = useMemo(() => ['日', '一', '二', '三', '四', '五', '六'], []);
  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
    return fmt.format(viewMonth);
  }, [viewMonth]);
  const calendarGrid = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);
  const nowParts = useMemo(
    () => getZonedParts(selectedTimeZone, new Date(nowTick)),
    [nowTick, selectedTimeZone],
  );
  const todayStart = useMemo(() => {
    const d = new Date(nowParts.year, nowParts.month - 1, nowParts.day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [nowParts.day, nowParts.month, nowParts.year]);
  const todayKey = useMemo(() => ymdKey(todayStart), [todayStart]);
  const canGoPrevMonth = useMemo(() => {
    const base = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return viewMonth.getTime() > base.getTime();
  }, [todayStart, viewMonth]);
  const onPrevMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const onNextMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const keyToDateStrict = useMemo(() => {
    return (key) => {
      const parsed = parseYmdKey(key);
      if (!parsed) return null;
      return new Date(parsed.year, parsed.month - 1, parsed.day);
    };
  }, []);

  const enumerateKeysInclusive = useMemo(() => {
    return (aKey, bKey) => {
      const a = keyToDateStrict(aKey);
      const b = keyToDateStrict(bKey);
      if (!a || !b) return [];
      const start = a.getTime() <= b.getTime() ? a : b;
      const end = a.getTime() <= b.getTime() ? b : a;
      const res = [];
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
      while (cur.getTime() <= endTs) {
        const t = new Date(cur);
        const key = ymdKey(t);
        if (key >= todayKey) res.push(key);
        cur.setDate(cur.getDate() + 1);
      }
      return res;
    };
  }, [keyToDateStrict, todayKey]);

  const endDragSelection = useMemo(() => {
    return () => {
      if (!isDraggingRange || !dragStartKey || !dragEndKey) {
        setIsDraggingRange(false);
        setDragPreviewKeys(new Set());
        return;
      }
      const keys = enumerateKeysInclusive(dragStartKey, dragEndKey);
      setSelectedRangeKeys(keys);
      const endDate = keyToDateStrict(dragEndKey);
      if (endDate) setSelectedDate(toNoonDate(endDate));
      setIsDraggingRange(false);
      setDragPreviewKeys(new Set());
    };
  }, [dragEndKey, dragStartKey, enumerateKeysInclusive, isDraggingRange, keyToDateStrict]);

  useEffect(() => {
    const onUp = () => {
      if (isDraggingRange) {
        endDragSelection();
        didDragRef.current = true;
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [endDragSelection, isDraggingRange]);

  const scheduleGmtLabel = useMemo(() => {
    const utcLabel = buildShortUTC(selectedTimeZone);
    const match = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(utcLabel);
    if (!match) {
      if (utcLabel === 'UTC±0') return 'GMT+00';
      return utcLabel.replace(/^UTC/, 'GMT');
    }
    const [, sign, hoursRaw, minutesRaw] = match;
    const hours = String(hoursRaw).padStart(2, '0');
    const minutes = minutesRaw ? `:${minutesRaw}` : '';
    return `GMT${sign}${hours}${minutes}`;
  }, [selectedTimeZone]);

  const timelineConfig = useMemo(() => ({
    startHour: 0,
    endHour: 24,
    rowHeight: 44,
    timeColumnWidth: 60,
    bodyPaddingTop: 0,
    timezoneLabel: scheduleGmtLabel,
  }), [scheduleGmtLabel]);

  const displayHours = useMemo(
    () => Array.from({ length: timelineConfig.endHour - timelineConfig.startHour }, (_, index) => timelineConfig.startHour + index),
    [timelineConfig.endHour, timelineConfig.startHour],
  );

  const participantLabels = useMemo(() => {
    return {
      left: '我',
      right: previewCardData?.name || '学生',
    };
  }, [previewCardData?.name]);

  const mySelectionsInViewTz = useMemo(() => {
    const payload = myAvailability;
    if (!payload) return {};
    const fromTz = typeof payload.timeZone === 'string' && payload.timeZone.trim() ? payload.timeZone.trim() : selectedTimeZone;
    const daySelections = payload.daySelections || {};
    return convertSelectionsBetweenTimeZones(daySelections, fromTz, selectedTimeZone);
  }, [myAvailability, selectedTimeZone]);

  const requestAvailability = useMemo(() => {
    const data = previewCardData || request;
    if (!data) return null;
    const tz =
      typeof data.timeZone === 'string' && data.timeZone.trim()
        ? data.timeZone.trim()
        : (typeof data.timezone === 'string' && data.timezone.trim() ? data.timezone.trim() : '');
    const selections = data.daySelections || {};
    return normalizeAvailabilityPayload({
      timeZone: tz || getDefaultTimeZone(),
      sessionDurationHours: data.sessionDurationHours,
      daySelections: selections,
    });
  }, [previewCardData, request]);

  const requestSelectionsInViewTz = useMemo(() => {
    const payload = requestAvailability;
    if (!payload) return {};
    const fromTz = typeof payload.timeZone === 'string' && payload.timeZone.trim() ? payload.timeZone.trim() : selectedTimeZone;
    const daySelections = payload.daySelections || {};
    return convertSelectionsBetweenTimeZones(daySelections, fromTz, selectedTimeZone);
  }, [requestAvailability, selectedTimeZone]);

  const myAvailabilityDays = useMemo(() => {
    const keys = Object.keys(mySelectionsInViewTz || {});
    const set = new Set();
    for (const key of keys) {
      const blocks = mySelectionsInViewTz[key];
      if (Array.isArray(blocks) && blocks.length > 0) set.add(key);
    }
    return set;
  }, [mySelectionsInViewTz]);

  const requestAvailabilityDays = useMemo(() => {
    const keys = Object.keys(requestSelectionsInViewTz || {});
    const set = new Set();
    for (const key of keys) {
      const blocks = requestSelectionsInViewTz[key];
      if (Array.isArray(blocks) && blocks.length > 0) set.add(key);
    }
    return set;
  }, [requestSelectionsInViewTz]);

  const selectedKeys = useMemo(() => {
    if (!Array.isArray(selectedRangeKeys)) return [];
    return selectedRangeKeys.filter((k) => typeof k === 'string' && k);
  }, [selectedRangeKeys]);

  const multiDayMyBlocks = useMemo(() => {
    if (selectedKeys.length <= 1) return [];
    let common = null;
    for (const key of selectedKeys) {
      const blocks = mySelectionsInViewTz?.[key] || [];
      common = common == null ? blocks : intersectAvailabilityBlocks(common, blocks);
      if (!common || common.length === 0) return [];
    }
    return common || [];
  }, [mySelectionsInViewTz, selectedKeys]);

  const multiDayRequestBlocks = useMemo(() => {
    if (selectedKeys.length <= 1) return [];
    let common = null;
    for (const key of selectedKeys) {
      const blocks = requestSelectionsInViewTz?.[key] || [];
      common = common == null ? blocks : intersectAvailabilityBlocks(common, blocks);
      if (!common || common.length === 0) return [];
    }
    return common || [];
  }, [requestSelectionsInViewTz, selectedKeys]);

  const selectedDayKey = useMemo(() => ymdKey(selectedDate), [selectedDate]);
  const mySlots = useMemo(() => {
    if (selectedKeys.length > 1) return blocksToMinuteSlots(multiDayMyBlocks);
    return blocksToMinuteSlots(mySelectionsInViewTz?.[selectedDayKey]);
  }, [multiDayMyBlocks, mySelectionsInViewTz, selectedDayKey, selectedKeys.length]);

  const requestSlots = useMemo(() => {
    if (selectedKeys.length > 1) return blocksToMinuteSlots(multiDayRequestBlocks);
    return blocksToMinuteSlots(requestSelectionsInViewTz?.[selectedDayKey]);
  }, [requestSelectionsInViewTz, multiDayRequestBlocks, selectedDayKey, selectedKeys.length]);
  const columns = useMemo(() => ({ mySlots, counterpartSlots: requestSlots }), [mySlots, requestSlots]);

  useEffect(() => {
    setScheduleSelection(null);
  }, [selectedDate]);

  useEffect(() => {
    const scrollEl = scheduleScrollRef.current;
    if (!scrollEl) return;
    const targetMinutes = 11 * 60;
    const top = (targetMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60);
    scrollEl.scrollTop = Math.max(0, top);
  }, [selectedDate, timelineConfig.rowHeight, timelineConfig.startHour]);

  const shiftSelectedDate = (deltaDays) => {
    setSelectedDate((prev) => {
      const today = toNoonDate(todayStart);
      const next = toNoonDate(prev);
      next.setDate(next.getDate() + deltaDays);
      const clamped = next < today ? today : next;
      setSelectedRangeKeys([ymdKey(clamped)]);
      return clamped;
    });
  };

  useEffect(() => {
    setViewMonth((current) => {
      if (
        current.getFullYear() === selectedDate.getFullYear()
        && current.getMonth() === selectedDate.getMonth()
      ) {
        return current;
      }
      return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    });
  }, [selectedDate]);

  const scheduleMinDate = toNoonDate(todayStart);
  const isPrevDayDisabled = toNoonDate(selectedDate).getTime() <= scheduleMinDate.getTime();
  const scheduleTitle = useMemo(() => {
    if (Array.isArray(selectedRangeKeys) && selectedRangeKeys.length > 1) return formatRangeTitleFromKeys(selectedRangeKeys);
    return formatFullDate(selectedDate);
  }, [selectedDate, selectedRangeKeys]);

  const handleTimelineClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = timelineConfig.startHour * 60 + offsetY / pixelsPerMinute;
    const snappedStart = Math.round(rawMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxStart = timelineConfig.endHour * 60 - 60;
    const startMinutes = Math.max(minStart, Math.min(maxStart, snappedStart));
    setScheduleSelection({ startMinutes, endMinutes: startMinutes + 60 });
  };

  const clearResizeState = () => {
    const state = scheduleResizeRef.current;
    if (!state) return;
    document.body.style.userSelect = state.previousUserSelect ?? '';
    document.body.classList.remove('reschedule-resizing');
    scheduleResizeRef.current = null;
  };

  useEffect(() => {
    return () => {
      const state = scheduleResizeRef.current;
      if (!state) return;
      document.body.style.userSelect = state.previousUserSelect ?? '';
      document.body.classList.remove('reschedule-resizing');
      scheduleResizeRef.current = null;
    };
  }, []);

  const handleSelectionResizePointerMove = (event) => {
    const state = scheduleResizeRef.current;
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
      setScheduleSelection({ startMinutes, endMinutes: state.endMinutes });
      return;
    }

    const endMinutes = Math.max(
      state.startMinutes + minDuration,
      Math.min(maxEnd, state.endMinutes + snappedDelta),
    );
    setScheduleSelection({ startMinutes: state.startMinutes, endMinutes });
  };

  const handleSelectionResizePointerUp = (event) => {
    const state = scheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    clearResizeState();
  };

  const handleSelectionResizePointerDown = (edge) => (event) => {
    if (!scheduleSelection) return;
    event.preventDefault();
    event.stopPropagation();

    clearResizeState();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    scheduleResizeRef.current = {
      edge,
      pointerId: event.pointerId,
      startY: event.clientY,
      startMinutes: scheduleSelection.startMinutes,
      endMinutes: scheduleSelection.endMinutes,
      previousUserSelect: document.body.style.userSelect,
    };
    document.body.style.userSelect = 'none';
    document.body.classList.add('reschedule-resizing');
  };

  const handleSendAppointment = () => {
    if (!scheduleSelection) return;
    if (!isLoggedIn) {
      rememberPostLoginRedirect();
      setForceLoginForAppointment(true);
      setShowMentorAuth(true);
      return;
    }

    try {
      const windowLabel = `${minutesToTimeLabel(scheduleSelection.startMinutes)} - ${minutesToTimeLabel(scheduleSelection.endMinutes)}`;
      alert(`已选择预约时间：${formatFullDate(selectedDate)} ${windowLabel}\\n请前往消息页继续沟通`);
    } catch {}
    try { navigate('/mentor/messages'); } catch {}
  };

  return (
    <div className="mentor-detail-page">
      <div className="container">
        <header className="mentor-detail-header">
          <BrandMark className="nav-logo-text" to="/mentor" />
          <button
            type="button"
            className="icon-circle mentor-detail-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => {
              rememberPostLoginRedirect();
              setForceLoginForAppointment(false);
              setShowMentorAuth(true);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <main className="mentor-detail-content">
          {loading ? (
            <div className="mentor-detail-loading" aria-live="polite">加载中…</div>
          ) : errorMessage ? (
            <div className="mentor-detail-error" role="alert">{errorMessage}</div>
          ) : previewCardData ? (
            <section className="mentor-detail-top" aria-label="课程信息与预约">
              <div className="mentor-detail-preview" aria-label="课程预览卡片">
                <div className="preview-wrap">
                  <MentorListingCard
                    data={previewCardData}
                    favoriteRole="mentor"
                    favoriteItemType="student_request"
                    favoriteItemId={favoriteTargetId}
                    initialFavorited={isFavorite}
                    disableNavigation
                    onFavoriteChange={(itemId, favorited) => {
                      setFavoriteIds((prev) => {
                        const next = new Set(prev);
                        if (favorited) next.add(String(itemId));
                        else next.delete(String(itemId));
                        return next;
                      });
                    }}
                  />
                </div>
              </div>

              <aside className="mentor-detail-schedule" aria-label="可约时间">
                <div className="mentor-detail-schedule-meta">
                  <span>时区：{buildShortUTC(selectedTimeZone)} {selectedTimeZone}</span>
                </div>
                <div className="mentor-detail-schedule-body" aria-label="选择日期">
                  <div className="calendar-card" aria-label="可约日期日历">
                    <div className="calendar-header">
                      <div className="month-label">{monthLabel}</div>
                      <div className="calendar-nav">
                        <button
                          type="button"
                          className="nav-btn"
                          aria-label="Prev month"
                          disabled={!canGoPrevMonth}
                          onClick={onPrevMonth}
                        >
                          &lsaquo;
                        </button>
                        <button type="button" className="nav-btn" aria-label="Next month" onClick={onNextMonth}>
                          &rsaquo;
                        </button>
                      </div>
                    </div>
                    <div className="calendar-grid">
                      {zhDays.map((d) => (
                        <div key={d} className="day-name">{d}</div>
                      ))}
                      {calendarGrid.map(({ date, outside }) => {
                        if (outside) {
                          return <div key={date.toISOString()} className="date-cell outside" aria-hidden />;
                        }
                        const isToday = isSameDay(date, todayStart);
                        const selected = isSameDay(date, selectedDate);
                        const key = ymdKey(date);
                        const isPast = key < todayKey;
                        const hasMyAvailability = myAvailabilityDays.has(key);
                        const hasRequestAvailability = requestAvailabilityDays.has(key);
                        const inMultiSelected = (selectedRangeKeys || []).includes(key);
                        const inPreview = (dragPreviewKeys && dragPreviewKeys.size)
                          ? (dragPreviewKeys.has(key) && !selected && !inMultiSelected)
                          : false;
                        const cls = [
                          'date-cell',
                          isToday ? 'today' : '',
                          selected ? 'selected' : '',
                          isPast ? 'past' : '',
                          inMultiSelected ? 'multi-selected' : '',
                          inPreview ? 'range-preview' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <button
                            key={date.toISOString()}
                            type="button"
                            className={cls}
                            onMouseDown={(event) => {
                              if (isPast) return;
                              if (event?.metaKey || event?.ctrlKey) return;
                              setIsDraggingRange(true);
                              setDragStartKey(key);
                              setDragEndKey(key);
                              setDragPreviewKeys(new Set([key]));
                              didDragRef.current = false;
                            }}
                            onMouseEnter={() => {
                              if (!isDraggingRange) return;
                              if (isPast) return;
                              setDragEndKey(key);
                              const keys = enumerateKeysInclusive(dragStartKey || key, key);
                              setDragPreviewKeys(new Set(keys));
                              if (dragStartKey && dragStartKey !== key) didDragRef.current = true;
                            }}
                            onMouseUp={() => {
                              if (isDraggingRange) endDragSelection();
                            }}
                            onClick={(event) => {
                              if (didDragRef.current) { didDragRef.current = false; return; }
                              if (isPast) return;
                              const wantsMultiSelect = !!(event?.metaKey || event?.ctrlKey);
                              setSelectedDate(toNoonDate(date));
                              if (wantsMultiSelect) {
                                setSelectedRangeKeys((prev) => {
                                  const list = Array.isArray(prev) ? prev : [];
                                  const set = new Set(list);
                                  const alreadySelected = set.has(key);
                                  if (alreadySelected) {
                                    if (set.size <= 1) return [key];
                                    set.delete(key);
                                  } else {
                                    set.add(key);
                                  }
                                  return Array.from(set).sort();
                                });
                              } else {
                                setSelectedRangeKeys([key]);
                              }
                              if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
                                setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                              }
                            }}
                          >
                            <span className="date-number">{date.getDate()}</span>
                            {(hasMyAvailability || hasRequestAvailability) ? (
                              <span className="availability-dots" aria-hidden="true">
                                {(hasMyAvailability && hasRequestAvailability) ? (
                                  <span className="availability-dot both" />
                                ) : hasMyAvailability ? (
                                  <span className="availability-dot me" />
                                ) : (
                                  <span className="availability-dot mentor" />
                                )}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mentor-detail-times-panel" aria-label="选择时间">
                    <aside className="reschedule-drawer mentor-detail-reschedule-embed" aria-label="发送预约">
                      <div className="reschedule-header">
                        <div className="reschedule-header-left">
                          <button
                            type="button"
                            className="reschedule-header-btn icon"
                            aria-label="前一天"
                            disabled={isPrevDayDisabled}
                            onClick={() => shiftSelectedDate(-1)}
                          >
                            <FiChevronLeft size={18} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="reschedule-header-btn icon"
                            aria-label="后一天"
                            onClick={() => shiftSelectedDate(1)}
                          >
                            <FiChevronRight size={18} aria-hidden="true" />
                          </button>
                          <div className="reschedule-date-title">{scheduleTitle}</div>
                        </div>
                        <button
                          type="button"
                          className="reschedule-header-btn icon close"
                          aria-label="清空选择"
                          onClick={() => setScheduleSelection(null)}
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

                        <div className="reschedule-timeline-scroll" ref={scheduleScrollRef}>
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
                              onClick={handleTimelineClick}
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
                              onClick={handleTimelineClick}
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
                              aria-label="学员空闲时间"
                              onClick={handleTimelineClick}
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

                            {scheduleSelection && (
                              <div className="reschedule-selection-layer" aria-hidden="true">
                                <div
                                  className="reschedule-slot selection"
                                  style={{
                                    top: `${(scheduleSelection.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                                    height: `${(scheduleSelection.endMinutes - scheduleSelection.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
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
                                  {minutesToTimeLabel(scheduleSelection.startMinutes)} - {minutesToTimeLabel(scheduleSelection.endMinutes)}
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
                          onClick={handleSendAppointment}
                          disabled={!scheduleSelection}
                        >
                          发送预约
                        </button>
                      </div>
                    </aside>
                  </div>
                </div>
              </aside>

              <section className="mentor-detail-attachments" aria-label="学生上传附件">
                <div className="mentor-detail-attachments-header">
                  <div className="mentor-detail-attachments-title">学生附件</div>
                  {requestAttachments.length ? (
                    <button
                      type="button"
                      className="mentor-detail-attachments-download-all"
                      onClick={handleDownloadAllAttachments}
                      disabled={!downloadableAttachments.length}
                    >
                      全部下载
                    </button>
                  ) : null}
                </div>

                {requestAttachments.length ? (
                  <ul className="mentor-attachments-list">
                    {requestAttachments.map((att, index) => {
                      const fileId = typeof att.fileId === 'string' && /^[0-9a-fA-F]{32}$/.test(att.fileId) ? att.fileId.toLowerCase() : '';
                      const fileNameRaw = typeof att.fileName === 'string' && att.fileName.trim() ? att.fileName.trim() : '';
                      const fallbackName = typeof att.ossKey === 'string' && att.ossKey.trim() ? att.ossKey.trim().split('/').pop() : '';
                      const fileName = fileNameRaw || fallbackName || `附件${index + 1}`;
                      const sizeLabel = formatBytes(att.sizeBytes);
                      const typeKey = getAttachmentTypeKey({ ext: att.ext, fileName });
                      const badge = getAttachmentBadge({ ext: att.ext, fileName, typeKey });
                      const meta = sizeLabel;
                      const key = fileId ? fileId : `${fileName}-${index}`;
                      const canDownload = !!fileId;

                      return (
                        <li key={key} className="mentor-attachment-item">
                          <button
                            type="button"
                            className={`mentor-attachment-card${canDownload ? '' : ' disabled'}`}
                            onClick={canDownload ? () => handleDownloadAttachment(fileId) : undefined}
                            disabled={!canDownload}
                            aria-disabled={canDownload ? undefined : 'true'}
                            title={canDownload ? `下载 ${fileName}` : '不可用'}
                          >
                            <div className={`mentor-attachment-icon type-${typeKey}`} aria-hidden="true">
                              <AttachmentTypeIcon typeKey={typeKey} />
                              <div className="mentor-attachment-icon-badge">{badge}</div>
                            </div>
                            <div className="mentor-attachment-info">
                              <div className="mentor-attachment-name" title={fileName}>{fileName}</div>
                              {!!meta && <div className="mentor-attachment-sub">{meta}</div>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mentor-detail-attachments-empty">未上传附件</div>
                )}
              </section>
            </section>
          ) : null}
        </main>
      </div>

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => {
            setShowMentorAuth(false);
            setForceLoginForAppointment(false);
          }}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={forceLoginForAppointment}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default CourseRequestDetailPage;
